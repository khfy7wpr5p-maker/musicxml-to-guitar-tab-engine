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

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/ui07-poly-unison-tie.musicxml'));

function uploaded() {
  const result = processMusicXmlUpload({ fileName: 'ui07-poly-unison-tie.musicxml', bytes: fixture });
  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  return result;
}

function identity(result) {
  const canonical = result.canonicalTabResult;
  const firstMeasure = canonical.measures[0];
  const secondMeasure = canonical.measures[1];
  const target = firstMeasure.events.find((event) => event.type === 'note' && event.voice === '1');
  const continuation = secondMeasure.events.find((event) => event.type === 'note' && event.voice === '1');
  const unisonPeer = firstMeasure.events.find((event) => event.type === 'note' && event.voice === '2');
  assert.ok(target && continuation && unisonPeer);
  assert.equal(target.pitch.written, 'C4');
  assert.equal(unisonPeer.pitch.written, 'C4');
  assert.equal(target.tieStart, true);
  assert.equal(continuation.tieStop, true);
  const group = canonical.simultaneousGroups.find((entry) => entry.sourceEventIds.includes(target.sourceEventId));
  assert.ok(group);
  return { target, continuation, unisonPeer, group };
}

function commandFor(result, sourceTieEventIds) {
  const { target, group } = identity(result);
  return {
    measureIndex: 0,
    sourceOrder: target.sourceOrder,
    sourceEventId: target.sourceEventId,
    sourceGroupId: group.groupId,
    sourceGroupEventIds: [...group.sourceEventIds],
    sourceTieEventIds,
    pitch: { step: 'D', alter: 0, octave: 4 },
  };
}

test('UI-07 requires exact tie-chain identity for a tied POLY_V2 source edit', () => {
  const upload = uploaded();
  const { continuation } = identity(upload);
  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: fixture,
    expectedInputSha256: upload.input.sha256,
    commands: [commandFor(upload, [continuation.sourceEventId])],
  });

  assert.equal(
    result.status,
    'BLOCKED',
    `Expected wrong/incomplete tie identity to fail closed; revision=${JSON.stringify(result.revision)}`,
  );
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.preflight.issues.length, 1);
  assert.equal(result.preflight.issues[0].code, 'EDIT_SOURCE_TIE_IDENTITY_MISMATCH');
});

test('UI-07 atomically edits the complete acknowledged POLY_V2 tie chain and preserves its unison peer', () => {
  const upload = uploaded();
  const { target, continuation, unisonPeer } = identity(upload);
  const tieIds = [target.sourceEventId, continuation.sourceEventId];
  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: fixture,
    expectedInputSha256: upload.input.sha256,
    commands: [commandFor(upload, tieIds)],
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.contractVersion, MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION);
  assert.equal(result.revision.revisionNumber, 1);
  assert.deepEqual(result.revision.commands[0].sourceTieEventIds, tieIds);
  assert.equal(result.revision.appliedEdits[0].commandType, 'REPLACE_POLYPHONIC_TIE_CHAIN_PITCH');
  assert.equal(result.revision.appliedEdits[0].affectedEventCount, 2);
  assert.deepEqual(
    result.revision.appliedEdits[0].affectedEvents.map((entry) => entry.sourceEventId),
    tieIds,
  );

  const editedFirst = result.canonicalTabResult.measures[0].events.find(
    (event) => event.sourceEventId === target.sourceEventId,
  );
  const editedContinuation = result.canonicalTabResult.measures[1].events.find(
    (event) => event.sourceEventId === continuation.sourceEventId,
  );
  const preservedPeer = result.canonicalTabResult.measures[0].events.find(
    (event) => event.sourceEventId === unisonPeer.sourceEventId,
  );
  assert.equal(editedFirst.pitch.written, 'D4');
  assert.equal(editedContinuation.pitch.written, 'D4');
  assert.equal(preservedPeer.pitch.written, 'C4');
  assert.equal(editedFirst.tieStart, true);
  assert.equal(editedContinuation.tieStop, true);
});

test('UI-07 keeps legacy untied POLY_V2 commands backward compatible when tie identity is omitted', () => {
  const upload = uploaded();
  const { unisonPeer, group } = identity(upload);
  const command = {
    measureIndex: 0,
    sourceOrder: unisonPeer.sourceOrder,
    sourceEventId: unisonPeer.sourceEventId,
    sourceGroupId: group.groupId,
    sourceGroupEventIds: [...group.sourceEventIds],
    pitch: { step: 'E', alter: 0, octave: 4 },
  };
  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'ui07-poly-unison-tie.musicxml',
    bytes: fixture,
    expectedInputSha256: upload.input.sha256,
    commands: [command],
  });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.revision.commands[0].sourceTieEventIds, [unisonPeer.sourceEventId]);
  assert.equal(result.revision.appliedEdits[0].commandType, 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH');
  assert.equal(result.revision.appliedEdits[0].affectedEventCount, 1);
});
