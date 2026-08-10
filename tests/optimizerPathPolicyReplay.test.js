'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_FINGERING_CANDIDATES_VERSION,
} = require('../src/fingering/candidateLayerBuilder');
const {
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');
const {
  createOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  createOptimizerObservationDigest,
} = require('../src/fingering/optimizerObservationDigest');
const {
  createFingeringPathPolicySnapshot,
  createFingeringPathPolicyDigest,
} = require('../src/fingering/pathPolicySnapshot');
const {
  createGuitarConfiguration,
} = require('../src/guitar/tuning');
const {
  OPTIMIZER_PATH_POLICY_REPLAY_VERSION,
  MAX_SEMANTIC_REPLAY_DECISIONS,
  MAX_REPLAY_CANDIDATES_PER_DECISION,
  verifyOptimizerPathPolicyReplay,
} = require('../src/fingering/optimizerPathPolicyReplay');

function assertReplayError(error) {
  assert.equal(error?.name, 'OptimizerPathPolicyReplayError');
  assert.match(error?.code ?? '', /^OPTIMIZER_PATH_POLICY_REPLAY_/);
  return true;
}

function createCandidateSet() {
  const guitarConfiguration = createGuitarConfiguration();
  return {
    documentType: 'CanonicalFingeringCandidates',
    contractVersion: CANONICAL_FINGERING_CANDIDATES_VERSION,
    sourceDocumentType: 'CanonicalMusicDocument',
    sourceContractVersion: '1.0.0',
    partId: 'P1',
    noteCount: 2,
    guitarConfiguration,
    notes: [
      { eventId: 'e0', measureKey: 'm1', eventIndex: 0 },
      { eventId: 'e1', measureKey: 'm1', eventIndex: 1 },
    ],
    candidateLayers: [
      [{ string: 1, fret: 0 }],
      [
        { string: 1, fret: 5 },
        { string: 2, fret: 1 },
      ],
    ],
  };
}

function buildFixture(costProfile = {}) {
  const candidates = createCandidateSet();
  const optimized = optimizeFingering(candidates.candidateLayers, { costProfile });
  const observation = createOptimizerObservation(candidates, optimized);
  const observationDigest = createOptimizerObservationDigest(observation);
  const pathPolicySnapshot = createFingeringPathPolicySnapshot(costProfile);
  const pathPolicyDigest = createFingeringPathPolicyDigest(pathPolicySnapshot);

  return {
    observation,
    observationDigest,
    pathPolicySnapshot,
    pathPolicyDigest,
  };
}

function verificationInput(fixture) {
  return {
    observation: fixture.observation,
    observationDigest: fixture.observationDigest,
    pathPolicySnapshot: fixture.pathPolicySnapshot,
    pathPolicyDigest: fixture.pathPolicyDigest,
  };
}

test('verifies exact observation and exact policy by deterministic semantic replay', () => {
  const fixture = buildFixture();
  const before = structuredClone(verificationInput(fixture));

  assert.equal(OPTIMIZER_PATH_POLICY_REPLAY_VERSION, '1.0.0');
  assert.equal(MAX_SEMANTIC_REPLAY_DECISIONS, 50_000);
  assert.equal(MAX_REPLAY_CANDIDATES_PER_DECISION, 6);
  assert.equal(verifyOptimizerPathPolicyReplay(verificationInput(fixture)), true);
  assert.deepEqual(structuredClone(verificationInput(fixture)), before);
});

test('fails closed when the supplied observation digest does not bind the observation', () => {
  const fixture = buildFixture();
  const wrongFixture = buildFixture({ stringMovementWeight: 10 });

  assert.throws(
    () => verifyOptimizerPathPolicyReplay({
      ...verificationInput(fixture),
      observationDigest: wrongFixture.observationDigest,
    }),
    assertReplayError,
  );
});

test('fails closed when the supplied path-policy digest does not bind the snapshot', () => {
  const fixture = buildFixture();
  const otherSnapshot = createFingeringPathPolicySnapshot({ stringMovementWeight: 10 });
  const otherDigest = createFingeringPathPolicyDigest(otherSnapshot);

  assert.throws(
    () => verifyOptimizerPathPolicyReplay({
      ...verificationInput(fixture),
      pathPolicyDigest: otherDigest,
    }),
    assertReplayError,
  );
});

test('rejects policy and observation guitar maximum-fret mismatch before replay', () => {
  const fixture = buildFixture();
  const mismatchedSnapshot = createFingeringPathPolicySnapshot({ maximumFret: 19 });
  const mismatchedDigest = createFingeringPathPolicyDigest(mismatchedSnapshot);

  assert.throws(
    () => verifyOptimizerPathPolicyReplay({
      ...verificationInput(fixture),
      pathPolicySnapshot: mismatchedSnapshot,
      pathPolicyDigest: mismatchedDigest,
    }),
    assertReplayError,
  );
});

test('rejects a validly digested policy that deterministically selects a different path', () => {
  const fixture = buildFixture();
  const alternateSnapshot = createFingeringPathPolicySnapshot({ stringMovementWeight: 10 });
  const alternateDigest = createFingeringPathPolicyDigest(alternateSnapshot);

  assert.deepEqual(fixture.observation.decisions[1].selectedPosition, { string: 2, fret: 1 });

  assert.throws(
    () => verifyOptimizerPathPolicyReplay({
      ...verificationInput(fixture),
      pathPolicySnapshot: alternateSnapshot,
      pathPolicyDigest: alternateDigest,
    }),
    assertReplayError,
  );
});

test('rejects an observed selected transition that violates the bound movement caps', () => {
  const fixture = buildFixture();
  const cappedSnapshot = createFingeringPathPolicySnapshot({ maximumStringMovement: 0 });
  const cappedDigest = createFingeringPathPolicyDigest(cappedSnapshot);

  assert.throws(
    () => verifyOptimizerPathPolicyReplay({
      ...verificationInput(fixture),
      pathPolicySnapshot: cappedSnapshot,
      pathPolicyDigest: cappedDigest,
    }),
    assertReplayError,
  );
});

test('rejects forged observed cost totals even when the forged observation has a fresh valid digest', () => {
  const fixture = buildFixture();
  const forgedObservation = structuredClone(fixture.observation);
  forgedObservation.decisions[1].cost.total += 1;
  forgedObservation.totalCost += 1;
  const forgedDigest = createOptimizerObservationDigest(forgedObservation);

  assert.throws(
    () => verifyOptimizerPathPolicyReplay({
      ...verificationInput(fixture),
      observation: forgedObservation,
      observationDigest: forgedDigest,
    }),
    assertReplayError,
  );
});

test('fails closed on hostile wrappers, ambiguous -0, and custom array properties before delegation', async (t) => {
  await t.test('accessor-backed top-level field', () => {
    const fixture = buildFixture();
    const input = verificationInput(fixture);
    Object.defineProperty(input, 'observation', {
      enumerable: true,
      get() {
        throw new Error('attacker getter must not execute');
      },
    });
    assert.throws(() => verifyOptimizerPathPolicyReplay(input), assertReplayError);
  });

  await t.test('proxy observation', () => {
    const fixture = buildFixture();
    const proxyObservation = new Proxy(fixture.observation, {
      getPrototypeOf() {
        throw new Error('attacker proxy trap must not escape');
      },
    });
    assert.throws(
      () => verifyOptimizerPathPolicyReplay({
        ...verificationInput(fixture),
        observation: proxyObservation,
      }),
      assertReplayError,
    );
  });

  await t.test('custom array property', () => {
    const fixture = buildFixture();
    const observation = structuredClone(fixture.observation);
    observation.decisions.extra = true;
    assert.throws(
      () => verifyOptimizerPathPolicyReplay({
        ...verificationInput(fixture),
        observation,
      }),
      assertReplayError,
    );
  });

  await t.test('negative zero in observation graph', () => {
    const fixture = buildFixture();
    const observation = structuredClone(fixture.observation);
    observation.decisions[1].cost.breakdown.samePositionPreferenceCost = -0;
    assert.throws(
      () => verifyOptimizerPathPolicyReplay({
        ...verificationInput(fixture),
        observation,
      }),
      assertReplayError,
    );
  });

  await t.test('symbol property in path-policy snapshot', () => {
    const fixture = buildFixture();
    const pathPolicySnapshot = structuredClone(fixture.pathPolicySnapshot);
    pathPolicySnapshot[Symbol('hidden')] = true;
    assert.throws(
      () => verifyOptimizerPathPolicyReplay({
        ...verificationInput(fixture),
        pathPolicySnapshot,
      }),
      assertReplayError,
    );
  });
});

test('keeps LR-S1B.2a verifier internal and does not expand the package-root API', () => {
  const publicApi = require('../src');

  for (const name of [
    'OPTIMIZER_PATH_POLICY_REPLAY_VERSION',
    'verifyOptimizerPathPolicyReplay',
    'OptimizerPathPolicyReplayError',
  ]) {
    assert.equal(Object.hasOwn(publicApi, name), false, `${name} must remain internal`);
  }
});
