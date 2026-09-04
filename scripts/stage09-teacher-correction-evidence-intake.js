'use strict';

const inventory = require('../verification/stage09-teacher-correction-evidence-candidates.json');

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertArtifact(value, field, { nullable = false } = {}) {
  if (value === null && nullable) return;
  if (!isPlainObject(value) || typeof value.path !== 'string' || !SHA256.test(value.sha256 || '')) {
    throw new Error(`${field} must contain an exact path and SHA-256 identity.`);
  }
}

function validateCandidate(candidate) {
  if (
    !isPlainObject(candidate)
    || typeof candidate.candidateId !== 'string'
    || typeof candidate.sourceRepository !== 'string'
    || !COMMIT_SHA.test(candidate.sourceCommitSha || '')
    || typeof candidate.teacherVerified !== 'boolean'
    || typeof candidate.realOmr !== 'boolean'
    || typeof candidate.nonEmptyTeacherPatchLedgerAvailable !== 'boolean'
    || typeof candidate.eligibleAsStage09CorrectionCase !== 'boolean'
    || typeof candidate.stage09CorrectionEligibility !== 'string'
    || typeof candidate.reason !== 'string'
  ) throw new Error('Invalid Stage 09 teacher evidence candidate.');

  assertArtifact(candidate.sourcePdf, `${candidate.candidateId}.sourcePdf`);
  assertArtifact(candidate.expectedMusicXml, `${candidate.candidateId}.expectedMusicXml`);
  assertArtifact(candidate.omrArtifact, `${candidate.candidateId}.omrArtifact`, { nullable: true });

  if (candidate.crossCheckCommitSha !== undefined && !COMMIT_SHA.test(candidate.crossCheckCommitSha || '')) {
    throw new Error(`${candidate.candidateId}.crossCheckCommitSha is invalid.`);
  }

  if (candidate.eligibleAsStage09CorrectionCase) {
    if (
      candidate.teacherVerified !== true
      || candidate.realOmr !== true
      || candidate.nonEmptyTeacherPatchLedgerAvailable !== true
      || !Number.isSafeInteger(candidate.observedCorrectionNeededCount)
      || candidate.observedCorrectionNeededCount <= 0
      || candidate.omrArtifact === null
    ) throw new Error('Stage 09 correction eligibility cannot be granted without authentic teacher correction evidence.');
  }

  if (candidate.stage09CorrectionEligibility === 'INELIGIBLE_NO_CORRECTION_NEEDED') {
    if (candidate.observedCorrectionNeededCount !== 0 || candidate.nonEmptyTeacherPatchLedgerAvailable !== false) {
      throw new Error('No-correction candidate contradicts its declared evidence.');
    }
  }

  if (candidate.stage09CorrectionEligibility === 'INELIGIBLE_NO_APPROVED_OMR_CORRECTION_CHAIN') {
    if (candidate.realOmr !== false || candidate.omrArtifact !== null || candidate.nonEmptyTeacherPatchLedgerAvailable !== false) {
      throw new Error('Incomplete OMR correction-chain candidate contradicts its declared evidence.');
    }
  }

  return candidate;
}

function validateEvidenceCandidateInventory(value) {
  if (
    !isPlainObject(value)
    || value.documentType !== 'Stage09TeacherCorrectionEvidenceCandidateInventory'
    || value.contractVersion !== '1.0.0'
    || !Array.isArray(value.candidates)
    || !Array.isArray(value.excludedEvidenceGroups)
    || !isPlainObject(value.summary)
  ) throw new Error('Invalid Stage09TeacherCorrectionEvidenceCandidateInventory.');

  const ids = new Set();
  for (const candidate of value.candidates) {
    validateCandidate(candidate);
    if (ids.has(candidate.candidateId)) throw new Error('Duplicate Stage 09 teacher evidence candidateId.');
    ids.add(candidate.candidateId);
  }

  for (const group of value.excludedEvidenceGroups) {
    if (
      !isPlainObject(group)
      || typeof group.sourceRepository !== 'string'
      || !COMMIT_SHA.test(group.sourceCommitSha || '')
      || !Array.isArray(group.paths)
      || group.paths.length === 0
      || typeof group.eligibility !== 'string'
      || typeof group.reason !== 'string'
    ) throw new Error('Invalid excluded Stage 09 evidence group.');
  }

  const teacherVerified = value.candidates.filter((candidate) => candidate.teacherVerified).length;
  const realOmr = value.candidates.filter((candidate) => candidate.realOmr).length;
  const eligible = value.candidates.filter((candidate) => candidate.eligibleAsStage09CorrectionCase).length;
  const excluded = value.excludedEvidenceGroups.reduce((sum, group) => sum + group.paths.length, 0);

  if (
    value.summary.teacherVerifiedReferences !== teacherVerified
    || value.summary.authenticRealOmrReferences !== realOmr
    || value.summary.eligibleStage09CorrectionCases !== eligible
    || value.summary.excludedRegressionOutputs !== excluded
  ) throw new Error('Stage 09 teacher evidence inventory summary is inconsistent.');

  return value;
}

function evaluateTeacherCorrectionEvidenceIntake(value = inventory) {
  validateEvidenceCandidateInventory(value);
  const eligible = value.candidates.filter((candidate) => candidate.eligibleAsStage09CorrectionCase);
  return Object.freeze({
    documentType: 'Stage09TeacherCorrectionEvidenceIntakeReport',
    contractVersion: '1.0.0',
    status: eligible.length > 0 ? 'ELIGIBLE_CANDIDATES_AVAILABLE' : 'HOLD_NO_ELIGIBLE_CORRECTION_CASES',
    teacherVerifiedReferences: value.summary.teacherVerifiedReferences,
    authenticRealOmrReferences: value.summary.authenticRealOmrReferences,
    eligibleStage09CorrectionCases: eligible.length,
    excludedRegressionOutputs: value.summary.excludedRegressionOutputs,
    candidateResults: Object.freeze(value.candidates.map((candidate) => Object.freeze({
      candidateId: candidate.candidateId,
      eligibility: candidate.stage09CorrectionEligibility,
      eligibleAsStage09CorrectionCase: candidate.eligibleAsStage09CorrectionCase,
      reason: candidate.reason,
    }))),
  });
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(evaluateTeacherCorrectionEvidenceIntake(), null, 2)}\n`);
}

module.exports = {
  evaluateTeacherCorrectionEvidenceIntake,
  validateCandidate,
  validateEvidenceCandidateInventory,
};
