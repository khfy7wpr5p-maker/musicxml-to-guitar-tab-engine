'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const publicApi = require('../src');
const {
  IndependentObservedOutputProducerError,
  createTeacherArrangementObservedOutput,
} = require('../src/benchmark/independentObservedOutputProducer');
const {
  MATCH_CLASSIFICATION,
  evaluateTeacherApprovedV11ObservedOutput,
} = require('../src/benchmark/teacherArrangementObservedOutputScorer');

const ROOT = path.resolve(__dirname, '..');
const benchmarkPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.v0.2.0.json');
const approvalPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'approvals', 'teacher-approval-v0.2.0-2026-08-20.json');
const baselinePath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.json');
const reviewPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'reviews', 'teacher-review-2026-08-20.json');

function text(filePath) { return fs.readFileSync(filePath, 'utf8'); }
function json(filePath) { return JSON.parse(text(filePath)); }

const CASE_IDS = [
  'pa11-seed-001-two-note-open-vs-barre',
  'pa11-seed-002-three-note-voicing',
  'pa11-seed-003-conservative-reduction',
  'pa11-seed-004-octave-displacement',
];

function sourceEntries() {
  const baseline = json(baselinePath);
  return baseline.cases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    sourceText: text(path.join(ROOT, benchmarkCase.source.path)),
  }));
}

function nullObservation() {
  return {
    documentType: 'IndependentEngineArrangementObservation',
    contractVersion: '1.0.0',
    evaluationScope: {
      benchmarkId: 'teacher-arrangement-seed-v1',
      benchmarkVersion: '0.2.0',
      caseIds: [...CASE_IDS],
    },
    cases: CASE_IDS.map((caseId) => ({ caseId, result: null })),
  };
}

function selectedObservation() {
  return {
    documentType: 'IndependentEngineArrangementObservation',
    contractVersion: '1.0.0',
    evaluationScope: {
      benchmarkId: 'synthetic-eval',
      benchmarkVersion: '1.0.0',
      caseIds: ['case-a', 'case-b'],
    },
    cases: [
      {
        caseId: 'case-b',
        result: null,
      },
      {
        caseId: 'case-a',
        result: {
          sourceOutcomes: [
            { sourceEventId: 'P1:measure:0:note:0', sourceMidi: 60, disposition: 'RETAINED', targetMidis: [48, 60] },
          ],
          selectedTones: [
            { sourceEventId: 'P1:measure:0:note:0', targetMidi: 48, string: 5, fret: 3, finger: 3 },
            { sourceEventId: 'P1:measure:0:note:0', targetMidi: 60, string: 2, fret: 1, finger: 1 },
          ],
          barres: [],
        },
      },
    ],
  };
}

function scoreInput(observedOutput) {
  return {
    benchmarkText: text(benchmarkPath),
    approvalText: text(approvalPath),
    baselineText: text(baselinePath),
    reviewText: text(reviewPath),
    sourceEntries: sourceEntries(),
    observedOutput,
  };
}

test('PA-11.3J emits PA-11.3I-compatible no-result observations without gold answers', () => {
  const produced = createTeacherArrangementObservedOutput(nullObservation());
  const report = evaluateTeacherApprovedV11ObservedOutput(scoreInput(produced));
  assert.equal(report.caseCount, 4);
  assert.equal(report.matchedCaseCount, 0);
  assert.equal(report.unmatchedCount, 4);
  assert.deepEqual(
    report.cases.map((entry) => entry.classification),
    Array(4).fill(MATCH_CLASSIFICATION.UNMATCHED),
  );
});

test('PA-11.3J orders engine cases by evaluation scope and generates local tone IDs', () => {
  const produced = createTeacherArrangementObservedOutput(selectedObservation());
  assert.deepEqual(produced.cases.map((entry) => entry.caseId), ['case-a', 'case-b']);
  assert.equal(produced.cases[0].observedArrangement.realizedTones[0].realizedToneId, 'engine-observation:0:tone:0');
  assert.equal(produced.cases[0].observedArrangement.realizedTones[1].realizedToneId, 'engine-observation:0:tone:1');
  assert.equal(produced.cases[1].observedArrangement, null);
  assert.equal(JSON.stringify(produced).includes('arrangementId'), false);
  assert.equal(JSON.stringify(produced).includes('preferredArrangementId'), false);
});

test('PA-11.3J rejects gold-bearing or otherwise unknown producer fields', () => {
  const resultLeak = selectedObservation();
  resultLeak.cases[1].result.arrangementId = 'teacher-gold-id';
  assert.throws(
    () => createTeacherArrangementObservedOutput(resultLeak),
    (error) => error instanceof IndependentObservedOutputProducerError,
  );

  const scopeLeak = selectedObservation();
  scopeLeak.evaluationScope.acceptedArrangements = [];
  assert.throws(
    () => createTeacherArrangementObservedOutput(scopeLeak),
    (error) => error instanceof IndependentObservedOutputProducerError,
  );
});

test('PA-11.3J rejects source-outcome/selected-tone provenance disagreement', () => {
  const input = selectedObservation();
  input.cases[1].result.sourceOutcomes[0].targetMidis = [48];
  assert.throws(
    () => createTeacherArrangementObservedOutput(input),
    (error) => error instanceof IndependentObservedOutputProducerError,
  );
});

test('PA-11.3J fails closed without executing accessor-backed fields', () => {
  const input = selectedObservation();
  let executed = false;
  Object.defineProperty(input.cases[0], 'caseId', {
    enumerable: true,
    configurable: true,
    get() {
      executed = true;
      return 'case-b';
    },
  });
  assert.throws(
    () => createTeacherArrangementObservedOutput(input),
    (error) => error instanceof IndependentObservedOutputProducerError,
  );
  assert.equal(executed, false);
});

test('PA-11.3J rejects missing/extra scope cases instead of silently reshaping measurement', () => {
  const missing = selectedObservation();
  missing.cases.pop();
  assert.throws(() => createTeacherArrangementObservedOutput(missing));

  const extra = selectedObservation();
  extra.cases[0].caseId = 'case-c';
  assert.throws(() => createTeacherArrangementObservedOutput(extra));
});

test('PA-11.3J output is deeply frozen and remains internal', () => {
  const produced = createTeacherArrangementObservedOutput(selectedObservation());
  assert.equal(Object.isFrozen(produced), true);
  assert.equal(Object.isFrozen(produced.cases), true);
  assert.equal(Object.isFrozen(produced.cases[0].observedArrangement), true);
  assert.equal(Object.hasOwn(publicApi, 'createTeacherArrangementObservedOutput'), false);
  assert.equal(Object.hasOwn(publicApi, 'IndependentObservedOutputProducerError'), false);
});