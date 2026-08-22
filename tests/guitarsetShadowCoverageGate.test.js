'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadControlledOfflineFixtureInputs,
  createControlledOfflineShadowEvidence,
  verifyControlledOfflineShadowDeterminism,
} = require('../tools/controlledOfflineGuitarSetShadowRunner');
const {
  GuitarSetShadowCoverageGateError,
  evaluateGuitarSetShadowCoverage,
} = require('../tools/guitarsetShadowCoverageGate');

const REPO_ROOT = path.join(__dirname, '..');
const BASE_ENGINE_SHA = '661c892f6fed0033bb1bd34e9f2f0ba9f40c0b74';
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

function createSafeSyntheticEvidence(overrides = {}) {
  const metrics = {
    totalGroupCount: 5,
    scoredGroupCount: 4,
    noCandidateGroupCount: 1,
    modelDomainIncompleteGroupCount: 0,
    scorableGroupRate: 0.8,
    noCandidateGroupRate: 0.2,
    modelDomainIncompleteRate: 0,
    candidateCountPreservationRate: 1,
    baselineComparableGroupCount: 2,
    top1AgreementCount: 1,
    disagreementCount: 1,
    shadowErrorCount: 0,
    ...overrides.metrics,
  };
  return {
    evidence: {
      metrics,
      runtimeConnectionAuthorized: false,
      authoritativeDecisionEffectAuthorized: false,
      canonicalResultEffectAuthorized: false,
      tabOutputEffectAuthorized: false,
      productionAuthorized: false,
      ...overrides.evidence,
    },
    determinism: {
      repetitions: 10,
      deterministic: true,
      ...overrides.determinism,
    },
  };
}

test('current retained GuitarSet v1 is held because controlled candidate-bearing coverage is incomplete', () => {
  const manifest = readJson(MANIFEST_PATH);
  const fixtures = loadControlledOfflineFixtureInputs(REPO_ROOT, manifest);
  const modelArtifact = readJson(MODEL_PATH);
  const evidence = createControlledOfflineShadowEvidence({
    engineCommitSha: BASE_ENGINE_SHA,
    fixtures,
    modelArtifact,
  });
  const determinism = verifyControlledOfflineShadowDeterminism({
    engineCommitSha: BASE_ENGINE_SHA,
    fixtures,
    modelArtifact,
    repetitions: 10,
  });

  const gate = evaluateGuitarSetShadowCoverage({ evidence, determinism });

  assert.equal(gate.status, 'HOLD_MODEL_DOMAIN_INCOMPLETE');
  assert.equal(gate.coverageComplete, false);
  assert.equal(gate.totalGroupCount, 5);
  assert.equal(gate.candidateBearingGroupCount, 4);
  assert.equal(gate.scoredGroupCount, 1);
  assert.equal(gate.noCandidateGroupCount, 1);
  assert.equal(gate.modelDomainIncompleteGroupCount, 3);
  assert.equal(gate.candidateBearingCoverageRate, 0.25);
  assert.equal(gate.modelDomainIncompleteRate, 0.75);
  assert.equal(gate.scorableGroupRate, 0.2);
  assert.equal(gate.noScoreGroupCount, 4);
  assert.equal(gate.noScoreGroupRate, 0.8);
  assert.equal(gate.candidateCountPreservationRate, 1);
  assert.equal(gate.shadowErrorCount, 0);
  assert.equal(gate.deterministicRepetitions, 10);
  assert.equal(gate.promotionAuthorized, false);
  assert.equal(gate.runtimeConnectionAuthorized, false);
  assert.equal(gate.authoritativeDecisionEffectAuthorized, false);
  assert.equal(gate.productionAuthorized, false);
});

test('complete controlled model-domain coverage remains explicitly non-authoritative', () => {
  const input = createSafeSyntheticEvidence();
  const gate = evaluateGuitarSetShadowCoverage(input);

  assert.equal(gate.status, 'CONTROLLED_MODEL_DOMAIN_COVERAGE_COMPLETE_NON_AUTHORITATIVE');
  assert.equal(gate.coverageComplete, true);
  assert.equal(gate.candidateBearingCoverageRate, 1);
  assert.equal(gate.noScoreGroupRate, 0.2);
  assert.equal(gate.promotionAuthorized, false);
  assert.equal(gate.productionAuthorized, false);
});

test('coverage gate hard-stops candidate loss, shadow errors, weak determinism, and authority drift', () => {
  const cases = [
    createSafeSyntheticEvidence({ metrics: { candidateCountPreservationRate: 0.99 } }),
    createSafeSyntheticEvidence({ metrics: { shadowErrorCount: 1 } }),
    createSafeSyntheticEvidence({ determinism: { deterministic: false } }),
    createSafeSyntheticEvidence({ determinism: { repetitions: 9 } }),
    createSafeSyntheticEvidence({ evidence: { productionAuthorized: true } }),
  ];

  for (const input of cases) {
    assert.throws(
      () => evaluateGuitarSetShadowCoverage(input),
      (error) => error instanceof GuitarSetShadowCoverageGateError
        && error.code === 'GUITARSET_SHADOW_COVERAGE_HARD_STOP',
    );
  }
});

test('coverage gate rejects inconsistent group and comparison accounting', () => {
  const inconsistentGroups = createSafeSyntheticEvidence({
    metrics: { modelDomainIncompleteGroupCount: 1 },
  });
  const inconsistentComparison = createSafeSyntheticEvidence({
    metrics: { disagreementCount: 0 },
  });

  assert.throws(
    () => evaluateGuitarSetShadowCoverage(inconsistentGroups),
    GuitarSetShadowCoverageGateError,
  );
  assert.throws(
    () => evaluateGuitarSetShadowCoverage(inconsistentComparison),
    GuitarSetShadowCoverageGateError,
  );
});

test('coverage gate remains outside the package-root production API', () => {
  const publicApi = require('../src');
  assert.equal(Object.hasOwn(publicApi, 'evaluateGuitarSetShadowCoverage'), false);
  assert.equal(Object.hasOwn(publicApi, 'GUITARSET_SHADOW_COVERAGE_GATE_VERSION'), false);
});
