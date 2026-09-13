'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');

function densePianoChord() {
  const pitches = [
    ['C', 3], ['G', 3], ['C', 4], ['E', 4], ['G', 4], ['C', 5],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${pitches.map(([step, octave], index) => `<note>${index > 0 ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>`).join('')}
  </measure></part>
</score-partwise>`;
}

test('dense piano input becomes an explicit provisional TAB instead of a solver hard block', () => {
  const request = {
    fileName: 'dense-piano.musicxml',
    bytes: Buffer.from(densePianoChord()),
  };
  const first = processMusicXmlUpload(request);
  const second = processMusicXmlUpload(request);

  assert.equal(first.status, 'REVIEW_REQUIRED');
  assert.equal(first.route, 'POLY_V2');
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.arrangementArtifact.documentType, 'PartialGuitarTabArrangement');
  assert.equal(first.arrangementArtifact.contractVersion, '1.0.0');
  assert.equal(first.arrangementArtifact.authority, 'PROVISIONAL_REVIEW_ONLY');
  assert.equal(first.arrangementArtifact.sourceNoteCount, 6);
  assert.ok(first.arrangementArtifact.assignedNoteCount > 0);
  assert.ok(first.arrangementArtifact.unassignedNoteCount > 0);
  assert.equal(
    first.arrangementArtifact.noteDispositions.length,
    first.arrangementArtifact.sourceNoteCount,
  );
  assert.match(first.musicXml, /<sign>TAB<\/sign>/);
  assert.equal(first.capabilities.renderScore, true);
  assert.equal(first.capabilities.generateTab, true);
  assert.equal(first.capabilities.editPitch, true);
  assert.equal(first.capabilities.playback, 'APPROXIMATE');
  assert.equal(first.capabilities.export, false);
  assert.equal(first.issues[0].affectsTab, true);
  assert.equal(first.artifacts.provisionalTabAvailable, true);
  assert.equal(first.artifacts.reviewEditableProjectionAvailable, true);
  assert.equal(first.artifacts.canonicalTabAvailable, false);
  assert.equal(first.reviewEditableProjection.documentType, 'ReviewEditableTabProjection');
  assert.equal(first.reviewEditableProjection.authority, 'PROVISIONAL_REVIEW_ONLY');
  assert.equal(first.reviewEditableProjection.sourceUploadSha256, first.input.sha256);
  assert.equal(first.reviewEditableProjection.measures[0].events.length, 6);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(first, second);
});

test('physically impossible seven-note sonority is reduced to explicit review-only TAB', () => {
  const pitches = [
    ['C', 3], ['D', 3], ['E', 3], ['F', 3], ['G', 3], ['A', 3], ['B', 3],
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${pitches.map(([step, octave], index) => `<note>${index > 0 ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>`).join('')}
  </measure></part>
</score-partwise>`;
  const result = processMusicXmlUpload({
    fileName: 'seven-note-piano.musicxml',
    bytes: Buffer.from(xml),
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION');
  assert.equal(result.preflight.issues[0].details.reason, 'NO_PLAYABLE_FINAL_SELECTION_CANDIDATE');
  assert.equal(result.arrangementArtifact.sourceNoteCount, 7);
  assert.ok(result.arrangementArtifact.assignedNoteCount > 0);
  assert.ok(result.arrangementArtifact.unassignedNoteCount > 0);
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.capabilities.export, false);
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
});

test('partial recovery keeps extracted grace notes explicit as unassigned review work', () => {
  const xml = densePianoChord().replace(
    '<note><pitch><step>C</step><octave>3</octave>',
    '<note><grace slash="yes"/><pitch><step>B</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff></note>'
      + '<note><pitch><step>C</step><octave>3</octave>',
  );
  const result = processMusicXmlUpload({
    fileName: 'dense-piano-grace.musicxml',
    bytes: Buffer.from(xml),
  });

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.arrangementArtifact.sourceNoteCount, 7);
  assert.equal(result.arrangementArtifact.recovery.unassignedGraceNoteCount, 1);
  const grace = result.arrangementArtifact.noteDispositions.find(
    (entry) => entry.reasonCode === 'GRACE_TIMING_REQUIRES_REVIEW',
  );
  assert.ok(grace);
  assert.match(grace.sourceEventId, /:grace:/);
  assert.equal(grace.disposition, 'UNASSIGNED');
});
