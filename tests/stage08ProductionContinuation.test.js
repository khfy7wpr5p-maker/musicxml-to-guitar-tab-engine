'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  EDIT_CLASS,
  VALIDATION_STATE,
  createOriginalSourceSnapshot,
  createReviewRevision,
  createTeacherCorrectedRevision,
  createRevalidatedRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
  STAGE08_MATERIALIZER_CONTRACT_VERSION,
} = require('../src/app/stage08RevalidationTabContinuation');
const {
  STAGE08_PRODUCTION_CONTINUATION_DOCUMENT_TYPE,
  STAGE08_PRODUCTION_CONTINUATION_VERSION,
  continueStage08ProductionToCanonicalTab,
} = require('../src/app/stage08ProductionContinuation');

const ORIGINAL = fs.readFileSync(path.join(__dirname, 'fixtures', 'pa12-polyphonic-e2e.musicxml'));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function session() {
  const source = createOriginalSourceSnapshot({
    source_id: 'stage08-production-source',
    byte_length: ORIGINAL.byteLength,
    sha256: sha256(ORIGINAL),
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: { test: true },
  });
  const review = createReviewRevision(source, {
    revision_id: 'stage08-production-review',
    actor: 'system',
    timestamp: '2026-09-04T18:00:00.000Z',
    reason: 'Review source.',
    provenance: { stage: 'STAGE_04' },
    review_evidence: { status: 'REVIEW_REQUIRED', canOpenForReview: true },
  });
  const corrected = createTeacherCorrectedRevision(review, {
    revision_id: 'stage08-production-corrected',
    actor: 'teacher',
    timestamp: '2026-09-04T18:01:00.000Z',
    reason: 'Correct source.',
    provenance: { stage: 'STAGE_06' },
    patches: [{
      patch_id: 'patch-1',
      edit_class: EDIT_CLASS.PITCH_UPDATE,
      target_event: 'event-1',
      before: { pitch: 'C4' },
      after: { pitch: 'D4' },
    }],
  });
  const revalidated = createRevalidatedRevision(corrected, {
    revision_id: 'stage08-production-revalidated',
    actor: 'validator',
    timestamp: '2026-09-04T18:02:00.000Z',
    reason: 'Revalidation passed.',
    provenance: { stage: 'STAGE_06' },
    validation_state: VALIDATION_STATE.VALID,
    validation_evidence: { status: 'VALID' },
  });
  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    session_id: 'stage08-production-session',
    phase: SESSION_PHASE.REVALIDATED,
    saved_revision: corrected,
    revalidated_revision: revalidated,
  };
}

function request() {
  const currentSession = session();
  const sourceText = ORIGINAL.toString('utf8');
  const correctedBytes = Buffer.from(sourceText.replace(
    '<pitch><step>C</step><octave>4</octave></pitch>',
    '<pitch><step>D</step><octave>4</octave></pitch>',
  ));
  return {
    session: currentSession,
    sourceFileName: 'stage08-production.musicxml',
    originalSourceBytes: Buffer.from(ORIGINAL),
    materializer: {
      manifest: {
        contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
        adapterId: 'stage08-production-materializer',
        mediaType: 'application/vnd.recordare.musicxml+xml',
      },
      materialize({ source, savedRevision, revalidatedRevision }) {
        return {
          correctedBytes,
          evidence: {
            documentType: STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
            contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
            adapterId: 'stage08-production-materializer',
            sourceId: source.source_id,
            correctedRevisionId: revalidatedRevision.revision_id,
            parentRevisionId: savedRevision.revision_id,
            originalSha256: source.sha256,
            correctedSha256: sha256(correctedBytes),
            correctedByteLength: correctedBytes.byteLength,
            patchIds: revalidatedRevision.patches.map((patch) => patch.patch_id),
            mediaType: 'application/vnd.recordare.musicxml+xml',
          },
        };
      },
    },
    approvalMetadata: {
      revision_id: 'stage08-production-approved',
      actor: 'stage08-engine',
      timestamp: '2026-09-04T18:03:00.000Z',
      reason: 'Stage 08 production chain passed.',
      provenance: { stage: 'STAGE_08_REVALIDATION_AND_TAB' },
    },
  };
}

test('production continuation replaces constructor-only approval with evidence-bound Stage 08 approval', () => {
  const result = continueStage08ProductionToCanonicalTab(request());

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.productionDocumentType, STAGE08_PRODUCTION_CONTINUATION_DOCUMENT_TYPE);
  assert.equal(result.productionContractVersion, STAGE08_PRODUCTION_CONTINUATION_VERSION);
  assert.equal(result.approvedRevision.state, 'APPROVED_CANONICAL_SCORE');
  assert.deepEqual(result.approvedRevision.stage08_evidence, result.approvalEvidence);
  assert.equal(result.approvedRevision.stage08_evidence.reentry_status, 'PASS');
  assert.equal(result.approvedRevision.stage08_evidence.route, 'POLY_V2');
});
