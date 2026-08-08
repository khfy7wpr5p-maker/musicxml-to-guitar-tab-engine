'use strict';

const { EngineError } = require('../errors/engineError');
const {
  MAX_ADMISSION_IDENTIFIER_LENGTH,
  createObservationAdmissionRecord,
} = require('./observationAdmission');

const OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION = '1.0.0';
const SNAPSHOT_DOCUMENT_TYPE = 'ObservationAdmissionSnapshot';
const COMMIT_RESULT_DOCUMENT_TYPE = 'ObservationAdmissionCommitResult';
const ATOMIC_COMMIT_DOCUMENT_TYPE = 'ObservationAdmissionAtomicCommit';
const EXPECTED_INPUT_FIELDS = Object.freeze([
  'admissionDomainId',
  'admissionId',
  'observation',
  'observationDigest',
  'observationId',
  'producerId',
  'producerRevisionId',
  'runId',
]);
const EXPECTED_SNAPSHOT_FIELDS = Object.freeze([
  'admissionDomainId',
  'admissions',
  'contractVersion',
  'documentType',
  'revisionToken',
]);
const EXPECTED_COMMIT_RESULT_FIELDS = Object.freeze([
  'admissionDomainId',
  'contractVersion',
  'documentType',
  'revisionToken',
  'status',
]);

class ObservationAdmissionAtomicAdapterError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_OBSERVATION_ADMISSION_ATOMIC_ADAPTER',
      details,
      'ObservationAdmissionAtomicAdapterError',
    );
  }
}

class ObservationAdmissionConflictError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'OBSERVATION_ADMISSION_CONFLICT',
      details,
      'ObservationAdmissionConflictError',
    );
  }
}

class ObservationAdmissionCommitOutcomeUnknownError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'OBSERVATION_ADMISSION_COMMIT_OUTCOME_UNKNOWN',
      details,
      'ObservationAdmissionCommitOutcomeUnknownError',
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
      throw new ObservationAdmissionAtomicAdapterError(
        `${field} must not contain symbol properties.`,
        { field },
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ObservationAdmissionAtomicAdapterError(
        `${field} must contain only enumerable data properties.`,
        { field, key },
      );
    }
    keys.push(key);
  }
  return keys.sort();
}

function assertExactKeys(value, expectedFields, field) {
  if (!isPlainObject(value)) {
    throw new ObservationAdmissionAtomicAdapterError(`${field} must be a plain object.`, { field });
  }
  const fields = ownEnumerableDataKeys(value, field);
  const expected = [...expectedFields].sort();
  if (fields.length !== expected.length || fields.some((key, index) => key !== expected[index])) {
    throw new ObservationAdmissionAtomicAdapterError(
      `${field} contains unsupported or missing fields.`,
      { field, fields },
    );
  }
  return value;
}

function assertBoundedIdentifier(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ADMISSION_IDENTIFIER_LENGTH
  ) {
    throw new ObservationAdmissionAtomicAdapterError(
      `${field} must be a non-empty bounded string.`,
      { field, maximumLength: MAX_ADMISSION_IDENTIFIER_LENGTH },
    );
  }
  return value;
}

function validateStore(store) {
  if (store === null || (typeof store !== 'object' && typeof store !== 'function')) {
    throw new ObservationAdmissionAtomicAdapterError('Atomic admission store must be an object.');
  }
  if (store.contractVersion !== OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION) {
    throw new ObservationAdmissionAtomicAdapterError(
      'Atomic admission store contractVersion is not supported.',
      {
        expectedContractVersion: OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION,
        actualContractVersion: store.contractVersion ?? null,
      },
    );
  }
  if (typeof store.readAdmissionDomainSnapshot !== 'function') {
    throw new ObservationAdmissionAtomicAdapterError(
      'Atomic admission store must implement readAdmissionDomainSnapshot().',
    );
  }
  if (typeof store.compareAndCommitAdmission !== 'function') {
    throw new ObservationAdmissionAtomicAdapterError(
      'Atomic admission store must implement compareAndCommitAdmission().',
    );
  }
  return store;
}

function validateAtomicInput(input) {
  assertExactKeys(input, EXPECTED_INPUT_FIELDS, 'input');
  for (const field of [
    'admissionDomainId',
    'admissionId',
    'observationId',
    'producerId',
    'producerRevisionId',
    'runId',
  ]) {
    assertBoundedIdentifier(input[field], field);
  }
  return input;
}

function validateSnapshot(snapshot, admissionDomainId) {
  assertExactKeys(snapshot, EXPECTED_SNAPSHOT_FIELDS, 'snapshot');
  if (snapshot.documentType !== SNAPSHOT_DOCUMENT_TYPE) {
    throw new ObservationAdmissionAtomicAdapterError('snapshot documentType is not supported.');
  }
  if (snapshot.contractVersion !== OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION) {
    throw new ObservationAdmissionAtomicAdapterError('snapshot contractVersion is not supported.');
  }
  assertBoundedIdentifier(snapshot.admissionDomainId, 'snapshot.admissionDomainId');
  assertBoundedIdentifier(snapshot.revisionToken, 'snapshot.revisionToken');
  if (snapshot.admissionDomainId !== admissionDomainId) {
    throw new ObservationAdmissionAtomicAdapterError(
      'snapshot admissionDomainId does not match the requested admission domain.',
      {
        expectedAdmissionDomainId: admissionDomainId,
        actualAdmissionDomainId: snapshot.admissionDomainId,
      },
    );
  }
  if (!Array.isArray(snapshot.admissions)) {
    throw new ObservationAdmissionAtomicAdapterError('snapshot admissions must be an array.');
  }
  return snapshot;
}

function validateCommitResult(result, admissionDomainId) {
  assertExactKeys(result, EXPECTED_COMMIT_RESULT_FIELDS, 'commitResult');
  if (result.documentType !== COMMIT_RESULT_DOCUMENT_TYPE) {
    throw new ObservationAdmissionAtomicAdapterError('commitResult documentType is not supported.');
  }
  if (result.contractVersion !== OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION) {
    throw new ObservationAdmissionAtomicAdapterError('commitResult contractVersion is not supported.');
  }
  assertBoundedIdentifier(result.admissionDomainId, 'commitResult.admissionDomainId');
  assertBoundedIdentifier(result.revisionToken, 'commitResult.revisionToken');
  if (result.admissionDomainId !== admissionDomainId) {
    throw new ObservationAdmissionAtomicAdapterError(
      'commitResult admissionDomainId does not match the requested admission domain.',
    );
  }
  if (result.status !== 'committed' && result.status !== 'conflict') {
    throw new ObservationAdmissionAtomicAdapterError(
      'commitResult status must be committed or conflict.',
      { status: result.status ?? null },
    );
  }
  return result;
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

function commitOutcomeUnknown(message, error = null) {
  return new ObservationAdmissionCommitOutcomeUnknownError(message, {
    storeErrorName: error && typeof error.name === 'string' ? error.name : null,
  });
}

async function commitObservationAdmissionAtomically(store, input) {
  validateStore(store);
  validateAtomicInput(input);

  const admissionDomainId = input.admissionDomainId;
  let snapshot;
  try {
    snapshot = await store.readAdmissionDomainSnapshot(admissionDomainId);
  } catch (error) {
    throw new ObservationAdmissionAtomicAdapterError(
      'Atomic admission store failed while reading the authoritative domain snapshot.',
      {
        phase: 'read',
        storeErrorName: error && typeof error.name === 'string' ? error.name : null,
      },
    );
  }
  validateSnapshot(snapshot, admissionDomainId);

  const record = createObservationAdmissionRecord({
    ...input,
    existingAdmissions: snapshot.admissions,
  });

  let commitResult;
  try {
    commitResult = await store.compareAndCommitAdmission({
      admissionDomainId,
      expectedRevisionToken: snapshot.revisionToken,
      record,
    });
  } catch (error) {
    throw commitOutcomeUnknown(
      'Atomic admission store failed after compare-and-commit began; commit outcome is unknown.',
      error,
    );
  }

  try {
    validateCommitResult(commitResult, admissionDomainId);
  } catch (error) {
    throw commitOutcomeUnknown(
      'Atomic admission store returned an invalid post-commit result; commit outcome is unknown.',
      error,
    );
  }

  if (commitResult.revisionToken === snapshot.revisionToken) {
    throw commitOutcomeUnknown(
      'Atomic admission store did not advance the revision token; commit outcome is unknown.',
    );
  }

  if (commitResult.status === 'conflict') {
    throw new ObservationAdmissionConflictError(
      'Admission domain changed after the authoritative snapshot was read; no admission was committed by this compare-and-commit attempt.',
      {
        admissionDomainId,
        expectedRevisionToken: snapshot.revisionToken,
        currentRevisionToken: commitResult.revisionToken,
      },
    );
  }

  return deepFreeze({
    documentType: ATOMIC_COMMIT_DOCUMENT_TYPE,
    contractVersion: OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION,
    admissionDomainId,
    previousRevisionToken: snapshot.revisionToken,
    committedRevisionToken: commitResult.revisionToken,
    record,
  });
}

module.exports = {
  OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION,
  ObservationAdmissionAtomicAdapterError,
  ObservationAdmissionConflictError,
  ObservationAdmissionCommitOutcomeUnknownError,
  commitObservationAdmissionAtomically,
};
