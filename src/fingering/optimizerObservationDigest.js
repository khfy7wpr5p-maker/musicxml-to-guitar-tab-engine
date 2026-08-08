'use strict';

const { createHash } = require('node:crypto');
const {
  OPTIMIZER_OBSERVATION_VERSION,
  OptimizerObservationError,
  validateOptimizerObservation,
} = require('./optimizerObservation');

const OPTIMIZER_OBSERVATION_DIGEST_VERSION = '1.0.0';
const OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM = 'sha256';
const MAX_DIGEST_CANONICAL_DEPTH = 128;
const DIGEST_DOMAIN = [
  'musicxml-to-guitar-tab-engine',
  'OptimizerObservation',
  OPTIMIZER_OBSERVATION_VERSION,
  'content-digest',
  OPTIMIZER_OBSERVATION_DIGEST_VERSION,
].join('\u0000');

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function digestError(message, details = {}) {
  return new OptimizerObservationError(message, {
    digestContractVersion: OPTIMIZER_OBSERVATION_DIGEST_VERSION,
    digestAlgorithm: OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM,
    ...details,
  });
}

function writeCanonicalJson(hash, value, seen = new WeakSet(), depth = 0) {
  if (depth > MAX_DIGEST_CANONICAL_DEPTH) {
    throw digestError('OptimizerObservation digest input exceeds the canonical depth limit.', {
      maximumDepth: MAX_DIGEST_CANONICAL_DEPTH,
    });
  }

  if (value === null) {
    hash.update('null');
    return;
  }

  const valueType = typeof value;
  if (valueType === 'string') {
    hash.update(JSON.stringify(value));
    return;
  }
  if (valueType === 'boolean') {
    hash.update(value ? 'true' : 'false');
    return;
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw digestError('OptimizerObservation digest input must not contain non-finite numbers.');
    }
    hash.update(JSON.stringify(value));
    return;
  }
  if (valueType !== 'object') {
    throw digestError('OptimizerObservation digest input must contain only canonical JSON values.', {
      valueType,
    });
  }

  if (seen.has(value)) {
    throw digestError('OptimizerObservation digest input must not contain cycles.');
  }
  seen.add(value);

  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw digestError('OptimizerObservation digest arrays must not contain symbol properties.');
    }
    for (const key of Object.keys(value)) {
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw digestError('OptimizerObservation digest arrays must not contain custom properties.', {
          key,
        });
      }
    }

    hash.update('[');
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw digestError('OptimizerObservation digest arrays must be dense.', { index });
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw digestError('OptimizerObservation digest arrays must not contain accessors.', {
          index,
        });
      }
      if (index > 0) hash.update(',');
      writeCanonicalJson(hash, descriptor.value, seen, depth + 1);
    }
    hash.update(']');
    seen.delete(value);
    return;
  }

  if (!isPlainObject(value)) {
    throw digestError('OptimizerObservation digest objects must be plain objects.');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw digestError('OptimizerObservation digest objects must not contain symbol properties.');
  }

  const keys = Object.keys(value).sort();
  hash.update('{');
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw digestError('OptimizerObservation digest objects must not contain accessors.', {
        key,
      });
    }
    if (index > 0) hash.update(',');
    hash.update(JSON.stringify(key));
    hash.update(':');
    writeCanonicalJson(hash, descriptor.value, seen, depth + 1);
  }
  hash.update('}');
  seen.delete(value);
}

function validateOptimizerObservationDigest(digest) {
  if (!isPlainObject(digest)) {
    throw digestError('observationDigest must be a plain object.');
  }
  if (Object.getOwnPropertySymbols(digest).length > 0) {
    throw digestError('observationDigest must not contain symbol properties.');
  }

  const keys = Object.keys(digest).sort();
  const expectedKeys = ['algorithm', 'contractVersion', 'value'];
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw digestError('observationDigest must contain exactly contractVersion, algorithm, and value.');
  }
  if (digest.contractVersion !== OPTIMIZER_OBSERVATION_DIGEST_VERSION) {
    throw digestError('observationDigest.contractVersion is not supported.', {
      actualContractVersion: digest.contractVersion,
    });
  }
  if (digest.algorithm !== OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM) {
    throw digestError('observationDigest.algorithm is not supported.', {
      actualAlgorithm: digest.algorithm,
    });
  }
  if (typeof digest.value !== 'string' || !/^[0-9a-f]{64}$/.test(digest.value)) {
    throw digestError('observationDigest.value must be a lowercase SHA-256 hex digest.');
  }

  return digest;
}

function createOptimizerObservationDigest(observation) {
  validateOptimizerObservation(observation);

  const hash = createHash(OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM);
  hash.update(DIGEST_DOMAIN, 'utf8');
  hash.update('\u0000');
  writeCanonicalJson(hash, observation);

  return Object.freeze({
    contractVersion: OPTIMIZER_OBSERVATION_DIGEST_VERSION,
    algorithm: OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM,
    value: hash.digest('hex'),
  });
}

function verifyOptimizerObservationDigest(observation, expectedDigest) {
  validateOptimizerObservationDigest(expectedDigest);
  const actualDigest = createOptimizerObservationDigest(observation);
  if (
    actualDigest.contractVersion !== expectedDigest.contractVersion
    || actualDigest.algorithm !== expectedDigest.algorithm
    || actualDigest.value !== expectedDigest.value
  ) {
    throw digestError('OptimizerObservation content digest does not match the supplied observation.', {
      expectedDigest: expectedDigest.value,
      actualDigest: actualDigest.value,
    });
  }
  return actualDigest;
}

module.exports = {
  OPTIMIZER_OBSERVATION_DIGEST_VERSION,
  OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM,
  MAX_DIGEST_CANONICAL_DEPTH,
  createOptimizerObservationDigest,
  validateOptimizerObservationDigest,
  verifyOptimizerObservationDigest,
};
