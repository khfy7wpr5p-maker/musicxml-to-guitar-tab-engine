'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  TEACHER_FINGERING_BENCHMARK_EVALUATION_CONTRACT_VERSION,
  TeacherFingeringBenchmarkEvaluationError,
  evaluateTeacherFingeringBenchmark,
} = require('../src/benchmark/teacherFingeringBenchmarkEvaluation');

const packageRoot = require('../src');

const REPOSITORY_ROOT = path.join(__dirname, '..');
const BENCHMARK_PATH = path.join(
  REPOSITORY_ROOT,
  'benchmarks',
  'teacher-fingering-v1',
  'benchmark.json',
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadBenchmark() {
  return JSON.parse(readFileSync(BENCHMARK_PATH, 'utf8'));
}

function loadSourceEntries(benchmark) {
  return benchmark.cases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    sourceText: readFileSync(
      path.join(REPOSITORY_ROOT, benchmarkCase.source.path),
      'utf8',
    ),
  }));
}

function evaluate(benchmark = loadBenchmark(), sourceEntries = null) {
  return evaluateTeacherFingeringBenchmark({
    benchmark,
    sourceEntries: sourceEntries || loadSourceEntries(benchmark),
  });
}

function expectEvaluationError(fn, details = {}) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof TeacherFingeringBenchmarkEvaluationError);
    assert.equal(error.code, 'INVALID_TEACHER_FINGERING_BENCHMARK_EVALUATION');
    if (details.field !== undefined) {
      assert.equal(error.details.field, details.field);
    }
    if (details.causeCode !== undefined) {
      assert.equal(error.details.causeCode, details.causeCode);
    }
    return true;
  });
}

test('evaluates the fixed teacher-approved benchmark with deterministic baseline counts', () => {
  const report = evaluate();

  assert.equal(TEACHER_FINGERING_BENCHMARK_EVALUATION_CONTRACT_VERSION, '1.0.0');
  assert.equal(report.documentType, 'TeacherFingeringBenchmarkEvaluation');
  assert.equal(report.contractVersion, '1.0.0');
  assert.equal(report.benchmark.benchmarkId, 'teacher-fingering-v1');
  assert.equal(report.benchmark.benchmarkVersion, '1.0.0');
  assert.equal(report.benchmark.contractVersion, '1.0.0');
  assert.equal(report.benchmark.reviewStatus, 'teacher-approved');

  assert.deepEqual(report.counts, {
    benchmarkCaseCount: 8,
    benchmarkEventCount: 32,
    evaluatedCaseCount: 8,
    evaluatedEventCount: 32,
    unevaluatedEventCount: 0,
    acceptableMatchCount: 32,
    preferredEligibleEventCount: 28,
    preferredMatchCount: 26,
    casePassCount: 8,
    candidateCoverageFailureCount: 0,
    blockedConversionCount: 0,
  });

  assert.equal(report.cases.length, 8);
  assert.ok(report.cases.every((entry) => entry.status === 'evaluated'));
  assert.ok(report.cases.every((entry) => entry.pass === true));
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.counts));
  assert.ok(Object.isFrozen(report.cases));
  assert.ok(Object.isFrozen(report.cases[0]));
  assert.ok(Object.isFrozen(report.cases[0].events));
  assert.ok(Object.isFrozen(report.cases[0].events[0]));
});

test('is deterministic and does not mutate benchmark or source inputs', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);
  const beforeBenchmark = clone(benchmark);
  const beforeSources = clone(sourceEntries);

  const first = evaluate(benchmark, sourceEntries);
  const second = evaluate(benchmark, sourceEntries);

  assert.deepEqual(first, second);
  assert.deepEqual(benchmark, beforeBenchmark);
  assert.deepEqual(sourceEntries, beforeSources);
});

test('requires a teacher-approved B1 benchmark before any evaluation', () => {
  const benchmark = loadBenchmark();
  benchmark.reviewStatus = 'proposed';

  expectEvaluationError(
    () => evaluate(benchmark, loadSourceEntries(benchmark)),
    {
      field: 'benchmark',
      causeCode: 'INVALID_TEACHER_FINGERING_BENCHMARK',
    },
  );
});

test('requires one exact ordered source entry for every benchmark case', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);

  expectEvaluationError(
    () => evaluate(benchmark, sourceEntries.slice(0, -1)),
    { field: 'sourceEntries' },
  );

  const reordered = [...sourceEntries];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  expectEvaluationError(
    () => evaluate(benchmark, reordered),
    { field: 'sourceEntries[0].caseId' },
  );

  const withExtraField = clone(sourceEntries);
  withExtraField[0].extra = true;
  expectEvaluationError(
    () => evaluate(benchmark, withExtraField),
    { field: 'sourceEntries[0].extra' },
  );

  const sparse = [...sourceEntries];
  delete sparse[0];
  expectEvaluationError(
    () => evaluate(benchmark, sparse),
    { field: 'sourceEntries[0]' },
  );
});

test('rejects source content that does not match the fixed B1 SHA-256 binding', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);
  sourceEntries[0].sourceText += '\n';

  expectEvaluationError(
    () => evaluate(benchmark, sourceEntries),
    {
      field: 'sourceEntries[0].sourceText',
      causeCode: 'INVALID_TEACHER_FINGERING_BENCHMARK',
    },
  );
});

test('counts blocked conversion without silently removing its events from the benchmark denominator', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);
  const blockedSource = '<score-partwise>';

  benchmark.cases[0].source.sha256 = createHash('sha256')
    .update(blockedSource, 'utf8')
    .digest('hex');
  sourceEntries[0].sourceText = blockedSource;

  const report = evaluate(benchmark, sourceEntries);

  assert.deepEqual(report.counts, {
    benchmarkCaseCount: 8,
    benchmarkEventCount: 32,
    evaluatedCaseCount: 7,
    evaluatedEventCount: 28,
    unevaluatedEventCount: 4,
    acceptableMatchCount: 28,
    preferredEligibleEventCount: 28,
    preferredMatchCount: 22,
    casePassCount: 7,
    candidateCoverageFailureCount: 0,
    blockedConversionCount: 1,
  });
  assert.equal(report.cases[0].status, 'blocked');
  assert.equal(report.cases[0].eventCount, 4);
  assert.equal(report.cases[0].evaluatedEventCount, 0);
  assert.equal(report.cases[0].pass, false);
  assert.deepEqual(report.cases[0].events, []);
});

test('fails closed when successful conversion event identities do not exactly match benchmark labels', () => {
  const benchmark = loadBenchmark();
  benchmark.cases[0].events[0].eventId = 'm1-e99';

  expectEvaluationError(
    () => evaluate(benchmark, loadSourceEntries(benchmark)),
    { field: 'benchmark.cases[0].events' },
  );
});

test('rejects hostile evaluation wrapper and source-entry shapes with structured errors', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);

  const inputProxy = new Proxy({ benchmark, sourceEntries }, {
    ownKeys() {
      throw new Error('proxy trap should not escape');
    },
  });
  expectEvaluationError(
    () => evaluateTeacherFingeringBenchmark(inputProxy),
    { field: 'input' },
  );

  const accessorEntry = {
    caseId: sourceEntries[0].caseId,
  };
  Object.defineProperty(accessorEntry, 'sourceText', {
    enumerable: true,
    get() {
      throw new Error('getter should not run');
    },
  });
  const hostileEntries = [accessorEntry, ...sourceEntries.slice(1)];
  expectEvaluationError(
    () => evaluate(benchmark, hostileEntries),
    { field: 'sourceEntries[0].sourceText' },
  );
});

test('rejects array subclasses before inherited prototype methods can redirect evaluation', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);
  let sourceMapCalled = false;
  let acceptedSomeCalled = false;
  let tuningMapCalled = false;

  class HostileSourceEntries extends Array {
    map() {
      sourceMapCalled = true;
      throw new Error('source map override should not run');
    }
  }
  const hostileSources = new HostileSourceEntries(...sourceEntries);
  expectEvaluationError(
    () => evaluate(benchmark, hostileSources),
    { field: 'sourceEntries' },
  );
  assert.equal(sourceMapCalled, false);

  class HostileAcceptedPositions extends Array {
    some() {
      acceptedSomeCalled = true;
      throw new Error('accepted-position some override should not run');
    }
  }
  const benchmarkWithHostileAcceptedPositions = loadBenchmark();
  benchmarkWithHostileAcceptedPositions.cases[0].events[0].acceptedPositions =
    new HostileAcceptedPositions(
      ...benchmarkWithHostileAcceptedPositions.cases[0].events[0].acceptedPositions,
    );
  expectEvaluationError(
    () => evaluate(
      benchmarkWithHostileAcceptedPositions,
      loadSourceEntries(benchmarkWithHostileAcceptedPositions),
    ),
    { field: 'benchmark.cases[0].events[0].acceptedPositions' },
  );
  assert.equal(acceptedSomeCalled, false);

  class HostileTuning extends Array {
    map() {
      tuningMapCalled = true;
      throw new Error('tuning map override should not run');
    }
  }
  const benchmarkWithHostileTuning = loadBenchmark();
  benchmarkWithHostileTuning.guitarConfiguration.value.tuning = new HostileTuning(
    ...benchmarkWithHostileTuning.guitarConfiguration.value.tuning,
  );
  expectEvaluationError(
    () => evaluate(
      benchmarkWithHostileTuning,
      loadSourceEntries(benchmarkWithHostileTuning),
    ),
    { field: 'benchmark.guitarConfiguration.value.tuning' },
  );
  assert.equal(tuningMapCalled, false);
});

test('keeps the B2 evaluation harness out of the package-root public API', () => {
  assert.equal(packageRoot.TEACHER_FINGERING_BENCHMARK_EVALUATION_CONTRACT_VERSION, undefined);
  assert.equal(packageRoot.TeacherFingeringBenchmarkEvaluationError, undefined);
  assert.equal(packageRoot.evaluateTeacherFingeringBenchmark, undefined);
});
