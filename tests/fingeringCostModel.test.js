'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_FINGERING_COST_PROFILE,
  FingeringCostError,
  createFingeringCostProfile,
  calculatePositionCost,
  calculateTransitionCost,
} = require('../src/fingering/costModel');

test('uses a deterministic neutral default profile', () => {
  assert.deepEqual(createFingeringCostProfile(), DEFAULT_FINGERING_COST_PROFILE);

  const first = calculateTransitionCost(
    { string: 2, fret: 1 },
    { string: 3, fret: 5 },
  );
  const second = calculateTransitionCost(
    { string: 2, fret: 1 },
    { string: 3, fret: 5 },
  );

  assert.deepEqual(first, second);
  assert.equal(first.total, 5);
  assert.equal(first.isPlayable, true);
  assert.deepEqual(first.reasons, []);
  assert.deepEqual(first.breakdown, {
    fretMovement: 4,
    fretMovementCost: 4,
    stringMovement: 1,
    stringMovementCost: 1,
    largeShiftDistance: 0,
    largeShiftCost: 0,
    highFretDistance: 0,
    highFretCost: 0,
    openStringPreferenceCost: 0,
    samePosition: false,
    samePositionPreferenceCost: 0,
  });
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.breakdown));
});

test('returns transparent weighted cost components', () => {
  const profile = {
    maximumFret: 24,
    fretMovementWeight: 2,
    stringMovementWeight: 3,
    largeShiftThreshold: 2,
    largeShiftWeight: 5,
    highFretThreshold: 4,
    highFretWeight: 7,
    openStringPreferenceWeight: 11,
    samePositionPreferenceWeight: 13,
  };

  const result = calculateTransitionCost(
    { string: 2, fret: 1 },
    { string: 3, fret: 5 },
    profile,
  );

  assert.equal(result.total, 52);
  assert.deepEqual(result.breakdown, {
    fretMovement: 4,
    fretMovementCost: 8,
    stringMovement: 1,
    stringMovementCost: 3,
    largeShiftDistance: 2,
    largeShiftCost: 10,
    highFretDistance: 1,
    highFretCost: 7,
    openStringPreferenceCost: 11,
    samePosition: false,
    samePositionPreferenceCost: 13,
  });
});

test('keeps open-string and repeated-position preferences configurable', () => {
  const profile = {
    openStringPreferenceWeight: 4,
    samePositionPreferenceWeight: 6,
  };

  assert.equal(calculatePositionCost({ string: 6, fret: 0 }, profile).total, 0);
  assert.equal(calculatePositionCost({ string: 6, fret: 1 }, profile).total, 4);
  assert.equal(
    calculateTransitionCost(
      { string: 6, fret: 0 },
      { string: 6, fret: 0 },
      profile,
    ).total,
    0,
  );
  assert.equal(
    calculateTransitionCost(
      { string: 6, fret: 0 },
      { string: 5, fret: 0 },
      profile,
    ).total,
    7,
  );
});

test('marks transitions beyond configured hard limits as unplayable', () => {
  const result = calculateTransitionCost(
    { string: 2, fret: 1 },
    { string: 6, fret: 10 },
    {
      maximumFretMovement: 4,
      maximumStringMovement: 2,
    },
  );

  assert.equal(result.total, Number.POSITIVE_INFINITY);
  assert.equal(result.isPlayable, false);
  assert.deepEqual(result.reasons, [
    'MAXIMUM_FRET_MOVEMENT_EXCEEDED',
    'MAXIMUM_STRING_MOVEMENT_EXCEEDED',
  ]);
});

test('rejects invalid positions with a stable error code', () => {
  const invalidPositions = [
    null,
    { string: 0, fret: 1 },
    { string: 2, fret: -1 },
    { string: 2, fret: 21 },
    { string: 2.5, fret: 1 },
  ];

  for (const position of invalidPositions) {
    assert.throws(
      () => calculatePositionCost(position),
      (error) => {
        assert.ok(error instanceof FingeringCostError);
        assert.equal(error.code, 'INVALID_POSITION');
        return true;
      },
    );
  }
});

test('rejects invalid or unknown profile fields with a stable error code', () => {
  const invalidProfiles = [
    null,
    [],
    { fretMovementWeight: -1 },
    { largeShiftThreshold: 1.5 },
    { highFretThreshold: 21 },
    { maximumFretMovement: -1 },
    { unknownWeight: 1 },
  ];

  for (const profile of invalidProfiles) {
    assert.throws(
      () => createFingeringCostProfile(profile),
      (error) => {
        assert.ok(error instanceof FingeringCostError);
        assert.equal(error.code, 'INVALID_FINGERING_COST_PROFILE');
        return true;
      },
    );
  }
});

test('rejects position cost component or total overflow', () => {
  const profiles = [
    { highFretWeight: Number.MAX_VALUE },
    {
      highFretThreshold: 19,
      highFretWeight: Number.MAX_VALUE * 0.75,
      openStringPreferenceWeight: Number.MAX_VALUE * 0.75,
    },
  ];

  for (const profile of profiles) {
    assert.throws(
      () => calculatePositionCost({ string: 1, fret: 20 }, profile),
      (error) => {
        assert.ok(error instanceof FingeringCostError);
        assert.equal(error.code, 'INVALID_FINGERING_COST_PROFILE');
        return true;
      },
    );
  }
});

test('rejects transition cost component overflow', () => {
  assert.throws(
    () => calculateTransitionCost(
      { string: 6, fret: 0 },
      { string: 1, fret: 20 },
      { fretMovementWeight: Number.MAX_VALUE },
    ),
    (error) => {
      assert.ok(error instanceof FingeringCostError);
      assert.equal(error.code, 'INVALID_FINGERING_COST_PROFILE');
      return true;
    },
  );
});

test('requires an explicit compatible high-fret threshold for shorter fret ranges', () => {
  assert.throws(
    () => createFingeringCostProfile({ maximumFret: 10 }),
    (error) => {
      assert.ok(error instanceof FingeringCostError);
      assert.equal(error.code, 'INVALID_FINGERING_COST_PROFILE');
      return true;
    },
  );

  const profile = createFingeringCostProfile({
    maximumFret: 10,
    highFretThreshold: 10,
  });

  assert.equal(profile.maximumFret, 10);
  assert.equal(profile.highFretThreshold, 10);
});
