'use strict';

const STEP_TO_SEMITONE = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

class PitchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PitchError';
    this.code = 'INVALID_PITCH';
    this.details = details;
  }
}

function validatePitchComponents(step, alter, octave) {
  const normalizedStep = typeof step === 'string' ? step.toUpperCase() : step;

  if (!Object.prototype.hasOwnProperty.call(STEP_TO_SEMITONE, normalizedStep)) {
    throw new PitchError('Pitch step must be one of A, B, C, D, E, F or G.', { step });
  }

  if (!Number.isInteger(alter) || alter < -2 || alter > 2) {
    throw new PitchError('Pitch alter must be an integer from -2 to 2.', { alter });
  }

  if (!Number.isInteger(octave)) {
    throw new PitchError('Pitch octave must be an integer.', { octave });
  }

  return { step: normalizedStep, alter, octave };
}

function pitchToMidi({ step, alter = 0, octave } = {}) {
  const validated = validatePitchComponents(step, alter, octave);
  const midi = (validated.octave + 1) * 12 + STEP_TO_SEMITONE[validated.step] + validated.alter;

  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new PitchError('Pitch is outside the supported MIDI range 0-127.', {
      ...validated,
      midi,
    });
  }

  return midi;
}

function accidentalToAlter(accidental = '') {
  const mapping = Object.freeze({
    '': 0,
    b: -1,
    bb: -2,
    '#': 1,
    '##': 2,
  });

  if (!Object.prototype.hasOwnProperty.call(mapping, accidental)) {
    throw new PitchError('Unsupported accidental.', { accidental });
  }

  return mapping[accidental];
}

function parsePitchName(value) {
  if (typeof value !== 'string') {
    throw new PitchError('Pitch name must be a string.', { value });
  }

  const match = /^([A-Ga-g])(bb|##|b|#)?(-?\d+)$/.exec(value.trim());
  if (!match) {
    throw new PitchError('Pitch name must include step, optional accidental and octave.', { value });
  }

  const [, rawStep, accidental = '', rawOctave] = match;
  const pitch = {
    step: rawStep.toUpperCase(),
    alter: accidentalToAlter(accidental),
    octave: Number.parseInt(rawOctave, 10),
  };

  validatePitchComponents(pitch.step, pitch.alter, pitch.octave);
  return pitch;
}

function pitchNameToMidi(value) {
  return pitchToMidi(parsePitchName(value));
}

module.exports = {
  STEP_TO_SEMITONE,
  PitchError,
  validatePitchComponents,
  pitchToMidi,
  parsePitchName,
  pitchNameToMidi,
};
