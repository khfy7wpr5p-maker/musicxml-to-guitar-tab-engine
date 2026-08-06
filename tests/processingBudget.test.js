'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROCESSING_BUDGET_VERSION,
  DEFAULT_PROCESSING_LIMITS,
  ProcessingBudgetConfigurationError,
  createProcessingBudget,
} = require('../src/core/processingBudget');

function expectInvalidBudget(options, expectedDetails = {}) {
  assert.throws(
    () => createProcessingBudget(options),
    (error) => {
      assert.ok(error instanceof ProcessingBudgetConfigurationError);
      assert.equal(error.code, 'INVALID_PROCESSING_BUDGET');
      assert.deepEqual(error.details, expectedDetails);
      assert.equal(Object.isFrozen(error.details), true);
      return true;
    },
  );
}

test('defines the versioned default processing budget contract', () => {
  const budget = createProcessingBudget();

  assert.equal(budget.documentType, 'ProcessingBudget');
  assert.equal(budget.contractVersion, PROCESSING_BUDGET_VERSION);
  assert.equal(PROCESSING_BUDGET_VERSION, '1.0.0');
  assert.deepEqual(budget.limits, DEFAULT_PROCESSING_LIMITS);
});

test('uses the initial internal default limits', () => {
  assert.deepEqual(DEFAULT_PROCESSING_LIMITS, {
    maxBytes: 5 * 1024 * 1024,
    maxDepth: 128,
    maxElements: 100_000,
    maxAttributes: 200_000,
    maxTextBytes: 4 * 1024 * 1024,
    maxMeasures: 2_000,
    maxEvents: 50_000,
    maxProcessingMilliseconds: 10_000,
  });
});

test('supports partial overrides without mutating the defaults', () => {
  const budget = createProcessingBudget({
    maxDepth: 64,
    maxEvents: 1_000,
  });

  assert.equal(budget.limits.maxDepth, 64);
  assert.equal(budget.limits.maxEvents, 1_000);
  assert.equal(budget.limits.maxBytes, DEFAULT_PROCESSING_LIMITS.maxBytes);
  assert.equal(DEFAULT_PROCESSING_LIMITS.maxDepth, 128);
  assert.equal(DEFAULT_PROCESSING_LIMITS.maxEvents, 50_000);
});

test('returns a deeply immutable budget value', () => {
  const budget = createProcessingBudget();

  assert.equal(Object.isFrozen(DEFAULT_PROCESSING_LIMITS), true);
  assert.equal(Object.isFrozen(budget), true);
  assert.equal(Object.isFrozen(budget.limits), true);
  assert.throws(() => {
    budget.limits.maxDepth = 1;
  }, TypeError);
});

test('accepts null-prototype plain option objects', () => {
  const options = Object.create(null);
  options.maxMeasures = 25;

  assert.equal(createProcessingBudget(options).limits.maxMeasures, 25);
});

test('rejects non-plain option values', () => {
  for (const options of [null, [], 'invalid', 10, new Date()]) {
    expectInvalidBudget(options);
  }
});

test('rejects unknown fields with stable details', () => {
  expectInvalidBudget(
    { maximumDepth: 128 },
    { field: 'maximumDepth', value: 128 },
  );
});

test('rejects non-positive, fractional, unsafe and non-number limits', () => {
  for (const value of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Infinity,
    '128',
    null,
  ]) {
    expectInvalidBudget(
      { maxDepth: value },
      { field: 'maxDepth', value },
    );
  }
});

test('keeps the existing maxBytes option name in the central contract', () => {
  const budget = createProcessingBudget({ maxBytes: 1_024 });
  assert.equal(budget.limits.maxBytes, 1_024);
});
