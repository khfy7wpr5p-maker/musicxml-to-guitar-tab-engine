'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  ACTIVE_SONORITY_MODEL_VERSION,
  ACTIVE_SONORITY_MODEL_DOCUMENT_TYPE,
  ACTIVE_SONORITY_MODEL_AUTHORITY,
  createActiveSonorityModel,
} = require('../src/music/activeSonorityModel');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function note(step, {
  duration = 4,
  voice = '1',
  octave = 4,
} = {}) {
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>1</staff></note>`;
}

function singleMeasureScore(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-3</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${body}
    </measure>
  </part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function sonority(xml, runtime = null) {
  return createActiveSonorityModel(sourceModel(xml), runtime);
}

function simplify(point) {
  return {
    time: point.timeDivisions,
    attacks: point.attackNotes.map((noteFact) => noteFact.logicalNoteId),
    holds: point.holdNotes.map((noteFact) => noteFact.logicalNoteId),
    releases: point.releaseNotes.map((noteFact) => noteFact.logicalNoteId),
    active: point.activeNotes.map((noteFact) => noteFact.logicalNoteId),
  };
}

test('PS-3 exposes a versioned internal active-sonority-facts-only contract without package-root authority', () => {
  const model = sonority(singleMeasureScore(note('C', { duration: 16 })));

  assert.equal(ACTIVE_SONORITY_MODEL_VERSION, '1.0.0');
  assert.equal(ACTIVE_SONORITY_MODEL_DOCUMENT_TYPE, 'ActiveSonorityModel');
  assert.equal(ACTIVE_SONORITY_MODEL_AUTHORITY, 'ACTIVE_SONORITY_FACTS_ONLY');
  assert.equal(model.documentType, 'ActiveSonorityModel');
  assert.equal(model.contractVersion, '1.0.0');
  assert.equal(model.authority, 'ACTIVE_SONORITY_FACTS_ONLY');
  assert.equal(model.temporal.documentType, 'PolyphonicTemporalEventModel');
  assert.equal(model.sustain.documentType, 'SustainTieGraph');
  assert.equal(publicApi.createActiveSonorityModel, undefined);
});

test('PS-3 derives exact active sonorities for staggered independent voices', () => {
  const xml = singleMeasureScore([
    note('C', { duration: 12, voice: '1' }),
    '<backup><duration>8</duration></backup>',
    note('E', { duration: 4, voice: '2' }),
    note('G', { duration: 4, voice: '2' }),
  ].join(''));
  const model = sonority(xml);

  assert.deepEqual(model.measures[0].sonorityPoints.map(simplify), [
    {
      time: 0,
      attacks: ['P1:measure:0:note:0'],
      holds: [],
      releases: [],
      active: ['P1:measure:0:note:0'],
    },
    {
      time: 4,
      attacks: ['P1:measure:0:note:1'],
      holds: ['P1:measure:0:note:0'],
      releases: [],
      active: ['P1:measure:0:note:0', 'P1:measure:0:note:1'],
    },
    {
      time: 8,
      attacks: ['P1:measure:0:note:2'],
      holds: ['P1:measure:0:note:0'],
      releases: ['P1:measure:0:note:1'],
      active: ['P1:measure:0:note:0', 'P1:measure:0:note:2'],
    },
    {
      time: 12,
      attacks: [],
      holds: [],
      releases: ['P1:measure:0:note:0', 'P1:measure:0:note:2'],
      active: [],
    },
  ]);
});

test('PS-3 keeps a cross-measure tied note active as HOLD instead of re-attacking it', () => {
  const model = sonority(fixture('ui07-poly-unison-tie.musicxml'));
  const chainId = 'P1:sustain-chain:0';

  const measure1End = model.measures[0].sonorityPoints.at(-1);
  assert.deepEqual(measure1End.attackNotes.map((fact) => fact.logicalNoteId), []);
  assert.deepEqual(measure1End.holdNotes.map((fact) => fact.logicalNoteId), [chainId]);
  assert.deepEqual(measure1End.activeNotes.map((fact) => fact.logicalNoteId), [chainId]);
  assert.deepEqual(measure1End.releaseNotes.map((fact) => fact.logicalNoteId), [
    'P1:measure:0:note:1',
  ]);

  const measure2Start = model.measures[1].sonorityPoints[0];
  assert.deepEqual(measure2Start.attackNotes.map((fact) => fact.logicalNoteId), [
    'P1:measure:1:note:1',
  ]);
  assert.deepEqual(measure2Start.holdNotes.map((fact) => fact.logicalNoteId), [chainId]);
  const heldChain = measure2Start.holdNotes.find((fact) => fact.logicalNoteId === chainId);
  assert.equal(heldChain.sourceEventId, 'P1:measure:1:note:0');
  assert.equal(heldChain.sustainChainId, chainId);

  const measure2End = model.measures[1].sonorityPoints.at(-1);
  assert.deepEqual(measure2End.activeNotes, []);
  assert.deepEqual(measure2End.releaseNotes.map((fact) => fact.logicalNoteId), [
    chainId,
    'P1:measure:1:note:1',
  ]);
});

test('PS-3 keeps an untied unison in another voice independent from a sustain-chain identity', () => {
  const model = sonority(fixture('ui07-poly-unison-tie.musicxml'));
  const start = model.measures[0].sonorityPoints[0];

  assert.equal(start.activeNotes.length, 2);
  assert.deepEqual(start.activeNotes.map((fact) => ({
    logicalNoteId: fact.logicalNoteId,
    voice: fact.voice,
    pitch: fact.pitch.written,
  })), [
    { logicalNoteId: 'P1:sustain-chain:0', voice: '1', pitch: 'C4' },
    { logicalNoteId: 'P1:measure:0:note:1', voice: '2', pitch: 'C4' },
  ]);
});

test('PS-3 output is deeply immutable and contains no guitar-selection authority', () => {
  const model = sonority(fixture('ui07-poly-unison-tie.musicxml'));
  const measure = model.measures[0];
  const point = measure.sonorityPoints[0];
  const fact = point.activeNotes[0];

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.source), true);
  assert.equal(Object.isFrozen(model.temporal), true);
  assert.equal(Object.isFrozen(model.sustain), true);
  assert.equal(Object.isFrozen(model.measures), true);
  assert.equal(Object.isFrozen(measure), true);
  assert.equal(Object.isFrozen(measure.sonorityPoints), true);
  assert.equal(Object.isFrozen(point), true);
  assert.equal(Object.isFrozen(point.attackNotes), true);
  assert.equal(Object.isFrozen(point.holdNotes), true);
  assert.equal(Object.isFrozen(point.releaseNotes), true);
  assert.equal(Object.isFrozen(point.activeNotes), true);
  assert.equal(Object.isFrozen(fact), true);
  assert.equal(Object.isFrozen(fact.pitch), true);

  for (const forbidden of ['string', 'fret', 'finger', 'barre', 'selected', 'cost']) {
    assert.equal(forbidden in point, false);
    assert.equal(forbidden in fact, false);
  }
});

test('PS-3 revalidates PolyphonicSourceModel input fail-closed before deriving sonorities', () => {
  const valid = sourceModel(fixture('ui07-poly-unison-tie.musicxml'));
  const hostile = structuredClone(valid);
  hostile.measures[0].events[0].staff = 0;

  assert.throws(
    () => createActiveSonorityModel(hostile),
    (error) => {
      assert.equal(error.code, 'INVALID_POLYPHONIC_SOURCE_MODEL');
      return true;
    },
  );
});

test('PS-3 remains deadline-bounded while deriving active sonority points', () => {
  const source = sourceModel(singleMeasureScore([
    note('C', { duration: 12, voice: '1' }),
    '<backup><duration>8</duration></backup>',
    note('E', { duration: 4, voice: '2' }),
  ].join('')));
  let pointChecks = 0;
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => {
        if (phase !== 'active-sonority-model:point') return 0;
        pointChecks += 1;
        return pointChecks >= 2 ? 11 : 0;
      },
    },
  );

  assert.throws(
    () => createActiveSonorityModel(source, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_DEADLINE_EXCEEDED');
      assert.equal(error.details.phase, 'active-sonority-model:point');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.pointIndex, 1);
      return true;
    },
  );
});

test('PS-3 observes cancellation between sonority points', () => {
  const source = sourceModel(singleMeasureScore([
    note('C', { duration: 12, voice: '1' }),
    '<backup><duration>8</duration></backup>',
    note('E', { duration: 4, voice: '2' }),
  ].join('')));
  const controller = new AbortController();
  let injected = false;
  const runtime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    {
      clock: (phase) => {
        if (phase === 'active-sonority-model:point' && !injected) {
          injected = true;
          controller.abort();
        }
        return 0;
      },
    },
  );

  assert.throws(
    () => createActiveSonorityModel(source, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.equal(error.details.phase, 'active-sonority-model:point');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.pointIndex, 1);
      return true;
    },
  );
});
