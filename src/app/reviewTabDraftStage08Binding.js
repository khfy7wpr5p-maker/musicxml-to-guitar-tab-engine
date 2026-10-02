'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { processReviewTabDraftEdit } = require('./reviewTabDraftEditRuntime');
const {
  REVISION_STATE,
  VALIDATION_STATE,
  TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
} = require('./teacherCorrectionRevision');
const {
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  SESSION_PHASE,
} = require('./reviewEditorBackend');

const DOCUMENT_TYPE = 'ReviewTabDraftStage08Binding';
const CONTRACT_VERSION = '1.0.0';

function blocked(code) {
  return Object.freeze({
    documentType: DOCUMENT_TYPE,
    contractVersion: CONTRACT_VERSION,
    status: 'BLOCKED',
    code,
    canonicalAuthority: false,
    export: false,
  });
}

function revisionHasState(value, state, validationState) {
  return value?.documentType === TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    && value?.contractVersion === TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    && value?.state === state
    && value?.validation_state === validationState;
}

// This is only a source/revision identity handoff. Stage 08 remains the sole
// re-entry and canonical approval authority, including materialization checks.
function bindReviewTabDraftToStage08({
  fileName,
  originalSourceBytes,
  expectedInputSha256,
  baseRevisionId,
  commands,
  session,
}) {
  if (isProxy(originalSourceBytes)) return blocked('INVALID_ORIGINAL_SOURCE');
  const bytes = Buffer.isBuffer(originalSourceBytes) || originalSourceBytes instanceof Uint8Array
    ? Buffer.from(originalSourceBytes)
    : null;
  if (!bytes) return blocked('INVALID_ORIGINAL_SOURCE');
  const sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sourceSha256 !== expectedInputSha256) return blocked('SOURCE_IDENTITY_MISMATCH');

  let draft;
  try {
    draft = processReviewTabDraftEdit({
      fileName,
      bytes,
      expectedInputSha256,
      baseRevisionId,
      commands,
    });
  } catch {
    return blocked('INVALID_REVIEW_DRAFT_REQUEST');
  }
  if (draft.status !== 'REVIEW_REQUIRED' || !draft.revision || !draft.reviewTabDraft) {
    return blocked('REVIEW_DRAFT_NOT_REPRODUCED');
  }

  const saved = session?.saved_revision;
  const revalidated = session?.revalidated_revision;
  if (
    isProxy(session)
    || session?.documentType !== REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE
    || session?.contractVersion !== REVIEW_EDITOR_BACKEND_CONTRACT_VERSION
    || session?.phase !== SESSION_PHASE.REVALIDATED
    || !revisionHasState(saved, REVISION_STATE.TEACHER_CORRECTED_REVISION, VALIDATION_STATE.PENDING_REVALIDATION)
    || !revisionHasState(revalidated, REVISION_STATE.REVALIDATED_REVISION, VALIDATION_STATE.VALID)
    || revalidated.parent_revision_id !== saved.revision_id
    || !Array.isArray(saved.patches)
    || saved.patches.length === 0
    || JSON.stringify(saved.patches) !== JSON.stringify(revalidated.patches)
  ) return blocked('STAGE08_SESSION_NOT_REVALIDATED');

  const sources = [saved.original_source, revalidated.original_source];
  if (sources.some((source) => (
    source?.sha256 !== sourceSha256 || source?.byte_length !== bytes.byteLength
    || source?.source_id !== sources[0]?.source_id
  ))) return blocked('SOURCE_IDENTITY_MISMATCH');

  if (crypto.createHash('sha256').update(bytes).digest('hex') !== sourceSha256) {
    return blocked('SOURCE_MUTATION_DETECTED');
  }

  return Object.freeze({
    documentType: DOCUMENT_TYPE,
    contractVersion: CONTRACT_VERSION,
    status: 'BOUND_FOR_REVALIDATION',
    sourceSha256,
    baseRevisionId: draft.revision.baseRevisionId,
    draftRevisionId: draft.revision.revisionId,
    correctedRevisionId: revalidated.revision_id,
    assignedCount: draft.reviewTabDraft.perNoteDisposition.filter(
      (entry) => entry.disposition === 'ASSIGNED',
    ).length,
    canonicalAuthority: false,
    export: false,
  });
}

module.exports = { bindReviewTabDraftToStage08 };
