'use strict';

const { pitchToMidi, validatePitchComponents } = require('../music/pitch');

const STANDARD_GUITAR_TRANSPOSE = Object.freeze({
  diatonic: 0,
  chromatic: 0,
  octaveChange: -1,
});
const STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT = STANDARD_GUITAR_TRANSPOSE.octaveChange;
const STANDARD_GUITAR_WORKBENCH_TARGET = Object.freeze({
  writtenPitchOctaveShift: STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT,
});

function isSupportedWrittenPitchOctaveShift(value) {
  return value === 0 || value === STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT;
}

function isStandardGuitarTranspose(value) {
  return Boolean(
    value
    && value.diatonic === STANDARD_GUITAR_TRANSPOSE.diatonic
    && value.chromatic === STANDARD_GUITAR_TRANSPOSE.chromatic
    && value.octaveChange === STANDARD_GUITAR_TRANSPOSE.octaveChange,
  );
}

function writtenPitch(step, alter, octave) {
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter];
  return accidental === undefined ? null : `${step}${accidental}${octave}`;
}

function shiftWrittenPitchByOctaves(pitch, octaveShift) {
  if (
    !pitch
    || typeof pitch !== 'object'
    || Array.isArray(pitch)
    || !isSupportedWrittenPitchOctaveShift(octaveShift)
  ) {
    return null;
  }

  let source;
  let sourceMidi;
  let targetOctave;
  let targetMidi;
  try {
    source = validatePitchComponents(pitch.step, pitch.alter ?? 0, pitch.octave);
    sourceMidi = pitchToMidi(source);
    targetOctave = source.octave + octaveShift;
    targetMidi = pitchToMidi({ ...source, octave: targetOctave });
  } catch {
    return null;
  }

  const sourceWritten = writtenPitch(source.step, source.alter, source.octave);
  if (
    (Object.hasOwn(pitch, 'midi') && pitch.midi !== sourceMidi)
    || (Object.hasOwn(pitch, 'written') && pitch.written !== sourceWritten)
  ) {
    return null;
  }

  return {
    step: source.step,
    alter: source.alter,
    octave: targetOctave,
    written: writtenPitch(source.step, source.alter, targetOctave),
    midi: targetMidi,
  };
}

module.exports = {
  STANDARD_GUITAR_TRANSPOSE,
  STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT,
  STANDARD_GUITAR_WORKBENCH_TARGET,
  isStandardGuitarTranspose,
  isSupportedWrittenPitchOctaveShift,
  shiftWrittenPitchByOctaves,
};
