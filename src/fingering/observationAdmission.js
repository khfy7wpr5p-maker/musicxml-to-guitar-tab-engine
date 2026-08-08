'use strict';

const { EngineError } = require('../errors/engineError');
const {
  OPTIMIZER_OBSERVATION_VERSION,
} = require('./optimizerObservation');
const {
  OPTIMIZER_OBSERVATION_DIGEST_VERSION,
  validateOptimizerObservationDigest,
  verifyOptimizerObservationDigest,
} = require('./optimizerObservationDigest');
const {
  CANONICAL_FINGERING_CANDIDATES_VERSION,
} = require('./candidateLayerBuilder');
const {
  FINGERING_OPTIMIZER_VERSION,
} = require('./fingeringOptimizer');
const {
  GUITAR_CONFIGURATION_VERSION,
} = require('../guitar/tuning');
const packageMetadata = require('../../package.json');

const OBSERVATION_ADMISSION_CONTRACT_VERSION = '1.0.0';
const MAX_ADMISSION_IDENTIFIER_LENGTH = 512;
const EXPECTED_RECORD_FIELDS = Object.freeze([
  'admissionDomainId',
  'admissionId',
  'candidateContractVersion',
  'contractVersion',
  'documentType',
  'guitarConfigurationVersion',
  'observationDigest',
  'observationId',
  'optimizer',
  'optimizerObservationDigestVersion',
  'optimizerObservationVersion',
  'producer',
]);
const EXPECTED_PRODUCER_FIELDS = Object.freeze([
  'packageName',
  'packageVersion',
  'producerId',
  'runId',
]);
const EXPECTED_OPTIMIZER_FIELDS = Object.freeze(['name', 'version']);
const ALLOWED_INPUT_FIELDS = new Set([
  'admissionId',
  'admissionDomainId',
  'producerId',
  'runId',
  'observationId',
  'observation',
  'observationDigest',
  'existingAdmissions',
]);

class ObservationAdmissionError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_OBSERVATION_ADMISSION',
      details,
      'ObservationAdmissionError',
    );
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownEnumerableDataKeys(value, field) {
  const ownKeys = Reflect.ownKeys(value);
  const keys = [];
  for (const key of ownKeys) {
    if (typeof key !== 'string') {
      throw new ObservationAdmissionError(`${field} must not contain symbol properties.`, { field });
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ObservationAdmissionError(
        `${field} must contain only enumerable data properties.`,
        { field, key },
      );
    }
    keys.push(key);
  }
  return keys.sort();
}

function assertExactKeys(value, expectedKeys, field) {
  if (!isPlainObject(value)) {
    throw new ObservationAdmissionError(`${field} must be a plain object.`, { field });
  }
  const keys = ownEnumerableDataKeys(value, field);
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ObservationAdmissionError(`${field} contains unsupported or missing fields.`, {
      field,
      fields: keys,
    });
  }
  return value;
}

function assertBoundedIdentifier(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ADMISSION_IDENTIFIER_LENGTH
  ) {
    throw new ObservationAdmissionError(`${field} must be a non-empty bounded opaque string.`, {
      field,
      maximumLength: MAX_ADMISSION_IDENTIFIER_LENGTH,
    });
  }
  return value;
}

function assertDenseHistory(history) {
  if (!Array.isArray(history)) {
    throw new ObservationAdmissionError('existingAdmissions must be an explicit dense array.');
  }
  for (const key of Reflect.ownKeys(history)) {
    if (typeof key !== 'string') {
      throw new ObservationAdmissionError('existingAdmissions must not contain symbol properties.');
    }
    if (key === 'length') continue;
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= history.length) {
      throw new ObservationAdmissionError('existingAdmissions must not contain custom properties.', {
        key,
      });
    }
    const descriptor = Object.getOwnPropertyDescriptor(history, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ObservationAdmissionError(
        'existingAdmissions must contain only enumerable data elements.',
        { key },
      );
    }
  }
  for (let index = 0; index < history.length; index += 1) {
    if (!Object.hasOwn(history, index)) {
      throw new ObservationAdmissionError('existingAdmissions must be dense.', { index });
    }
  }
  return history;
}

function assertCurrentProducer(producer) {
  assertExactKeys(producer, EXPECTED_PRODUCER_FIELDS, 'existingAdmission.producer');
  assertBoundedIdentifier(producer.producerId, 'existingAdmission.producer.producerId');
  assertBoundedIdentifier(producer.runId, 'existingAdmission.producer.runId');
  if (
    producer.packageName !== packageMetadata.name
    || producer.packageVersion !== packageMetadata.version
  ) {
    throw new ObservationAdmissionError(
      'existing admission producer package metadata is not supported by this contract.',
    );
  }
  return producer;
}

function assertCurrentOptimizer(optimizer) {
  assertExactKeys(optimizer, EXPECTED_OPTIMIZER_FIELDS, 'existingAdmission.optimizer');
  if (
    optimizer.name !== 'deterministic-dynamic-programming'
    || optimizer.version !== FINGERING_OPTIMIZER_VERSION
  ) {
    throw new ObservationAdmissionError(
      'existing admission optimizer metadata is not supported by this contract.',
    );
  }
  return optimizer;
}

function validateObservationAdmissionRecord(record, expectedDomainId = null) {
  assertExactKeys(record, EXPECTED_RECORD_FIELDS, 'existingAdmission');
  if (record.documentType !== 'ObservationAdmission') {
    throw new ObservationAdmissionError('existing admission documentType is not supported.');
  }
  if (record.contractVersion !== OBSERVATION_ADMISSION_CONTRACT_VERSION) {
    throw new ObservationAdmissionError('existing admission contractVersion is not supported.');
  }
  assertBoundedIdentifier(record.admissionId, 'existingAdmission.admissionId');
  assertBoundedIdentifier(record.admissionDomainId, 'existingAdmission.admissionDomainId');
  assertBoundedIdentifier(record.observationId, 'existingAdmission.observationId');
  if (expectedDomainId !== null && record.admissionDomainId !== expectedDomainId) {
    throw new ObservationAdmissionError(
      'existingAdmissions must contain only records from the requested admission domain.',
      { expectedDomainId, actualDomainId: record.admissionDomainId },
    );
  }

  try {
    validateOptimizerObservationDigest(record.observationDigest);
  } catch (error) {
    throw new ObservationAdmissionError('existing admission contains an invalid observation digest.', {
      observationErrorCode: error?.code ?? null,
    });
  }
  assertCurrentProducer(record.producer);
  assertCurrentOptimizer(record.optimizer);

  if (record.optimizerObservationVersion !== OPTIMIZER_OBSERVATION_VERSION) {
    throw new ObservationAdmissionError('existing admission observation version is not supported.');
  }
  if (record.optimizerObservationDigestVersion !== OPTIMIZER_OBSERVATION_DIGEST_VERSION) {
    throw new ObservationAdmissionError('existing admission digest version is not supported.');
  }
  if (record.candidateContractVersion !== CANONICAL_FINGERING_CANDIDATES_VERSION) {
    throw new ObservationAdmissionError('existing admission candidate contract is not supported.');
  }
  if (record.guitarConfigurationVersion !== GUITAR_CONFIGURATION_VERSION) {
    throw new ObservationAdmissionError('existing admission guitar configuration is not supported.');
  }

  return record;
}

function assertAllowedInput(input) {
  if (!isPlainObject(input)) {
    throw new ObservationAdmissionError('Observation admission input must be a plain object.');
  }
  const keys = ownEnumerableDataKeys(input, 'input');
  for (const field of keys) {
    if (!ALLOWED_INPUT_FIELDS.has(field)) {
      throw new ObservationAdmissionError('Observation admission input contains an unsupported field.', {
        field,
      });
    }
  }
  return input;
}

function sameDigest(left, right) {
  return (
    left.contractVersion === right.contractVersion
    && left.algorithm === right.algorithm
    && left.value === right.value
  );
}

function deepFreeze(value) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || Object.isFrozen(current)) continue;
    Object.freeze(current);
    for (const nested of Object.values(current)) pending.push(nested);
  }
  return value;
}

function createObservationAdmissionRecord(input) {
  assertAllowedInput(input);

  const admissionId = assertBoundedIdentifier(input.admissionId, 'admissionId');
  const admissionDomainId = assertBoundedIdentifier(
    input.admissionDomainId,
    'admissionDomainId',
  );
  const producerId = assertBoundedIdentifier(input.producerId, 'producerId');
  const runId = assertBoundedIdentifier(input.runId, 'runId');
  const observationId = assertBoundedIdentifier(input.observationId, 'observationId');
  const existingAdmissions = assertDenseHistory(input.existingAdmissions);

  let verifiedDigest;
  try {
    verifiedDigest = verifyOptimizerObservationDigest(
      input.observation,
      input.observationDigest,
    );
  } catch (error) {
    throw new ObservationAdmissionError(
      'observationDigest must be valid and match the complete supplied observation.',
      { observationErrorCode: error?.code ?? null },
    );
  }

  for (let index = 0; index < existingAdmissions.length; index += 1) {
    const existing = validateObservationAdmissionRecord(
      existingAdmissions[index],
      admissionDomainId,
    );

    if (existing.admissionId === admissionId) {
      throw new ObservationAdmissionError('admissionId is already present in the admission domain.', {
        admissionId,
      });
    }

    if (existing.observationId === observationId) {
      if (sameDigest(existing.observationDigest, verifiedDigest)) {
        throw new ObservationAdmissionError('Observation replay: this observation is already admitted.', {
          observationId,
        });
      }
      throw new ObservationAdmissionError(
        'Observation identity collision: observationId is already bound to different content.',
        { observationId },
      );
    }

    if (
      existing.producer.producerId === producerId
      && existing.producer.runId === runId
    ) {
      if (sameDigest(existing.observationDigest, verifiedDigest)) {
        throw new ObservationAdmissionError(
          'Producer run replay: this producer/run content is already admitted.',
          { producerId, runId },
        );
      }
      throw new ObservationAdmissionError(
        'Producer run collision: producerId and runId are already bound to different content.',
        { producerId, runId },
      );
    }

    if (sameDigest(existing.observationDigest, verifiedDigest)) {
      throw new ObservationAdmissionError(
        'Duplicate observation content is already admitted under another observation identity.',
        { observationId, existingObservationId: existing.observationId },
      );
    }
  }

  return deepFreeze({
    documentType: 'ObservationAdmission',
    contractVersion: OBSERVATION_ADMISSION_CONTRACT_VERSION,
    admissionId,
    admissionDomainId,
    observationId,
    observationDigest: { ...verifiedDigest },
    producer: {
      producerId,
      runId,
      packageName: packageMetadata.name,
      packageVersion: packageMetadata.version,
    },
    optimizerObservationVersion: input.observation.contractVersion,
    optimizerObservationDigestVersion: verifiedDigest.contractVersion,
    candidateContractVersion: input.observation.candidateContractVersion,
    optimizer: { ...input.observation.optimizer },
    guitarConfigurationVersion: input.observation.guitarConfiguration.contractVersion,
  });
}

module.exports = {
  OBSERVATION_ADMISSION_CONTRACT_VERSION,
  MAX_ADMISSION_IDENTIFIER_LENGTH,
  ObservationAdmissionError,
  validateObservationAdmissionRecord,
  createObservationAdmissionRecord,
};
