'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('..');
const {
  EDIT_CLASS,
  VALIDATION_STATE,
  createOriginalSourceSnapshot,
  createReviewRevision,
  createTeacherCorrectedRevision,
  createRevalidatedRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  STAGE08_APPROVAL_EVIDENCE_CONTRACT_VERSION,
  STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE,
  Stage08ApprovedCanonicalRevisionError,
  createStage08ApprovedCanonicalRevision,
} = require('../src/app/stage08ApprovedCanonicalRevision');

function validRevision() {
  const source = createOriginalSourceSnapshot({
    source_id: 'stage08-source-approval',
    byte_length: 100,
    sha256: 'a'.repeat(64),
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: { test: true },
  });
  const review = createReviewRevision(source, {
    revision_id: 'stage08-review-approval',
    actor: 'system',
    timestamp: '2026-09-04T18:00:00.000Z',
    reason: 'Teacher review required.',
    provenance: { stage: 'STAGE_04' },
    review_evidence: { status: 'REVIEW_REQUIRED', canOpenForReview: true },
  });
  const corrected = createTeacherCorrectedRevision(review, {
    revision_id: 'stage08-corrected-approval',
    actor: 'teacher',
    timestamp: '2026-09-04T18:01:00.000Z',
    reason: 'Teacher correction.',
    provenance: { stage: 'STAGE_06' },
    patches: [{
      patch_id: 'patch-1',
      edit_class: EDIT_CLASS.PITCH_UPDATE,
      target_event: 'event-1',
      before: { pitch: 'C4' },
      after: { pitch: 'D4' },
    }],
  });
  return createRevalidatedRevision(corrected, {
    revision_id: 'stage08-revalidated-approval',
    actor: 'validator',
    timestamp: '2026-09-04T18:02:00.000Z',
    reason: 'Revalidation passed.',
    provenance: { stage: 'STAGE_06' },
    validation_state: VALIDATION_STATE.VALID,
    validation_evidence: { status: 'VALID' },
  });
}

function evidence(revision, overrides = {}) {
  return {
    documentType: STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE,
    contractVersion: STAGE08_APPROVAL_EVIDENCE_CONTRACT_VERSION,
    source_id: revision.original_source.source_id,
    revalidated_revision_id: revision.revision_id,
    materializer_id: 'trusted-materializer',
    corrected_sha256: 'b'.repeat(64),
    route: 'POLY_V2',
    reentry_status: 'PASS',
    canonical_document_type: 'CanonicalTabResult',
    canonical_contract_version: '2.0.0',
    output_sha256: 'c'.repeat(64),
    output_byte_length: 2048,
    ...overrides,
  };
}

function metadata() {
  return {
    revision_id: 'stage08-approved-approval',
    actor: 'stage08-engine',
    timestamp: '2026-09-04T18:03:00.000Z',
    reason: 'Stage 08 production chain passed.',
    provenance: { stage: 'STAGE_08_REVALIDATION_AND_TAB' },
  };
}

test('VALID revalidation alone is insufficient at the production approval gate', () => {
  const revision = validRevision();
  assert.throws(
    () => createStage08ApprovedCanonicalRevision(revision, null, metadata()),
    (error) => {
      assert.ok(error instanceof Stage08ApprovedCanonicalRevisionError);
      assert.equal(error.code, 'INVALID_STAGE08_APPROVAL_EVIDENCE');
      return true;
    },
  );
});

test('Stage 08 approval requires exact source/revision identity plus PASS canonical writer evidence', () => {
  const revision = validRevision();
  for (const [overrides, code] of [
    [{ source_id: 'other-source' }, 'STAGE08_APPROVAL_IDENTITY_MISMATCH'],
    [{ revalidated_revision_id: 'other-revision' }, 'STAGE08_APPROVAL_IDENTITY_MISMATCH'],
    [{ reentry_status: 'BLOCKED' }, 'STAGE08_REENTRY_NOT_PASS'],
    [{ canonical_document_type: 'NotCanonical' }, 'CANONICAL_EVIDENCE_MISSING'],
    [{ output_byte_length: 0 }, 'WRITER_EVIDENCE_MISSING'],
  ]) {
    assert.throws(
      () => createStage08ApprovedCanonicalRevision(revision, evidence(revision, overrides), metadata()),
      (error) => {
        assert.ok(error instanceof Stage08ApprovedCanonicalRevisionError);
        assert.equal(error.code, code);
        return true;
      },
    );
  }
});

test('approved canonical revision stores the exact validated Stage 08 evidence', () => {
  const revision = validRevision();
  const stage08Evidence = evidence(revision);
  const approved = createStage08ApprovedCanonicalRevision(revision, stage08Evidence, metadata());

  assert.equal(approved.state, 'APPROVED_CANONICAL_SCORE');
  assert.equal(approved.validation_state, 'APPROVED');
  assert.equal(approved.parent_revision_id, revision.revision_id);
  assert.deepEqual(approved.stage08_evidence, stage08Evidence);
  assert.equal(Object.isFrozen(approved), true);
  assert.equal(Object.isFrozen(approved.stage08_evidence), true);
});

test('Stage 08 approval gate remains internal and does not widen the package root', () => {
  for (const name of [
    'createStage08ApprovedCanonicalRevision',
    'STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE',
  ]) {
    assert.equal(publicApi[name], undefined);
  }
});
