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

const SUSTAINED_CORPUS = Object.freeze([
  'bach-bwv997-fuga-opening.musicxml',
  'ps6-counterpoint-2v.musicxml',
  'ps6-counterpoint-3v.musicxml',
  'ps6-counterpoint-4v.musicxml',
  'ps6-counterpoint-4v-tie.musicxml',
]);

function fixture(fileName) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', fileName));
}

function assertExactRetainedSourceNotes(result) {
  const sourceMidiById = new Map(result.canonicalTabResult.measures.flatMap((measure) => (
    measure.events
      .filter((event) => event.type === 'note')
      .map((event) => [event.sourceEventId, event.pitch.midi])
  )));

  for (const disposition of result.canonicalTabResult.noteDispositions) {
    if (disposition.disposition !== 'KEEP') continue;
    assert.equal(disposition.octaveShiftSemitones, 0);
    assert.equal(disposition.targetPitch.midi, sourceMidiById.get(disposition.sourceEventId));
    assert.ok(disposition.selectedPosition);
    assert.ok(Number.isInteger(disposition.selectedPosition.string));
    assert.ok(Number.isInteger(disposition.selectedPosition.fret));
  }
}

test('PS-6B7 pinned BWV 565 grace gate is deterministic, exact-pitch and timing-neutral', () => {
  const fileName = 'bach-bwv565-grace-physical-transition.musicxml';
  const bytes = fixture(fileName);
  const first = processMusicXmlUpload({ fileName, bytes });
  const second = processMusicXmlUpload({ fileName, bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(first, second);
  assertExactRetainedSourceNotes(first);

  const graceBodies = [...first.musicXml.matchAll(/<note><grace slash="yes"\/>[\s\S]*?<\/note>/g)]
    .map((match) => match[0]);
  assert.equal(graceBodies.length, 4);
  assert.equal(graceBodies.every((body) => !body.includes('<duration>')), true);

  const notationF = first.musicXml.indexOf('<grace slash="yes"/><pitch><step>F</step><octave>4</octave></pitch>');
  const notationG = first.musicXml.indexOf('<grace slash="yes"/><pitch><step>G</step><octave>4</octave></pitch>');
  assert.ok(notationF >= 0);
  assert.ok(notationG > notationF);
  assert.match(first.musicXml, /<string>1<\/string><fret>1<\/fret>/);
  assert.match(first.musicXml, /<string>1<\/string><fret>3<\/fret>/);
});

for (const fileName of SUSTAINED_CORPUS) {
  test(`PS-6B7 sustained corpus remains deterministic and exact: ${fileName}`, () => {
    const bytes = fixture(fileName);
    const first = processMusicXmlUpload({ fileName, bytes });
    const second = processMusicXmlUpload({ fileName, bytes });

    assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
    assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
    assert.deepEqual(first, second);
    assertExactRetainedSourceNotes(first);
    assert.match(first.musicXml, /<sign>TAB<\/sign>/);
    assert.match(first.musicXml, /<technical>[\s\S]*?<string>\d<\/string>[\s\S]*?<fret>\d+<\/fret>/);
  });
}

test('PS-6B7 tied retained source identity stays on one physical position', () => {
  const fileName = 'ps6-counterpoint-4v-tie.musicxml';
  const result = processMusicXmlUpload({ fileName, bytes: fixture(fileName) });
  const tied = result.canonicalTabResult.noteDispositions.filter((entry) => (
    entry.sourceEventId === 'P1:measure:0:note:0'
    || entry.sourceEventId === 'P1:measure:1:note:0'
  ));

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(tied.length, 2);
  assert.deepEqual(tied[0].selectedPosition, tied[1].selectedPosition);
  assert.match(result.musicXml, /<tie type="start"\/>/);
  assert.match(result.musicXml, /<tie type="stop"\/>/);
});
