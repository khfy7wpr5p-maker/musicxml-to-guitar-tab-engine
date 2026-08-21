'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const publicApi = require('../src');
const {
  BLIND_BASELINE_POLICY,
} = require('../src/benchmark/blindBaselineEngineObserver');
const {
  produceBlindBaselineObservedOutput,
} = require('../src/benchmark/blindBaselineObservationRunner');
const {
  MATCH_CLASSIFICATION,
  evaluateTeacherApprovedV11ObservedOutput,
} = require('../src/benchmark/teacherArrangementObservedOutputScorer');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_ROOT = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1');
const benchmarkPath = path.join(BENCHMARK_ROOT, 'benchmark.proposed.v0.2.0.json');
const approvalPath = path.join(BENCHMARK_ROOT, 'approvals', 'teacher-approval-v0.2.0-2026-08-20.json');
const baselinePath = path.join(BENCHMARK_ROOT, 'benchmark.proposed.json');
const reviewPath = path.join(BENCHMARK_ROOT, 'reviews', 'teacher-review-2026-08-20.json');
const measurementPath = path.join(BENCHMARK_ROOT, 'measurements', 'blind-baseline-v1.json');

const CASES = Object.freeze([
  Object.freeze({
    caseId: 'pa11-seed-001-two-note-open-vs-barre',
    fixture: 'two-note-interval.musicxml',
  }),
  Object.freeze({
    caseId: 'pa11-seed-002-three-note-voicing',
    fixture: 'three-note-triad.musicxml',
  }),
  Object.freeze({
    caseId: 'pa11-seed-003-conservative-reduction',
    fixture: 'four-note-reduction.musicxml',
  }),
  Object.freeze({
    caseId: 'pa11-seed-004-octave-displacement',
    fixture: 'high-note-octave.musicxml',
  }),
]);

function text(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function json(filePath) {
  return JSON.parse(text(filePath));
}

function blindInput() {
  return {
    evaluationScope: {
      benchmarkId: 'teacher-arrangement-seed-v1',
      benchmarkVersion: '0.2.0',
      caseIds: CASES.map((entry) => entry.caseId),
    },
    sourceEntries: CASES.map((entry) => ({
      caseId: entry.caseId,
      sourceText: text(path.join(BENCHMARK_ROOT, 'fixtures', entry.fixture)),
    })),
  };
}

function scoreInput(observedOutput) {
  return {
    benchmarkText: text(benchmarkPath),
    approvalText: text(approvalPath),
    baselineText: text(baselinePath),
    reviewText: text(reviewPath),
    sourceEntries: blindInput().sourceEntries,
    observedOutput,
  };
}

function measurementSnapshot(report) {
  return {
    documentType: 'TeacherArrangementBlindBaselineMeasurement',
    contractVersion: '1.0.0',
    mode: 'evaluation-only',
    authority: 'none',
    benchmarkId: report.benchmarkId,
    benchmarkVersion: report.benchmarkVersion,
    benchmarkGitBlobSha: '21a02c053a8bdfee781846a6c7f35b0c66600513',
    approvalGitBlobSha: '21e76f6f81ad22754b73e17253b413cc0ef9aebd',
    effectiveReviewStatus: report.effectiveReviewStatus,
    selectorPolicy: BLIND_BASELINE_POLICY,
    caseCount: report.caseCount,
    matchedCaseCount: report.matchedCaseCount,
    matchedCaseRate: report.matchedCaseRate,
    counts: {
      preferredMatchCount: report.preferredMatchCount,
      acceptableMatchCount: report.acceptableMatchCount,
      physicallyValidNotApprovedCount: report.physicallyValidNotApprovedCount,
      invalidCount: report.invalidCount,
      unmatchedCount: report.unmatchedCount,
    },
    cases: report.cases.map((entry) => ({
      caseId: entry.caseId,
      classification: entry.classification,
    })),
  };
}

test('PA-11.3L produces the blind observation without benchmark, approval, review, or teacher arrangement input', () => {
  const observed = produceBlindBaselineObservedOutput(blindInput());

  assert.equal(observed.documentType, 'TeacherArrangementObservedOutput');
  assert.equal(observed.contractVersion, '1.0.0');
  assert.equal(observed.benchmarkId, 'teacher-arrangement-seed-v1');
  assert.equal(observed.benchmarkVersion, '0.2.0');
  assert.deepEqual(observed.cases.map((entry) => entry.caseId), CASES.map((entry) => entry.caseId));
  assert.equal(Object.isFrozen(observed), true);

  const triad = observed.cases[1].observedArrangement;
  assert.ok(triad);
  assert.deepEqual(
    triad.sourceOutcomes.map((entry) => entry.targetMidis),
    [[60], [64], [67]],
  );

  const fourNote = observed.cases[2].observedArrangement;
  assert.ok(fourNote);
  assert.deepEqual(
    fourNote.sourceOutcomes.map((entry) => entry.targetMidis),
    [[60], [64], [67], [71]],
  );
});

test('PA-11.3L measures the genuine blind baseline as 2 of 4 teacher-approved matches', () => {
  // Gold bytes are deliberately loaded only after the independent observation exists.
  const observed = produceBlindBaselineObservedOutput(blindInput());
  const report = evaluateTeacherApprovedV11ObservedOutput(scoreInput(observed));

  assert.equal(report.effectiveReviewStatus, 'teacher-approved');
  assert.equal(report.caseCount, 4);
  assert.equal(report.matchedCaseCount, 2);
  assert.equal(report.matchedCaseRate, 0.5);
  assert.equal(report.preferredMatchCount, 0);
  assert.equal(report.acceptableMatchCount, 2);
  assert.equal(report.physicallyValidNotApprovedCount, 2);
  assert.equal(report.invalidCount, 0);
  assert.equal(report.unmatchedCount, 0);
  assert.deepEqual(
    report.cases.map((entry) => entry.classification),
    [
      MATCH_CLASSIFICATION.ACCEPTABLE_MATCH,
      MATCH_CLASSIFICATION.PHYSICALLY_VALID_NOT_APPROVED,
      MATCH_CLASSIFICATION.PHYSICALLY_VALID_NOT_APPROVED,
      MATCH_CLASSIFICATION.ACCEPTABLE_MATCH,
    ],
  );
});

test('PA-11.3L committed measurement artifact exactly matches a fresh blind run', () => {
  const observed = produceBlindBaselineObservedOutput(blindInput());
  const report = evaluateTeacherApprovedV11ObservedOutput(scoreInput(observed));
  assert.deepEqual(json(measurementPath), measurementSnapshot(report));
});

test('PA-11.3L rejects gold-bearing fields at the blind observation boundary', () => {
  const input = blindInput();
  input.benchmarkText = text(benchmarkPath);
  assert.throws(
    () => produceBlindBaselineObservedOutput(input),
    (error) => error && error.code === 'INVALID_BLIND_BASELINE_OBSERVATION_RUNNER',
  );

  const scoped = blindInput();
  scoped.evaluationScope.preferredArrangementId = 'gold-leak';
  assert.throws(
    () => produceBlindBaselineObservedOutput(scoped),
    (error) => error && error.code === 'INVALID_BLIND_BASELINE_OBSERVATION_RUNNER',
  );
});

test('PA-11.3L remains internal and does not expand the package-root production API', () => {
  assert.equal(Object.hasOwn(publicApi, 'produceBlindBaselineObservedOutput'), false);
});
