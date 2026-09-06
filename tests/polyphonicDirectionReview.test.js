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
    <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><rest/><duration>4</duration><voice>2</voice><type>whole</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function assertReview(result) {
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.preflight.issues[0].details.feature, 'direction-review');
  assert.equal(result.preflight.issues[0].location.measure, '1');
}

test('routes bounded words plus playback tempo to located review without producing TAB', () => {
  const result = processMusicXmlUpload({
    fileName: 'words-tempo.musicxml',
    bytes: Buffer.from(score('<direction placement="above"><direction-type><words>Larghetto</words></direction-type><staff>1</staff><sound tempo="116"/></direction>')),
  });
  assertReview(result);
  assert.deepEqual(result.preflight.issues[0].details.direction.typeNames, ['words']);
});

test('routes bounded combined words and metronome direction to located review', () => {
  const result = processMusicXmlUpload({
    fileName: 'combined-tempo.musicxml',
    bytes: Buffer.from(score('<direction placement="above"><direction-type><words font-weight="bold" font-size="12">Larghetto</words></direction-type><direction-type><metronome parentheses="no"><beat-unit>half</beat-unit><per-minute>32</per-minute></metronome></direction-type><staff>1</staff><sound tempo="64.0002"/></direction>')),
  });
  assertReview(result);
  assert.deepEqual(result.preflight.issues[0].details.direction.typeNames, ['words', 'metronome']);
});

test('unknown direction semantics remain fail-closed', () => {
  const result = processMusicXmlUpload({
    fileName: 'navigation.musicxml',
    bytes: Buffer.from(score('<direction><direction-type><rehearsal>A</rehearsal></direction-type><sound dacapo="yes"/></direction>')),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].details.feature, 'direction');
});
