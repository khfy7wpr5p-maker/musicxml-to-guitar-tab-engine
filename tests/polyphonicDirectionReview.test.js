'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');

function score(direction) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    ${direction}
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function assertPassWithPreservedDirection(result, expectedDirection) {
  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.ok(result.canonicalTabResult);
  assert.match(result.musicXml, expectedDirection);
}

test('preserves bounded tempo words plus playback tempo and continues TAB production', () => {
  const request = {
    fileName: 'words-tempo.musicxml',
    bytes: Buffer.from(score('<direction placement="above"><direction-type><words>Larghetto</words></direction-type><staff>1</staff><sound tempo="116"/></direction>')),
  };
  const first = processMusicXmlUpload(request);
  const second = processMusicXmlUpload(request);
  assertPassWithPreservedDirection(
    first,
    /<direction placement="above"><direction-type><words>Larghetto<\/words><\/direction-type><staff>1<\/staff><sound tempo="116"\/><\/direction>/,
  );
  assert.deepEqual(first, second);
});

test('preserves compatible Larghetto metronome and playback tempo and continues TAB production', () => {
  const request = {
    fileName: 'combined-tempo.musicxml',
    bytes: Buffer.from(score('<direction placement="above"><direction-type><words font-weight="bold" font-size="12">Larghetto</words></direction-type><direction-type><metronome parentheses="no"><beat-unit>half</beat-unit><per-minute>32</per-minute></metronome></direction-type><staff>1</staff><sound tempo="64.0002"/></direction>')),
  };
  const first = processMusicXmlUpload(request);
  const second = processMusicXmlUpload(request);
  assertPassWithPreservedDirection(
    first,
    /<direction placement="above"><direction-type><words font-size="12" font-weight="bold">Larghetto<\/words><\/direction-type><direction-type><metronome parentheses="no"><beat-unit>half<\/beat-unit><per-minute>32<\/per-minute><\/metronome><\/direction-type><staff>1<\/staff><sound tempo="64\.0002"\/><\/direction>/,
  );
  assert.deepEqual(first, second);
});

test('canonicalizes all bounded decimal tempo spellings admitted by normalization', () => {
  for (const [input, expected] of [['+116', '116'], ['116.', '116'], ['.5', '0.5']]) {
    const result = processMusicXmlUpload({
      fileName: 'decimal-tempo.musicxml',
      bytes: Buffer.from(score(`<direction><direction-type><words>Larghetto</words></direction-type><staff>1</staff><sound tempo="${input}"/></direction>`)),
    });
    assertPassWithPreservedDirection(result, new RegExp(`<sound tempo="${expected.replace('.', '\\.')}"/>`));
  }
});

test('tempo direction targeting an undeclared staff remains blocked', () => {
  const result = processMusicXmlUpload({
    fileName: 'undeclared-tempo-staff.musicxml',
    bytes: Buffer.from(score('<direction><direction-type><words>Larghetto</words></direction-type><staff>2</staff><sound tempo="116"/></direction>')),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.musicXml, null);
  assert.equal(result.capabilities.renderScore, false);
  assert.equal(result.capabilities.generateTab, false);
});

test('non-leading tempo direction remains review-required instead of moving to measure start', () => {
  const xml = score('<direction><direction-type><words>Larghetto</words></direction-type><staff>1</staff><sound tempo="116"/></direction>')
    .replace(
      '<direction><direction-type><words>Larghetto</words></direction-type><staff>1</staff><sound tempo="116"/></direction>\n    <note>',
      '<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>\n    <direction><direction-type><words>Larghetto</words></direction-type><staff>1</staff><sound tempo="116"/></direction>\n    <note>',
    );
  const result = processMusicXmlUpload({
    fileName: 'mid-measure-tempo.musicxml',
    bytes: Buffer.from(xml),
  });
  assert.equal(result.status, 'REVIEW_REQUIRED');
  // No bounded TAB-writer artifact exists for this exact mid-measure placement
  // yet. The independent source artifact still makes the original score
  // renderable without moving the tempo event or inventing TAB.
  assert.equal(result.musicXml, null);
  assert.equal(result.sourceArtifact.rendererMusicXml, xml);
  assert.equal(result.capabilities.renderScore, true);
  assert.equal(result.capabilities.generateTab, false);
  assert.equal(result.capabilities.playback, 'APPROXIMATE');
  assert.equal(result.capabilities.export, false);
});

test('unknown direction semantics remain fail-closed', () => {
  const result = processMusicXmlUpload({
    fileName: 'navigation.musicxml',
    bytes: Buffer.from(score('<direction><direction-type><rehearsal>A</rehearsal></direction-type><sound dacapo="yes"/></direction>')),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].details.feature, 'direction');
  assert.equal(result.capabilities.renderScore, false);
  assert.equal(result.capabilities.generateTab, false);
});

test('combined conflicting direction remains review-required without inventing a provisional TAB', () => {
  const result = processMusicXmlUpload({
    fileName: 'conflicting-combined-tempo.musicxml',
    bytes: Buffer.from(score('<direction placement="above"><direction-type><words>Larghetto</words></direction-type><direction-type><metronome><beat-unit>half</beat-unit><per-minute>32</per-minute></metronome></direction-type><staff>1</staff><sound tempo="80"/></direction>')),
  });
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.route, 'POLY_V2');
  // This source is stopped before a writer-safe TAB projection exists. The
  // safely parsed source remains renderable, but no TAB or timing is invented.
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.match(result.sourceArtifact.rendererMusicXml, /<sound tempo="80"\/>/);
  assert.equal(result.capabilities.renderScore, true);
  assert.equal(result.capabilities.generateTab, false);
  assert.equal(result.capabilities.playback, 'APPROXIMATE');
  assert.equal(result.capabilities.export, false);
  assert.equal(result.artifacts.provisionalTabAvailable, false);
  assert.equal(result.artifacts.canonicalTabAvailable, false);
});
