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
const FIXTURE_SHA256 = '93651f6983623e3e3df2517d0e07e2bf372659cf1679fb517c60e9503b1a5139';
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

test('COMPAT-01C Guitar Pro export-profile provenance normalizes deterministically without trusting source TAB fingering', () => {
  const bytes = fixture();
  const first = processMusicXmlUpload({ fileName: FIXTURE_NAME, bytes });
  const second = processMusicXmlUpload({ fileName: FIXTURE_NAME, bytes });

  assert.equal(
    first.status,
    MUSICXML_UPLOAD_STATUS.PASS,
    `unexpected preflight: ${JSON.stringify(first.preflight)}`,
  );
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(first, second);
  assert.equal(first.preflight.status, 'WARNING');
  assert.equal(first.preflight.canProcess, true);
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('attributes:clef-layout'));
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('attributes:staff-tuning-provenance'));
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('notation:technical:string-fret-provenance'));

  const dispositions = first.canonicalTabResult.noteDispositions;
  assert.equal(dispositions.length, 4);
  assert.deepEqual(dispositions.map((entry) => entry.targetPitch.written), ['E4', 'G4', 'B3', 'E3']);
  for (const entry of dispositions) {
    assert.equal(entry.disposition, 'KEEP');
    assert.equal(entry.octaveShiftSemitones, 0);
    assert.ok(entry.selectedPosition);
    assert.equal(
      STANDARD_OPEN_STRING_MIDI[entry.selectedPosition.string] + entry.selectedPosition.fret,
      entry.targetPitch.midi,
    );
  }

  assert.notDeepEqual(dispositions[0].selectedPosition, { string: 6, fret: 0 });
  assert.notDeepEqual(dispositions[1].selectedPosition, { string: 6, fret: 3 });
  assert.match(first.musicXml, /<sign>TAB<\/sign>/);
  assert.match(first.musicXml, /<technical>[\s\S]*?<string>1<\/string>[\s\S]*?<fret>0<\/fret>/);
});
