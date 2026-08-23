'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
const EXACT_MAIN_ENGINE_SHA = 'acdb66e2bb2ad809ab45fc7c2183d84280d61ad7';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('capture GuitarSet v2 evidence against the frozen exact-main base in PR CI', () => {
  const isReviewedCapturePr = (
    process.env.GITHUB_EVENT_NAME === 'pull_request'
    && process.env.GITHUB_BASE_REF === 'main'
  );

  if (!isReviewedCapturePr) {
    assert.ok(true);
    return;
  }

  const fixtures = loadControlledOfflineV2FixtureInputs(REPO_ROOT, readJson(MANIFEST_PATH));
  const modelArtifact = readJson(MODEL_PATH);
  const evidence = createControlledOfflineV2ShadowEvidence({
    engineCommitSha: EXACT_MAIN_ENGINE_SHA,
    fixtures,
    modelArtifact,
  });
  const determinism = verifyControlledOfflineV2ShadowDeterminism({
    engineCommitSha: EXACT_MAIN_ENGINE_SHA,
    fixtures,
    modelArtifact,
    repetitions: MIN_DETERMINISM_REPETITIONS,
  });

  assert.equal(evidence.engineCommitSha, EXACT_MAIN_ENGINE_SHA);
  assert.equal(evidence.metrics.candidateCountPreservationRate, 1);
  assert.equal(evidence.metrics.candidateBearingScorableRate, 1);
  assert.equal(evidence.runtimeConnectionAuthorized, false);
  assert.equal(evidence.authoritativeDecisionEffectAuthorized, false);
  assert.equal(evidence.canonicalResultEffectAuthorized, false);
  assert.equal(evidence.tabOutputEffectAuthorized, false);
  assert.equal(evidence.productionAuthorized, false);
  assert.equal(determinism.repetitions, 10);
  assert.equal(determinism.deterministic, true);

  const capture = {
    documentType: 'ControlledOfflineGuitarSetV2ShadowExactMainCapture',
    schemaVersion: '1.0.0',
    exactMainEngineSha: EXACT_MAIN_ENGINE_SHA,
    evidence,
    determinism,
  };
  const serialized = JSON.stringify(capture);

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
    assert.doesNotMatch(serialized, pattern);
  }

  console.log(`GUITARSET_V2_EXACT_MAIN_CAPTURE=${serialized}`);
});
