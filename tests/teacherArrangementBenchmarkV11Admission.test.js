'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  EXPECTED_APPROVAL_GIT_BLOB_SHA,
  EXPECTED_BENCHMARK_GIT_BLOB_SHA,
  TeacherArrangementBenchmarkV11AdmissionError,
  assertExactTeacherApprovedV11BenchmarkAdmission,
} = require('../src/benchmark/teacherArrangementBenchmarkV11Admission');
const {
  TeacherArrangementBenchmarkAdmissionError,
  validateTeacherArrangementBenchmarkAdmission,
} = require('../src/benchmark/teacherArrangementBenchmarkAdmission');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK_PATH = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.v0.2.0.json');
const APPROVAL_PATH = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'approvals', 'teacher-approval-v0.2.0-2026-08-20.json');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('PA-11.3F admits only the exact approved 1.1 benchmark + approval pair', () => {
  const evidence = assertExactTeacherApprovedV11BenchmarkAdmission(
    readText(BENCHMARK_PATH),
    readText(APPROVAL_PATH),
  );

  assert.deepEqual(evidence, {
    documentType: 'TeacherArrangementBenchmarkV11AdmissionEvidence',
    contractVersion: '1.1.0',
    benchmarkId: 'teacher-arrangement-seed-v1',
    benchmarkVersion: '0.2.0',
    benchmarkGitBlobSha: EXPECTED_BENCHMARK_GIT_BLOB_SHA,
    approvalGitBlobSha: EXPECTED_APPROVAL_GIT_BLOB_SHA,
    effectiveReviewStatus: 'teacher-approved',
    authority: 'evaluation-only',
  });
  assert.equal(Object.isFrozen(evidence), true);
});

test('PA-11.3F rejects one-byte benchmark tampering', () => {
  assert.throws(
    () => assertExactTeacherApprovedV11BenchmarkAdmission(
      `${readText(BENCHMARK_PATH)} `,
      readText(APPROVAL_PATH),
    ),
    (error) => error instanceof TeacherArrangementBenchmarkV11AdmissionError,
  );
});

test('PA-11.3F rejects one-byte approval tampering', () => {
  assert.throws(
    () => assertExactTeacherApprovedV11BenchmarkAdmission(
      readText(BENCHMARK_PATH),
      `${readText(APPROVAL_PATH)} `,
    ),
    (error) => error instanceof TeacherArrangementBenchmarkV11AdmissionError,
  );
});

test('PA-11.3F rejects semantically equivalent reserialization because approval is byte-bound', () => {
  const benchmark = JSON.parse(readText(BENCHMARK_PATH));
  const compact = JSON.stringify(benchmark);
  assert.notEqual(compact, readText(BENCHMARK_PATH));
  assert.throws(
    () => assertExactTeacherApprovedV11BenchmarkAdmission(compact, readText(APPROVAL_PATH)),
    (error) => error instanceof TeacherArrangementBenchmarkV11AdmissionError,
  );
});

test('PA-11.3F keeps the legacy 1.0 admission path fail-closed for 1.1 artifacts', () => {
  const benchmark = JSON.parse(readText(BENCHMARK_PATH));
  assert.throws(
    () => validateTeacherArrangementBenchmarkAdmission(benchmark),
    (error) => error instanceof TeacherArrangementBenchmarkAdmissionError,
  );
});

test('PA-11.3F rejects non-string or empty inputs before evaluation', () => {
  for (const [benchmarkText, approvalText] of [
    [null, readText(APPROVAL_PATH)],
    [readText(BENCHMARK_PATH), null],
    ['', readText(APPROVAL_PATH)],
    [readText(BENCHMARK_PATH), ''],
  ]) {
    assert.throws(
      () => assertExactTeacherApprovedV11BenchmarkAdmission(benchmarkText, approvalText),
      (error) => error instanceof TeacherArrangementBenchmarkV11AdmissionError,
    );
  }
});
