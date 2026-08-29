'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

function fixture() {
  return fs.readFileSync(
    path.join(__dirname, 'fixtures', 'runtime-realworld-guitar-poly.musicxml'),
    'utf8',
  );
}

function twoStaffSource() {
  return fixture()
    .replace('<staves>1</staves>', '<staves>2</staves>')
    .replace(
      '<clef><sign>G</sign><line>2</line></clef>',
      '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>',
    )
    .replaceAll('<voice>2</voice><type>quarter</type><staff>1</staff>', '<voice>2</voice><type>quarter</type><staff>2</staff>');
}

test('COMPAT-01B accepts bounded two-staff explicit-pitch layout and preserves source staff relation', () => {
  const xml = twoStaffSource();
  const first = processMusicXmlUpload({
    fileName: 'audiveris-two-staff-explicit-pitch.musicxml',
    bytes: Buffer.from(xml),
  });
  const second = processMusicXmlUpload({
    fileName: 'audiveris-two-staff-explicit-pitch.musicxml',
    bytes: Buffer.from(xml),
  });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(first.preflight.status, 'WARNING');
  assert.deepEqual(first, second);
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('attributes:two-staff-layout'));
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('attributes:clef-layout'));

  const voiceOne = first.canonicalTabResult.measures[0].events.filter(
    (event) => event.voice === '1',
  );
  const voiceTwo = first.canonicalTabResult.measures[0].events.filter(
    (event) => event.voice === '2',
  );
  assert.ok(voiceOne.length > 0);
  assert.ok(voiceTwo.length > 0);
  assert.equal(voiceOne.every((event) => event.staff === 1), true);
  assert.equal(voiceTwo.every((event) => event.staff === 2), true);
  assert.equal(
    first.canonicalTabResult.noteDispositions.every((entry) => (
      entry.disposition === 'KEEP'
      && entry.octaveShiftSemitones === 0
      && entry.selectedPosition !== null
    )),
    true,
  );
  assert.match(first.musicXml, /<sign>TAB<\/sign>/);
});

test('COMPAT-01B remains fail-closed beyond the bounded two-staff projector contract', () => {
  const threeStaves = twoStaffSource().replace('<staves>2</staves>', '<staves>3</staves>');
  const stavesResult = processMusicXmlUpload({
    fileName: 'unsupported-three-staves.musicxml',
    bytes: Buffer.from(threeStaves),
  });
  assert.equal(stavesResult.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(stavesResult.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(stavesResult.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
  assert.equal(stavesResult.preflight.issues[0].details.feature, 'staves');

  const staffThree = twoStaffSource().replace(
    '<voice>2</voice><type>quarter</type><staff>2</staff>',
    '<voice>2</voice><type>quarter</type><staff>3</staff>',
  );
  const staffResult = processMusicXmlUpload({
    fileName: 'unsupported-note-staff-three.musicxml',
    bytes: Buffer.from(staffThree),
  });
  assert.equal(staffResult.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(staffResult.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(staffResult.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
  assert.equal(staffResult.preflight.issues[0].details.feature, 'note-staff');
});
