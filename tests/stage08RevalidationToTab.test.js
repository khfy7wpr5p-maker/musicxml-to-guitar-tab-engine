'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REVISION_STATE,
  VALIDATION_STATE,
  createOriginalSourceSnapshot,
  createReviewRevision,
  createTeacherCorrectedRevision,
  createRevalidatedRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  SOURCE_REVIEW_AVAILABILITY,
} = require('../src/app/reviewableScoreState');
const {
  STAGE08_MATERIALIZER_CONTRACT_VERSION,
  STAGE08_REVIEW_ASSESSOR_CONTRACT_VERSION,
  approveAfterFullStage08,
  continueRevalidatedRevisionToTab,
} = require('../src/app/stage08RevalidationToTab');

const ROOT = path.resolve(__dirname, '..');
const correctedPoly = fs.readFileSync(path.join(ROOT, 'tests/fixtures/pa12-polyphonic-e2e.musicxml'));
const originalPoly = Buffer.from(
  correctedPoly.toString('utf8').replace(
    '<pitch><step>C</step><octave>4</octave></pitch>',
    '<pitch><step>B</step><octave>4</octave></pitch>',
  ),
  'utf8',
);

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function revisionChain() {
  const original = createOriginalSourceSnapshot({
    source_id: 'source-stage08-1',
    byte_length: originalPoly.byteLength,
    sha256: digest(originalPoly),
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: { producer: 'stage08-test', immutable: true },
  });
  const review = createReviewRevision(original, {
    revision_id: 'review-stage08-1',
    actor: { type: 'SYSTEM', id: 'omr-review' },
    timestamp: '2026-09-04T18:00:00.000Z',
    reason: 'Open exact suspected pitch for teacher review.',
    review_evidence: {
      status: 'REVIEW_REQUIRED',
      canOpenForReview: true,
      route: 'POLY_V2',
      issues: [{ code: 'OMR_SUSPECTED_PITCH', event: 'event-1' }],
    },
    provenance: { stage: 'STAGE_04_OMR_REVIEW_MODEL' },
  });
  const corrected = createTeacherCorrectedRevision(review, {
    revision_id: 'teacher-stage08-1',
    actor: { type: 'TEACHER', id: 'teacher-1' },
    timestamp: '2026-09-04T18:01:00.000Z',
    reason: 'Correct the explicit pitch.',
    patches: [{
      patch_id: 'patch-stage08-1',
      edit_class: 'PITCH_UPDATE',
      target_event: { eventId: 'event-1', measure: 1, voice: 1 },
      before: { pitch: 'B4' },
      after: { pitch: 'C4' },
    }],
    provenance: { editor: 'st-score-editor-core', mode: 'review' },
  });
  const revalidated = createRevalidatedRevision(corrected, {
    revision_id: 'revalidated-stage08-1',
    actor: { type: 'SYSTEM', id: 'revalidator' },
    timestamp: '2026-09-04T18:02:00.000Z',
    reason: 'Revalidate teacher correction.',
    validation_state: VALIDATION_STATE.VALID,
    validation_evidence: { musicXml: 'VALID', timing: 'VALID', ties: 'VALID' },
    provenance: { stage: 'STAGE_06_EDITOR_API' },
  });
  return { original, review, corrected, revalidated };
}

function session(overrides = {}) {
  const chain = revisionChain();
  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    session_id: 'session-stage08-1',
    phase: SESSION_PHASE.REVALIDATED,
    review_revision: chain.review,
    saved_revision: chain.corrected,
    revalidated_revision: chain.revalidated,
    ...overrides,
  };
}

function materializer(bytes = correctedPoly, overrides = {}) {
  return {
    contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
    materializerId: 'stage08-test-materializer',
    materialize(input) {
      assert.equal(input.sourceId, 'source-stage08-1');
      assert.equal(input.revisionId, 'revalidated-stage08-1');
      assert.equal(input.parentRevisionId, 'teacher-stage08-1');
      assert.equal(input.patches.length, 1);
      return {
        sourceId: input.sourceId,
        revisionId: input.revisionId,
        bytes: Buffer.from(bytes),
        evidence: { appliedPatchIds: input.patches.map((patch) => patch.patch_id) },
      };
    },
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    session: session(),
    expectedSessionId: 'session-stage08-1',
    expectedRevisionId: 'revalidated-stage08-1',
    expectedSourceId: 'source-stage08-1',
    originalSourceBytes: Buffer.from(originalPoly),
    fileName: 'teacher-corrected.musicxml',
    approvalMetadata: {
      revision_id: 'approved-stage08-1',
      actor: { type: 'SYSTEM', id: 'stage08' },
      timestamp: '2026-09-04T18:03:00.000Z',
      reason: 'Approve only after full Stage 08 production PASS.',
      provenance: { gate: 'stage08-test' },
    },
    ...overrides,
  };
}

const noReview = () => ({ materializer: materializer(), reviewAssessor: null });

test('Stage 08 materializes the exact corrected revision, re-enters POLY_V2 and approves only after canonical writer PASS', () => {
  const result = continueRevalidatedRevisionToTab(request(), noReview());

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.source_id, 'source-stage08-1');
  assert.equal(result.revision_id, 'revalidated-stage08-1');
  assert.equal(result.production.status, 'PASS');
  assert.equal(result.production.route, 'POLY_V2');
  assert.equal(result.canonicalTabResult.documentType, 'CanonicalTabResult');
  assert.equal(typeof result.musicXml, 'string');
  assert.ok(result.musicXml.length > 0);
  assert.equal(result.approved_revision.state, REVISION_STATE.APPROVED_CANONICAL_SCORE);
  assert.equal(result.approved_revision.validation_state, VALIDATION_STATE.APPROVED);
  assert.equal(result.approved_revision.parent_revision_id, 'revalidated-stage08-1');
  assert.equal(result.approved_revision.provenance.stage08.status, 'PASS');
  assert.equal(result.approved_revision.provenance.stage08.route, 'POLY_V2');
});

test('same source, revision and ports produce deterministic Stage 08 route, canonical TAB and output', () => {
  const first = continueRevalidatedRevisionToTab(request(), noReview());
  const second = continueRevalidatedRevisionToTab(request(), noReview());

  assert.equal(first.status, second.status);
  assert.equal(first.route, second.route);
  assert.deepEqual(first.canonicalTabResult, second.canonicalTabResult);
  assert.equal(first.musicXml, second.musicXml);
  assert.deepEqual(first.approval_evidence, second.approval_evidence);
});

test('REVALIDATED/VALID is eligibility only; approval gate rejects missing Stage 08 production evidence', () => {
  const { revalidated } = revisionChain();
  assert.throws(
    () => approveAfterFullStage08(revalidated, request().approvalMetadata, null),
    (error) => error.code === 'STAGE08_APPROVAL_EVIDENCE_REQUIRED',
  );
});

test('editing, saved, invalid and stale revision/session/source continuations fail closed', () => {
  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ session: session({ phase: SESSION_PHASE.EDITING }) }), noReview()),
    (error) => error.code === 'STAGE08_NOT_ELIGIBLE',
  );
  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ session: session({ phase: SESSION_PHASE.SAVED }) }), noReview()),
    (error) => error.code === 'STAGE08_NOT_ELIGIBLE',
  );

  const invalidChain = revisionChain();
  invalidChain.revalidated = createRevalidatedRevision(invalidChain.corrected, {
    revision_id: 'revalidated-stage08-invalid',
    actor: 'validator',
    timestamp: '2026-09-04T18:02:00.000Z',
    reason: 'Remaining conflict.',
    validation_state: VALIDATION_STATE.INVALID,
    validation_evidence: { code: 'VOICE_CONFLICT_REMAINS' },
    provenance: { stage: 'test' },
  });
  const invalidSession = session({ revalidated_revision: invalidChain.revalidated });
  assert.throws(
    () => continueRevalidatedRevisionToTab(request({
      session: invalidSession,
      expectedRevisionId: 'revalidated-stage08-invalid',
    }), noReview()),
    (error) => error.code === 'STAGE08_NOT_ELIGIBLE',
  );

  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ expectedSessionId: 'session-stale' }), noReview()),
    (error) => error.code === 'STALE_STAGE08_SESSION',
  );
  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ expectedRevisionId: 'revision-stale' }), noReview()),
    (error) => error.code === 'STALE_STAGE08_REVISION',
  );
  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ expectedSourceId: 'source-stale' }), noReview()),
    (error) => error.code === 'STALE_STAGE08_SOURCE',
  );
});

test('original source hash mismatch and source mutation during materialization fail closed', () => {
  const tampered = Buffer.from(originalPoly);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ originalSourceBytes: tampered }), noReview()),
    (error) => error.code === 'ORIGINAL_SOURCE_IDENTITY_MISMATCH',
  );

  const original = Buffer.from(originalPoly);
  const mutating = materializer(correctedPoly, {
    materialize(input) {
      original[0] ^= 1;
      return {
        sourceId: input.sourceId,
        revisionId: input.revisionId,
        bytes: Buffer.from(correctedPoly),
        evidence: { appliedPatchIds: ['patch-stage08-1'] },
      };
    },
  });
  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ originalSourceBytes: original }), {
      materializer: mutating,
      reviewAssessor: null,
    }),
    (error) => error.code === 'ORIGINAL_SOURCE_IDENTITY_MISMATCH',
  );
});

test('materializer source/revision identity mismatch fails closed before production', () => {
  const wrong = materializer(correctedPoly, {
    materialize() {
      return {
        sourceId: 'source-other',
        revisionId: 'revision-other',
        bytes: Buffer.from(correctedPoly),
        evidence: { appliedPatchIds: ['patch-stage08-1'] },
      };
    },
  });
  assert.throws(
    () => continueRevalidatedRevisionToTab(request(), { materializer: wrong, reviewAssessor: null }),
    (error) => error.code === 'STAGE08_MATERIALIZED_IDENTITY_MISMATCH',
  );
});

test('trusted remaining-review evidence returns REVIEW_REQUIRED and never writes canonical TAB', () => {
  const assessor = {
    contractVersion: STAGE08_REVIEW_ASSESSOR_CONTRACT_VERSION,
    assessorId: 'stage08-test-review-assessor',
    assess(input) {
      return {
        sourceId: input.sourceId,
        revisionId: input.revisionId,
        issuePayloads: [{
          issue_id: 'remaining-issue-1',
          category: 'semantic',
          code: 'OMR_AMBIGUOUS_TIE',
          severity: 'error',
          measure: 1,
          staff: 1,
          voice: 2,
          event_id_or_location: { sourceEventId: 'event-remaining-1' },
          observed_value: { tie: 'ambiguous' },
          confidence_or_evidence_if_available: { source: 'trusted-revalidation' },
          suggested_review_action: 'Resolve the remaining tie ambiguity.',
          source_provenance: { sourceId: input.sourceId, revisionId: input.revisionId },
        }],
        sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
        evidence: { assessor: 'stage08-test' },
      };
    },
  };
  const result = continueRevalidatedRevisionToTab(request(), {
    materializer: materializer(),
    reviewAssessor: assessor,
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.review.reviewState.canOpenForReview, true);
  assert.equal(result.production, null);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.approved_revision, null);
});

test('malformed corrected materialization is BLOCKED and cannot become canonical success', () => {
  const result = continueRevalidatedRevisionToTab(request(), {
    materializer: materializer(Buffer.from('<score-partwise>', 'utf8')),
    reviewAssessor: null,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.route, 'UNRESOLVED');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.approved_revision, null);
});

test('physical/playability failure cannot run writer or approval as success', () => {
  const impossible = Buffer.from(
    correctedPoly.toString('utf8').replace(
      '<pitch><step>C</step><octave>4</octave></pitch>',
      '<pitch><step>C</step><octave>9</octave></pitch>',
    ),
    'utf8',
  );
  const result = continueRevalidatedRevisionToTab(request(), {
    materializer: materializer(impossible),
    reviewAssessor: null,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.approved_revision, null);
});

test('Stage 08 internal application contract does not widen package-root exports', () => {
  const publicApi = require('..');
  for (const name of [
    'continueRevalidatedRevisionToTab',
    'approveAfterFullStage08',
    'STAGE08_REVALIDATION_TAB_CONTRACT_VERSION',
  ]) {
    assert.equal(publicApi[name], undefined);
  }
});
