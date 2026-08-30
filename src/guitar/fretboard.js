'use strict';

const { EngineError } = require('../errors/engineError');
const {
  STANDARD_TUNING,
  GUITAR_FRET_SEMANTICS,
  createGuitarConfiguration,
} = require('./tuning');

class FretboardError extends EngineError {
  constructor(message, code = 'INVALID_FRETBOARD_INPUT', details = {}) {
    super(message, code, details, 'FretboardError');
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

function normalizeConfigurationInput(value = STANDARD_TUNING) {
  if (Array.isArray(value)) return createGuitarConfiguration({ tuning: value });
  if (!value || typeof value !== 'object') {
    throw new FretboardError(
      'Fretboard configuration must be a tuning array or GuitarConfiguration options object.',
      'INVALID_FRETBOARD_INPUT',
    );
  }
  return createGuitarConfiguration(value);
}

function relativeFretToAbsoluteFret(relativeFret, configuration) {
  if (!Number.isInteger(relativeFret) || relativeFret < 0) {
    throw new FretboardError(
      'Relative fret must be a non-negative integer.',
      'INVALID_POSITION',
      { relativeFret },
    );
  }
  const normalized = normalizeConfigurationInput(configuration);
  return normalized.capoFret + relativeFret;
}

function getPositionCandidates(midi, options = {}) {
  validateMidi(midi);
  const configuration = createGuitarConfiguration(options);

  return configuration.tuning
    .map((stringDefinition) => {
      const fret = midi - stringDefinition.midi - configuration.capoFret;
      return {
        string: stringDefinition.number,
        fret,
        absoluteFret: configuration.capoFret + fret,
      };
    })
    .filter(
      (position) =>
        position.fret >= 0
        && position.absoluteFret >= configuration.minimumFret
        && position.absoluteFret <= configuration.maximumFret,
    )
    .map(({ string, fret }) => ({ string, fret }));
}

function positionToMidi(position, configurationOrTuning = STANDARD_TUNING) {
  if (!position || !Number.isInteger(position.string) || !Number.isInteger(position.fret)) {
    throw new FretboardError('Position must contain integer string and fret values.', 'INVALID_POSITION', {
      position,
    });
  }

  const configuration = normalizeConfigurationInput(configurationOrTuning);
  if (configuration.fretSemantics !== GUITAR_FRET_SEMANTICS) {
    throw new FretboardError(
      'Unsupported fret semantics.',
      'INVALID_FRETBOARD_INPUT',
      { fretSemantics: configuration.fretSemantics },
    );
  }
  const stringDefinition = configuration.tuning.find((entry) => entry.number === position.string);

  if (!stringDefinition) {
    throw new FretboardError('Position contains an unknown string number.', 'INVALID_POSITION', {
      position,
    });
  }

  if (position.fret < 0) {
    throw new FretboardError('Fret cannot be negative.', 'INVALID_POSITION', { position });
  }

  const midi = stringDefinition.midi + configuration.capoFret + position.fret;
  validateMidi(midi);
  return midi;
}

module.exports = {
  FretboardError,
  validateMidi,
  relativeFretToAbsoluteFret,
  getPositionCandidates,
  positionToMidi,
};
