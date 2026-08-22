'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIN_DETERMINISM_REPETITIONS,
  loadControlledOfflineFixtureInputs,
  createControlledOfflineShadowEvidence,
  verifyControlledOfflineShadowDeterminism,
} = require('../tools/controlledOfflineGuitarSetShadowRunner');

const REPO_ROOT = path.join(__dirname, '..');
const EXACT_MAIN_SHA = 'a2d4e9461382d5c4fdf49d04c5d949b2f40bbc35';
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('capture exact-main controlled offline GuitarSet shadow evidence', () => {
  const manifest = readJson(MANIFEST_PATH);
  const fixtures = loadControlledOfflineFixtureInputs(REPO_ROOT, manifest);
  const modelArtifact = readJson(MODEL_PATH);

  const evidence = createControlledOfflineShadowEvidence({
    engineCommitSha: EXACT_MAIN_SHA,
    fixtures,
    modelArtifact,
  });
  const determinism = verifyControlledOfflineShadowDeterminism({
    engineCommitSha: EXACT_MAIN_SHA,
    fixtures,
    modelArtifact,
    repetitions: MIN_DETERMINISM_REPETITIONS,
  });

  assert.equal(evidence.engineCommitSha, EXACT_MAIN_SHA);
  assert.equal(evidence.metrics.fixtureCount, 6);
  assert.equal(evidence.metrics.candidateCountPreservationRate, 1);
  assert.equal(evidence.metrics.shadowErrorCount, 0);
  assert.equal(determinism.repetitions, 10);
  assert.equal(determinism.deterministic, true);
  assert.equal(determinism.evidenceRunDigestSha256, evidence.runDigestSha256);
  assert.equal(evidence.runtimeConnectionAuthorized, false);
  assert.equal(evidence.authoritativeDecisionEffectAuthorized, false);
  assert.equal(evidence.tabOutputEffectAuthorized, false);
  assert.equal(evidence.productionAuthorized, false);

  const capture = {
    engineCommitSha: EXACT_MAIN_SHA,
    modelArtifactSha256: evidence.modelArtifactSha256,
    featureSchemaSha256: evidence.featureSchemaSha256,
    protocolSha256: evidence.protocolSha256,
    metrics: evidence.metrics,
    fixtureEvidence: evidence.fixtureEvidence,
    runDigestSha256: evidence.runDigestSha256,
    determinism: {
      repetitions: determinism.repetitions,
      deterministic: determinism.deterministic,
      determinismDigestSha256: determinism.determinismDigestSha256,
    },
    authority: {
      runtimeConnectionAuthorized: evidence.runtimeConnectionAuthorized,
      authoritativeDecisionEffectAuthorized: evidence.authoritativeDecisionEffectAuthorized,
      canonicalResultEffectAuthorized: evidence.canonicalResultEffectAuthorized,
      tabOutputEffectAuthorized: evidence.tabOutputEffectAuthorized,
      productionAuthorized: evidence.productionAuthorized,
    },
  };

  console.log(`CONTROLLED_OFFLINE_SHADOW_EVIDENCE_CAPTURE=${JSON.stringify(capture)}`);
});
