'use strict';

const { EngineError } = require('../errors/engineError');

const PEDAGOGICAL_FEATURE_VECTOR_VERSION = '1.0.0';

class PedagogicalFeatureVectorError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_PEDAGOGICAL_FEATURE_VECTOR_INPUT',
      details,
      'PedagogicalFeatureVectorError',
    );
  }
}

function validatePosition(position, field) {
  if (!position || typeof position !== 'object' || Array.isArray(position)) {
    throw new PedagogicalFeatureVectorError(`${field} must be a position object.`, { field });
  }
  if (!Number.isSafeInteger(position.string) || position.string < 1 || position.string > 6) {
    throw new PedagogicalFeatureVectorError(`${field}.string must be an integer from 1 to 6.`, { field });
  }
  if (!Number.isSafeInteger(position.fret) || position.fret < 0) {
    throw new PedagogicalFeatureVectorError(`${field}.fret must be a non-negative integer.`, { field });
  }
  return position;
}

function createPedagogicalFeatureVector(previousPosition, position, options = {}) {
  validatePosition(position, 'position');
  if (previousPosition !== null && previousPosition !== undefined) {
    validatePosition(previousPosition, 'previousPosition');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new PedagogicalFeatureVectorError('options must be an object.');
  }

  const largeShiftThreshold = options.largeShiftThreshold === undefined
    ? 4
    : options.largeShiftThreshold;
  if (!Number.isSafeInteger(largeShiftThreshold) || largeShiftThreshold < 0) {
    throw new PedagogicalFeatureVectorError(
      'largeShiftThreshold must be a non-negative integer.',
      { largeShiftThreshold },
    );
  }

  const hasPrevious = previousPosition !== null && previousPosition !== undefined;
  const fretMovement = hasPrevious
    ? Math.abs(position.fret - previousPosition.fret)
    : 0;
  const stringMovement = hasPrevious
    ? Math.abs(position.string - previousPosition.string)
    : 0;
  const positionContinuity = hasPrevious
    ? position.fret === previousPosition.fret
    : true;
  const handStability = hasPrevious
    ? fretMovement <= 1
    : true;

  return Object.freeze({
    contractVersion: PEDAGOGICAL_FEATURE_VECTOR_VERSION,
    fretMovement,
    stringMovement,
    positionContinuity,
    openStringUsage: position.fret === 0,
    largeShift: hasPrevious && fretMovement > largeShiftThreshold,
    handStability,
    phraseContinuity: positionContinuity && stringMovement <= 1,
  });
}

module.exports = {
  PEDAGOGICAL_FEATURE_VECTOR_VERSION,
  PedagogicalFeatureVectorError,
  createPedagogicalFeatureVector,
};
