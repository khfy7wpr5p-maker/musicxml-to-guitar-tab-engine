'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION,
  processMusicXmlPolyphonicNoteEditV2,
} = require('../src/app/musicXmlPolyphonicNoteEditRuntimeV2');

const retainedTieFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/ui07-poly-unison-tie.musicxml'),
);
const unisonFixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/ui07-poly-unison.musicxml'),
);

test('UI-07 routes retained POLY_V2 ties through sustained canonical selection', () => {
  const result = processMusicXmlUpload({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  const tieSegments = result.canonicalTabResult.noteDispositions.filter((entry) => (
    entry.sourceEventId === 'P1:measure:0:note:0'
    || entry.sourceEventId === 'P1:measure:1:note:0'
  ));
  assert.equal(tieSegments.length, 2);
  assert.deepEqual(tieSegments[0].selectedPosition, tieSegments[1].selectedPosition);
  assert.match(result.musicXml, /<tie type="start"\/>/);
  assert.match(result.musicXml, /<tie type="stop"\/>/);
});

test('R7 atomically edits every segment of an acknowledged POLY_V2 tie chain', () => {
  const originalBytes = Buffer.from(retainedTieFixture);
  const upload = processMusicXmlUpload({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
  });
  const first = upload.canonicalTabResult.measures[0].events.find(
    (event) => event.sourceEventId === 'P1:measure:0:note:0',
  );
  const group = upload.canonicalTabResult.simultaneousGroups.find(
    (entry) => entry.sourceEventIds.includes(first.sourceEventId),
  );
  const sourceTieEventIds = [
    'P1:measure:0:note:0',
    'P1:measure:1:note:0',
  ];

  const request = {
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
    expectedInputSha256: upload.input.sha256,
    commands: [{
      measureIndex: 0,
      sourceOrder: first.sourceOrder,
      sourceEventId: first.sourceEventId,
      sourceGroupId: group.groupId,
      sourceGroupEventIds: [...group.sourceEventIds],
      sourceTieEventIds,
      pitch: { step: 'D', alter: 0, octave: 4 },
    }],
  };
  const result = processMusicXmlPolyphonicNoteEditV2(request);
  const repeated = processMusicXmlPolyphonicNoteEditV2(request);

  assert.equal(result.status, 'PASS');
  assert.deepEqual(repeated, result);
  assert.deepEqual(retainedTieFixture, originalBytes);
  assert.equal(result.revision.appliedEdits[0].commandType, 'REPLACE_POLYPHONIC_TIE_CHAIN_PITCH');
  assert.equal(result.revision.appliedEdits[0].affectedEventCount, 2);
  assert.deepEqual(result.revision.appliedEdits[0].sourceTieEventIds, sourceTieEventIds);
  const editedSegments = result.canonicalTabResult.measures.flatMap(
    (measure) => measure.events.filter((event) => sourceTieEventIds.includes(event.sourceEventId)),
  );
  assert.deepEqual(editedSegments.map((event) => event.pitch.written), ['D4', 'D4']);
  const positions = sourceTieEventIds.map((sourceEventId) => (
    result.canonicalTabResult.noteDispositions.find(
      (entry) => entry.sourceEventId === sourceEventId,
    ).selectedPosition
  ));
  assert.deepEqual(positions[0], positions[1]);
  assert.match(result.musicXml, /<tie type="start"\/>/);
  assert.match(result.musicXml, /<tie type="stop"\/>/);
});

test('R7 rejects an incomplete POLY_V2 tie-chain acknowledgement', () => {
  const upload = processMusicXmlUpload({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
  });
  const first = upload.canonicalTabResult.measures[0].events.find(
    (event) => event.sourceEventId === 'P1:measure:0:note:0',
  );
  const group = upload.canonicalTabResult.simultaneousGroups.find(
    (entry) => entry.sourceEventIds.includes(first.sourceEventId),
  );
  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
    expectedInputSha256: upload.input.sha256,
    commands: [{
      measureIndex: 0,
      sourceOrder: first.sourceOrder,
      sourceEventId: first.sourceEventId,
      sourceGroupId: group.groupId,
      sourceGroupEventIds: [...group.sourceEventIds],
      sourceTieEventIds: ['P1:measure:0:note:0'],
      pitch: { step: 'D', alter: 0, octave: 4 },
    }],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'EDIT_SOURCE_TIE_CHAIN_IDENTITY_MISMATCH');
});

test('R7 keeps tied duration edits closed until an atomic duration contract exists', () => {
  const upload = processMusicXmlUpload({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
  });
  const first = upload.canonicalTabResult.measures[0].events.find(
    (event) => event.sourceEventId === 'P1:measure:0:note:0',
  );
  const group = upload.canonicalTabResult.simultaneousGroups.find(
    (entry) => entry.sourceEventIds.includes(first.sourceEventId),
  );
  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
    expectedInputSha256: upload.input.sha256,
    commands: [{
      measureIndex: 0,
      sourceOrder: first.sourceOrder,
      sourceEventId: first.sourceEventId,
      sourceGroupId: group.groupId,
      sourceGroupEventIds: [...group.sourceEventIds],
      sourceTieEventIds: ['P1:measure:0:note:0', 'P1:measure:1:note:0'],
      pitch: { step: 'C', alter: 0, octave: 4 },
      durationDivisions: 2,
    }],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'EDIT_TIE_CHAIN_OPERATION_NOT_SUPPORTED');
  assert.equal(result.input.sha256, upload.input.sha256);
});

test('UI-07 untied unison keeps exact source identity and edits only the acknowledged peer', () => {
  const upload = processMusicXmlUpload({
    fileName: 'ui07-poly-unison.musicxml',
    bytes: unisonFixture,
  });
  assert.equal(upload.status, 'PASS');
  assert.equal(upload.route, 'POLY_V2');

  const measure = upload.canonicalTabResult.measures[0];
  const notes = measure.events.filter((event) => event.type === 'note');
  assert.equal(notes.length, 2);
  assert.equal(notes[0].pitch.written, 'C4');
  assert.equal(notes[1].pitch.written, 'C4');
  assert.notEqual(notes[0].sourceEventId, notes[1].sourceEventId);
  assert.notEqual(String(notes[0].voice), String(notes[1].voice));

  const target = notes.find((event) => String(event.voice) === '2');
  const peer = notes.find((event) => String(event.voice) === '1');
  assert.ok(target && peer);
  const group = upload.canonicalTabResult.simultaneousGroups.find(
    (entry) => entry.sourceEventIds.includes(target.sourceEventId),
  );
  assert.ok(group);
  assert.deepEqual(new Set(group.sourceEventIds), new Set([target.sourceEventId, peer.sourceEventId]));

  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'ui07-poly-unison.musicxml',
    bytes: unisonFixture,
    expectedInputSha256: upload.input.sha256,
    commands: [{
      measureIndex: 0,
      sourceOrder: target.sourceOrder,
      sourceEventId: target.sourceEventId,
      sourceGroupId: group.groupId,
      sourceGroupEventIds: [...group.sourceEventIds],
      pitch: { step: 'D', alter: 0, octave: 4 },
    }],
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.contractVersion, MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION);
  assert.equal(result.contractVersion, '1.3.0');
  assert.equal(result.revision.revisionNumber, 1);
  assert.equal(result.revision.appliedEdits[0].commandType, 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH');

  const editedMeasure = result.canonicalTabResult.measures[0];
  const editedTarget = editedMeasure.events.find((event) => event.sourceEventId === target.sourceEventId);
  const preservedPeer = editedMeasure.events.find((event) => event.sourceEventId === peer.sourceEventId);
  assert.equal(editedTarget.pitch.written, 'D4');
  assert.equal(preservedPeer.pitch.written, 'C4');
});
