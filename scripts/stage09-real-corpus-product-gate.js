'use strict';

const gateManifest = require('../verification/stage09-real-corpus-product-gate-manifest.json');
const historicalManifest = require('../verification/guitar-tech-real-corpus-manifest.json');
const historicalAudit = require('../verification/prod-tech-03-real-corpus-audit-00e62f0.json');
const additionalManifest = require('../verification/stage09-additional-real-musicxml-corpus.json');
const additionalAudit = require('../verification/stage09-additional-real-corpus-reviewed-audit.json');
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
const SHA1 = /^[a-f0-9]{40}$/;

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
    || !isPlainObject(manifest.tierA)
    || manifest.tierA.evidenceClass !== REAL_TIER_A
    || !Array.isArray(manifest.tierA.evidenceSets)
    || manifest.tierA.evidenceSets.length < 2
    || !isPlainObject(manifest.tierB)
    || manifest.tierB.evidenceClass !== REAL_TIER_B
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

function validateHistoricalManifest(manifest) {
  if (
    !isPlainObject(manifest)
    || manifest.documentType !== 'GuitarTechniqueRealCorpusManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.requiredRunCount !== 2
    || !Array.isArray(manifest.files)
  ) throw new Error('Invalid historical Tier A real MusicXML manifest.');

  const identities = new Map();
  for (const entry of manifest.files) {
    if (!isPlainObject(entry) || typeof entry.fileName !== 'string' || !SHA256.test(entry.sha256 || '')) {
      throw new Error('Historical Tier A contains an invalid source identity.');
    }
    if (identities.has(entry.sha256)) throw new Error('Historical Tier A contains a duplicate SHA identity.');
    identities.set(entry.sha256, entry.fileName);
  }
  return identities;
}

function verifiedHistoricalIdentities(sourceIdentities, audit) {
  if (
    !isPlainObject(audit)
    || audit.documentType !== 'ProdTech03RealCorpusAudit'
    || audit.contractVersion !== '1.0.0'
    || audit.requiredRunCount !== 2
    || !Array.isArray(audit.records)
  ) throw new Error('Invalid historical Tier A reviewed audit.');

  const verified = new Map();
  for (const record of audit.records) {
    if (!isPlainObject(record) || !SHA256.test(record.sha256 || '')) continue;
    if (
      sourceIdentities.get(record.sha256) === record.fileName
      && record.identityVerified === true
      && record.deterministic === true
      && record.sourceByteImmutable === true
    ) verified.set(record.sha256, record.fileName);
  }
  return verified;
}

function validateAdditionalManifest(manifest) {
  if (
    !isPlainObject(manifest)
    || manifest.documentType !== 'Stage09AdditionalRealMusicXmlCorpusManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.evidenceClass !== REAL_TIER_A
    || manifest.requiredRunCount !== 2
    || typeof manifest.sourceRepository !== 'string'
    || !SHA1.test(manifest.sourceCommit || '')
    || typeof manifest.sourceRoot !== 'string'
    || !Array.isArray(manifest.files)
    || manifest.files.length === 0
  ) throw new Error('Invalid additional Tier A real MusicXML manifest.');

  const paths = new Set();
  const blobs = new Set();
  for (const entry of manifest.files) {
    if (
      !isPlainObject(entry)
      || typeof entry.path !== 'string'
      || !SHA1.test(entry.gitBlobSha || '')
      || !Number.isSafeInteger(entry.byteLength)
      || entry.byteLength <= 0
      || paths.has(entry.path)
      || blobs.has(entry.gitBlobSha)
    ) throw new Error('Additional Tier A contains an invalid or duplicate pinned source identity.');
    paths.add(entry.path);
    blobs.add(entry.gitBlobSha);
  }
  return manifest;
}

function verifiedAdditionalIdentities(manifest, audit) {
  validateAdditionalManifest(manifest);
  if (
    !isPlainObject(audit)
    || audit.documentType !== 'Stage09AdditionalRealMusicXmlReviewedAudit'
    || audit.contractVersion !== '1.0.0'
    || audit.evidenceClass !== REAL_TIER_A
    || audit.sourceRepository !== manifest.sourceRepository
    || audit.sourceCommit !== manifest.sourceCommit
    || audit.requiredRunCount !== manifest.requiredRunCount
    || audit.status !== 'PASS_VERIFIED'
    || !isPlainObject(audit.workflowEvidence)
    || audit.workflowEvidence.productionTreeEquivalent !== true
    || !SHA1.test(audit.workflowEvidence.auditedTreeSha || '')
    || audit.workflowEvidence.auditedTreeSha !== audit.workflowEvidence.productionTreeSha
    || !Array.isArray(audit.records)
    || !isPlainObject(audit.summary)
  ) throw new Error('Invalid additional Tier A reviewed audit.');

  const byPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const verified = new Map();
  for (const record of audit.records) {
    const expected = byPath.get(record?.path);
    if (!expected || !SHA256.test(record.sha256 || '') || verified.has(record.sha256)) continue;
    if (
      record.gitBlobSha === expected.gitBlobSha
      && record.byteLength === expected.byteLength
      && record.identityVerified === true
      && record.deterministic === true
      && record.sourceByteImmutable === true
      && record.noPolyToMonoDowngrade === true
      && record.validOutputSemantics === true
      && record.routeRequirement === 'POLY_V2'
      && record.route !== 'MONO_V1'
    ) verified.set(record.sha256, record.path);
  }

  const expectedCount = manifest.files.length;
  if (
    audit.summary.requiredFiles !== expectedCount
    || audit.summary.identityVerifiedFiles !== expectedCount
    || audit.summary.deterministicFiles !== expectedCount
    || audit.summary.sourceImmutableFiles !== expectedCount
    || audit.summary.polyRequiredFiles !== expectedCount
    || audit.summary.polyToMonoDowngrades !== 0
    || audit.summary.outputSemanticsValidFiles !== expectedCount
    || verified.size !== expectedCount
  ) throw new Error('Additional Tier A audit summary or record coverage is incomplete.');

  return verified;
}

function combineUniqueTierA(...sets) {
  const combined = new Map();
  for (const set of sets) {
    for (const [sha, label] of set) {
      if (combined.has(sha)) throw new Error(`Tier A evidence sets overlap at ${sha}.`);
      combined.set(sha, label);
    }
  }
  return combined;
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
  historicalRealMusicXmlManifest = historicalManifest,
  historicalReviewedAudit = historicalAudit,
  additionalRealMusicXmlManifest = additionalManifest,
  additionalReviewedAudit = additionalAudit,
  correctionCorpus = tierBCorpus,
} = {}) {
  try {
    validateGateManifest(manifest);

    const historicalSources = validateHistoricalManifest(historicalRealMusicXmlManifest);
    const historicalVerified = verifiedHistoricalIdentities(historicalSources, historicalReviewedAudit);
    const additionalVerified = verifiedAdditionalIdentities(additionalRealMusicXmlManifest, additionalReviewedAudit);

    const expectedSets = manifest.tierA.evidenceSets;
    if (
      expectedSets[0]?.expectedUniqueCases !== historicalSources.size
      || expectedSets[1]?.expectedUniqueCases !== additionalRealMusicXmlManifest.files.length
    ) throw new Error('Stage 09 Tier A manifest counts do not match evidence sets.');

    const allVerifiedTierA = combineUniqueTierA(historicalVerified, additionalVerified);
    const allDeclaredTierA = historicalSources.size + additionalRealMusicXmlManifest.files.length;
    validateCorrectionCorpus(correctionCorpus);

    const authenticCorrections = correctionCorpus.cases.filter(authenticCorrectionCase);
    const correctionIds = authenticCorrections.map((entry) => entry.caseId);
    if (new Set(correctionIds).size !== correctionIds.length) throw new Error('Duplicate teacher-correction caseId.');

    const observedStatuses = uniqueStrings(authenticCorrections.map((entry) => entry.stage08Audit.status));
    const coverageTags = uniqueStrings(authenticCorrections.flatMap((entry) => entry.coverageTags));
    const gaps = [];
    const t = manifest.thresholds;

    if (allDeclaredTierA < t.minimumUniqueRealMusicXmlCases) {
      gaps.push(`REAL_MUSICXML_CASES_${allDeclaredTierA}_OF_${t.minimumUniqueRealMusicXmlCases}`);
    }
    if (allVerifiedTierA.size < allDeclaredTierA) {
      gaps.push(`VERIFIED_REAL_MUSICXML_CASES_${allVerifiedTierA.size}_OF_${allDeclaredTierA}`);
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
        uniqueRealMusicXmlCases: allDeclaredTierA,
        verifiedRealMusicXmlCases: allVerifiedTierA.size,
        tierAEvidenceSets: Object.freeze([
          Object.freeze({ name: 'historical-real-musicxml', declared: historicalSources.size, verified: historicalVerified.size }),
          Object.freeze({ name: 'stage09-additional-real-musicxml', declared: additionalRealMusicXmlManifest.files.length, verified: additionalVerified.size }),
        ]),
        realTeacherCorrectionCases: authenticCorrections.length,
        observedStage08Statuses: observedStatuses,
        representationTags: coverageTags,
      }),
      gaps: Object.freeze(gaps),
      invariants: Object.freeze([
        'synthetic-fixtures-do-not-count-as-real-corpus',
        'reviewed-audit-reuses-do-not-increase-unique-case-count',
        'tier-a-evidence-set-overlap-fails-closed',
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
  combineUniqueTierA,
  evaluateStage09ProductGate,
  validateAdditionalManifest,
  validateCorrectionCorpus,
  validateGateManifest,
  validateHistoricalManifest,
  verifiedAdditionalIdentities,
  verifiedHistoricalIdentities,
};
