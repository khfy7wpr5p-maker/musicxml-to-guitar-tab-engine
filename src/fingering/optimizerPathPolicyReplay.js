'use strict';

const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  PROCESSING_DEADLINE_EXCEEDED,
  createProcessingRuntime,
} = require('../core/processingRuntime');
const {
  FINGERING_OPTIMIZER_VERSION,
  optimizeFingering,
} = require('./fingeringOptimizer');
const {
  verifyOptimizerObservationDigest,
} = require('./optimizerObservationDigest');
const {
  verifyFingeringPathPolicyDigest,
} = require('./pathPolicySnapshot');

const OPTIMIZER_PATH_POLICY_REPLAY_VERSION = '1.0.0';
const MAX_SEMANTIC_REPLAY_DECISIONS = 50_000;
const MAX_REPLAY_CANDIDATES_PER_DECISION = 6;
const MAX_REPLAY_COST_REASONS = 16;
const MAX_REPLAY_STRING_LENGTH = 4_096;
const MAX_REPLAY_TOTAL_STRING_CHARACTERS = 4 * 1024 * 1024;

const INPUT_FIELDS = Object.freeze([
  'observation',
  'observationDigest',
  'pathPolicySnapshot',
  'pathPolicyDigest',
]);
const OBSERVATION_FIELDS = Object.freeze([
  'documentType',
  'contractVersion',
  'candidateContractVersion',
  'optimizer',
  'guitarConfiguration',
  'partId',
  'noteCount',
  'totalCost',
  'decisions',
]);
const OPTIMIZER_FIELDS = Object.freeze(['name', 'version']);
const OBSERVED_GUITAR_FIELDS = Object.freeze(['contractVersion', 'value']);
const GUITAR_VALUE_FIELDS = Object.freeze(['tuning', 'minimumFret', 'maximumFret']);
const TUNING_ENTRY_FIELDS = Object.freeze(['number', 'pitch', 'midi']);
const DECISION_FIELDS = Object.freeze([
  'decisionIndex',
  'eventId',
  'measureKey',
  'eventIndex',
  'candidates',
  'selectedCandidateId',
  'selectedPosition',
  'cost',
]);
const CANDIDATE_FIELDS = Object.freeze(['candidateId', 'candidateIndex', 'position']);
const POSITION_FIELDS = Object.freeze(['string', 'fret']);
const COST_FIELDS = Object.freeze(['total', 'isPlayable', 'reasons', 'breakdown']);
const FIRST_COST_BREAKDOWN_FIELDS = Object.freeze([
  'highFretDistance',
  'highFretCost',
  'openStringPreferenceCost',
]);
const TRANSITION_COST_BREAKDOWN_FIELDS = Object.freeze([
  'fretMovement',
  'fretMovementCost',
  'stringMovement',
  'stringMovementCost',
  'largeShiftDistance',
  'largeShiftCost',
  'highFretDistance',
  'highFretCost',
  'openStringPreferenceCost',
  'samePosition',
  'samePositionPreferenceCost',
]);
const DIGEST_FIELDS = Object.freeze(['contractVersion', 'algorithm', 'value']);

class OptimizerPathPolicyReplayError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'OptimizerPathPolicyReplayError');
  }
}

function invalid(message, details = {}) {
  return new OptimizerPathPolicyReplayError(
    message,
    'OPTIMIZER_PATH_POLICY_REPLAY_INVALID_INPUT',
    details,
  );
}

function mismatch(message, details = {}) {
  return new OptimizerPathPolicyReplayError(
    message,
    'OPTIMIZER_PATH_POLICY_REPLAY_MISMATCH',
    details,
  );
}

function resourceLimit(message, details = {}) {
  return new OptimizerPathPolicyReplayError(
    message,
    'OPTIMIZER_PATH_POLICY_REPLAY_RESOURCE_LIMIT',
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
    descriptor(value, key, `${path}.${key}`);
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

function accountString(value, path, budget) {
  if (value.length > MAX_REPLAY_STRING_LENGTH) {
    throw resourceLimit(`${path} exceeds the semantic replay string-length limit.`, {
      path,
      maximumLength: MAX_REPLAY_STRING_LENGTH,
      actualLength: value.length,
    });
  }
  budget.stringCharacters += value.length;
  if (budget.stringCharacters > MAX_REPLAY_TOTAL_STRING_CHARACTERS) {
    throw resourceLimit('Semantic replay input exceeds the pre-digest string-character budget.', {
      maximumCharacters: MAX_REPLAY_TOTAL_STRING_CHARACTERS,
      actualCharacters: budget.stringCharacters,
    });
  }
}

function assertCanonicalPrimitive(value, path, budget) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw invalid(`${path} must be a finite canonical number.`, { path });
    }
    return;
  }
  if (typeof value === 'string') {
    accountString(value, path, budget);
    return;
  }
  if (value === null || typeof value === 'boolean') {
    return;
  }
  throw invalid(`${path} contains an unsupported value type.`, {
    path,
    valueType: typeof value,
  });
}

function assertDenseDataArray(value, path, maximumLength = null) {
  if (!Array.isArray(value) || isProxy(value)) {
    throw invalid(`${path} must be a non-proxy dense array.`, { path });
  }
  if (maximumLength !== null && value.length > maximumLength) {
    throw resourceLimit(`${path} exceeds the semantic replay entry limit.`, {
      path,
      maximumLength,
      actualLength: value.length,
    });
  }

  const keys = ownKeys(value, path);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid(`${path} must not contain symbol properties.`, { path });
    }
    if (key === 'length') continue;
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw invalid(`${path} must not contain custom properties.`, { path, key });
    }
    descriptor(value, key, `${path}[${key}]`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw invalid(`${path} must be dense.`, { path, index });
    }
  }
  return value;
}

function validatePositionShape(position, path, budget) {
  assertExactDataObject(position, POSITION_FIELDS, path);
  assertCanonicalPrimitive(
    readData(position, 'string', `${path}.string`),
    `${path}.string`,
    budget,
  );
  assertCanonicalPrimitive(
    readData(position, 'fret', `${path}.fret`),
    `${path}.fret`,
    budget,
  );
}

function validateCostShape(cost, decisionIndex, path, budget) {
  assertExactDataObject(cost, COST_FIELDS, path);
  assertCanonicalPrimitive(readData(cost, 'total', `${path}.total`), `${path}.total`, budget);
  assertCanonicalPrimitive(
    readData(cost, 'isPlayable', `${path}.isPlayable`),
    `${path}.isPlayable`,
    budget,
  );

  const reasons = readData(cost, 'reasons', `${path}.reasons`);
  assertDenseDataArray(reasons, `${path}.reasons`, MAX_REPLAY_COST_REASONS);
  for (let index = 0; index < reasons.length; index += 1) {
    assertCanonicalPrimitive(
      readData(reasons, String(index), `${path}.reasons[${index}]`),
      `${path}.reasons[${index}]`,
      budget,
    );
  }

  const breakdown = readData(cost, 'breakdown', `${path}.breakdown`);
  const fields = decisionIndex === 0
    ? FIRST_COST_BREAKDOWN_FIELDS
    : TRANSITION_COST_BREAKDOWN_FIELDS;
  assertExactDataObject(breakdown, fields, `${path}.breakdown`);
  for (const field of fields) {
    assertCanonicalPrimitive(
      readData(breakdown, field, `${path}.breakdown.${field}`),
      `${path}.breakdown.${field}`,
      budget,
    );
  }
}

function validateObservationShape(observation, budget) {
  assertExactDataObject(observation, OBSERVATION_FIELDS, 'observation');

  for (const field of [
    'documentType',
    'contractVersion',
    'candidateContractVersion',
    'partId',
    'noteCount',
    'totalCost',
  ]) {
    assertCanonicalPrimitive(
      readData(observation, field, `observation.${field}`),
      `observation.${field}`,
      budget,
    );
  }

  const optimizer = readData(observation, 'optimizer', 'observation.optimizer');
  assertExactDataObject(optimizer, OPTIMIZER_FIELDS, 'observation.optimizer');
  for (const field of OPTIMIZER_FIELDS) {
    assertCanonicalPrimitive(
      readData(optimizer, field, `observation.optimizer.${field}`),
      `observation.optimizer.${field}`,
      budget,
    );
  }

  const guitar = readData(
    observation,
    'guitarConfiguration',
    'observation.guitarConfiguration',
  );
  assertExactDataObject(guitar, OBSERVED_GUITAR_FIELDS, 'observation.guitarConfiguration');
  assertCanonicalPrimitive(
    readData(guitar, 'contractVersion', 'observation.guitarConfiguration.contractVersion'),
    'observation.guitarConfiguration.contractVersion',
    budget,
  );

  const guitarValue = readData(guitar, 'value', 'observation.guitarConfiguration.value');
  assertExactDataObject(guitarValue, GUITAR_VALUE_FIELDS, 'observation.guitarConfiguration.value');
  assertCanonicalPrimitive(
    readData(guitarValue, 'minimumFret', 'observation.guitarConfiguration.value.minimumFret'),
    'observation.guitarConfiguration.value.minimumFret',
    budget,
  );
  assertCanonicalPrimitive(
    readData(guitarValue, 'maximumFret', 'observation.guitarConfiguration.value.maximumFret'),
    'observation.guitarConfiguration.value.maximumFret',
    budget,
  );

  const tuning = readData(guitarValue, 'tuning', 'observation.guitarConfiguration.value.tuning');
  assertDenseDataArray(tuning, 'observation.guitarConfiguration.value.tuning', 6);
  if (tuning.length !== 6) {
    throw invalid('observation.guitarConfiguration.value.tuning must contain six entries.');
  }
  for (let index = 0; index < tuning.length; index += 1) {
    const entry = readData(
      tuning,
      String(index),
      `observation.guitarConfiguration.value.tuning[${index}]`,
    );
    assertExactDataObject(
      entry,
      TUNING_ENTRY_FIELDS,
      `observation.guitarConfiguration.value.tuning[${index}]`,
    );
    for (const field of TUNING_ENTRY_FIELDS) {
      assertCanonicalPrimitive(
        readData(entry, field, `observation.guitarConfiguration.value.tuning[${index}].${field}`),
        `observation.guitarConfiguration.value.tuning[${index}].${field}`,
        budget,
      );
    }
  }

  const decisions = readData(observation, 'decisions', 'observation.decisions');
  assertDenseDataArray(decisions, 'observation.decisions', MAX_SEMANTIC_REPLAY_DECISIONS);
  for (let decisionIndex = 0; decisionIndex < decisions.length; decisionIndex += 1) {
    const decisionPath = `observation.decisions[${decisionIndex}]`;
    const decision = readData(decisions, String(decisionIndex), decisionPath);
    assertExactDataObject(decision, DECISION_FIELDS, decisionPath);

    for (const field of [
      'decisionIndex',
      'eventId',
      'measureKey',
      'eventIndex',
      'selectedCandidateId',
    ]) {
      assertCanonicalPrimitive(
        readData(decision, field, `${decisionPath}.${field}`),
        `${decisionPath}.${field}`,
        budget,
      );
    }

    const candidates = readData(decision, 'candidates', `${decisionPath}.candidates`);
    assertDenseDataArray(
      candidates,
      `${decisionPath}.candidates`,
      MAX_REPLAY_CANDIDATES_PER_DECISION,
    );
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidatePath = `${decisionPath}.candidates[${candidateIndex}]`;
      const candidate = readData(candidates, String(candidateIndex), candidatePath);
      assertExactDataObject(candidate, CANDIDATE_FIELDS, candidatePath);
      assertCanonicalPrimitive(
        readData(candidate, 'candidateId', `${candidatePath}.candidateId`),
        `${candidatePath}.candidateId`,
        budget,
      );
      assertCanonicalPrimitive(
        readData(candidate, 'candidateIndex', `${candidatePath}.candidateIndex`),
        `${candidatePath}.candidateIndex`,
        budget,
      );
      validatePositionShape(
        readData(candidate, 'position', `${candidatePath}.position`),
        `${candidatePath}.position`,
        budget,
      );
    }

    validatePositionShape(
      readData(decision, 'selectedPosition', `${decisionPath}.selectedPosition`),
      `${decisionPath}.selectedPosition`,
      budget,
    );
    validateCostShape(
      readData(decision, 'cost', `${decisionPath}.cost`),
      decisionIndex,
      `${decisionPath}.cost`,
      budget,
    );
  }
}

function validateDigestShape(digest, path, budget) {
  assertExactDataObject(digest, DIGEST_FIELDS, path);
  for (const field of DIGEST_FIELDS) {
    assertCanonicalPrimitive(
      readData(digest, field, `${path}.${field}`),
      `${path}.${field}`,
      budget,
    );
  }
}

function strictInput(input) {
  assertExactDataObject(input, INPUT_FIELDS, 'input');
  const observation = readData(input, 'observation', 'input.observation');
  const observationDigest = readData(
    input,
    'observationDigest',
    'input.observationDigest',
  );
  const pathPolicySnapshot = readData(
    input,
    'pathPolicySnapshot',
    'input.pathPolicySnapshot',
  );
  const pathPolicyDigest = readData(
    input,
    'pathPolicyDigest',
    'input.pathPolicyDigest',
  );
  const preDigestBudget = { stringCharacters: 0 };

  validateObservationShape(observation, preDigestBudget);
  validateDigestShape(observationDigest, 'observationDigest', preDigestBudget);
  validateDigestShape(pathPolicyDigest, 'pathPolicyDigest', preDigestBudget);

  return {
    observation,
    observationDigest,
    pathPolicySnapshot,
    pathPolicyDigest,
  };
}

function sameCanonicalValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameCanonicalValue(left[index], right[index])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (
    leftKeys.length !== rightKeys.length
    || leftKeys.some((key, index) => key !== rightKeys[index])
  ) {
    return false;
  }
  return leftKeys.every((key) => sameCanonicalValue(left[key], right[key]));
}

function candidateLayersFromObservation(observation) {
  return observation.decisions.map((decision) => (
    decision.candidates.map((candidate) => ({
      string: candidate.position.string,
      fret: candidate.position.fret,
    }))
  ));
}

function verifyObservedMovementCaps(observation, profile) {
  for (let index = 1; index < observation.decisions.length; index += 1) {
    const previous = observation.decisions[index - 1].selectedPosition;
    const next = observation.decisions[index].selectedPosition;
    const fretMovement = Math.abs(next.fret - previous.fret);
    const stringMovement = Math.abs(next.string - previous.string);

    if (
      profile.maximumFretMovement !== null
      && fretMovement > profile.maximumFretMovement
    ) {
      throw mismatch('Observed selected path exceeds the bound maximum fret movement.', {
        decisionIndex: index,
        fretMovement,
        maximumFretMovement: profile.maximumFretMovement,
      });
    }
    if (
      profile.maximumStringMovement !== null
      && stringMovement > profile.maximumStringMovement
    ) {
      throw mismatch('Observed selected path exceeds the bound maximum string movement.', {
        decisionIndex: index,
        stringMovement,
        maximumStringMovement: profile.maximumStringMovement,
      });
    }
  }
}

function verifyOptimizerPathPolicyReplay(input) {
  const {
    observation,
    observationDigest,
    pathPolicySnapshot,
    pathPolicyDigest,
  } = strictInput(input);

  try {
    verifyOptimizerObservationDigest(observation, observationDigest);
  } catch (error) {
    throw invalid('observationDigest must exactly bind the supplied observation.', {
      causeCode: error?.code ?? null,
    });
  }

  try {
    verifyFingeringPathPolicyDigest(pathPolicySnapshot, pathPolicyDigest);
  } catch (error) {
    throw invalid('pathPolicyDigest must exactly bind the supplied path-policy snapshot.', {
      causeCode: error?.code ?? null,
    });
  }

  if (
    observation.optimizer.name !== 'deterministic-dynamic-programming'
    || observation.optimizer.version !== FINGERING_OPTIMIZER_VERSION
  ) {
    throw invalid('Observation optimizer identity/version is not supported for semantic replay.');
  }

  const profile = pathPolicySnapshot.costProfile;
  if (profile.maximumFret !== observation.guitarConfiguration.value.maximumFret) {
    throw mismatch('Bound path policy and observation guitar configuration use different maximum frets.', {
      policyMaximumFret: profile.maximumFret,
      observationMaximumFret: observation.guitarConfiguration.value.maximumFret,
    });
  }

  verifyObservedMovementCaps(observation, profile);

  if (observation.noteCount === 0) {
    if (observation.totalCost !== 0 || observation.decisions.length !== 0) {
      throw mismatch('Empty observation replay state is inconsistent.');
    }
    return true;
  }

  const candidateLayers = candidateLayersFromObservation(observation);
  const runtime = createProcessingRuntime();
  let replay;
  try {
    replay = optimizeFingering(candidateLayers, { costProfile: profile }, runtime);
  } catch (error) {
    if (error?.code === PROCESSING_DEADLINE_EXCEEDED) {
      throw resourceLimit('Semantic replay exceeded the trusted processing deadline.', {
        causeCode: error.code,
      });
    }
    throw mismatch('Bound policy could not reproduce a deterministic playable path.', {
      causeCode: error?.code ?? null,
    });
  }

  if (!Object.is(replay.totalCost, observation.totalCost)) {
    throw mismatch('Replay total cost does not match the observed total cost.', {
      replayTotalCost: replay.totalCost,
      observationTotalCost: observation.totalCost,
    });
  }
  if (
    replay.positions.length !== observation.decisions.length
    || replay.costs.length !== observation.decisions.length
  ) {
    throw mismatch('Replay output length does not match the observation decision count.');
  }

  for (let index = 0; index < observation.decisions.length; index += 1) {
    const decision = observation.decisions[index];
    if (!sameCanonicalValue(replay.positions[index], decision.selectedPosition)) {
      throw mismatch('Replay selected position does not match the observed selected position.', {
        decisionIndex: index,
      });
    }
    if (!sameCanonicalValue(replay.costs[index], decision.cost)) {
      throw mismatch('Replay cost record does not match the observed selected cost.', {
        decisionIndex: index,
      });
    }
  }

  return true;
}

module.exports = {
  OPTIMIZER_PATH_POLICY_REPLAY_VERSION,
  MAX_SEMANTIC_REPLAY_DECISIONS,
  MAX_REPLAY_CANDIDATES_PER_DECISION,
  MAX_REPLAY_COST_REASONS,
  MAX_REPLAY_STRING_LENGTH,
  MAX_REPLAY_TOTAL_STRING_CHARACTERS,
  OptimizerPathPolicyReplayError,
  verifyOptimizerPathPolicyReplay,
};
