'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = require('../verification/stage09-real-corpus-product-gate-manifest.json');
const historicalTierA = require('../verification/guitar-tech-real-corpus-manifest.json');
const additionalAudit = require('../verification/stage09-additional-real-corpus-reviewed-audit.json');
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

test('Stage 09 manifest encodes the 20-50 real-corpus target and all three Stage 08 outcomes', () => {
  assert.equal(validateGateManifest(manifest), manifest);
  assert.equal(manifest.thresholds.minimumUniqueRealMusicXmlCases, 20);
  assert.equal(manifest.thresholds.maximumTargetRealMusicXmlCases, 50);
  assert.deepEqual(manifest.thresholds.requiredStage08Statuses, ['PASS', 'REVIEW_REQUIRED', 'BLOCKED']);
  assert.deepEqual(manifest.tierA.evidenceSets.map((set) => set.expectedUniqueCases), [9, 11]);
});

test('current repository evidence reaches the verified Tier A minimum but remains HOLD for authentic teacher correction evidence', () => {
  const report = evaluateStage09ProductGate();
  assert.equal(report.status, PRODUCT_GATE_STATUS.HOLD);
  assert.equal(report.stage09Complete, false);
  assert.equal(report.summary.uniqueRealMusicXmlCases, 20);
  assert.equal(report.summary.verifiedRealMusicXmlCases, 20);
  assert.deepEqual(report.summary.tierAEvidenceSets, [
    { name: 'historical-real-musicxml', declared: 9, verified: 9 },
    { name: 'stage09-additional-real-musicxml', declared: 11, verified: 11 },
  ]);
  assert.equal(report.summary.realTeacherCorrectionCases, 0);
  assert.ok(!report.gaps.some((gap) => gap.startsWith('REAL_MUSICXML_CASES_')));
  assert.ok(!report.gaps.some((gap) => gap.startsWith('VERIFIED_REAL_MUSICXML_CASES_')));
  assert.ok(report.gaps.includes('REAL_TEACHER_CORRECTION_CASES_0_OF_3'));
  assert.ok(report.gaps.includes('MISSING_STAGE08_STATUS_PASS'));
  assert.ok(report.gaps.includes('MISSING_STAGE08_STATUS_REVIEW_REQUIRED'));
  assert.ok(report.gaps.includes('MISSING_STAGE08_STATUS_BLOCKED'));
});

test('the additional reviewed audit is bound to the exact production-equivalent tree and has no poly-to-mono downgrade', () => {
  assert.equal(additionalAudit.status, 'PASS_VERIFIED');
  assert.equal(additionalAudit.workflowEvidence.workflowRunId, 33920454602);
  assert.equal(additionalAudit.workflowEvidence.productionMergeSha, '1303c4ad1ad5dcd856dab1d7de0ace97ed8da43e');
  assert.equal(additionalAudit.workflowEvidence.productionTreeEquivalent, true);
  assert.equal(additionalAudit.workflowEvidence.auditedTreeSha, additionalAudit.workflowEvidence.productionTreeSha);
  assert.equal(additionalAudit.summary.requiredFiles, 11);
  assert.equal(additionalAudit.summary.identityVerifiedFiles, 11);
  assert.equal(additionalAudit.summary.deterministicFiles, 11);
  assert.equal(additionalAudit.summary.sourceImmutableFiles, 11);
  assert.equal(additionalAudit.summary.polyRequiredFiles, 11);
  assert.equal(additionalAudit.summary.polyToMonoDowngrades, 0);
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

test('product gate can pass only after authentic correction status and representation coverage is added to the already verified Tier A minimum', () => {
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
  const report = evaluateStage09ProductGate({ correctionCorpus });
  assert.equal(report.status, PRODUCT_GATE_STATUS.PASS);
  assert.equal(report.stage09Complete, true);
  assert.equal(report.summary.uniqueRealMusicXmlCases, 20);
  assert.equal(report.summary.verifiedRealMusicXmlCases, 20);
  assert.equal(report.summary.realTeacherCorrectionCases, 3);
  assert.deepEqual(report.gaps, []);
});

test('Tier A overlap cannot inflate the unique real-corpus count', () => {
  const forged = clone(additionalAudit);
  forged.records[0].sha256 = historicalTierA.files[0].sha256;
  const report = evaluateStage09ProductGate({ additionalReviewedAudit: forged });
  assert.equal(report.status, PRODUCT_GATE_STATUS.FAIL);
  assert.equal(report.stage09Complete, false);
  assert.deepEqual(report.gaps, ['INVALID_EVIDENCE']);
  assert.match(report.error, /overlap/);
});

test('incomplete or non-equivalent additional audit fails closed instead of becoming a countable evidence gap', () => {
  const forged = clone(additionalAudit);
  forged.workflowEvidence.productionTreeEquivalent = false;
  const report = evaluateStage09ProductGate({ additionalReviewedAudit: forged });
  assert.equal(report.status, PRODUCT_GATE_STATUS.FAIL);
  assert.equal(report.stage09Complete, false);
  assert.deepEqual(report.gaps, ['INVALID_EVIDENCE']);
});
