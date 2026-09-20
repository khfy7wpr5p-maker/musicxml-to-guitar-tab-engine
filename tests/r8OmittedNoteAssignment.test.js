'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  processMusicXmlPolyphonicNoteEditV2,
} = require('../src/app/musicXmlPolyphonicNoteEditRuntimeV2');

function densePianoChord() {
  const pitches = [
    ['E', 2, 0], ['B', 2, 0], ['C', 3, 0], ['E', 3, 0],
    ['G', 3, 1], ['B', 3, 0], ['E', 4, 0],
  ];
  return Buffer.from(`<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>${pitches.map(([step, octave, alter], index) => `<note>${index > 0 ? '<chord/>' : ''}<pitch><step>${step}</step>${alter === 0 ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>`).join('')}</measure></part></score-partwise>`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function groupEventIds() {
  return [0, 1, 2, 3, 4, 5, 6].map(
    (sourceOrder) => `P1:measure:0:note:${sourceOrder}`,
  );
}

function assignmentCommand(overrides = {}) {
  const sourceEventId = 'P1:measure:0:note:3';
  return {
    measureIndex: 0,
    sourceOrder: 3,
    sourceEventId,
    sourceGroupId: 'P1:measure:0:simultaneous:0',
    sourceGroupEventIds: groupEventIds(),
    sourceTieEventIds: [sourceEventId],
    pitch: { step: 'E', alter: 0, octave: 3 },
    selectedPosition: { string: 4, fret: 2 },
    assignmentMode: 'ASSIGN_OMITTED',
    ...overrides,
  };
}

function editRequest(bytes, commands) {
  return {
    fileName: 'dense-piano.musicxml',
    bytes,
    expectedInputSha256: sha256(bytes),
    commands,
  };
}

test('R8 assigns one reduction-unassigned piano note to an exact teacher position', () => {
  const bytes = densePianoChord();
  const original = Buffer.from(bytes);
  const upload = processMusicXmlUpload({ fileName: 'dense-piano.musicxml', bytes });
  const sourceEventId = 'P1:measure:0:note:3';
  const candidate = upload.reviewEditableProjection.noteDispositions.find(
    (entry) => entry.sourceEventId === sourceEventId,
  );

  assert.equal(candidate.disposition, 'OMIT');
  assert.equal(candidate.assignmentEligible, true);
  assert.equal(candidate.reasonCode, 'GUITAR_CAPACITY_REDUCTION');
  assert.equal(upload.capabilities.assignTabPosition, true);

  const request = editRequest(bytes, [assignmentCommand()]);
  const result = processMusicXmlPolyphonicNoteEditV2(request);
  const repeated = processMusicXmlPolyphonicNoteEditV2(request);

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.contractVersion, '1.4.0');
  assert.deepEqual(result, repeated);
  assert.deepEqual(bytes, original);
  assert.equal(result.revision.appliedEdits[0].commandType, 'ASSIGN_OMITTED_POLYPHONIC_SOURCE_EVENT_POSITION');
  const assigned = result.reviewEditableProjection.noteDispositions.find(
    (entry) => entry.sourceEventId === sourceEventId,
  );
  assert.equal(assigned.disposition, 'KEEP');
  assert.equal(assigned.assignmentEligible, false);
  assert.deepEqual(assigned.selectedPosition, { string: 4, fret: 2 });
  assert.equal(result.arrangementArtifact.assignedNoteCount, 6);
  assert.equal(result.arrangementArtifact.unassignedNoteCount, 1);
  const originalKept = upload.arrangementArtifact.noteDispositions.filter(
    (entry) => entry.disposition === 'KEPT' || entry.disposition === 'OCTAVE_SHIFTED',
  );
  for (const previous of originalKept) {
    const current = result.arrangementArtifact.noteDispositions.find(
      (entry) => entry.sourceEventId === previous.sourceEventId,
    );
    assert.ok(current);
    assert.notEqual(current.disposition, 'UNASSIGNED');
    assert.deepEqual(current.selectedPosition, previous.selectedPosition);
  }
  assert.match(result.musicXml, /<string>4<\/string>[\s\S]*<fret>2<\/fret>/);
});

test('R8 requires explicit assignment intent for an unassigned position request', () => {
  const bytes = densePianoChord();
  const command = assignmentCommand();
  delete command.assignmentMode;
  const result = processMusicXmlPolyphonicNoteEditV2(editRequest(bytes, [command]));

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'EDIT_ASSIGNMENT_MODE_REQUIRED');
});

test('R8 rejects assignment intent for a note already retained in TAB', () => {
  const bytes = densePianoChord();
  const sourceEventId = 'P1:measure:0:note:0';
  const command = assignmentCommand({
    sourceOrder: 0,
    sourceEventId,
    sourceTieEventIds: [sourceEventId],
    pitch: { step: 'E', alter: 0, octave: 2 },
    selectedPosition: { string: 6, fret: 0 },
  });
  const result = processMusicXmlPolyphonicNoteEditV2(editRequest(bytes, [command]));

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'EDIT_SOURCE_EVENT_NOT_ASSIGNMENT_ELIGIBLE');
});

test('R8 does not combine omitted-note assignment with a pitch rewrite', () => {
  const bytes = densePianoChord();
  const result = processMusicXmlPolyphonicNoteEditV2(editRequest(bytes, [assignmentCommand({
    pitch: { step: 'A', alter: 0, octave: 3 },
  })]));

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'EDIT_ASSIGNMENT_PITCH_CHANGE_NOT_SUPPORTED');
});

test('R8 blocks a teacher position that cannot produce the source pitch', () => {
  const bytes = densePianoChord();
  const result = processMusicXmlPolyphonicNoteEditV2(editRequest(bytes, [assignmentCommand({
    selectedPosition: { string: 1, fret: 1 },
  })]));

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION');
  assert.match(result.preflight.issues[0].message, /requested string\/fret/i);
});

test('R8 replays a later position confirmation after the explicit assignment command', () => {
  const bytes = densePianoChord();
  const correction = assignmentCommand({ selectedPosition: { string: 4, fret: 2 } });
  delete correction.assignmentMode;

  const result = processMusicXmlPolyphonicNoteEditV2(editRequest(bytes, [
    assignmentCommand(),
    correction,
  ]));

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.revision.revisionNumber, 2);
  assert.equal(result.revision.appliedEdits[0].commandType, 'ASSIGN_OMITTED_POLYPHONIC_SOURCE_EVENT_POSITION');
  assert.equal(result.revision.appliedEdits[1].commandType, 'SET_POLYPHONIC_SOURCE_EVENT_POSITION');
  const assigned = result.reviewEditableProjection.noteDispositions.find(
    (entry) => entry.sourceEventId === 'P1:measure:0:note:3',
  );
  assert.deepEqual(assigned.selectedPosition, { string: 4, fret: 2 });
});
