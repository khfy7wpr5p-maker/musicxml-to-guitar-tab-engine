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

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

test('runtime routes real-world single-staff multi-voice guitar notation through POLY_V2 with sounding-octave normalization', () => {
  const result = processMusicXmlUpload({
    fileName: 'real-guitar.musicxml',
    bytes: fixture('runtime-realworld-guitar-poly.musicxml'),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.status, 'WARNING');
  assert.equal(result.preflight.canProcess, true);
  assert.equal(result.preflight.issues.length, 1);
  assert.equal(result.preflight.issues[0].code, 'RUNTIME_GUITAR_NOTATION_NORMALIZED');
  assert.equal(result.preflight.issues[0].details.pitchOctaveShift, -1);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:transpose'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:key'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:clef'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('measure:direction'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('measure:barline'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('notation:slur'));

  const dispositions = result.canonicalTabResult.noteDispositions;
  assert.equal(dispositions.length, 8);
  assert.equal(dispositions[0].targetPitch.written, 'E3');
  assert.equal(dispositions[0].targetPitch.midi, 52);
  assert.equal(dispositions[4].targetPitch.written, 'C3');
  assert.equal(dispositions[4].targetPitch.midi, 48);
  assert.equal(
    dispositions.every((entry) => entry.disposition === 'KEEP' && entry.octaveShiftSemitones === 0),
    true,
  );

  assert.match(result.musicXml, /<octave-change>-1<\/octave-change>/);
  assert.match(result.musicXml, /<step>E<\/step><octave>4<\/octave>/);
});

test('runtime remains fail-closed for non-standard source transposition', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const unsafe = source.replace('<octave-change>-1</octave-change>', '<octave-change>-2</octave-change>');
  const result = processMusicXmlUpload({
    fileName: 'unsupported-transpose.musicxml',
    bytes: Buffer.from(unsafe),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
});
