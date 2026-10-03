'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyEdtab04PositionParity } = require('../src/app/edtab04cPositionParity');

const sha = 'a'.repeat(64);
const correctedSha = 'b'.repeat(64);
const pitch = { step: 'E', alter: 0, octave: 4, midi: 64 };
const tuning = [
  { number: 1, pitch: 'E4', midi: 64 }, { number: 2, pitch: 'B3', midi: 59 },
  { number: 3, pitch: 'G3', midi: 55 }, { number: 4, pitch: 'D3', midi: 50 },
  { number: 5, pitch: 'A2', midi: 45 }, { number: 6, pitch: 'E2', midi: 40 },
];

function caseData() {
  const id = 'P1:measure:0:note:0';
  const selectedPosition = { string: 1, fret: 0 };
  return {
    binding: {
      status: 'BOUND_FOR_REVALIDATION', sourceSha256: sha,
      baseRevisionId: 'base', draftRevisionId: 'draft', correctedRevisionId: 'corrected',
      canonicalAuthority: false, export: false,
    },
    draft: {
      status: 'REVIEW_REQUIRED', input: { sha256: sha },
      revision: {
        baseRevisionId: 'base', revisionId: 'draft',
        appliedEdits: [{ commandType: 'SET_REVIEW_TAB_DRAFT_POSITION', sourceEventId: id,
          selectedPosition }],
      },
      reviewTabDraft: { guitarConfiguration: {
        tuning, minimumFret: 0, maximumFret: 20, capoFret: 0,
      } },
      sourceReviewIndex: { entries: [{
        eventKind: 'PITCHED_NOTE', sourceUploadSha256: sha,
        selectedPartId: 'P1', sourceEventId: id, knownPitchOrNull: pitch,
        knownOnsetOrNull: 0, knownDurationOrNull: 4,
        evidenceLocation: { measureIndex: 0, sourceOrder: 0, voice: '1', staff: 1 },
      }] },
    },
    session: { revalidated_revision: {
      revision_id: 'corrected', original_source: { source_id: 'source' },
      patches: [{ edit_class: 'PITCH_UPDATE', target_event: 'P1:measure:0:note:1' }],
    } },
    stage08Result: {
      status: 'PASS', route: 'POLY_V2', reentry: { status: 'PASS', route: 'POLY_V2' },
      sourceIdentity: { sha256: sha, correctedSha256: correctedSha },
      approvalEvidence: {
        source_id: 'source', revalidated_revision_id: 'corrected',
        corrected_sha256: correctedSha, reentry_status: 'PASS', route: 'POLY_V2',
      },
      musicXml: '<score-partwise/>',
      canonicalTabResult: {
        documentType: 'CanonicalTabResult', schemaVersion: '2.0.0',
        source: { partId: 'P1' },
        guitar: { tuning: tuning.map((entry) => ({ ...entry })), minimumFret: 0, maximumFret: 20 },
        measures: [{ events: [{
          sourceEventId: id, type: 'note',
          source: { partId: 'P1', measureIndex: 0, noteIndex: 0 },
          pitch, voice: '1', staff: 1, onsetDivisions: 0, durationDivisions: 4,
        }] }],
        noteDispositions: [{
          sourceEventId: id, disposition: 'KEEP', octaveShiftSemitones: 0,
          targetPitch: pitch, selectedPosition,
        }],
      },
    },
  };
}

test('04C evidence matches an unchanged note and exact teacher-selected position without approval', () => {
  const result = verifyEdtab04PositionParity(caseData());
  assert.equal(result.status, 'MATCHED_FOR_REVIEW');
  assert.equal(result.matchedCount, 1);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.export, false);
});

test('04C abstains if canonical solver chose another valid string or omitted the note', () => {
  const different = caseData();
  different.stage08Result.canonicalTabResult.noteDispositions[0].selectedPosition = { string: 2, fret: 5 };
  assert.equal(verifyEdtab04PositionParity(different).code, 'TEACHER_POSITION_NOT_IN_CANONICAL');
  const omitted = caseData();
  omitted.stage08Result.canonicalTabResult.noteDispositions[0].disposition = 'OMIT';
  assert.equal(verifyEdtab04PositionParity(omitted).status, 'ABSTAIN');
});

test('04C abstains on pitch, timing, voice, or identity drift and patch overlap', () => {
  for (const mutate of [
    (data) => { data.stage08Result.canonicalTabResult.measures[0].events[0].pitch = { ...pitch, midi: 65 }; },
    (data) => { data.stage08Result.canonicalTabResult.measures[0].events[0].onsetDivisions = 4; },
    (data) => { data.stage08Result.canonicalTabResult.measures[0].events[0].voice = '2'; },
    (data) => { data.stage08Result.canonicalTabResult.measures[0].events[0].source.noteIndex = 1; },
    (data) => { data.session.revalidated_revision.patches[0].target_event = 'P1:measure:0:note:0'; },
  ]) {
    const data = caseData();
    mutate(data);
    assert.equal(verifyEdtab04PositionParity(data).status, 'ABSTAIN');
  }
});

test('04C abstains on stale revision, non-PASS, or changed guitar configuration', () => {
  for (const mutate of [
    (data) => { data.binding.draftRevisionId = 'other'; },
    (data) => { data.stage08Result.status = 'REVIEW_REQUIRED'; },
    (data) => { data.stage08Result.canonicalTabResult.guitar.tuning[0] = { number: 1, pitch: 'D4', midi: 62 }; },
  ]) {
    const data = caseData();
    mutate(data);
    assert.equal(verifyEdtab04PositionParity(data).status, 'ABSTAIN');
  }
});

test('04C returns abstention for malformed nested evidence instead of throwing', () => {
  for (const mutate of [
    (data) => { data.draft.revision.appliedEdits = [null]; },
    (data) => { data.session.revalidated_revision.patches = [null]; },
    (data) => { data.draft.sourceReviewIndex.entries = [null]; },
    (data) => { data.stage08Result.canonicalTabResult.measures = [null]; },
    (data) => { data.stage08Result.canonicalTabResult.measures[0].events = [null]; },
    (data) => { data.stage08Result.canonicalTabResult.noteDispositions = [null]; },
    (data) => { data.stage08Result.canonicalTabResult.guitar.tuning[0] = null; },
    (data) => { data.stage08Result.canonicalTabResult.measures[0].events[0].source = null; },
  ]) {
    const data = caseData();
    mutate(data);
    assert.equal(verifyEdtab04PositionParity(data).status, 'ABSTAIN');
  }
});
