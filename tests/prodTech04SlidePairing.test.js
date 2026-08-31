'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  GuitarTechniqueProvenanceError,
  extractGuitarTechniqueProvenance,
} = require('../src/parser/guitarTechniqueProvenance');

function score(notes) {
  return parseParsedMusicXmlDocument(
    `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${notes.join('')}</measure></part></score-partwise>`,
  );
}

function note(slides, voice = '1', staff = '1') {
  return `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff><notations>${slides}</notations></note>`;
}

function extract(notes) {
  return extractGuitarTechniqueProvenance(score(notes));
}

test('PROD-TECH-04 pairs a simple slide only from deterministic source-tree identity', () => {
  const source = score([
    note('<slide number="1" type="start"/>'),
    note('<slide number="1" type="stop"/>'),
  ]);
  const before = structuredClone(source);
  const first = extractGuitarTechniqueProvenance(source);
  const second = extractGuitarTechniqueProvenance(source);

  assert.deepEqual(source, before);
  assert.deepEqual(first, second);
  const [start, stop] = first.records;
  assert.equal(start.kind, 'SLIDE');
  assert.equal(start.pairingId, stop.pairingId);
  assert.match(start.pairingId, /^SLIDE:n1:[a-f0-9]{24}$/);
  assert.equal(start.pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(start.sourcePairingToken, stop.sourcePairingToken);
});

test('PROD-TECH-04 does not use slide number alone as pair identity', () => {
  const result = extract([
    note('<slide number="1" type="start"/>'),
    note('<slide number="1" type="stop"/>'),
    note('<slide number="1" type="start"/>'),
    note('<slide number="1" type="stop"/>'),
  ]);
  assert.notEqual(result.records[0].pairingId, result.records[2].pairingId);
  assert.equal(result.records[0].pairingId, result.records[1].pairingId);
  assert.equal(result.records[2].pairingId, result.records[3].pairingId);
});

test('PROD-TECH-04 keeps overlapping reused-number slide chains unpaired', () => {
  const result = extract([
    note('<slide number="1" type="start"/>'),
    note('<slide number="1" type="start"/><slide number="1" type="stop"/>'),
    note('<slide number="1" type="stop"/>'),
  ]);
  assert.ok(result.records.every((entry) => entry.pairingId === null));
  assert.ok(result.records.every((entry) => entry.pairingBasis === null));
});

test('PROD-TECH-04 retains fail-closed endpoint and pull-off boundaries', () => {
  for (const notes of [
    [note('<slide number="1" type="stop"/>')],
    [note('<slide number="1" type="start"/>')],
    [note('<slide number="1" type="start"/>', '1', '1'), note('<slide number="1" type="stop"/>', '2', '1')],
    [note('<technical><pull-off number="1" type="start">P</pull-off></technical>')],
  ]) {
    assert.throws(
      () => extract(notes),
      (error) => error instanceof GuitarTechniqueProvenanceError,
    );
  }
});
