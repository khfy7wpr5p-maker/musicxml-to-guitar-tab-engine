'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const {
  createCanonicalTabResultV2,
} = require('../src/tab/canonicalTabResultV2');
const {
  validateCanonicalTabResultV2,
} = require('../src/contracts/canonicalTabResultV2Contract');
const {
  dispatchCanonicalTabResult,
} = require('../src/contracts/canonicalTabResultDispatcher');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriterV2');

function note(index, step, octave, midi, chordWithPrevious) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'note',
    voice: '1',
    staff: 1,
    onsetDivisions: 0,
    durationDivisions: 4,
    pitch: { step, alter: 0, octave, midi, written: `${step}${octave}` },
    tieStart: false,
    tieStop: false,
    source: {
      partId: 'P1',
      measureIndex: 0,
      measureNumber: '1',
      noteIndex: index,
      chordWithPrevious,
    },
  };
}

function fixture() {
  const events = [
    note(0, 'C', 4, 60, false),
    note(1, 'E', 4, 64, true),
  ];
  const source = createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
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
  const decisions = events.map((event) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [event.sourceEventId],
    sourceGroupId: null,
  }));
  return { source, decisions };
}

test('explicit nonzero POLY capo produces exact internal 2.1.0 facts and relative positions', () => {
  const { source, decisions } = fixture();
  const result = createCanonicalTabResultV2(source, decisions, null, { capoFret: 2 });

  assert.equal(result.schemaVersion, '2.1.0');
  assert.equal(result.guitar.capoFret, 2);
  assert.equal(result.guitar.fretSemantics, 'RELATIVE_FROM_CAPO');
  assert.deepEqual(
    result.noteDispositions.map(({ selectedPosition }) => selectedPosition),
    [{ string: 3, fret: 3 }, { string: 2, fret: 3 }],
  );
  assert.equal(validateCanonicalTabResultV2(result), result);
  assert.equal(dispatchCanonicalTabResult(result), result);

  const xml = serializeCanonicalTabResultV2ToMusicXml(result);
  assert.match(xml, /<staff-tuning line="6">.*<\/staff-tuning><capo>2<\/capo>/);
  assert.match(xml, /<string>3<\/string><fret>3<\/fret>/);
  assert.match(xml, /<string>2<\/string><fret>3<\/fret>/);
});

test('2.0.0 remains exact while malformed 2.1.0 capo facts fail closed', () => {
  const { source, decisions } = fixture();
  const standard = createCanonicalTabResultV2(source, decisions);
  assert.equal(standard.schemaVersion, '2.0.0');
  assert.deepEqual(
    Object.keys(standard.guitar),
    ['contractVersion', 'tuning', 'minimumFret', 'maximumFret'],
  );

  const capo = JSON.parse(JSON.stringify(
    createCanonicalTabResultV2(source, decisions, null, { capoFret: 2 }),
  ));
  capo.guitar.capoFret = 0;
  assert.throws(
    () => validateCanonicalTabResultV2(capo),
    (error) => error && error.code === 'INVALID_CANONICAL_TAB_RESULT_V2',
  );
});
