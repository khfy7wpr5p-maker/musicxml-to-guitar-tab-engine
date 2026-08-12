'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createDeterministicReductionPlan } = require('../src/music/deterministicReductionPlan');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-6 hardening</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, voice = '1', staff = 1, chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function backup(duration = 4) {
  return `<backup><duration>${duration}</duration></backup>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function eventId(index) {
  return `P1:measure:0:note:${index}`;
}

function groupId(onset = 0) {
  return `P1:measure:0:simultaneous:${onset}`;
}

function decision(decisionType, index) {
  return {
    decisionType,
    sourceEventIds: [eventId(index)],
    sourceGroupId: null,
  };
}

test('PA-6 octave policy handles exact register boundaries and multi-octave entry deterministically', () => {
  const lowBoundary = createDeterministicReductionPlan(
    sourceModel(score(note('E', { octave: 2 }))),
    [decision('OCTAVE_DISPLACED', 0)],
  );
  assert.equal(lowBoundary.instructions[0].targetMidi, 52);
  assert.equal(lowBoundary.instructions[0].octaveShiftSemitones, 12);

  const highBoundary = createDeterministicReductionPlan(
    sourceModel(score(note('C', { octave: 6 }))),
    [decision('OCTAVE_DISPLACED', 0)],
  );
  assert.equal(highBoundary.instructions[0].targetMidi, 72);
  assert.equal(highBoundary.instructions[0].octaveShiftSemitones, -12);

  const farBelow = createDeterministicReductionPlan(
    sourceModel(score(note('C', { octave: 1 }))),
    [decision('OCTAVE_DISPLACED', 0)],
  );
  assert.equal(farBelow.instructions[0].targetMidi, 48);
  assert.equal(farBelow.instructions[0].octaveShiftSemitones, 24);
});

test('PA-6 preserves canonical source order and exact cross-voice/staff group provenance', () => {
  const source = sourceModel(score([
    note('C', { octave: 5, voice: 'upper', staff: 1 }),
    backup(),
    note('E', { octave: 4, voice: 'middle', staff: 1 }),
    backup(),
    note('C', { octave: 3, voice: 'bass', staff: 2 }),
  ].join('')));
  const model = createDeterministicReductionPlan(source, [{
    decisionType: 'CHORD_REDUCED',
    sourceEventIds: [eventId(0), eventId(1), eventId(2)],
    sourceGroupId: groupId(),
  }]);

  assert.deepEqual(model.instructions.map((entry) => entry.sourceEventId), [
    eventId(0), eventId(1), eventId(2),
  ]);
  assert.deepEqual(model.instructions.map((entry) => entry.sourceGroupId), [
    groupId(), groupId(), groupId(),
  ]);
  assert.deepEqual(model.instructions.map((entry) => entry.sourceRole), [
    'MELODY_CANDIDATE', 'INNER_VOICE_CANDIDATE', 'BASS_CANDIDATE',
  ]);
});

test('PA-6 rejects a chord reduction whose kept outer survivor lies outside the fixed register envelope', () => {
  const source = sourceModel(score([
    note('C', { octave: 7 }),
    note('E', { octave: 4, chord: true }),
    note('C', { octave: 3, chord: true }),
  ].join('')));

  assert.throws(
    () => createDeterministicReductionPlan(source, [{
      decisionType: 'CHORD_REDUCED',
      sourceEventIds: [eventId(0), eventId(1), eventId(2)],
      sourceGroupId: groupId(),
    }]),
    (error) => error && error.code === 'INVALID_DETERMINISTIC_REDUCTION_PLAN',
  );
});

test('PA-6 revalidates hostile source models and hostile raw decisions fail closed without getter execution', () => {
  const source = sourceModel(score(note('C')));
  assert.throws(
    () => createDeterministicReductionPlan(new Proxy(source, {}), [decision('PRESERVED', 0)]),
    (error) => error && error.code === 'INVALID_POLYPHONIC_SOURCE_MODEL',
  );

  let getterCalls = 0;
  const hostileDecision = {};
  Object.defineProperty(hostileDecision, 'decisionType', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'PRESERVED';
    },
  });
  Object.defineProperty(hostileDecision, 'sourceEventIds', {
    enumerable: true,
    value: [eventId(0)],
  });
  Object.defineProperty(hostileDecision, 'sourceGroupId', {
    enumerable: true,
    value: null,
  });

  assert.throws(
    () => createDeterministicReductionPlan(source, [hostileDecision]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
  assert.equal(getterCalls, 0);
});

test('PA-6 remains deadline-bounded and cancellation-aware through its own execution path', () => {
  const source = sourceModel(score(note('C', { octave: 5 })));
  const decisions = [decision('OCTAVE_DISPLACED', 0)];

  let now = 0;
  const deadlineRuntime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 1 },
    { clock: () => { now += 1; return now; } },
  );
  assert.throws(
    () => createDeterministicReductionPlan(source, decisions, deadlineRuntime),
    (error) => error && error.code === 'PROCESSING_DEADLINE_EXCEEDED',
  );

  const controller = new AbortController();
  controller.abort();
  const cancelledRuntime = createMusicXmlProcessingRuntime({ signal: controller.signal });
  assert.throws(
    () => createDeterministicReductionPlan(source, decisions, cancelledRuntime),
    (error) => error && error.code === 'PROCESSING_ABORTED',
  );
});

test('PA-6 output is deeply immutable and contains no physical-position or later-gate authority fields', () => {
  const model = createDeterministicReductionPlan(
    sourceModel(score(note('C'))),
    [decision('PRESERVED', 0)],
  );

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.source), true);
  assert.equal(Object.isFrozen(model.arrangement), true);
  assert.equal(Object.isFrozen(model.analysis), true);
  assert.equal(Object.isFrozen(model.registerEnvelope), true);
  assert.equal(Object.isFrozen(model.instructions), true);
  assert.equal(Object.isFrozen(model.instructions[0]), true);

  for (const forbidden of [
    'string', 'fret', 'finger', 'barre', 'handPosition', 'targetVoice',
    'targetString', 'targetFret', 'startOffset', 'duration', 'chordShape',
  ]) {
    assert.equal(forbidden in model.instructions[0], false);
  }
});