'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { positionToMidi } = require('../src/guitar/fretboard');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION,
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE,
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_AUTHORITY,
  SUSTAINED_POSITION_POINT_STATUS,
  createSustainedGuitarPositionStateModel,
} = require('../src/music/sustainedGuitarPositionStateModel');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function note(step, { octave = 4, duration = 16, voice = '1', chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>1</staff></note>`;
}

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-4A</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(xml, {}, runtime),
    runtime,
  );
}

function states(xml, runtime = null) {
  return createSustainedGuitarPositionStateModel(sourceModel(xml), runtime);
}

test('PS-4A exposes an internal exact-position-candidates-only contract', () => {
  const model = states(score(note('C')));
  assert.equal(SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION, '1.0.0');
  assert.equal(SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE, 'SustainedGuitarPositionStateModel');
  assert.equal(SUSTAINED_GUITAR_POSITION_STATE_MODEL_AUTHORITY, 'EXACT_POSITION_CANDIDATES_ONLY');
  assert.equal(model.authority, 'EXACT_POSITION_CANDIDATES_ONLY');
  assert.equal(publicApi.createSustainedGuitarPositionStateModel, undefined);
});

test('PS-4A enumerates distinct-string exact-MIDI states for one held voice plus a later attack', () => {
  const model = states(score([
    note('C', { duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { duration: 12, voice: '2' }),
  ].join('')));
  const attackPoint = model.measures[0].points.find((point) => point.timeDivisions === 4);

  assert.equal(attackPoint.status, SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE);
  assert.deepEqual(attackPoint.holdLogicalNoteIds, ['P1:measure:0:note:0']);
  assert.deepEqual(attackPoint.attackLogicalNoteIds, ['P1:measure:0:note:1']);
  assert.ok(attackPoint.candidateCount > 0);

  for (const candidate of attackPoint.candidates) {
    assert.equal(candidate.positions.length, 2);
    assert.equal(new Set(candidate.positions.map((position) => position.string)).size, 2);
    for (const position of candidate.positions) {
      assert.equal(positionToMidi(position), position.targetMidi);
    }
    const held = candidate.positions.find((position) => position.logicalNoteId === 'P1:measure:0:note:0');
    const attacked = candidate.positions.find((position) => position.logicalNoteId === 'P1:measure:0:note:1');
    assert.equal(held.disposition, 'HOLD');
    assert.equal(attacked.disposition, 'ATTACK');
  }
});

test('PS-4A preserves tied logical identity as HOLD across the measure boundary', () => {
  const model = states(fixture('ui07-poly-unison-tie.musicxml'));
  const point = model.measures[1].points[0];
  const chainId = 'P1:sustain-chain:0';

  assert.equal(point.status, SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE);
  assert.ok(point.holdLogicalNoteIds.includes(chainId));
  for (const candidate of point.candidates) {
    const held = candidate.positions.find((position) => position.logicalNoteId === chainId);
    assert.ok(held);
    assert.equal(held.sourceEventId, 'P1:measure:1:note:0');
    assert.equal(held.sustainChainId, chainId);
    assert.equal(held.disposition, 'HOLD');
  }
});

test('PS-4A reports seven simultaneous exact notes as physically unplayable instead of silently reducing them', () => {
  const body = [
    note('C', { octave: 3 }),
    note('D', { octave: 3, chord: true }),
    note('E', { octave: 3, chord: true }),
    note('F', { octave: 3, chord: true }),
    note('G', { octave: 3, chord: true }),
    note('A', { octave: 3, chord: true }),
    note('B', { octave: 3, chord: true }),
  ].join('');
  const model = states(score(body));
  const point = model.measures[0].points[0];

  assert.equal(point.activeNoteCount, 7);
  assert.equal(point.status, SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT);
  assert.equal(point.reason, 'ACTIVE_NOTE_COUNT_EXCEEDS_STRING_COUNT');
  assert.equal(point.candidateCount, 0);
  assert.deepEqual(point.candidates, []);
});

test('PS-4A output is deeply immutable and has no finger/barre/selection authority', () => {
  const model = states(score(note('C')));
  const point = model.measures[0].points[0];
  const candidate = point.candidates[0];
  const position = candidate.positions[0];

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.measures), true);
  assert.equal(Object.isFrozen(point), true);
  assert.equal(Object.isFrozen(point.candidates), true);
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(Object.isFrozen(candidate.positions), true);
  assert.equal(Object.isFrozen(position), true);
  for (const forbidden of ['finger', 'barre', 'selected', 'cost']) {
    assert.equal(forbidden in candidate, false);
    assert.equal(forbidden in position, false);
  }
});

test('PS-4A revalidates source input and remains deadline/cancellation bounded', () => {
  const source = sourceModel(score([
    note('C', { duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { duration: 12, voice: '2' }),
  ].join('')));
  const hostile = structuredClone(source);
  hostile.measures[0].events[0].voice = '';
  assert.throws(() => createSustainedGuitarPositionStateModel(hostile), {
    code: 'INVALID_POLYPHONIC_SOURCE_MODEL',
  });

  let pointChecks = 0;
  const deadlineRuntime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    { clock: (phase) => {
      if (phase !== 'sustained-guitar-position-state:point') return 0;
      pointChecks += 1;
      return pointChecks >= 2 ? 11 : 0;
    } },
  );
  assert.throws(
    () => createSustainedGuitarPositionStateModel(source, deadlineRuntime),
    (error) => error.code === 'PROCESSING_DEADLINE_EXCEEDED'
      && error.details.phase === 'sustained-guitar-position-state:point',
  );

  const controller = new AbortController();
  let injected = false;
  const cancelRuntime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    { clock: (phase) => {
      if (phase === 'sustained-guitar-position-state:point' && !injected) {
        injected = true;
        controller.abort();
      }
      return 0;
    } },
  );
  assert.throws(
    () => createSustainedGuitarPositionStateModel(source, cancelRuntime),
    (error) => error.code === 'PROCESSING_ABORTED',
  );
});
