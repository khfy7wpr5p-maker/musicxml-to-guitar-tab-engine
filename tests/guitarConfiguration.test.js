'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GUITAR_CONFIGURATION_VERSION,
  GUITAR_STRING_COUNT,
  STANDARD_TUNING,
  GuitarConfigurationError,
  createGuitarConfiguration,
} = require('../src/guitar/tuning');

test('defines the internal GuitarConfiguration contract as version 1.0.0', () => {
  assert.equal(GUITAR_CONFIGURATION_VERSION, '1.0.0');
  assert.equal(GUITAR_STRING_COUNT, 6);
});

test('creates the existing deeply frozen six-string configuration shape', () => {
  const configuration = createGuitarConfiguration();

  assert.deepEqual(configuration, {
    tuning: [
      { number: 1, pitch: 'E4', midi: 64 },
      { number: 2, pitch: 'B3', midi: 59 },
      { number: 3, pitch: 'G3', midi: 55 },
      { number: 4, pitch: 'D3', midi: 50 },
      { number: 5, pitch: 'A2', midi: 45 },
      { number: 6, pitch: 'E2', midi: 40 },
    ],
    minimumFret: 0,
    maximumFret: 20,
  });
  assert.ok(Object.isFrozen(configuration));
  assert.ok(Object.isFrozen(configuration.tuning));
  assert.ok(configuration.tuning.every(Object.isFrozen));
});

test('accepts a consistent alternative tuning', () => {
  const dropD = STANDARD_TUNING.map((entry) => (
    entry.number === 6
      ? { number: 6, pitch: 'D2', midi: 38 }
      : { ...entry }
  ));

  const configuration = createGuitarConfiguration({ tuning: dropD });

  assert.equal(configuration.tuning[5].number, 6);
  assert.equal(configuration.tuning[5].pitch, 'D2');
  assert.equal(configuration.tuning[5].midi, 38);
});

test('rejects pitch and MIDI disagreement fail-closed', () => {
  const tuning = STANDARD_TUNING.map((entry) => ({ ...entry }));
  tuning[0].midi = 41;

  assert.throws(
    () => createGuitarConfiguration({ tuning }),
    (error) => {
      assert.ok(error instanceof GuitarConfigurationError);
      assert.equal(error.code, 'INVALID_GUITAR_CONFIGURATION');
      assert.equal(error.details.pitch, 'E2');
      assert.equal(error.details.midi, 41);
      assert.equal(error.details.pitchMidi, 40);
      return true;
    },
  );
});

test('rejects malformed pitch names when a pitch label is provided', () => {
  const tuning = STANDARD_TUNING.map((entry) => ({ ...entry }));
  tuning[0].pitch = 'not-a-pitch';

  assert.throws(
    () => createGuitarConfiguration({ tuning }),
    (error) => {
      assert.ok(error instanceof GuitarConfigurationError);
      assert.equal(error.code, 'INVALID_GUITAR_CONFIGURATION');
      return true;
    },
  );
});

test('preserves MIDI-only custom tuning compatibility', () => {
  const midiOnly = STANDARD_TUNING.map(({ number, midi }) => ({ number, midi }));
  const configuration = createGuitarConfiguration({ tuning: midiOnly });

  assert.equal(configuration.tuning.length, 6);
  assert.ok(configuration.tuning.every((entry) => entry.pitch === null));
});
