'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'sem06');
const SOURCE_PATH = path.join(FIXTURE_DIR, 'semantic_baseline.musicxml');
const SNAPSHOT_PATH = path.join(FIXTURE_DIR, 'semantic_baseline.expected.json');
const PROVENANCE_PATH = path.join(FIXTURE_DIR, 'semantic_baseline.provenance.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadFixtureBundle() {
  return {
    sourceBytes: fs.readFileSync(SOURCE_PATH),
    snapshot: JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')),
    provenance: JSON.parse(fs.readFileSync(PROVENANCE_PATH, 'utf8')),
  };
}

function loadAdmissionApi() {
  let api;
  assert.doesNotThrow(() => {
    api = require('../src/semantic/semanticReferenceBundle');
  });
  return api;
}

test('SEM-06A keeps semantic reference admission internal to the package', () => {
  const api = loadAdmissionApi();
  const packageRoot = require('../src');

  assert.equal(typeof api.admitSemanticReferenceBundle, 'function');
  assert.equal(packageRoot.admitSemanticReferenceBundle, undefined);
});

test('SEM-06A admits the exact pinned semantic reference bundle as non-blocking evidence', () => {
  const { admitSemanticReferenceBundle } = loadAdmissionApi();
  const result = admitSemanticReferenceBundle(loadFixtureBundle());

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.tabGenerationBlocking, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.diagnostics));
});

test('SEM-06A rejects source SHA mismatch without gaining TAB blocking authority', () => {
  const { admitSemanticReferenceBundle } = loadAdmissionApi();
  const bundle = loadFixtureBundle();
  bundle.sourceBytes = Buffer.concat([bundle.sourceBytes, Buffer.from('\n')]);

  const result = admitSemanticReferenceBundle(bundle);

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, ['SOURCE_SHA256_MISMATCH']);
  assert.equal(result.tabGenerationBlocking, false);
});

test('SEM-06A rejects Semantic Engine provenance mismatch', () => {
  const { admitSemanticReferenceBundle } = loadAdmissionApi();
  const bundle = loadFixtureBundle();
  bundle.provenance = {
    ...bundle.provenance,
    semanticEngineCommit: '0000000000000000000000000000000000000000',
  };

  const result = admitSemanticReferenceBundle(bundle);

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, ['SEMANTIC_ENGINE_COMMIT_MISMATCH']);
  assert.equal(result.tabGenerationBlocking, false);
});

test('SEM-06A rejects snapshot schema mismatch', () => {
  const { admitSemanticReferenceBundle } = loadAdmissionApi();
  const bundle = loadFixtureBundle();
  bundle.snapshot = {
    ...bundle.snapshot,
    schema_version: 'st-semantic-snapshot-v999',
  };

  const result = admitSemanticReferenceBundle(bundle);

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, ['SNAPSHOT_SCHEMA_MISMATCH']);
  assert.equal(result.tabGenerationBlocking, false);
});

test('SEM-06A rejects profile mismatch fail-closed', () => {
  const { admitSemanticReferenceBundle } = loadAdmissionApi();
  const bundle = loadFixtureBundle();
  bundle.provenance = clone(bundle.provenance);
  bundle.provenance.profile.measureCount = 3;

  const result = admitSemanticReferenceBundle(bundle);

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, ['PROFILE_MISMATCH']);
  assert.equal(result.tabGenerationBlocking, false);
});

test('SEM-06A rejects malformed semantic artifacts deterministically', () => {
  const { admitSemanticReferenceBundle } = loadAdmissionApi();
  const bundle = loadFixtureBundle();
  bundle.snapshot = null;

  const result = admitSemanticReferenceBundle(bundle);

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, ['MALFORMED_REFERENCE_BUNDLE']);
  assert.equal(result.tabGenerationBlocking, false);
});
