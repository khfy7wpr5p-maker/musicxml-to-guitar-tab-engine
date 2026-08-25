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

test('UI-07 keeps retained POLY_V2 ties fail-closed at deterministic final selection', () => {
  const result = processMusicXmlUpload({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: retainedTieFixture,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.preflight.issues.length, 1);
  assert.equal(
    result.preflight.issues[0].code,
    'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION',
  );
  assert.equal(result.preflight.issues[0].details.reason, 'RETAINED_TIE_NOT_SUPPORTED');
  assert.match(
    result.preflight.issues[0].message,
    /separately versioned sustained-sonority selector/i,
  );
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
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.revision.revisionNumber, 1);
  assert.equal(result.revision.appliedEdits[0].commandType, 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH');

  const editedMeasure = result.canonicalTabResult.measures[0];
  const editedTarget = editedMeasure.events.find((event) => event.sourceEventId === target.sourceEventId);
  const preservedPeer = editedMeasure.events.find((event) => event.sourceEventId === peer.sourceEventId);
  assert.equal(editedTarget.pitch.written, 'D4');
  assert.equal(preservedPeer.pitch.written, 'C4');
});
