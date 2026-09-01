'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createDeterministicReductionPlan } = require('../src/music/deterministicReductionPlan');

const DROP_D = Object.freeze([
  Object.freeze({ number: 1, pitch: 'E4', midi: 64 }),
  Object.freeze({ number: 2, pitch: 'B3', midi: 59 }),
  Object.freeze({ number: 3, pitch: 'G3', midi: 55 }),
  Object.freeze({ number: 4, pitch: 'D3', midi: 50 }),
  Object.freeze({ number: 5, pitch: 'A2', midi: 45 }),
  Object.freeze({ number: 6, pitch: 'D2', midi: 38 }),
]);

function score(step, octave) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-6 tuning</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
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

function preservedDecision() {
  return [{
    decisionType: 'PRESERVED',
    sourceEventIds: ['P1:measure:0:note:0'],
    sourceGroupId: null,
  }];
}

test('PA-6 default reducer envelope remains exact Standard E2..E6', () => {
  const plan = createDeterministicReductionPlan(sourceModel(score('E', 2)), preservedDecision());
  assert.deepEqual(plan.registerEnvelope, { minimumMidi: 40, maximumMidi: 84 });
  assert.equal(plan.instructions[0].targetMidi, 40);
});

test('PA-6 reducer accepts native Drop-D D2 without octave displacement', () => {
  const plan = createDeterministicReductionPlan(
    sourceModel(score('D', 2)),
    preservedDecision(),
    null,
    { tuning: DROP_D },
  );
  assert.deepEqual(plan.registerEnvelope, { minimumMidi: 38, maximumMidi: 84 });
  assert.equal(plan.instructions[0].disposition, 'KEEP');
  assert.equal(plan.instructions[0].targetMidi, 38);
  assert.equal(plan.instructions[0].octaveShiftSemitones, 0);
  assert.equal(plan.instructions[0].ruleId, 'PRESERVE_IN_REGISTER');
});

test('capo does not shift the PA-6 reducer arrangement envelope', () => {
  const withoutCapo = createDeterministicReductionPlan(
    sourceModel(score('D', 2)),
    preservedDecision(),
    null,
    { tuning: DROP_D, capoFret: 0 },
  );
  const withCapo = createDeterministicReductionPlan(
    sourceModel(score('D', 2)),
    preservedDecision(),
    null,
    { tuning: DROP_D, capoFret: 4 },
  );
  assert.deepEqual(withCapo.registerEnvelope, withoutCapo.registerEnvelope);
});

test('PA-6 reducer remains fail-closed outside the configured envelope', () => {
  assert.throws(
    () => createDeterministicReductionPlan(
      sourceModel(score('C', 7)),
      preservedDecision(),
      null,
      { tuning: DROP_D },
    ),
    (error) => {
      assert.equal(error.code, 'INVALID_DETERMINISTIC_REDUCTION_PLAN');
      assert.match(error.message, /configured PA-6 register envelope/);
      return true;
    },
  );
});
