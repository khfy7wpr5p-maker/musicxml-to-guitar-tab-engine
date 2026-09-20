'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  RETAINED_NOTE_CAPS,
  createMelodyBassArrangementSelection,
} = require('../src/music/melodyBassArrangementPolicy');

function eventId(index) {
  return `P1:measure:0:note:${index}`;
}

function eventIds(count) {
  return Array.from({ length: count }, (_, index) => eventId(index));
}

function note(sourceEventId, sourceOrder, onsetDivisions = 0) {
  return {
    sourceEventId,
    sourceOrder,
    type: 'note',
    voice: 1,
    staff: 1,
    onsetDivisions,
    durationDivisions: 4,
    pitch: { midi: 60 },
    tieStart: false,
    tieStop: false,
  };
}

function policyInput(targetMidis, {
  retainedNoteCap = 6,
  forcedSourceEventIds = new Set(),
} = {}) {
  const events = targetMidis.map((targetMidi, index) => note(eventId(index), index));
  return {
    sourceModel: {
      measures: [{ index: 0, events }],
    },
    reduction: {
      instructions: targetMidis.map((targetMidi, index) => ({
        sourceEventId: eventId(index),
        disposition: 'KEEP',
        targetMidi,
      })),
    },
    tieGraph: null,
    retainedNoteCap,
    forcedSourceEventIds,
  };
}

function forcedTieInput() {
  const start = note('forced:start', 0, 0);
  start.tieStart = true;
  const competingMelody = note('ordinary:melody', 1, 0);
  const stop = note('forced:stop', 0, 0);
  stop.tieStop = true;
  const laterMelody = note('ordinary:later', 1, 0);
  return {
    sourceModel: {
      measures: [
        { index: 0, events: [start, competingMelody] },
        { index: 1, events: [stop, laterMelody] },
      ],
    },
    reduction: {
      instructions: [
        { sourceEventId: 'forced:start', disposition: 'KEEP', targetMidi: 48 },
        { sourceEventId: 'ordinary:melody', disposition: 'KEEP', targetMidi: 72 },
        { sourceEventId: 'forced:stop', disposition: 'KEEP', targetMidi: 48 },
        { sourceEventId: 'ordinary:later', disposition: 'KEEP', targetMidi: 74 },
      ],
    },
    tieGraph: {
      chains: [{
        chainId: 'tie:forced',
        segments: [
          { sourceEventId: 'forced:start' },
          { sourceEventId: 'forced:stop' },
        ],
      }],
    },
    retainedNoteCap: 1,
    forcedSourceEventIds: new Set(['forced:start']),
  };
}

function competingOrdinaryTieInput() {
  const start = note('tie:start', 0, 0);
  start.tieStart = true;
  const earlyInner = note('early:inner', 1, 0);
  const earlyMelody = note('early:melody', 2, 0);
  const laterBass = note('later:bass', 0, 0);
  const stop = note('tie:stop', 1, 0);
  stop.tieStop = true;
  const laterMelody = note('later:melody', 2, 0);
  return {
    sourceModel: {
      measures: [
        { index: 0, events: [start, earlyInner, earlyMelody] },
        { index: 1, events: [laterBass, stop, laterMelody] },
      ],
    },
    reduction: {
      instructions: [
        { sourceEventId: 'tie:start', disposition: 'KEEP', targetMidi: 48 },
        { sourceEventId: 'early:inner', disposition: 'KEEP', targetMidi: 60 },
        { sourceEventId: 'early:melody', disposition: 'KEEP', targetMidi: 72 },
        { sourceEventId: 'later:bass', disposition: 'KEEP', targetMidi: 40 },
        { sourceEventId: 'tie:stop', disposition: 'KEEP', targetMidi: 48 },
        { sourceEventId: 'later:melody', disposition: 'KEEP', targetMidi: 76 },
      ],
    },
    tieGraph: {
      chains: [{
        chainId: 'tie:ordinary',
        segments: [
          { sourceEventId: 'tie:start' },
          { sourceEventId: 'tie:stop' },
        ],
      }],
    },
    retainedNoteCap: 2,
    forcedSourceEventIds: new Set(),
  };
}

test('retains six distinct pitches with deterministic melody and bass anchors', () => {
  const input = policyInput([48, 55, 60, 64, 67, 72], { retainedNoteCap: 6 });
  const result = createMelodyBassArrangementSelection(input);

  assert.deepEqual(RETAINED_NOTE_CAPS, [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(result.selectedSourceEventIds, eventIds(6));
  assert.equal(result.reasonBySourceEventId[eventId(5)], 'MELODY_ANCHOR_RETAINED');
  assert.equal(result.reasonBySourceEventId[eventId(0)], 'BASS_ANCHOR_RETAINED');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.selectedSourceEventIds), true);
  assert.equal(Object.isFrozen(result.reasonBySourceEventId), true);
  assert.deepEqual(result, createMelodyBassArrangementSelection(input));
});

test('seven pitches at cap six retain both anchors and reduce one center voice', () => {
  const result = createMelodyBassArrangementSelection(
    policyInput([48, 50, 52, 53, 55, 57, 59], { retainedNoteCap: 6 }),
  );

  assert.equal(result.selectedSourceEventIds.length, 6);
  assert.ok(result.selectedSourceEventIds.includes(eventId(0)));
  assert.ok(result.selectedSourceEventIds.includes(eventId(6)));
  assert.equal(result.reasonBySourceEventId[eventId(3)], 'GUITAR_CAPACITY_REDUCTION');
});

test('duplicate target pitch is explicit and does not consume ordinary capacity', () => {
  const result = createMelodyBassArrangementSelection(
    policyInput([48, 60, 60, 64, 67], { retainedNoteCap: 4 }),
  );

  assert.equal(result.selectedSourceEventIds.length, 4);
  assert.equal(result.reasonBySourceEventId[eventId(2)], 'DUPLICATE_TARGET_PITCH_REDUCTION');
});

test('forced assignment wins and its complete tie chain remains indivisible', () => {
  const result = createMelodyBassArrangementSelection(forcedTieInput());

  assert.ok(result.selectedSourceEventIds.includes('forced:start'));
  assert.ok(result.selectedSourceEventIds.includes('forced:stop'));
  assert.equal(result.reasonBySourceEventId['forced:start'], 'TEACHER_ASSIGNMENT_RETAINED');
  assert.equal(result.reasonBySourceEventId['forced:stop'], 'TEACHER_ASSIGNMENT_RETAINED');
});

test('ordinary tie chain is reserved as one unit before remaining onset anchors', () => {
  const result = createMelodyBassArrangementSelection(competingOrdinaryTieInput());

  assert.deepEqual(result.selectedSourceEventIds, [
    'tie:start',
    'early:melody',
    'tie:stop',
    'later:melody',
  ]);
  assert.equal(result.reasonBySourceEventId['tie:start'], 'BASS_ANCHOR_RETAINED');
  assert.equal(result.reasonBySourceEventId['tie:stop'], 'INNER_VOICE_RETAINED');
  assert.equal(result.reasonBySourceEventId['early:inner'], 'GUITAR_CAPACITY_REDUCTION');
  assert.equal(result.reasonBySourceEventId['early:melody'], 'MELODY_ANCHOR_RETAINED');
  assert.equal(result.reasonBySourceEventId['later:bass'], 'GUITAR_CAPACITY_REDUCTION');
  assert.equal(result.reasonBySourceEventId['later:melody'], 'MELODY_ANCHOR_RETAINED');
});

test('cap one is melody-only and makes bass reduction explicit', () => {
  const result = createMelodyBassArrangementSelection(
    policyInput([48, 72], { retainedNoteCap: 1 }),
  );

  assert.deepEqual(result.selectedSourceEventIds, [eventId(1)]);
  assert.equal(result.reasonBySourceEventId[eventId(0)], 'GUITAR_CAPACITY_REDUCTION');
});

test('cap one remains monophonic when a later attack overlaps the active melody', () => {
  const input = policyInput([72, 74], { retainedNoteCap: 1 });
  input.sourceModel.measures[0].events[1].onsetDivisions = 2;
  input.sourceModel.measures[0].events[1].durationDivisions = 1;

  const result = createMelodyBassArrangementSelection(input);

  assert.deepEqual(result.selectedSourceEventIds, [eventId(0)]);
  assert.equal(result.reasonBySourceEventId[eventId(1)], 'GUITAR_CAPACITY_REDUCTION');
});

test('rejects retained-note caps outside the contracted one-through-six range', () => {
  assert.throws(
    () => createMelodyBassArrangementSelection(policyInput([60], { retainedNoteCap: 7 })),
    /retainedNoteCap must be an integer from 1 through 6/,
  );
});
