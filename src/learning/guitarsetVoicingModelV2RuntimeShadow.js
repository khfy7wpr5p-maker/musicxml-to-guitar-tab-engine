'use strict';

const { EngineError } = require('../errors/engineError');
const {
  PROCESSING_ABORTED,
  PROCESSING_DEADLINE_EXCEEDED,
  isProcessingRuntime,
} = require('../core/processingRuntime');
const {
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_VERSION,
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_DOCUMENT_TYPE,
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_POLICY,
} = require('../music/deterministicPa7CandidateSnapshotHandoff');
const {
  isAuthenticGuitarVoicingCandidateModelSnapshot,
} = require('../music/guitarVoicingCandidateModel');
const {
  createBlindBaselineEngineExecution,
} = require('../benchmark/blindBaselineEngineObserver');
const {
  GUITARSET_VOICING_MODEL_V2_SHADOW_VERSION,
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_FEATURE_SCHEMA_SHA256,
  EXPECTED_PROTOCOL_SHA256,
  EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
  MODEL_MAX_FRET,
  validateModelArtifactV2,
  createGuitarSetVoicingModelV2FeatureVector,
} = require('./guitarsetVoicingModelV2Shadow');

const GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION = '1.0.0';
const GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_DOCUMENT_TYPE =
  'GuitarSetVoicingModelV2RuntimeShadowConnection';
const GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE =
  'ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1';
const GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY =
  'INTERNAL_DEFAULT_OFF_READ_COPY_NON_AUTHORITATIVE_1.0';

class GuitarSetVoicingModelV2RuntimeShadowError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_GUITARSET_V2_RUNTIME_SHADOW_CONNECTION',
      Object.freeze({ ...details }),
      'GuitarSetVoicingModelV2RuntimeShadowError',
    );
  }
}

function invalid(message, details = {}) {
  return new GuitarSetVoicingModelV2RuntimeShadowError(message, details);
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function validateOptionalRuntime(runtime) {
  if (runtime !== null && runtime !== undefined && !isProcessingRuntime(runtime)) {
    throw invalid('Runtime shadow runtime must be a ProcessingRuntime 1.0.0 value.', {
      field: 'runtime',
    });
  }
  return runtime ?? null;
}

function isRuntimeSafetyError(error) {
  return Boolean(error && (
    error.code === PROCESSING_ABORTED
    || error.code === PROCESSING_DEADLINE_EXCEEDED
    || error.code === 'INVALID_CONFIGURATION'
  ));
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(root, runtime = null, phase = 'guitarset-v2-runtime-shadow:freeze') {
  const pending = [root];
  const seen = new WeakSet();
  let objectIndex = 0;
  while (pending.length > 0) {
    checkpoint(runtime, phase, { objectIndex, pendingCount: pending.length });
    objectIndex += 1;
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function clonePlainData(value, runtime, path = 'snapshot') {
  checkpoint(runtime, 'guitarset-v2-runtime-shadow:copy', { path });
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const clone = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      checkpoint(runtime, 'guitarset-v2-runtime-shadow:copy-array', { path, index });
      clone[index] = clonePlainData(value[index], runtime, `${path}[${index}]`);
    }
    return clone;
  }
  if (!isPlainObject(value)) {
    throw invalid('Runtime shadow read-copy source contains a non-plain object.', { path });
  }
  const clone = {};
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    checkpoint(runtime, 'guitarset-v2-runtime-shadow:copy-field', { path, index, key });
    clone[key] = clonePlainData(value[key], runtime, `${path}.${key}`);
  }
  return clone;
}

function samePosition(left, right) {
  return left.sourceEventId === right.sourceEventId
    && left.targetMidi === right.targetMidi
    && left.string === right.string
    && left.fret === right.fret;
}

function assertReadCopyIdentity(sourceSnapshot, readCopy, runtime) {
  if (
    readCopy === sourceSnapshot
    || !Object.isFrozen(readCopy)
    || readCopy.groupCount !== sourceSnapshot.groupCount
    || readCopy.candidateCount !== sourceSnapshot.candidateCount
    || !Array.isArray(readCopy.groups)
    || readCopy.groups.length !== sourceSnapshot.groups.length
  ) {
    throw invalid('Runtime shadow read-copy failed aggregate PA-7 identity preservation.');
  }

  for (let groupIndex = 0; groupIndex < sourceSnapshot.groups.length; groupIndex += 1) {
    checkpoint(runtime, 'guitarset-v2-runtime-shadow:verify-copy-group', { groupIndex });
    const sourceGroup = sourceSnapshot.groups[groupIndex];
    const copiedGroup = readCopy.groups[groupIndex];
    if (
      copiedGroup === sourceGroup
      || copiedGroup.sourceGroupId !== sourceGroup.sourceGroupId
      || copiedGroup.candidateCount !== sourceGroup.candidateCount
      || !Array.isArray(copiedGroup.candidates)
      || copiedGroup.candidates.length !== sourceGroup.candidates.length
    ) {
      throw invalid('Runtime shadow read-copy failed PA-7 group preservation.', { groupIndex });
    }

    for (let candidateIndex = 0; candidateIndex < sourceGroup.candidates.length; candidateIndex += 1) {
      checkpoint(runtime, 'guitarset-v2-runtime-shadow:verify-copy-candidate', {
        groupIndex,
        candidateIndex,
      });
      const sourceCandidate = sourceGroup.candidates[candidateIndex];
      const copiedCandidate = copiedGroup.candidates[candidateIndex];
      if (
        copiedCandidate === sourceCandidate
        || copiedCandidate.candidateId !== sourceCandidate.candidateId
        || copiedCandidate.positionCount !== sourceCandidate.positionCount
        || !Array.isArray(copiedCandidate.positions)
        || copiedCandidate.positions.length !== sourceCandidate.positions.length
      ) {
        throw invalid('Runtime shadow read-copy failed PA-7 candidate identity/order preservation.', {
          groupIndex,
          candidateIndex,
        });
      }
      for (let positionIndex = 0; positionIndex < sourceCandidate.positions.length; positionIndex += 1) {
        checkpoint(runtime, 'guitarset-v2-runtime-shadow:verify-copy-position', {
          groupIndex,
          candidateIndex,
          positionIndex,
        });
        if (!samePosition(sourceCandidate.positions[positionIndex], copiedCandidate.positions[positionIndex])) {
          throw invalid('Runtime shadow read-copy failed PA-7 position-fact preservation.', {
            groupIndex,
            candidateIndex,
            positionIndex,
          });
        }
      }
    }
  }
}

function assertHandoff(handoff) {
  if (
    !handoff
    || handoff.documentType !== DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_DOCUMENT_TYPE
    || handoff.contractVersion !== DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_VERSION
    || handoff.policy !== DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_POLICY
    || handoff.candidateGenerationCount !== 1
    || handoff.candidateIdentityPreserved !== true
    || handoff.candidateOrderPreserved !== true
    || handoff.candidatePositionFactsPreserved !== true
    || !handoff.voicingCandidateSnapshot
    || !isAuthenticGuitarVoicingCandidateModelSnapshot(handoff.voicingCandidateSnapshot)
    || !Object.isFrozen(handoff)
  ) {
    throw invalid('Runtime shadow requires the authentic single-generation deterministic PA-7 handoff.');
  }
  if (
    handoff.groupCount !== handoff.voicingCandidateSnapshot.groupCount
    || handoff.candidateCount !== handoff.voicingCandidateSnapshot.candidateCount
  ) {
    throw invalid('Runtime shadow handoff aggregate counts are inconsistent.');
  }
}

function authorityBoundary() {
  return {
    runtimeConnectionAuthorized: true,
    shadowExecutionAuthorized: true,
    liveOrUserInputAuthorized: false,
    candidateGenerationAuthorized: false,
    candidateMutationAuthorized: false,
    candidateFilteringAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    checkpointMutationAuthorized: false,
    refitAuthorized: false,
    productionAuthorized: false,
    fret20QualityAuthority: false,
  };
}

function observationBase(handoff) {
  return {
    documentType: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_DOCUMENT_TYPE,
    contractVersion: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION,
    gate: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
    policy: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY,
    defaultEnabled: false,
    candidateSourceAuthentic: true,
    singlePa7GenerationObserved: handoff.candidateGenerationCount === 1,
    groupCount: handoff.groupCount,
    candidateCount: handoff.candidateCount,
    retainedModelArtifactSha256: EXPECTED_MODEL_ARTIFACT_SHA256,
    featureSchemaSha256: EXPECTED_FEATURE_SCHEMA_SHA256,
    protocolSha256: EXPECTED_PROTOCOL_SHA256,
    shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
    ...authorityBoundary(),
  };
}

function disabledObservation(handoff) {
  return deepFreeze({
    ...observationBase(handoff),
    status: 'RUNTIME_SHADOW_DISABLED_DEFAULT',
    enabled: false,
    shadowExecutionOccurred: false,
    candidateReadCopyCreated: false,
    shadowReport: null,
    isolatedErrorCode: null,
  });
}

function notApplicableObservation() {
  return deepFreeze({
    documentType: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_DOCUMENT_TYPE,
    contractVersion: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION,
    gate: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
    policy: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY,
    status: 'RUNTIME_SHADOW_NOT_APPLICABLE_NO_PA7_MULTI_NOTE_HANDOFF',
    defaultEnabled: false,
    enabled: false,
    shadowExecutionOccurred: false,
    candidateReadCopyCreated: false,
    candidateSourceAuthentic: false,
    singlePa7GenerationObserved: false,
    groupCount: 0,
    candidateCount: 0,
    retainedModelArtifactSha256: EXPECTED_MODEL_ARTIFACT_SHA256,
    featureSchemaSha256: EXPECTED_FEATURE_SCHEMA_SHA256,
    protocolSha256: EXPECTED_PROTOCOL_SHA256,
    shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
    shadowReport: null,
    isolatedErrorCode: null,
    ...authorityBoundary(),
  });
}

function canonicalTriples(candidate) {
  return candidate.positions
    .map((position) => [position.targetMidi, position.string, position.fret])
    .sort((left, right) => (
      left[0] - right[0]
      || left[1] - right[1]
      || left[2] - right[2]
    ));
}

function compareCanonicalCandidates(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    for (let field = 0; field < 3; field += 1) {
      if (left[index][field] !== right[index][field]) {
        return left[index][field] - right[index][field];
      }
    }
  }
  return left.length - right.length;
}

function scoreWithValidatedModel(candidateTriples, retainedModel) {
  const features = createGuitarSetVoicingModelV2FeatureVector(candidateTriples);
  let score = 0;
  for (let index = 0; index < retainedModel.coefficient.length; index += 1) {
    score += ((features[index] - retainedModel.mean[index]) / retainedModel.scale[index])
      * retainedModel.coefficient[index];
  }
  if (!Number.isFinite(score)) {
    throw invalid('Runtime GuitarSet v2 shadow score is not finite.');
  }
  return score;
}

function createRuntimeBudgetedShadowReport(readCopy, modelArtifact, runtime) {
  checkpoint(runtime, 'guitarset-v2-runtime-shadow:model-validate');
  const retainedModel = validateModelArtifactV2(modelArtifact);
  const groups = new Array(readCopy.groups.length);
  let aggregateCandidateCount = 0;
  let scoredGroupCount = 0;
  let unsupportedGroupCount = 0;
  let noCandidateGroupCount = 0;
  let fret20CandidateCount = 0;
  let fret20CandidateGroupCount = 0;

  for (let groupIndex = 0; groupIndex < readCopy.groups.length; groupIndex += 1) {
    checkpoint(runtime, 'guitarset-v2-runtime-shadow:score-group', { groupIndex });
    const sourceGroup = readCopy.groups[groupIndex];
    const scored = new Array(sourceGroup.candidates.length);
    let groupFret20Count = 0;

    for (let candidateIndex = 0; candidateIndex < sourceGroup.candidates.length; candidateIndex += 1) {
      checkpoint(runtime, 'guitarset-v2-runtime-shadow:score-candidate', {
        groupIndex,
        candidateIndex,
      });
      const candidate = sourceGroup.candidates[candidateIndex];
      const canonical = canonicalTriples(candidate);
      const containsFret20 = canonical.some((row) => row[2] === MODEL_MAX_FRET);
      if (containsFret20) groupFret20Count += 1;
      scored[candidateIndex] = {
        candidateId: candidate.candidateId,
        canonical,
        score: scoreWithValidatedModel(canonical, retainedModel),
        containsFret20,
      };
    }

    aggregateCandidateCount += scored.length;
    fret20CandidateCount += groupFret20Count;
    if (groupFret20Count > 0) fret20CandidateGroupCount += 1;

    const base = {
      sourceGroupId: sourceGroup.sourceGroupId,
      candidateCount: scored.length,
      targetMidis: [...sourceGroup.targetMidis].sort((left, right) => left - right),
      fret20CandidateCount: groupFret20Count,
      authoritativeDecisionEffectAuthorized: false,
      canonicalResultEffectAuthorized: false,
    };

    if (scored.length === 0) {
      unsupportedGroupCount += 1;
      noCandidateGroupCount += 1;
      groups[groupIndex] = {
        ...base,
        status: 'SHADOW_NOT_SCORED_NO_AUTHORITATIVE_CANDIDATES',
        shadowScored: false,
        modelDomainComplete: true,
        topCandidateId: null,
        candidateScores: [],
      };
      continue;
    }

    scored.sort((left, right) => {
      checkpoint(runtime, 'guitarset-v2-runtime-shadow:sort-candidate', { groupIndex });
      if (left.score !== right.score) return right.score - left.score;
      return compareCanonicalCandidates(left.canonical, right.canonical);
    });
    scoredGroupCount += 1;

    const candidateScores = scored.map((entry, index) => {
      checkpoint(runtime, 'guitarset-v2-runtime-shadow:emit-candidate-score', {
        groupIndex,
        candidateIndex: index,
      });
      return {
        candidateId: entry.candidateId,
        rank: index + 1,
        score: entry.score,
        containsFret20: entry.containsFret20,
      };
    });

    groups[groupIndex] = {
      ...base,
      status: 'SHADOW_SCORED_OFFLINE_NON_AUTHORITATIVE_V2',
      shadowScored: true,
      modelDomainComplete: true,
      topCandidateId: scored[0].candidateId,
      candidateScores,
    };
  }

  if (aggregateCandidateCount !== readCopy.candidateCount) {
    throw invalid('Runtime shadow aggregate candidate count diverged from PA-7.', {
      expected: readCopy.candidateCount,
      actual: aggregateCandidateCount,
    });
  }

  return deepFreeze({
    documentType: 'GuitarSetObservedVoicingShadowReport',
    contractVersion: GUITARSET_VOICING_MODEL_V2_SHADOW_VERSION,
    mode: 'OFFLINE_ADAPTER_PARITY_ONLY',
    sourceDocumentType: readCopy.documentType,
    sourceContractVersion: readCopy.contractVersion,
    sourcePolicy: readCopy.policy,
    shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
    retainedModelArtifactSha256: retainedModel.artifactSha256,
    featureSchemaSha256: retainedModel.featureSchemaSha256,
    protocolSha256: retainedModel.protocolSha256,
    candidateFretDomain: retainedModel.candidateFretDomain,
    sourceObservedFretDomain: retainedModel.sourceObservedFretDomain,
    groupCount: groups.length,
    candidateCount: aggregateCandidateCount,
    scoredGroupCount,
    unsupportedGroupCount,
    noCandidateGroupCount,
    fret20CandidateCount,
    fret20CandidateGroupCount,
    groups,
    candidateMutationAuthorized: false,
    candidateFilteringAuthorized: false,
    candidateGenerationAuthorized: false,
    shadowIntegrationAuthorized: true,
    shadowExecutionAuthorized: false,
    liveOrUserInputAuthorized: false,
    runtimeConnectionAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    fret20CandidateScoringAuthorized: true,
    fret20QualityAuthority: false,
    productionAuthorized: false,
  }, runtime, 'guitarset-v2-runtime-shadow:freeze-report');
}

function assertShadowCoverage(sourceSnapshot, shadowReport, runtime) {
  if (
    shadowReport.groupCount !== sourceSnapshot.groupCount
    || shadowReport.candidateCount !== sourceSnapshot.candidateCount
    || shadowReport.groups.length !== sourceSnapshot.groups.length
  ) {
    throw invalid('Runtime shadow report aggregate candidate coverage diverged from PA-7.');
  }

  for (let groupIndex = 0; groupIndex < sourceSnapshot.groups.length; groupIndex += 1) {
    checkpoint(runtime, 'guitarset-v2-runtime-shadow:verify-report-group', { groupIndex });
    const sourceGroup = sourceSnapshot.groups[groupIndex];
    const shadowGroup = shadowReport.groups[groupIndex];
    if (
      shadowGroup.sourceGroupId !== sourceGroup.sourceGroupId
      || shadowGroup.candidateCount !== sourceGroup.candidateCount
    ) {
      throw invalid('Runtime shadow report group identity/count diverged from PA-7.', { groupIndex });
    }
    const expectedIds = new Set(sourceGroup.candidates.map((candidate) => candidate.candidateId));
    if (shadowGroup.candidateScores.length !== expectedIds.size) {
      throw invalid('Runtime shadow report candidate coverage diverged from PA-7.', {
        groupIndex,
        sourceGroupId: sourceGroup.sourceGroupId,
      });
    }
    for (let candidateIndex = 0; candidateIndex < shadowGroup.candidateScores.length; candidateIndex += 1) {
      checkpoint(runtime, 'guitarset-v2-runtime-shadow:verify-report-candidate', {
        groupIndex,
        candidateIndex,
      });
      const candidateId = shadowGroup.candidateScores[candidateIndex].candidateId;
      if (!expectedIds.delete(candidateId)) {
        throw invalid('Runtime shadow report candidate coverage diverged from PA-7.', {
          groupIndex,
          sourceGroupId: sourceGroup.sourceGroupId,
          candidateId,
        });
      }
    }
    if (expectedIds.size !== 0) {
      throw invalid('Runtime shadow report omitted PA-7 candidates.', {
        groupIndex,
        sourceGroupId: sourceGroup.sourceGroupId,
      });
    }
  }
}

function observeGuitarSetVoicingModelV2RuntimeShadow(
  handoff,
  modelArtifact,
  { enabled = false, runtime = null } = {},
) {
  assertHandoff(handoff);
  const processing = validateOptionalRuntime(runtime);
  if (typeof enabled !== 'boolean') {
    throw invalid('Runtime shadow enabled flag must be boolean.', { field: 'enabled' });
  }
  if (!enabled) return disabledObservation(handoff);

  const sourceSnapshot = handoff.voicingCandidateSnapshot;
  let candidateReadCopyCreated = false;
  try {
    checkpoint(processing, 'guitarset-v2-runtime-shadow:start');
    const readCopy = deepFreeze(
      clonePlainData(sourceSnapshot, processing),
      processing,
      'guitarset-v2-runtime-shadow:freeze-copy',
    );
    candidateReadCopyCreated = true;
    assertReadCopyIdentity(sourceSnapshot, readCopy, processing);

    const shadowReport = createRuntimeBudgetedShadowReport(readCopy, modelArtifact, processing);
    assertShadowCoverage(sourceSnapshot, shadowReport, processing);
    checkpoint(processing, 'guitarset-v2-runtime-shadow:complete');

    return deepFreeze({
      ...observationBase(handoff),
      status: 'RUNTIME_SHADOW_SCORED_NON_AUTHORITATIVE',
      enabled: true,
      shadowExecutionOccurred: true,
      candidateReadCopyCreated: true,
      shadowReport,
      isolatedErrorCode: null,
    }, processing, 'guitarset-v2-runtime-shadow:freeze-observation');
  } catch (error) {
    if (isRuntimeSafetyError(error)) throw error;
    return deepFreeze({
      ...observationBase(handoff),
      status: 'RUNTIME_SHADOW_FAILURE_ISOLATED',
      enabled: true,
      shadowExecutionOccurred: false,
      candidateReadCopyCreated,
      shadowReport: null,
      isolatedErrorCode: error && typeof error.code === 'string' ? error.code : 'UNCLASSIFIED_SHADOW_ERROR',
    });
  }
}

function createBlindBaselineGuitarSetV2RuntimeShadowObservation(
  sourceModel,
  {
    enabled = false,
    modelArtifact = null,
    runtime = null,
  } = {},
) {
  if (typeof enabled !== 'boolean') {
    throw invalid('Runtime shadow enabled flag must be boolean.', { field: 'enabled' });
  }
  const processing = validateOptionalRuntime(runtime);
  const execution = createBlindBaselineEngineExecution(sourceModel, processing);
  const shadowObservation = execution.handoff
    ? observeGuitarSetVoicingModelV2RuntimeShadow(
      execution.handoff,
      modelArtifact,
      { enabled, runtime: processing },
    )
    : notApplicableObservation();

  return deepFreeze({
    documentType: 'BlindBaselineGuitarSetV2RuntimeShadowObservation',
    contractVersion: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION,
    gate: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
    deterministicResult: execution.result,
    shadowObservation,
    samePa7LineageUsedForDeterministicSelectionAndShadow:
      Boolean(execution.handoff && execution.handoff.candidateGenerationCount === 1),
    deterministicSelectionEffectFromShadowAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    productionAuthorized: false,
  }, processing, 'guitarset-v2-runtime-shadow:freeze-composite-observation');
}

module.exports = {
  GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION,
  GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_DOCUMENT_TYPE,
  GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
  GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY,
  GuitarSetVoicingModelV2RuntimeShadowError,
  observeGuitarSetVoicingModelV2RuntimeShadow,
  createBlindBaselineGuitarSetV2RuntimeShadowObservation,
};
