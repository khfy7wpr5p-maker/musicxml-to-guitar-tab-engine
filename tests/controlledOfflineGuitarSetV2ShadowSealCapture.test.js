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
const EXACT_MAIN_SHA = '18e3b444348f50fdf8e273cb99c2f25a92b8e687';
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('capture exact-main GuitarSet v2 offline shadow evidence for sealing', () => {
  const fixtures = loadControlledOfflineV2FixtureInputs(REPO_ROOT, readJson(MANIFEST_PATH));
  const modelArtifact = readJson(MODEL_PATH);
  const evidence = createControlledOfflineV2ShadowEvidence({
    engineCommitSha: EXACT_MAIN_SHA,
    fixtures,
    modelArtifact,
  });
  const determinism = verifyControlledOfflineV2ShadowDeterminism({
    engineCommitSha: EXACT_MAIN_SHA,
    fixtures,
    modelArtifact,
    repetitions: MIN_DETERMINISM_REPETITIONS,
  });

  assert.equal(evidence.engineCommitSha, EXACT_MAIN_SHA);
  assert.equal(determinism.engineCommitSha, EXACT_MAIN_SHA);
  assert.equal(determinism.deterministic, true);
  console.log(`GUITARSET_V2_SEAL_CAPTURE=${JSON.stringify({ evidence, determinism })}`);
});
