'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  processMusicXmlPolyphonicNoteEditV2,
} = require('../src/app/musicXmlPolyphonicNoteEditRuntimeV2');

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
  <part-list><score-part id="P1"><part-name>A3 edit recovery</part-name></score-part></part-list>
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

test('A3 teacher edit preserves no-loss arpeggiation recovery instead of degrading to reduction', () => {
  const xml = recoverableSevenNoteChord();
  const bytes = Buffer.from(xml);
  const upload = processMusicXmlUpload({
    fileName: 'a3-edit-no-loss.musicxml',
    bytes,
  });

  assert.equal(upload.status, 'REVIEW_REQUIRED');
  assert.equal(upload.arrangementArtifact.documentType, 'NoLossArpeggiatedGuitarArrangement');
  assert.equal(upload.arrangementArtifact.sourceNoteCount, 7);
  assert.equal(upload.arrangementArtifact.omittedNoteCount, 0);

  const firstMeasure = upload.reviewEditableProjection.measures[0];
  const firstNote = firstMeasure.events.find((event) => event.type === 'note');
  const group = upload.reviewEditableProjection.simultaneousGroups.find(
    (entry) => entry.sourceEventIds.includes(firstNote.sourceEventId),
  );
  assert.ok(group);

  const edited = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'a3-edit-no-loss.musicxml',
    bytes,
    expectedInputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    commands: [{
      measureIndex: firstMeasure.index,
      sourceOrder: firstNote.sourceOrder,
      sourceEventId: firstNote.sourceEventId,
      sourceGroupId: group.groupId,
      sourceGroupEventIds: [...group.sourceEventIds],
      pitch: { step: 'F', alter: 0, octave: 4 },
    }],
  });

  assert.equal(edited.status, 'REVIEW_REQUIRED');
  assert.equal(edited.route, 'POLY_V2');
  assert.equal(edited.canonicalTabResult, null);
  assert.equal(edited.arrangementArtifact.documentType, 'NoLossArpeggiatedGuitarArrangement');
  assert.equal(edited.arrangementArtifact.sourceNoteCount, 7);
  assert.equal(edited.arrangementArtifact.assignedNoteCount, 7);
  assert.equal(edited.arrangementArtifact.unassignedNoteCount, 0);
  assert.equal(edited.arrangementArtifact.omittedNoteCount, 0);
  assert.equal(edited.arrangementArtifact.coverageBasisPoints, 10000);
  assert.equal(edited.arrangementArtifact.recovery.transform, 'ARPEGGIATED');
  assert.equal(edited.reviewEditableProjection.noteDispositions.length, 7);
  assert.ok(edited.reviewEditableProjection.noteDispositions.every(
    (entry) => entry.disposition === 'KEEP',
  ));
  assert.equal(edited.capabilities.generateTab, true);
  assert.equal(edited.capabilities.playback, 'APPROXIMATE');
  assert.equal(edited.capabilities.export, false);
  assert.match(edited.musicXml, /<sign>TAB<\/sign>/);
  assert.equal(edited.revision.appliedEdits.length, 1);
  assert.equal(edited.revision.appliedEdits[0].afterPitch.written, 'F4');
});
