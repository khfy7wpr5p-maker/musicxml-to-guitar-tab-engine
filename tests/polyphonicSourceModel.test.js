'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  PolyphonicSourceModelError,
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
  validatePolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');

function sourceLocation(noteIndex, chordWithPrevious = false) {
  return {
    partId: 'P1',
    measureIndex: 0,
    measureNumber: '1',
    noteIndex,
    chordWithPrevious,
  };
}

function pitch(step, alter, octave, midi, written) {
  return { step, alter, octave, midi, written };
}

function noteEvent({
  index,
  voice,
  staff,
  onset,
  duration,
  notePitch,
  chordWithPrevious = false,
  tieStart = false,
  tieStop = false,
}) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'note',
    voice,
    staff,
    onsetDivisions: onset,
    durationDivisions: duration,
    pitch: notePitch,
    tieStart,
    tieStop,
    source: sourceLocation(index, chordWithPrevious),
  };
}

function restEvent({ index, voice, staff, onset, duration }) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'rest',
    voice,
    staff,
    onsetDivisions: onset,
    durationDivisions: duration,
    tieStart: false,
    tieStop: false,
    source: sourceLocation(index, false),
  };
}

function validModel() {
  const events = [
    noteEvent({
      index: 0,
      voice: '1',
      staff: 1,
      onset: 0,
      duration: 4,
      notePitch: pitch('C', 0, 5, 72, 'C5'),
    }),
    noteEvent({
      index: 1,
      voice: '1',
      staff: 1,
      onset: 0,
      duration: 4,
      notePitch: pitch('E', 0, 5, 76, 'E5'),
      chordWithPrevious: true,
    }),
    noteEvent({
      index: 2,
      voice: '1',
      staff: 1,
      onset: 4,
      duration: 4,
      notePitch: pitch('D', 0, 5, 74, 'D5'),
    }),
    noteEvent({
      index: 3,
      voice: '2',
      staff: 2,
      onset: 0,
      duration: 8,
      notePitch: pitch('C', 0, 3, 48, 'C3'),
    }),
    restEvent({
      index: 4,
      voice: '2',
      staff: 2,
      onset: 8,
      duration: 8,
    }),
  ];

  return {
    documentType: 'PolyphonicSourceModel',
    contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
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
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectInvalid(model) {
  assert.throws(
    () => validatePolyphonicSourceModel(model),
    (error) => {
      assert.ok(error instanceof PolyphonicSourceModelError);
      assert.equal(error.code, 'INVALID_POLYPHONIC_SOURCE_MODEL');
      return true;
    },
  );
}

test('creates an immutable PA-1 source-truth model with two staves, multiple voices and source-order overlap', () => {
  const input = validModel();
  const result = createPolyphonicSourceModel(input);

  assert.equal(result.documentType, 'PolyphonicSourceModel');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.measureCount, 1);
  assert.equal(result.eventCount, 5);
  assert.equal(result.measures[0].events[1].source.chordWithPrevious, true);
  assert.equal(result.measures[0].events[3].staff, 2);
  assert.equal(result.measures[0].events[3].voice, '2');
  assert.equal(result.measures[0].events[2].onsetDivisions, 4);
  assert.equal(result.measures[0].events[3].onsetDivisions, 0);
  assert.equal(Object.hasOwn(result.measures[0].events[4], 'pitch'), false);

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.source));
  assert.ok(Object.isFrozen(result.measures));
  assert.ok(Object.isFrozen(result.measures[0]));
  assert.ok(Object.isFrozen(result.measures[0].events));
  assert.ok(Object.isFrozen(result.measures[0].events[0]));
  assert.ok(Object.isFrozen(result.measures[0].events[0].pitch));
  assert.ok(Object.isFrozen(result.measures[0].events[0].source));
  assert.notStrictEqual(result, input);
});

test('keeps PA-1 internal and does not expand the package-root public API', () => {
  assert.equal(Object.hasOwn(publicApi, 'createPolyphonicSourceModel'), false);
  assert.equal(Object.hasOwn(publicApi, 'validatePolyphonicSourceModel'), false);
  assert.equal(Object.hasOwn(publicApi, 'POLYPHONIC_SOURCE_MODEL_VERSION'), false);
});

test('accepts nullable MusicXML version metadata without changing source identity', () => {
  const model = validModel();
  model.source.musicXmlVersion = null;
  const result = validatePolyphonicSourceModel(model);
  assert.equal(result.source.musicXmlVersion, null);
  assert.equal(result.source.partId, 'P1');
});

test('rejects sparse, custom-array, Proxy, accessor, symbol and unknown-field inputs fail closed', () => {
  const sparse = validModel();
  delete sparse.measures[0].events[2];
  expectInvalid(sparse);

  const customArray = validModel();
  class EventArray extends Array {}
  customArray.measures[0].events = EventArray.from(customArray.measures[0].events);
  expectInvalid(customArray);

  const proxied = validModel();
  proxied.source = new Proxy(proxied.source, {});
  expectInvalid(proxied);

  const accessor = validModel();
  Object.defineProperty(accessor.measures[0].events[0], 'voice', {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  expectInvalid(accessor);

  const symbolKey = validModel();
  symbolKey.measures[0].events[0][Symbol('hostile')] = true;
  expectInvalid(symbolKey);

  const unknown = validModel();
  unknown.measures[0].events[0].selectedPosition = { string: 1, fret: 0 };
  expectInvalid(unknown);
});

test('rejects cycles and shared references rather than silently normalizing hostile graphs', () => {
  const cycle = validModel();
  cycle.source = cycle;
  expectInvalid(cycle);

  const shared = validModel();
  shared.measures[0].events[1].source = shared.measures[0].events[0].source;
  expectInvalid(shared);
});

test('rejects non-finite, negative, overflow and out-of-bound staff timing values', () => {
  for (const value of [NaN, Infinity, -1]) {
    const model = validModel();
    model.measures[0].events[0].onsetDivisions = value;
    expectInvalid(model);
  }

  const zeroDuration = validModel();
  zeroDuration.measures[0].events[0].durationDivisions = 0;
  expectInvalid(zeroDuration);

  const overflow = validModel();
  overflow.measures[0].events[0].onsetDivisions = Number.MAX_SAFE_INTEGER;
  overflow.measures[0].events[0].durationDivisions = 1;
  expectInvalid(overflow);

  const outsideMeasure = validModel();
  outsideMeasure.measures[0].events[4].onsetDivisions = 12;
  outsideMeasure.measures[0].events[4].durationDivisions = 8;
  expectInvalid(outsideMeasure);

  const thirdStaff = validModel();
  thirdStaff.measures[0].events[3].staff = 3;
  expectInvalid(thirdStaff);
});

test('rejects pitch/MIDI/written mismatches and pitch data on rests', () => {
  const midiMismatch = validModel();
  midiMismatch.measures[0].events[0].pitch.midi = 71;
  expectInvalid(midiMismatch);

  const spellingMismatch = validModel();
  spellingMismatch.measures[0].events[0].pitch.written = 'B#4';
  expectInvalid(spellingMismatch);

  const restPitch = validModel();
  restPitch.measures[0].events[4].pitch = pitch('C', 0, 4, 60, 'C4');
  expectInvalid(restPitch);
});

test('rejects inconsistent source provenance, deterministic identities and aggregate counts', () => {
  const wrongEventId = validModel();
  wrongEventId.measures[0].events[1].sourceEventId = 'not-canonical';
  expectInvalid(wrongEventId);

  const wrongSourceOrder = validModel();
  wrongSourceOrder.measures[0].events[1].source.noteIndex = 99;
  expectInvalid(wrongSourceOrder);

  const wrongMeasureId = validModel();
  wrongMeasureId.measures[0].measureId = 'wrong';
  expectInvalid(wrongMeasureId);

  const wrongMeasureCount = validModel();
  wrongMeasureCount.measureCount = 2;
  expectInvalid(wrongMeasureCount);

  const wrongEventCount = validModel();
  wrongEventCount.eventCount = 4;
  expectInvalid(wrongEventCount);
});

test('rejects an invalid source chord marker instead of inventing simultaneity semantics', () => {
  const firstEventChord = validModel();
  firstEventChord.measures[0].events[0].source.chordWithPrevious = true;
  expectInvalid(firstEventChord);

  const wrongVoice = validModel();
  wrongVoice.measures[0].events[1].voice = '2';
  expectInvalid(wrongVoice);

  const wrongOnset = validModel();
  wrongOnset.measures[0].events[1].onsetDivisions = 4;
  expectInvalid(wrongOnset);
});

test('rejects malformed measure timing and unsupported top-level contract identity', () => {
  const badExpectedDuration = validModel();
  badExpectedDuration.measures[0].expectedDurationDivisions = 15;
  expectInvalid(badExpectedDuration);

  const badVersion = validModel();
  badVersion.contractVersion = '2.0.0';
  expectInvalid(badVersion);

  const badFormat = validModel();
  badFormat.source.format = 'score-timewise';
  expectInvalid(badFormat);
});

test('rejects non-enumerable data properties fail closed', () => {
  const model = validModel();
  Object.defineProperty(model.measures[0].events[0], 'voice', {
    value: '1',
    enumerable: false,
    configurable: true,
    writable: true,
  });
  expectInvalid(model);
});

test('rejects negative zero in canonical numeric fields', () => {
  const model = validModel();
  model.measures[0].events[0].onsetDivisions = -0;
  expectInvalid(model);
});

test('rejects tie markers on rest events', () => {
  const model = validModel();
  model.measures[0].events[4].tieStart = true;
  expectInvalid(model);
});

test('rejects non-enumerable array index properties fail closed', () => {
  const model = validModel();
  const firstEvent = model.measures[0].events[0];
  Object.defineProperty(model.measures[0].events, '0', {
    value: firstEvent,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  expectInvalid(model);
});

test('rejects numeric-looking custom array properties beyond array length fail closed', () => {
  const model = validModel();
  Object.defineProperty(model.measures[0].events, '4294967295', {
    value: model.measures[0].events[0],
    enumerable: true,
    configurable: true,
    writable: true,
  });
  expectInvalid(model);
});

test('enforces the aggregate event budget before validating an over-budget measure', () => {
  function budgetRestEvent(measureIndex, eventIndex, staff = 1) {
    const measureNumber = String(measureIndex + 1);
    return {
      sourceEventId: createSourceEventId('P1', measureIndex, eventIndex),
      sourceOrder: eventIndex,
      type: 'rest',
      voice: '1',
      staff,
      onsetDivisions: 0,
      durationDivisions: 1,
      tieStart: false,
      tieStop: false,
      source: {
        partId: 'P1',
        measureIndex,
        measureNumber,
        noteIndex: eventIndex,
        chordWithPrevious: false,
      },
    };
  }

  function budgetMeasure(measureIndex, eventTotal, firstStaff = 1) {
    const number = String(measureIndex + 1);
    return {
      measureId: createMeasureId('P1', measureIndex),
      index: measureIndex,
      number,
      implicit: false,
      divisions: 1,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 4,
      events: Array.from(
        { length: eventTotal },
        (_, eventIndex) => budgetRestEvent(
          measureIndex,
          eventIndex,
          eventIndex === 0 ? firstStaff : 1,
        ),
      ),
    };
  }

  const model = {
    documentType: 'PolyphonicSourceModel',
    contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
    source: {
      format: 'score-partwise',
      musicXmlVersion: '4.0',
      partId: 'P1',
    },
    measureCount: 2,
    eventCount: 50_000,
    measures: [
      budgetMeasure(0, 50_000),
      budgetMeasure(1, 1, 3),
    ],
  };

  assert.throws(
    () => validatePolyphonicSourceModel(model),
    (error) => {
      assert.ok(error instanceof PolyphonicSourceModelError);
      assert.equal(error.code, 'INVALID_POLYPHONIC_SOURCE_MODEL');
      assert.equal(error.message, 'model events exceed the ProcessingBudget default boundary.');
      return true;
    },
  );
});
