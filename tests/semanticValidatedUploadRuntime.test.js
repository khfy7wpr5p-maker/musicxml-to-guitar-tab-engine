'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  admitSemanticReferenceBundle,
} = require('../src/semantic/semanticReferenceBundle');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'sem06');

function loadSidecarApi() {
  let api;
  assert.doesNotThrow(() => {
    api = require('../src/semantic/semanticValidatedUploadRuntime');
  });
  return api;
}

function loadQualifiedBundle() {
  return {
    sourceBytes: fs.readFileSync(
      path.join(FIXTURE_DIR, 'semantic_guitar_compatible.musicxml'),
    ),
    snapshot: JSON.parse(fs.readFileSync(
      path.join(FIXTURE_DIR, 'semantic_guitar_compatible.expected.json'),
      'utf8',
    )),
    provenance: JSON.parse(fs.readFileSync(
      path.join(FIXTURE_DIR, 'semantic_guitar_compatible.provenance.json'),
      'utf8',
    )),
  };
}

function uploadFor(sourceBytes) {
  return Object.freeze({
    fileName: 'semantic-guitar-compatible.musicxml',
    bytes: Buffer.from(sourceBytes),
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('SEM-06E admits the independently qualified cross-engine reference bundle', () => {
  const result = admitSemanticReferenceBundle(loadQualifiedBundle());

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.tabGenerationBlocking, false);
});

test('SEM-06E keeps the semantic upload sidecar internal', () => {
  const api = loadSidecarApi();
  const packageRoot = require('../src');

  assert.equal(typeof api.processMusicXmlUploadWithSemanticValidation, 'function');
  assert.equal(packageRoot.processMusicXmlUploadWithSemanticValidation, undefined);
});

test('SEM-06E PASS evidence leaves the real editable-TAB result unchanged', () => {
  const { processMusicXmlUploadWithSemanticValidation } = loadSidecarApi();
  const bundle = loadQualifiedBundle();
  const upload = uploadFor(bundle.sourceBytes);
  const baseline = processMusicXmlUpload(upload);

  assert.notEqual(baseline.status, 'BLOCKED');
  assert.equal(baseline.capabilities.generateTab, true);

  const qualified = processMusicXmlUploadWithSemanticValidation({
    upload,
    referenceBundle: bundle,
  });

  assert.deepEqual(qualified.uploadResult, baseline);
  assert.equal(qualified.semanticValidation.status, 'PASS');
  assert.equal(qualified.semanticValidation.tabGenerationBlocking, false);
  assert.equal(qualified.semanticValidation.selectorEligible, false);
  assert.ok(Object.isFrozen(qualified));
});

test('SEM-06E DIAGNOSTIC evidence leaves string/fret output and editable result unchanged', () => {
  const { processMusicXmlUploadWithSemanticValidation } = loadSidecarApi();
  const bundle = loadQualifiedBundle();
  bundle.snapshot = cloneJson(bundle.snapshot);
  bundle.snapshot.notes.find((note) => note.source_id === 'n1').pitch_midi = 61;
  const upload = uploadFor(bundle.sourceBytes);
  const baseline = processMusicXmlUpload(upload);

  const qualified = processMusicXmlUploadWithSemanticValidation({
    upload,
    referenceBundle: bundle,
  });

  assert.deepEqual(qualified.uploadResult, baseline);
  assert.equal(qualified.semanticValidation.status, 'DIAGNOSTIC');
  assert.deepEqual(
    qualified.semanticValidation.diagnostics.map((diagnostic) => diagnostic.code),
    ['PITCH_MISMATCH'],
  );
  assert.equal(qualified.semanticValidation.tabGenerationBlocking, false);
});

test('SEM-06E UNSUPPORTED evidence leaves the real editable-TAB result unchanged', () => {
  const { processMusicXmlUploadWithSemanticValidation } = loadSidecarApi();
  const bundle = loadQualifiedBundle();
  bundle.provenance = {
    ...bundle.provenance,
    semanticEngineCommit: '0000000000000000000000000000000000000000',
  };
  const upload = uploadFor(bundle.sourceBytes);
  const baseline = processMusicXmlUpload(upload);

  const qualified = processMusicXmlUploadWithSemanticValidation({
    upload,
    referenceBundle: bundle,
  });

  assert.deepEqual(qualified.uploadResult, baseline);
  assert.equal(qualified.semanticValidation.status, 'UNSUPPORTED');
  assert.equal(qualified.semanticValidation.tabGenerationBlocking, false);
});

test('SEM-06E missing semantic evidence preserves baseline upload behavior', () => {
  const { processMusicXmlUploadWithSemanticValidation } = loadSidecarApi();
  const bundle = loadQualifiedBundle();
  const upload = uploadFor(bundle.sourceBytes);
  const baseline = processMusicXmlUpload(upload);

  const qualified = processMusicXmlUploadWithSemanticValidation({ upload });

  assert.deepEqual(qualified.uploadResult, baseline);
  assert.equal(qualified.semanticValidation, null);
});

test('SEM-06E binds semantic evidence to the exact uploaded source bytes', () => {
  const { processMusicXmlUploadWithSemanticValidation } = loadSidecarApi();
  const bundle = loadQualifiedBundle();
  const upload = uploadFor(Buffer.concat([bundle.sourceBytes, Buffer.from('\n')]));
  const baseline = processMusicXmlUpload(upload);

  const qualified = processMusicXmlUploadWithSemanticValidation({
    upload,
    referenceBundle: bundle,
  });

  assert.deepEqual(qualified.uploadResult, baseline);
  assert.equal(qualified.semanticValidation.status, 'UNSUPPORTED');
  assert.deepEqual(qualified.semanticValidation.diagnostics, [{
    code: 'UPLOAD_SOURCE_MISMATCH',
  }]);
  assert.equal(qualified.semanticValidation.tabGenerationBlocking, false);
});

test('SEM-06E cannot override an existing Guitar upload block', () => {
  const { processMusicXmlUploadWithSemanticValidation } = loadSidecarApi();
  const bundle = loadQualifiedBundle();
  const blockedUpload = Object.freeze({
    fileName: 'unsafe.musicxml',
    bytes: Buffer.from(
      '<!DOCTYPE score-partwise SYSTEM "https://example.invalid/evil.dtd">'
      + '<score-partwise version="3.1"/>',
      'utf8',
    ),
  });
  const baseline = processMusicXmlUpload(blockedUpload);

  const qualified = processMusicXmlUploadWithSemanticValidation({
    upload: blockedUpload,
    referenceBundle: bundle,
  });

  assert.deepEqual(qualified.uploadResult, baseline);
  assert.equal(qualified.uploadResult.status, 'BLOCKED');
  assert.equal(qualified.semanticValidation, null);
});
