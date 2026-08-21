'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  BLIND_BASELINE_POLICY,
  createBlindBaselineArrangementDecisions,
  createBlindBaselineEngineResult,
} = require('../src/benchmark/blindBaselineEngineObserver');
const {
  createTeacherArrangementObservedOutput,
} = require('../src/benchmark/independentObservedOutputProducer');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_ROOT = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'fixtures');

function sourceModel(filename) {
  const xml = fs.readFileSync(path.join(FIXTURE_ROOT, filename), 'utf8');
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function notes(source) {
  return source.measures.flatMap((measure) => measure.events.filter((event) => event.type === 'note'));
}

function producerObservation(caseId, result) {
  return {
    documentType: 'IndependentEngineArrangementObservation',
    contractVersion: '1.0.0',
    evaluationScope: {
      benchmarkId: 'synthetic-no-gold-scope',
      benchmarkVersion: '0.0.0',
      caseIds: [caseId],
    },
    cases: [{ caseId, result }],
  };
}

test('PA-11.3K uses only PRESERVED or OCTAVE_DISPLACED source-derived decisions', () => {
  const interval = sourceModel('two-note-interval.musicxml');
  const high = sourceModel('high-note-octave.musicxml');
  const triad = sourceModel('three-note-triad.musicxml');

  assert.deepEqual(
    createBlindBaselineArrangementDecisions(interval).map((entry) => entry.decisionType),
    ['PRESERVED', 'PRESERVED'],
  );
  assert.deepEqual(
    createBlindBaselineArrangementDecisions(high).map((entry) => entry.decisionType),
    ['OCTAVE_DISPLACED'],
  );
  assert.deepEqual(
    createBlindBaselineArrangementDecisions(triad).map((entry) => entry.decisionType),
    ['PRESERVED', 'PRESERVED', 'PRESERVED'],
  );
});

test('PA-11.3K selects the deterministic low-position open interval without teacher-gold input', () => {
  const source = sourceModel('two-note-interval.musicxml');
  const sourceNotes = notes(source);
  const result = createBlindBaselineEngineResult(source);

  assert.ok(result);
  assert.equal(result.sourceOutcomes.length, 2);
  assert.deepEqual(result.sourceOutcomes.map((entry) => entry.sourceMidi), [60, 64]);
  assert.deepEqual(result.sourceOutcomes.map((entry) => entry.targetMidis), [[60], [64]]);
  assert.deepEqual(result.selectedTones, [
    {
      sourceEventId: sourceNotes[0].sourceEventId,
      targetMidi: 60,
      string: 2,
      fret: 1,
      finger: 1,
    },
    {
      sourceEventId: sourceNotes[1].sourceEventId,
      targetMidi: 64,
      string: 1,
      fret: 0,
      finger: 0,
    },
  ]);
  assert.deepEqual(result.barres, []);
});

test('PA-11.3K handles the out-of-register singleton through PA-6 octave displacement and lowest-fret position', () => {
  const source = sourceModel('high-note-octave.musicxml');
  const sourceNote = notes(source)[0];
  const result = createBlindBaselineEngineResult(source);

  assert.ok(result);
  assert.deepEqual(result.sourceOutcomes, [{
    sourceEventId: sourceNote.sourceEventId,
    sourceMidi: 86,
    disposition: 'RETAINED',
    targetMidis: [74],
  }]);
  assert.deepEqual(result.selectedTones, [{
    sourceEventId: sourceNote.sourceEventId,
    targetMidi: 74,
    string: 1,
    fret: 10,
    finger: null,
  }]);
  assert.deepEqual(result.barres, []);
});

test('PA-11.3K does not synthesize teacher revoicing for in-register triad or four-note chord', () => {
  for (const [filename, expectedMidis] of [
    ['three-note-triad.musicxml', [60, 64, 67]],
    ['four-note-reduction.musicxml', [60, 64, 67, 71]],
  ]) {
    const source = sourceModel(filename);
    const result = createBlindBaselineEngineResult(source);
    assert.ok(result, `${filename} must produce a physical blind-baseline result`);
    assert.deepEqual(result.sourceOutcomes.map((entry) => entry.sourceMidi), expectedMidis);
    assert.deepEqual(result.sourceOutcomes.map((entry) => entry.targetMidis), expectedMidis.map((midi) => [midi]));
    assert.deepEqual(
      [...result.selectedTones.map((entry) => entry.targetMidi)].sort((a, b) => a - b),
      [...expectedMidis].sort((a, b) => a - b),
    );
  }
});

test('PA-11.3K is deterministic and emits the exact PA-11.3J engine-result shape', () => {
  const source = sourceModel('three-note-triad.musicxml');
  const first = createBlindBaselineEngineResult(source);
  const second = createBlindBaselineEngineResult(source);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['barres', 'selectedTones', 'sourceOutcomes']);
  assert.equal(Object.isFrozen(first), true);

  const observed = createTeacherArrangementObservedOutput(
    producerObservation('synthetic-case', first),
  );
  assert.equal(observed.documentType, 'TeacherArrangementObservedOutput');
  assert.equal(observed.cases[0].caseId, 'synthetic-case');
  assert.ok(observed.cases[0].observedArrangement);
});

test('PA-11.3K policy remains evaluation-only and package-root API remains unchanged', () => {
  assert.equal(BLIND_BASELINE_POLICY, 'PRESERVE_OR_OCTAVE_MIN_ERGONOMIC_1.0');
  assert.equal(Object.hasOwn(publicApi, 'createBlindBaselineEngineResult'), false);
  assert.equal(Object.hasOwn(publicApi, 'createBlindBaselineArrangementDecisions'), false);
});
