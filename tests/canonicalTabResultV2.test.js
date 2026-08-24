'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const {
  createCanonicalTabResultV2,
} = require('../src/tab/canonicalTabResultV2');
const {
  validateCanonicalTabResultV2,
} = require('../src/contracts/canonicalTabResultV2Contract');

function pitch(step, octave, midi, alter = 0) {
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter];
  return {
    step,
    alter,
    octave,
    midi,
    written: `${step}${accidental}${octave}`,
  };
}

function note({ index, onset, duration, pitchValue, chordWithPrevious = false }) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'note',
    voice: '1',
    staff: 1,
    onsetDivisions: onset,
    durationDivisions: duration,
    pitch: pitchValue,
    tieStart: false,
    tieStop: false,
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

function decision(event, decisionType = 'PRESERVED') {
  return {
    decisionType,
    sourceEventIds: [event.sourceEventId],
    sourceGroupId: null,
  };
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((nested) => deeplyFrozen(nested, seen));
}

test('produces exact immutable CanonicalTabResult 2.0.0 with one selected physical chord shape', () => {
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
  const decisions = events.map((event) => decision(event));
  const result = createCanonicalTabResultV2(source(events), decisions);

  assert.equal(result.documentType, 'CanonicalTabResult');
  assert.equal(result.schemaVersion, '2.0.0');
  assert.equal(result.review.teacherReviewStatus, 'NOT_REVIEWED');
  assert.equal(result.simultaneousGroups.length, 1);
  assert.equal(result.noteDispositions.length, 2);
  assert.equal(result.selectedShapes.length, 1);
  assert.equal(new Set(result.noteDispositions.map((entry) => entry.selectedPosition.string)).size, 2);
  assert.equal(result.selectedShapes[0].physicalValidation.status, 'PLAYABLE_WITHIN_POLICY');
  assert.equal(validateCanonicalTabResultV2(result), result);
  assert.equal(deeplyFrozen(result), true);

  const replay = createCanonicalTabResultV2(source(events), decisions);
  assert.deepEqual(replay, result);
});

test('records deterministic octave displacement as target pitch plus selected position', () => {
  const event = note({
    index: 0,
    onset: 0,
    duration: 4,
    pitchValue: pitch('C', 7, 96),
  });
  const result = createCanonicalTabResultV2(source([event]), [decision(event, 'OCTAVE_DISPLACED')]);
  const disposition = result.noteDispositions[0];

  assert.equal(disposition.disposition, 'KEEP');
  assert.equal(disposition.octaveShiftSemitones, -12);
  assert.deepEqual(disposition.targetPitch, pitch('C', 6, 84));
  assert.equal(disposition.ruleId, 'OCTAVE_NEAREST_IN_REGISTER');
  assert.ok(disposition.selectedPosition);
  assert.equal(disposition.selectedShapeId, null);
});

test('keeps explicit omission facts null while preserving another retained attack', () => {
  const events = [
    note({ index: 0, onset: 0, duration: 4, pitchValue: pitch('C', 4, 60) }),
    note({ index: 1, onset: 4, duration: 4, pitchValue: pitch('D', 4, 62) }),
  ];
  const result = createCanonicalTabResultV2(source(events), [
    decision(events[0], 'OMITTED'),
    decision(events[1], 'PRESERVED'),
  ]);

  assert.deepEqual(result.noteDispositions[0], {
    sourceEventId: events[0].sourceEventId,
    decisionId: 'P1:arrangement-decision:0',
    disposition: 'OMIT',
    targetPitch: null,
    octaveShiftSemitones: null,
    ruleId: 'OMIT_EXPLICIT',
    selectedPosition: null,
    selectedShapeId: null,
  });
  assert.equal(result.noteDispositions[1].disposition, 'KEEP');
});

test('validator rejects a position that no longer round-trips to the selected target pitch', () => {
  const event = note({ index: 0, onset: 0, duration: 4, pitchValue: pitch('C', 4, 60) });
  const result = createCanonicalTabResultV2(source([event]), [decision(event)]);
  const tampered = jsonClone(result);
  tampered.noteDispositions[0].selectedPosition.fret += 1;

  assert.throws(
    () => validateCanonicalTabResultV2(tampered),
    (error) => error && error.code === 'INVALID_CANONICAL_TAB_RESULT_V2',
  );
});

test('validator rejects shared object identity before semantic validation', () => {
  const event = note({ index: 0, onset: 0, duration: 4, pitchValue: pitch('C', 4, 60) });
  const result = createCanonicalTabResultV2(source([event]), [decision(event)]);
  const tampered = jsonClone(result);
  tampered.review = tampered.engine;

  assert.throws(
    () => validateCanonicalTabResultV2(tampered),
    (error) => error && error.code === 'UNSAFE_CANONICAL_TAB_RESULT_V2',
  );
});

test('validator rejects accessor-bearing canonical data without invoking the accessor', () => {
  const event = note({ index: 0, onset: 0, duration: 4, pitchValue: pitch('C', 4, 60) });
  const result = jsonClone(createCanonicalTabResultV2(source([event]), [decision(event)]));
  let invoked = false;
  Object.defineProperty(result.review, 'teacherReviewStatus', {
    enumerable: true,
    get() {
      invoked = true;
      return 'NOT_REVIEWED';
    },
  });

  assert.throws(
    () => validateCanonicalTabResultV2(result),
    (error) => error && error.code === 'UNSAFE_CANONICAL_TAB_RESULT_V2',
  );
  assert.equal(invoked, false);
});