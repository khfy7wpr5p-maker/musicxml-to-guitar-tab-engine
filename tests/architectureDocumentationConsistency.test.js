'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const packageApi = require('..');
const packageJson = require('../package.json');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONVERGENCE_BASE = '50859edb322e65a3c8d3db74564fef871f10623f';
const ACTIVE_ARCHITECTURE_DOCS = [
  'README.md',
  'AI_CONTEXT.md',
  'docs/ARCHITECTURE.md',
  'docs/current-status.md',
  'docs/package-status.md',
  'docs/polyphonic-guitar-arrangement-foundation.md',
];
const REVIEW_DOC = 'docs/guitarset-v2-runtime-shadow-connection-review-v1.md';

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('active architecture documents converge on the PR #145 base and PR #146 runtime-shadow review', () => {
  for (const relativePath of ACTIVE_ARCHITECTURE_DOCS) {
    const text = read(relativePath);
    assert.match(text, /ARCHITECTURE-SNAPSHOT: 2026-08-24/, `${relativePath} snapshot marker`);
    assert.ok(text.includes(CONVERGENCE_BASE), `${relativePath} convergence base`);
    assert.ok(text.includes('PR #145'), `${relativePath} PR #145 base`);
    assert.ok(text.includes('PR #146'), `${relativePath} PR #146 runtime-shadow review`);
    assert.ok(text.includes('PR #150'), `${relativePath} PR #150 PA-12 implementation`);
  }
  assert.equal(fs.existsSync(path.join(REPO_ROOT, REVIEW_DOC)), true, `${REVIEW_DOC} must exist`);
});

test('active architecture documents describe the merged PA state and reviewed internal runtime-shadow boundary', () => {
  for (const relativePath of ACTIVE_ARCHITECTURE_DOCS) {
    const text = read(relativePath);
    for (const required of [
      'PA-8',
      'PA-9',
      'PA-10.5',
      'PA-11.4A',
      'PA-12',
      'GUITARSET-OBSERVED-VOICING-MODEL.v2',
      'CanonicalTabResult 1.0.0',
      'CanonicalTabResult 2.0.0',
      'fret20QualityAuthority=false',
      'GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE',
      'ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1',
      'evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json',
    ]) {
      assert.ok(text.includes(required), `${relativePath} must mention ${required}`);
    }

    const lowerText = text.toLowerCase();
    for (const required of [
      'runtime shadow connection: internal default-off',
      'live/user input: false',
      'authoritative optimizer/canonical/tab effect: false',
      'production: false',
    ]) {
      assert.ok(lowerText.includes(required), `${relativePath} must mention ${required}`);
    }
  }
});

test('live architecture documents do not retain the superseded runtime-closed review state', () => {
  const forbidden = [
    'runtime connection: false',
    'runtime shadow connection | 🔒 closed',
    'next human/consequential gate: `runtime_shadow_connection_review`',
    'runtime connection remains closed',
    'future internal pa-12 e2e',
    'future pa-12 internal e2e',
    'pa-12 internal polyphonic e2e: 🔒 not activated',
    '`canonicaltabresult 2.0.0` runtime/validator | 🔒 not implemented',
    'the documentation-converged exact head must pass the full protected matrix again before merge',
    'final merge still requires the same mandatory checks',
    'exact-head protected ci must pass again after documentation convergence',
  ];

  for (const relativePath of ACTIVE_ARCHITECTURE_DOCS) {
    const lowerText = read(relativePath).toLowerCase();
    for (const stale of forbidden) {
      assert.equal(lowerText.includes(stale), false, `${relativePath} contains stale claim: ${stale}`);
    }
  }
});

test('documented package boundary matches executable package metadata and public API', () => {
  assert.equal(packageJson.version, '0.1.0');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, 'SEE LICENSE IN LICENSE');
  assert.equal(packageJson.engines.node, '>=18');

  const expectedExports = [
    'ENGINE_ERROR_CONTRACT_VERSION',
    'FretboardError',
    'PREFLIGHT_STATUS',
    'convertMusicXmlToCanonicalTab',
    'getPositionCandidates',
    'isEngineError',
    'positionToMidi',
    'preflightMusicXml',
    'serializeCanonicalTabResult',
    'serializeCanonicalTabResultToAscii',
    'serializeCanonicalTabResultToMusicXml',
    'validateMidi',
  ].sort();
  assert.deepEqual(Object.keys(packageApi).sort(), expectedExports);

  for (const relativePath of ['README.md', 'AI_CONTEXT.md', 'docs/package-status.md']) {
    const text = read(relativePath);
    for (const required of ['0.1.0', 'private: true', 'SEE LICENSE IN LICENSE', 'Node.js >=18']) {
      assert.ok(text.includes(required), `${relativePath} must document ${required}`);
    }
  }
});

test('runtime-shadow implementation remains internal and outside package-root authority', () => {
  for (const relativePath of [
    'src/music/deterministicPa7CandidateSnapshotHandoff.js',
    'src/music/leftHandShapeModel.js',
    'src/music/physicalPlayabilityValidatorV2.js',
    'src/learning/guitarsetVoicingModelV2Shadow.js',
    'src/learning/guitarsetVoicingModelV2RuntimeShadow.js',
  ]) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} must exist`);
  }

  for (const exportName of [
    'createGuitarSetVoicingModelV2ShadowReport',
    'createBlindBaselineGuitarSetV2RuntimeShadowObservation',
    'observeGuitarSetVoicingModelV2RuntimeShadow',
    'createGuitarVoicingCandidateModel',
    'createLeftHandShapeModel',
    'createPhysicalPlayabilityValidationV2',
  ]) {
    assert.equal(Object.hasOwn(packageApi, exportName), false, `${exportName} must remain internal`);
  }
});

test('runtime-shadow review record preserves sealed identities and non-authoritative gates', () => {
  const text = read(REVIEW_DOC);
  for (const required of [
    'ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1',
    '7a56436c27ee6d996a49e7f989d37d7ffff187232277095b176c3c395c432314',
    '617981e90cce46c941596d1bd50ffffff64e6816c59d8f0dbed1acd6d8938285',
    'db67d88c4889a2b8c63411cd1e9bbd7481248dfbdd76da67f5df60b3871b4c02',
    'f42809c1ca9d5f6ff1c62dd072c91a9195bb46e1714e88bd84e8a5a57eef9140',
    'fret20QualityAuthority',
  ]) {
    assert.ok(text.includes(required), `${REVIEW_DOC} must mention ${required}`);
  }
  const lowerText = text.toLowerCase();
  for (const required of [
    'runtime shadow connection: internal default-off',
    'live/user input: false',
    'authoritative optimizer/canonical/tab effect: false',
    'production: false',
  ]) {
    assert.ok(lowerText.includes(required), `${REVIEW_DOC} must mention ${required}`);
  }
});
