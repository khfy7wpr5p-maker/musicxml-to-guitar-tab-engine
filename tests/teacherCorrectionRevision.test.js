'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  EDIT_CLASS,
  REVISION_STATE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
  VALIDATION_STATE,
  createApprovedCanonicalRevision,
  createOriginalSourceSnapshot,
  createRevalidatedRevision,
  createReviewRevision,
  createTeacherCorrectedRevision,
  normalizePatch,
} = require('../src/app/teacherCorrectionRevision');

const sourceInput = () => ({
  source_id: 'source-1',
  byte_length: 1234,
  sha256: 'a'.repeat(64),
  media_type: 'application/vnd.recordare.musicxml+xml',
  provenance: { producer: 'test', immutable: true },
});

const reviewMetadata = () => ({
  revision_id: 'review-1',
  actor: { type: 'SYSTEM', id: 'omr-review' },
  timestamp: '2026-09-03T20:00:00.000Z',
  reason: 'Open trusted OMR uncertainty for teacher review.',
  review_evidence: {
    status: 'REVIEW_REQUIRED',
    canOpenForReview: true,
    route: 'POLY_V2',
    issues: [{ code: 'OMR_SUSPECTED_PITCH', event: 'event-1' }],
  },
  provenance: { stage: 'STAGE_04_OMR_REVIEW_MODEL' },
});

const correctionMetadata = (patches) => ({
  revision_id: 'teacher-1',
  actor: { type: 'TEACHER', id: 'teacher-1' },
  timestamp: '2026-09-03T20:05:00.000Z',
  reason: 'Teacher confirmed the correction.',
  patches,
  provenance: { editor: 'st-score-editor-core', mode: 'review' },
});

const pitchPatch = () => ({
  patch_id: 'patch-1',
  edit_class: EDIT_CLASS.PITCH_UPDATE,
  target_event: { eventId: 'event-1', noteId: 'note-1' },
  before: { pitch: 'F#4' },
  after: { pitch: 'G4' },
});

function chain(patches = [pitchPatch()]) {
  const source = createOriginalSourceSnapshot(sourceInput());
  const review = createReviewRevision(source, reviewMetadata());
  const corrected = createTeacherCorrectedRevision(review, correctionMetadata(patches));
  return { source, review, corrected };
}

test('Stage 05 creates immutable source identity and REVIEW_REVISION without source mutation', () => {
  const input = sourceInput();
  const before = JSON.stringify(input);
  const source = createOriginalSourceSnapshot(input);
  const review = createReviewRevision(source, reviewMetadata());

  assert.equal(source.state, REVISION_STATE.ORIGINAL_SOURCE);
  assert.equal(review.state, REVISION_STATE.REVIEW_REVISION);
  assert.equal(review.validation_state, VALIDATION_STATE.REVIEW_REQUIRED);
  assert.equal(review.original_source, source);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(source), true);
  assert.equal(Object.isFrozen(source.provenance), true);
});

test('teacher correction stores explicit before/after and derives a reversible inverse patch', () => {
  const { source, review, corrected } = chain();
  const patch = corrected.patches[0];

  assert.equal(corrected.contractVersion, TEACHER_CORRECTION_REVISION_CONTRACT_VERSION);
  assert.equal(corrected.state, REVISION_STATE.TEACHER_CORRECTED_REVISION);
  assert.equal(corrected.parent_revision_id, review.revision_id);
  assert.equal(corrected.original_source, source);
  assert.equal(corrected.validation_state, VALIDATION_STATE.PENDING_REVALIDATION);
  assert.deepEqual(patch.before, { pitch: 'F#4' });
  assert.deepEqual(patch.after, { pitch: 'G4' });
  assert.deepEqual(patch.inverse_patch, {
    edit_class: EDIT_CLASS.PITCH_UPDATE,
    target_event: { eventId: 'event-1', noteId: 'note-1' },
    before: { pitch: 'G4' },
    after: { pitch: 'F#4' },
  });
  assert.equal(Object.isFrozen(patch), true);
  assert.equal(Object.isFrozen(patch.inverse_patch), true);
});

test('add/delete patch classes reverse into their semantic counterpart', () => {
  const add = normalizePatch({
    patch_id: 'add-1',
    edit_class: EDIT_CLASS.NOTE_ADD,
    target_event: { measureId: 'm1', voiceId: 'v1', onset: '1/4' },
    before: null,
    after: { noteId: 'n2', pitch: 'C4', duration: '1/4' },
  });
  const remove = normalizePatch({
    patch_id: 'delete-1',
    edit_class: EDIT_CLASS.REST_DELETE,
    target_event: 'event-rest-1',
    before: { duration: '1/4' },
    after: null,
  });

  assert.equal(add.inverse_patch.edit_class, EDIT_CLASS.NOTE_DELETE);
  assert.equal(add.inverse_patch.before.noteId, 'n2');
  assert.equal(add.inverse_patch.after, null);
  assert.equal(remove.inverse_patch.edit_class, EDIT_CLASS.REST_ADD);
  assert.equal(remove.inverse_patch.before, null);
  assert.deepEqual(remove.inverse_patch.after, { duration: '1/4' });
});

test('all master Stage 05 target edit classes are representable without execution authority', () => {
  const updateClasses = [
    EDIT_CLASS.PITCH_UPDATE,
    EDIT_CLASS.DURATION_UPDATE,
    EDIT_CLASS.ONSET_TIMELINE_CORRECTION,
    EDIT_CLASS.VOICE_REASSIGNMENT,
    EDIT_CLASS.STAFF_REASSIGNMENT,
    EDIT_CLASS.TIE_CORRECTION,
    EDIT_CLASS.CHORD_GROUPING_CORRECTION,
  ];
  for (const editClass of updateClasses) {
    const patch = normalizePatch({
      patch_id: `patch-${editClass.toLowerCase()}`,
      edit_class: editClass,
      target_event: 'event-1',
      before: { value: 'before' },
      after: { value: 'after' },
    });
    assert.equal(patch.edit_class, editClass);
  }

  for (const [editClass, before, after] of [
    [EDIT_CLASS.NOTE_ADD, null, { noteId: 'note-new' }],
    [EDIT_CLASS.NOTE_DELETE, { noteId: 'note-old' }, null],
    [EDIT_CLASS.REST_ADD, null, { duration: '1/4' }],
    [EDIT_CLASS.REST_DELETE, { duration: '1/4' }, null],
  ]) {
    assert.equal(normalizePatch({
      patch_id: `patch-${editClass.toLowerCase()}`,
      edit_class: editClass,
      target_event: 'event-1',
      before,
      after,
    }).edit_class, editClass);
  }
});

test('patches never infer a missing correction value', () => {
  assert.throws(
    () => normalizePatch({
      patch_id: 'guess-1',
      edit_class: EDIT_CLASS.PITCH_UPDATE,
      target_event: 'event-1',
      before: { pitch: 'F#4' },
      after: null,
    }),
    /requires explicit before and after/,
  );
  assert.throws(
    () => normalizePatch({
      patch_id: 'guess-2',
      edit_class: EDIT_CLASS.NOTE_ADD,
      target_event: 'event-1',
      before: null,
      after: null,
    }),
    /explicit after/,
  );
});

test('duplicate patch ids and no-op patches fail closed', () => {
  const source = createOriginalSourceSnapshot(sourceInput());
  const review = createReviewRevision(source, reviewMetadata());
  const duplicate = [pitchPatch(), { ...pitchPatch(), after: { pitch: 'A4' } }];

  assert.throws(
    () => createTeacherCorrectedRevision(review, correctionMetadata(duplicate)),
    /patch_id values must be unique/,
  );
  assert.throws(
    () => normalizePatch({
      ...pitchPatch(),
      before: { pitch: 'G4' },
      after: { pitch: 'G4' },
    }),
    /must change/,
  );
});

test('review revision requires explicit Stage 04 REVIEW_REQUIRED/openable evidence', () => {
  const source = createOriginalSourceSnapshot(sourceInput());
  assert.throws(
    () => createReviewRevision(source, {
      ...reviewMetadata(),
      review_evidence: { status: 'BLOCKED', canOpenForReview: false },
    }),
    /must prove REVIEW_REQUIRED/,
  );
});

test('revalidation preserves source and patches and records independent validation evidence', () => {
  const { source, corrected } = chain();
  const revalidated = createRevalidatedRevision(corrected, {
    revision_id: 'revalidated-1',
    actor: { type: 'SYSTEM', id: 'revalidator' },
    timestamp: '2026-09-03T20:06:00.000Z',
    reason: 'Revalidate explicit teacher correction.',
    validation_state: VALIDATION_STATE.VALID,
    validation_evidence: { musicXml: 'VALID', timing: 'VALID', ties: 'VALID' },
    provenance: { validator: 'stage-05-test' },
  });

  assert.equal(revalidated.state, REVISION_STATE.REVALIDATED_REVISION);
  assert.equal(revalidated.validation_state, VALIDATION_STATE.VALID);
  assert.equal(revalidated.original_source, source);
  assert.equal(revalidated.patches, corrected.patches);
  assert.deepEqual(revalidated.validation_evidence, {
    musicXml: 'VALID',
    ties: 'VALID',
    timing: 'VALID',
  });
});

test('only a VALID revalidated revision may become APPROVED_CANONICAL_SCORE', () => {
  const { corrected } = chain();
  const invalid = createRevalidatedRevision(corrected, {
    revision_id: 'revalidated-invalid',
    actor: 'validator',
    timestamp: '2026-09-03T20:06:00.000Z',
    reason: 'Validation found unresolved issues.',
    validation_state: VALIDATION_STATE.INVALID,
    validation_evidence: { code: 'VOICE_CONFLICT_REMAINS' },
    provenance: { validator: 'stage-05-test' },
  });
  assert.throws(
    () => createApprovedCanonicalRevision(invalid, {
      revision_id: 'approved-1',
      actor: 'system',
      timestamp: '2026-09-03T20:07:00.000Z',
      reason: 'Approve canonical score.',
      provenance: { gate: 'approval' },
    }),
    /only a VALID/,
  );

  const valid = createRevalidatedRevision(corrected, {
    revision_id: 'revalidated-valid',
    actor: 'validator',
    timestamp: '2026-09-03T20:06:00.000Z',
    reason: 'Validation passed.',
    validation_state: VALIDATION_STATE.VALID,
    validation_evidence: { status: 'PASS' },
    provenance: { validator: 'stage-05-test' },
  });
  const approved = createApprovedCanonicalRevision(valid, {
    revision_id: 'approved-1',
    actor: 'system',
    timestamp: '2026-09-03T20:07:00.000Z',
    reason: 'Approve canonical score after validation.',
    provenance: { gate: 'stage-05' },
  });

  assert.equal(approved.state, REVISION_STATE.APPROVED_CANONICAL_SCORE);
  assert.equal(approved.validation_state, VALIDATION_STATE.APPROVED);
  assert.equal(approved.original_source, valid.original_source);
  assert.equal(approved.patches, valid.patches);
});

test('revision state transitions are strict and timestamps cannot move backwards', () => {
  const { review, corrected } = chain();
  assert.throws(
    () => createTeacherCorrectedRevision(corrected, correctionMetadata([pitchPatch()])),
    /parent revision must be REVIEW_REVISION/,
  );
  assert.throws(
    () => createRevalidatedRevision(review, {
      revision_id: 'bad-1',
      actor: 'validator',
      timestamp: '2026-09-03T20:06:00.000Z',
      reason: 'invalid transition',
      validation_state: VALIDATION_STATE.VALID,
      validation_evidence: { status: 'PASS' },
      provenance: { test: true },
    }),
    /parent revision must be TEACHER_CORRECTED_REVISION/,
  );
  assert.throws(
    () => createRevalidatedRevision(corrected, {
      revision_id: 'bad-time',
      actor: 'validator',
      timestamp: '2026-09-03T20:04:59.000Z',
      reason: 'invalid chronology',
      validation_state: VALIDATION_STATE.VALID,
      validation_evidence: { status: 'PASS' },
      provenance: { test: true },
    }),
    /must not precede/,
  );
});

test('accessor/proxy-like patch data is rejected instead of executed', () => {
  const before = {};
  Object.defineProperty(before, 'pitch', {
    enumerable: true,
    get() { throw new Error('must not execute'); },
  });
  assert.throws(
    () => normalizePatch({
      ...pitchPatch(),
      before,
    }),
    /enumerable data property/,
  );

  const array = [];
  Object.defineProperty(array, '0', {
    enumerable: true,
    get() { throw new Error('must not execute'); },
  });
  array.length = 1;
  assert.throws(
    () => normalizePatch({
      ...pitchPatch(),
      before: { values: array },
    }),
    /enumerable data property/,
  );
});
