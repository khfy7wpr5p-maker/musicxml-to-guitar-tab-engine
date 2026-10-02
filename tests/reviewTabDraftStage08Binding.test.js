'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { bindReviewTabDraftToStage08 } = require('../src/app/reviewTabDraftStage08Binding');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  REVISION_STATE,
  VALIDATION_STATE,
  TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
} = require('../src/app/teacherCorrectionRevision');
const {
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');

const fileName = 'edtab-04a-review.musicxml';
const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/edtab-03-review-draft.musicxml'));
const sourceSha = crypto.createHash('sha256').update(bytes).digest('hex');
const baseRevisionId = processMusicXmlUpload({ fileName, bytes }).reviewTabDraft.revisionId;
const commands = [{
  sourceEventId: 'P1:measure:0:note:0',
  selectedPosition: { string: 1, fret: 0 },
}];

function session() {
  const original_source = { source_id: 'review-source-1', sha256: sourceSha, byte_length: bytes.length };
  const patches = [{ patch_id: 'semantic-patch-1', edit_class: 'PITCH_UPDATE' }];
  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    phase: SESSION_PHASE.REVALIDATED,
    saved_revision: {
      documentType: TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
      contractVersion: TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
      state: REVISION_STATE.TEACHER_CORRECTED_REVISION,
      validation_state: VALIDATION_STATE.PENDING_REVALIDATION,
      revision_id: 'teacher-corrected-1',
      original_source,
      patches,
    },
    revalidated_revision: {
      documentType: TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
      contractVersion: TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
      state: REVISION_STATE.REVALIDATED_REVISION,
      validation_state: VALIDATION_STATE.VALID,
      revision_id: 'teacher-revalidated-1',
      parent_revision_id: 'teacher-corrected-1',
      original_source,
      patches,
    },
  };
}

function request(overrides = {}) {
  return { fileName, originalSourceBytes: bytes, expectedInputSha256: sourceSha,
    baseRevisionId, commands, session: session(), ...overrides };
}

test('EDTAB-04A binds exact source and revision identities without granting export', () => {
  const result = bindReviewTabDraftToStage08(request());
  assert.equal(result.status, 'BOUND_FOR_REVALIDATION');
  assert.equal(result.sourceSha256, sourceSha);
  assert.equal(result.baseRevisionId, baseRevisionId);
  assert.equal(result.correctedRevisionId, 'teacher-revalidated-1');
  assert.equal(result.assignedCount, 1);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.export, false);
  assert.equal(Object.isFrozen(result), true);
});

test('EDTAB-04A rejects stale bytes and does not infer PASS from assigned TAB', () => {
  const stale = bindReviewTabDraftToStage08(request({
    originalSourceBytes: Buffer.concat([bytes, Buffer.from('\n')]),
  }));
  assert.equal(stale.status, 'BLOCKED');
  assert.equal(stale.code, 'SOURCE_IDENTITY_MISMATCH');
  assert.equal(stale.export, false);
  assert.equal(bindReviewTabDraftToStage08(request()).export, false);
});

test('EDTAB-04A rejects a revision belonging to another source', () => {
  const foreign = session();
  foreign.revalidated_revision.original_source = {
    ...foreign.revalidated_revision.original_source,
    sha256: '0'.repeat(64),
  };
  const result = bindReviewTabDraftToStage08(request({ session: foreign }));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'SOURCE_IDENTITY_MISMATCH');
});

test('EDTAB-04A rejects missing semantic correction and mismatched patch ledger', () => {
  const noPatch = session();
  noPatch.saved_revision.patches = [];
  noPatch.revalidated_revision.patches = [];
  assert.equal(bindReviewTabDraftToStage08(request({ session: noPatch })).code,
    'STAGE08_SESSION_NOT_REVALIDATED');

  const mismatched = session();
  mismatched.revalidated_revision.patches = [{ patch_id: 'different-patch' }];
  assert.equal(bindReviewTabDraftToStage08(request({ session: mismatched })).code,
    'STAGE08_SESSION_NOT_REVALIDATED');
});

test('EDTAB-04A never binds a physically invalid teacher string/fret command', () => {
  const result = bindReviewTabDraftToStage08(request({ commands: [{
    sourceEventId: 'P1:measure:0:note:0',
    selectedPosition: { string: 2, fret: 0 },
  }] }));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'REVIEW_DRAFT_NOT_REPRODUCED');
  assert.equal(result.canonicalAuthority, false);
});
