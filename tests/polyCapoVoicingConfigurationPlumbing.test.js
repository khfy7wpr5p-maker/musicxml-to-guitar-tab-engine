'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createGuitarConfiguration, STANDARD_TUNING } = require('../src/guitar/tuning');
const { positionToMidi } = require('../src/guitar/fretboard');
const { createGuitarVoicingCandidateModel } = require('../src/music/guitarVoicingCandidateModel');

function note(step, octave, { alter = null, chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step>${alter === null ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
}

function score(first, second) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>POLY tuning</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${first}${second}
  </measure></part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function preserve(source) {
  return source.measures[0].events.filter((event) => event.type === 'note').map((event) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [event.sourceEventId],
    sourceGroupId: null,
  }));
}

function dropD() {
  return STANDARD_TUNING.map((entry) => (
    entry.number === 6
      ? { number: 6, pitch: 'D2', midi: 38 }
      : { ...entry }
  ));
}

test('PA-7 preserves Standard/capo-0 positions and uses relative-from-capo frets with capo 2', () => {
  const source = sourceModel(score(
    note('F', 2, { alter: 1 }),
    note('B', 2, { chord: true }),
  ));
  const before = structuredClone(source);
  const decisions = preserve(source);

  const baseline = createGuitarVoicingCandidateModel(source, decisions);
  const capo = createGuitarVoicingCandidateModel(source, decisions, null, { capoFret: 2 });

  assert.deepEqual(baseline.groups[0].candidates, [{
    candidateId: `${baseline.groups[0].sourceGroupId}:voicing:0`,
    positionCount: 2,
    positions: [
      { sourceEventId: source.measures[0].events[0].sourceEventId, targetMidi: 42, string: 6, fret: 2 },
      { sourceEventId: source.measures[0].events[1].sourceEventId, targetMidi: 47, string: 5, fret: 2 },
    ],
  }]);
  assert.deepEqual(capo.groups[0].candidates, [{
    candidateId: `${capo.groups[0].sourceGroupId}:voicing:0`,
    positionCount: 2,
    positions: [
      { sourceEventId: source.measures[0].events[0].sourceEventId, targetMidi: 42, string: 6, fret: 0 },
      { sourceEventId: source.measures[0].events[1].sourceEventId, targetMidi: 47, string: 5, fret: 0 },
    ],
  }]);
  assert.deepEqual(source, before);
});

test('PA-7 uses one custom-tuning+capo configuration without fallback or source pitch mutation', () => {
  const source = sourceModel(score(
    note('E', 2),
    note('B', 2, { chord: true }),
  ));
  const before = structuredClone(source);
  const decisions = preserve(source);

  const standardCapo = createGuitarVoicingCandidateModel(source, decisions, null, { capoFret: 2 });
  assert.equal(standardCapo.groups[0].candidateCount, 0);

  const options = { tuning: dropD(), capoFret: 2 };
  const configuration = createGuitarConfiguration(options);
  const customCapo = createGuitarVoicingCandidateModel(source, decisions, null, options);
  assert.equal(customCapo.groups[0].candidateCount, 1);
  assert.deepEqual(customCapo.groups[0].candidates[0].positions.map(({ string, fret }) => ({ string, fret })), [
    { string: 6, fret: 0 },
    { string: 5, fret: 0 },
  ]);

  for (const position of customCapo.groups[0].candidates[0].positions) {
    assert.equal(positionToMidi(position, configuration), position.targetMidi);
  }
  assert.deepEqual(source, before);
  assert.equal(source.measures[0].events[0].pitch.midi, 40);
});
