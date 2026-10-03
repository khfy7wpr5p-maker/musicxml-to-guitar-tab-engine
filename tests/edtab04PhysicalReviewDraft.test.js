'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const { processReviewTabDraftEdit } = require('../src/app/reviewTabDraftEditRuntime');

const fileName = 'physical-review.musicxml';
const original = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Physical review</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
<backup><duration>16</duration></backup>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>
</measure></part></score-partwise>`);

test('physical-point review yields an editable evidence-bound draft but no canonical authority', () => {
  const before = Buffer.from(original);
  const upload = processMusicXmlUpload({ fileName, bytes: original });
  assert.equal(upload.status, 'REVIEW_REQUIRED');
  assert.equal(upload.route, 'POLY_V2');
  assert.ok(upload.preflight.issues.some((issue) => (
    issue.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
      && issue.details?.reason === 'UNPLAYABLE_PHYSICAL_POINT'
  )), JSON.stringify(upload.preflight.issues.map((issue) => ({ code: issue.code,
    reason: issue.details?.reason, category: issue.category }))));
  assert.equal(upload.reviewTabDraft?.documentType, 'ReviewTabDraft');
  assert.equal(upload.sourceReviewIndex?.entries.length, 2);
  const edited = processReviewTabDraftEdit({
    fileName, bytes: original,
    expectedInputSha256: crypto.createHash('sha256').update(original).digest('hex'),
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [{ sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 1, fret: 17 } }],
  });
  assert.equal(edited.status, 'REVIEW_REQUIRED');
  assert.equal(edited.reviewTabDraft.perNoteDisposition[0].disposition, 'ASSIGNED');
  assert.equal(edited.capabilities.export, false);
  assert.equal(edited.canonicalTabResult, null);
  assert.deepEqual(original, before);
});
