'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GUITAR_ARRANGEMENT_REGISTER_VERSION,
  createGuitarArrangementRegister,
} = require('../src/guitar/guitarArrangementRegister');

const DROP_D = Object.freeze([
  Object.freeze({ number: 1, pitch: 'E4', midi: 64 }),
  Object.freeze({ number: 2, pitch: 'B3', midi: 59 }),
  Object.freeze({ number: 3, pitch: 'G3', midi: 55 }),
  Object.freeze({ number: 4, pitch: 'D3', midi: 50 }),
  Object.freeze({ number: 5, pitch: 'A2', midi: 45 }),
  Object.freeze({ number: 6, pitch: 'D2', midi: 38 }),
]);

const DADGAD = Object.freeze([
  Object.freeze({ number: 1, pitch: 'D4', midi: 62 }),
  Object.freeze({ number: 2, pitch: 'A3', midi: 57 }),
  Object.freeze({ number: 3, pitch: 'G3', midi: 55 }),
  Object.freeze({ number: 4, pitch: 'D3', midi: 50 }),
  Object.freeze({ number: 5, pitch: 'A2', midi: 45 }),
  Object.freeze({ number: 6, pitch: 'D2', midi: 38 }),
]);

test('standard arrangement register preserves the historical E2..E6 bounds', () => {
  const register = createGuitarArrangementRegister();
  assert.deepEqual(register, {
    contractVersion: GUITAR_ARRANGEMENT_REGISTER_VERSION,
    minimumMidi: 40,
    maximumMidi: 84,
  });
  assert.equal(Object.isFrozen(register), true);
});

test('capo does not widen or shift PA-6 octave-displacement eligibility', () => {
  assert.deepEqual(
    createGuitarArrangementRegister({ capoFret: 7 }),
    createGuitarArrangementRegister({ capoFret: 0 }),
  );
});

test('Drop D exposes D2 as native arrangement register instead of forcing +12', () => {
  const register = createGuitarArrangementRegister({ tuning: DROP_D, capoFret: 4 });
  assert.equal(register.minimumMidi, 38);
  assert.equal(register.maximumMidi, 84);
});

test('custom tuning uses exact configured open strings and bounded fret range', () => {
  const register = createGuitarArrangementRegister({
    tuning: DADGAD,
    capoFret: 5,
    minimumFret: 2,
    maximumFret: 18,
  });
  assert.deepEqual(register, {
    contractVersion: GUITAR_ARRANGEMENT_REGISTER_VERSION,
    minimumMidi: 40,
    maximumMidi: 80,
  });
});
