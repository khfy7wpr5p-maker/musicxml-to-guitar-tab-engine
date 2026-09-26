'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  processReviewTabDraftEdit,
} = require('../src/app/reviewTabDraftEditRuntime');


function measureNineReviewScore() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Review</part-name></score-part></part-list>
  <part id="P1">
    <measure number="9">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><type>quarter</type>
      </note>
      <barline location="left">
        <bar-style>regular</bar-style>
        <ending number="1" type="start" default-y="40"></ending>
      </barline>
    </measure>
  </part>
</score-partwise>`);
}

test('EDTAB-03 grants backend-gated assignment authority for a known ReviewTabDraft note', () => {
  const bytes = measureNineReviewScore();
  const result = processMusicXmlUpload({
    fileName: 'edtab-03-measure-nine.musicxml',
    bytes,
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.reviewTabDraft.documentType, 'ReviewTabDraft');
  assert.equal(result.reviewTabDraft.perNoteDisposition[0].sourceEventId, 'P1:measure:0:note:0');
  assert.equal(result.reviewTabDraft.perNoteDisposition[0].disposition, 'UNASSIGNED');
  assert.equal(result.reviewTabDraft.capabilities.assignStringFret, true);
  assert.equal(result.capabilities.assignTabPosition, true);
  assert.equal(result.capabilities.export, false);
});

test('EDTAB-03 exposes a bounded ReviewTabDraft edit runtime', () => {
  const runtime = require('../src/app/reviewTabDraftEditRuntime');
  assert.equal(typeof runtime.processReviewTabDraftEdit, 'function');
  assert.equal(runtime.REVIEW_TAB_DRAFT_EDIT_RUNTIME_VERSION, '1.0.0');
});

test('EDTAB-03 assigns an exact teacher position while remaining review-only', () => {
  const bytes = measureNineReviewScore();
  const upload = processMusicXmlUpload({
    fileName: 'edtab-03-measure-nine.musicxml',
    bytes,
  });
  const sourceEventId = 'P1:measure:0:note:0';
  const result = processReviewTabDraftEdit({
    fileName: 'edtab-03-measure-nine.musicxml',
    bytes,
    expectedInputSha256: upload.input.sha256,
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [{
      sourceEventId,
      selectedPosition: { string: 1, fret: 0 },
    }],
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.capabilities.export, false);
  assert.equal(result.capabilities.assignTabPosition, true);
  assert.equal(result.revision.revisionNumber, 1);
  assert.match(result.revision.revisionId, /:r1:/);
  const assigned = result.reviewTabDraft.perNoteDisposition.find(
    (entry) => entry.sourceEventId === sourceEventId,
  );
  assert.equal(assigned.disposition, 'ASSIGNED');
  assert.deepEqual(assigned.selectedPosition, { string: 1, fret: 0 });
  assert.equal(result.reviewTabDraft.renderModel.measures[0].events[0].displayToken, '0');
  assert.equal(result.reviewTabDraft.renderModel.measures[0].events[0].string, 1);

  const replayed = processReviewTabDraftEdit({
    fileName: 'edtab-03-measure-nine.musicxml',
    bytes,
    expectedInputSha256: upload.input.sha256,
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [{
      sourceEventId,
      selectedPosition: { string: 1, fret: 0 },
    }],
  });
  assert.deepEqual(result, replayed);
});

test('EDTAB-03 rejects a string/fret that does not reproduce source pitch', () => {
  const bytes = measureNineReviewScore();
  const upload = processMusicXmlUpload({
    fileName: 'edtab-03-wrong-pitch.musicxml',
    bytes,
  });
  const result = processReviewTabDraftEdit({
    fileName: 'edtab-03-wrong-pitch.musicxml',
    bytes,
    expectedInputSha256: upload.input.sha256,
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [{
      sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 2, fret: 0 },
    }],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'REVIEW_DRAFT_POSITION_PITCH_MISMATCH');
  assert.match(result.preflight.issues[0].message, /does not reproduce/i);
});

test('EDTAB-03 rejects simultaneous assignments that collide on one string', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Collision</part-name></score-part></part-list>
  <part id="P1">
    <measure number="9">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type></note>
      <barline location="left"><bar-style>regular</bar-style><ending number="1" type="start" default-y="40"></ending></barline>
    </measure>
  </part>
</score-partwise>`);
  const upload = processMusicXmlUpload({
    fileName: 'edtab-03-collision.musicxml',
    bytes,
  });
  const result = processReviewTabDraftEdit({
    fileName: 'edtab-03-collision.musicxml',
    bytes,
    expectedInputSha256: upload.input.sha256,
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [
      {
        sourceEventId: 'P1:measure:0:note:0',
        selectedPosition: { string: 1, fret: 0 },
      },
      {
        sourceEventId: 'P1:measure:0:note:1',
        selectedPosition: { string: 1, fret: 1 },
      },
    ],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'REVIEW_DRAFT_STRING_COLLISION');
  assert.match(result.preflight.issues[0].message, /same guitar string/i);
});

test('EDTAB-03 empty replay provides deterministic undo to the source-bound base draft', () => {
  const bytes = measureNineReviewScore();
  const upload = processMusicXmlUpload({
    fileName: 'edtab-03-undo.musicxml',
    bytes,
  });
  const undone = processReviewTabDraftEdit({
    fileName: 'edtab-03-undo.musicxml',
    bytes,
    expectedInputSha256: upload.input.sha256,
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [],
  });

  assert.equal(undone.status, 'REVIEW_REQUIRED');
  assert.equal(undone.revision.revisionNumber, 0);
  assert.equal(undone.revision.revisionId, upload.reviewTabDraft.revisionId);
  assert.equal(undone.reviewTabDraft.perNoteDisposition[0].disposition, 'UNASSIGNED');
  assert.equal(undone.reviewTabDraft.perNoteDisposition[0].selectedPosition, null);
  assert.equal(undone.reviewTabDraft.perNoteDisposition[0].sourceEventId, 'P1:measure:0:note:0');
});

test('EDTAB-03 runtime host and workbench expose a dedicated review-draft edit path', () => {
  const hostAdapters = fs.readFileSync(
    path.resolve(__dirname, '../web/guitar-tab-workbench/host-adapters.js'),
    'utf8',
  );
  const workbench = fs.readFileSync(
    path.resolve(__dirname, '../web/guitar-tab-workbench/workbench.js'),
    'utf8',
  );
  const runtimeHost = fs.readFileSync(
    path.resolve(__dirname, '../src/app/runtimeHttpHost.js'),
    'utf8',
  );

  assert.match(hostAdapters, /reviewTabDraftEdit/);
  assert.match(hostAdapters, /\/edit\/review-tab-draft/);
  assert.match(workbench, /reviewTabDraftEdit/);
  assert.match(workbench, /undoReviewDraftEdit/);
  assert.match(workbench, /redoReviewDraftEdit/);
  assert.match(runtimeHost, /\/api\/edit\/review-tab-draft/);
});
