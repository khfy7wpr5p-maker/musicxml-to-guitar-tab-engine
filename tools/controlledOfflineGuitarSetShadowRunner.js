'use strict';

const fs = require('node:fs');
const path = require('node:path');
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
  GUITARSET_OBSERVED_VOICING_SHADOW_VERSION,
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_FEATURE_SCHEMA_SHA256,
  EXPECTED_PROTOCOL_SHA256,
  EXPECTED_CROSS_REPO_REVIEW_SHA256,
  validateModelArtifact,
  createGuitarSetObservedVoicingShadowReport,
} = require('../src/learning/guitarsetObservedVoicingShadow');

const CONTROLLED_OFFLINE_SHADOW_EVIDENCE_VERSION = '1.0.0';
const CONTROLLED_OFFLINE_SHADOW_DETERMINISM_VERSION = '1.0.0';
const MAX_FIXTURE_COUNT = 16;
const MAX_FIXTURE_BYTES = 1024 * 1024;
const MIN_DETERMINISM_REPETITIONS = 10;
const MAX_DETERMINISM_REPETITIONS = 25;
const ALLOWED_FIXTURE_PREFIXES = Object.freeze([
  'benchmarks/teacher-arrangement-v1/fixtures/',
  'benchmarks/guitarset-shadow/fixtures/',
]);

class ControlledOfflineGuitarSetShadowRunnerError extends Error {
  constructor(message, code = 'INVALID_CONTROLLED_OFFLINE_SHADOW_INPUT', details = {}) {
    super(message);
    this.name = 'ControlledOfflineGuitarSetShadowRunnerError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function invalid(message, details = {}) {
  return new ControlledOfflineGuitarSetShadowRunnerError(message, 'INVALID_CONTROLLED_OFFLINE_SHADOW_INPUT', details);
}

function hardStop(message, details = {}) {
  return new ControlledOfflineGuitarSetShadowRunnerError(message, 'CONTROLLED_OFFLINE_SHADOW_HARD_STOP', details);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, field) {
  if (!isPlainObject(value)) throw invalid(`${field} must be a plain object.`, { field });
  return value;
}

function assertExactKeys(value, expectedKeys, field) {
  assertPlainObject(value, field);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalid(`${field} fields do not match the controlled offline contract.`, {
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
  if (!Number.isFinite(value)) throw hardStop('Shadow evidence contains a non-finite score.');
  return Number(value.toFixed(12));
}

function assertSha256(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw invalid(`${field} must be a lowercase SHA-256 hex string.`, { field });
  }
  return value;
}

function assertCommitSha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw invalid('engineCommitSha must be a lowercase 40-character Git SHA.', {
      field: 'engineCommitSha',
    });
  }
  return value;
}

function assertEvaluationId(value, field) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 64
    || !/^[a-z0-9][a-z0-9-]*$/.test(value)
  ) {
    throw invalid(`${field} must be a bounded lowercase fixture-local identifier.`, { field });
  }
  return value;
}

function normalizeManifestPath(value, field) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
    throw invalid(`${field} must be a bounded repository-relative path.`, { field });
  }
  if (value.includes('\\') || path.posix.isAbsolute(value)) {
    throw invalid(`${field} must use a repository-relative POSIX path.`, { field });
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith('../') || normalized.includes('/../')) {
    throw invalid(`${field} escapes the reviewed repository fixture boundary.`, { field });
  }
  if (!normalized.endsWith('.musicxml')) {
    throw invalid(`${field} must reference an uncompressed MusicXML fixture.`, { field });
  }
  if (!ALLOWED_FIXTURE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw invalid(`${field} is outside the reviewed non-live fixture roots.`, { field });
  }
  return normalized;
}

function validateManifest(manifest) {
  assertExactKeys(
    manifest,
    ['documentType', 'contractVersion', 'sourcePolicy', 'teacherLabelsIncluded', 'fixtures'],
    'manifest',
  );
  if (
    manifest.documentType !== 'ControlledOfflineGuitarSetShadowFixtureManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.sourcePolicy !== 'REPOSITORY_OWNED_SELF_AUTHORED_NON_LIVE_ONLY'
    || manifest.teacherLabelsIncluded !== false
  ) {
    throw invalid('Controlled offline fixture manifest identity/authority drift.', {
      field: 'manifest',
    });
  }
  if (
    !Array.isArray(manifest.fixtures)
    || manifest.fixtures.length < 1
    || manifest.fixtures.length > MAX_FIXTURE_COUNT
  ) {
    throw invalid('Controlled offline fixture count exceeds the reviewed bounds.', {
      field: 'manifest.fixtures',
    });
  }

  const seenIds = new Set();
  const seenPaths = new Set();
  const fixtures = manifest.fixtures.map((entry, index) => {
    const field = `manifest.fixtures[${index}]`;
    assertExactKeys(entry, ['evaluationId', 'path', 'sha256'], field);
    const evaluationId = assertEvaluationId(entry.evaluationId, `${field}.evaluationId`);
    const fixturePath = normalizeManifestPath(entry.path, `${field}.path`);
    const sha256 = assertSha256(entry.sha256, `${field}.sha256`);
    if (seenIds.has(evaluationId)) {
      throw invalid('Duplicate controlled offline evaluationId.', { evaluationId });
    }
    if (seenPaths.has(fixturePath)) {
      throw invalid('Duplicate controlled offline fixture path.', { fixturePath });
    }
    seenIds.add(evaluationId);
    seenPaths.add(fixturePath);
    return Object.freeze({ evaluationId, path: fixturePath, sha256 });
  });

  return deepFreeze({
    documentType: manifest.documentType,
    contractVersion: manifest.contractVersion,
    sourcePolicy: manifest.sourcePolicy,
    teacherLabelsIncluded: false,
    fixtures,
  });
}

function loadControlledOfflineFixtureInputs(repositoryRoot, manifest) {
  if (typeof repositoryRoot !== 'string' || repositoryRoot.length < 1) {
    throw invalid('repositoryRoot must be a non-empty string.', { field: 'repositoryRoot' });
  }
  const reviewed = validateManifest(manifest);
  const root = path.resolve(repositoryRoot);
  const fixtures = reviewed.fixtures.map((entry) => {
    const absolutePath = path.resolve(root, ...entry.path.split('/'));
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
      throw invalid('Resolved fixture path escaped repositoryRoot.', {
        evaluationId: entry.evaluationId,
      });
    }
    const musicXml = fs.readFileSync(absolutePath, 'utf8');
    const byteLength = Buffer.byteLength(musicXml, 'utf8');
    if (byteLength < 1 || byteLength > MAX_FIXTURE_BYTES) {
      throw invalid('Fixture byte length exceeds the controlled offline bound.', {
        evaluationId: entry.evaluationId,
        byteLength,
      });
    }
    const actualSha256 = sha256Utf8(musicXml);
    if (actualSha256 !== entry.sha256) {
      throw hardStop('Repository fixture SHA-256 drift.', {
        evaluationId: entry.evaluationId,
        expectedSha256: entry.sha256,
        actualSha256,
      });
    }
    return Object.freeze({
      evaluationId: entry.evaluationId,
      expectedSha256: entry.sha256,
      musicXml,
    });
  });
  return Object.freeze(fixtures);
}

function validateFixtureInput(entry, index) {
  const field = `fixtures[${index}]`;
  assertExactKeys(entry, ['evaluationId', 'expectedSha256', 'musicXml'], field);
  const evaluationId = assertEvaluationId(entry.evaluationId, `${field}.evaluationId`);
  const expectedSha256 = assertSha256(entry.expectedSha256, `${field}.expectedSha256`);
  if (typeof entry.musicXml !== 'string') {
    throw invalid(`${field}.musicXml must be a UTF-8 string.`, {
      field: `${field}.musicXml`,
    });
  }
  const byteLength = Buffer.byteLength(entry.musicXml, 'utf8');
  if (byteLength < 1 || byteLength > MAX_FIXTURE_BYTES) {
    throw invalid('Fixture byte length exceeds the controlled offline bound.', {
      evaluationId,
      byteLength,
    });
  }
  const actualSha256 = sha256Utf8(entry.musicXml);
  if (actualSha256 !== expectedSha256) {
    throw hardStop('Controlled offline input SHA-256 mismatch.', {
      evaluationId,
      expectedSha256,
      actualSha256,
    });
  }
  return {
    evaluationId,
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
  const shadowReport = createGuitarSetObservedVoicingShadowReport(voicingModel, modelArtifact);

  if (
    shadowReport.groupCount !== voicingModel.groupCount
    || shadowReport.candidateCount !== voicingModel.candidateCount
  ) {
    throw hardStop('Shadow adapter changed authoritative candidate counts.', {
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
      throw hardStop('Shadow report contains an unknown authoritative source group.', {
        evaluationId,
        sourceGroupId: shadowGroup.sourceGroupId,
      });
    }
    if (shadowGroup.candidateCount !== authoritativeGroup.candidateCount) {
      throw hardStop('Shadow report group candidate count drift.', {
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
      outOfModelDomainCandidateCount: shadowGroup.outOfModelDomainCandidateCount,
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
    modelDomainIncompleteGroupCount: shadowReport.groups.filter(
      (group) => !group.modelDomainComplete && group.candidateCount > 0,
    ).length,
    groups: Object.freeze(groups),
  });
}

function createControlledOfflineShadowEvidence({
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
    validatedModel = validateModelArtifact(modelArtifact);
  } catch (error) {
    throw hardStop('Retained model identity/provenance validation failed.', {
      causeCode: error && typeof error.code === 'string' ? error.code : null,
    });
  }

  const seenIds = new Set();
  const fixtureEvidence = fixtures.map((entry, index) => {
    const input = validateFixtureInput(entry, index);
    if (seenIds.has(input.evaluationId)) {
      throw invalid('Duplicate controlled offline evaluationId.', {
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
  let modelDomainIncompleteGroupCount = 0;
  let baselineComparableGroupCount = 0;
  let top1AgreementCount = 0;
  const disagreementIds = [];
  const margins = [];

  for (const fixture of fixtureEvidence) {
    totalGroupCount += fixture.groupCount;
    totalCandidateCount += fixture.candidateCount;
    scoredGroupCount += fixture.scoredGroupCount;
    noCandidateGroupCount += fixture.noCandidateGroupCount;
    modelDomainIncompleteGroupCount += fixture.modelDomainIncompleteGroupCount;
    for (const group of fixture.groups) {
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
    scoredGroupCount,
    noCandidateGroupCount,
    modelDomainIncompleteGroupCount,
    scorableGroupRate: normalizeRate(scoredGroupCount, totalGroupCount),
    noCandidateGroupRate: normalizeRate(noCandidateGroupCount, totalGroupCount),
    modelDomainIncompleteRate: normalizeRate(modelDomainIncompleteGroupCount, totalGroupCount),
    candidateCountPreservationRate: 1,
    baselineComparableGroupCount,
    top1AgreementCount,
    top1AgreementRate: normalizeRate(top1AgreementCount, baselineComparableGroupCount),
    disagreementCount: disagreementIds.length,
    disagreementIds: Object.freeze(disagreementIds),
    top1Top2MarginSummary: marginSummary,
    shadowErrorCount: 0,
  });

  const core = {
    documentType: 'ControlledOfflineGuitarSetShadowEvidence',
    contractVersion: CONTROLLED_OFFLINE_SHADOW_EVIDENCE_VERSION,
    mode: 'CONTROLLED_OFFLINE_PROJECT_SHADOW_EVIDENCE',
    engineCommitSha,
    adapterVersion: GUITARSET_OBSERVED_VOICING_SHADOW_VERSION,
    modelArtifactSha256: validatedModel.artifactSha256,
    featureSchemaSha256: validatedModel.featureSchemaSha256,
    protocolSha256: validatedModel.protocolSha256,
    crossRepoReviewEvidenceSha256: EXPECTED_CROSS_REPO_REVIEW_SHA256,
    fixtureEvidence: Object.freeze(fixtureEvidence),
    metrics,
    controlledOfflineExecution: true,
    liveShadowExecutionAuthorized: false,
    runtimeConnectionAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    checkpointMutationAuthorized: false,
    refitAuthorized: false,
    productionAuthorized: false,
  };

  return deepFreeze({
    ...core,
    runDigestSha256: sha256Json(core),
  });
}

function verifyControlledOfflineShadowDeterminism({
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

  const first = createControlledOfflineShadowEvidence({
    engineCommitSha,
    fixtures,
    modelArtifact,
  });
  for (let index = 1; index < repetitions; index += 1) {
    const observed = createControlledOfflineShadowEvidence({
      engineCommitSha,
      fixtures,
      modelArtifact,
    });
    if (observed.runDigestSha256 !== first.runDigestSha256) {
      throw hardStop('Controlled offline shadow evidence is nondeterministic.', {
        repetition: index + 1,
        expectedRunDigestSha256: first.runDigestSha256,
        actualRunDigestSha256: observed.runDigestSha256,
      });
    }
  }

  const determinismCore = {
    documentType: 'ControlledOfflineGuitarSetShadowDeterminismEvidence',
    contractVersion: CONTROLLED_OFFLINE_SHADOW_DETERMINISM_VERSION,
    engineCommitSha,
    repetitions,
    deterministic: true,
    evidenceRunDigestSha256: first.runDigestSha256,
    fixtureCount: first.metrics.fixtureCount,
    totalGroupCount: first.metrics.totalGroupCount,
    totalCandidateCount: first.metrics.totalCandidateCount,
    controlledOfflineExecution: true,
    liveShadowExecutionAuthorized: false,
    runtimeConnectionAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    productionAuthorized: false,
  };

  return deepFreeze({
    ...determinismCore,
    determinismDigestSha256: sha256Json(determinismCore),
  });
}

module.exports = {
  CONTROLLED_OFFLINE_SHADOW_EVIDENCE_VERSION,
  CONTROLLED_OFFLINE_SHADOW_DETERMINISM_VERSION,
  MAX_FIXTURE_COUNT,
  MAX_FIXTURE_BYTES,
  MIN_DETERMINISM_REPETITIONS,
  MAX_DETERMINISM_REPETITIONS,
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_FEATURE_SCHEMA_SHA256,
  EXPECTED_PROTOCOL_SHA256,
  ControlledOfflineGuitarSetShadowRunnerError,
  validateManifest,
  loadControlledOfflineFixtureInputs,
  createControlledOfflineShadowEvidence,
  verifyControlledOfflineShadowDeterminism,
};
