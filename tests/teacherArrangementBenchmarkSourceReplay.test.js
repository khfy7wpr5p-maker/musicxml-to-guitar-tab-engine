'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TeacherArrangementBenchmarkSourceReplayError,
  replayTeacherArrangementBenchmarkSources,
} = require('../src/benchmark/teacherArrangementBenchmarkSourceReplay');
const {
  TeacherArrangementBenchmarkAdmissionError,
  assertTeacherApprovedArrangementBenchmarkAdmission,
} = require('../src/benchmark/teacherArrangementBenchmarkAdmission');

const REPO_ROOT = path.resolve(__dirname, '..');
const BENCHMARK_PATH = path.join(
  REPO_ROOT,
  'benchmarks',
  'teacher-arrangement-v1',
  'benchmark.proposed.json',
);

function readBenchmark() {
  return JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
}

function sourceEntries(benchmark) {
  return benchmark.cases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    sourceText: fs.readFileSync(path.join(REPO_ROOT, benchmarkCase.source.path), 'utf8'),
  }));
}

function expectInvalid(fn, field) {
  assert.throws(fn, (error) => (
    error instanceof TeacherArrangementBenchmarkSourceReplayError
    && error.code === 'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_SOURCE_REPLAY'
    && error.details.field === field
  ));
}

test('PA-11.3D replays exact bound source bytes without granting teacher approval', () => {
  const benchmark = readBenchmark();
  const report = replayTeacherArrangementBenchmarkSources({
    benchmark,
    sourceEntries: sourceEntries(benchmark),
  });

  assert.equal(report.documentType, 'TeacherArrangementBenchmarkSourceReplay');
  assert.equal(report.contractVersion, '1.0.0');
  assert.equal(report.mode, 'evaluation-source-replay');
  assert.equal(report.authority, 'none');
  assert.equal(report.benchmarkReviewStatus, 'proposed');
  assert.equal(report.caseCount, benchmark.cases.length);
  assert.ok(report.cases.every((item) => item.status === 'SOURCE_REPLAY_MATCH'));
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.cases), true);

  assert.throws(
    () => assertTeacherApprovedArrangementBenchmarkAdmission(benchmark),
    (error) => error instanceof TeacherArrangementBenchmarkAdmissionError
      && error.details.field === 'reviewStatus',
  );
});

test('PA-11.3D rejects source bytes that do not match the benchmark SHA-256 binding', () => {
  const benchmark = readBenchmark();
  const entries = sourceEntries(benchmark);
  entries[0].sourceText += '\n';
  expectInvalid(
    () => replayTeacherArrangementBenchmarkSources({ benchmark, sourceEntries: entries }),
    'sourceEntries[0].sourceText',
  );
});

test('PA-11.3D requires one source entry in exact benchmark case order', () => {
  const benchmark = readBenchmark();
  const entries = sourceEntries(benchmark);
  entries[0].caseId = benchmark.cases[1].caseId;
  expectInvalid(
    () => replayTeacherArrangementBenchmarkSources({ benchmark, sourceEntries: entries }),
    'sourceEntries[0].caseId',
  );
});

test('PA-11.3D rejects benchmark sourceMidi that diverges from replayed MusicXML pitch truth', () => {
  const benchmark = readBenchmark();
  benchmark.cases[2].acceptedArrangements[0].noteOutcomes[1].sourceMidi = 65;
  const entries = sourceEntries(benchmark);
  expectInvalid(
    () => replayTeacherArrangementBenchmarkSources({ benchmark, sourceEntries: entries }),
    'cases[2].acceptedArrangements[0].noteOutcomes[1].sourceMidi',
  );
});

test('PA-11.3D fails closed when digest-bound content cannot be parsed/projected', () => {
  const benchmark = readBenchmark();
  const entries = sourceEntries(benchmark);
  const invalidXml = '<not-musicxml/>';
  entries[0].sourceText = invalidXml;
  benchmark.cases[0].source.sha256 = crypto
    .createHash('sha256')
    .update(invalidXml, 'utf8')
    .digest('hex');

  expectInvalid(
    () => replayTeacherArrangementBenchmarkSources({ benchmark, sourceEntries: entries }),
    'sourceEntries[0].sourceText',
  );
});

test('PA-11.3D rejects hostile source-entry containers and accessors', () => {
  const benchmark = readBenchmark();
  const proxied = new Proxy(sourceEntries(benchmark), {});
  expectInvalid(
    () => replayTeacherArrangementBenchmarkSources({ benchmark, sourceEntries: proxied }),
    'sourceEntries',
  );

  const entries = sourceEntries(benchmark);
  Object.defineProperty(entries[0], 'sourceText', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  expectInvalid(
    () => replayTeacherArrangementBenchmarkSources({ benchmark, sourceEntries: entries }),
    'sourceEntries[0].sourceText',
  );
});
