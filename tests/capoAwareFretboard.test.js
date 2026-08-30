'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { pitchNameToMidi } = require('../src/music/pitch');
const { createGuitarConfiguration } = require('../src/guitar/tuning');
const {
  getPositionCandidates,
  positionToMidi,
  relativeFretToAbsoluteFret,
} = require('../src/guitar/fretboard');
const { validatePosition } = require('../src/guitar/playability');

const DROP_D = [
  { number: 1, pitch: 'E4', midi: 64 },
  { number: 2, pitch: 'B3', midi: 59 },
  { number: 3, pitch: 'G3', midi: 55 },
  { number: 4, pitch: 'D3', midi: 50 },
  { number: 5, pitch: 'A2', midi: 45 },
  { number: 6, pitch: 'D2', midi: 38 },
];
const CUSTOM = [
  { number: 1, pitch: 'D4', midi: 62 },
  { number: 2, pitch: 'A3', midi: 57 },
  { number: 3, pitch: 'F3', midi: 53 },
  { number: 4, pitch: 'C3', midi: 48 },
  { number: 5, pitch: 'G2', midi: 43 },
  { number: 6, pitch: 'C2', midi: 36 },
];

function pairs(value) {
  return value.map(({ string, fret }) => ({ string, fret }));
}

test('Standard capo 0 candidate generation remains byte-for-byte equivalent to legacy physical positions', () => {
  assert.deepEqual(pairs(getPositionCandidates(40)), [{ string: 6, fret: 0 }]);
  assert.deepEqual(pairs(getPositionCandidates(45)), [
    { string: 5, fret: 0 },
    { string: 6, fret: 5 },
  ]);
  assert.deepEqual(pairs(getPositionCandidates(64)), [
    { string: 1, fret: 0 },
    { string: 2, fret: 5 },
    { string: 3, fret: 9 },
    { string: 4, fret: 14 },
    { string: 5, fret: 19 },
  ]);
});

test('Standard capo 2 uses relative-from-capo frets and raises the exact minimum sounding pitch', () => {
  const configuration = createGuitarConfiguration({ capoFret: 2 });
  assert.deepEqual(getPositionCandidates(pitchNameToMidi('E2'), configuration), []);
  assert.deepEqual(
    pairs(getPositionCandidates(pitchNameToMidi('F#2'), configuration)),
    [{ string: 6, fret: 0 }],
  );
  assert.equal(positionToMidi({ string: 6, fret: 0 }, configuration), pitchNameToMidi('F#2'));
  assert.equal(relativeFretToAbsoluteFret(0, configuration), 2);
  assert.equal(relativeFretToAbsoluteFret(5, configuration), 7);
});

test('physical maximum fret remains absolute while solver fret is relative from capo', () => {
  const configuration = createGuitarConfiguration({ capoFret: 2, maximumFret: 20 });
  const atPhysicalFret20 = getPositionCandidates(64 + 20, configuration)
    .find((position) => position.string === 1);
  assert.deepEqual(atPhysicalFret20, { string: 1, fret: 18 });
  const beyondPhysicalFretboard = getPositionCandidates(64 + 21, configuration)
    .find((position) => position.string === 1);
  assert.equal(beyondPhysicalFretboard, undefined);
});

test('Drop D and custom configurations are capo-aware without a parallel physical model', () => {
  const dropD = createGuitarConfiguration({ tuning: DROP_D, capoFret: 2 });
  const custom = createGuitarConfiguration({ tuning: CUSTOM, capoFret: 3 });

  assert.deepEqual(
    pairs(getPositionCandidates(pitchNameToMidi('E2'), dropD)),
    [{ string: 6, fret: 0 }],
  );
  assert.deepEqual(
    pairs(getPositionCandidates(pitchNameToMidi('D#2'), custom)),
    [{ string: 6, fret: 0 }],
  );
});

test('pitch -> candidates -> positionToMidi round-trip is exact across six configuration classes', () => {
  const configurations = [
    createGuitarConfiguration(),
    createGuitarConfiguration({ capoFret: 2 }),
    createGuitarConfiguration({ tuning: DROP_D }),
    createGuitarConfiguration({ tuning: DROP_D, capoFret: 2 }),
    createGuitarConfiguration({ tuning: CUSTOM }),
    createGuitarConfiguration({ tuning: CUSTOM, capoFret: 3 }),
  ];
  const targetMidis = [50, 52, 55, 57, 60, 62, 64, 67, 69];
  for (const configuration of configurations) {
    for (const targetMidi of targetMidis) {
      for (const position of getPositionCandidates(targetMidi, configuration)) {
        assert.equal(positionToMidi(position, configuration), targetMidi);
      }
    }
  }
});

test('legacy positionToMidi tuning-array argument retains capo-0 behavior', () => {
  assert.equal(positionToMidi({ string: 6, fret: 0 }, DROP_D), 38);
  assert.equal(positionToMidi({ string: 6, fret: 2 }, DROP_D), 40);
});

test('validatePosition preserves capo configuration and applies absolute fret bounds', () => {
  const options = { capoFret: 2, maximumFret: 20 };
  assert.equal(validatePosition({ string: 6, fret: 0 }, pitchNameToMidi('F#2'), options), true);
  assert.equal(validatePosition({ string: 1, fret: 18 }, 84, options), true);
  assert.throws(
    () => validatePosition({ string: 1, fret: 19 }, 85, options),
    (error) => error && error.code === 'INVALID_POSITION',
  );
});

test('capo candidate generation never mutates pitch/configuration facts or invents a playable fallback', () => {
  const source = Object.freeze({ pitch: 'E2', midi: 40 });
  const before = structuredClone(source);
  const configuration = createGuitarConfiguration({ capoFret: 2 });
  assert.deepEqual(getPositionCandidates(source.midi, configuration), []);
  assert.deepEqual(source, before);
  assert.equal(source.pitch, 'E2');
});
