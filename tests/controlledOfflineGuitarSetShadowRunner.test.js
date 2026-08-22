'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTROLLED_OFFLINE_SHADOW_EVIDENCE_VERSION,
  CONTROLLED_OFFLINE_SHADOW_DETERMINISM_VERSION,
  MIN_DETERMINISM_REPETITIONS,
  loadControlledOfflineFixtureInputs,
  createControlledOfflineShadowEvidence,
  verifyControlledOfflineShadowDeterminism,
} = require('../tools/controlledOfflineGuitarSetShadowRunner');

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
  'guitarsetObservedVoicingDevelopmentModelV1.json',
);
const ENGINE_SHA = /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA || '')
  ? process.env.GITHUB_SHA
  : 'f'.repeat(40);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fixtureInputs() {
  return loadControlledOfflineFixtureInputs(REPO_ROOT, readJson(MANIFEST_PATH));
}

function modelArtifact() {
  return readJson(MODEL_PATH);
}

test('controlled offline manifest is fixed, non-live, teacher-label-free and SHA sealed', () => {
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.documentType, 'ControlledOfflineGuitarSetShadowFixtureManifest');
  assert.equal(manifest.contractVersion, '1.0.0');
  assert.equal(manifest.sourcePolicy, 'REPOSITORY_OWNED_SELF_AUTHORED_NON_LIVE_ONLY');
  assert.equal(manifest.teacherLabelsIncluded, false);
  assert.equal(manifest.fixtures.length, 6);

  const inputs = loadControlledOfflineFixtureInputs(REPO_ROOT, manifest);
  assert.equal(inputs.length, 6);
  assert.equal(inputs.every((entry) => Object.isFrozen(entry)), true);
  assert.equal(
    manifest.fixtures.some((entry) => /approvals|reviews|benchmark\.proposed/i.test(entry.path)),
    false,
  );
});

test('controlled offline runner emits bounded diagnostics and preserves deterministic authority', () => {
  const evidence = createControlledOfflineShadowEvidence({
    engineCommitSha: ENGINE_SHA,
    fixtures: fixtureInputs(),
    modelArtifact: modelArtifact(),
  });

  assert.equal(evidence.documentType, 'ControlledOfflineGuitarSetShadowEvidence');
  assert.equal(evidence.contractVersion, CONTROLLED_OFFLINE_SHADOW_EVIDENCE_VERSION);
  assert.equal(evidence.mode, 'CONTROLLED_OFFLINE_PROJECT_SHADOW_EVIDENCE');
  assert.equal(evidence.engineCommitSha, ENGINE_SHA);
  assert.equal(evidence.metrics.fixtureCount, 6);
  assert.equal(evidence.metrics.candidateCountPreservationRate, 1);
  assert.equal(evidence.metrics.shadowErrorCount, 0);
  assert.ok(evidence.metrics.scoredGroupCount >= 1);
  assert.ok(evidence.metrics.modelDomainIncompleteGroupCount >= 1);
  assert.ok(evidence.metrics.noCandidateGroupCount >= 1);
  assert.match(evidence.runDigestSha256, /^[0-9a-f]{64}$/);

  for (const fixture of evidence.fixtureEvidence) {
    assert.equal(Object.hasOwn(fixture, 'musicXml'), false);
    assert.equal(Object.hasOwn(fixture, 'path'), false);
    for (const group of fixture.groups) {
      assert.equal(group.candidateCountAfterShadow, group.candidateCountBeforeShadow);
      assert.match(group.candidateSetSha256, /^[0-9a-f]{64}$/);
      assert.match(group.shadowRankingSha256, /^[0-9a-f]{64}$/);
    }
  }

  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes('<score-partwise'), false);
  assert.equal(serialized.includes('.musicxml'), false);
  assert.equal(serialized.includes('teacher-arrangement-v1'), false);
  assert.equal(serialized.includes('preferredArrangementId'), false);
  assert.equal(evidence.liveShadowExecutionAuthorized, false);
  assert.equal(evidence.runtimeConnectionAuthorized, false);
  assert.equal(evidence.authoritativeDecisionEffectAuthorized, false);
  assert.equal(evidence.canonicalResultEffectAuthorized, false);
  assert.equal(evidence.tabOutputEffectAuthorized, false);
  assert.equal(evidence.checkpointMutationAuthorized, false);
  assert.equal(evidence.refitAuthorized, false);
  assert.equal(evidence.productionAuthorized, false);
});

test('controlled offline fixed set reproduces exactly across the required 10/10 determinism gate', () => {
  const result = verifyControlledOfflineShadowDeterminism({
    engineCommitSha: ENGINE_SHA,
    fixtures: fixtureInputs(),
    modelArtifact: modelArtifact(),
    repetitions: MIN_DETERMINISM_REPETITIONS,
  });

  assert.equal(result.documentType, 'ControlledOfflineGuitarSetShadowDeterminismEvidence');
  assert.equal(result.contractVersion, CONTROLLED_OFFLINE_SHADOW_DETERMINISM_VERSION);
  assert.equal(result.repetitions, 10);
  assert.equal(result.deterministic, true);
  assert.equal(result.fixtureCount, 6);
  assert.match(result.evidenceRunDigestSha256, /^[0-9a-f]{64}$/);
  assert.match(result.determinismDigestSha256, /^[0-9a-f]{64}$/);
  assert.equal(result.liveShadowExecutionAuthorized, false);
  assert.equal(result.runtimeConnectionAuthorized, false);
  assert.equal(result.authoritativeDecisionEffectAuthorized, false);
  assert.equal(result.tabOutputEffectAuthorized, false);
  assert.equal(result.productionAuthorized, false);
});

test('fixture hash drift is a hard stop before shadow execution', () => {
  const manifest = readJson(MANIFEST_PATH);
  manifest.fixtures[0].sha256 = '0'.repeat(64);

  assert.throws(
    () => loadControlledOfflineFixtureInputs(REPO_ROOT, manifest),
    (error) => (
      error
      && error.code === 'CONTROLLED_OFFLINE_SHADOW_HARD_STOP'
      && /SHA-256 drift/.test(error.message)
    ),
  );
});

test('retained model parameter tampering hard-stops the controlled offline runner', () => {
  const tampered = modelArtifact();
  tampered.parameters.logistic_coef_hex[0] = '0x1.0000000000000p+0';

  assert.throws(
    () => createControlledOfflineShadowEvidence({
      engineCommitSha: ENGINE_SHA,
      fixtures: fixtureInputs(),
      modelArtifact: tampered,
    }),
    (error) => (
      error
      && error.code === 'CONTROLLED_OFFLINE_SHADOW_HARD_STOP'
      && /model identity\/provenance validation failed/i.test(error.message)
    ),
  );
});

test('controlled offline runner rejects path escape and label-bearing fixture roots', () => {
  const manifest = readJson(MANIFEST_PATH);
  manifest.fixtures[0].path = '../approvals/teacher.json';

  assert.throws(
    () => loadControlledOfflineFixtureInputs(REPO_ROOT, manifest),
    /fixture boundary|repository-relative/i,
  );

  const labelManifest = readJson(MANIFEST_PATH);
  labelManifest.fixtures[0].path = 'benchmarks/teacher-arrangement-v1/approvals/teacher.json';

  assert.throws(
    () => loadControlledOfflineFixtureInputs(REPO_ROOT, labelManifest),
    /MusicXML fixture|non-live fixture roots/i,
  );
});
