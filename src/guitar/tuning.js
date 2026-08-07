'use strict';

const { EngineError } = require('../errors/engineError');

const STANDARD_TUNING = Object.freeze([
  Object.freeze({ number: 6, pitch: 'E2', midi: 40 }),
  Object.freeze({ number: 5, pitch: 'A2', midi: 45 }),
  Object.freeze({ number: 4, pitch: 'D3', midi: 50 }),
  Object.freeze({ number: 3, pitch: 'G3', midi: 55 }),
  Object.freeze({ number: 2, pitch: 'B3', midi: 59 }),
  Object.freeze({ number: 1, pitch: 'E4', midi: 64 }),
]);

const DEFAULT_FRET_RANGE = Object.freeze({
  minimumFret: 0,
  maximumFret: 20,
});

class GuitarConfigurationError extends EngineError {
  constructor(message, details = {}) {
    super(message, 'INVALID_GUITAR_CONFIGURATION', details, 'GuitarConfigurationError');
  }
}

function validateFretRange({ minimumFret = 0, maximumFret = 20 } = {}) {
  if (!Number.isInteger(minimumFret) || !Number.isInteger(maximumFret)) {
    throw new GuitarConfigurationError('Fret limits must be integers.', {
      minimumFret,
      maximumFret,
    });
  }

  if (minimumFret < 0 || maximumFret < 0) {
    throw new GuitarConfigurationError('Fret limits cannot be negative.', {
      minimumFret,
      maximumFret,
    });
  }

  if (minimumFret > maximumFret) {
    throw new GuitarConfigurationError('Minimum fret cannot exceed maximum fret.', {
      minimumFret,
      maximumFret,
    });
  }

  return { minimumFret, maximumFret };
}

function validateTuning(tuning = STANDARD_TUNING) {
  if (!Array.isArray(tuning) || tuning.length !== 6) {
    throw new GuitarConfigurationError('A six-string tuning must define exactly six strings.');
  }

  const seenNumbers = new Set();

  const normalized = tuning.map((entry) => {
    if (!entry || !Number.isInteger(entry.number) || entry.number < 1 || entry.number > 6) {
      throw new GuitarConfigurationError('String number must be an integer from 1 to 6.', {
        entry,
      });
    }

    if (seenNumbers.has(entry.number)) {
      throw new GuitarConfigurationError('String numbers must be unique.', {
        string: entry.number,
      });
    }
    seenNumbers.add(entry.number);

    if (!Number.isInteger(entry.midi) || entry.midi < 0 || entry.midi > 127) {
      throw new GuitarConfigurationError('Open-string MIDI values must be integers from 0 to 127.', {
        entry,
      });
    }

    return {
      number: entry.number,
      pitch: typeof entry.pitch === 'string' ? entry.pitch : null,
      midi: entry.midi,
    };
  });

  normalized.sort((a, b) => a.number - b.number);
  return normalized;
}

function createGuitarConfiguration(options = {}) {
  const range = validateFretRange(options);
  const tuning = validateTuning(options.tuning || STANDARD_TUNING);

  return Object.freeze({
    tuning: Object.freeze(tuning.map((entry) => Object.freeze(entry))),
    minimumFret: range.minimumFret,
    maximumFret: range.maximumFret,
  });
}

module.exports = {
  STANDARD_TUNING,
  DEFAULT_FRET_RANGE,
  GuitarConfigurationError,
  validateFretRange,
  validateTuning,
  createGuitarConfiguration,
};
