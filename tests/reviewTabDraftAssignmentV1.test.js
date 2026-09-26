'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

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
