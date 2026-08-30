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

function note(technical, voice = '1', staff = '1') {
  return `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff><notations><technical>${technical}</technical></notations></note>`;
}

function extract(notes) {
  return extractGuitarTechniqueProvenance(score(notes));
}

test('PROD-TECH-03 pairs a simple Guitar Pro hammer-on only from deterministic source-tree identity', () => {
  const source = score([
    note('<hammer-on number="1" type="start">H</hammer-on>'),
    note('<hammer-on number="1" type="stop"/>'),
  ]);
  const before = structuredClone(source);
  const first = extractGuitarTechniqueProvenance(source);
  const second = extractGuitarTechniqueProvenance(source);

  assert.deepEqual(source, before);
  assert.deepEqual(first, second);
  assert.equal(first.physicalSemanticsEnabled, false);
  assert.equal(first.recordCount, 2);

  const [start, stop] = first.records;
  assert.equal(start.state, 'START');
  assert.equal(stop.state, 'STOP');
  assert.equal(start.pairingId, stop.pairingId);
  assert.match(start.pairingId, /^HAMMER_ON:n1:[a-f0-9]{24}$/);
  assert.equal(start.pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(stop.pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(start.sourcePairingToken, stop.sourcePairingToken);
  assert.match(start.sourcePairingToken, /^p0\.m0\.n0\..*>p0\.m0\.n1\./);
});

test('PROD-TECH-03 does not use MusicXML number alone as pair identity', () => {
  const result = extract([
    note('<hammer-on number="1" type="start">H</hammer-on>'),
    note('<hammer-on number="1" type="stop"/>'),
    note('<hammer-on number="1" type="start">H</hammer-on>'),
    note('<hammer-on number="1" type="stop"/>'),
  ]);

  const hammers = result.records.filter((entry) => entry.kind === 'HAMMER_ON');
  assert.equal(hammers.length, 4);
  assert.equal(hammers[0].pairingId, hammers[1].pairingId);
  assert.equal(hammers[2].pairingId, hammers[3].pairingId);
  assert.notEqual(hammers[0].pairingId, hammers[2].pairingId);
  assert.notEqual(hammers[0].sourcePairingToken, hammers[2].sourcePairingToken);
});

test('PROD-TECH-03 keeps the observed reused-number overlapping chain unpaired', () => {
  const result = extract([
    note('<hammer-on number="1" type="start">H</hammer-on>'),
    note('<hammer-on number="1" type="start">H</hammer-on><hammer-on number="1" type="stop"/>'),
    note('<hammer-on number="1" type="stop"/>'),
  ]);

  assert.equal(result.recordCount, 4);
  assert.ok(result.records.every((entry) => entry.kind === 'HAMMER_ON'));
  assert.ok(result.records.every((entry) => entry.pairingId === null));
  assert.ok(result.records.every((entry) => entry.pairingBasis === null));
  assert.ok(result.records.every((entry) => entry.sourcePairingToken === null));
});

test('PROD-TECH-03 still fails closed for pull-off because no Guitar Pro producer evidence is cleared', () => {
  assert.throws(
    () => extract([
      note('<pull-off number="1" type="start">P</pull-off>'),
      note('<pull-off number="1" type="stop"/>'),
    ]),
    (error) => error instanceof GuitarTechniqueProvenanceError
      && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE',
  );
});

test('PROD-TECH-03 pairing remains provenance-only and carries no musical or solver authority fields', () => {
  const result = extract([
    note('<hammer-on number="1" type="start">H</hammer-on>'),
    note('<hammer-on number="1" type="stop"/>'),
  ]);
  const forbidden = [
    'pitch', 'octave', 'onset', 'duration', 'voice', 'staff', 'tie', 'grace',
    'chordMembership', 'candidate', 'candidates', 'ranking', 'solverState',
  ];
  for (const record of result.records) {
    for (const field of forbidden) assert.equal(Object.hasOwn(record, field), false, field);
    assert.equal(record.capabilityClass, 'SAFE_METADATA_ONLY');
  }
});
