'use strict';

const { EngineError } = require('../errors/engineError');
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
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_FEATURE_SCHEMA_SHA256,
  EXPECTED_PROTOCOL_SHA256,
  EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
  createGuitarSetVoicingModelV2ShadowReport,
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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
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

function clonePlainData(value, path = 'snapshot') {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((entry, index) => clonePlainData(entry, `${path}[${index}]`));
  }
  if (!isPlainObject(value)) {
    throw invalid('Runtime shadow read-copy source contains a non-plain object.', { path });
  }
  const clone = {};
  for (const key of Object.keys(value)) {
    clone[key] = clonePlainData(value[key], `${path}.${key}`);
  }
  return clone;
}

function candidateIdentity(snapshot) {
  return snapshot.groups.map((group) => ({
    sourceGroupId: group.sourceGroupId,
    candidateIds: group.candidates.map((candidate) => candidate.candidateId),
    positions: group.candidates.map((candidate) => candidate.positions.map((position) => [
      position.sourceEventId,
      position.targetMidi,
      position.string,
      position.fret,
    ])),
  }));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function disabledObservation(handoff) {
  return deepFreeze({
    documentType: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_DOCUMENT_TYPE,
    contractVersion: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION,
    gate: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
    policy: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY,
    status: 'RUNTIME_SHADOW_DISABLED_DEFAULT',
    defaultEnabled: false,
    enabled: false,
    shadowExecutionOccurred: false,
    candidateReadCopyCreated: false,
    candidateSourceAuthentic: true,
    singlePa7GenerationObserved: handoff.candidateGenerationCount === 1,
    groupCount: handoff.groupCount,
    candidateCount: handoff.candidateCount,
    retainedModelArtifactSha256: EXPECTED_MODEL_ARTIFACT_SHA256,
    featureSchemaSha256: EXPECTED_FEATURE_SCHEMA_SHA256,
    protocolSha256: EXPECTED_PROTOCOL_SHA256,
    shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
    shadowReport: null,
    isolatedErrorCode: null,
    ...authorityBoundary(),
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

function assertShadowCoverage(sourceSnapshot, shadowReport) {
  if (
    shadowReport.groupCount !== sourceSnapshot.groupCount
    || shadowReport.candidateCount !== sourceSnapshot.candidateCount
    || shadowReport.groups.length !== sourceSnapshot.groups.length
  ) {
    throw invalid('Runtime shadow report aggregate candidate coverage diverged from PA-7.');
  }

  for (let groupIndex = 0; groupIndex < sourceSnapshot.groups.length; groupIndex += 1) {
    const sourceGroup = sourceSnapshot.groups[groupIndex];
    const shadowGroup = shadowReport.groups[groupIndex];
    if (
      shadowGroup.sourceGroupId !== sourceGroup.sourceGroupId
      || shadowGroup.candidateCount !== sourceGroup.candidateCount
    ) {
      throw invalid('Runtime shadow report group identity/count diverged from PA-7.', { groupIndex });
    }
    const sourceIds = sourceGroup.candidates.map((candidate) => candidate.candidateId).sort();
    const shadowIds = shadowGroup.candidateScores.map((candidate) => candidate.candidateId).sort();
    if (
      sourceIds.length !== shadowIds.length
      || sourceIds.some((candidateId, index) => candidateId !== shadowIds[index])
    ) {
      throw invalid('Runtime shadow report candidate coverage diverged from PA-7.', {
        groupIndex,
        sourceGroupId: sourceGroup.sourceGroupId,
      });
    }
  }
}

function observeGuitarSetVoicingModelV2RuntimeShadow(
  handoff,
  modelArtifact,
  { enabled = false } = {},
) {
  assertHandoff(handoff);
  if (typeof enabled !== 'boolean') {
    throw invalid('Runtime shadow enabled flag must be boolean.', { field: 'enabled' });
  }
  if (!enabled) return disabledObservation(handoff);

  const sourceSnapshot = handoff.voicingCandidateSnapshot;
  try {
    const readCopy = deepFreeze(clonePlainData(sourceSnapshot));
    if (
      readCopy === sourceSnapshot
      || !Object.isFrozen(readCopy)
      || !sameJson(candidateIdentity(readCopy), candidateIdentity(sourceSnapshot))
    ) {
      throw invalid('Runtime shadow read-copy failed candidate identity preservation.');
    }

    const shadowReport = createGuitarSetVoicingModelV2ShadowReport(readCopy, modelArtifact);
    assertShadowCoverage(sourceSnapshot, shadowReport);

    return deepFreeze({
      documentType: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_DOCUMENT_TYPE,
      contractVersion: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION,
      gate: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
      policy: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY,
      status: 'RUNTIME_SHADOW_SCORED_NON_AUTHORITATIVE',
      defaultEnabled: false,
      enabled: true,
      shadowExecutionOccurred: true,
      candidateReadCopyCreated: true,
      candidateSourceAuthentic: true,
      singlePa7GenerationObserved: handoff.candidateGenerationCount === 1,
      groupCount: handoff.groupCount,
      candidateCount: handoff.candidateCount,
      retainedModelArtifactSha256: EXPECTED_MODEL_ARTIFACT_SHA256,
      featureSchemaSha256: EXPECTED_FEATURE_SCHEMA_SHA256,
      protocolSha256: EXPECTED_PROTOCOL_SHA256,
      shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
      shadowReport,
      isolatedErrorCode: null,
      ...authorityBoundary(),
    });
  } catch (error) {
    return deepFreeze({
      documentType: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_DOCUMENT_TYPE,
      contractVersion: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_VERSION,
      gate: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
      policy: GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY,
      status: 'RUNTIME_SHADOW_FAILURE_ISOLATED',
      defaultEnabled: false,
      enabled: true,
      shadowExecutionOccurred: false,
      candidateReadCopyCreated: false,
      candidateSourceAuthentic: true,
      singlePa7GenerationObserved: handoff.candidateGenerationCount === 1,
      groupCount: handoff.groupCount,
      candidateCount: handoff.candidateCount,
      retainedModelArtifactSha256: EXPECTED_MODEL_ARTIFACT_SHA256,
      featureSchemaSha256: EXPECTED_FEATURE_SCHEMA_SHA256,
      protocolSha256: EXPECTED_PROTOCOL_SHA256,
      shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
      shadowReport: null,
      isolatedErrorCode: error && typeof error.code === 'string' ? error.code : 'UNCLASSIFIED_SHADOW_ERROR',
      ...authorityBoundary(),
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
  const execution = createBlindBaselineEngineExecution(sourceModel, runtime);
  const shadowObservation = execution.handoff
    ? observeGuitarSetVoicingModelV2RuntimeShadow(
      execution.handoff,
      modelArtifact,
      { enabled },
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
  });
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
