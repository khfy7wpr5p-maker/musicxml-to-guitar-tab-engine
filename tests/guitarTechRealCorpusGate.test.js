'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = require('../verification/guitar-tech-real-corpus-manifest.json');
const state = require('../verification/guitar-tech-real-corpus-state.json');
const {
  runGate,
  sha256,
  validateManifest,
} = require('../scripts/guitar-tech-real-corpus-gate');
const {
  runtimeTreeEquivalent,
  validateStageGate,
  validateStageGateFromRepository,
} = require('../scripts/check-guitar-tech-stage-gate');

function blockedResult(extra = {}) {
  return {
    status: 'BLOCKED',
    route: 'POLY_V2',
    preflight: {
      issues: [{
        severity: 'error',
        category: 'capability',
        code: 'TEST_BLOCKER',
        details: { feature: 'test-feature' },
      }],
    },
    canonicalTabResult: null,
    ...extra,
  };
}

function syntheticCorpus() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guitar-tech-corpus-'));
  const files = [];
  for (let index = 0; index < 9; index += 1) {
    const fileName = `fixture-${index}.xml`;
    const bytes = Buffer.from(`<score-partwise id="${index}"/>`);
    fs.writeFileSync(path.join(directory, fileName), bytes);
    files.push({
      fileName,
      sha256: sha256(bytes),
      baseline: {
        status: 'BLOCKED',
        route: 'POLY_V2',
        code: 'TEST_BLOCKER',
        feature: 'test-feature',
        classification: 'LEGITIMATE_BLOCKED',
      },
    });
  }
  return {
    directory,
    manifest: {
      documentType: 'GuitarTechniqueRealCorpusManifest',
      contractVersion: '1.0.0',
      producer: 'synthetic-test-only',
      entrypoint: 'processMusicXmlUpload()',
      sourceFilesCommitted: false,
      requiredRunCount: 2,
      files,
    },
  };
}

test('production manifest pins exactly nine unique Guitar Pro source identities', () => {
  assert.equal(validateManifest(manifest), manifest);
  assert.equal(manifest.files.length, 9);
  assert.equal(new Set(manifest.files.map((entry) => entry.fileName)).size, 9);
  assert.equal(new Set(manifest.files.map((entry) => entry.sha256)).size, 9);
});

test('real corpus runner fails closed when corpus directory is unavailable', () => {
  const report = runGate({ corpusDirectory: '/definitely/not/a/real/corpus/path' });
  assert.equal(report.status, 'HOLD_MISSING_CORPUS');
  assert.equal(report.summary.requiredFiles, 9);
});

test('real corpus runner requires exact identities, two deterministic runs and immutable source bytes', () => {
  const corpus = syntheticCorpus();
  try {
    const report = runGate({
      corpusDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blockedResult(),
      engineCommit: 'a'.repeat(40),
    });
    assert.equal(report.status, 'PASS_NO_UNREVIEWED_DRIFT');
    assert.equal(report.summary.identityVerifiedFiles, 9);
    assert.equal(report.summary.deterministicFiles, 9);
    assert.equal(report.summary.sourceImmutableFiles, 9);
    assert.equal(report.summary.baselineChanges, 0);
    assert.equal(report.summary.projectorReached, 'NOT_OBSERVABLE_WITH_PUBLIC_ENTRYPOINT');
    assert.equal(report.summary.solverReached, 'NOT_OBSERVABLE_WITH_PUBLIC_ENTRYPOINT');
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('identity mismatch, nondeterminism, byte mutation and blocker drift cannot produce PASS', () => {
  const corpus = syntheticCorpus();
  try {
    const first = corpus.manifest.files[0];
    fs.writeFileSync(path.join(corpus.directory, first.fileName), '<score-partwise changed="yes"/>');
    const identity = runGate({ corpusDirectory: corpus.directory, manifest: corpus.manifest, processUpload: () => blockedResult() });
    assert.equal(identity.status, 'FAIL_CORPUS_IDENTITY');

    fs.writeFileSync(path.join(corpus.directory, first.fileName), Buffer.from(`<score-partwise id="0"/>`));
    let calls = 0;
    const nondeterministic = runGate({
      corpusDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blockedResult({ nonce: calls++ }),
    });
    assert.equal(nondeterministic.status, 'FAIL_NONDETERMINISTIC');

    const mutated = runGate({
      corpusDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: ({ bytes }) => {
        bytes[0] ^= 1;
        return blockedResult();
      },
    });
    assert.equal(mutated.status, 'FAIL_SOURCE_BYTE_MUTATION');

    const drift = runGate({
      corpusDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => ({ status: 'PASS', route: 'POLY_V2', preflight: { issues: [] }, canonicalTabResult: { contractVersion: 'test' } }),
    });
    assert.equal(drift.status, 'HOLD_BLOCKER_DIFF_REVIEW_REQUIRED');
    assert.equal(drift.summary.baselineChanges, 9);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('current state deliberately blocks PROD-TECH-03 until a fresh reviewed corpus PASS exists', () => {
  const verdict = validateStageGate(state, { targetStage: 'PROD-TECH-03' });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.includes('REAL_CORPUS_GATE_NOT_PASS'));
  assert.ok(verdict.reasons.includes('PROD_TECH_03_MERGE_NOT_ALLOWED'));
});

test('stage gate permits verification-only descendants but rejects unproven runtime drift', () => {
  const passState = {
    ...state,
    status: 'PASS',
    prodTech03MergeAllowed: true,
    auditedMainSha: 'a'.repeat(40),
    auditReportSha256: 'b'.repeat(64),
    corpusIdentityVerified: true,
    twoRunDeterminismVerified: true,
    sourceByteImmutabilityVerified: true,
    blockerDiffReviewed: true,
  };
  assert.equal(validateStageGate(passState, {
    expectedBaseSha: 'c'.repeat(40),
    auditedRuntimeEquivalent: true,
  }).ok, true);
  const stale = validateStageGate(passState, {
    expectedBaseSha: 'c'.repeat(40),
    auditedRuntimeEquivalent: false,
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.reasons.includes('AUDITED_MAIN_RUNTIME_STALE'));
});

test('runtime-equivalence check fails closed for unknown git identities', () => {
  assert.equal(runtimeTreeEquivalent({
    auditedMainSha: '0'.repeat(40),
    expectedBaseSha: '1'.repeat(40),
  }), false);
});

test('required CI on a PROD-TECH-03 stage branch enforces the committed real-corpus gate state', () => {
  const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
  if (!/(?:^|\/)prod-tech-03(?:-|$)/i.test(branch)) return;
  const expectedBaseSha = process.env.GUITAR_TECH_EXPECTED_BASE_SHA || null;
  const verdict = validateStageGateFromRepository(state, { targetStage: 'PROD-TECH-03', expectedBaseSha });
  assert.equal(verdict.ok, true, `PROD-TECH-03 is blocked by real-corpus gate: ${verdict.reasons.join(', ')}`);
});
