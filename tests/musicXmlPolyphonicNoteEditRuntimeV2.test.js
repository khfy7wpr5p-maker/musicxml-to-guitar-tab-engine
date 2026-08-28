'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS,
  MusicXmlPolyphonicNoteEditRuntimeV2Error,
  processMusicXmlPolyphonicNoteEditV2,
} = require('../src/app/musicXmlPolyphonicNoteEditRuntimeV2');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sourceEventId(measureIndex, sourceOrder) {
  return `P1:measure:${measureIndex}:note:${sourceOrder}`;
}

function groupId(measureIndex, onsetDivisions) {
  return `P1:measure:${measureIndex}:simultaneous:${onsetDivisions}`;
}

function command({
  measureIndex = 0,
  sourceOrder,
  onsetDivisions,
  groupSourceOrders,
  step,
  alter = 0,
  octave,
}) {
  return {
    measureIndex,
    sourceOrder,
    sourceEventId: sourceEventId(measureIndex, sourceOrder),
    sourceGroupId: groupSourceOrders.length > 1 ? groupId(measureIndex, onsetDivisions) : null,
    sourceGroupEventIds: groupSourceOrders.map((order) => sourceEventId(measureIndex, order)),
    pitch: { step, alter, octave },
  };
}

function request(bytes, commands, overrides = {}) {
  return {
    fileName: 'poly.musicxml',
    bytes,
    expectedInputSha256: sha256(bytes),
    commands,
    ...overrides,
  };
}

function disposition(result, id) {
  return result.canonicalTabResult.noteDispositions.find((entry) => entry.sourceEventId === id);
}

test('POLY_V2 structured edit changes one acknowledged simultaneous-group member and regenerates TAB', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const edit = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 4],
    step: 'E',
    octave: 4,
  });

  const result = processMusicXmlPolyphonicNoteEditV2(request(bytes, [edit]));

  assert.equal(result.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.PASS);
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.input.sha256, sha256(bytes));
  assert.equal(result.revision.revisionNumber, 1);
  assert.equal(result.revision.appliedEdits[0].commandType, 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH');
  assert.equal(result.revision.appliedEdits[0].sourceEventId, sourceEventId(0, 0));
  assert.equal(result.revision.appliedEdits[0].sourceGroupId, groupId(0, 0));
  assert.deepEqual(
    result.revision.appliedEdits[0].sourceGroupEventIds,
    [sourceEventId(0, 0), sourceEventId(0, 4)],
  );
  assert.equal(result.revision.appliedEdits[0].beforePitch.written, 'C4');
  assert.equal(result.revision.appliedEdits[0].afterPitch.written, 'E4');
  assert.equal(result.canonicalTabResult.measures[0].events[0].pitch.written, 'E4');
  const editedDisposition = disposition(result, sourceEventId(0, 0));
  assert.equal(editedDisposition.disposition, 'KEEP');
  assert.equal(editedDisposition.octaveShiftSemitones, 0);
  assert.equal(editedDisposition.targetPitch.written, 'E4');
  assert.ok(editedDisposition.selectedPosition);
  assert.equal(
    result.canonicalTabResult.noteDispositions.every((entry) => (
      entry.disposition === 'KEEP' && entry.octaveShiftSemitones === 0
    )),
    true,
  );
  assert.match(result.musicXml, /<score-partwise\b/);
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
  assert.equal(Object.isFrozen(result), true);
});

test('POLY_V2 replays real-world guitar normalization through backend edit and TAB regeneration', () => {
  const bytes = fixture('runtime-realworld-guitar-poly.musicxml');
  const edit = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 1, 5],
    step: 'E',
    octave: 3,
  });

  const result = processMusicXmlPolyphonicNoteEditV2(request(bytes, [edit]));

  assert.equal(result.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.PASS);
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.revision.revisionNumber, 1);
  assert.equal(result.revision.appliedEdits[0].sourceEventId, sourceEventId(0, 0));
  assert.deepEqual(
    result.revision.appliedEdits[0].sourceGroupEventIds,
    [sourceEventId(0, 0), sourceEventId(0, 1), sourceEventId(0, 5)],
  );
  assert.equal(result.revision.appliedEdits[0].beforePitch.written, 'E3');
  assert.equal(result.revision.appliedEdits[0].afterPitch.written, 'E3');
  assert.equal(disposition(result, sourceEventId(0, 0)).targetPitch.midi, 52);
  assert.equal(result.preflight.status, 'WARNING');
  assert.equal(result.preflight.issues[0].code, 'RUNTIME_GUITAR_NOTATION_NORMALIZED');
  assert.match(result.musicXml, /<key><fifths>0<\/fifths><\/key>/);
  assert.match(result.musicXml, /<octave-change>-1<\/octave-change>/);
});

test('POLY_V2 revisions replay cumulatively from the immutable source', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const commands = [
    command({
      sourceOrder: 0,
      onsetDivisions: 0,
      groupSourceOrders: [0, 4],
      step: 'D',
      octave: 4,
    }),
    command({
      sourceOrder: 0,
      onsetDivisions: 0,
      groupSourceOrders: [0, 4],
      step: 'E',
      octave: 4,
    }),
  ];

  const first = processMusicXmlPolyphonicNoteEditV2(request(bytes, commands));
  const second = processMusicXmlPolyphonicNoteEditV2(request(bytes, commands));

  assert.equal(first.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.PASS);
  assert.deepEqual(first, second);
  assert.equal(first.revision.revisionNumber, 2);
  assert.equal(first.revision.appliedEdits[1].beforePitch.written, 'D4');
  assert.equal(first.revision.appliedEdits[1].afterPitch.written, 'E4');
  assert.equal(first.canonicalTabResult.measures[0].events[0].pitch.written, 'E4');
});

test('POLY_V2 edit requires exact simultaneous-group identity and full membership acknowledgement', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const base = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 4],
    step: 'E',
    octave: 4,
  });

  const wrongGroup = processMusicXmlPolyphonicNoteEditV2(request(bytes, [{
    ...base,
    sourceGroupId: groupId(0, 4),
  }]));
  assert.equal(wrongGroup.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(wrongGroup.preflight.issues[0].code, 'EDIT_SOURCE_GROUP_IDENTITY_MISMATCH');
  assert.equal(wrongGroup.preflight.issues[0].category, 'safety');
  assert.equal(wrongGroup.canonicalTabResult, null);

  const partialGroup = processMusicXmlPolyphonicNoteEditV2(request(bytes, [{
    ...base,
    sourceGroupEventIds: [sourceEventId(0, 0)],
  }]));
  assert.equal(partialGroup.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(partialGroup.preflight.issues[0].code, 'EDIT_SOURCE_GROUP_MEMBERSHIP_MISMATCH');
  assert.equal(partialGroup.preflight.issues[0].category, 'safety');
  assert.equal(partialGroup.musicXml, null);
});

test('POLY_V2 edit rejects stale source-event identity at the acknowledged location', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const edit = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 4],
    step: 'E',
    octave: 4,
  });
  edit.sourceEventId = sourceEventId(0, 1);

  const result = processMusicXmlPolyphonicNoteEditV2(request(bytes, [edit]));
  assert.equal(result.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'EDIT_SOURCE_EVENT_IDENTITY_MISMATCH');
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.musicXml, null);
});

test('POLY_V2 edit blocks stale source SHA before projection or mutation', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const edit = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 4],
    step: 'E',
    octave: 4,
  });
  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'poly.musicxml',
    bytes,
    expectedInputSha256: '0'.repeat(64),
    commands: [edit],
  });

  assert.equal(result.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'STALE_POLYPHONIC_EDIT_INPUT');
  assert.equal(result.preflight.issues[0].category, 'safety');
});

test('POLY_V2 edit fails closed when an edited pitch cannot be retained on guitar', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const edit = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 4],
    step: 'C',
    octave: 7,
  });
  const result = processMusicXmlPolyphonicNoteEditV2(request(bytes, [edit]));

  assert.equal(result.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.ok(result.preflight.issues[0].code);
});

test('POLY_V2 edit contract rejects MONO_V1 sources instead of widening authority', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const edit = {
    measureIndex: 0,
    sourceOrder: 1,
    sourceEventId: 'P1:measure:0:note:1',
    sourceGroupId: null,
    sourceGroupEventIds: ['P1:measure:0:note:1'],
    pitch: { step: 'D', alter: 0, octave: 4 },
  };
  const result = processMusicXmlPolyphonicNoteEditV2(request(bytes, [edit], {
    fileName: 'mono.musicxml',
  }));

  assert.equal(result.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.route, 'MONO_V1');
  assert.equal(result.preflight.issues[0].code, 'EDIT_ROUTE_NOT_SUPPORTED');
  assert.equal(result.preflight.issues[0].category, 'capability');
});

test('POLY_V2 edit snapshot avoids Uint8Array subclass coercion hooks', () => {
  const original = fixture('pa12-polyphonic-e2e.musicxml');
  let invoked = false;
  class HostileUint8Array extends Uint8Array {
    valueOf() {
      invoked = true;
      throw new Error('caller hook must not run');
    }
    get length() {
      invoked = true;
      throw new Error('caller hook must not run');
    }
  }
  const hostile = new HostileUint8Array(original);
  const edit = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 4],
    step: 'E',
    octave: 4,
  });
  const result = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'poly.musicxml',
    bytes: hostile,
    expectedInputSha256: sha256(original),
    commands: [edit],
  });

  assert.equal(invoked, false);
  assert.equal(result.status, MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.PASS);
});

test('POLY_V2 edit request rejects malformed group acknowledgement arrays', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const edit = command({
    sourceOrder: 0,
    onsetDivisions: 0,
    groupSourceOrders: [0, 4],
    step: 'E',
    octave: 4,
  });
  edit.sourceGroupEventIds = [sourceEventId(0, 0), sourceEventId(0, 0)];

  assert.throws(
    () => processMusicXmlPolyphonicNoteEditV2(request(bytes, [edit])),
    (error) => {
      assert.ok(error instanceof MusicXmlPolyphonicNoteEditRuntimeV2Error);
      assert.equal(error.code, 'INVALID_POLYPHONIC_EDIT_REQUEST');
      assert.match(error.message, /duplicate/);
      return true;
    },
  );
});

test('POLY_V2 edit runtime remains outside the package-root public API', () => {
  assert.equal(publicApi.processMusicXmlPolyphonicNoteEditV2, undefined);
  assert.equal(publicApi.MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION, undefined);
});
