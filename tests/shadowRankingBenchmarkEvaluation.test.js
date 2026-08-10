'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  SHADOW_RANKING_BENCHMARK_EVALUATION_CONTRACT_VERSION,
  ShadowRankingBenchmarkEvaluationError,
  evaluateShadowRankingBenchmark,
} = require('../src/benchmark/shadowRankingBenchmarkEvaluation');

const packageRoot = require('../src');

const REPOSITORY_ROOT = path.join(__dirname, '..');
const BENCHMARK_PATH = path.join(
  REPOSITORY_ROOT,
  'benchmarks',
  'teacher-fingering-v1',
  'benchmark.json',
);
const MODEL_PATH = path.join(
  REPOSITORY_ROOT,
  'models',
  'shadow-ranking',
  'synthetic-reference-v1.json',
);

function clone(value) {
  return structuredClone(value);
}

function loadBenchmark() {
  return JSON.parse(readFileSync(BENCHMARK_PATH, 'utf8'));
}

function loadModel() {
  return JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
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

function evaluate(benchmark = loadBenchmark(), sourceEntries = null, model = loadModel()) {
  return evaluateShadowRankingBenchmark({
    benchmark,
    sourceEntries: sourceEntries || loadSourceEntries(benchmark),
    model,
  });
}

function expectEvaluationError(fn, details = {}) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ShadowRankingBenchmarkEvaluationError);
    assert.equal(error.code, 'INVALID_SHADOW_RANKING_BENCHMARK_EVALUATION');
    if (details.field !== undefined) {
      assert.equal(error.details.field, details.field);
    }
    if (details.causeCode !== undefined) {
      assert.equal(error.details.causeCode, details.causeCode);
    }
    return true;
  });
}

test('evaluates the fixed B1 benchmark in measurement-only shadow mode', () => {
  const report = evaluate();

  assert.equal(SHADOW_RANKING_BENCHMARK_EVALUATION_CONTRACT_VERSION, '1.0.0');
  assert.equal(report.documentType, 'ShadowRankingBenchmarkEvaluation');
  assert.equal(report.contractVersion, '1.0.0');
  assert.equal(report.mode, 'shadow-evaluation');
  assert.equal(report.authority, 'none');

  assert.deepEqual(report.benchmark, {
    contractVersion: '1.0.0',
    benchmarkId: 'teacher-fingering-v1',
    benchmarkVersion: '1.0.0',
    reviewStatus: 'teacher-approved',
  });
  assert.equal(report.model.modelId, 'synthetic-reference-movement-v1');
  assert.equal(report.model.modelVersion, '1.0.0');
  assert.match(report.model.modelSha256, /^[0-9a-f]{64}$/);

  assert.deepEqual(report.baseline.counts, {
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

  assert.deepEqual(report.shadow.counts, {
    evaluatedCaseCount: 8,
    evaluatedEventCount: 32,
    unevaluatedEventCount: 0,
    acceptableMatchCount: 32,
    preferredEligibleEventCount: 28,
    preferredMatchCount: 26,
    casePassCount: 8,
    blockedConversionCount: 0,
  });

  assert.deepEqual(report.comparison, {
    divergentCaseCount: 0,
    divergentDecisionCount: 0,
    acceptableMatchDelta: 0,
    preferredMatchDelta: 0,
  });

  assert.equal(report.cases.length, 8);
  assert.ok(report.cases.every((entry) => entry.status === 'evaluated'));
  assert.ok(report.cases.every((entry) => entry.shadowReport.mode === 'shadow'));
  assert.ok(report.cases.every((entry) => entry.shadowReport.authority === 'none'));
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.cases));
  assert.ok(Object.isFrozen(report.cases[0]));
});

test('is deterministic and does not mutate benchmark, source, or model inputs', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);
  const model = loadModel();
  const beforeBenchmark = clone(benchmark);
  const beforeSources = clone(sourceEntries);
  const beforeModel = clone(model);

  const first = evaluate(benchmark, sourceEntries, model);
  const second = evaluate(benchmark, sourceEntries, model);

  assert.deepEqual(first, second);
  assert.deepEqual(benchmark, beforeBenchmark);
  assert.deepEqual(sourceEntries, beforeSources);
  assert.deepEqual(model, beforeModel);
});

test('records the exact fixed default fingering policy used for B1/B2 comparison', () => {
  const report = evaluate();

  assert.equal(report.pathPolicy.scope, 'fixed-b1-default');
  assert.equal(report.pathPolicy.generalizedProvenance, false);
  assert.deepEqual(report.pathPolicy.costProfile, {
    maximumFret: 20,
    fretMovementWeight: 1,
    stringMovementWeight: 1,
    largeShiftThreshold: 4,
    largeShiftWeight: 0,
    highFretThreshold: 12,
    highFretWeight: 0,
    openStringPreferenceWeight: 0,
    samePositionPreferenceWeight: 0,
    maximumFretMovement: null,
    maximumStringMovement: null,
  });
});

test('requires teacher-approved benchmark, exact source binding, and a valid bound shadow model', () => {
  const benchmark = loadBenchmark();
  const sources = loadSourceEntries(benchmark);

  const proposed = clone(benchmark);
  proposed.reviewStatus = 'proposed';
  expectEvaluationError(
    () => evaluate(proposed, loadSourceEntries(proposed)),
    { field: 'benchmark', causeCode: 'INVALID_TEACHER_FINGERING_BENCHMARK' },
  );

  const tamperedSources = clone(sources);
  tamperedSources[0].sourceText += '\n';
  expectEvaluationError(
    () => evaluate(benchmark, tamperedSources),
    { field: 'sourceEntries', causeCode: 'INVALID_TEACHER_FINGERING_BENCHMARK_EVALUATION' },
  );

  const staleModel = loadModel();
  staleModel.featureWeights.fretMovement = 2;
  expectEvaluationError(
    () => evaluate(benchmark, sources, staleModel),
    { field: 'model', causeCode: 'INVALID_SHADOW_RANKING_INPUT' },
  );
});

test('keeps blocked cases in the benchmark denominator and never fabricates a shadow result', () => {
  const benchmark = loadBenchmark();
  const sources = loadSourceEntries(benchmark);
  const blockedSource = '<score-partwise>';

  benchmark.cases[0].source.sha256 = createHash('sha256')
    .update(blockedSource, 'utf8')
    .digest('hex');
  sources[0].sourceText = blockedSource;

  const report = evaluate(benchmark, sources);

  assert.equal(report.baseline.counts.benchmarkCaseCount, 8);
  assert.equal(report.baseline.counts.benchmarkEventCount, 32);
  assert.equal(report.baseline.counts.blockedConversionCount, 1);
  assert.equal(report.baseline.counts.unevaluatedEventCount, 4);
  assert.equal(report.shadow.counts.blockedConversionCount, 1);
  assert.equal(report.shadow.counts.unevaluatedEventCount, 4);
  assert.equal(report.cases[0].status, 'blocked');
  assert.equal(report.cases[0].shadowReport, null);
});

test('rejects hostile wrapper shapes without invoking attacker-controlled accessors', () => {
  const benchmark = loadBenchmark();
  const sourceEntries = loadSourceEntries(benchmark);
  const model = loadModel();

  const inputProxy = new Proxy({ benchmark, sourceEntries, model }, {
    ownKeys() {
      throw new Error('proxy trap should not escape');
    },
  });
  expectEvaluationError(
    () => evaluateShadowRankingBenchmark(inputProxy),
    { field: 'input' },
  );

  let getterCalled = false;
  const hostileModel = loadModel();
  Object.defineProperty(hostileModel, 'modelId', {
    enumerable: true,
    get() {
      getterCalled = true;
      throw new Error('getter should not run');
    },
  });
  expectEvaluationError(
    () => evaluateShadowRankingBenchmark({ benchmark, sourceEntries, model: hostileModel }),
    { field: 'model', causeCode: 'INVALID_SHADOW_RANKING_INPUT' },
  );
  assert.equal(getterCalled, false);
});

test('keeps LR-S1A internal and does not grant package-root or production authority', () => {
  assert.equal(packageRoot.SHADOW_RANKING_BENCHMARK_EVALUATION_CONTRACT_VERSION, undefined);
  assert.equal(packageRoot.ShadowRankingBenchmarkEvaluationError, undefined);
  assert.equal(packageRoot.evaluateShadowRankingBenchmark, undefined);
});
