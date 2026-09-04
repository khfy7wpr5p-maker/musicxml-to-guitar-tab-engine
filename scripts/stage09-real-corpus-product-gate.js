'use strict';

const gateManifest = require('../verification/stage09-real-corpus-product-gate-manifest.json');
const tierAManifest = require('../verification/guitar-tech-real-corpus-manifest.json');
const tierAAudit = require('../verification/prod-tech-03-real-corpus-audit-00e62f0.json');
const tierBCorpus = require('../verification/stage09-real-teacher-correction-corpus.json');

const PRODUCT_GATE_STATUS = Object.freeze({
  PASS: 'PASS_PRODUCT_GATE',
  HOLD: 'HOLD_EVIDENCE_GAP',
  FAIL: 'FAIL_INVALID_EVIDENCE',
});

const REAL_TIER_A = 'REAL_EXTERNAL_PINNED_MUSICXML';
const REAL_TIER_B = 'REAL_TEACHER_CORRECTION';
const STAGE08_STATUSES = new Set(['PASS', 'REVIEW_REQUIRED', 'BLOCKED']);
const SHA256 = /^[a-f0-9]{64}$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function uniqueStrings(values) {
  return [...new Set(values)].sort();
}

function validateGateManifest(manifest) {
  if (
    !isPlainObject(manifest)
    || manifest.documentType !== 'Stage09RealCorpusProductGateManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.stage !== 'STAGE_09_REAL_CORPUS_PRODUCT_GATE'
    || manifest.requiredRunCount !== 2
    || !Array.isArray(manifest.entrypoints)
    || !manifest.entrypoints.includes('processMusicXmlUpload()')
    || !manifest.entrypoints.includes('continueStage08ProductionToCanonicalTab()')
    || !isPlainObject(manifest.thresholds)
  ) throw new Error('Invalid Stage09RealCorpusProductGateManifest.');

  const thresholds = manifest.thresholds;
  if (
    !Number.isSafeInteger(thresholds.minimumUniqueRealMusicXmlCases)
    || thresholds.minimumUniqueRealMusicXmlCases < 20
    || !Number.isSafeInteger(thresholds.maximumTargetRealMusicXmlCases)
    || thresholds.maximumTargetRealMusicXmlCases < thresholds.minimumUniqueRealMusicXmlCases
    || thresholds.maximumTargetRealMusicXmlCases > 50
    || !Number.isSafeInteger(thresholds.minimumRealTeacherCorrectionCases)
    || thresholds.minimumRealTeacherCorrectionCases < 3
    || !Array.isArray(thresholds.requiredStage08Statuses)
    || !Array.isArray(thresholds.requiredRepresentationTags)
  ) throw new Error('Invalid Stage 09 product thresholds.');

  for (const status of ['PASS', 'REVIEW_REQUIRED', 'BLOCKED']) {
    if (!thresholds.requiredStage08Statuses.includes(status)) {
      throw new Error(`Stage 09 must require ${status} correction-path evidence.`);
    }
  }
  return manifest;
}

function validateTierAManifest(manifest) {
  if (
    !isPlainObject(manifest)
    || manifest.documentType !== 'GuitarTechniqueRealCorpusManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.requiredRunCount !== 2
    || !Array.isArray(manifest.files)
  ) throw new Error('Invalid Tier A real MusicXML manifest.');

  const identities = new Map();
  for (const entry of manifest.files) {
    if (!isPlainObject(entry) || typeof entry.fileName !== 'string' || !SHA256.test(entry.sha256 || '')) {
      throw new Error('Tier A contains an invalid source identity.');
    }
    const previous = identities.get(entry.sha256);
    if (previous && previous !== entry.fileName) throw new Error('Tier A contains a duplicate SHA identity.');
    identities.set(entry.sha256, entry.fileName);
  }
  return identities;
}

function verifiedTierAIdentities(sourceIdentities, audit) {
  if (
    !isPlainObject(audit)
    || audit.documentType !== 'ProdTech03RealCorpusAudit'
    || audit.contractVersion !== '1.0.0'
    || audit.requiredRunCount !== 2
    || !Array.isArray(audit.records)
  ) throw new Error('Invalid Tier A reviewed audit.');

  const verified = new Set();
  for (const record of audit.records) {
    if (!isPlainObject(record) || !SHA256.test(record.sha256 || '')) continue;
    if (
      sourceIdentities.get(record.sha256) === record.fileName
      && record.identityVerified === true
      && record.deterministic === true
      && record.sourceByteImmutable === true
    ) verified.add(record.sha256);
  }
  return verified;
}

function validateCorrectionCorpus(corpus) {
  if (
    !isPlainObject(corpus)
    || corpus.documentType !== 'Stage09RealTeacherCorrectionCorpus'
    || corpus.contractVersion !== '1.0.0'
    || corpus.evidenceClass !== REAL_TIER_B
    || corpus.requiredRunCount !== 2
    || !Array.isArray(corpus.cases)
  ) throw new Error('Invalid Stage 09 teacher-correction corpus.');
  return corpus;
}

function authenticCorrectionCase(entry) {
  if (!isPlainObject(entry) || entry.evidenceClass !== REAL_TIER_B) return false;
  if (
    typeof entry.caseId !== 'string'
    || typeof entry.sourceId !== 'string'
    || !SHA256.test(entry.originalSha256 || '')
    || !SHA256.test(entry.correctedSha256 || '')
    || entry.originalSha256 === entry.correctedSha256
    || typeof entry.savedRevisionId !== 'string'
    || typeof entry.revalidatedRevisionId !== 'string'
    || entry.validationState !== 'VALID'
    || !Array.isArray(entry.patchIds)
    || entry.patchIds.length === 0
    || !Array.isArray(entry.coverageTags)
    || !isPlainObject(entry.stage08Audit)
  ) return false;

  const audit = entry.stage08Audit;
  if (
    audit.identityVerified !== true
    || audit.deterministic !== true
    || audit.sourceByteImmutable !== true
    || !STAGE08_STATUSES.has(audit.status)
  ) return false;

  if (audit.status === 'PASS') {
    return (
      (audit.route === 'POLY_V2' || audit.route === 'MONO_V1')
      && audit.approvedCanonicalEvidenceVerified === true
      && SHA256.test(audit.writerOutputSha256 || '')
    );
  }

  return (
    audit.approvedCanonicalEvidenceVerified === false
    && (audit.writerOutputSha256 === null || audit.writerOutputSha256 === undefined)
  );
}

function evaluateStage09ProductGate({
  manifest = gateManifest,
  realMusicXmlManifest = tierAManifest,
  reviewedAudit = tierAAudit,
  correctionCorpus = tierBCorpus,
} = {}) {
  try {
    validateGateManifest(manifest);
    if (manifest.tierA?.evidenceClass !== REAL_TIER_A || manifest.tierB?.evidenceClass !== REAL_TIER_B) {
      throw new Error('Stage 09 evidence classes are not authentic-production classes.');
    }
    const tierAIdentities = validateTierAManifest(realMusicXmlManifest);
    const tierAVerified = verifiedTierAIdentities(tierAIdentities, reviewedAudit);
    validateCorrectionCorpus(correctionCorpus);

    const authenticCorrections = correctionCorpus.cases.filter(authenticCorrectionCase);
    const correctionIds = authenticCorrections.map((entry) => entry.caseId);
    if (new Set(correctionIds).size !== correctionIds.length) throw new Error('Duplicate teacher-correction caseId.');

    const observedStatuses = uniqueStrings(authenticCorrections.map((entry) => entry.stage08Audit.status));
    const coverageTags = uniqueStrings(authenticCorrections.flatMap((entry) => entry.coverageTags));
    const gaps = [];
    const t = manifest.thresholds;

    if (tierAIdentities.size < t.minimumUniqueRealMusicXmlCases) {
      gaps.push(`REAL_MUSICXML_CASES_${tierAIdentities.size}_OF_${t.minimumUniqueRealMusicXmlCases}`);
    }
    if (tierAVerified.size < tierAIdentities.size) {
      gaps.push(`VERIFIED_REAL_MUSICXML_CASES_${tierAVerified.size}_OF_${tierAIdentities.size}`);
    }
    if (authenticCorrections.length < t.minimumRealTeacherCorrectionCases) {
      gaps.push(`REAL_TEACHER_CORRECTION_CASES_${authenticCorrections.length}_OF_${t.minimumRealTeacherCorrectionCases}`);
    }
    for (const status of t.requiredStage08Statuses) {
      if (!observedStatuses.includes(status)) gaps.push(`MISSING_STAGE08_STATUS_${status}`);
    }
    for (const tag of t.requiredRepresentationTags) {
      if (!coverageTags.includes(tag)) gaps.push(`MISSING_REPRESENTATION_${tag}`);
    }

    return Object.freeze({
      documentType: 'Stage09RealCorpusProductGateReport',
      contractVersion: '1.0.0',
      status: gaps.length === 0 ? PRODUCT_GATE_STATUS.PASS : PRODUCT_GATE_STATUS.HOLD,
      stage09Complete: gaps.length === 0,
      summary: Object.freeze({
        uniqueRealMusicXmlCases: tierAIdentities.size,
        verifiedRealMusicXmlCases: tierAVerified.size,
        realTeacherCorrectionCases: authenticCorrections.length,
        observedStage08Statuses: observedStatuses,
        representationTags: coverageTags,
      }),
      gaps: Object.freeze(gaps),
      invariants: Object.freeze([
        'synthetic-fixtures-do-not-count-as-real-corpus',
        'reviewed-audit-reuses-do-not-increase-unique-case-count',
        'source-bytes-remain-immutable',
        'polyphonic-corrected-scores-must-not-downgrade-to-mono',
        'stage05-valid-alone-is-not-approval',
        'ui-events-have-no-canonical-authority',
        'solver-ranking-cost-tie-break-and-resource-ceilings-remain-unchanged',
      ]),
    });
  } catch (error) {
    return Object.freeze({
      documentType: 'Stage09RealCorpusProductGateReport',
      contractVersion: '1.0.0',
      status: PRODUCT_GATE_STATUS.FAIL,
      stage09Complete: false,
      summary: null,
      gaps: Object.freeze(['INVALID_EVIDENCE']),
      error: error.message,
    });
  }
}

if (require.main === module) {
  const report = evaluateStage09ProductGate();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === PRODUCT_GATE_STATUS.PASS ? 0 : 1;
}

module.exports = {
  PRODUCT_GATE_STATUS,
  authenticCorrectionCase,
  evaluateStage09ProductGate,
  validateCorrectionCorpus,
  validateGateManifest,
  validateTierAManifest,
  verifiedTierAIdentities,
};
