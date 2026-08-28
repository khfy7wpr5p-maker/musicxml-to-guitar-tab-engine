'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const publicApi = require('../src');

const {
  STANDARD_GUITAR_TRANSPOSE,
  STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT,
  STANDARD_GUITAR_WORKBENCH_TARGET,
  isStandardGuitarTranspose,
  isSupportedWrittenPitchOctaveShift,
  shiftWrittenPitchByOctaves,
} = require('../src/guitar/standardGuitarRegister');

test('standard guitar register authority maps written E4 to sounding E3 exactly once', () => {
  assert.deepEqual(STANDARD_GUITAR_TRANSPOSE, {
    diatonic: 0,
    chromatic: 0,
    octaveChange: -1,
  });
  assert.equal(STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT, -1);
  assert.deepEqual(STANDARD_GUITAR_WORKBENCH_TARGET, {
    writtenPitchOctaveShift: -1,
  });
  assert.equal(Object.isFrozen(STANDARD_GUITAR_TRANSPOSE), true);
  assert.equal(Object.isFrozen(STANDARD_GUITAR_WORKBENCH_TARGET), true);

  assert.deepEqual(
    shiftWrittenPitchByOctaves({ step: 'E', alter: 0, octave: 4, midi: 64 }, -1),
    { step: 'E', alter: 0, octave: 3, written: 'E3', midi: 52 },
  );
  assert.deepEqual(
    shiftWrittenPitchByOctaves({ step: 'E', alter: 0, octave: 3, midi: 52 }, 0),
    { step: 'E', alter: 0, octave: 3, written: 'E3', midi: 52 },
  );
});

test('standard guitar register authority rejects non-standard and inconsistent shifts', () => {
  assert.equal(isStandardGuitarTranspose({ diatonic: 0, chromatic: 0, octaveChange: -1 }), true);
  assert.equal(isStandardGuitarTranspose({ diatonic: 0, chromatic: 0, octaveChange: -2 }), false);
  assert.equal(isStandardGuitarTranspose({ diatonic: 1, chromatic: 0, octaveChange: -1 }), false);
  assert.equal(isSupportedWrittenPitchOctaveShift(0), true);
  assert.equal(isSupportedWrittenPitchOctaveShift(-1), true);
  assert.equal(isSupportedWrittenPitchOctaveShift(-2), false);
  assert.equal(
    shiftWrittenPitchByOctaves({ step: 'E', alter: 0, octave: 4, midi: 65 }, -1),
    null,
  );
  assert.equal(
    shiftWrittenPitchByOctaves({ step: 'C', alter: 0, octave: -1, midi: 0 }, -1),
    null,
  );
  assert.equal(publicApi.STANDARD_GUITAR_TRANSPOSE, undefined);
  assert.equal(publicApi.shiftWrittenPitchByOctaves, undefined);
});
