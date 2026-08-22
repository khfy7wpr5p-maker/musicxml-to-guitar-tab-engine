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
  'a2d4e9461382d5c4fdf49d04c5d949b2f40bbc35',
  'controlled-offline-shadow-evidence.v1.json',
);
const ARTIFACT_PATH = path.join(REPO_ROOT, ARTIFACT_RELATIVE_PATH);

const EXPECTED_ARTIFACT_SHA256 = '0bc970480c356afa53725db6264f0b3948765792976689e26c2fdf1c7431ceed';
const EXPECTED_ENGINE_SHA = 'a2d4e9461382d5c4fdf49d04c5d949b2f40bbc35';
const EXPECTED_RUN_DIGEST_SHA256 = 'bcf85e6c41cf9e63acb340b9fc1eebd8c9e61559306584537249750b186ba898';
const EXPECTED_DETERMINISM_DIGEST_SHA256 = '3c52cc85ba7a4ee1db53ab744eaeaf7e0c3ec5563862ab4e39436cb65d470669';
const EXPECTED_MODEL_SHA256 = '5d109e3b46ef286439f00ad6fa5885fc7bdf13e070974c49040c27b007461869';
const EXPECTED_FEATURE_SCHEMA_SHA256 = '05f8fda622f3901869a149db3e2cca2baf1310f4834d39e278e36428ae48cd38';
const EXPECTED_PROTOCOL_SHA256 = '1cbb3d219e8009c90c71075019a69a55c06a2893c12bd50264e66eda956dbc2d';
const EXPECTED_CROSS_REPO_REVIEW_SHA256 = '7a8158b295912df0fe743f605df799362fcc164f01e3d5357a62e5e3835af789';

function sha256Utf8(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function readSealedArtifact() {
  const raw = fs.readFileSync(ARTIFACT_PATH, 'utf8');
  assert.equal(
    sha256Utf8(raw),
    EXPECTED_ARTIFACT_SHA256,
    'Historical evidence bytes changed; create a new version instead of rewriting this seal.',
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

test('exact-main GuitarSet shadow evidence is an immutable versioned artifact', () => {
  const { artifact } = readSealedArtifact();

  assert.deepEqual(Object.keys(artifact), [
    'documentType',
    'schemaVersion',
    'captureProvenance',
    'evidence',
    'determinism',
    'sealPolicy',
  ]);
  assert.equal(artifact.documentType, 'ImmutableControlledOfflineGuitarSetShadowEvidenceSeal');
  assert.equal(artifact.schemaVersion, '1.0.0');

  assert.deepEqual(artifact.captureProvenance, {
    repository: 'khfy7wpr5p-maker/musicxml-to-guitar-tab-engine',
    sourcePullRequestNumber: 130,
    sourceHeadSha: 'fe568d80c5e72a7043e03b61ee1c3c6283e8039a',
    sourceBaseSha: EXPECTED_ENGINE_SHA,
    sourceWorkflowRunId: 32553990747,
    sourceNode20JobId: 96985192408,
    captureMethod: 'PR_CI_EXACT_MAIN_CONTROLLED_OFFLINE',
  });

  const evidence = artifact.evidence;
  assert.equal(evidence.documentType, 'ControlledOfflineGuitarSetShadowEvidence');
  assert.equal(evidence.contractVersion, '1.0.0');
  assert.equal(evidence.mode, 'CONTROLLED_OFFLINE_PROJECT_SHADOW_EVIDENCE');
  assert.equal(evidence.engineCommitSha, EXPECTED_ENGINE_SHA);
  assert.equal(evidence.adapterVersion, '1.0.0');
  assert.equal(evidence.modelArtifactSha256, EXPECTED_MODEL_SHA256);
  assert.equal(evidence.featureSchemaSha256, EXPECTED_FEATURE_SCHEMA_SHA256);
  assert.equal(evidence.protocolSha256, EXPECTED_PROTOCOL_SHA256);
  assert.equal(evidence.crossRepoReviewEvidenceSha256, EXPECTED_CROSS_REPO_REVIEW_SHA256);
  assert.equal(evidence.runDigestSha256, EXPECTED_RUN_DIGEST_SHA256);
});

test('sealed exact-main evidence preserves candidates, domain holds, and blind-baseline accounting', () => {
  const { artifact } = readSealedArtifact();
  const { evidence } = artifact;

  let observedGroups = 0;
  let observedCandidates = 0;
  let observedScored = 0;
  let observedNoCandidate = 0;
  let observedDomainIncomplete = 0;
  let observedComparable = 0;
  let observedAgreement = 0;
  const observedDisagreements = [];

  for (const fixture of evidence.fixtureEvidence) {
    assert.match(fixture.evaluationId, /^[a-z0-9][a-z0-9-]*$/);
    assert.match(fixture.inputSha256, /^[0-9a-f]{64}$/);
    observedGroups += fixture.groupCount;
    observedCandidates += fixture.candidateCount;
    observedScored += fixture.scoredGroupCount;
    observedNoCandidate += fixture.noCandidateGroupCount;
    observedDomainIncomplete += fixture.modelDomainIncompleteGroupCount;

    for (const group of fixture.groups) {
      assert.equal(
        group.candidateCountAfterShadow,
        group.candidateCountBeforeShadow,
        `${fixture.evaluationId}:${group.sourceGroupId} mutated candidate count`,
      );

      if (group.status === 'SHADOW_NOT_SCORED_MODEL_DOMAIN_INCOMPLETE') {
        assert.equal(group.shadowScored, false);
        assert.equal(group.modelDomainComplete, false);
        assert.ok(group.outOfModelDomainCandidateCount > 0);
        assert.equal(group.comparison, 'NOT_COMPARABLE');
      }

      if (group.status === 'SHADOW_NOT_SCORED_NO_AUTHORITATIVE_CANDIDATES') {
        assert.equal(group.candidateCountBeforeShadow, 0);
        assert.equal(group.candidateCountAfterShadow, 0);
        assert.equal(group.shadowScored, false);
        assert.equal(group.topShadowCandidateId, null);
      }

      if (group.comparison === 'AGREE' || group.comparison === 'DISAGREE') {
        observedComparable += 1;
        if (group.comparison === 'AGREE') {
          observedAgreement += 1;
        } else {
          observedDisagreements.push(`${fixture.evaluationId}:${group.sourceGroupId}`);
        }
      }
    }
  }

  const metrics = evidence.metrics;
  assert.equal(observedGroups, metrics.totalGroupCount);
  assert.equal(observedCandidates, metrics.totalCandidateCount);
  assert.equal(observedScored, metrics.scoredGroupCount);
  assert.equal(observedNoCandidate, metrics.noCandidateGroupCount);
  assert.equal(observedDomainIncomplete, metrics.modelDomainIncompleteGroupCount);
  assert.equal(observedComparable, metrics.baselineComparableGroupCount);
  assert.equal(observedAgreement, metrics.top1AgreementCount);
  assert.deepEqual(observedDisagreements, metrics.disagreementIds);
  assert.equal(metrics.disagreementCount, observedDisagreements.length);

  assert.equal(metrics.fixtureCount, 6);
  assert.equal(metrics.totalGroupCount, 5);
  assert.equal(metrics.totalCandidateCount, 153);
  assert.equal(metrics.scoredGroupCount, 1);
  assert.equal(metrics.noCandidateGroupCount, 1);
  assert.equal(metrics.modelDomainIncompleteGroupCount, 3);
  assert.equal(metrics.scorableGroupRate, 0.2);
  assert.equal(metrics.noCandidateGroupRate, 0.2);
  assert.equal(metrics.modelDomainIncompleteRate, 0.6);
  assert.equal(metrics.candidateCountPreservationRate, 1);
  assert.equal(metrics.baselineComparableGroupCount, 1);
  assert.equal(metrics.top1AgreementCount, 1);
  assert.equal(metrics.top1AgreementRate, 1);
  assert.equal(metrics.disagreementCount, 0);
  assert.deepEqual(metrics.disagreementIds, []);
  assert.deepEqual(metrics.top1Top2MarginSummary, {
    count: 1,
    minimum: 0.452842290727,
    maximum: 0.452842290727,
    mean: 0.452842290727,
  });
  assert.equal(metrics.shadowErrorCount, 0);
});

test('sealed exact-main evidence records 10/10 determinism and keeps every authority boundary closed', () => {
  const { artifact } = readSealedArtifact();
  const { evidence, determinism, sealPolicy } = artifact;

  assert.deepEqual(determinism, {
    repetitions: 10,
    deterministic: true,
    evidenceRunDigestSha256: EXPECTED_RUN_DIGEST_SHA256,
    determinismDigestSha256: EXPECTED_DETERMINISM_DIGEST_SHA256,
  });

  assert.equal(evidence.controlledOfflineExecution, true);
  for (const field of [
    'liveShadowExecutionAuthorized',
    'runtimeConnectionAuthorized',
    'authoritativeDecisionEffectAuthorized',
    'canonicalResultEffectAuthorized',
    'tabOutputEffectAuthorized',
    'checkpointMutationAuthorized',
    'refitAuthorized',
    'productionAuthorized',
  ]) {
    assert.equal(evidence[field], false, `${field} must remain false in historical evidence`);
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

test('sealed exact-main evidence contains no raw score payload, local path, user filename, or label payload', () => {
  const { raw, artifact } = readSealedArtifact();

  const forbiddenRawPatterns = [
    /<\?xml/i,
    /<score-partwise/i,
    /<score-timewise/i,
    /[A-Za-z]:\\/,
    /\/Users\//,
    /\/home\//,
    /file:\/\//i,
    /\.musicxml\b/i,
  ];
  for (const pattern of forbiddenRawPatterns) {
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
        `Historical evidence contains a forbidden data-bearing field: ${pointer}`,
      );
    }
  });
});
