'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  processMusicXmlPolyphonicNoteEditV2,
} = require('../src/app/musicXmlPolyphonicNoteEditRuntimeV2');

const CORPUS = Object.freeze([
  'bach-bwv997-fuga-opening.musicxml',
  'ps6-counterpoint-2v.musicxml',
  'ps6-counterpoint-3v.musicxml',
  'ps6-counterpoint-4v.musicxml',
  'ps6-counterpoint-4v-tie.musicxml',
]);

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

for (const fileName of CORPUS) {
  test(`POLY-12 production upload completes sustained canonical selection: ${fileName}`, () => {
    const bytes = fixture(fileName);
    const first = processMusicXmlUpload({ fileName, bytes });
    const second = processMusicXmlUpload({ fileName, bytes });

    assert.equal(first.status, 'PASS');
    assert.equal(first.route, 'POLY_V2');
    assert.deepEqual(first, second);
    assert.ok(first.canonicalTabResult.noteDispositions.length >= 2);
    const sourceMidiById = new Map(first.canonicalTabResult.measures.flatMap((measure) => (
      measure.events
        .filter((event) => event.type === 'note')
        .map((event) => [event.sourceEventId, event.pitch.midi])
    )));
    for (const disposition of first.canonicalTabResult.noteDispositions) {
      assert.equal(disposition.disposition, 'KEEP');
      assert.equal(disposition.octaveShiftSemitones, 0);
      assert.equal(disposition.targetPitch.midi, sourceMidiById.get(disposition.sourceEventId));
      assert.ok(disposition.selectedPosition);
    }
    assert.match(first.musicXml, /<technical>[\s\S]*?<string>\d<\/string>[\s\S]*?<fret>\d+<\/fret>/);
  });
}

test('POLY-12 retained tie segments keep one exact string/fret placement', () => {
  const fileName = 'ps6-counterpoint-4v-tie.musicxml';
  const result = processMusicXmlUpload({ fileName, bytes: fixture(fileName) });
  const tied = result.canonicalTabResult.noteDispositions.filter((entry) => (
    entry.sourceEventId === 'P1:measure:0:note:0'
    || entry.sourceEventId === 'P1:measure:1:note:0'
  ));

  assert.equal(result.status, 'PASS');
  assert.equal(tied.length, 2);
  assert.deepEqual(tied[0].selectedPosition, tied[1].selectedPosition);
  assert.match(result.musicXml, /<tie type="start"\/>/);
  assert.match(result.musicXml, /<tie type="stop"\/>/);
});

test('POLY-12 real fugue-class upload supports source-identity edit and TAB regeneration', () => {
  const fileName = 'bach-bwv997-fuga-opening.musicxml';
  const bytes = fixture(fileName);
  const upload = processMusicXmlUpload({ fileName, bytes });
  const target = upload.canonicalTabResult.measures[1].events.find((event) => (
    event.type === 'note' && event.voice === '1'
  ));
  assert.ok(target);

  const edited = processMusicXmlPolyphonicNoteEditV2({
    fileName,
    bytes,
    expectedInputSha256: upload.input.sha256,
    commands: [{
      measureIndex: 1,
      sourceOrder: target.sourceOrder,
      sourceEventId: target.sourceEventId,
      sourceGroupId: null,
      sourceGroupEventIds: [target.sourceEventId],
      pitch: { step: 'F', alter: 1, octave: 3 },
    }],
  });

  assert.equal(edited.status, 'PASS');
  assert.equal(edited.route, 'POLY_V2');
  assert.equal(edited.revision.revisionNumber, 1);
  assert.equal(
    edited.canonicalTabResult.measures[1].events.find(
      (event) => event.sourceEventId === target.sourceEventId,
    ).pitch.written,
    'F#3',
  );
  assert.match(edited.musicXml, /<sign>TAB<\/sign>/);
});
