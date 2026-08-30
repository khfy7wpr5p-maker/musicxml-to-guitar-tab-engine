'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createGuitarConfiguration, STANDARD_TUNING } = require('../src/guitar/tuning');
const { positionToMidi } = require('../src/guitar/fretboard');
const {
  SUSTAINED_POSITION_POINT_STATUS,
  createSustainedGuitarPositionStateModel,
} = require('../src/music/sustainedGuitarPositionStateModel');

function note(step, octave, { alter = null, duration = 16, voice = '1' } = {}) {
  return `<note><pitch><step>${step}</step>${alter === null ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>1</staff></note>`;
}

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-4A tuning</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(xml, {}, runtime),
    runtime,
  );
}

function dropD() {
  return STANDARD_TUNING.map((entry) => (
    entry.number === 6
      ? { number: 6, pitch: 'D2', midi: 38 }
      : { ...entry }
  ));
}

test('PS-4A uses relative-from-capo positions for held and attacked notes without changing source facts', () => {
  const source = sourceModel(score([
    note('F', 2, { alter: 1, duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('B', 2, { duration: 12, voice: '2' }),
  ].join('')));
  const before = structuredClone(source);
  const options = { capoFret: 2 };
  const configuration = createGuitarConfiguration(options);
  const model = createSustainedGuitarPositionStateModel(source, null, options);
  const laterPoint = model.measures[0].points.find((point) => point.timeDivisions === 4);

  assert.equal(laterPoint.status, SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE);
  assert.ok(laterPoint.holdLogicalNoteIds.length === 1);
  assert.ok(laterPoint.attackLogicalNoteIds.length === 1);
  assert.ok(laterPoint.candidates.some((candidate) => (
    candidate.positions.some((position) => position.targetMidi === 42 && position.string === 6 && position.fret === 0)
    && candidate.positions.some((position) => position.targetMidi === 47 && position.string === 5 && position.fret === 0)
  )));
  for (const candidate of laterPoint.candidates) {
    for (const position of candidate.positions) {
      assert.equal(positionToMidi(position, configuration), position.targetMidi);
    }
  }
  assert.deepEqual(source, before);
});

test('PS-4A fails closed for Standard+capo low pitch but accepts the same pitch under Drop D+capo', () => {
  const source = sourceModel(score(note('E', 2, { duration: 16 })));
  const before = structuredClone(source);

  const standardCapo = createSustainedGuitarPositionStateModel(source, null, { capoFret: 2 });
  assert.equal(standardCapo.measures[0].points[0].status, SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT);
  assert.equal(standardCapo.measures[0].points[0].candidateCount, 0);

  const options = { tuning: dropD(), capoFret: 2 };
  const configuration = createGuitarConfiguration(options);
  const dropDCapo = createSustainedGuitarPositionStateModel(source, null, options);
  const point = dropDCapo.measures[0].points[0];
  assert.equal(point.status, SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE);
  assert.ok(point.candidates.some((candidate) => (
    candidate.positions.length === 1
    && candidate.positions[0].string === 6
    && candidate.positions[0].fret === 0
  )));
  for (const candidate of point.candidates) {
    assert.equal(positionToMidi(candidate.positions[0], configuration), candidate.positions[0].targetMidi);
  }
  assert.deepEqual(source, before);
  assert.equal(source.measures[0].events[0].pitch.midi, 40);
});
