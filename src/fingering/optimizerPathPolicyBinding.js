'use strict';

const { createHash } = require('node:crypto');
const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  FINGERING_OPTIMIZER_VERSION,
} = require('./fingeringOptimizer');
const {
  OPTIMIZER_OBSERVATION_VERSION,
} = require('./optimizerObservation');
const {
  validateOptimizerObservationDigest,
} = require('./optimizerObservationDigest');
const {
  validateFingeringPathPolicySnapshot,
  validateFingeringPathPolicyDigest,
  verifyFingeringPathPolicyDigest,
} = require('./pathPolicySnapshot');
const {
  OPTIMIZER_PATH_POLICY_REPLAY_VERSION,
  MAX_SEMANTIC_REPLAY_DECISIONS,
  verifyOptimizerPathPolicyReplay,
} = require('./optimizerPathPolicyReplay');

const OPTIMIZER_PATH_POLICY_BINDING_VERSION = '1.0.0';
const OPTIMIZER_PATH_POLICY_BINDING_DIGEST_VERSION = '1.0.0';
const OPTIMIZER_PATH_POLICY_BINDING_DIGEST_ALGORITHM = 'sha256';

const INPUT_FIELDS = Object.freeze([
  'observation',
  'observationDigest',
  'pathPolicySnapshot',
  'pathPolicyDigest',
]);
const BINDING_FIELDS = Object.freeze([
  'documentType',
  'contractVersion',
  'authority',
  'optimizerObservationVersion',
  'noteCount',
  'observationDigest',
  'optimizer',
  'pathPolicySnapshot',
  'pathPolicyDigest',
  'semanticReplay',
]);
const OPTIMIZER_FIELDS = Object.freeze(['name', 'version']);
const DIGEST_FIELDS = Object.freeze(['contractVersion', 'algorithm', 'value']);
const SEMANTIC_REPLAY_FIELDS = Object.freeze(['contractVersion', 'status', 'scope']);
const SNAPSHOT_FIELDS = Object.freeze(['documentType', 'contractVersion', 'costProfile']);
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

const DIGEST_DOMAIN = [
  'musicxml-to-guitar-tab-engine',
  'OptimizerPathPolicyBinding',
  OPTIMIZER_PATH_POLICY_BINDING_VERSION,
  'content-digest',
  OPTIMIZER_PATH_POLICY_BINDING_DIGEST_VERSION,
].join('\u0000');

class OptimizerPathPolicyBindingError extends EngineError {
  constructor(message, code = 'OPTIMIZER_PATH_POLICY_BINDING_INVALID_INPUT', details = {}) {
    super(message, code, details, 'OptimizerPathPolicyBindingError');
  }
}

function invalid(message, details = {}) {
  return new OptimizerPathPolicyBindingError(
    message,
    'OPTIMIZER_PATH_POLICY_BINDING_INVALID_INPUT',
    details,
  );
}

function replayFailed(message, details = {}) {
  return new OptimizerPathPolicyBindingError(
    message,
    'OPTIMIZER_PATH_POLICY_BINDING_REPLAY_FAILED',
    details,
  );
}

function digestMismatch(message, details = {}) {
  return new OptimizerPathPolicyBindingError(
    message,
    'OPTIMIZER_PATH_POLICY_BINDING_DIGEST_MISMATCH',
    details,
  );
}

function isPlainDataObject(value) {
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

function ownKeys(value, path) {
  try {
    return Reflect.ownKeys(value);
  } catch {
    throw invalid(`${path} keys could not be inspected safely.`, { path });
  }
}

function descriptor(value, key, path) {
  let fieldDescriptor;
  try {
    fieldDescriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw invalid(`${path} descriptor could not be inspected safely.`, { path });
  }
  if (
    !fieldDescriptor
    || !fieldDescriptor.enumerable
    || !Object.hasOwn(fieldDescriptor, 'value')
  ) {
    throw invalid(`${path} must be an enumerable own data property.`, { path });
  }
  return fieldDescriptor;
}

function assertExactDataObject(value, expectedFields, path) {
  if (!isPlainDataObject(value)) {
    throw invalid(`${path} must be a non-proxy plain object.`, { path });
  }
  const keys = ownKeys(value, path);
  const expected = new Set(expectedFields);
  if (keys.length !== expectedFields.length) {
    throw invalid(`${path} contains unsupported or missing fields.`, { path });
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !expected.has(key)) {
      throw invalid(`${path} contains unsupported fields.`, { path });
    }
    descriptor(value, key, `${path}.${String(key)}`);
  }
  for (const field of expectedFields) {
    if (!Object.hasOwn(value, field)) {
      throw invalid(`${path}.${field} is required.`, { path: `${path}.${field}` });
    }
  }
  return value;
}

function readData(value, key, path) {
  return descriptor(value, key, path).value;
}

function strictCreationInput(input) {
  assertExactDataObject(input, INPUT_FIELDS, 'input');
  return {
    observation: readData(input, 'observation', 'input.observation'),
    observationDigest: readData(input, 'observationDigest', 'input.observationDigest'),
    pathPolicySnapshot: readData(input, 'pathPolicySnapshot', 'input.pathPolicySnapshot'),
    pathPolicyDigest: readData(input, 'pathPolicyDigest', 'input.pathPolicyDigest'),
  };
}

function copyDigest(digest) {
  return {
    contractVersion: digest.contractVersion,
    algorithm: digest.algorithm,
    value: digest.value,
  };
}

function copyOptimizer(optimizer) {
  return {
    name: optimizer.name,
    version: optimizer.version,
  };
}

function copyPathPolicySnapshot(snapshot) {
  const profile = snapshot.costProfile;
  return {
    documentType: snapshot.documentType,
    contractVersion: snapshot.contractVersion,
    costProfile: {
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
    },
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

function validateOptimizerPathPolicyBinding(binding) {
  assertExactDataObject(binding, BINDING_FIELDS, 'binding');

  const documentType = readData(binding, 'documentType', 'binding.documentType');
  const contractVersion = readData(binding, 'contractVersion', 'binding.contractVersion');
  const authority = readData(binding, 'authority', 'binding.authority');
  const optimizerObservationVersion = readData(
    binding,
    'optimizerObservationVersion',
    'binding.optimizerObservationVersion',
  );
  const noteCount = readData(binding, 'noteCount', 'binding.noteCount');

  if (documentType !== 'OptimizerPathPolicyBinding') {
    throw invalid('binding.documentType is not supported.');
  }
  if (contractVersion !== OPTIMIZER_PATH_POLICY_BINDING_VERSION) {
    throw invalid('binding.contractVersion is not supported.');
  }
  if (authority !== 'none') {
    throw invalid('binding.authority must remain none.');
  }
  if (optimizerObservationVersion !== OPTIMIZER_OBSERVATION_VERSION) {
    throw invalid('binding.optimizerObservationVersion is not supported.');
  }
  if (
    !Number.isInteger(noteCount)
    || noteCount < 0
    || Object.is(noteCount, -0)
    || noteCount > MAX_SEMANTIC_REPLAY_DECISIONS
  ) {
    throw invalid('binding.noteCount is outside the supported replay boundary.');
  }

  const observationDigest = readData(binding, 'observationDigest', 'binding.observationDigest');
  assertExactDataObject(observationDigest, DIGEST_FIELDS, 'binding.observationDigest');
  try {
    validateOptimizerObservationDigest(observationDigest);
  } catch (error) {
    throw invalid('binding.observationDigest is invalid.', { causeCode: error?.code ?? null });
  }

  const optimizer = readData(binding, 'optimizer', 'binding.optimizer');
  assertExactDataObject(optimizer, OPTIMIZER_FIELDS, 'binding.optimizer');
  const optimizerName = readData(optimizer, 'name', 'binding.optimizer.name');
  const optimizerVersion = readData(optimizer, 'version', 'binding.optimizer.version');
  if (
    optimizerName !== 'deterministic-dynamic-programming'
    || optimizerVersion !== FINGERING_OPTIMIZER_VERSION
  ) {
    throw invalid('binding.optimizer identity/version is not supported.');
  }

  const pathPolicySnapshot = readData(
    binding,
    'pathPolicySnapshot',
    'binding.pathPolicySnapshot',
  );
  try {
    validateFingeringPathPolicySnapshot(pathPolicySnapshot);
  } catch (error) {
    throw invalid('binding.pathPolicySnapshot is invalid.', { causeCode: error?.code ?? null });
  }

  const pathPolicyDigest = readData(binding, 'pathPolicyDigest', 'binding.pathPolicyDigest');
  assertExactDataObject(pathPolicyDigest, DIGEST_FIELDS, 'binding.pathPolicyDigest');
  try {
    validateFingeringPathPolicyDigest(pathPolicyDigest);
    verifyFingeringPathPolicyDigest(pathPolicySnapshot, pathPolicyDigest);
  } catch (error) {
    throw invalid('binding.pathPolicyDigest does not bind the embedded path-policy snapshot.', {
      causeCode: error?.code ?? null,
    });
  }

  const semanticReplay = readData(binding, 'semanticReplay', 'binding.semanticReplay');
  assertExactDataObject(semanticReplay, SEMANTIC_REPLAY_FIELDS, 'binding.semanticReplay');
  const replayContractVersion = readData(
    semanticReplay,
    'contractVersion',
    'binding.semanticReplay.contractVersion',
  );
  const replayStatus = readData(semanticReplay, 'status', 'binding.semanticReplay.status');
  const replayScope = readData(semanticReplay, 'scope', 'binding.semanticReplay.scope');
  if (replayContractVersion !== OPTIMIZER_PATH_POLICY_REPLAY_VERSION) {
    throw invalid('binding.semanticReplay.contractVersion is not supported.');
  }
  if (replayStatus !== 'verified') {
    throw invalid('binding.semanticReplay.status must be verified.');
  }
  const expectedScope = noteCount === 0 ? 'empty-observation' : 'deterministic-path';
  if (replayScope !== expectedScope) {
    throw invalid('binding.semanticReplay.scope does not match binding.noteCount.', {
      expectedScope,
      actualScope: replayScope,
    });
  }

  return binding;
}

function createOptimizerPathPolicyBinding(input) {
  const replayInput = strictCreationInput(input);

  try {
    if (verifyOptimizerPathPolicyReplay(replayInput) !== true) {
      throw new Error('semantic replay did not return true');
    }
  } catch (error) {
    if (error instanceof OptimizerPathPolicyBindingError) throw error;
    throw replayFailed('LR-S1B.2a semantic replay must succeed before a binding can be created.', {
      causeCode: error?.code ?? null,
    });
  }

  const { observation, observationDigest, pathPolicySnapshot, pathPolicyDigest } = replayInput;
  const binding = {
    documentType: 'OptimizerPathPolicyBinding',
    contractVersion: OPTIMIZER_PATH_POLICY_BINDING_VERSION,
    authority: 'none',
    optimizerObservationVersion: observation.contractVersion,
    noteCount: observation.noteCount,
    observationDigest: copyDigest(observationDigest),
    optimizer: copyOptimizer(observation.optimizer),
    pathPolicySnapshot: copyPathPolicySnapshot(pathPolicySnapshot),
    pathPolicyDigest: copyDigest(pathPolicyDigest),
    semanticReplay: {
      contractVersion: OPTIMIZER_PATH_POLICY_REPLAY_VERSION,
      status: 'verified',
      scope: observation.noteCount === 0 ? 'empty-observation' : 'deterministic-path',
    },
  };

  validateOptimizerPathPolicyBinding(binding);
  return deepFreeze(binding);
}

function validateOptimizerPathPolicyBindingDigest(digest) {
  assertExactDataObject(digest, DIGEST_FIELDS, 'bindingDigest');
  const contractVersion = readData(digest, 'contractVersion', 'bindingDigest.contractVersion');
  const algorithm = readData(digest, 'algorithm', 'bindingDigest.algorithm');
  const value = readData(digest, 'value', 'bindingDigest.value');

  if (contractVersion !== OPTIMIZER_PATH_POLICY_BINDING_DIGEST_VERSION) {
    throw invalid('bindingDigest.contractVersion is not supported.');
  }
  if (algorithm !== OPTIMIZER_PATH_POLICY_BINDING_DIGEST_ALGORITHM) {
    throw invalid('bindingDigest.algorithm is not supported.');
  }
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw invalid('bindingDigest.value must be a lowercase SHA-256 digest.');
  }
  return digest;
}

function canonicalBindingPayload(binding) {
  validateOptimizerPathPolicyBinding(binding);
  const snapshot = binding.pathPolicySnapshot;
  const profile = snapshot.costProfile;
  return {
    documentType: 'OptimizerPathPolicyBinding',
    contractVersion: OPTIMIZER_PATH_POLICY_BINDING_VERSION,
    authority: 'none',
    optimizerObservationVersion: binding.optimizerObservationVersion,
    noteCount: binding.noteCount,
    observationDigest: {
      contractVersion: binding.observationDigest.contractVersion,
      algorithm: binding.observationDigest.algorithm,
      value: binding.observationDigest.value,
    },
    optimizer: {
      name: binding.optimizer.name,
      version: binding.optimizer.version,
    },
    pathPolicySnapshot: {
      documentType: snapshot.documentType,
      contractVersion: snapshot.contractVersion,
      costProfile: {
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
      },
    },
    pathPolicyDigest: {
      contractVersion: binding.pathPolicyDigest.contractVersion,
      algorithm: binding.pathPolicyDigest.algorithm,
      value: binding.pathPolicyDigest.value,
    },
    semanticReplay: {
      contractVersion: binding.semanticReplay.contractVersion,
      status: binding.semanticReplay.status,
      scope: binding.semanticReplay.scope,
    },
  };
}

function createOptimizerPathPolicyBindingDigest(binding) {
  const payload = canonicalBindingPayload(binding);
  const hash = createHash(OPTIMIZER_PATH_POLICY_BINDING_DIGEST_ALGORITHM);
  hash.update(DIGEST_DOMAIN, 'utf8');
  hash.update('\u0000');
  hash.update(JSON.stringify(payload), 'utf8');
  return Object.freeze({
    contractVersion: OPTIMIZER_PATH_POLICY_BINDING_DIGEST_VERSION,
    algorithm: OPTIMIZER_PATH_POLICY_BINDING_DIGEST_ALGORITHM,
    value: hash.digest('hex'),
  });
}

function verifyOptimizerPathPolicyBindingDigest(binding, expectedDigest) {
  try {
    validateOptimizerPathPolicyBindingDigest(expectedDigest);
  } catch (error) {
    if (error instanceof OptimizerPathPolicyBindingError) throw error;
    throw invalid('bindingDigest is invalid.', { causeCode: error?.code ?? null });
  }
  const actualDigest = createOptimizerPathPolicyBindingDigest(binding);
  if (
    actualDigest.contractVersion !== expectedDigest.contractVersion
    || actualDigest.algorithm !== expectedDigest.algorithm
    || actualDigest.value !== expectedDigest.value
  ) {
    throw digestMismatch('OptimizerPathPolicyBinding digest does not match the supplied binding.', {
      expectedDigest: expectedDigest.value,
      actualDigest: actualDigest.value,
    });
  }
  return actualDigest;
}

module.exports = {
  OPTIMIZER_PATH_POLICY_BINDING_VERSION,
  OPTIMIZER_PATH_POLICY_BINDING_DIGEST_VERSION,
  OPTIMIZER_PATH_POLICY_BINDING_DIGEST_ALGORITHM,
  OptimizerPathPolicyBindingError,
  createOptimizerPathPolicyBinding,
  validateOptimizerPathPolicyBinding,
  createOptimizerPathPolicyBindingDigest,
  validateOptimizerPathPolicyBindingDigest,
  verifyOptimizerPathPolicyBindingDigest,
};
