'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBasicChordLabelModel,
} = require('../src/music/basicChordLabelModel');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  processMusicXmlPolyphonicNoteEditV2,
} = require('../src/app/musicXmlPolyphonicNoteEditRuntimeV2');

function note(sourceEventId, midi, step, alter, octave, sourceOrder = 0) {
  const accidental = alter < 0 ? 'b'.repeat(-alter) : '#'.repeat(alter);
  return {
    type: 'note',
    sourceEventId,
    sourceOrder,
    onsetDivisions: 0,
    durationDivisions: 4,
    voice: '1',
    staff: 1,
    pitch: { midi, step, alter, octave, written: `${step}${accidental}${octave}` },
    tieStart: false,
    tieStop: false,
    source: {
      partId: 'P1',
      measureIndex: 0,
      measureNumber: '1',
      noteIndex: sourceOrder,
      chordWithPrevious: sourceOrder > 0,
    },
  };
}

function source(events) {
  return createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: {
      format: 'score-partwise',
      musicXmlVersion: '4.0',
      partId: 'P1',
    },
    measureCount: 1,
    eventCount: events.length,
    measures: [{
      measureId: createMeasureId('P1', 0),
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events,
    }],
  });
}

function classify(pitches) {
  return createBasicChordLabelModel(source(pitches.map((pitch, index) => (
    note(createSourceEventId('P1', 0, index), ...pitch, index)
  )))).labels;
}

test('UI-10 recognizes the fixed basic triad and seventh vocabulary', () => {
  const cases = [
    { pitches: [[48, 'C', 0, 3], [52, 'E', 0, 3], [55, 'G', 0, 3]], label: 'C', kind: 'major' },
    { pitches: [[45, 'A', 0, 2], [48, 'C', 0, 3], [52, 'E', 0, 3]], label: 'Am', kind: 'minor' },
    { pitches: [[47, 'B', 0, 2], [50, 'D', 0, 3], [53, 'F', 0, 3]], label: 'Bdim', kind: 'diminished' },
    { pitches: [[48, 'C', 0, 3], [52, 'E', 0, 3], [56, 'G', 1, 3]], label: 'Caug', kind: 'augmented' },
    { pitches: [[43, 'G', 0, 2], [47, 'B', 0, 2], [50, 'D', 0, 3], [53, 'F', 0, 3]], label: 'G7', kind: 'dominant' },
    { pitches: [[48, 'C', 0, 3], [52, 'E', 0, 3], [55, 'G', 0, 3], [59, 'B', 0, 3]], label: 'Cmaj7', kind: 'major-seventh' },
    { pitches: [[45, 'A', 0, 2], [48, 'C', 0, 3], [52, 'E', 0, 3], [55, 'G', 0, 3]], label: 'Am7', kind: 'minor-seventh' },
    { pitches: [[47, 'B', 0, 2], [50, 'D', 0, 3], [53, 'F', 0, 3], [57, 'A', 0, 3]], label: 'Bm7b5', kind: 'half-diminished' },
    { pitches: [[47, 'B', 0, 2], [50, 'D', 0, 3], [53, 'F', 0, 3], [56, 'A', -1, 3]], label: 'Bdim7', kind: 'diminished-seventh' },
  ];

  for (const chord of cases) {
    const labels = classify(chord.pitches);
    assert.equal(labels.length, 1, chord.label);
    assert.equal(labels[0].label, chord.label);
    assert.equal(labels[0].kind, chord.kind);
  }
});

test('UI-10 preserves spelling, octave doublings and deterministic slash bass', () => {
  const doubledDb = classify([
    [49, 'D', -1, 3], [53, 'F', 0, 3], [56, 'A', -1, 3], [61, 'D', -1, 4],
  ]);
  assert.equal(doubledDb[0].label, 'Db');
  assert.deepEqual(doubledDb[0].root, { step: 'D', alter: -1 });

  const inversion = classify([
    [40, 'E', 0, 2], [48, 'C', 0, 3], [55, 'G', 0, 3],
  ]);
  assert.equal(inversion[0].label, 'C/E');
  assert.deepEqual(inversion[0].bass, { step: 'E', alter: 0 });
});

test('UI-10 leaves incomplete, extra-tone and enharmonically ambiguous sets unlabeled', () => {
  assert.deepEqual(classify([[48, 'C', 0, 3], [52, 'E', 0, 3]]), []);
  assert.deepEqual(classify([
    [48, 'C', 0, 3], [52, 'E', 0, 3], [55, 'G', 0, 3], [62, 'D', 0, 4],
  ]), []);
  assert.deepEqual(classify([
    [48, 'C', 0, 3], [52, 'E', 0, 3], [56, 'G', 1, 3], [56, 'A', -1, 3],
  ]), []);
});

function polyXml(measures) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1">${measures}</part></score-partwise>`);
}

const attributes = '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>';

test('UI-10 renders derived root-position and inversion labels above POLY_V2 notation/TAB', () => {
  const bytes = polyXml(`<measure number="1">${attributes}
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
  </measure><measure number="2">
    <note><pitch><step>E</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <note><chord/><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
  </measure>`);
  const result = processMusicXmlUpload({ fileName: 'chords.musicxml', bytes });

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.match(result.musicXml, /<root-step>C<\/root-step><\/root><kind>major<\/kind>/);
  assert.match(result.musicXml, /<kind text="\/E">major<\/kind>/);
  assert.match(result.musicXml, /<bass><bass-step>E<\/bass-step><\/bass>/);
});

test('UI-10 safely consumes supported explicit harmony instead of overwriting it', () => {
  const bytes = polyXml(`<measure number="1">${attributes}
    <harmony><root><root-step>F</root-step></root><kind>major-seventh</kind><bass><bass-step>A</bass-step></bass></harmony>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
  </measure>`);
  const result = processMusicXmlUpload({ fileName: 'explicit.musicxml', bytes });

  assert.equal(result.status, 'PASS');
  assert.equal(result.route, 'POLY_V2');
  assert.match(result.musicXml, /<kind text="maj7\/A">major-seventh<\/kind>/);
  assert.doesNotMatch(result.musicXml, /<root-step>C<\/root-step>/);
});

test('UI-10 recomputes a derived label after acknowledged POLY_V2 edit/regenerate', () => {
  const bytes = polyXml(`<measure number="1">${attributes}
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
  </measure>`);
  const upload = processMusicXmlUpload({ fileName: 'edit-chord.musicxml', bytes });
  const events = upload.canonicalTabResult.measures[0].events.filter(
    (event) => event.type === 'note',
  );
  const target = events.find((event) => event.pitch.step === 'E');
  const group = upload.canonicalTabResult.simultaneousGroups[0];
  const edited = processMusicXmlPolyphonicNoteEditV2({
    fileName: 'edit-chord.musicxml',
    bytes,
    expectedInputSha256: upload.input.sha256,
    commands: [{
      measureIndex: 0,
      sourceOrder: target.sourceOrder,
      sourceEventId: target.sourceEventId,
      sourceGroupId: group.groupId,
      sourceGroupEventIds: [...group.sourceEventIds],
      pitch: { step: 'E', alter: -1, octave: 3 },
    }],
  });

  assert.equal(edited.status, 'PASS');
  assert.match(upload.musicXml, /<root-step>C<\/root-step><\/root><kind>major<\/kind>/);
  assert.match(edited.musicXml, /<kind text="m">minor<\/kind>/);
  assert.doesNotMatch(edited.musicXml, /<kind>major<\/kind>/);
});

test('UI-10 keeps ordinary MONO output stable and does not guess incomplete POLY groups', () => {
  const mono = processMusicXmlUpload({
    fileName: 'mono.musicxml',
    bytes: polyXml(`<measure number="1">${attributes}<note><pitch><step>E</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>`),
  });
  assert.equal(mono.status, 'PASS');
  assert.equal(mono.route, 'MONO_V1');
  assert.doesNotMatch(mono.musicXml, /<harmony>/);

  const unknown = processMusicXmlUpload({
    fileName: 'unknown.musicxml',
    bytes: polyXml(`<measure number="1">${attributes}
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>`),
  });
  assert.equal(unknown.status, 'PASS');
  assert.equal(unknown.route, 'POLY_V2');
  assert.doesNotMatch(unknown.musicXml, /<harmony>/);
});

test('UI-10 chord-label authority remains internal to the Workbench runtime', () => {
  const publicApi = require('../src');
  assert.equal(Object.hasOwn(publicApi, 'createBasicChordLabelModel'), false);
  assert.equal(Object.hasOwn(publicApi, 'extractBasicMusicXmlHarmony'), false);
});
