'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = require('../verification/stage09-real-corpus-product-gate-manifest.json');
const tierA = require('../verification/guitar-tech-real-corpus-manifest.json');
const tierAAudit = require('../verification/prod-tech-03-real-corpus-audit-00e62f0.json');
const tierB = require('../verification/stage09-real-teacher-correction-corpus.json');
const {
  PRODUCT_GATE_STATUS,
  authenticCorrectionCase,
  evaluateStage09ProductGate,
  validateGateManifest,
} = require('../scripts/stage09-real-corpus-product-gate');

function hex(index) {
  return index.toString(16).padStart(64, '0').slice(-64);
}

function correctionCase({
  id = 'real-correction-1',
  status = 'PASS',
  tags = [],
  evidenceClass = 'REAL_TEACHER_CORRECTION',
} = {}) {
  return {
    caseId: id,
    evidenceClass,
    sourceId: `source-${id}`,
    originalSha256: hex(1000 + id.length),
    correctedSha256: hex(2000 + id.length),
    savedRevisionId: `saved-${id}`,
    revalidatedRevisionId: `revalidated-${id}`,
    validationState: 'VALID',
    patchIds: [`patch-${id}`],
    coverageTags: tags,
    stage08Audit: {
      identityVerified: true,
      deterministic: true,
      sourceByteImmutable: true,
      status,
      route: status === 'PASS' ? 'POLY_V2' : null,
      approvedCanonicalEvidenceVerified: status === 'PASS',
      writerOutputSha256: status === 'PASS' ? hex(3000 + id.length) : null,
    },
  };
}

function completeTierA(count = 20) {
  const files = [];
  const records = [];
  for (let index = 1; index <= count; index += 1) {
    const sha256 = hex(index);
    const fileName = `real-${index}.musicxml`;
    files.push({ fileName, sha256 });
    records.push({
      fileName,
      sha256,
      identityVerified: true,
      deterministic: true,
      sourceByteImmutable: true,
    });
  }
  return {
    source: {
      documentType: 'GuitarTechniqueRealCorpusManifest',
      contractVersion: '1.0.0',
      requiredRunCount: 2,
      files,
    },
    audit: {
      documentType: 'ProdTech03RealCorpusAudit',
      contractVersion: '1.0.0',
      requiredRunCount: 2,
      records,
    },
  };
}

test('Stage 09 manifest encodes the 20-50 real-corpus target and all three Stage 08 outcomes', () => {
  assert.equal(validateGateManifest(manifest), manifest);
  assert.equal(manifest.thresholds.minimumUniqueRealMusicXmlCases, 20);
  assert.equal(manifest.thresholds.maximumTargetRealMusicXmlCases, 50);
  assert.deepEqual(manifest.thresholds.requiredStage08Statuses, ['PASS', 'REVIEW_REQUIRED', 'BLOCKED']);
});

test('current repository evidence remains HOLD instead of treating repeated audits or synthetic fixtures as real cases', () => {
  const report = evaluateStage09ProductGate();
  assert.equal(report.status, PRODUCT_GATE_STATUS.HOLD);
  assert.equal(report.stage09Complete, false);
  assert.equal(report.summary.uniqueRealMusicXmlCases, 9);
  assert.equal(report.summary.verifiedRealMusicXmlCases, 9);
  assert.equal(report.summary.realTeacherCorrectionCases, 0);
  assert.ok(report.gaps.includes('REAL_MUSICXML_CASES_9_OF_20'));
  assert.ok(report.gaps.includes('REAL_TEACHER_CORRECTION_CASES_0_OF_3'));
  assert.ok(report.gaps.includes('MISSING_STAGE08_STATUS_PASS'));
  assert.ok(report.gaps.includes('MISSING_STAGE08_STATUS_REVIEW_REQUIRED'));
  assert.ok(report.gaps.includes('MISSING_STAGE08_STATUS_BLOCKED'));
});

test('synthetic Stage 08 fixture metadata cannot satisfy authentic correction evidence', () => {
  const synthetic = correctionCase({ evidenceClass: 'SYNTHETIC_TEST_ONLY' });
  assert.equal(authenticCorrectionCase(synthetic), false);

  const report = evaluateStage09ProductGate({
    correctionCorpus: {
      ...tierB,
      cases: [synthetic],
    },
  });
  assert.equal(report.status, PRODUCT_GATE_STATUS.HOLD);
  assert.equal(report.summary.realTeacherCorrectionCases, 0);
});

test('PASS correction evidence requires Stage 08 approval authority and writer fingerprint', () => {
  const invalid = correctionCase();
  invalid.stage08Audit.approvedCanonicalEvidenceVerified = false;
  assert.equal(authenticCorrectionCase(invalid), false);

  const missingWriter = correctionCase();
  missingWriter.stage08Audit.writerOutputSha256 = null;
  assert.equal(authenticCorrectionCase(missingWriter), false);
});

test('non-PASS correction evidence must not carry canonical approval or writer output', () => {
  const review = correctionCase({ status: 'REVIEW_REQUIRED' });
  assert.equal(authenticCorrectionCase(review), true);

  const unsafe = correctionCase({ status: 'BLOCKED' });
  unsafe.stage08Audit.approvedCanonicalEvidenceVerified = true;
  unsafe.stage08Audit.writerOutputSha256 = hex(9999);
  assert.equal(authenticCorrectionCase(unsafe), false);
});

test('product gate can pass only with minimum unique real identities, authentic correction status coverage and representation coverage', () => {
  const real = completeTierA(20);
  const tags = manifest.thresholds.requiredRepresentationTags;
  const correctionCorpus = {
    ...tierB,
    cases: [
      correctionCase({ id: 'pass', status: 'PASS', tags: tags.slice(0, 3) }),
      correctionCase({ id: 'review', status: 'REVIEW_REQUIRED', tags: tags.slice(3, 5) }),
      correctionCase({ id: 'blocked', status: 'BLOCKED', tags: tags.slice(5) }),
    ],
    evidenceGap: null,
  };
  const report = evaluateStage09ProductGate({
    realMusicXmlManifest: real.source,
    reviewedAudit: real.audit,
    correctionCorpus,
  });
  assert.equal(report.status, PRODUCT_GATE_STATUS.PASS);
  assert.equal(report.stage09Complete, true);
  assert.equal(report.summary.uniqueRealMusicXmlCases, 20);
  assert.equal(report.summary.realTeacherCorrectionCases, 3);
  assert.deepEqual(report.gaps, []);
});

test('malformed evidence fails closed instead of becoming an evidence gap', () => {
  const report = evaluateStage09ProductGate({
    realMusicXmlManifest: { ...tierA, files: [{ fileName: 'bad.xml', sha256: 'not-a-sha' }] },
    reviewedAudit: tierAAudit,
  });
  assert.equal(report.status, PRODUCT_GATE_STATUS.FAIL);
  assert.equal(report.stage09Complete, false);
  assert.deepEqual(report.gaps, ['INVALID_EVIDENCE']);
});
