'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPositionCandidates,
  positionToMidi,
} = require('../src/guitar/fretboard');
const {
  STANDARD_TUNING,
  createGuitarConfiguration,
} = require('../src/guitar/tuning');
const {
  assertPlayableMidi,
  isPlayableMidi,
  validatePosition,
} = require('../src/guitar/playability');

test('returns all C4 positions in deterministic string order', () => {
  assert.deepEqual(getPositionCandidates(60), [
    { string: 2, fret: 1 },
    { string: 3, fret: 5 },
    { string: 4, fret: 10 },
    { string: 5, fret: 15 },
    { string: 6, fret: 20 },
  ]);
});

test('maps every standard open string correctly', () => {
  const expectedOpenPositions = [
    { midi: 40, position: { string: 6, fret: 0 } },
    { midi: 45, position: { string: 5, fret: 0 } },
    { midi: 50, position: { string: 4, fret: 0 } },
    { midi: 55, position: { string: 3, fret: 0 } },
    { midi: 59, position: { string: 2, fret: 0 } },
    { midi: 64, position: { string: 1, fret: 0 } },
  ];

  for (const { midi, position } of expectedOpenPositions) {
    assert.ok(
      getPositionCandidates(midi).some(
        (candidate) =>
          candidate.string === position.string && candidate.fret === position.fret,
      ),
    );
  }
});

test('respects the configured maximum fret', () => {
  assert.deepEqual(getPositionCandidates(60, { maximumFret: 12 }), [
    { string: 2, fret: 1 },
    { string: 3, fret: 5 },
    { string: 4, fret: 10 },
  ]);
});

test('detects the supported guitar range', () => {
  assert.equal(isPlayableMidi(40), true);
  assert.equal(isPlayableMidi(84), true);
  assert.equal(isPlayableMidi(39), false);
  assert.equal(isPlayableMidi(85), false);
  assert.throws(() => assertPlayableMidi(39), (error) => {
    assert.equal(error.code, 'UNPLAYABLE_NOTE');
    return true;
  });
});

test('every generated position reproduces the requested MIDI pitch', () => {
  for (let midi = 40; midi <= 84; midi += 1) {
    for (const candidate of getPositionCandidates(midi)) {
      assert.equal(positionToMidi(candidate), midi);
      assert.equal(validatePosition(candidate, midi), true);
    }
  }
});

test('rejects positions that do not reproduce the expected pitch', () => {
  assert.throws(
    () => validatePosition({ string: 2, fret: 1 }, 61),
    (error) => {
      assert.equal(error.code, 'POSITION_PITCH_MISMATCH');
      return true;
    },
  );
});

test('rejects invalid fret ranges', () => {
  assert.throws(() => createGuitarConfiguration({ maximumFret: -1 }), /negative/i);
  assert.throws(
    () => createGuitarConfiguration({ minimumFret: 12, maximumFret: 10 }),
    /exceed/i,
  );
  assert.throws(() => createGuitarConfiguration({ maximumFret: 20.5 }), /integers/i);
});

test('rejects duplicate or invalid string definitions', () => {
  const duplicateTuning = STANDARD_TUNING.map((entry) => ({ ...entry }));
  duplicateTuning[5].number = 2;
  assert.throws(() => createGuitarConfiguration({ tuning: duplicateTuning }), /unique/i);

  const invalidMidiTuning = STANDARD_TUNING.map((entry) => ({ ...entry }));
  invalidMidiTuning[0].midi = 40.5;
  assert.throws(() => createGuitarConfiguration({ tuning: invalidMidiTuning }), /MIDI/i);
});

test('rejects invalid MIDI and position values', () => {
  assert.throws(() => getPositionCandidates(60.5), /integer/i);
  assert.throws(() => getPositionCandidates(-1), /0 to 127/i);
  assert.throws(() => validatePosition({ string: 0, fret: 1 }, 60), /String number/i);
  assert.throws(() => validatePosition({ string: 2, fret: 21 }, 60), /configured range/i);
});
