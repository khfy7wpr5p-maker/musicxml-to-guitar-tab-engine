'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const REVIEW_PATH = path.join(
  REPO_ROOT,
  'benchmarks',
  'teacher-arrangement-v1',
  'reviews',
  'teacher-review-2026-08-20.json',
);
const BENCHMARK_PATH = path.join(
  REPO_ROOT,
  'benchmarks',
  'teacher-arrangement-v1',
  'benchmark.proposed.json',
);

const STANDARD_TUNING = new Map([
  [1, 64],
  [2, 59],
  [3, 55],
  [4, 50],
  [5, 45],
  [6, 40],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function soundedMidis(shape) {
  return shape.strings
    .filter((entry) => entry.state === 'SOUNDED')
    .map((entry) => entry.midi);
}

test('PA-11.2R binds the explicit teacher review record to the exact proposed benchmark bytes', () => {
  const review = readJson(REVIEW_PATH);
  const benchmarkBytes = fs.readFileSync(BENCHMARK_PATH);
  const benchmark = JSON.parse(benchmarkBytes.toString('utf8'));

  assert.equal(review.documentType, 'TeacherArrangementReviewRecord');
  assert.equal(review.contractVersion, '1.0.0');
  assert.equal(review.reviewResult, 'PASS_WITH_REQUIRED_BENCHMARK_REVISION');
  assert.equal(review.authority, 'evaluation-review-only');
  assert.equal(review.trainingAuthority, false);
  assert.equal(review.productionAuthority, false);
  assert.equal(review.teacherApprovedBenchmarkCreated, false);

  assert.equal(review.reviewedBenchmark.path, 'benchmarks/teacher-arrangement-v1/benchmark.proposed.json');
  assert.equal(review.reviewedBenchmark.benchmarkId, benchmark.benchmarkId);
  assert.equal(review.reviewedBenchmark.benchmarkVersion, benchmark.benchmarkVersion);
  assert.equal(review.reviewedBenchmark.reviewStatusObserved, 'proposed');
  assert.equal(benchmark.reviewStatus, 'proposed');
  assert.equal(review.reviewedBenchmark.gitBlobSha, gitBlobSha(benchmarkBytes));
});

test('PA-11.2R records the four explicit case-level teacher directions without inferring a preference', () => {
  const review = readJson(REVIEW_PATH);

  assert.deepEqual(
    review.cases.map((entry) => entry.caseId),
    [
      'pa11-seed-001-two-note-open-vs-barre',
      'pa11-seed-002-three-note-voicing',
      'pa11-seed-003-conservative-reduction',
      'pa11-seed-004-octave-displacement',
    ],
  );

  assert.equal(review.cases[0].verdict, 'PASS_AS_PRESENTED');
  assert.equal(review.cases[0].acceptedPresentedSet, true);
  assert.equal(review.cases[0].preferredArrangementId, null);

  assert.equal(review.cases[1].verdict, 'REVISE_TO_TEACHER_SHAPE');
  assert.equal(review.cases[1].acceptedPresentedSet, false);
  assert.equal(review.cases[1].teacherDirectionCode, 'OPEN_C_MAJOR_X32010');
  assert.equal(review.cases[1].preferredArrangementId, null);

  assert.equal(review.cases[2].verdict, 'REVISE_TO_TEACHER_SHAPE');
  assert.equal(review.cases[2].acceptedPresentedSet, false);
  assert.equal(review.cases[2].teacherDirectionCode, 'OPEN_CMAJ7_X32000');
  assert.equal(review.cases[2].preferredArrangementId, null);

  assert.equal(review.cases[3].verdict, 'PASS_AS_PRESENTED');
  assert.equal(review.cases[3].acceptedPresentedSet, true);
  assert.equal(review.cases[3].preferredArrangementId, null);
});

test('PA-11.2R fixes the requested open C and Cmaj7 shapes to exact standard-guitar facts', () => {
  const review = readJson(REVIEW_PATH);
  const cMajor = review.cases[1].teacherRequestedShape;
  const cMaj7 = review.cases[2].teacherRequestedShape;

  assert.equal(cMajor.positionCode, 'x32010');
  assert.equal(cMajor.label, 'C');
  assert.deepEqual(soundedMidis(cMajor), [48, 52, 55, 60, 64]);

  assert.equal(cMaj7.positionCode, 'x32000');
  assert.equal(cMaj7.label, 'Cmaj7');
  assert.deepEqual(soundedMidis(cMaj7), [48, 52, 55, 59, 64]);

  for (const shape of [cMajor, cMaj7]) {
    assert.equal(shape.strings.length, 6);
    assert.deepEqual(shape.barres, []);
    assert.equal(shape.strings[0].string, 6);
    assert.equal(shape.strings[0].state, 'MUTED');
    assert.equal(shape.strings[0].fret, null);
    assert.equal(shape.strings[0].finger, null);
    assert.equal(shape.strings[0].midi, null);

    const usedStrings = new Set();
    for (const entry of shape.strings) {
      assert.equal(usedStrings.has(entry.string), false);
      usedStrings.add(entry.string);
      if (entry.state === 'MUTED') {
        continue;
      }
      assert.equal(entry.state, 'SOUNDED');
      assert.equal(STANDARD_TUNING.get(entry.string) + entry.fret, entry.midi);
      if (entry.fret === 0) {
        assert.equal(entry.finger, 0);
      } else {
        assert.ok(entry.finger >= 1 && entry.finger <= 4);
      }
    }
  }
});

test('PA-11.2R marks the open-chord directions as requiring future revoicing schema support', () => {
  const review = readJson(REVIEW_PATH);

  for (const caseIndex of [1, 2]) {
    assert.deepEqual(
      review.cases[caseIndex].requiredFutureDecisionTypes,
      ['VOICE_REDISTRIBUTED', 'REVOICED'],
    );
    assert.deepEqual(
      review.cases[caseIndex].schemaGapCodes,
      [
        'REQUIRES_ADDITIONAL_REALIZED_TONES',
        'REQUIRES_NON_BIJECTIVE_SOURCE_TO_OUTPUT_MAPPING',
      ],
    );
  }

  assert.equal(
    review.nextRequiredState,
    'CREATE_NEW_PROPOSED_BENCHMARK_VERSION_FOR_EXACT_TEACHER_REVIEW',
  );
});

test('PA-11.2R review evidence remains free of personal identity and training/production authority', () => {
  const review = readJson(REVIEW_PATH);
  const forbiddenKeys = new Set([
    'teacherName',
    'teacherEmail',
    'email',
    'phone',
    'accountId',
    'studentName',
    'trainingConsent',
  ]);

  const pending = [review];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') {
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbiddenKeys.has(key), false, `forbidden review key: ${key}`);
      pending.push(child);
    }
  }

  assert.equal(review.trainingAuthority, false);
  assert.equal(review.productionAuthority, false);
  assert.equal(review.teacherApprovedBenchmarkCreated, false);
});
