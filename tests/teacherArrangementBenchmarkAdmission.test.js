'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TeacherArrangementBenchmarkAdmissionError,
  assertTeacherApprovedArrangementBenchmarkAdmission,
  validateTeacherArrangementBenchmarkAdmission,
  verifyTeacherArrangementBenchmarkCaseSource,
} = require('../src/benchmark/teacherArrangementBenchmarkAdmission');

const BENCHMARK_PATH = path.join(
  __dirname,
  '..',
  'benchmarks',
  'teacher-arrangement-v1',
  'benchmark.proposed.json',
);

function readBenchmark() {
  return JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectInvalid(fn, field) {
  assert.throws(fn, (error) => (
    error instanceof TeacherArrangementBenchmarkAdmissionError
    && error.code === 'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_ADMISSION'
    && error.details.field === field
  ));
}

test('PA-11.3A admits PA-11.1 structure but blocks proposed benchmark evaluation', () => {
  const benchmark = readBenchmark();
  assert.equal(validateTeacherArrangementBenchmarkAdmission(benchmark), true);
  assert.equal(benchmark.reviewStatus, 'proposed');
  expectInvalid(
    () => assertTeacherApprovedArrangementBenchmarkAdmission(benchmark),
    'reviewStatus',
  );
});

test('PA-11.3A never invents a preferred arrangement while exercising the approval gate', () => {
  const benchmark = readBenchmark();
  const syntheticReviewed = clone(benchmark);
  syntheticReviewed.reviewStatus = 'teacher-approved';
  assert.equal(assertTeacherApprovedArrangementBenchmarkAdmission(syntheticReviewed), true);
  assert.ok(syntheticReviewed.cases.every((item) => item.preferredArrangementId === null));
});

test('PA-11.3A rejects unknown/accessor root fields and proxy/sparse/custom case arrays', () => {
  const unknown = readBenchmark();
  unknown.extra = true;
  expectInvalid(() => validateTeacherArrangementBenchmarkAdmission(unknown), 'extra');

  const accessor = readBenchmark();
  Object.defineProperty(accessor, 'reviewStatus', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  expectInvalid(() => validateTeacherArrangementBenchmarkAdmission(accessor), 'reviewStatus');

  const proxied = readBenchmark();
  proxied.cases = new Proxy(proxied.cases, {});
  expectInvalid(() => validateTeacherArrangementBenchmarkAdmission(proxied), 'cases');

  const sparse = readBenchmark();
  sparse.cases = [...sparse.cases];
  delete sparse.cases[1];
  expectInvalid(() => validateTeacherArrangementBenchmarkAdmission(sparse), 'cases[1]');

  const custom = readBenchmark();
  custom.cases.extra = true;
  expectInvalid(() => validateTeacherArrangementBenchmarkAdmission(custom), 'cases');
});

test('PA-11.3A validates arrangement identity/preference membership without scoring labels', () => {
  const duplicate = readBenchmark();
  duplicate.cases[0].acceptedArrangements[1].arrangementId =
    duplicate.cases[0].acceptedArrangements[0].arrangementId;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkAdmission(duplicate),
    'cases[0].acceptedArrangements[1].arrangementId',
  );

  const badPreferred = readBenchmark();
  badPreferred.cases[0].preferredArrangementId = 'not-an-accepted-arrangement';
  expectInvalid(
    () => validateTeacherArrangementBenchmarkAdmission(badPreferred),
    'cases[0].preferredArrangementId',
  );
});

test('PA-11.3A source verifier binds exact bounded UTF-8 bytes by SHA-256', () => {
  const benchmarkCase = clone(readBenchmark().cases[0]);
  const sourceText = '<score-partwise version="4.0"><part-list/></score-partwise>';
  benchmarkCase.source.sha256 = crypto.createHash('sha256').update(sourceText, 'utf8').digest('hex');
  assert.equal(verifyTeacherArrangementBenchmarkCaseSource(benchmarkCase, sourceText), true);
  expectInvalid(
    () => verifyTeacherArrangementBenchmarkCaseSource(benchmarkCase, `${sourceText}\n`),
    'sourceText',
  );
});
