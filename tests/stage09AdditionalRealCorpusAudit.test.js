'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  gitBlobSha,
  runAudit,
  validateManifest,
} = require('../scripts/stage09-additional-real-corpus-audit');

function syntheticCorpus({ poly = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-additional-'));
  const files = [];
  for (let index = 0; index < 11; index += 1) {
    const pathName = `fixture-${index}.xml`;
    const body = poly
      ? `<score-partwise><part><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note><backup><duration>1</duration></backup><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice></note></measure></part><!--${index}--></score-partwise>`
      : `<score-partwise><!--${index}--></score-partwise>`;
    const bytes = Buffer.from(body);
    fs.writeFileSync(path.join(directory, pathName), bytes);
    files.push({ path: pathName, gitBlobSha: gitBlobSha(bytes), byteLength: bytes.byteLength });
  }
  return {
    directory,
    manifest: {
      documentType: 'Stage09AdditionalRealMusicXmlCorpusManifest',
      contractVersion: '1.0.0',
      evidenceClass: 'REAL_EXTERNAL_PINNED_MUSICXML',
      sourceRepository: 'synthetic/test-only',
      sourceCommit: 'a'.repeat(40),
      sourceRoot: '.',
      requiredRunCount: 2,
      files,
    },
  };
}

function blocked(route = 'POLY_V2') {
  return {
    status: 'BLOCKED',
    route,
    preflight: {
      issues: [{ severity: 'error', category: 'capability', code: 'TEST_BLOCKER' }],
    },
    canonicalTabResult: null,
    musicXml: null,
  };
}

test('additional real-corpus manifest requires exactly eleven unique pinned blob identities', () => {
  const corpus = syntheticCorpus();
  try {
    assert.equal(validateManifest(corpus.manifest), corpus.manifest);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('additional corpus audit verifies identity, deterministic reruns and source immutability', () => {
  const corpus = syntheticCorpus();
  try {
    const report = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blocked(),
      engineCommit: 'b'.repeat(40),
    });
    assert.equal(report.status, 'PASS_VERIFIED');
    assert.equal(report.summary.requiredFiles, 11);
    assert.equal(report.summary.identityVerifiedFiles, 11);
    assert.equal(report.summary.deterministicFiles, 11);
    assert.equal(report.summary.sourceImmutableFiles, 11);
    assert.equal(report.summary.outputSemanticsValidFiles, 11);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('additional corpus audit detects a true-polyphony to MONO downgrade', () => {
  const corpus = syntheticCorpus({ poly: true });
  try {
    const report = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blocked('MONO_V1'),
    });
    assert.equal(report.status, 'FAIL_AUDIT');
    assert.equal(report.summary.polyRequiredFiles, 11);
    assert.equal(report.summary.polyToMonoDowngrades, 11);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('additional corpus audit detects source mutation and identity drift', () => {
  const corpus = syntheticCorpus();
  try {
    const first = corpus.manifest.files[0];
    fs.writeFileSync(path.join(corpus.directory, first.path), '<score-partwise changed="yes"/>');
    const identity = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blocked(),
    });
    assert.equal(identity.status, 'FAIL_AUDIT');
    assert.equal(identity.summary.identityVerifiedFiles, 10);

    const restored = syntheticCorpus();
    try {
      const mutated = runAudit({
        sourceDirectory: restored.directory,
        manifest: restored.manifest,
        processUpload: ({ bytes }) => {
          bytes[0] ^= 1;
          return blocked();
        },
      });
      assert.equal(mutated.status, 'FAIL_AUDIT');
      assert.equal(mutated.summary.sourceImmutableFiles, 0);
    } finally {
      fs.rmSync(restored.directory, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});
