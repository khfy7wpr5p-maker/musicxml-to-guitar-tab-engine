'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCandidateLayers,
} = require('../src/fingering/candidateLayerBuilder');
const {
  FINGERING_OPTIMIZER_VERSION,
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');
const {
  OPTIMIZER_OBSERVATION_VERSION,
  OptimizerObservationError,
  createCandidateId,
  createOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  GUITAR_CONFIGURATION_VERSION,
} = require('../src/guitar/tuning');
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

test('defines stable internal optimizer and observation versions', () => {
  assert.equal(FINGERING_OPTIMIZER_VERSION, '1.0.0');
  assert.equal(OPTIMIZER_OBSERVATION_VERSION, '1.0.0');
  assert.equal(GUITAR_CONFIGURATION_VERSION, '1.0.0');
});

test('creates deterministic candidate identities from event and physical position', () => {
  assert.equal(
    createCandidateId('m1-e0', { string: 2, fret: 1 }),
    'candidate:m1-e0:s2:f1',
  );
  assert.equal(
    createCandidateId('event/with space', { string: 6, fret: 12 }),
    'candidate:event%2Fwith%20space:s6:f12',
  );
});

test('creates an immutable observation without changing optimizer decisions', () => {
  const { candidates, optimized } = buildObservedFixture();
  const observation = createOptimizerObservation(candidates, optimized);

  assert.equal(observation.documentType, 'OptimizerObservation');
  assert.equal(observation.contractVersion, '1.0.0');
  assert.equal(observation.optimizer.version, '1.0.0');
  assert.equal(observation.guitarConfiguration.contractVersion, '1.0.0');
  assert.equal(observation.noteCount, candidates.noteCount);
  assert.equal(observation.totalCost, optimized.totalCost);
  assert.equal(observation.decisions.length, optimized.positions.length);

  for (let index = 0; index < observation.decisions.length; index += 1) {
    const decision = observation.decisions[index];
    assert.deepEqual(decision.selectedPosition, optimized.positions[index]);
    assert.deepEqual(decision.cost, optimized.costs[index]);
    assert.ok(
      decision.candidates.some((candidate) => (
        candidate.candidateId === decision.selectedCandidateId
        && candidate.position.string === decision.selectedPosition.string
        && candidate.position.fret === decision.selectedPosition.fret
      )),
    );
  }

  assert.ok(Object.isFrozen(observation));
  assert.ok(Object.isFrozen(observation.optimizer));
  assert.ok(Object.isFrozen(observation.guitarConfiguration));
  assert.ok(Object.isFrozen(observation.decisions));
  assert.ok(Object.isFrozen(observation.decisions[0]));
  assert.ok(Object.isFrozen(observation.decisions[0].candidates));
  assert.ok(Object.isFrozen(observation.decisions[0].cost));
});

test('rejects an optimizer selection outside the candidate layer', () => {
  const { candidates, optimized } = buildObservedFixture();
  const forged = {
    totalCost: optimized.totalCost,
    positions: optimized.positions.map((position) => ({ ...position })),
    costs: optimized.costs.map((cost) => structuredClone(cost)),
  };
  forged.positions[0] = { string: 1, fret: 20 };

  assert.throws(
    () => createOptimizerObservation(candidates, forged),
    (error) => {
      assert.ok(error instanceof OptimizerObservationError);
      assert.equal(error.code, 'INVALID_OPTIMIZER_OBSERVATION_INPUT');
      assert.match(error.message, /outside the observed candidate layer/i);
      return true;
    },
  );
});

test('rejects non-finite observed costs fail-closed', () => {
  const { candidates, optimized } = buildObservedFixture();
  const forged = {
    totalCost: optimized.totalCost,
    positions: optimized.positions.map((position) => ({ ...position })),
    costs: optimized.costs.map((cost) => structuredClone(cost)),
  };
  forged.costs[0].total = Number.POSITIVE_INFINITY;

  assert.throws(
    () => createOptimizerObservation(candidates, forged),
    (error) => {
      assert.ok(error instanceof OptimizerObservationError);
      assert.equal(error.code, 'INVALID_OPTIMIZER_OBSERVATION_INPUT');
      return true;
    },
  );
});

test('rejects cyclic observed metadata instead of recursing indefinitely', () => {
  const { candidates, optimized } = buildObservedFixture();
  const forged = {
    totalCost: optimized.totalCost,
    positions: optimized.positions.map((position) => ({ ...position })),
    costs: optimized.costs.map((cost) => structuredClone(cost)),
  };
  forged.costs[0].cycle = forged.costs[0];

  assert.throws(
    () => createOptimizerObservation(candidates, forged),
    (error) => {
      assert.ok(error instanceof OptimizerObservationError);
      assert.equal(error.code, 'INVALID_OPTIMIZER_OBSERVATION_INPUT');
      assert.match(error.message, /cycles/i);
      return true;
    },
  );
});

test('keeps observation APIs out of the package-root public surface', () => {
  const packageApi = require('..');

  for (const exportName of [
    'FINGERING_OPTIMIZER_VERSION',
    'OPTIMIZER_OBSERVATION_VERSION',
    'OptimizerObservationError',
    'createCandidateId',
    'createOptimizerObservation',
  ]) {
    assert.equal(Object.hasOwn(packageApi, exportName), false);
  }
});
