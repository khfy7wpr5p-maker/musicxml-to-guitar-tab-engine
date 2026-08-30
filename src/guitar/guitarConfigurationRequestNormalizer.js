'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { pitchNameToMidi } = require('../music/pitch');
const {
  GUITAR_STRING_COUNT,
  createGuitarConfiguration,
} = require('./tuning');

class GuitarConfigurationRequestError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_GUITAR_CONFIGURATION_REQUEST',
      Object.freeze({ ...details }),
      'GuitarConfigurationRequestError',
    );
  }
}

function invalid(message, details = {}) {
  return new GuitarConfigurationRequestError(message, details);
}

function plainObjectDataDescriptors(value, allowed, path) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw invalid(`${path} must be a non-proxy plain object.`, { path });
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalid(`${path} contains an unknown field.`, {
        path,
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${path} fields must be enumerable data properties.`, { path, field: key });
    }
  }
  return descriptors;
}

function nativeDenseArray(value, path) {
  if (
    !Array.isArray(value)
    || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw invalid(`${path} must be a native non-proxy array.`, { path });
  }
  for (const key of Reflect.ownKeys(value)) {
    if (
      key !== 'length'
      && (
        typeof key !== 'string'
        || !/^(?:0|[1-9]\d*)$/.test(key)
        || Number(key) >= value.length
      )
    ) {
      throw invalid(`${path} contains an invalid array property.`, {
        path,
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw invalid(`${path} must be dense.`, { path, index });
    }
  }
  return value;
}

function validatePhysicalTuningOrder(tuning) {
  for (let index = 0; index < tuning.length - 1; index += 1) {
    const higherString = tuning[index];
    const lowerString = tuning[index + 1];
    if (higherString.midi <= lowerString.midi) {
      throw invalid('Requested string pitches must descend strictly from string 1 through 6.', {
        higherString: higherString.number,
        higherMidi: higherString.midi,
        lowerString: lowerString.number,
        lowerMidi: lowerString.midi,
      });
    }
    if (higherString.midi - lowerString.midi > 12) {
      throw invalid('Requested adjacent open-string interval exceeds the bounded production profile.', {
        higherString: higherString.number,
        lowerString: lowerString.number,
        interval: higherString.midi - lowerString.midi,
      });
    }
  }
}

function normalizeTuningRequest(value) {
  const tuning = nativeDenseArray(value, 'guitar.tuning');
  if (tuning.length !== GUITAR_STRING_COUNT) {
    throw invalid(`guitar.tuning must define exactly ${GUITAR_STRING_COUNT} strings.`, {
      observed: tuning.length,
    });
  }

  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < tuning.length; index += 1) {
    const path = `guitar.tuning[${index}]`;
    const descriptors = plainObjectDataDescriptors(
      tuning[index],
      new Set(['string', 'pitch']),
      path,
    );
    if (!Object.hasOwn(descriptors, 'string') || !Object.hasOwn(descriptors, 'pitch')) {
      throw invalid(`${path} must contain string and pitch.`, { path });
    }
    const string = descriptors.string.value;
    if (!Number.isInteger(string) || string < 1 || string > GUITAR_STRING_COUNT) {
      throw invalid(`${path}.string must be an integer from 1 to 6.`, { path, string });
    }
    if (seen.has(string)) {
      throw invalid('guitar.tuning string numbers must be unique.', { path, string });
    }
    seen.add(string);
    if (string !== index + 1) {
      throw invalid('guitar.tuning must be ordered explicitly from string 1 through 6.', {
        path,
        expectedString: index + 1,
        observedString: string,
      });
    }

    const pitch = descriptors.pitch.value;
    if (typeof pitch !== 'string' || pitch.length === 0 || pitch.length > 8 || pitch !== pitch.trim()) {
      throw invalid(`${path}.pitch must be a bounded scientific pitch name without padding.`, {
        path,
      });
    }
    let midi;
    try {
      midi = pitchNameToMidi(pitch);
    } catch {
      throw invalid(`${path}.pitch must be a valid scientific pitch name.`, { path, pitch });
    }
    normalized.push({ number: string, pitch, midi });
  }
  validatePhysicalTuningOrder(normalized);
  return normalized;
}

function normalizeGuitarConfigurationRequest(value) {
  if (value === undefined || value === null) return null;
  const descriptors = plainObjectDataDescriptors(
    value,
    new Set(['capoFret', 'tuning']),
    'guitar',
  );
  if (!Object.hasOwn(descriptors, 'capoFret') || !Object.hasOwn(descriptors, 'tuning')) {
    throw invalid('Explicit guitar configuration must contain capoFret and a complete tuning.', {
      missingCapoFret: !Object.hasOwn(descriptors, 'capoFret'),
      missingTuning: !Object.hasOwn(descriptors, 'tuning'),
    });
  }
  const tuning = normalizeTuningRequest(descriptors.tuning.value);
  try {
    return createGuitarConfiguration({
      tuning,
      capoFret: descriptors.capoFret.value,
    });
  } catch (error) {
    throw invalid('Explicit guitar configuration is invalid.', {
      causeCode: error?.code || null,
      causeMessage: error instanceof Error ? error.message : null,
    });
  }
}

module.exports = {
  GuitarConfigurationRequestError,
  normalizeGuitarConfigurationRequest,
};
