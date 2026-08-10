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
  OPTIMIZER_PATH_POLICY_BINDING_VERSION,
  OPTIMIZER_PATH_POLICY_BINDING_DIGEST_VERSION,
  OPTIMIZER_PATH_POLICY_BINDING_DIGEST_ALGORITHM,
  createOptimizerPathPolicyBinding,
  validateOptimizerPathPolicyBinding,
  createOptimizerPathPolicyBindingDigest,
  validateOptimizerPathPolicyBindingDigest,
  verifyOptimizerPathPolicyBindingDigest,
} = require('../src/fingering/optimizerPathPolicyBinding');

function assertBindingError(error) {
  assert.equal(error?.name, 'OptimizerPathPolicyBindingError');
  assert.match(error?.code ?? '', /^OPTIMIZER_PATH_POLICY_BINDING_/);
  return true;
}

function createCandidateSet(noteCount = 2) {
  const guitarConfiguration = createGuitarConfiguration();
  if (noteCount === 0) {
    return {
      documentType: 'CanonicalFingeringCandidates',
      contractVersion: CANONICAL_FINGERING_CANDIDATES_VERSION,
      sourceDocumentType: 'CanonicalMusicDocument',
      sourceContractVersion: '1.0.0',
      partId: 'P1',
      noteCount: 0,
      guitarConfiguration,
      notes: [],
      candidateLayers: [],
    };
  }
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

function buildFixture(costProfile = {}, noteCount = 2) {
  const candidateSet = createCandidateSet(noteCount);
  const optimized = noteCount === 0
    ? { totalCost: 0, positions: [], costs: [] }
    : optimizeFingering(candidateSet.candidateLayers, { costProfile });
  const observation = createOptimizerObservation(candidateSet, optimized);
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

function createBindingFixture(costProfile = {}, noteCount = 2) {
  const fixture = buildFixture(costProfile, noteCount);
  const binding = createOptimizerPathPolicyBinding(fixture);
  const bindingDigest = createOptimizerPathPolicyBindingDigest(binding);
  return { ...fixture, binding, bindingDigest };
}

test('creates an immutable deterministic-path binding only after successful semantic replay', () => {
  const fixture = buildFixture();
  const before = structuredClone(fixture);
  const binding = createOptimizerPathPolicyBinding(fixture);

  assert.equal(OPTIMIZER_PATH_POLICY_BINDING_VERSION, '1.0.0');
  assert.equal(binding.documentType, 'OptimizerPathPolicyBinding');
  assert.equal(binding.contractVersion, '1.0.0');
  assert.equal(binding.authority, 'none');
  assert.equal(binding.optimizerObservationVersion, fixture.observation.contractVersion);
  assert.equal(binding.noteCount, 2);
  assert.deepEqual(binding.observationDigest, fixture.observationDigest);
  assert.deepEqual(binding.optimizer, fixture.observation.optimizer);
  assert.deepEqual(binding.pathPolicySnapshot, fixture.pathPolicySnapshot);
  assert.deepEqual(binding.pathPolicyDigest, fixture.pathPolicyDigest);
  assert.deepEqual(binding.semanticReplay, {
    contractVersion: '1.0.0',
    status: 'verified',
    scope: 'deterministic-path',
  });
  assert.equal(validateOptimizerPathPolicyBinding(binding), binding);
  assert.deepEqual(structuredClone(fixture), before);

  assert.equal(Object.isFrozen(binding), true);
  assert.equal(Object.isFrozen(binding.observationDigest), true);
  assert.equal(Object.isFrozen(binding.optimizer), true);
  assert.equal(Object.isFrozen(binding.pathPolicySnapshot), true);
  assert.equal(Object.isFrozen(binding.pathPolicySnapshot.costProfile), true);
  assert.equal(Object.isFrozen(binding.pathPolicyDigest), true);
  assert.equal(Object.isFrozen(binding.semanticReplay), true);
});

test('records zero-note replay with an explicit empty-observation scope', () => {
  const fixture = buildFixture({}, 0);
  const binding = createOptimizerPathPolicyBinding(fixture);

  assert.equal(binding.noteCount, 0);
  assert.equal(binding.semanticReplay.scope, 'empty-observation');
  assert.equal(binding.semanticReplay.status, 'verified');
  assert.equal(validateOptimizerPathPolicyBinding(binding), binding);
});

test('does not accept caller-supplied replay evidence or unknown binding-creation fields', () => {
  const fixture = buildFixture();
  assert.throws(
    () => createOptimizerPathPolicyBinding({
      ...fixture,
      semanticReplay: { contractVersion: '1.0.0', status: 'verified', scope: 'deterministic-path' },
    }),
    assertBindingError,
  );
});

test('fails closed when semantic replay cannot bind the supplied observation and policy', () => {
  const fixture = buildFixture();
  const alternateSnapshot = createFingeringPathPolicySnapshot({ stringMovementWeight: 10 });
  const alternateDigest = createFingeringPathPolicyDigest(alternateSnapshot);

  assert.throws(
    () => createOptimizerPathPolicyBinding({
      ...fixture,
      pathPolicySnapshot: alternateSnapshot,
      pathPolicyDigest: alternateDigest,
    }),
    assertBindingError,
  );
});

test('fails closed on stale observation or path-policy digests before binding creation', () => {
  const fixture = buildFixture();
  const other = buildFixture({ fretMovementWeight: 2 });

  assert.throws(
    () => createOptimizerPathPolicyBinding({
      ...fixture,
      observationDigest: other.observationDigest,
    }),
    assertBindingError,
  );
  assert.throws(
    () => createOptimizerPathPolicyBinding({
      ...fixture,
      pathPolicyDigest: other.pathPolicyDigest,
    }),
    assertBindingError,
  );
});

test('rejects optimizer identity/version substitution even with a fresh observation digest', () => {
  const fixture = buildFixture();
  const observation = structuredClone(fixture.observation);
  observation.optimizer.version = '9.9.9';
  const observationDigest = createOptimizerObservationDigest(observation);

  assert.throws(
    () => createOptimizerPathPolicyBinding({
      ...fixture,
      observation,
      observationDigest,
    }),
    assertBindingError,
  );
});

test('enforces internal replay-scope consistency in persisted binding records', () => {
  const nonEmpty = structuredClone(createBindingFixture().binding);
  nonEmpty.semanticReplay.scope = 'empty-observation';
  assert.throws(() => validateOptimizerPathPolicyBinding(nonEmpty), assertBindingError);

  const empty = structuredClone(createBindingFixture({}, 0).binding);
  empty.semanticReplay.scope = 'deterministic-path';
  assert.throws(() => validateOptimizerPathPolicyBinding(empty), assertBindingError);
});

test('creates a deterministic domain-separated SHA-256 binding digest', () => {
  const { binding } = createBindingFixture();
  const first = createOptimizerPathPolicyBindingDigest(binding);
  const second = createOptimizerPathPolicyBindingDigest(binding);

  assert.equal(OPTIMIZER_PATH_POLICY_BINDING_DIGEST_VERSION, '1.0.0');
  assert.equal(OPTIMIZER_PATH_POLICY_BINDING_DIGEST_ALGORITHM, 'sha256');
  assert.deepEqual(first, second);
  assert.equal(first.contractVersion, '1.0.0');
  assert.equal(first.algorithm, 'sha256');
  assert.match(first.value, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(validateOptimizerPathPolicyBindingDigest(first), first);
  assert.deepEqual(verifyOptimizerPathPolicyBindingDigest(binding, first), first);
});

test('binding digest changes when the bound observation, policy, optimizer, note count, or replay scope changes', () => {
  const first = createBindingFixture();
  const second = createBindingFixture({ fretMovementWeight: 2 });
  assert.notEqual(first.bindingDigest.value, second.bindingDigest.value);

  for (const mutate of [
    (binding) => { binding.observationDigest.value = '0'.repeat(64); },
    (binding) => { binding.optimizer.version = '9.9.9'; },
    (binding) => { binding.noteCount = 0; binding.semanticReplay.scope = 'empty-observation'; },
  ]) {
    const binding = structuredClone(first.binding);
    mutate(binding);
    assert.notEqual(
      createOptimizerPathPolicyBindingDigest(binding).value,
      first.bindingDigest.value,
    );
  }
});

test('rejects stale binding digests and association swaps', () => {
  const first = createBindingFixture();
  const second = createBindingFixture({ fretMovementWeight: 2 });
  const swapped = structuredClone(first.binding);
  swapped.pathPolicySnapshot = structuredClone(second.binding.pathPolicySnapshot);
  swapped.pathPolicyDigest = structuredClone(second.binding.pathPolicyDigest);

  assert.throws(
    () => verifyOptimizerPathPolicyBindingDigest(swapped, first.bindingDigest),
    assertBindingError,
  );
});

test('rejects cross-domain digest substitution', () => {
  const fixture = createBindingFixture();

  assert.throws(
    () => verifyOptimizerPathPolicyBindingDigest(fixture.binding, fixture.pathPolicyDigest),
    assertBindingError,
  );
  assert.throws(
    () => verifyOptimizerPathPolicyBindingDigest(fixture.binding, fixture.observationDigest),
    assertBindingError,
  );
});

test('fails closed on hostile or ambiguous persisted binding shapes', async (t) => {
  await t.test('proxy record', () => {
    const { binding } = createBindingFixture();
    const proxy = new Proxy(binding, {
      getPrototypeOf() {
        throw new Error('attacker proxy trap must not escape');
      },
    });
    assert.throws(() => validateOptimizerPathPolicyBinding(proxy), assertBindingError);
  });

  await t.test('accessor-backed semantic field', () => {
    const { binding } = createBindingFixture();
    const hostile = structuredClone(binding);
    Object.defineProperty(hostile, 'authority', {
      enumerable: true,
      get() {
        throw new Error('attacker getter must not execute');
      },
    });
    assert.throws(() => validateOptimizerPathPolicyBinding(hostile), assertBindingError);
  });

  await t.test('symbol property', () => {
    const { binding } = createBindingFixture();
    const hostile = structuredClone(binding);
    hostile[Symbol('hidden')] = true;
    assert.throws(() => validateOptimizerPathPolicyBinding(hostile), assertBindingError);
  });

  await t.test('unknown field', () => {
    const { binding } = createBindingFixture();
    const hostile = structuredClone(binding);
    hostile.unreviewedAuthority = true;
    assert.throws(() => validateOptimizerPathPolicyBinding(hostile), assertBindingError);
  });

  await t.test('negative zero in nested path-policy snapshot', () => {
    const { binding } = createBindingFixture();
    const hostile = structuredClone(binding);
    hostile.pathPolicySnapshot.costProfile.fretMovementWeight = -0;
    assert.throws(() => validateOptimizerPathPolicyBinding(hostile), assertBindingError);
  });
});

test('keeps LR-S1B.2b binding infrastructure internal and authority-free', () => {
  const { binding } = createBindingFixture();
  const publicApi = require('../src');

  assert.equal(binding.authority, 'none');
  for (const name of [
    'OPTIMIZER_PATH_POLICY_BINDING_VERSION',
    'createOptimizerPathPolicyBinding',
    'validateOptimizerPathPolicyBinding',
    'createOptimizerPathPolicyBindingDigest',
    'verifyOptimizerPathPolicyBindingDigest',
    'OptimizerPathPolicyBindingError',
  ]) {
    assert.equal(Object.hasOwn(publicApi, name), false, `${name} must remain internal`);
  }
});
