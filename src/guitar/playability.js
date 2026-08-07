'use strict';

const { EngineError } = require('../errors/engineError');
const { createGuitarConfiguration } = require('./tuning');
const { getPositionCandidates, positionToMidi, validateMidi } = require('./fretboard');

class PlayabilityError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'PlayabilityError');
  }
}

function isPlayableMidi(midi, options = {}) {
  validateMidi(midi);
  return getPositionCandidates(midi, options).length > 0;
}

function assertPlayableMidi(midi, options = {}) {
  if (!isPlayableMidi(midi, options)) {
    throw new PlayabilityError(
      'The note is outside the configured guitar range.',
      'UNPLAYABLE_NOTE',
      { midi },
    );
  }
  return true;
}

function validatePosition(position, expectedMidi, options = {}) {
  validateMidi(expectedMidi);
  const configuration = createGuitarConfiguration(options);

  if (!position || !Number.isInteger(position.string) || position.string < 1 || position.string > 6) {
    throw new PlayabilityError('String number must be an integer from 1 to 6.', 'INVALID_POSITION', {
      position,
    });
  }

  if (
    !Number.isInteger(position.fret) ||
    position.fret < configuration.minimumFret ||
    position.fret > configuration.maximumFret
  ) {
    throw new PlayabilityError('Fret is outside the configured range.', 'INVALID_POSITION', {
      position,
      minimumFret: configuration.minimumFret,
      maximumFret: configuration.maximumFret,
    });
  }

  const actualMidi = positionToMidi(position, configuration.tuning);
  if (actualMidi !== expectedMidi) {
    throw new PlayabilityError(
      'The selected string and fret do not reproduce the expected pitch.',
      'POSITION_PITCH_MISMATCH',
      { position, expectedMidi, actualMidi },
    );
  }

  return true;
}

module.exports = {
  PlayabilityError,
  isPlayableMidi,
  assertPlayableMidi,
  validatePosition,
};
