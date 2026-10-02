'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createEdtab04PitchMaterializer } = require('../src/app/edtab04PitchMaterializer');
const {
  EDIT_CLASS, VALIDATION_STATE, createOriginalSourceSnapshot,
  createReviewRevision, createTeacherCorrectedRevision, createRevalidatedRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  continueRevalidatedRevisionToTab,
  Stage08RevalidationTabError,
} = require('../src/app/stage08RevalidationTabContinuation');

const original = fs.readFileSync(path.join(__dirname, 'fixtures/pa12-polyphonic-e2e.musicxml'));
const originalSha = crypto.createHash('sha256').update(original).digest('hex');

function patch(overrides = {}) {
  return {
    patch_id: 'pitch-1', edit_class: EDIT_CLASS.PITCH_UPDATE,
    target_event: 'P1:measure:0:note:0',
    before: { step: 'C', alter: 0, octave: 4 },
    after: { step: 'D', alter: 0, octave: 4 },
    ...overrides,
  };
}

function session(patches = [patch()]) {
  const source = createOriginalSourceSnapshot({
    source_id: 'edtab-04-source', byte_length: original.length, sha256: originalSha,
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: { producer: 'edtab-04-test' },
  });
  const review = createReviewRevision(source, {
    revision_id: 'edtab-04-review', actor: 'teacher-1',
    timestamp: '2026-10-03T01:00:00.000Z', reason: 'Review source pitch',
    provenance: 'test', review_evidence: { status: 'REVIEW_REQUIRED' },
  });
  const saved = createTeacherCorrectedRevision(review, {
    revision_id: 'edtab-04-corrected', actor: 'teacher-1',
    timestamp: '2026-10-03T01:01:00.000Z', reason: 'Correct source pitch',
    provenance: 'test', patches,
  });
  const revalidated = createRevalidatedRevision(saved, {
    revision_id: 'edtab-04-revalidated', actor: 'validator-1',
    timestamp: '2026-10-03T01:02:00.000Z', reason: 'Independent validation',
    provenance: 'test', validation_state: VALIDATION_STATE.VALID,
    validation_evidence: { result: 'VALID' },
  });
  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    phase: SESSION_PHASE.REVALIDATED,
    saved_revision: saved,
    revalidated_revision: revalidated,
  };
}

function request(overrides = {}) {
  return {
    session: session(), sourceFileName: 'edtab-04-corrected.musicxml',
    originalSourceBytes: Buffer.from(original),
    materializer: createEdtab04PitchMaterializer(),
    approvalMetadata: {
      revision_id: 'edtab-04-approved', actor: 'teacher-1',
      timestamp: '2026-10-03T01:03:00.000Z', reason: 'Stage 08 PASS',
      provenance: 'test',
    },
    ...overrides,
  };
}

test('EDTAB-04B materializes an exact source pitch patch through ordinary POLY PASS re-entry', () => {
  const result = continueRevalidatedRevisionToTab(request());
  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.reentry.status, 'PASS');
  assert.equal(result.approvalEvidence.corrected_sha256,
    result.materializationEvidence.correctedSha256);
  assert.ok(result.canonicalTabResult);
  assert.match(result.musicXml, /<score-partwise\b/);
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), originalSha);
});

test('EDTAB-04B rejects a forged before pitch instead of rewriting another note', () => {
  const result = request({ session: session([patch({
    before: { step: 'F', alter: 0, octave: 4 },
  })]) });
  assert.throws(() => continueRevalidatedRevisionToTab(result), (error) => {
    assert.ok(error instanceof Stage08RevalidationTabError);
    assert.equal(error.code, 'MATERIALIZATION_FAILED');
    return true;
  });
});

test('EDTAB-04B leaves unsupported duration patches fail-closed', () => {
  const result = request({ session: session([patch({
    edit_class: EDIT_CLASS.DURATION_UPDATE,
    before: { duration: 4 }, after: { duration: 8 },
  })]) });
  assert.throws(() => continueRevalidatedRevisionToTab(result),
    (error) => error.code === 'MATERIALIZATION_FAILED');
});

test('EDTAB-04B rejects stale original bytes before materialization', () => {
  const changed = Buffer.concat([original, Buffer.from('\n')]);
  assert.throws(() => continueRevalidatedRevisionToTab(request({ originalSourceBytes: changed })),
    (error) => error.code === 'SOURCE_IDENTITY_MISMATCH');
});
