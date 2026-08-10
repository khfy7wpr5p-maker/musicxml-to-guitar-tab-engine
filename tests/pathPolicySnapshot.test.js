'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FINGERING_PATH_POLICY_SNAPSHOT_VERSION,
  FINGERING_PATH_POLICY_DIGEST_VERSION,
  FINGERING_PATH_POLICY_DIGEST_ALGORITHM,
  createFingeringPathPolicySnapshot,
  validateFingeringPathPolicySnapshot,
  createFingeringPathPolicyDigest,
  validateFingeringPathPolicyDigest,
  verifyFingeringPathPolicyDigest,
} = require('../src/fingering/pathPolicySnapshot');

const EXPECTED_PROFILE_FIELDS = [
  'maximumFret',
  'fretMovementWeight',
  'stringMovementWeight',
  'largeShiftThreshold',
  'largeShiftWeight',
  'highFretThreshold',
  'highFretWeight',
  'openStringPreferenceWeight',
  'samePositionPreferenceWeight',
  'maximumFretMovement',
  'maximumStringMovement',
];

function assertPathPolicyError(error) {
  assert.equal(error?.name, 'FingeringPathPolicySnapshotError');
  assert.equal(error?.code, 'INVALID_FINGERING_PATH_POLICY_SNAPSHOT_INPUT');
  return true;
}

function mutableCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

test('creates a versioned deeply frozen snapshot of the complete normalized fingering policy', () => {
  const snapshot = createFingeringPathPolicySnapshot({
    maximumFret: 19,
    fretMovementWeight: 2,
    stringMovementWeight: 3,
    largeShiftThreshold: 5,
    largeShiftWeight: 7,
    highFretThreshold: 11,
    highFretWeight: 13,
    openStringPreferenceWeight: 17,
    samePositionPreferenceWeight: 19,
    maximumFretMovement: 6,
    maximumStringMovement: 4,
  });

  assert.equal(FINGERING_PATH_POLICY_SNAPSHOT_VERSION, '1.0.0');
  assert.equal(snapshot.documentType, 'FingeringPathPolicySnapshot');
  assert.equal(snapshot.contractVersion, '1.0.0');
  assert.deepEqual(Object.keys(snapshot.costProfile), EXPECTED_PROFILE_FIELDS);
  assert.deepEqual(snapshot.costProfile, {
    maximumFret: 19,
    fretMovementWeight: 2,
    stringMovementWeight: 3,
    largeShiftThreshold: 5,
    largeShiftWeight: 7,
    highFretThreshold: 11,
    highFretWeight: 13,
    openStringPreferenceWeight: 17,
    samePositionPreferenceWeight: 19,
    maximumFretMovement: 6,
    maximumStringMovement: 4,
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.costProfile), true);
  assert.equal(validateFingeringPathPolicySnapshot(snapshot), snapshot);
});

test('normalizes omitted fields to the exact deterministic default policy without mutating input', () => {
  const overrides = { maximumFretMovement: 5 };
  const before = structuredClone(overrides);

  const first = createFingeringPathPolicySnapshot(overrides);
  const second = createFingeringPathPolicySnapshot({ maximumFretMovement: 5 });

  assert.deepEqual(overrides, before);
  assert.deepEqual(first, second);
  assert.deepEqual(first.costProfile, {
    maximumFret: 20,
    fretMovementWeight: 1,
    stringMovementWeight: 1,
    largeShiftThreshold: 4,
    largeShiftWeight: 0,
    highFretThreshold: 12,
    highFretWeight: 0,
    openStringPreferenceWeight: 0,
    samePositionPreferenceWeight: 0,
    maximumFretMovement: 5,
    maximumStringMovement: null,
  });
});

test('creates a stable domain-separated SHA-256 digest and rejects stale binding', () => {
  const snapshot = createFingeringPathPolicySnapshot({
    fretMovementWeight: 2,
    maximumFretMovement: 4,
  });
  const first = createFingeringPathPolicyDigest(snapshot);
  const second = createFingeringPathPolicyDigest(snapshot);

  assert.equal(FINGERING_PATH_POLICY_DIGEST_VERSION, '1.0.0');
  assert.equal(FINGERING_PATH_POLICY_DIGEST_ALGORITHM, 'sha256');
  assert.deepEqual(first, second);
  assert.match(first.value, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(validateFingeringPathPolicyDigest(first), first);
  assert.deepEqual(verifyFingeringPathPolicyDigest(snapshot, first), first);

  const tampered = mutableCopy(snapshot);
  tampered.costProfile.fretMovementWeight = 3;
  assert.throws(
    () => verifyFingeringPathPolicyDigest(tampered, first),
    assertPathPolicyError,
  );
});

test('fails closed on hostile or non-canonical snapshot/profile shapes', () => {
  const valid = mutableCopy(createFingeringPathPolicySnapshot());

  const withUnknown = mutableCopy(valid);
  withUnknown.costProfile.extra = 1;
  assert.throws(() => validateFingeringPathPolicySnapshot(withUnknown), assertPathPolicyError);

  const withSymbol = mutableCopy(valid);
  withSymbol[Symbol('hidden')] = true;
  assert.throws(() => validateFingeringPathPolicySnapshot(withSymbol), assertPathPolicyError);

  const withAccessor = mutableCopy(valid);
  Object.defineProperty(withAccessor.costProfile, 'maximumFret', {
    enumerable: true,
    get() {
      throw new Error('attacker getter must not execute');
    },
  });
  assert.throws(() => validateFingeringPathPolicySnapshot(withAccessor), assertPathPolicyError);

  const nonEnumerable = mutableCopy(valid);
  Object.defineProperty(nonEnumerable.costProfile, 'hidden', {
    enumerable: false,
    value: true,
  });
  assert.throws(() => validateFingeringPathPolicySnapshot(nonEnumerable), assertPathPolicyError);

  const proxy = new Proxy(valid, {
    ownKeys() {
      throw new Error('attacker proxy trap must not escape');
    },
  });
  assert.throws(() => validateFingeringPathPolicySnapshot(proxy), assertPathPolicyError);

  const negativeZero = mutableCopy(valid);
  negativeZero.costProfile.fretMovementWeight = -0;
  assert.throws(() => validateFingeringPathPolicySnapshot(negativeZero), assertPathPolicyError);
});

test('fails closed on invalid cost policy values and malformed digest records', () => {
  assert.throws(
    () => createFingeringPathPolicySnapshot({ maximumFretMovement: -1 }),
    assertPathPolicyError,
  );
  assert.throws(
    () => createFingeringPathPolicySnapshot({ fretMovementWeight: Number.POSITIVE_INFINITY }),
    assertPathPolicyError,
  );
  assert.throws(
    () => createFingeringPathPolicySnapshot({ unknown: 1 }),
    assertPathPolicyError,
  );

  for (const digest of [
    null,
    {},
    { contractVersion: '1.0.0', algorithm: 'sha1', value: '0'.repeat(64) },
    { contractVersion: '1.0.0', algorithm: 'sha256', value: 'not-a-digest' },
    { contractVersion: '2.0.0', algorithm: 'sha256', value: '0'.repeat(64) },
  ]) {
    assert.throws(() => validateFingeringPathPolicyDigest(digest), assertPathPolicyError);
  }
});

test('keeps LR-S1B.1 helpers internal and does not expand the package-root API', () => {
  const publicApi = require('../src');

  for (const name of [
    'FINGERING_PATH_POLICY_SNAPSHOT_VERSION',
    'FINGERING_PATH_POLICY_DIGEST_VERSION',
    'createFingeringPathPolicySnapshot',
    'validateFingeringPathPolicySnapshot',
    'createFingeringPathPolicyDigest',
    'verifyFingeringPathPolicyDigest',
  ]) {
    assert.equal(Object.hasOwn(publicApi, name), false, `${name} must remain internal`);
  }
});
