'use strict';

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
  POLYPHONIC_TEMPORAL_EVENT_MODEL_VERSION,
  POLYPHONIC_TEMPORAL_EVENT_MODEL_DOCUMENT_TYPE,
  POLYPHONIC_TEMPORAL_EVENT_MODEL_AUTHORITY,
  createPolyphonicTemporalEventModel,
} = require('../src/music/polyphonicTemporalEventModel');

function score(measureBody) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${measureBody}
    </measure>
  </part>
</score-partwise>`;
}

function note(step, {
  duration = 4,
  voice = '1',
  chord = false,
  rest = false,
} = {}) {
  const musical = rest
    ? '<rest/>'
    : `<pitch><step>${step}</step><octave>4</octave></pitch>`;
  return `<note>${chord ? '<chord/>' : ''}${musical}<duration>${duration}</duration><voice>${voice}</voice><staff>1</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function temporal(xml, runtime = null) {
  return createPolyphonicTemporalEventModel(sourceModel(xml), runtime);
}

test('PS-1 exposes a versioned internal temporal-facts-only contract without package-root authority', () => {
  const model = temporal(score(note('C')));

  assert.equal(POLYPHONIC_TEMPORAL_EVENT_MODEL_VERSION, '1.0.0');
  assert.equal(POLYPHONIC_TEMPORAL_EVENT_MODEL_DOCUMENT_TYPE, 'PolyphonicTemporalEventModel');
  assert.equal(POLYPHONIC_TEMPORAL_EVENT_MODEL_AUTHORITY, 'TEMPORAL_FACTS_ONLY');
  assert.equal(model.documentType, 'PolyphonicTemporalEventModel');
  assert.equal(model.contractVersion, '1.0.0');
  assert.equal(model.authority, 'TEMPORAL_FACTS_ONLY');
  assert.deepEqual(model.source, {
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    partId: 'P1',
  });
  assert.equal(publicApi.createPolyphonicTemporalEventModel, undefined);
});

test('PS-1 derives ATTACK HOLD RELEASE and ACTIVE facts across later attacks', () => {
  const model = temporal(score([
    note('C', { duration: 12, voice: '1' }),
    '<backup><duration>8</duration></backup>',
    note('E', { duration: 4, voice: '2' }),
    note('G', { duration: 4, voice: '2' }),
  ].join('')));

  assert.equal(model.measureCount, 1);
  assert.equal(model.temporalPointCount, 4);
  assert.deepEqual(
    model.measures[0].temporalPoints.map((point) => ({
      time: point.timeDivisions,
      attacks: point.attackSourceEventIds,
      holds: point.holdSourceEventIds,
      releases: point.releaseSourceEventIds,
      active: point.activeSourceEventIds,
    })),
    [
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
    ],
  );
});

test('PS-1 preserves simultaneous chord attacks as independent source identities', () => {
  const model = temporal(score([
    note('C', { duration: 8, voice: '1' }),
    note('E', { duration: 8, voice: '1', chord: true }),
  ].join('')));

  assert.deepEqual(model.measures[0].temporalPoints[0].attackSourceEventIds, [
    'P1:measure:0:note:0',
    'P1:measure:0:note:1',
  ]);
  assert.deepEqual(model.measures[0].temporalPoints[0].activeSourceEventIds, [
    'P1:measure:0:note:0',
    'P1:measure:0:note:1',
  ]);
});

test('PS-1 excludes rests from sustained pitch state', () => {
  const model = temporal(score([
    note('C', { duration: 8 }),
    '<backup><duration>8</duration></backup>',
    note('C', { duration: 4, voice: '2', rest: true }),
  ].join('')));

  assert.equal(model.temporalPointCount, 2);
  assert.deepEqual(model.measures[0].temporalPoints.map((point) => point.timeDivisions), [0, 8]);
  assert.deepEqual(model.measures[0].temporalPoints[0].activeSourceEventIds, [
    'P1:measure:0:note:0',
  ]);
});

test('PS-1 output is deeply immutable and contains no guitar-selection authority', () => {
  const model = temporal(score(note('C', { duration: 8 })));
  const measure = model.measures[0];
  const point = measure.temporalPoints[0];

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.source), true);
  assert.equal(Object.isFrozen(model.measures), true);
  assert.equal(Object.isFrozen(measure), true);
  assert.equal(Object.isFrozen(measure.temporalPoints), true);
  assert.equal(Object.isFrozen(point), true);
  assert.equal(Object.isFrozen(point.attackSourceEventIds), true);
  assert.equal(Object.isFrozen(point.holdSourceEventIds), true);
  assert.equal(Object.isFrozen(point.releaseSourceEventIds), true);
  assert.equal(Object.isFrozen(point.activeSourceEventIds), true);

  for (const forbidden of ['pitch', 'string', 'fret', 'finger', 'barre', 'selected', 'cost']) {
    assert.equal(forbidden in point, false);
  }
});

test('PS-1 revalidates PolyphonicSourceModel input fail-closed before temporal derivation', () => {
  const valid = sourceModel(score(note('C', { duration: 8 })));
  const hostile = structuredClone(valid);
  hostile.measures[0].events[0].sourceEventId = 'forged';

  assert.throws(
    () => createPolyphonicTemporalEventModel(hostile),
    (error) => {
      assert.equal(error.code, 'INVALID_POLYPHONIC_SOURCE_MODEL');
      return true;
    },
  );
});

test('PS-1 remains deadline-bounded while deriving temporal points', () => {
  const source = sourceModel(score([
    note('C', { duration: 12, voice: '1' }),
    '<backup><duration>8</duration></backup>',
    note('E', { duration: 4, voice: '2' }),
  ].join('')));
  let pointChecks = 0;
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => {
        if (phase !== 'polyphonic-temporal-event-model:point') return 0;
        pointChecks += 1;
        return pointChecks >= 2 ? 11 : 0;
      },
    },
  );

  assert.throws(
    () => createPolyphonicTemporalEventModel(source, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_DEADLINE_EXCEEDED');
      assert.equal(error.details.phase, 'polyphonic-temporal-event-model:point');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.pointIndex, 1);
      return true;
    },
  );
});

test('PS-1 observes cancellation between temporal points', () => {
  const source = sourceModel(score([
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
        if (phase === 'polyphonic-temporal-event-model:point' && !injected) {
          injected = true;
          controller.abort();
        }
        return 0;
      },
    },
  );

  assert.throws(
    () => createPolyphonicTemporalEventModel(source, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.equal(error.details.phase, 'polyphonic-temporal-event-model:point');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.pointIndex, 1);
      return true;
    },
  );
});
