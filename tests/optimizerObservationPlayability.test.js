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

function assertInvalidObservation(fn) {
  assert.throws(
    fn,
    (error) => {
      assert.ok(error instanceof OptimizerObservationError);
      assert.equal(error.code, 'INVALID_OPTIMIZER_OBSERVATION_INPUT');
      assert.match(error.message, /selected optimizer cost must be playable/i);
      return true;
    },
  );
}

test('rejects a selected optimizer cost marked unplayable', () => {
  const { candidates, optimized: productionResult } = buildObservedFixture();
  const optimized = cloneOptimizerResult(productionResult);

  optimized.costs[0].isPlayable = false;
  optimized.costs[0].reasons = ['FORGED_UNPLAYABLE_SELECTION'];

  assertInvalidObservation(() => createOptimizerObservation(candidates, optimized));
});

test('rejects a selected playable optimizer cost carrying rejection reasons', () => {
  const { candidates, optimized: productionResult } = buildObservedFixture();
  const optimized = cloneOptimizerResult(productionResult);
  assert.ok(optimized.costs.length > 1);

  optimized.costs[1].isPlayable = true;
  optimized.costs[1].reasons = ['FORGED_REJECTION_REASON'];

  assertInvalidObservation(() => createOptimizerObservation(candidates, optimized));
});
