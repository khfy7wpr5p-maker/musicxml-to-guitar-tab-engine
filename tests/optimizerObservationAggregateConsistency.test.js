'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCandidateLayers,
} = require('../src/fingering/candidateLayerBuilder');
const {
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');
const {
  OptimizerObservationError,
  createOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function buildObservedFixture() {
  const canonical = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const candidates = buildCandidateLayers(canonical);
  const optimized = optimizeFingering(candidates.candidateLayers);
  return { candidates, optimized };
}

function cloneOptimizerResult(optimized) {
  return {
    totalCost: optimized.totalCost,
    positions: optimized.positions.map((position) => ({ ...position })),
    costs: optimized.costs.map((cost) => structuredClone(cost)),
  };
}

function assertAggregateMismatchRejected(candidates, optimized) {
  assert.throws(
    () => createOptimizerObservation(candidates, optimized),
    (error) => {
      assert.ok(error instanceof OptimizerObservationError);
      assert.equal(error.code, 'INVALID_OPTIMIZER_OBSERVATION_INPUT');
      assert.match(error.message, /totalCost must equal the sum of observed decision costs/i);
      return true;
    },
  );
}

test('rejects forged optimizer totalCost that disagrees with decision totals', () => {
  const { candidates, optimized: productionResult } = buildObservedFixture();
  const optimized = cloneOptimizerResult(productionResult);

  optimized.totalCost += 1;

  assertAggregateMismatchRejected(candidates, optimized);
});

test('rejects forged decision cost total that disagrees with optimizer totalCost', () => {
  const { candidates, optimized: productionResult } = buildObservedFixture();
  const optimized = cloneOptimizerResult(productionResult);

  optimized.costs[0].total += 1;

  assertAggregateMismatchRejected(candidates, optimized);
});
