'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const REPO_ROOT = path.join(__dirname, '..');
const ARTIFACT_RELATIVE_PATH = path.join(
  'evidence',
  'offline-shadow',
  'exact-main',
  'acdb66e2bb2ad809ab45fc7c2183d84280d61ad7',
  'controlled-offline-shadow-evidence.v2.json',
);
const ARTIFACT_PATH = path.join(REPO_ROOT, ARTIFACT_RELATIVE_PATH);

const EXPECTED_ARTIFACT_SHA256 = 'a9224b54a70b64f51b829aa106f42832abe366b7dafc454d15e73acf092841ba';
const EXPECTED_ENGINE_SHA = 'acdb66e2bb2ad809ab45fc7c2183d84280d61ad7';
const EXPECTED_RUN_DIGEST_SHA256 = '855e62f2dddece4ad7d3008c915418611dc59fcd06cfc1bfdbc22060755d0bed';
const EXPECTED_DETERMINISM_DIGEST_SHA256 = '6b67196a87046916bb1411e8ecfb826f92a5e8c8ebd4243e0278a7070769a791';
const EXPECTED_MODEL_SHA256 = '7a56436c27ee6d996a49e7f989d37d7ffff187232277095b176c3c395c432314';
const EXPECTED_MODEL_TRANSPORT_SHA256 = '6f71e1aef2b4b858a4b8c19a205e269e0fa9d4b3b35b8b703bc2e13e58d27955';
const EXPECTED_FEATURE_SCHEMA_SHA256 = '617981e90cce46c941596d1bd50ffffff64e6816c59d8f0dbed1acd6d8938285';
const EXPECTED_PROTOCOL_SHA256 = 'db67d88c4889a2b8c63411cd1e9bbd7481248dfbdd76da67f5df60b3871b4c02';
const EXPECTED_REVIEW_SHA256 = 'f42809c1ca9d5f6ff1c62dd072c91a9195bb46e1714e88bd84e8a5a57eef9140';

function sha256Utf8(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function readSealedArtifact() {
  const raw = fs.readFileSync(ARTIFACT_PATH, 'utf8');
  assert.equal(
    sha256Utf8(raw),
    EXPECTED_ARTIFACT_SHA256,
    'Historical v2 evidence bytes changed; create a new version instead of rewriting this seal.',
  );
  return { raw, artifact: JSON.parse(raw) };
}

function walk(value, visit, pointer = '$') {
  visit(value, pointer);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visit, `${pointer}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      visit(key, `${pointer}.${key}#key`);
      walk(entry, visit, `${pointer}.${key}`);
    }
  }
}

test('exact-main GuitarSet v2 shadow evidence is an immutable versioned artifact', () => {
  const { artifact } = readSealedArtifact();

  assert.deepEqual(Object.keys(artifact), [
    'documentType',
    'schemaVersion',
    'captureProvenance',
    'evidence',
    'determinism',
    'sealPolicy',
  ]);
  assert.equal(artifact.documentType, 'ImmutableControlledOfflineGuitarSetV2ShadowEvidenceSeal');
  assert.equal(artifact.schemaVersion, '1.0.0');
  assert.deepEqual(artifact.captureProvenance, {
    repository: 'khfy7wpr5p-maker/musicxml-to-guitar-tab-engine',
    sourcePullRequestNumber: 142,
    sourceHeadSha: 'c7ccc955c6c98706eb041d9c5866d5217db42e9f',
    sourceBaseSha: EXPECTED_ENGINE_SHA,
    sourceWorkflowRunId: 32651523727,
    sourceNode22JobId: 97223773950,
    captureMethod: 'PR_CI_EXACT_MAIN_CONTROLLED_OFFLINE_V2',
  });

  const evidence = artifact.evidence;
  assert.equal(evidence.documentType, 'ControlledOfflineGuitarSetV2ShadowEvidence');
  assert.equal(evidence.contractVersion, '1.0.0');
  assert.equal(evidence.mode, 'GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE');
  assert.equal(evidence.engineCommitSha, EXPECTED_ENGINE_SHA);
  assert.equal(evidence.adapterVersion, '2.0.0');
  assert.equal(evidence.modelArtifactSha256, EXPECTED_MODEL_SHA256);
  assert.equal(evidence.modelTransportSha256, EXPECTED_MODEL_TRANSPORT_SHA256);
  assert.equal(evidence.featureSchemaSha256, EXPECTED_FEATURE_SCHEMA_SHA256);
  assert.equal(evidence.protocolSha256, EXPECTED_PROTOCOL_SHA256);
  assert.equal(evidence.shadowIntegrationReviewEvidenceSha256, EXPECTED_REVIEW_SHA256);
  assert.equal(evidence.runDigestSha256, EXPECTED_RUN_DIGEST_SHA256);
});

test('sealed v2 evidence preserves every candidate and reproduces metric accounting', () => {
  const { artifact } = readSealedArtifact();
  const { evidence } = artifact;

  let totalGroups = 0;
  let totalCandidates = 0;
  let totalCandidatesAfterShadow = 0;
  let candidateBearingGroups = 0;
  let scoredGroups = 0;
  let noCandidateGroups = 0;
  let fret20Candidates = 0;
  let comparableGroups = 0;
  let agreements = 0;
  const disagreements = [];

  for (const fixture of evidence.fixtureEvidence) {
    assert.match(fixture.evaluationId, /^[a-z0-9][a-z0-9-]*$/);
    assert.match(fixture.inputSha256, /^[0-9a-f]{64}$/);
    totalGroups += fixture.groupCount;
    totalCandidates += fixture.candidateCount;
    totalCandidatesAfterShadow += fixture.candidateCountAfterShadow;
    scoredGroups += fixture.scoredGroupCount;
    noCandidateGroups += fixture.noCandidateGroupCount;
    fret20Candidates += fixture.fret20CandidateCount;

    for (const group of fixture.groups) {
      assert.equal(group.candidateCountAfterShadow, group.candidateCountBeforeShadow);
      if (group.candidateCountBeforeShadow > 0) candidateBearingGroups += 1;
      if (group.status === 'SHADOW_NOT_SCORED_NO_AUTHORITATIVE_CANDIDATES') {
        assert.equal(group.candidateCountBeforeShadow, 0);
        assert.equal(group.candidateCountAfterShadow, 0);
        assert.equal(group.shadowScored, false);
        assert.equal(group.topShadowCandidateId, null);
      }
      if (group.comparison === 'AGREE' || group.comparison === 'DISAGREE') {
        comparableGroups += 1;
        if (group.comparison === 'AGREE') {
          agreements += 1;
        } else {
          disagreements.push(`${fixture.evaluationId}:${group.sourceGroupId}`);
        }
      }
    }
  }

  const metrics = evidence.metrics;
  assert.equal(totalGroups, metrics.totalGroupCount);
  assert.equal(totalCandidates, metrics.totalCandidateCount);
  assert.equal(totalCandidatesAfterShadow, metrics.totalCandidateCountAfterShadow);
  assert.equal(candidateBearingGroups, metrics.candidateBearingGroupCount);
  assert.equal(scoredGroups, metrics.scoredGroupCount);
  assert.equal(noCandidateGroups, metrics.noCandidateGroupCount);
  assert.equal(fret20Candidates, metrics.fret20CandidateCount);
  assert.equal(comparableGroups, metrics.baselineComparableGroupCount);
  assert.equal(agreements, metrics.top1AgreementCount);
  assert.deepEqual(disagreements, metrics.disagreementIds);

  assert.equal(metrics.fixtureCount, 6);
  assert.equal(metrics.totalGroupCount, 5);
  assert.equal(metrics.totalCandidateCount, 153);
  assert.equal(metrics.totalCandidateCountAfterShadow, 153);
  assert.equal(metrics.candidateBearingGroupCount, 4);
  assert.equal(metrics.scoredGroupCount, 4);
  assert.equal(metrics.noCandidateGroupCount, 1);
  assert.equal(metrics.noScoreGroupCount, 1);
  assert.equal(metrics.candidateBearingScorableRate, 1);
  assert.equal(metrics.noScoreRate, 0.2);
  assert.equal(metrics.candidateCountPreservationRate, 1);
  assert.equal(metrics.fret20CandidateCount, 48);
  assert.equal(metrics.fret20CandidateGroupCount, 3);
  assert.equal(metrics.baselineComparableGroupCount, 4);
  assert.equal(metrics.top1AgreementCount, 1);
  assert.equal(metrics.top1AgreementRate, 0.25);
  assert.equal(metrics.disagreementCount, 3);
  assert.deepEqual(metrics.disagreementIds, [
    'pa11-two-note-interval:P1:measure:0:simultaneous:0',
    'pa11-three-note-triad:P1:measure:0:simultaneous:0',
    'pa11-four-note-reduction:P1:measure:0:simultaneous:0',
  ]);
  assert.deepEqual(metrics.top1Top2MarginSummary, {
    count: 4,
    minimum: 0.431699683208,
    maximum: 3.628871628623,
    mean: 1.483942111239,
  });
  assert.equal(metrics.shadowErrorCount, 0);
});

test('sealed v2 evidence records 10/10 determinism and keeps runtime authority closed', () => {
  const { artifact } = readSealedArtifact();
  const { evidence, determinism, sealPolicy } = artifact;

  assert.equal(determinism.documentType, 'ControlledOfflineGuitarSetV2ShadowDeterminismEvidence');
  assert.equal(determinism.contractVersion, '1.0.0');
  assert.equal(determinism.engineCommitSha, EXPECTED_ENGINE_SHA);
  assert.equal(determinism.repetitions, 10);
  assert.equal(determinism.deterministic, true);
  assert.equal(determinism.evidenceRunDigestSha256, EXPECTED_RUN_DIGEST_SHA256);
  assert.equal(determinism.determinismDigestSha256, EXPECTED_DETERMINISM_DIGEST_SHA256);

  assert.equal(evidence.controlledOfflineExecution, true);
  assert.equal(evidence.fret20CandidateScoringAuthorized, true);
  assert.equal(evidence.fret20QualityAuthority, false);
  for (const field of [
    'liveOrUserInputAuthorized',
    'runtimeConnectionAuthorized',
    'candidateMutationAuthorized',
    'candidateFilteringAuthorized',
    'candidateGenerationAuthorized',
    'authoritativeDecisionEffectAuthorized',
    'canonicalResultEffectAuthorized',
    'tabOutputEffectAuthorized',
    'checkpointMutationAuthorized',
    'refitAuthorized',
    'networkOrTelemetryAuthorized',
    'productionAuthorized',
  ]) {
    assert.equal(evidence[field], false, `${field} must remain false in historical v2 evidence`);
  }

  assert.deepEqual(sealPolicy, {
    historicalEvidenceRecomputationAuthorized: false,
    currentRunnerRequiredForVerification: false,
    rawMusicXmlIncluded: false,
    originalLocalPathIncluded: false,
    userFilenameIncluded: false,
    teacherLabelsIncluded: false,
    validationLabelsIncluded: false,
    finalLabelsIncluded: false,
    networkTelemetryIncluded: false,
  });
});

test('sealed v2 evidence contains no raw score, path, filename, or protected label payload', () => {
  const { raw, artifact } = readSealedArtifact();

  for (const pattern of [
    /<\?xml/i,
    /<score-partwise/i,
    /<score-timewise/i,
    /[A-Za-z]:\\/,
    /\/Users\//,
    /\/home\//,
    /file:\/\//i,
    /\.musicxml\b/i,
  ]) {
    assert.doesNotMatch(raw, pattern);
  }

  const forbiddenDataKeys = new Set([
    'musicXml',
    'rawMusicXml',
    'path',
    'localPath',
    'filePath',
    'filename',
    'userFilename',
    'teacherLabel',
    'teacherLabels',
    'gold',
    'goldLabel',
    'validationLabel',
    'validationLabels',
    'finalLabel',
    'finalLabels',
    'userData',
  ]);

  walk(artifact, (value, pointer) => {
    if (pointer.endsWith('#key')) {
      assert.equal(
        forbiddenDataKeys.has(value),
        false,
        `Historical v2 evidence contains a forbidden data-bearing field: ${pointer}`,
      );
    }
  });
});
