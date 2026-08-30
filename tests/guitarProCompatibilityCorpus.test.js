'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

const FIXTURE_NAME = 'guitar-pro-export-profile.musicxml';
const FIXTURE_SHA256 = 'e5f8cddbe49f800a9e02c48df7542d68931b8b17cda8079112c8cb1bf72b6413';
const STANDARD_OPEN_STRING_MIDI = Object.freeze({
  1: 64,
  2: 59,
  3: 55,
  4: 50,
  5: 45,
  6: 40,
});

function fixture() {
  return fs.readFileSync(path.join(__dirname, 'fixtures', FIXTURE_NAME));
}

test('COMPAT-01C pins the documented Guitar Pro MusicXML export profile by sha256', () => {
  assert.equal(
    crypto.createHash('sha256').update(fixture()).digest('hex'),
    FIXTURE_SHA256,
  );
});

test('COMPAT-01C Guitar Pro export-profile provenance follows MONO guitar register semantics without trusting source TAB fingering', () => {
  const bytes = fixture();
  const first = processMusicXmlUpload({ fileName: FIXTURE_NAME, bytes });
  const second = processMusicXmlUpload({ fileName: FIXTURE_NAME, bytes });

  assert.equal(
    first.status,
    MUSICXML_UPLOAD_STATUS.PASS,
    `unexpected preflight: ${JSON.stringify(first.preflight)}`,
  );
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.deepEqual(first, second);
  assert.equal(first.preflight.status, 'PASS');
  assert.equal(first.preflight.canProcess, true);
  assert.deepEqual(first.preflight.issues, []);

  const notes = first.canonicalTabResult.measures[0].events.filter(
    (event) => event.type === 'note',
  );
  assert.equal(notes.length, 1);
  assert.equal(notes[0].pitch.written, 'E3');
  assert.equal(notes[0].pitch.midi, 52);
  assert.ok(notes[0].selectedPosition);
  assert.equal(
    STANDARD_OPEN_STRING_MIDI[notes[0].selectedPosition.string]
      + notes[0].selectedPosition.fret,
    notes[0].pitch.midi,
  );

  assert.notDeepEqual(notes[0].selectedPosition, { string: 6, fret: 0 });
  assert.deepEqual(notes[0].selectedPosition, { string: 4, fret: 2 });
  assert.match(first.musicXml, /<octave-change>-1<\/octave-change>/);
  assert.match(first.musicXml, /<sign>TAB<\/sign>/);
  assert.match(
    first.musicXml,
    /<pitch><step>E<\/step><octave>4<\/octave><\/pitch>[\s\S]*?<staff>1<\/staff>/,
  );
  assert.match(
    first.musicXml,
    /<pitch><step>E<\/step><octave>3<\/octave><\/pitch>[\s\S]*?<staff>2<\/staff>[\s\S]*?<technical>[\s\S]*?<string>4<\/string>[\s\S]*?<fret>2<\/fret>/,
  );
});
