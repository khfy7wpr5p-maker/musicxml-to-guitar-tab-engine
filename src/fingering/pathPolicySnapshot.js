'use strict';

const { createHash } = require('node:crypto');
const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  FingeringCostError,
  createFingeringCostProfile,
} = require('./costModel');

const FINGERING_PATH_POLICY_SNAPSHOT_VERSION = '1.0.0';
const FINGERING_PATH_POLICY_DIGEST_VERSION = '1.0.0';
const FINGERING_PATH_POLICY_DIGEST_ALGORITHM = 'sha256';

const SNAPSHOT_FIELDS = Object.freeze([
  'documentType',
  'contractVersion',
  'costProfile',
]);

const PROFILE_FIELDS = Object.freeze([
  'maximumFret',
  'fretMovementWeight',
  'stringMovementWeight',
  'largeShiftThreshold',
  'largeShiftWeight',
  'highFretThreshold',
  'highFretWeight',
  'openStringPreferenceWeight',
  'samePositionPreferenceWeight',
  'maximumFretMovement',
  'maximumStringMovement',
]);

const DIGEST_FIELDS = Object.freeze([
  'contractVersion',
  'algorithm',
  'value',
]);

const DIGEST_DOMAIN = [
  'musicxml-to-guitar-tab-engine',
  'FingeringPathPolicySnapshot',
  FINGERING_PATH_POLICY_SNAPSHOT_VERSION,
  'content-digest',
  FINGERING_PATH_POLICY_DIGEST_VERSION,
].join('\u0000');

class FingeringPathPolicySnapshotError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_FINGERING_PATH_POLICY_SNAPSHOT_INPUT',
      details,
      'FingeringPathPolicySnapshotError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new FingeringPathPolicySnapshotError(message, {
    field,
    ...details,
  });
}

function isPlainObject(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
  ) {
    return false;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function inspectOwnDataFields(value, allowedFields, path, requireAll) {
  if (!isPlainObject(value)) {
    throw invalid(`${path} must be a non-proxy plain object.`, path);
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid(`${path} keys could not be inspected safely.`, path);
  }

  const allowed = new Set(allowedFields);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid('Symbol properties are not allowed.', `${path}.symbol`);
    }
    if (!allowed.has(key)) {
      throw invalid('Unknown field is not allowed.', `${path}.${key}`);
    }

    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw invalid('Field descriptor could not be inspected safely.', `${path}.${key}`);
    }
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('Fields must be enumerable own data properties.', `${path}.${key}`);
    }
  }

  if (requireAll) {
    for (const field of allowedFields) {
      if (!Object.hasOwn(value, field)) {
        throw invalid('Required field is missing.', `${path}.${field}`);
      }
    }
  }
}

function getOwnDataValue(value, key, path) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw invalid('Field descriptor could not be inspected safely.', path);
  }
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    throw invalid('Field must be an enumerable own data property.', path);
  }
  return descriptor.value;
}

function rejectNegativeZero(value, path) {
  if (typeof value === 'number' && Object.is(value, -0)) {
    throw invalid('Negative zero is not a canonical path-policy number.', path);
  }
}

function normalizeOverrides(overrides) {
  inspectOwnDataFields(overrides, PROFILE_FIELDS, 'costProfileOverrides', false);

  const normalized = {};
  for (const field of PROFILE_FIELDS) {
    if (!Object.hasOwn(overrides, field)) {
      continue;
    }
    const value = getOwnDataValue(overrides, field, `costProfileOverrides.${field}`);
    rejectNegativeZero(value, `costProfileOverrides.${field}`);
    normalized[field] = value;
  }
  return normalized;
}

function createCanonicalProfile(profile) {
  return {
    maximumFret: profile.maximumFret,
    fretMovementWeight: profile.fretMovementWeight,
    stringMovementWeight: profile.stringMovementWeight,
    largeShiftThreshold: profile.largeShiftThreshold,
    largeShiftWeight: profile.largeShiftWeight,
    highFretThreshold: profile.highFretThreshold,
    highFretWeight: profile.highFretWeight,
    openStringPreferenceWeight: profile.openStringPreferenceWeight,
    samePositionPreferenceWeight: profile.samePositionPreferenceWeight,
    maximumFretMovement: profile.maximumFretMovement,
    maximumStringMovement: profile.maximumStringMovement,
  };
}

function normalizeCompleteProfile(costProfile) {
  inspectOwnDataFields(costProfile, PROFILE_FIELDS, 'snapshot.costProfile', true);

  const supplied = {};
  for (const field of PROFILE_FIELDS) {
    const value = getOwnDataValue(costProfile, field, `snapshot.costProfile.${field}`);
    rejectNegativeZero(value, `snapshot.costProfile.${field}`);
    supplied[field] = value;
  }

  let normalized;
  try {
    normalized = createFingeringCostProfile(supplied);
  } catch (error) {
    if (error instanceof FingeringCostError) {
      throw invalid('snapshot.costProfile is not a valid normalized fingering policy.', 'snapshot.costProfile', {
        causeCode: error.code,
        causeField: error.details?.field ?? null,
      });
    }
    throw error;
  }

  const canonical = createCanonicalProfile(normalized);
  for (const field of PROFILE_FIELDS) {
    if (!Object.is(supplied[field], canonical[field])) {
      throw invalid('snapshot.costProfile must contain canonical normalized values.', `snapshot.costProfile.${field}`);
    }
  }
  return canonical;
}

function deepFreezeSnapshot(snapshot) {
  Object.freeze(snapshot.costProfile);
  return Object.freeze(snapshot);
}

function validateFingeringPathPolicySnapshot(snapshot) {
  inspectOwnDataFields(snapshot, SNAPSHOT_FIELDS, 'snapshot', true);

  const documentType = getOwnDataValue(snapshot, 'documentType', 'snapshot.documentType');
  const contractVersion = getOwnDataValue(snapshot, 'contractVersion', 'snapshot.contractVersion');
  const costProfile = getOwnDataValue(snapshot, 'costProfile', 'snapshot.costProfile');

  if (documentType !== 'FingeringPathPolicySnapshot') {
    throw invalid('snapshot.documentType must be FingeringPathPolicySnapshot.', 'snapshot.documentType');
  }
  if (contractVersion !== FINGERING_PATH_POLICY_SNAPSHOT_VERSION) {
    throw invalid('snapshot.contractVersion is not supported.', 'snapshot.contractVersion', {
      expectedContractVersion: FINGERING_PATH_POLICY_SNAPSHOT_VERSION,
      actualContractVersion: contractVersion,
    });
  }

  normalizeCompleteProfile(costProfile);
  return snapshot;
}

function createFingeringPathPolicySnapshot(costProfileOverrides = {}) {
  const overrides = normalizeOverrides(costProfileOverrides);

  let normalized;
  try {
    normalized = createFingeringCostProfile(overrides);
  } catch (error) {
    if (error instanceof FingeringCostError) {
      throw invalid('costProfileOverrides is not a valid fingering policy.', 'costProfileOverrides', {
        causeCode: error.code,
        causeField: error.details?.field ?? null,
      });
    }
    throw error;
  }

  const snapshot = {
    documentType: 'FingeringPathPolicySnapshot',
    contractVersion: FINGERING_PATH_POLICY_SNAPSHOT_VERSION,
    costProfile: createCanonicalProfile(normalized),
  };

  validateFingeringPathPolicySnapshot(snapshot);
  return deepFreezeSnapshot(snapshot);
}

function validateFingeringPathPolicyDigest(digest) {
  inspectOwnDataFields(digest, DIGEST_FIELDS, 'pathPolicyDigest', true);

  const contractVersion = getOwnDataValue(
    digest,
    'contractVersion',
    'pathPolicyDigest.contractVersion',
  );
  const algorithm = getOwnDataValue(digest, 'algorithm', 'pathPolicyDigest.algorithm');
  const value = getOwnDataValue(digest, 'value', 'pathPolicyDigest.value');

  if (contractVersion !== FINGERING_PATH_POLICY_DIGEST_VERSION) {
    throw invalid('pathPolicyDigest.contractVersion is not supported.', 'pathPolicyDigest.contractVersion', {
      expectedContractVersion: FINGERING_PATH_POLICY_DIGEST_VERSION,
      actualContractVersion: contractVersion,
    });
  }
  if (algorithm !== FINGERING_PATH_POLICY_DIGEST_ALGORITHM) {
    throw invalid('pathPolicyDigest.algorithm is not supported.', 'pathPolicyDigest.algorithm');
  }
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw invalid('pathPolicyDigest.value must be a lowercase SHA-256 hex digest.', 'pathPolicyDigest.value');
  }

  return digest;
}

function canonicalSnapshotPayload(snapshot) {
  const canonicalProfile = normalizeCompleteProfile(snapshot.costProfile);
  return {
    documentType: 'FingeringPathPolicySnapshot',
    contractVersion: FINGERING_PATH_POLICY_SNAPSHOT_VERSION,
    costProfile: canonicalProfile,
  };
}

function createFingeringPathPolicyDigest(snapshot) {
  validateFingeringPathPolicySnapshot(snapshot);
  const payload = canonicalSnapshotPayload(snapshot);

  const hash = createHash(FINGERING_PATH_POLICY_DIGEST_ALGORITHM);
  hash.update(DIGEST_DOMAIN, 'utf8');
  hash.update('\u0000');
  hash.update(JSON.stringify(payload), 'utf8');

  return Object.freeze({
    contractVersion: FINGERING_PATH_POLICY_DIGEST_VERSION,
    algorithm: FINGERING_PATH_POLICY_DIGEST_ALGORITHM,
    value: hash.digest('hex'),
  });
}

function verifyFingeringPathPolicyDigest(snapshot, expectedDigest) {
  validateFingeringPathPolicyDigest(expectedDigest);
  const actualDigest = createFingeringPathPolicyDigest(snapshot);

  if (
    actualDigest.contractVersion !== expectedDigest.contractVersion
    || actualDigest.algorithm !== expectedDigest.algorithm
    || actualDigest.value !== expectedDigest.value
  ) {
    throw invalid('Fingering path-policy digest does not match the supplied snapshot.', 'pathPolicyDigest', {
      expectedDigest: expectedDigest.value,
      actualDigest: actualDigest.value,
    });
  }

  return actualDigest;
}

module.exports = {
  FINGERING_PATH_POLICY_SNAPSHOT_VERSION,
  FINGERING_PATH_POLICY_DIGEST_VERSION,
  FINGERING_PATH_POLICY_DIGEST_ALGORITHM,
  FingeringPathPolicySnapshotError,
  createFingeringPathPolicySnapshot,
  validateFingeringPathPolicySnapshot,
  createFingeringPathPolicyDigest,
  validateFingeringPathPolicyDigest,
  verifyFingeringPathPolicyDigest,
};
