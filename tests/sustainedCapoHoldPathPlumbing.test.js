'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGuitarConfiguration, STANDARD_TUNING } = require('../src/guitar/tuning');
const { positionToMidi } = require('../src/guitar/fretboard');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  createSustainedPolyphonicPathSelection,
} = require('../src/music/sustainedPolyphonicPathSolver');

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(xml, {}, runtime),
    runtime,
  );
}

function singleNoteScore(step, octave) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Capo path</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function heldOverlapScore() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Capo hold</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

test('PS-5 uses the same Drop-D plus capo configuration for physical states and path selection', () => {
  const source = sourceModel(singleNoteScore('E', 2));
  const tuning = STANDARD_TUNING.map((entry) => (
    entry.number === 6 ? { number: 6, pitch: 'D2', midi: 38 } : { ...entry }
  ));
  const guitarOptions = { tuning, capoFret: 2 };
  const configuration = createGuitarConfiguration(guitarOptions);

  const path = createSustainedPolyphonicPathSelection(source, null, guitarOptions);
  assert.equal(path.selectedLogicalNoteCount, 1);
  const selected = path.logicalNoteSelections[0];
  assert.equal(selected.targetMidi, 40);
  assert.equal(selected.string, 6);
  assert.equal(selected.fret, 0);
  assert.equal(positionToMidi({ string: selected.string, fret: selected.fret }, configuration), 40);

  assert.throws(
    () => createSustainedPolyphonicPathSelection(source, null, { capoFret: 2 }),
    (error) => error
      && error.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
      && error.details.reason === 'UNPLAYABLE_PHYSICAL_POINT',
  );
});

test('PS-5 preserves held string/fret continuity under capo without changing source pitch facts', () => {
  const source = sourceModel(heldOverlapScore());
  const before = JSON.stringify(source);
  const guitarOptions = { capoFret: 2 };
  const configuration = createGuitarConfiguration(guitarOptions);
  const path = createSustainedPolyphonicPathSelection(source, null, guitarOptions);

  const holdPoint = path.selectedPointStates.find((point) => point.holdLogicalNoteIds.length > 0);
  assert.ok(holdPoint);
  const logicalNoteId = holdPoint.holdLogicalNoteIds[0];
  const previousPointIndex = path.selectedPointStates.indexOf(holdPoint) - 1;
  assert.ok(previousPointIndex >= 0);
  const previousPoint = path.selectedPointStates[previousPointIndex];
  const previous = previousPoint.positions.find((position) => position.logicalNoteId === logicalNoteId);
  const current = holdPoint.positions.find((position) => position.logicalNoteId === logicalNoteId);
  assert.ok(previous);
  assert.ok(current);
  assert.equal(current.string, previous.string);
  assert.equal(current.fret, previous.fret);
  assert.equal(positionToMidi({ string: current.string, fret: current.fret }, configuration), current.targetMidi);
  assert.equal(JSON.stringify(source), before);
});
