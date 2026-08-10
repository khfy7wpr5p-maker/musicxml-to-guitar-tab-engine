'use strict';

const { createHash } = require('node:crypto');
const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  PEDAGOGICAL_FEATURE_VECTOR_VERSION,
  createPedagogicalFeatureVector,
} = require('../fingering/pedagogicalFeatureVector');
const {
  OPTIMIZER_OBSERVATION_VERSION,
} = require('../fingering/optimizerObservation');
const {
  createOptimizerObservationDigest,
} = require('../fingering/optimizerObservationDigest');

const SHADOW_RANKING_CONTRACT_VERSION = '1.0.0';
const SHADOW_RANKING_MODEL_CONTRACT_VERSION = '1.0.0';
const SHADOW_RANKING_MODEL_KIND = 'synthetic-reference-linear';
const SHADOW_RANKING_SCORE_DIRECTION = 'lower-is-better';
const MAX_ABSOLUTE_MODEL_WEIGHT = 1000;
const MAX_ABSOLUTE_SHADOW_SCORE = 1_000_000_000;
const MAX_SAFE_GRAPH_DEPTH = 128;
const MAX_SAFE_GRAPH_NODES = 2_000_000;

const MODEL_FIELDS = Object.freeze([
  'documentType',
  'contractVersion',
  'modelId',
  'modelVersion',
  'modelKind',
  'featureContractVersion',
  'scoreDirection',
  'featureWeights',
  'modelSha256',
]);

const FEATURE_FIELDS = Object.freeze([
  'fretMovement',
  'stringMovement',
  'positionContinuity',
  'openStringUsage',
  'largeShift',
  'handStability',
  'phraseContinuity',
]);

const MODEL_DIGEST_DOMAIN = [
  'musicxml-to-guitar-tab-engine',
  'ShadowRankingModel',
  SHADOW_RANKING_MODEL_CONTRACT_VERSION,
  'content-digest',
].join('\u0000');

class ShadowRankingError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_SHADOW_RANKING_INPUT',
      details,
      'ShadowRankingError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new ShadowRankingError(message, {
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

function assertExactOwnDataFields(value, fields, path) {
  if (!isPlainObject(value)) {
    throw invalid(`${path} must be a non-proxy plain object.`, path);
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid(`${path} keys could not be inspected safely.`, path);
  }

  const allowed = new Set(fields);
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

  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw invalid('Required field is missing.', `${path}.${field}`);
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
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
    throw invalid('Field must be an enumerable own data property.', path);
  }
  return descriptor.value;
}

function normalizeIdentifier(value, field, maximumLength = 128) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maximumLength
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    throw invalid(`${field} must be a bounded opaque identifier.`, field);
  }
  return value;
}

function normalizeVersion(value, field) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw invalid(`${field} must be a semantic version string.`, field);
  }
  return value;
}

function normalizeWeight(value, field) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || Math.abs(value) > MAX_ABSOLUTE_MODEL_WEIGHT
  ) {
    throw invalid(
      `${field} must be finite and within the LR-S0 weight boundary.`,
      field,
      { maximumAbsoluteWeight: MAX_ABSOLUTE_MODEL_WEIGHT },
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function normalizeModelPayload(model) {
  assertExactOwnDataFields(model, MODEL_FIELDS, 'model');

  const documentType = getOwnDataValue(model, 'documentType', 'model.documentType');
  const contractVersion = getOwnDataValue(model, 'contractVersion', 'model.contractVersion');
  const modelId = getOwnDataValue(model, 'modelId', 'model.modelId');
  const modelVersion = getOwnDataValue(model, 'modelVersion', 'model.modelVersion');
  const modelKind = getOwnDataValue(model, 'modelKind', 'model.modelKind');
  const featureContractVersion = getOwnDataValue(
    model,
    'featureContractVersion',
    'model.featureContractVersion',
  );
  const scoreDirection = getOwnDataValue(model, 'scoreDirection', 'model.scoreDirection');
  const featureWeights = getOwnDataValue(model, 'featureWeights', 'model.featureWeights');
  const modelSha256 = getOwnDataValue(model, 'modelSha256', 'model.modelSha256');

  if (documentType !== 'ShadowRankingModel') {
    throw invalid('model.documentType must be ShadowRankingModel.', 'model.documentType');
  }
  if (contractVersion !== SHADOW_RANKING_MODEL_CONTRACT_VERSION) {
    throw invalid('model.contractVersion is not supported.', 'model.contractVersion');
  }
  normalizeIdentifier(modelId, 'model.modelId');
  normalizeVersion(modelVersion, 'model.modelVersion');
  if (modelKind !== SHADOW_RANKING_MODEL_KIND) {
    throw invalid('model.modelKind is not supported by LR-S0.', 'model.modelKind');
  }
  if (featureContractVersion !== PEDAGOGICAL_FEATURE_VECTOR_VERSION) {
    throw invalid(
      'model.featureContractVersion is not supported.',
      'model.featureContractVersion',
    );
  }
  if (scoreDirection !== SHADOW_RANKING_SCORE_DIRECTION) {
    throw invalid('model.scoreDirection is not supported.', 'model.scoreDirection');
  }
  if (typeof modelSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(modelSha256)) {
    throw invalid('model.modelSha256 must be a lowercase SHA-256 digest.', 'model.modelSha256');
  }

  assertExactOwnDataFields(featureWeights, FEATURE_FIELDS, 'model.featureWeights');
  const normalizedWeights = {};
  for (const field of FEATURE_FIELDS) {
    normalizedWeights[field] = normalizeWeight(
      getOwnDataValue(featureWeights, field, `model.featureWeights.${field}`),
      `model.featureWeights.${field}`,
    );
  }

  return {
    payload: {
      documentType: 'ShadowRankingModel',
      contractVersion: SHADOW_RANKING_MODEL_CONTRACT_VERSION,
      modelId,
      modelVersion,
      modelKind: SHADOW_RANKING_MODEL_KIND,
      featureContractVersion: PEDAGOGICAL_FEATURE_VECTOR_VERSION,
      scoreDirection: SHADOW_RANKING_SCORE_DIRECTION,
      featureWeights: normalizedWeights,
    },
    modelSha256,
  };
}

function hashModelPayload(payload) {
  const hash = createHash('sha256');
  hash.update(MODEL_DIGEST_DOMAIN, 'utf8');
  hash.update('\u0000');
  hash.update(JSON.stringify(payload), 'utf8');
  return hash.digest('hex');
}

function computeShadowRankingModelSha256(model) {
  const { payload } = normalizeModelPayload(model);
  return hashModelPayload(payload);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function validateShadowRankingModel(model) {
  const { payload, modelSha256 } = normalizeModelPayload(model);
  const actualSha256 = hashModelPayload(payload);
  if (actualSha256 !== modelSha256) {
    throw invalid(
      'model.modelSha256 does not match the canonical LR-S0 model payload.',
      'model.modelSha256',
      { expectedSha256: modelSha256, actualSha256 },
    );
  }
  return deepFreeze({
    ...payload,
    modelSha256,
  });
}

function assertSafeFrozenObservationGraph(root) {
  const pending = [{ value: root, path: 'observation', depth: 0 }];
  const seen = new WeakSet();
  let nodeCount = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    const { value, path, depth } = current;

    if (value === null) {
      continue;
    }
    const valueType = typeof value;
    if (valueType === 'string' || valueType === 'boolean') {
      continue;
    }
    if (valueType === 'number') {
      if (!Number.isFinite(value)) {
        throw invalid('Observation graph must contain only finite numbers.', path);
      }
      continue;
    }
    if (valueType !== 'object') {
      throw invalid('Observation graph must contain only frozen JSON-like data.', path);
    }
    if (isProxy(value)) {
      throw invalid('Proxy values are not allowed in the shadow observation boundary.', path);
    }
    if (depth > MAX_SAFE_GRAPH_DEPTH) {
      throw invalid('Observation graph exceeds the LR-S0 depth boundary.', path, {
        maximumDepth: MAX_SAFE_GRAPH_DEPTH,
      });
    }
    nodeCount += 1;
    if (nodeCount > MAX_SAFE_GRAPH_NODES) {
      throw invalid('Observation graph exceeds the LR-S0 node boundary.', path, {
        maximumNodes: MAX_SAFE_GRAPH_NODES,
      });
    }
    if (seen.has(value)) {
      throw invalid('Observation graph must not contain cycles or shared object references.', path);
    }
    seen.add(value);

    let frozen;
    try {
      frozen = Object.isFrozen(value);
    } catch {
      throw invalid('Observation freeze state could not be inspected safely.', path);
    }
    if (!frozen) {
      throw invalid('Shadow ranking requires a deeply frozen produced OptimizerObservation.', path);
    }

    if (Array.isArray(value)) {
      let prototype;
      try {
        prototype = Object.getPrototypeOf(value);
      } catch {
        throw invalid('Observation array prototype could not be inspected safely.', path);
      }
      if (prototype !== Array.prototype) {
        throw invalid('Observation arrays must use the native Array prototype.', path);
      }

      let keys;
      try {
        keys = Reflect.ownKeys(value);
      } catch {
        throw invalid('Observation array keys could not be inspected safely.', path);
      }
      for (const key of keys) {
        if (typeof key !== 'string') {
          throw invalid('Observation arrays must not contain symbol properties.', path);
        }
        if (key === 'length') {
          continue;
        }
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
          throw invalid('Observation arrays must not contain custom properties.', path, { key });
        }
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (!Object.hasOwn(value, index)) {
          throw invalid('Observation arrays must be dense.', `${path}[${index}]`);
        }
        let descriptor;
        try {
          descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        } catch {
          throw invalid('Observation array entry could not be inspected safely.', `${path}[${index}]`);
        }
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
          throw invalid('Observation arrays must contain enumerable own data entries.', `${path}[${index}]`);
        }
        pending.push({
          value: descriptor.value,
          path: `${path}[${index}]`,
          depth: depth + 1,
        });
      }
      continue;
    }

    let prototype;
    try {
      prototype = Object.getPrototypeOf(value);
    } catch {
      throw invalid('Observation object prototype could not be inspected safely.', path);
    }
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalid('Observation objects must be plain objects.', path);
    }

    let keys;
    try {
      keys = Reflect.ownKeys(value);
    } catch {
      throw invalid('Observation object keys could not be inspected safely.', path);
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (typeof key !== 'string') {
        throw invalid('Observation objects must not contain symbol properties.', path);
      }
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch {
        throw invalid('Observation field could not be inspected safely.', `${path}.${key}`);
      }
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw invalid('Observation objects must contain enumerable own data fields.', `${path}.${key}`);
      }
      pending.push({
        value: descriptor.value,
        path: `${path}.${key}`,
        depth: depth + 1,
      });
    }
  }
}

function normalizeObservation(observation) {
  assertSafeFrozenObservationGraph(observation);
  let digest;
  try {
    digest = createOptimizerObservationDigest(observation);
  } catch (error) {
    throw invalid('A valid produced OptimizerObservation is required.', 'observation', {
      causeCode: error && error.code,
    });
  }
  if (observation.contractVersion !== OPTIMIZER_OBSERVATION_VERSION) {
    throw invalid('observation.contractVersion is not supported.', 'observation.contractVersion');
  }
  return { observation, digest };
}

function comparePositions(left, right) {
  return left.string - right.string || left.fret - right.fret;
}

function samePosition(left, right) {
  return left.string === right.string && left.fret === right.fret;
}

function clonePosition(position) {
  return {
    string: position.string,
    fret: position.fret,
  };
}

function boundedScore(value, field) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_SHADOW_SCORE) {
    throw invalid('Shadow score exceeded the finite LR-S0 score boundary.', field, {
      maximumAbsoluteScore: MAX_ABSOLUTE_SHADOW_SCORE,
      value,
    });
  }
  return Object.is(value, -0) ? 0 : value;
}

function scoreFeatures(features, weights, field) {
  let total = 0;
  for (const feature of FEATURE_FIELDS) {
    const rawValue = features[feature];
    const numericValue = typeof rawValue === 'boolean' ? (rawValue ? 1 : 0) : rawValue;
    if (!Number.isFinite(numericValue)) {
      throw invalid('Pedagogical feature must be finite or boolean.', `${field}.${feature}`);
    }
    const component = boundedScore(
      numericValue * weights[feature],
      `${field}.${feature}`,
    );
    total = boundedScore(total + component, field);
  }
  return total;
}

function assignPathRanks(states) {
  const ordered = [...states].sort((left, right) => {
    const previousRankLeft = left.previousState ? left.previousState.pathRank : -1;
    const previousRankRight = right.previousState ? right.previousState.pathRank : -1;
    return (
      previousRankLeft - previousRankRight
      || comparePositions(left.position, right.position)
      || left.candidateId.localeCompare(right.candidateId)
    );
  });
  for (let index = 0; index < ordered.length; index += 1) {
    ordered[index].pathRank = index;
  }
}

function chooseTransition(current, candidate) {
  if (current === null) {
    return candidate;
  }
  if (candidate.cumulativeScore < current.cumulativeScore) {
    return candidate;
  }
  if (candidate.cumulativeScore > current.cumulativeScore) {
    return current;
  }
  return candidate.previousState.pathRank < current.previousState.pathRank
    ? candidate
    : current;
}

function chooseFinal(current, candidate) {
  if (current === null) {
    return candidate;
  }
  if (candidate.cumulativeScore < current.cumulativeScore) {
    return candidate;
  }
  if (candidate.cumulativeScore > current.cumulativeScore) {
    return current;
  }
  return candidate.pathRank < current.pathRank ? candidate : current;
}

function buildShadowPath(observation, model) {
  if (observation.noteCount === 0) {
    return {
      totalScore: 0,
      states: [],
    };
  }

  let states = [];
  const firstDecision = observation.decisions[0];
  for (let candidateIndex = 0; candidateIndex < firstDecision.candidates.length; candidateIndex += 1) {
    const candidate = firstDecision.candidates[candidateIndex];
    const features = createPedagogicalFeatureVector(null, candidate.position);
    const localScore = scoreFeatures(
      features,
      model.featureWeights,
      `shadow.decisions[0].candidates[${candidateIndex}].score`,
    );
    states.push({
      decisionIndex: 0,
      eventId: firstDecision.eventId,
      candidateId: candidate.candidateId,
      position: clonePosition(candidate.position),
      features,
      localScore,
      cumulativeScore: localScore,
      previousState: null,
      pathRank: -1,
    });
  }
  assignPathRanks(states);

  for (let decisionIndex = 1; decisionIndex < observation.decisions.length; decisionIndex += 1) {
    const decision = observation.decisions[decisionIndex];
    const nextStates = [];

    for (let candidateIndex = 0; candidateIndex < decision.candidates.length; candidateIndex += 1) {
      const candidate = decision.candidates[candidateIndex];
      let best = null;
      for (let previousIndex = 0; previousIndex < states.length; previousIndex += 1) {
        const previousState = states[previousIndex];
        const features = createPedagogicalFeatureVector(
          previousState.position,
          candidate.position,
        );
        const localScore = scoreFeatures(
          features,
          model.featureWeights,
          `shadow.decisions[${decisionIndex}].candidates[${candidateIndex}].score`,
        );
        const cumulativeScore = boundedScore(
          previousState.cumulativeScore + localScore,
          `shadow.decisions[${decisionIndex}].cumulativeScore`,
        );
        best = chooseTransition(best, {
          decisionIndex,
          eventId: decision.eventId,
          candidateId: candidate.candidateId,
          position: clonePosition(candidate.position),
          features,
          localScore,
          cumulativeScore,
          previousState,
          pathRank: -1,
        });
      }
      if (best !== null) {
        nextStates.push(best);
      }
    }

    if (nextStates.length === 0) {
      throw invalid('Shadow ranking produced no finite candidate path.', `shadow.decisions[${decisionIndex}]`);
    }
    assignPathRanks(nextStates);
    states = nextStates;
  }

  let best = null;
  for (let index = 0; index < states.length; index += 1) {
    best = chooseFinal(best, states[index]);
  }
  if (best === null) {
    throw invalid('Shadow ranking produced no finite candidate path.', 'shadow');
  }

  const path = [];
  for (let state = best; state !== null; state = state.previousState) {
    path.push(state);
  }
  path.reverse();
  return {
    totalScore: best.cumulativeScore,
    states: path,
  };
}

function buildBaseline(observation) {
  const candidateIds = [];
  const positions = [];
  for (let index = 0; index < observation.decisions.length; index += 1) {
    const decision = observation.decisions[index];
    candidateIds.push(decision.selectedCandidateId);
    positions.push(clonePosition(decision.selectedPosition));
  }
  return {
    totalCost: observation.totalCost,
    candidateIds,
    positions,
  };
}

function buildShadowReport(pathResult) {
  const candidateIds = [];
  const positions = [];
  const decisions = [];
  for (let index = 0; index < pathResult.states.length; index += 1) {
    const state = pathResult.states[index];
    candidateIds.push(state.candidateId);
    positions.push(clonePosition(state.position));
    decisions.push({
      decisionIndex: state.decisionIndex,
      eventId: state.eventId,
      candidateId: state.candidateId,
      position: clonePosition(state.position),
      localScore: state.localScore,
      cumulativeScore: state.cumulativeScore,
      features: {
        contractVersion: state.features.contractVersion,
        fretMovement: state.features.fretMovement,
        stringMovement: state.features.stringMovement,
        positionContinuity: state.features.positionContinuity,
        openStringUsage: state.features.openStringUsage,
        largeShift: state.features.largeShift,
        handStability: state.features.handStability,
        phraseContinuity: state.features.phraseContinuity,
      },
    });
  }
  return {
    totalScore: pathResult.totalScore,
    candidateIds,
    positions,
    decisions,
  };
}

function buildComparison(baseline, shadow) {
  const divergentDecisionIndexes = [];
  for (let index = 0; index < baseline.candidateIds.length; index += 1) {
    if (baseline.candidateIds[index] !== shadow.candidateIds[index]) {
      divergentDecisionIndexes.push(index);
    }
  }
  return {
    samePath: divergentDecisionIndexes.length === 0,
    divergentDecisionCount: divergentDecisionIndexes.length,
    divergentDecisionIndexes,
  };
}

function createShadowRankingReport(input) {
  assertExactOwnDataFields(input, ['observation', 'model'], 'input');
  const observationInput = getOwnDataValue(input, 'observation', 'input.observation');
  const modelInput = getOwnDataValue(input, 'model', 'input.model');
  const { observation, digest } = normalizeObservation(observationInput);
  const model = validateShadowRankingModel(modelInput);

  const baseline = buildBaseline(observation);
  const pathResult = buildShadowPath(observation, model);
  const shadow = buildShadowReport(pathResult);
  const comparison = buildComparison(baseline, shadow);

  return deepFreeze({
    documentType: 'ShadowRankingReport',
    contractVersion: SHADOW_RANKING_CONTRACT_VERSION,
    mode: 'shadow',
    authority: 'none',
    model: {
      contractVersion: model.contractVersion,
      modelId: model.modelId,
      modelVersion: model.modelVersion,
      modelKind: model.modelKind,
      featureContractVersion: model.featureContractVersion,
      scoreDirection: model.scoreDirection,
      modelSha256: model.modelSha256,
    },
    observation: {
      contractVersion: observation.contractVersion,
      digest: {
        contractVersion: digest.contractVersion,
        algorithm: digest.algorithm,
        value: digest.value,
      },
    },
    baseline,
    shadow,
    comparison,
  });
}

module.exports = {
  SHADOW_RANKING_CONTRACT_VERSION,
  SHADOW_RANKING_MODEL_CONTRACT_VERSION,
  ShadowRankingError,
  computeShadowRankingModelSha256,
  validateShadowRankingModel,
  createShadowRankingReport,
};
