'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FingeringOptimizerError,
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');

test('uses dynamic programming instead of a greedy first choice', () => {
  const result = optimizeFingering([
    [
      { string: 1, fret: 0 },
      { string: 6, fret: 4 },
    ],
    [{ string: 6, fret: 4 }],
  ]);

  assert.deepEqual(result.positions, [
    { string: 6, fret: 4 },
    { string: 6, fret: 4 },
  ]);
  assert.equal(result.totalCost, 0);
});

test('supports one note and one candidate per layer', () => {
  const single = optimizeFingering([
    [{ string: 3, fret: 5 }],
  ]);
  assert.deepEqual(single.positions, [{ string: 3, fret: 5 }]);
  assert.equal(single.costs.length, 1);

  const sequence = optimizeFingering([
    [{ string: 3, fret: 5 }],
    [{ string: 2, fret: 1 }],
  ]);
  assert.deepEqual(sequence.positions, [
    { string: 3, fret: 5 },
    { string: 2, fret: 1 },
  ]);
  assert.equal(sequence.costs.length, 2);
});

test('breaks equal-cost ties by string then fret deterministically', () => {
  const layers = [[
    { string: 2, fret: 0 },
    { string: 1, fret: 5 },
    { string: 1, fret: 2 },
  ]];

  const first = optimizeFingering(layers);
  const second = optimizeFingering(layers);

  assert.deepEqual(first, second);
  assert.deepEqual(first.positions, [{ string: 1, fret: 2 }]);
});

test('excludes unplayable transitions and rejects when no path remains', () => {
  assert.throws(
    () => optimizeFingering(
      [
        [{ string: 1, fret: 0 }],
        [{ string: 6, fret: 10 }],
      ],
      {
        costProfile: {
          maximumFretMovement: 2,
          maximumStringMovement: 2,
        },
      },
    ),
    (error) => {
      assert.ok(error instanceof FingeringOptimizerError);
      assert.equal(error.code, 'NO_PLAYABLE_FINGERING');
      assert.equal(error.details.layerIndex, 1);
      return true;
    },
  );
});

test('rejects empty or malformed candidate layers with a stable code', () => {
  const invalidInputs = [
    [],
    [null],
    [[]],
    [[null]],
    [[{ string: 0, fret: 1 }]],
    [[{ string: 1, fret: -1 }]],
    [[{ string: 1, fret: 21 }]],
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => optimizeFingering(input),
      (error) => {
        assert.ok(error instanceof FingeringOptimizerError);
        assert.equal(error.code, 'INVALID_FINGERING_CANDIDATES');
        return true;
      },
    );
  }
});

test('rejects invalid and unknown optimizer options', () => {
  const invalidOptions = [
    null,
    [],
    { unknownOption: true },
  ];

  for (const options of invalidOptions) {
    assert.throws(
      () => optimizeFingering([[{ string: 1, fret: 0 }]], options),
      (error) => {
        assert.ok(error instanceof FingeringOptimizerError);
        assert.equal(error.code, 'INVALID_FINGERING_CANDIDATES');
        return true;
      },
    );
  }
});

test('does not mutate input and deeply freezes output', () => {
  const layers = [
    [{ string: 2, fret: 1 }],
    [{ string: 3, fret: 2 }],
  ];
  const before = structuredClone(layers);

  const result = optimizeFingering(layers);

  assert.deepEqual(layers, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.positions));
  assert.ok(Object.isFrozen(result.positions[0]));
  assert.ok(Object.isFrozen(result.costs));
  assert.ok(Object.isFrozen(result.costs[0]));
  assert.ok(Object.isFrozen(result.costs[0].breakdown));
});
