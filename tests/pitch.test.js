'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PitchError,
  parsePitchName,
  pitchNameToMidi,
  pitchToMidi,
} = require('../src/music/pitch');

test('converts natural pitches to MIDI', () => {
  assert.equal(pitchNameToMidi('C4'), 60);
  assert.equal(pitchNameToMidi('A4'), 69);
  assert.equal(pitchNameToMidi('E2'), 40);
});

test('converts accidentals and preserves enharmonic equivalence', () => {
  assert.equal(pitchNameToMidi('C#4'), 61);
  assert.equal(pitchNameToMidi('Db4'), 61);
  assert.equal(pitchNameToMidi('B#3'), 60);
  assert.equal(pitchNameToMidi('Cb4'), 59);
  assert.equal(pitchNameToMidi('F##4'), 67);
  assert.equal(pitchNameToMidi('Gbb4'), 65);
});

test('parses pitch names into MusicXML-compatible components', () => {
  assert.deepEqual(parsePitchName('db4'), {
    step: 'D',
    alter: -1,
    octave: 4,
  });
});

test('converts pitch components directly', () => {
  assert.equal(pitchToMidi({ step: 'F', alter: 1, octave: 4 }), 66);
});

test('rejects malformed or incomplete pitch names', () => {
  for (const value of ['H4', 'C#', 'C-wrong', '', 'C4.5']) {
    assert.throws(() => pitchNameToMidi(value), (error) => {
      assert.ok(error instanceof PitchError);
      assert.equal(error.code, 'INVALID_PITCH');
      return true;
    });
  }
});

test('rejects invalid component values', () => {
  assert.throws(() => pitchToMidi({ step: 'C', alter: 3, octave: 4 }), /alter/i);
  assert.throws(() => pitchToMidi({ step: 'C', alter: 0, octave: 4.5 }), /octave/i);
  assert.throws(() => pitchToMidi({ step: 'H', alter: 0, octave: 4 }), /step/i);
});

test('rejects pitches outside MIDI range', () => {
  assert.throws(() => pitchNameToMidi('C-2'), /MIDI range/i);
  assert.throws(() => pitchNameToMidi('G#9'), /MIDI range/i);
});
