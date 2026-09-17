'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntimeBase');

function recoverableSevenNoteChord() {
  const notes = Array.from({ length: 7 }, (_, index) => `
      <note>
        ${index === 0 ? '' : '<chord/>'}
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>A3 no-loss recovery</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${notes}
      <forward><duration>15</duration></forward>
    </measure>
  </part>
</score-partwise>`;
}

test('A3 upload recovery prefers source-complete arpeggiation before bounded reduction', () => {
  const xml = recoverableSevenNoteChord();
  const result = processMusicXmlUpload({
    fileName: 'a3-seven-note-no-loss.musicxml',
    bytes: Buffer.from(xml),
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.arrangementArtifact.documentType, 'NoLossArpeggiatedGuitarArrangement');
  assert.equal(result.arrangementArtifact.authority, 'PROVISIONAL_REVIEW_ONLY');
  assert.equal(result.arrangementArtifact.sourceNoteCount, 7);
  assert.equal(result.arrangementArtifact.assignedNoteCount, 7);
  assert.equal(result.arrangementArtifact.unassignedNoteCount, 0);
  assert.equal(result.arrangementArtifact.omittedNoteCount, 0);
  assert.equal(result.arrangementArtifact.coverageBasisPoints, 10000);
  assert.equal(result.arrangementArtifact.recovery.transform, 'ARPEGGIATED');
  assert.equal(result.arrangementArtifact.recovery.spreadDivisions, 1);
  assert.equal(result.arrangementArtifact.recovery.targetTimingAuthority, false);

  assert.equal(result.reviewEditableProjection.noteDispositions.length, 7);
  assert.ok(result.reviewEditableProjection.noteDispositions.every(
    (entry) => entry.disposition === 'KEEP',
  ));
  assert.ok(result.reviewEditableProjection.noteDispositions.every(
    (entry) => entry.assignmentEligible === false,
  ));

  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.capabilities.playback, 'APPROXIMATE');
  assert.equal(result.capabilities.export, false);
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
  assert.equal(result.sourceArtifact.rendererMusicXml, xml);
});
