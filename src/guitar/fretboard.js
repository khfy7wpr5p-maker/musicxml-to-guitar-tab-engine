'use strict';

const {
  STANDARD_TUNING,
  createGuitarConfiguration,
} = require('./tuning');

class FretboardError extends Error {
  constructor(message, code = 'INVALID_FRETBOARD_INPUT', details = {}) {
    super(message);
    this.name = 'FretboardError';
    this.code = code;
    this.details = details;
  }
}

function validateMidi(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new FretboardError(
      'MIDI note must be an integer from 0 to 127.',
      'INVALID_PITCH',
      { midi },
    );
  }
  return midi;
}

function getPositionCandidates(midi, options = {}) {
  validateMidi(midi);
  const configuration = createGuitarConfiguration(options);

  return configuration.tuning
    .map((stringDefinition) => ({
      string: stringDefinition.number,
      fret: midi - stringDefinition.midi,
    }))
    .filter(
      (position) =>
        position.fret >= configuration.minimumFret &&
        position.fret <= configuration.maximumFret,
    );
}

function positionToMidi(position, tuning = STANDARD_TUNING) {
  if (!position || !Number.isInteger(position.string) || !Number.isInteger(position.fret)) {
    throw new FretboardError('Position must contain integer string and fret values.', 'INVALID_POSITION', {
      position,
    });
  }

  const normalizedTuning = createGuitarConfiguration({ tuning }).tuning;
  const stringDefinition = normalizedTuning.find((entry) => entry.number === position.string);

  if (!stringDefinition) {
    throw new FretboardError('Position contains an unknown string number.', 'INVALID_POSITION', {
      position,
    });
  }

  if (position.fret < 0) {
    throw new FretboardError('Fret cannot be negative.', 'INVALID_POSITION', { position });
  }

  const midi = stringDefinition.midi + position.fret;
  validateMidi(midi);
  return midi;
}

module.exports = {
  FretboardError,
  validateMidi,
  getPositionCandidates,
  positionToMidi,
};
