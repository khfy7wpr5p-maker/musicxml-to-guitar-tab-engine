'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const packageApi = require('..');
const packageJson = require('../package.json');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONVERGENCE_BASE = '200d55ebc4863471c8c50b59e9ba6a6115806dd6';
const ARCHITECTURE_DOCS = [
  'README.md',
  'AI_CONTEXT.md',
  'docs/ARCHITECTURE.md',
  'docs/current-status.md',
  'docs/package-status.md',
  'docs/polyphonic-guitar-arrangement-foundation.md',
  'docs/musicxml-compatibility.md',
];

const ACTIVE_ARCHITECTURE_DOCS = ARCHITECTURE_DOCS.slice(0, 6);

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('central architecture documents converge on the PR #136 runtime baseline', () => {
  for (const relativePath of ARCHITECTURE_DOCS) {
    const text = read(relativePath);
    assert.match(text, /ARCHITECTURE-SNAPSHOT: 2026-08-23/, `${relativePath} snapshot marker`);
    assert.ok(text.includes(CONVERGENCE_BASE), `${relativePath} convergence base`);
    assert.ok(text.includes('PR #136'), `${relativePath} PR #136 evidence`);
  }
});

test('active architecture documents describe the actually merged PA and GuitarSet v2 state', () => {
  for (const relativePath of ACTIVE_ARCHITECTURE_DOCS) {
    const text = read(relativePath);
    for (const required of [
      'PA-8',
      'PA-9',
      'PA-10.5',
      'PA-11.4A',
      'GUITARSET-OBSERVED-VOICING-MODEL.v2',
      'CanonicalTabResult 1.0.0',
      'fret20QualityAuthority=false',
      'GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE',
      'RUNTIME_SHADOW_CONNECTION_REVIEW',
      'evidence/offline-shadow/exact-main/acdb66e2bb2ad809ab45fc7c2183d84280d61ad7/controlled-offline-shadow-evidence.v2.json',
    ]) {
      assert.ok(text.includes(required), `${relativePath} must mention ${required}`);
    }
  }
});

test('central architecture documents do not retain known stale next-stage claims', () => {
  const forbidden = [
    'next separately approved polyphonic gate: PA-8',
    'PA-8 is not authorized by PA-7 closure',
    'next separately approved PA-10 slice: **PA-10.3',
    'PA-10 status: `IN_PROGRESS`; PA-10.0 through PA-10.2 are merged',
    'Next gate: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE`',
    'Next learned-evidence gate: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE`',
    'Next learned-model evidence gate: `GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EXECUTION_EVIDENCE`',
    '🟡 NEXT GATE',
  ];

  for (const relativePath of ARCHITECTURE_DOCS) {
    const text = read(relativePath);
    for (const stale of forbidden) {
      assert.equal(text.includes(stale), false, `${relativePath} contains stale claim: ${stale}`);
    }
  }
});

test('documented package boundary matches executable package metadata and public API', () => {
  assert.equal(packageJson.version, '0.1.0');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, 'UNLICENSED');
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
    for (const required of ['0.1.0', 'private: true', 'UNLICENSED', 'Node.js >=18']) {
      assert.ok(text.includes(required), `${relativePath} must document ${required}`);
    }
  }
});

test('merged internal architecture exists while v2 shadow remains outside package-root authority', () => {
  for (const relativePath of [
    'src/music/leftHandShapeModel.js',
    'src/music/physicalPlayabilityValidatorV2.js',
    'src/benchmark/revoicingToneCandidateModel.js',
    'src/learning/guitarsetVoicingModelV2Shadow.js',
  ]) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} must exist`);
  }

  for (const exportName of [
    'createGuitarSetVoicingModelV2ShadowReport',
    'createGuitarVoicingCandidateModel',
    'createLeftHandShapeModel',
    'createPhysicalPlayabilityValidationV2',
  ]) {
    assert.equal(Object.hasOwn(packageApi, exportName), false, `${exportName} must remain internal`);
  }
});

test('architecture records completed v2 offline evidence without granting runtime authority', () => {
  const artifactPath = path.join(
    REPO_ROOT,
    'evidence',
    'offline-shadow',
    'exact-main',
    'acdb66e2bb2ad809ab45fc7c2183d84280d61ad7',
    'controlled-offline-shadow-evidence.v2.json',
  );
  assert.equal(fs.existsSync(artifactPath), true, 'immutable v2 evidence must exist');

  for (const relativePath of ACTIVE_ARCHITECTURE_DOCS) {
    const text = read(relativePath);
    assert.ok(text.includes('GUITARSET_V2_CONTROLLED_OFFLINE_SHADOW_EVIDENCE_COMPLETE'), `${relativePath} completed evidence marker`);
    assert.ok(text.includes('RUNTIME_SHADOW_CONNECTION_REVIEW'), `${relativePath} human next gate`);
    assert.ok(text.includes('runtime connection: false'), `${relativePath} runtime boundary`);
    assert.ok(text.includes('production: false'), `${relativePath} production boundary`);
  }
});
