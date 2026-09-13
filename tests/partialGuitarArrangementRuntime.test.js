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
  assert.equal(first.capabilities.playback, 'APPROXIMATE');
  assert.equal(first.capabilities.export, false);
  assert.equal(first.issues[0].affectsTab, true);
  assert.equal(first.artifacts.provisionalTabAvailable, true);
  assert.equal(first.artifacts.canonicalTabAvailable, false);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(first, second);
});
