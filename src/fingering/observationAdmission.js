'use strict';

const { EngineError } = require('../errors/engineError');
const {
  validateOptimizerObservationDigest,
  verifyOptimizerObservationDigest,
} = require('./optimizerObservationDigest');
const packageMetadata = require('../../package.json');

const OBSERVATION_ADMISSION_CONTRACT_VERSION = '1.0.0';
const MAX_ADMISSION_IDENTIFIER_LENGTH = 512;
const MAX_ADMISSION_METADATA_LENGTH = 512;
const MAX_ADMISSION_HISTORY_ENTRIES = 10000;
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
  'producerRevisionId',
  'runId',
]);
const EXPECTED_OPTIMIZER_FIELDS = Object.freeze(['name', 'version']);
const ALLOWED_INPUT_FIELDS = new Set([
  'admissionId',
  'admissionDomainId',
  'producerId',
  'producerRevisionId',
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

function assertBoundedString(value, field, maximumLength = MAX_ADMISSION_IDENTIFIER_LENGTH) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximumLength
  ) {
    throw new ObservationAdmissionError(`${field} must be a non-empty bounded string.`, {
      field,
      maximumLength,
    });
  }
  return value;
}

function assertBoundedIdentifier(value, field) {
  return assertBoundedString(value, field, MAX_ADMISSION_IDENTIFIER_LENGTH);
}

function assertMetadataString(value, field) {
  return assertBoundedString(value, field, MAX_ADMISSION_METADATA_LENGTH);
}

function assertDenseHistory(history) {
  if (!Array.isArray(history)) {
    throw new ObservationAdmissionError('existingAdmissions must be an explicit dense array.');
  }
  if (history.length > MAX_ADMISSION_HISTORY_ENTRIES) {
    throw new ObservationAdmissionError('Admission history exceeds the configured entry limit.', {
      maximumEntries: MAX_ADMISSION_HISTORY_ENTRIES,
      actualEntries: history.length,
    });
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

function validateHistoricalProducer(producer) {
  assertExactKeys(producer, EXPECTED_PRODUCER_FIELDS, 'existingAdmission.producer');
  assertBoundedIdentifier(producer.producerId, 'existingAdmission.producer.producerId');
  assertBoundedIdentifier(
    producer.producerRevisionId,
    'existingAdmission.producer.producerRevisionId',
  );
  assertBoundedIdentifier(producer.runId, 'existingAdmission.producer.runId');
  if (producer.packageName !== packageMetadata.name) {
    throw new ObservationAdmissionError(
      'existing admission producer packageName does not belong to this engine.',
    );
  }
  assertMetadataString(producer.packageVersion, 'existingAdmission.producer.packageVersion');
  return producer;
}

function validateHistoricalOptimizer(optimizer) {
  assertExactKeys(optimizer, EXPECTED_OPTIMIZER_FIELDS, 'existingAdmission.optimizer');
  assertMetadataString(optimizer.name, 'existingAdmission.optimizer.name');
  assertMetadataString(optimizer.version, 'existingAdmission.optimizer.version');
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
  validateHistoricalProducer(record.producer);
  validateHistoricalOptimizer(record.optimizer);

  assertMetadataString(
    record.optimizerObservationVersion,
    'existingAdmission.optimizerObservationVersion',
  );
  assertMetadataString(
    record.optimizerObservationDigestVersion,
    'existingAdmission.optimizerObservationDigestVersion',
  );
  assertMetadataString(
    record.candidateContractVersion,
    'existingAdmission.candidateContractVersion',
  );
  assertMetadataString(
    record.guitarConfigurationVersion,
    'existingAdmission.guitarConfigurationVersion',
  );
  if (record.optimizerObservationDigestVersion !== record.observationDigest.contractVersion) {
    throw new ObservationAdmissionError(
      'existing admission digest version must match its observationDigest contractVersion.',
    );
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

function digestKey(digest) {
  return JSON.stringify([digest.contractVersion, digest.algorithm, digest.value]);
}

function producerRunKey(producerId, runId) {
  return JSON.stringify([producerId, runId]);
}

function validateAdmissionHistory(history, admissionDomainId) {
  const denseHistory = assertDenseHistory(history);
  const admissionIds = new Set();
  const observations = new Map();
  const producerRuns = new Map();
  const digests = new Map();

  for (let index = 0; index < denseHistory.length; index += 1) {
    const record = validateObservationAdmissionRecord(denseHistory[index], admissionDomainId);
    const recordDigestKey = digestKey(record.observationDigest);
    const recordRunKey = producerRunKey(record.producer.producerId, record.producer.runId);

    if (admissionIds.has(record.admissionId)) {
      throw new ObservationAdmissionError(
        'Admission history contains a duplicate admissionId.',
        { admissionId: record.admissionId, index },
      );
    }
    if (observations.has(record.observationId)) {
      const priorDigestKey = observations.get(record.observationId);
      throw new ObservationAdmissionError(
        priorDigestKey === recordDigestKey
          ? 'Admission history contains an observation replay/duplicate.'
          : 'Admission history contains an observation identity collision.',
        { observationId: record.observationId, index },
      );
    }
    if (producerRuns.has(recordRunKey)) {
      const priorDigestKey = producerRuns.get(recordRunKey);
      throw new ObservationAdmissionError(
        priorDigestKey === recordDigestKey
          ? 'Admission history contains a producer run replay/duplicate.'
          : 'Admission history contains a producer run collision.',
        {
          producerId: record.producer.producerId,
          runId: record.producer.runId,
          index,
        },
      );
    }
    if (digests.has(recordDigestKey)) {
      throw new ObservationAdmissionError(
        'Admission history contains duplicate observation content.',
        {
          observationId: record.observationId,
          existingObservationId: digests.get(recordDigestKey),
          index,
        },
      );
    }

    admissionIds.add(record.admissionId);
    observations.set(record.observationId, recordDigestKey);
    producerRuns.set(recordRunKey, recordDigestKey);
    digests.set(recordDigestKey, record.observationId);
  }

  return {
    admissionIds,
    observations,
    producerRuns,
    digests,
  };
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
  const producerRevisionId = assertBoundedIdentifier(
    input.producerRevisionId,
    'producerRevisionId',
  );
  const runId = assertBoundedIdentifier(input.runId, 'runId');
  const observationId = assertBoundedIdentifier(input.observationId, 'observationId');

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

  const history = validateAdmissionHistory(input.existingAdmissions, admissionDomainId);
  const verifiedDigestKey = digestKey(verifiedDigest);
  const currentRunKey = producerRunKey(producerId, runId);

  if (history.admissionIds.has(admissionId)) {
    throw new ObservationAdmissionError('admissionId is already present in the admission domain.', {
      admissionId,
    });
  }

  if (history.observations.has(observationId)) {
    if (history.observations.get(observationId) === verifiedDigestKey) {
      throw new ObservationAdmissionError('Observation replay: this observation is already admitted.', {
        observationId,
      });
    }
    throw new ObservationAdmissionError(
      'Observation identity collision: observationId is already bound to different content.',
      { observationId },
    );
  }

  if (history.producerRuns.has(currentRunKey)) {
    if (history.producerRuns.get(currentRunKey) === verifiedDigestKey) {
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

  if (history.digests.has(verifiedDigestKey)) {
    throw new ObservationAdmissionError(
      'Duplicate observation content is already admitted under another observation identity.',
      { observationId, existingObservationId: history.digests.get(verifiedDigestKey) },
    );
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
      producerRevisionId,
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
  MAX_ADMISSION_HISTORY_ENTRIES,
  ObservationAdmissionError,
  validateObservationAdmissionRecord,
  createObservationAdmissionRecord,
};
