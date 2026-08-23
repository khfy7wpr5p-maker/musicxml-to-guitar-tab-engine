'use strict';

const { createHash } = require('node:crypto');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  createBlindBaselineArrangementDecisions,
  createBlindBaselineEngineResult,
} = require('../src/benchmark/blindBaselineEngineObserver');
const {
  createGuitarVoicingCandidateModel,
} = require('../src/music/guitarVoicingCandidateModel');
const {
  GUITARSET_VOICING_MODEL_V2_SHADOW_VERSION,
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_FEATURE_SCHEMA_SHA256,
  EXPECTED_PROTOCOL_SHA256,
  EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
  EXPECTED_MODEL_TRANSPORT_SHA256,
  validateModelArtifactV2,
  createGuitarSetVoicingModelV2ShadowReport,
} = require('../src/learning/guitarsetVoicingModelV2Shadow');
const {
  loadControlledOfflineFixtureInputs,
} = require('./controlledOfflineGuitarSetShadowRunner');

const CONTROLLED_OFFLINE_V2_SHADOW_EVIDENCE_VERSION = '1.0.0';
const CONTROLLED_OFFLINE_V2_SHADOW_DETERMINISM_VERSION = '1.0.0';
const MIN_DETERMINISM_REPETITIONS = 10;
const MAX_DETERMINISM_REPETITIONS = 25;
const MAX_FIXTURE_COUNT = 16;
const MAX_FIXTURE_BYTES = 1024 * 1024;

class ControlledOfflineGuitarSetV2ShadowRunnerError extends Error {
  constructor(message, code = 'INVALID_CONTROLLED_OFFLINE_V2_SHADOW_INPUT', details = {}) {
    super(message);
    this.name = 'ControlledOfflineGuitarSetV2ShadowRunnerError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function invalid(message, details = {}) {
  return new ControlledOfflineGuitarSetV2ShadowRunnerError(
    message,
    'INVALID_CONTROLLED_OFFLINE_V2_SHADOW_INPUT',
    details,
  );
}

function hardStop(message, details = {}) {
  return new ControlledOfflineGuitarSetV2ShadowRunnerError(
    message,
    'CONTROLLED_OFFLINE_V2_SHADOW_HARD_STOP',
    details,
  );
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, field) {
  if (!isPlainObject(value)) {
    throw invalid(`${field} must be a plain object.`, { field });
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalid(`${field} fields do not match the controlled v2 offline contract.`, {
      field,
      actual,
      expected,
    });
  }
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

function sha256Utf8(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Json(value) {
  return sha256Utf8(JSON.stringify(value));
}

function normalizeRate(numerator, denominator) {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(12));
}

function normalizeScore(value) {
  if (!Number.isFinite(value)) {
    throw hardStop('V2 shadow evidence contains a non-finite score.');
  }
  return Number(value.toFixed(12));
}

function assertCommitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw invalid('engineCommitSha must be a lowercase 40-character Git SHA.', {
      field: 'engineCommitSha',
    });
  }
  return value;
}

function validateFixtureInput(entry, index) {
  const field = `fixtures[${index}]`;
  assertExactKeys(entry, ['evaluationId', 'expectedSha256', 'musicXml'], field);
  if (
    typeof entry.evaluationId !== 'string'
    || entry.evaluationId.length < 1
    || entry.evaluationId.length > 64
    || !/^[a-z0-9][a-z0-9-]*$/.test(entry.evaluationId)
  ) {
    throw invalid(`${field}.evaluationId is invalid.`, { field: `${field}.evaluationId` });
  }
  if (typeof entry.expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.expectedSha256)) {
    throw invalid(`${field}.expectedSha256 must be a lowercase SHA-256 hex string.`, {
      field: `${field}.expectedSha256`,
    });
  }
  if (typeof entry.musicXml !== 'string') {
    throw invalid(`${field}.musicXml must be a UTF-8 string.`, { field: `${field}.musicXml` });
  }
  const byteLength = Buffer.byteLength(entry.musicXml, 'utf8');
  if (byteLength < 1 || byteLength > MAX_FIXTURE_BYTES) {
    throw invalid('Fixture byte length exceeds the controlled v2 offline bound.', {
      evaluationId: entry.evaluationId,
      byteLength,
    });
  }
  const actualSha256 = sha256Utf8(entry.musicXml);
  if (actualSha256 !== entry.expectedSha256) {
    throw hardStop('Controlled v2 offline input SHA-256 mismatch.', {
      evaluationId: entry.evaluationId,
      expectedSha256: entry.expectedSha256,
      actualSha256,
    });
  }
  return {
    evaluationId: entry.evaluationId,
    inputSha256: actualSha256,
    musicXml: entry.musicXml,
  };
}

function candidateSemanticDigest(group) {
  return sha256Json(group.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    positions: candidate.positions.map((position) => [
      position.sourceEventId,
      position.targetMidi,
      position.string,
      position.fret,
    ]),
  })));
}

function positionSemanticKey(position) {
  return [
    position.sourceEventId,
    position.targetMidi,
    position.string,
    position.fret,
  ].join('|');
}

function matchBaselineCandidate(group, baselineResult) {
  if (!baselineResult || !Array.isArray(baselineResult.selectedTones)) return null;
  const activeIds = new Set(group.activeSourceEventIds);
  const selected = baselineResult.selectedTones
    .filter((tone) => activeIds.has(tone.sourceEventId))
    .map(positionSemanticKey)
    .sort();
  if (selected.length !== group.activeSourceEventIds.length) return null;
  for (const candidate of group.candidates) {
    const candidateKeys = candidate.positions.map(positionSemanticKey).sort();
    if (
      candidateKeys.length === selected.length
      && candidateKeys.every((value, index) => value === selected[index])
    ) {
      return candidate.candidateId;
    }
  }
  return null;
}

function summarizeFixture(evaluationId, inputSha256, source, modelArtifact) {
  const decisions = createBlindBaselineArrangementDecisions(source);
  const voicingModel = createGuitarVoicingCandidateModel(source, decisions);
  const baselineResult = createBlindBaselineEngineResult(source);
  const shadowReport = createGuitarSetVoicingModelV2ShadowReport(voicingModel, modelArtifact);

  if (
    shadowReport.groupCount !== voicingModel.groupCount
    || shadowReport.candidateCount !== voicingModel.candidateCount
  ) {
    throw hardStop('V2 shadow adapter changed authoritative candidate counts.', {
      evaluationId,
      expectedGroupCount: voicingModel.groupCount,
      actualGroupCount: shadowReport.groupCount,
      expectedCandidateCount: voicingModel.candidateCount,
      actualCandidateCount: shadowReport.candidateCount,
    });
  }

  const authoritativeByGroup = new Map(
    voicingModel.groups.map((group) => [group.sourceGroupId, group]),
  );

  const groups = shadowReport.groups.map((shadowGroup) => {
    const authoritativeGroup = authoritativeByGroup.get(shadowGroup.sourceGroupId);
    if (!authoritativeGroup) {
      throw hardStop('V2 shadow report contains an unknown authoritative source group.', {
        evaluationId,
        sourceGroupId: shadowGroup.sourceGroupId,
      });
    }
    if (shadowGroup.candidateCount !== authoritativeGroup.candidateCount) {
      throw hardStop('V2 shadow report group candidate count drift.', {
        evaluationId,
        sourceGroupId: shadowGroup.sourceGroupId,
      });
    }

    const baselineCandidateId = matchBaselineCandidate(authoritativeGroup, baselineResult);
    const topShadowCandidateId = shadowGroup.topCandidateId;
    let comparison = 'NOT_COMPARABLE';
    if (baselineCandidateId !== null && topShadowCandidateId !== null) {
      comparison = baselineCandidateId === topShadowCandidateId ? 'AGREE' : 'DISAGREE';
    }

    const normalizedRanking = shadowGroup.candidateScores.map((entry) => ({
      candidateId: entry.candidateId,
      rank: entry.rank,
      score: normalizeScore(entry.score),
      containsFret20: entry.containsFret20 === true,
    }));
    const top1Top2Margin = normalizedRanking.length >= 2
      ? normalizeScore(normalizedRanking[0].score - normalizedRanking[1].score)
      : null;

    return Object.freeze({
      sourceGroupId: shadowGroup.sourceGroupId,
      status: shadowGroup.status,
      candidateCountBeforeShadow: authoritativeGroup.candidateCount,
      candidateCountAfterShadow: shadowGroup.candidateCount,
      candidateSetSha256: candidateSemanticDigest(authoritativeGroup),
      shadowRankingSha256: sha256Json(normalizedRanking),
      shadowScored: shadowGroup.shadowScored,
      modelDomainComplete: shadowGroup.modelDomainComplete,
      fret20CandidateCount: shadowGroup.fret20CandidateCount,
      topShadowCandidateId,
      baselineCandidateId,
      comparison,
      top1Top2Margin,
    });
  });

  return Object.freeze({
    evaluationId,
    inputSha256,
    groupCount: voicingModel.groupCount,
    candidateCount: voicingModel.candidateCount,
    scoredGroupCount: shadowReport.scoredGroupCount,
    noCandidateGroupCount: shadowReport.noCandidateGroupCount,
    fret20CandidateCount: shadowReport.fret20CandidateCount,
    fret20CandidateGroupCount: shadowReport.fret20CandidateGroupCount,
    groups: Object.freeze(groups),
  });
}

function createControlledOfflineV2ShadowEvidence({
  engineCommitSha,
  fixtures,
  modelArtifact,
}) {
  assertCommitSha(engineCommitSha);
  if (!Array.isArray(fixtures) || fixtures.length < 1 || fixtures.length > MAX_FIXTURE_COUNT) {
    throw invalid('fixtures must contain one to sixteen controlled offline inputs.', {
      field: 'fixtures',
    });
  }

  let validatedModel;
  try {
    validatedModel = validateModelArtifactV2(modelArtifact);
  } catch (error) {
    throw hardStop('Retained v2 model identity/provenance validation failed.', {
      causeCode: error && typeof error.code === 'string' ? error.code : null,
    });
  }

  const seenIds = new Set();
  const fixtureEvidence = fixtures.map((entry, index) => {
    const input = validateFixtureInput(entry, index);
    if (seenIds.has(input.evaluationId)) {
      throw invalid('Duplicate controlled v2 offline evaluationId.', {
        evaluationId: input.evaluationId,
      });
    }
    seenIds.add(input.evaluationId);

    const runtime = createMusicXmlProcessingRuntime();
    const parsed = parseParsedMusicXmlDocument(input.musicXml, {}, runtime);
    const source = projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
    return summarizeFixture(input.evaluationId, input.inputSha256, source, modelArtifact);
  });

  let totalGroupCount = 0;
  let totalCandidateCount = 0;
  let scoredGroupCount = 0;
  let noCandidateGroupCount = 0;
  let fret20CandidateCount = 0;
  let fret20CandidateGroupCount = 0;
  let baselineComparableGroupCount = 0;
  let top1AgreementCount = 0;
  const disagreementIds = [];
  const margins = [];

  for (const fixture of fixtureEvidence) {
    totalGroupCount += fixture.groupCount;
    totalCandidateCount += fixture.candidateCount;
    scoredGroupCount += fixture.scoredGroupCount;
    noCandidateGroupCount += fixture.noCandidateGroupCount;
    fret20CandidateCount += fixture.fret20CandidateCount;
    fret20CandidateGroupCount += fixture.fret20CandidateGroupCount;
    for (const group of fixture.groups) {
      if (group.candidateCountBeforeShadow > 0 && group.shadowScored !== true) {
        throw hardStop('V2 failed to score a candidate-bearing controlled offline group.', {
          evaluationId: fixture.evaluationId,
          sourceGroupId: group.sourceGroupId,
        });
      }
      if (group.modelDomainComplete !== true) {
        throw hardStop('V2 controlled offline evidence reported incomplete 0..20 model-domain coverage.', {
          evaluationId: fixture.evaluationId,
          sourceGroupId: group.sourceGroupId,
        });
      }
      if (group.comparison === 'AGREE' || group.comparison === 'DISAGREE') {
        baselineComparableGroupCount += 1;
        if (group.comparison === 'AGREE') {
          top1AgreementCount += 1;
        } else {
          disagreementIds.push(`${fixture.evaluationId}:${group.sourceGroupId}`);
        }
      }
      if (group.top1Top2Margin !== null) margins.push(group.top1Top2Margin);
    }
  }

  const candidateBearingGroupCount = totalGroupCount - noCandidateGroupCount;
  if (scoredGroupCount !== candidateBearingGroupCount) {
    throw hardStop('V2 controlled offline aggregate scored-group accounting drift.', {
      candidateBearingGroupCount,
      scoredGroupCount,
    });
  }

  const marginSummary = margins.length === 0
    ? Object.freeze({ count: 0, minimum: null, maximum: null, mean: null })
    : Object.freeze({
      count: margins.length,
      minimum: normalizeScore(Math.min(...margins)),
      maximum: normalizeScore(Math.max(...margins)),
      mean: normalizeScore(margins.reduce((sum, value) => sum + value, 0) / margins.length),
    });

  const metrics = Object.freeze({
    fixtureCount: fixtureEvidence.length,
    totalGroupCount,
    totalCandidateCount,
    candidateBearingGroupCount,
    scoredGroupCount,
    noCandidateGroupCount,
    noScoreGroupCount: noCandidateGroupCount,
    candidateBearingScorableRate: normalizeRate(scoredGroupCount, candidateBearingGroupCount),
    noScoreRate: normalizeRate(noCandidateGroupCount, totalGroupCount),
    candidateCountPreservationRate: 1,
    fret20CandidateCount,
    fret20CandidateGroupCount,
    baselineComparableGroupCount,
    top1AgreementCount,
    top1AgreementRate: normalizeRate(top1AgreementCount, baselineComparableGroupCount),
    disagreementCount: disagreementIds.length,
    disagreementIds: Object.freeze(disagreementIds),
    top1Top2MarginSummary: marginSummary,
    shadowErrorCount: 0,
  });

  const core = {
    documentType: 'ControlledOfflineGuitarSetV2ShadowEvidence',
    contractVersion: CONTROLLED_OFFLINE_V2_SHADOW_EVIDENCE_VERSION,
    mode: 'GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE',
    engineCommitSha,
    adapterVersion: GUITARSET_VOICING_MODEL_V2_SHADOW_VERSION,
    modelArtifactSha256: validatedModel.artifactSha256,
    modelTransportSha256: validatedModel.transportSha256,
    featureSchemaSha256: validatedModel.featureSchemaSha256,
    protocolSha256: validatedModel.protocolSha256,
    shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
    candidateFretDomain: Object.freeze([...validatedModel.candidateFretDomain]),
    sourceObservedFretDomain: Object.freeze([...validatedModel.sourceObservedFretDomain]),
    fixtureEvidence: Object.freeze(fixtureEvidence),
    metrics,
    controlledOfflineExecution: true,
    liveOrUserInputAuthorized: false,
    runtimeConnectionAuthorized: false,
    candidateMutationAuthorized: false,
    candidateFilteringAuthorized: false,
    candidateGenerationAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    checkpointMutationAuthorized: false,
    refitAuthorized: false,
    fret20CandidateScoringAuthorized: true,
    fret20QualityAuthority: false,
    networkOrTelemetryAuthorized: false,
    productionAuthorized: false,
  };

  return deepFreeze({
    ...core,
    runDigestSha256: sha256Json(core),
  });
}

function verifyControlledOfflineV2ShadowDeterminism({
  engineCommitSha,
  fixtures,
  modelArtifact,
  repetitions = MIN_DETERMINISM_REPETITIONS,
}) {
  if (
    !Number.isInteger(repetitions)
    || repetitions < MIN_DETERMINISM_REPETITIONS
    || repetitions > MAX_DETERMINISM_REPETITIONS
  ) {
    throw invalid('repetitions must be an integer from 10 through 25.', {
      field: 'repetitions',
    });
  }

  const first = createControlledOfflineV2ShadowEvidence({
    engineCommitSha,
    fixtures,
    modelArtifact,
  });
  for (let index = 1; index < repetitions; index += 1) {
    const observed = createControlledOfflineV2ShadowEvidence({
      engineCommitSha,
      fixtures,
      modelArtifact,
    });
    if (observed.runDigestSha256 !== first.runDigestSha256) {
      throw hardStop('Controlled offline v2 shadow evidence is nondeterministic.', {
        repetition: index + 1,
        expectedRunDigestSha256: first.runDigestSha256,
        actualRunDigestSha256: observed.runDigestSha256,
      });
    }
  }

  const determinismCore = {
    documentType: 'ControlledOfflineGuitarSetV2ShadowDeterminismEvidence',
    contractVersion: CONTROLLED_OFFLINE_V2_SHADOW_DETERMINISM_VERSION,
    engineCommitSha,
    repetitions,
    deterministic: true,
    evidenceRunDigestSha256: first.runDigestSha256,
    fixtureCount: first.metrics.fixtureCount,
    totalGroupCount: first.metrics.totalGroupCount,
    totalCandidateCount: first.metrics.totalCandidateCount,
    candidateBearingScorableRate: first.metrics.candidateBearingScorableRate,
    candidateCountPreservationRate: first.metrics.candidateCountPreservationRate,
    fret20CandidateCount: first.metrics.fret20CandidateCount,
    controlledOfflineExecution: true,
    liveOrUserInputAuthorized: false,
    runtimeConnectionAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    fret20QualityAuthority: false,
    productionAuthorized: false,
  };

  return deepFreeze({
    ...determinismCore,
    determinismDigestSha256: sha256Json(determinismCore),
  });
}

module.exports = {
  CONTROLLED_OFFLINE_V2_SHADOW_EVIDENCE_VERSION,
  CONTROLLED_OFFLINE_V2_SHADOW_DETERMINISM_VERSION,
  MIN_DETERMINISM_REPETITIONS,
  MAX_DETERMINISM_REPETITIONS,
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_FEATURE_SCHEMA_SHA256,
  EXPECTED_PROTOCOL_SHA256,
  EXPECTED_MODEL_TRANSPORT_SHA256,
  ControlledOfflineGuitarSetV2ShadowRunnerError,
  loadControlledOfflineFixtureInputs,
  createControlledOfflineV2ShadowEvidence,
  verifyControlledOfflineV2ShadowDeterminism,
};
