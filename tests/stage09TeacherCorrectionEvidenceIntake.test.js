'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const inventory = require('../verification/stage09-teacher-correction-evidence-candidates.json');
const {
  evaluateTeacherCorrectionEvidenceIntake,
  validateEvidenceCandidateInventory,
} = require('../scripts/stage09-teacher-correction-evidence-intake');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('Stage 09 evidence inventory records real teacher references without promoting them to correction cases', () => {
  assert.equal(validateEvidenceCandidateInventory(inventory), inventory);
  const report = evaluateTeacherCorrectionEvidenceIntake(inventory);

  assert.equal(report.status, 'HOLD_NO_ELIGIBLE_CORRECTION_CASES');
  assert.equal(report.teacherVerifiedReferences, 2);
  assert.equal(report.authenticRealOmrReferences, 1);
  assert.equal(report.eligibleStage09CorrectionCases, 0);
  assert.equal(report.excludedRegressionOutputs, 7);
});

test('owner-approved real Audiveris reference remains ineligible because no teacher correction is needed', () => {
  const candidate = inventory.candidates.find((entry) => entry.candidateId === 'seslitab-plan0-owner-approved-3-8');
  assert.ok(candidate);
  assert.equal(candidate.teacherVerified, true);
  assert.equal(candidate.realOmr, true);
  assert.equal(candidate.observedCorrectionNeededCount, 0);
  assert.equal(candidate.nonEmptyTeacherPatchLedgerAvailable, false);
  assert.equal(candidate.eligibleAsStage09CorrectionCase, false);
  assert.equal(candidate.stage09CorrectionEligibility, 'INELIGIBLE_NO_CORRECTION_NEEDED');
});

test('teacher-verified four-measure golden reference remains ineligible without an approved OMR correction chain', () => {
  const candidate = inventory.candidates.find((entry) => entry.candidateId === 'seslitab-plan0-cc0-4measure');
  assert.ok(candidate);
  assert.equal(candidate.teacherVerified, true);
  assert.equal(candidate.realOmr, false);
  assert.equal(candidate.omrArtifact, null);
  assert.equal(candidate.historicalAudiverisAttemptAcceptedAsReproduction, false);
  assert.equal(candidate.eligibleAsStage09CorrectionCase, false);
  assert.equal(candidate.stage09CorrectionEligibility, 'INELIGIBLE_NO_APPROVED_OMR_CORRECTION_CHAIN');
});

test('an ineligible candidate cannot be forged into eligibility without authentic correction evidence', () => {
  const forged = clone(inventory);
  const candidate = forged.candidates[0];
  candidate.eligibleAsStage09CorrectionCase = true;
  candidate.stage09CorrectionEligibility = 'ELIGIBLE';
  candidate.nonEmptyTeacherPatchLedgerAvailable = false;
  candidate.observedCorrectionNeededCount = 0;

  assert.throws(
    () => validateEvidenceCandidateInventory(forged),
    /cannot be granted without authentic teacher correction evidence/,
  );
});

test('real OMR regression outputs stay excluded from Tier B when teacher ground truth is incomplete', () => {
  const group = inventory.excludedEvidenceGroups[0];
  assert.equal(group.eligibility, 'INELIGIBLE_REGRESSION_OUTPUT_ONLY');
  assert.equal(group.paths.length, 7);
  assert.match(group.reason, /teacher-approval ground-truth evidence is incomplete/);
});
