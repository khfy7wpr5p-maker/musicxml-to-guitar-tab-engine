'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

function score(endingXml) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Poly</part-name></score-part></part-list>
  <part id="P1">
    <measure number="24">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type></note>
      <barline location="left"><bar-style>regular</bar-style>${endingXml}</barline>
    </measure>
  </part>
</score-partwise>`);
}

test('bounded ending barline becomes located teacher review without guessing playback order', () => {
  const bytes = score('<ending number="1" type="start" default-y="40"></ending>');
  const before = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'ending-review.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'ending-review.musicxml', bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(first.preflight.canProcess, false);
  assert.equal(first.preflight.issues[0].category, 'semantic');
  assert.equal(first.preflight.issues[0].details.feature, 'barline-ending');
  assert.equal(first.preflight.issues[0].details.reason, 'ENDING_PLAYBACK_POLICY_REQUIRES_REVIEW');
  assert.equal(first.preflight.issues[0].location.measure, '24');
  assert.equal(first.preflight.issues[0].location.measureIndex, 0);
  assert.deepEqual(first.preflight.issues[0].details.ending, {
    number: '1',
    type: 'start',
    location: 'left',
    barStyle: 'regular',
    defaultY: '40',
  });
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);
  assert.deepEqual(first, second);
  assert.deepEqual(bytes, before);
});

test('bounded ending discontinue shape is reviewable and located', () => {
  const result = processMusicXmlUpload({
    fileName: 'ending-discontinue.musicxml',
    bytes: score('<ending number="1" type="discontinue" default-y="36"></ending>'),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.preflight.issues[0].details.ending.type, 'discontinue');
  assert.equal(result.preflight.issues[0].location.measure, '24');
});

test('unknown ending shape remains fail-closed', () => {
  const result = processMusicXmlUpload({
    fileName: 'ending-unknown.musicxml',
    bytes: score('<ending number="all" type="start" color="#fff"></ending>'),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].details.feature, 'barline');
  assert.equal(result.preflight.issues[0].location.measure, '24');
  assert.deepEqual(result.preflight.issues[0].details.childNames, ['bar-style', 'ending']);
});
