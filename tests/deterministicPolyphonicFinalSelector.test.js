'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const {
  createDeterministicPolyphonicFinalSelection,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_DOCUMENT_TYPE,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_TRANSITION_POLICY,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_SUSTAINED_POLICY,
} = require('../src/music/deterministicPolyphonicFinalSelector');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');

function pitch(step, octave, midi) {
  return {
    step,
    alter: 0,
    octave,
    midi,
    written: `${step}${octave}`,
  };
}

function note({
  index,
  onset,
  duration,
  pitchValue,
  chordWithPrevious = false,
  tieStart = false,
  tieStop = false,
}) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'note',
    voice: '1',
    staff: 1,
    onsetDivisions: onset,
    durationDivisions: duration,
    pitch: pitchValue,
    tieStart,
    tieStop,
    source: {
      partId: 'P1',
      measureIndex: 0,
      measureNumber: '1',
      noteIndex: index,
      chordWithPrevious,
    },
  };
}

function source(events) {
  return createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: {
      format: 'score-partwise',
      musicXmlVersion: '4.0',
      partId: 'P1',
    },
    measureCount: 1,
    eventCount: events.length,
    measures: [{
      measureId: createMeasureId('P1', 0),
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events,
    }],
  });
}

function preserveDecisions(events) {
  return events.map((event) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [event.sourceEventId],
    sourceGroupId: null,
  }));
}

function deeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((nested) => deeplyFrozen(nested, seen));
}

test('final selector chooses one immutable physically validated shape for a retained simultaneous group', () => {
  const events = [
    note({ index: 0, onset: 0, duration: 4, pitchValue: pitch('C', 4, 60) }),
    note({
      index: 1,
      onset: 0,
      duration: 4,
      pitchValue: pitch('E', 4, 64),
      chordWithPrevious: true,
    }),
  ];
  const phases = [];
  const runtime = createMusicXmlProcessingRuntime({}, {
    clock(phase) {
      phases.push(phase);
      return 0;
    },
  });
  const result = createDeterministicPolyphonicFinalSelection(
    source(events),
    preserveDecisions(events),
    runtime,
  );

  assert.equal(result.documentType, DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_DOCUMENT_TYPE);
  assert.equal(result.contractVersion, DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION);
  assert.equal(result.policy, DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY);
  assert.equal(result.transitionPolicy, DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_TRANSITION_POLICY);
  assert.equal(result.sustainedSonorityPolicy, DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_SUSTAINED_POLICY);
  assert.equal(result.authority, 'DETERMINISTIC_NON_ML');
  assert.equal(result.candidateGenerationCount, 1);
  assert.equal(phases.filter((phase) => phase === 'guitar-voicing-candidate-model:start').length, 1);
  assert.equal(result.selectedNoteCount, 2);
  assert.equal(result.selectedShapeCount, 1);
  assert.equal(result.noteSelections.length, 2);
  assert.equal(new Set(result.noteSelections.map((entry) => entry.string)).size, 2);
  assert.equal(result.selectedShapes[0].physicalValidation.status, 'PLAYABLE_WITHIN_POLICY');
  assert.equal(result.selectedShapes[0].sourceEventIds.length, 2);
  assert.equal(deeplyFrozen(result), true);

  const replay = createDeterministicPolyphonicFinalSelection(source(events), preserveDecisions(events));
  assert.deepEqual(replay, result);
});

test('final selector consumes the same capo configuration as its PA-7 handoff', () => {
  const events = [
    note({ index: 0, onset: 0, duration: 4, pitchValue: pitch('C', 4, 60) }),
    note({
      index: 1,
      onset: 0,
      duration: 4,
      pitchValue: pitch('E', 4, 64),
      chordWithPrevious: true,
    }),
  ];
  const result = createDeterministicPolyphonicFinalSelection(
    source(events),
    preserveDecisions(events),
    null,
    { capoFret: 2 },
  );

  assert.deepEqual(
    result.noteSelections.map(({ targetMidi, string, fret }) => ({ targetMidi, string, fret })),
    [
      { targetMidi: 60, string: 3, fret: 3 },
      { targetMidi: 64, string: 2, fret: 3 },
    ],
  );
  assert.equal(result.selectedShapes[0].physicalValidation.status, 'PLAYABLE_WITHIN_POLICY');
});

test('final selector optimizes a deterministic transition path across singleton attacks', () => {
  const events = [
    note({ index: 0, onset: 0, duration: 4, pitchValue: pitch('C', 4, 60) }),
    note({ index: 1, onset: 4, duration: 4, pitchValue: pitch('E', 4, 64) }),
  ];
  const result = createDeterministicPolyphonicFinalSelection(source(events), preserveDecisions(events));

  assert.equal(result.selectionUnitCount, 2);
  assert.equal(result.selectedShapeCount, 0);
  assert.equal(result.pathCost.transitionFretDistance, 0);
  assert.deepEqual(
    result.noteSelections.map(({ sourceEventId, targetMidi, string, fret, selectedShapeId }) => ({
      sourceEventId,
      targetMidi,
      string,
      fret,
      selectedShapeId,
    })),
    [
      {
        sourceEventId: createSourceEventId('P1', 0, 0),
        targetMidi: 60,
        string: 3,
        fret: 5,
        selectedShapeId: null,
      },
      {
        sourceEventId: createSourceEventId('P1', 0, 1),
        targetMidi: 64,
        string: 2,
        fret: 5,
        selectedShapeId: null,
      },
    ],
  );
});

test('final selector fails closed when a retained note overlaps a later retained attack', () => {
  const events = [
    note({ index: 0, onset: 0, duration: 8, pitchValue: pitch('C', 4, 60) }),
    note({ index: 1, onset: 4, duration: 4, pitchValue: pitch('E', 4, 64) }),
  ];

  assert.throws(
    () => createDeterministicPolyphonicFinalSelection(source(events), preserveDecisions(events)),
    (error) => (
      error
      && error.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
      && error.details.reason === 'RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED'
    ),
  );
});

test('final selector fails closed on retained tie semantics instead of guessing sustained occupancy', () => {
  const events = [
    note({
      index: 0,
      onset: 0,
      duration: 4,
      pitchValue: pitch('C', 4, 60),
      tieStart: true,
    }),
  ];

  assert.throws(
    () => createDeterministicPolyphonicFinalSelection(source(events), preserveDecisions(events)),
    (error) => (
      error
      && error.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
      && error.details.reason === 'RETAINED_TIE_NOT_SUPPORTED'
    ),
  );
});
