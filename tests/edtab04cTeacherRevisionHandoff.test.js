'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { assessEdtab04TeacherRevision } = require('../src/app/edtab04cTeacherRevisionHandoff');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  EDIT_CLASS, VALIDATION_STATE, createOriginalSourceSnapshot,
  createReviewRevision, createTeacherCorrectedRevision, createRevalidatedRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE, SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');

const fileName = 'teacher-review.musicxml';
const original = fs.readFileSync(path.join(__dirname, 'fixtures/edtab-03-review-draft.musicxml'));
const sourceSha = crypto.createHash('sha256').update(original).digest('hex');
const initial = processMusicXmlUpload({ fileName, bytes: original });
assert.equal(initial.status, 'REVIEW_REQUIRED');

function session(patches = [{
  patch_id: 'pitch-1', edit_class: EDIT_CLASS.PITCH_UPDATE,
  target_event: 'P1:measure:0:note:1',
  before: { step: 'C', alter: 0, octave: 4 },
  after: { step: 'D', alter: 0, octave: 4 },
}], sourceBytes = original) {
  const digest = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  const source = createOriginalSourceSnapshot({
    source_id: 'teacher-source', byte_length: sourceBytes.length, sha256: digest,
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: { producer: 'review-test' },
  });
  const review = createReviewRevision(source, {
    revision_id: 'teacher-review', actor: 'teacher',
    timestamp: '2026-10-03T01:00:00.000Z', reason: 'Review source',
    provenance: 'test', review_evidence: { status: 'REVIEW_REQUIRED', canOpenForReview: true },
  });
  const saved = createTeacherCorrectedRevision(review, {
    revision_id: 'teacher-corrected', actor: 'teacher',
    timestamp: '2026-10-03T01:01:00.000Z', reason: 'Pitch correction',
    provenance: 'test', patches,
  });
  const revalidated = createRevalidatedRevision(saved, {
    revision_id: 'teacher-revalidated', actor: 'validator',
    timestamp: '2026-10-03T01:02:00.000Z', reason: 'Validation',
    provenance: 'test', validation_state: VALIDATION_STATE.VALID,
    validation_evidence: { result: 'VALID' },
  });
  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    phase: SESSION_PHASE.REVALIDATED,
    saved_revision: saved, revalidated_revision: revalidated,
  };
}

function request(overrides = {}) {
  return {
    fileName, originalSourceBytes: Buffer.from(original),
    expectedInputSha256: sourceSha,
    baseRevisionId: initial.reviewTabDraft.revisionId,
    commands: [{ sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 1, fret: 0 } }],
    session: session(),
    approvalMetadata: {
      revision_id: 'teacher-approved', actor: 'teacher',
      timestamp: '2026-10-03T01:03:00.000Z', reason: 'Review', provenance: 'test',
    },
    ...overrides,
  };
}

test('04C2 replays a real REVIEW_REQUIRED draft but withholds authority when pitch correction does not cure ending review', () => {
  const input = request();
  const before = Buffer.from(input.originalSourceBytes);
  const first = assessEdtab04TeacherRevision(input);
  const second = assessEdtab04TeacherRevision(input);
  assert.equal(first.status, 'ABSTAIN');
  assert.equal(first.code, 'STAGE08_PASS_NOT_PROVEN');
  assert.deepEqual(first, second);
  assert.deepEqual(input.originalSourceBytes, before);
  assert.equal(first.canonicalAuthority, false);
  assert.equal(first.export, false);
  assert.equal(first.canonicalTabResult, undefined);
});

test('04C2 rejects stale source identity and an unsupported semantic edit', () => {
  assert.equal(assessEdtab04TeacherRevision(request({
    originalSourceBytes: Buffer.concat([original, Buffer.from('\n')]),
  })).code, 'SOURCE_IDENTITY_MISMATCH');
  const unsupported = session([{
    patch_id: 'duration-1', edit_class: EDIT_CLASS.DURATION_UPDATE,
    target_event: 'P1:measure:0:note:1',
    before: { duration: 4 }, after: { duration: 8 },
  }]);
  const result = assessEdtab04TeacherRevision(request({ session: unsupported }));
  assert.equal(result.status, 'ABSTAIN');
  assert.equal(result.code, 'MATERIALIZATION_FAILED');
  assert.equal(result.export, false);
});

test('04C2 does not treat a PASS source as an editable teacher review draft', () => {
  const pass = fs.readFileSync(path.join(__dirname, 'fixtures/pa12-polyphonic-e2e.musicxml'));
  const digest = crypto.createHash('sha256').update(pass).digest('hex');
  const result = assessEdtab04TeacherRevision(request({
    originalSourceBytes: pass, expectedInputSha256: digest,
  }));
  assert.equal(result.status, 'ABSTAIN');
  assert.equal(result.canonicalAuthority, false);
});

test('04C2 accepts a corrected physical unison only if the teacher position survives ordinary PASS', () => {
  const physical = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Physical review</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
<backup><duration>16</duration></backup>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>
</measure></part></score-partwise>`);
  const upload = processMusicXmlUpload({ fileName, bytes: physical });
  assert.equal(upload.status, 'REVIEW_REQUIRED');
  assert.ok(upload.reviewTabDraft);
  const digest = crypto.createHash('sha256').update(physical).digest('hex');
  const patches = [{
    patch_id: 'physical-pitch-1', edit_class: EDIT_CLASS.PITCH_UPDATE,
    target_event: 'P1:measure:0:note:1',
    before: { step: 'A', alter: 0, octave: 5 },
    after: { step: 'C', alter: 0, octave: 5 },
  }];
  const result = assessEdtab04TeacherRevision(request({
    originalSourceBytes: physical, expectedInputSha256: digest,
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [{ sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 1, fret: 17 } }],
    session: session(patches, physical),
  }));
  assert.equal(result.status, 'MATCHED_FOR_REVIEW');
  assert.equal(result.matchedCount, 1);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.export, false);
});
