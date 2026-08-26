'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  MUSICXML_NOTE_EDIT_STATUS,
  MusicXmlNoteEditRuntimeError,
  processMusicXmlNoteEdit,
} = require('../src/app/musicXmlNoteEditRuntime');
const { createProcessingRuntime } = require('../src/core/processingRuntime');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function command(measureIndex, eventIndex, step, alter, octave) {
  return {
    measureIndex,
    eventIndex,
    eventId: `m${measureIndex + 1}-e${eventIndex}`,
    pitch: { step, alter, octave },
  };
}

function request(bytes, commands, overrides = {}) {
  return {
    fileName: 'melody.musicxml',
    bytes,
    expectedInputSha256: sha256(bytes),
    commands,
    ...overrides,
  };
}

function validTieSource() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><tie type="start"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><tie type="stop"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`);
}

test('structured note revision keeps source edit written while regenerating sounding guitar TAB', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const result = processMusicXmlNoteEdit(request(bytes, [
    command(0, 1, 'D', 0, 4),
  ]));

  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.PASS);
  assert.equal(result.route, 'MONO_V1');
  assert.equal(result.input.sha256, sha256(bytes));
  assert.equal(result.revision.revisionNumber, 1);
  assert.equal(result.revision.appliedEdits[0].eventId, 'm1-e1');
  assert.equal(result.revision.appliedEdits[0].beforePitch.written, 'D#4');
  assert.equal(result.revision.appliedEdits[0].afterPitch.written, 'D4');
  assert.equal(result.revision.appliedEdits[0].affectedEventCount, 1);
  assert.equal(result.canonicalTabResult.measures[0].events[1].pitch.written, 'D3');
  assert.ok(result.canonicalTabResult.measures[0].events[1].selectedPosition);
  assert.match(result.musicXml, /<score-partwise\b/);
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
  assert.match(
    result.musicXml,
    /<pitch><step>D<\/step><octave>4<\/octave><\/pitch>[\s\S]*?<staff>1<\/staff>/,
  );
  assert.match(
    result.musicXml,
    /<pitch><step>D<\/step><octave>3<\/octave><\/pitch>[\s\S]*?<staff>2<\/staff>/,
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.revision), true);
});

test('cumulative revisions replay written source edits while canonical TAB stays in sounding register', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const commands = [
    command(0, 1, 'D', 0, 4),
    command(0, 1, 'E', 0, 4),
    command(0, 2, 'F', 1, 4),
  ];

  const first = processMusicXmlNoteEdit(request(bytes, commands));
  const second = processMusicXmlNoteEdit(request(bytes, commands));

  assert.equal(first.status, MUSICXML_NOTE_EDIT_STATUS.PASS);
  assert.deepEqual(first, second);
  assert.equal(first.revision.revisionNumber, 3);
  assert.equal(first.revision.appliedEdits[1].beforePitch.written, 'D4');
  assert.equal(first.revision.appliedEdits[1].afterPitch.written, 'E4');
  assert.equal(first.canonicalTabResult.measures[0].events[1].pitch.written, 'E3');
  assert.equal(first.canonicalTabResult.measures[0].events[2].pitch.written, 'F#3');
});

test('revision runtime owns input bytes before caller mutation', () => {
  const original = fixture('parser-single-voice.musicxml');
  const mutable = new Uint8Array(original);
  let mutated = false;
  const runtime = createProcessingRuntime({}, {
    clock: (phase) => {
      if (!mutated && phase === 'app-upload:start') {
        mutable.fill(0);
        mutated = true;
      }
      return 0;
    },
  });

  const result = processMusicXmlNoteEdit({
    fileName: 'mutable.musicxml',
    bytes: mutable,
    expectedInputSha256: sha256(original),
    commands: [command(0, 1, 'D', 0, 4)],
  }, {}, runtime);

  assert.equal(mutated, true);
  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.PASS);
  assert.equal(result.input.sha256, sha256(original));
  assert.equal(result.canonicalTabResult.measures[0].events[1].pitch.written, 'D3');
});

test('revision snapshot does not invoke Uint8Array subclass coercion hooks', () => {
  const original = fixture('parser-single-voice.musicxml');
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
  const result = processMusicXmlNoteEdit({
    fileName: 'hostile.musicxml',
    bytes: hostile,
    expectedInputSha256: sha256(original),
    commands: [command(0, 1, 'D', 0, 4)],
  });

  assert.equal(invoked, false);
  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.PASS);
  assert.equal(result.input.sha256, sha256(original));
});

test('stale source identity blocks revision before musical mutation', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const result = processMusicXmlNoteEdit({
    fileName: 'melody.musicxml',
    bytes,
    expectedInputSha256: '0'.repeat(64),
    commands: [command(0, 1, 'D', 0, 4)],
  });

  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'STALE_EDIT_INPUT');
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('validated adjacent tie chains are edited atomically and keep one regenerated sounding guitar position', () => {
  const bytes = validTieSource();
  const result = processMusicXmlNoteEdit(request(bytes, [
    command(0, 0, 'D', 0, 4),
  ], { fileName: 'valid-tie.musicxml' }));

  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.PASS);
  const edit = result.revision.appliedEdits[0];
  assert.equal(edit.commandType, 'REPLACE_TIE_CHAIN_PITCH');
  assert.equal(edit.affectedEventCount, 2);
  assert.deepEqual(edit.affectedEvents.map((entry) => entry.eventId), ['m1-e0', 'm2-e0']);
  assert.equal(edit.afterPitch.written, 'D4');
  assert.equal(result.canonicalTabResult.measures[0].events[0].pitch.written, 'D3');
  assert.equal(result.canonicalTabResult.measures[1].events[0].pitch.written, 'D3');
  assert.deepEqual(
    result.canonicalTabResult.measures[0].events[0].selectedPosition,
    result.canonicalTabResult.measures[1].events[0].selectedPosition,
  );
  assert.match(result.musicXml, /<tie type="start"\/>/);
  assert.match(result.musicXml, /<tie type="stop"\/>/);
});

test('non-contiguous or malformed tie chains fail closed instead of changing only one endpoint', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const result = processMusicXmlNoteEdit(request(bytes, [
    command(0, 0, 'D', 0, 4),
  ]));

  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_TIE_CHAIN');
  assert.equal(result.preflight.issues[0].category, 'content');
  assert.equal(result.preflight.issues[0].location.measureIndex, 0);
  assert.equal(result.preflight.issues[0].location.eventIndex, 0);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('rests cannot be targeted by a pitch revision', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const result = processMusicXmlNoteEdit(request(bytes, [
    command(0, 3, 'D', 0, 4),
  ]));

  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'EDIT_TARGET_NOT_NOTE');
  assert.equal(result.canonicalTabResult, null);
});

test('written note outside guitar sounding range blocks output instead of silently displacing it', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const result = processMusicXmlNoteEdit(request(bytes, [
    command(0, 1, 'C', 0, 8),
  ]));

  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'UNPLAYABLE_NOTE');
  assert.equal(result.preflight.issues[0].category, 'playability');
  assert.equal(result.musicXml, null);
});

test('polyphonic source is not exposed to the monophonic edit contract', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const result = processMusicXmlNoteEdit(request(bytes, [
    command(0, 0, 'C', 0, 4),
  ], { fileName: 'poly.musicxml' }));

  assert.equal(result.status, MUSICXML_NOTE_EDIT_STATUS.BLOCKED);
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.preflight.issues[0].code, 'EDIT_ROUTE_NOT_SUPPORTED');
  assert.equal(result.preflight.issues[0].category, 'capability');
});

test('malformed revision identities and sparse command arrays are rejected as invalid requests', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const mismatched = command(0, 1, 'D', 0, 4);
  mismatched.eventId = 'm2-e1';

  assert.throws(
    () => processMusicXmlNoteEdit(request(bytes, [mismatched])),
    (error) => {
      assert.ok(error instanceof MusicXmlNoteEditRuntimeError);
      assert.equal(error.code, 'INVALID_EDIT_REQUEST');
      assert.match(error.message, /identity fields/);
      return true;
    },
  );

  const sparse = new Array(2);
  sparse[1] = command(0, 1, 'D', 0, 4);
  assert.throws(
    () => processMusicXmlNoteEdit(request(bytes, sparse)),
    (error) => {
      assert.ok(error instanceof MusicXmlNoteEditRuntimeError);
      assert.equal(error.code, 'INVALID_EDIT_REQUEST');
      assert.match(error.message, /dense/);
      return true;
    },
  );
});

test('invalid pitch command is rejected before conversion', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  assert.throws(
    () => processMusicXmlNoteEdit(request(bytes, [
      command(0, 1, 'H', 0, 4),
    ])),
    (error) => {
      assert.ok(error instanceof MusicXmlNoteEditRuntimeError);
      assert.equal(error.code, 'INVALID_EDIT_REQUEST');
      assert.match(error.message, /step/);
      return true;
    },
  );
});

test('structured note edit runtime stays outside the package-root public API', () => {
  assert.equal(publicApi.processMusicXmlNoteEdit, undefined);
  assert.equal(publicApi.MUSICXML_NOTE_EDIT_RUNTIME_VERSION, undefined);
});
