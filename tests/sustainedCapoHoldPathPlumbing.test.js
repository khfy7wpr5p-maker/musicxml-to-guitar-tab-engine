'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { STANDARD_TUNING } = require('../src/guitar/tuning');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  TRANSITION_STATUS,
  TRANSITION_COMPATIBILITY_MODE,
  createSustainedGuitarTransitionModel,
} = require('../src/music/sustainedGuitarTransitionModel');
const {
  SUSTAINED_PHYSICAL_POINT_STATUS,
  createSustainedLeftHandPhysicalStateModel,
} = require('../src/music/sustainedLeftHandPhysicalStateModel');
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

function heldDropDCapoScore() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Capo hold</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    <note><pitch><step>E</step><octave>2</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    <backup><duration>12</duration></backup>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function firstPoint(model) {
  return model.measures[0].points[0];
}

test('PS-4B, PS-4C and PS-5 share Drop-D plus capo configuration without changing HOLD continuity', () => {
  const source = sourceModel(heldDropDCapoScore());
  const tuning = STANDARD_TUNING.map((entry) => (
    entry.number === 6 ? { number: 6, pitch: 'D2', midi: 38 } : { ...entry }
  ));
  const guitarOptions = { tuning, capoFret: 2 };

  const transitions = createSustainedGuitarTransitionModel(source, null, guitarOptions);
  const physical = createSustainedLeftHandPhysicalStateModel(source, null, guitarOptions);
  const path = createSustainedPolyphonicPathSelection(source, null, guitarOptions);

  assert.equal(transitions.transitions[0].status, TRANSITION_STATUS.COMPATIBLE);
  assert.equal(
    transitions.transitions[0].compatibilityMode,
    TRANSITION_COMPATIBILITY_MODE.HOLD_SIGNATURE_BUCKETS,
  );
  assert.equal(firstPoint(physical).status, SUSTAINED_PHYSICAL_POINT_STATUS.PHYSICAL_CANDIDATES_AVAILABLE);

  const holdPoint = path.selectedPointStates.find((point) => point.holdLogicalNoteIds.length > 0);
  const previousPoint = path.selectedPointStates[path.selectedPointStates.indexOf(holdPoint) - 1];
  const heldId = holdPoint.holdLogicalNoteIds[0];
  const previous = previousPoint.positions.find((position) => position.logicalNoteId === heldId);
  const current = holdPoint.positions.find((position) => position.logicalNoteId === heldId);
  assert.equal(current.string, previous.string);
  assert.equal(current.fret, previous.fret);

  const capoOnly = { capoFret: 2 };
  const capoOnlyTransitions = createSustainedGuitarTransitionModel(source, null, capoOnly);
  const capoOnlyPhysical = createSustainedLeftHandPhysicalStateModel(source, null, capoOnly);
  assert.equal(capoOnlyTransitions.transitions[0].status, TRANSITION_STATUS.UNPLAYABLE_EXACT);
  assert.equal(firstPoint(capoOnlyPhysical).status, SUSTAINED_PHYSICAL_POINT_STATUS.UNPLAYABLE_EXACT);
  assert.throws(
    () => createSustainedPolyphonicPathSelection(source, null, capoOnly),
    (error) => error
      && error.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
      && error.details.reason === 'UNPLAYABLE_PHYSICAL_POINT',
  );
});
