'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  normalizePolyphonicOctaveShifts,
  projectParsedMusicXmlWithOctaveShiftCompatibility,
} = require('../src/parser/polyphonicOctaveShiftResolver');

function score(measureBody) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Fixture</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      ${measureBody}
    </measure>
  </part>
</score-partwise>`;
}

function note(step, octave, { duration = 4, voice = 1, staff = 1 } = {}) {
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function octaveShift(type, staff = 2) {
  return `<direction placement="above"><direction-type><octave-shift type="${type}" number="1" size="8"/></direction-type><staff>${staff}</staff></direction>`;
}

test('Stage 09 accepts standards-valid forward voice/staff metadata while resolving octave-shift timing', () => {
  const xml = score(`
    ${octaveShift('down')}
    <forward><duration>4</duration><voice>2</voice><staff>2</staff></forward>
    ${note('G', 4, { voice: 2, staff: 2 })}
    ${octaveShift('stop')}
  `);
  const parsed = parseParsedMusicXmlDocument(xml);
  const normalized = normalizePolyphonicOctaveShifts(parsed);
  assert.deepEqual(
    normalized.octaveShiftMarkers.map((marker) => [marker.type, marker.cursorDivisions]),
    [['down', 0], ['stop', 8]],
  );
});

test('Stage 09 surfaces ambiguous backward repeat as REVIEW_REQUIRED without canonical TAB authority', () => {
  const xml = score(`
    ${note('C', 4, { voice: 1, staff: 1 })}
    <backup><duration>4</duration></backup>
    ${note('E', 3, { voice: 2, staff: 2 })}
    <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>
  `);
  const result = processMusicXmlUpload({
    fileName: 'review-repeat.musicxml',
    bytes: Buffer.from(xml, 'utf8'),
  });

  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.status, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.canProcess, false);
  assert.equal(result.preflight.issues.length, 1);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE');
  assert.equal(result.preflight.issues[0].details.reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.issues[0].reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('Stage 09 projects validated forward metadata deterministically without changing source bytes or nodes', () => {
  for (const metadata of ['', '<voice>2</voice>', '<staff>2</staff>', '<voice>2</voice><staff>2</staff>']) {
    const bytes = Buffer.from(score(`
      ${octaveShift('down')}
      <forward><duration>4</duration>${metadata}</forward>
      ${note('G', 4, { voice: 2, staff: 2 })}
      ${octaveShift('stop')}
    `));
    const before = Buffer.from(bytes);
    const parsed = parseParsedMusicXmlDocument(bytes);
    const snapshot = JSON.stringify(parsed);
    const first = projectParsedMusicXmlWithOctaveShiftCompatibility(parsed);
    assert.deepEqual(first, projectParsedMusicXmlWithOctaveShiftCompatibility(parsed));
    assert.equal(first.sourceModel.measures[0].events[0].pitch.written, 'G4');
    assert.equal(first.sourceModel.measures[0].events[0].onsetDivisions, 4);
    assert.deepEqual(first.octaveShiftMarkers.map((marker) => marker.cursorDivisions), [0, 8]);
    assert.equal(JSON.stringify(parsed), snapshot);
    assert.deepEqual(bytes, before);
  }
});

test('Stage 09 rejects malformed forward metadata and keeps backup validation strict', () => {
  const invalidCursors = [
    '<backup><duration>4</duration><voice>2</voice></backup>',
    '<backup><duration>4</duration><staff>2</staff></backup>',
    '<forward><duration>4</duration><voice/></forward>',
    '<forward><duration>4</duration><voice>2</voice><voice>3</voice></forward>',
    '<forward><duration>4</duration><staff>2</staff><voice>2</voice></forward>',
    '<forward><duration>4</duration><staff>3</staff></forward>',
    '<forward><duration>4</duration><voice id="x">2</voice></forward>',
    '<forward><duration>4</duration><voice><x xmlns="urn:foreign"/>2</voice></forward>',
    '<forward><duration>4</duration><unknown/></forward>',
  ];
  for (const cursor of invalidCursors) {
    assert.throws(() => normalizePolyphonicOctaveShifts(parseParsedMusicXmlDocument(score(`
      ${note('C', 4)}${cursor}
    `))), { code: 'INVALID_POLYPHONIC_OCTAVE_SHIFT' }, cursor);
  }
});

test('Stage 09 does not widen unrelated blocked capability failures', () => {
  const xml = score(`
    ${note('C', 4, { voice: 1, staff: 1 })}
    <backup><duration>4</duration></backup>
    ${note('E', 3, { voice: 2, staff: 2 })}
    <harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>
  `);
  const result = processMusicXmlUpload({
    fileName: 'unrelated-capability.musicxml',
    bytes: Buffer.from(xml, 'utf8'),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('Stage 09 keeps unsupported directions BLOCKED without canonical output', () => {
  const bytes = Buffer.from(score(`
    ${note('C', 4)}
    <backup><duration>4</duration></backup>
    ${note('E', 3, { voice: 2, staff: 2 })}
    <direction><direction-type><unknown-direction/></direction-type></direction>
  `));
  const before = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'direction.musicxml', bytes });
  assert.equal(first.status, 'BLOCKED');
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);
  assert.deepEqual(first, processMusicXmlUpload({ fileName: 'direction.musicxml', bytes }));
  assert.deepEqual(bytes, before);
});
