'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTROLLED_OFFLINE_V2_SHADOW_EVIDENCE_VERSION,
  CONTROLLED_OFFLINE_V2_SHADOW_DETERMINISM_VERSION,
  EXPECTED_CONTROLLED_OFFLINE_FIXTURE_MANIFEST_SHA256,
  MIN_DETERMINISM_REPETITIONS,
  loadControlledOfflineV2FixtureInputs,
  createControlledOfflineV2ShadowEvidence,
  verifyControlledOfflineV2ShadowDeterminism,
} = require('../tools/controlledOfflineGuitarSetV2ShadowRunner');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'benchmarks',
  'guitarset-shadow',
  'controlled-offline-fixtures.v1.json',
);
const MODEL_PATH = path.join(
  __dirname,
  'fixtures',
  'guitarsetObservedVoicingDevelopmentModelV2.json',
);
const RUNNER_PATH = path.join(
  REPO_ROOT,
  'tools',
  'controlledOfflineGuitarSetV2ShadowRunner.js',
);
const ENGINE_SHA = /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA || '')
  ? process.env.GITHUB_SHA
  : 'f'.repeat(40);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fixtureInputs() {
  return loadControlledOfflineV2FixtureInputs(REPO_ROOT, readJson(MANIFEST_PATH));
}

function modelArtifact() {
  return readJson(MODEL_PATH);
}

function sha256Utf8(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

test('v2 controlled offline runner is bound to the exact reviewed SHA-sealed non-live manifest', () => {
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.documentType, 'ControlledOfflineGuitarSetShadowFixtureManifest');
  assert.equal(manifest.contractVersion, '1.0.0');
  assert.equal(manifest.sourcePolicy, 'REPOSITORY_OWNED_SELF_AUTHORED_NON_LIVE_ONLY');
  assert.equal(manifest.teacherLabelsIncluded, false);
  assert.equal(manifest.fixtures.length, 6);
  assert.match(EXPECTED_CONTROLLED_OFFLINE_FIXTURE_MANIFEST_SHA256, /^[0-9a-f]{64}$/);

  const inputs = fixtureInputs();
  assert.equal(inputs.length, 6);
  assert.equal(inputs.every((entry) => Object.isFrozen(entry)), true);
  assert.equal(
    manifest.fixtures.some((entry) => /approvals|reviews|benchmark\.proposed/i.test(entry.path)),
    false,
  );
});

test('v2 manifest identity drift hard-stops before controlled evidence creation', () => {
  const manifest = readJson(MANIFEST_PATH);
  manifest.fixtures[0].evaluationId = 'reviewed-fixture-identity-drift';

  assert.throws(
    () => loadControlledOfflineV2FixtureInputs(REPO_ROOT, manifest),
    (error) => (
      error
      && error.code === 'CONTROLLED_OFFLINE_V2_SHADOW_HARD_STOP'
      && /manifest identity drift/i.test(error.message)
    ),
  );
});

test('direct self-consistent MusicXML cannot bypass reviewed-manifest provenance', () => {
  const manifest = readJson(MANIFEST_PATH);
  const fixturePath = path.join(REPO_ROOT, ...manifest.fixtures[0].path.split('/'));
  const musicXml = fs.readFileSync(fixturePath, 'utf8');
  const forgedFixtures = Object.freeze([
    Object.freeze({
      evaluationId: 'forged-self-consistent-input',
      expectedSha256: sha256Utf8(musicXml),
      musicXml,
    }),
  ]);

  assert.throws(
    () => createControlledOfflineV2ShadowEvidence({
      engineCommitSha: ENGINE_SHA,
      fixtures: forgedFixtures,
      modelArtifact: modelArtifact(),
    }),
    (error) => (
      error
      && error.code === 'CONTROLLED_OFFLINE_V2_SHADOW_HARD_STOP'
      && /reviewed manifest/i.test(error.message)
    ),
  );
});

test('copying reviewed fixture objects into a new array loses controlled provenance', () => {
  const reviewed = fixtureInputs();
  const copied = Object.freeze([...reviewed]);

  assert.throws(
    () => createControlledOfflineV2ShadowEvidence({
      engineCommitSha: ENGINE_SHA,
      fixtures: copied,
      modelArtifact: modelArtifact(),
    }),
    (error) => (
      error
      && error.code === 'CONTROLLED_OFFLINE_V2_SHADOW_HARD_STOP'
      && /reviewed manifest/i.test(error.message)
    ),
  );
});

test('v2 controlled offline evidence scores every candidate-bearing group and preserves PA-7 candidates', () => {
  const evidence = createControlledOfflineV2ShadowEvidence({
    engineCommitSha: ENGINE_SHA,
    fixtures: fixtureInputs(),
    modelArtifact: modelArtifact(),
  });

  assert.equal(evidence.documentType, 'ControlledOfflineGuitarSetV2ShadowEvidence');
  assert.equal(evidence.contractVersion, CONTROLLED_OFFLINE_V2_SHADOW_EVIDENCE_VERSION);
  assert.equal(evidence.mode, 'GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE');
  assert.equal(evidence.engineCommitSha, ENGINE_SHA);
  assert.equal(evidence.fixtureManifestSha256, EXPECTED_CONTROLLED_OFFLINE_FIXTURE_MANIFEST_SHA256);
  assert.deepEqual(evidence.candidateFretDomain, [0, 20]);
  assert.deepEqual(evidence.sourceObservedFretDomain, [0, 19]);
  assert.equal(evidence.metrics.fixtureCount, 6);
  assert.ok(evidence.metrics.candidateBearingGroupCount >= 1);
  assert.equal(evidence.metrics.scoredGroupCount, evidence.metrics.candidateBearingGroupCount);
  assert.equal(evidence.metrics.candidateBearingScorableRate, 1);
  assert.equal(evidence.metrics.noScoreGroupCount, evidence.metrics.noCandidateGroupCount);
  assert.equal(evidence.metrics.totalCandidateCountAfterShadow, evidence.metrics.totalCandidateCount);
  assert.equal(evidence.metrics.candidateCountPreservationRate, 1);
  assert.equal(evidence.metrics.shadowErrorCount, 0);
  assert.ok(evidence.metrics.fret20CandidateCount >= 1);
  assert.ok(evidence.metrics.fret20CandidateGroupCount >= 1);
  assert.match(evidence.runDigestSha256, /^[0-9a-f]{64}$/);

  let before = 0;
  let after = 0;
  for (const fixture of evidence.fixtureEvidence) {
    assert.equal(Object.hasOwn(fixture, 'musicXml'), false);
    assert.equal(Object.hasOwn(fixture, 'path'), false);
    for (const group of fixture.groups) {
      before += group.candidateCountBeforeShadow;
      after += group.candidateCountAfterShadow;
      assert.equal(group.candidateCountAfterShadow, group.candidateCountBeforeShadow);
      assert.equal(group.modelDomainComplete, true);
      assert.match(group.candidateSetSha256, /^[0-9a-f]{64}$/);
      assert.match(group.shadowRankingSha256, /^[0-9a-f]{64}$/);
      if (group.candidateCountBeforeShadow > 0) {
        assert.equal(group.shadowScored, true);
      }
    }
  }
  assert.equal(after, before);
  assert.equal(after, evidence.metrics.totalCandidateCount);
});

test('v2 controlled offline evidence keeps all runtime and production authority closed', () => {
  const evidence = createControlledOfflineV2ShadowEvidence({
    engineCommitSha: ENGINE_SHA,
    fixtures: fixtureInputs(),
    modelArtifact: modelArtifact(),
  });

  assert.equal(evidence.controlledOfflineExecution, true);
  assert.equal(evidence.liveOrUserInputAuthorized, false);
  assert.equal(evidence.runtimeConnectionAuthorized, false);
  assert.equal(evidence.candidateMutationAuthorized, false);
  assert.equal(evidence.candidateFilteringAuthorized, false);
  assert.equal(evidence.candidateGenerationAuthorized, false);
  assert.equal(evidence.authoritativeDecisionEffectAuthorized, false);
  assert.equal(evidence.canonicalResultEffectAuthorized, false);
  assert.equal(evidence.tabOutputEffectAuthorized, false);
  assert.equal(evidence.checkpointMutationAuthorized, false);
  assert.equal(evidence.refitAuthorized, false);
  assert.equal(evidence.fret20CandidateScoringAuthorized, true);
  assert.equal(evidence.fret20QualityAuthority, false);
  assert.equal(evidence.networkOrTelemetryAuthorized, false);
  assert.equal(evidence.productionAuthorized, false);

  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes('<score-partwise'), false);
  assert.equal(serialized.includes('.musicxml'), false);
  assert.equal(serialized.includes('teacher-arrangement-v1'), false);
  assert.equal(serialized.includes('preferredArrangementId'), false);
});

test('v2 controlled offline fixed set reproduces exactly across the required 10/10 determinism gate', () => {
  const inputs = fixtureInputs();
  const result = verifyControlledOfflineV2ShadowDeterminism({
    engineCommitSha: ENGINE_SHA,
    fixtures: inputs,
    modelArtifact: modelArtifact(),
    repetitions: MIN_DETERMINISM_REPETITIONS,
  });

  assert.equal(result.documentType, 'ControlledOfflineGuitarSetV2ShadowDeterminismEvidence');
  assert.equal(result.contractVersion, CONTROLLED_OFFLINE_V2_SHADOW_DETERMINISM_VERSION);
  assert.equal(result.fixtureManifestSha256, EXPECTED_CONTROLLED_OFFLINE_FIXTURE_MANIFEST_SHA256);
  assert.equal(result.repetitions, 10);
  assert.equal(result.deterministic, true);
  assert.equal(result.fixtureCount, 6);
  assert.equal(result.candidateBearingScorableRate, 1);
  assert.equal(result.candidateCountPreservationRate, 1);
  assert.ok(result.fret20CandidateCount >= 1);
  assert.match(result.evidenceRunDigestSha256, /^[0-9a-f]{64}$/);
  assert.match(result.determinismDigestSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.liveOrUserInputAuthorized, false);
  assert.equal(result.runtimeConnectionAuthorized, false);
  assert.equal(result.authoritativeDecisionEffectAuthorized, false);
  assert.equal(result.canonicalResultEffectAuthorized, false);
  assert.equal(result.tabOutputEffectAuthorized, false);
  assert.equal(result.fret20QualityAuthority, false);
  assert.equal(result.productionAuthorized, false);
});

test('v2 retained model tampering hard-stops controlled offline execution', () => {
  const tampered = modelArtifact();
  tampered.parameters.logistic_coef_hex[0] = '0x1.0000000000000p+0';

  assert.throws(
    () => createControlledOfflineV2ShadowEvidence({
      engineCommitSha: ENGINE_SHA,
      fixtures: fixtureInputs(),
      modelArtifact: tampered,
    }),
    (error) => (
      error
      && error.code === 'CONTROLLED_OFFLINE_V2_SHADOW_HARD_STOP'
      && /model identity\/provenance validation failed/i.test(error.message)
    ),
  );
});

test('v2 controlled offline runner has no network client or ordinary package-root export', () => {
  const source = fs.readFileSync(RUNNER_PATH, 'utf8');
  assert.doesNotMatch(source, /require\(['"](?:node:)?(?:http|https|net|tls|dgram)['"]\)/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|axios)\b/);

  const packageRoot = require('../src');
  assert.equal(Object.hasOwn(packageRoot, 'loadControlledOfflineV2FixtureInputs'), false);
  assert.equal(Object.hasOwn(packageRoot, 'createControlledOfflineV2ShadowEvidence'), false);
  assert.equal(Object.hasOwn(packageRoot, 'verifyControlledOfflineV2ShadowDeterminism'), false);
});
