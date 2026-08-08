'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PEDAGOGICAL_FEATURE_VECTOR_VERSION,
  PedagogicalFeatureVectorError,
  createPedagogicalFeatureVector,
} = require('../src/fingering/pedagogicalFeatureVector');

test('creates deterministic immutable pedagogical features', () => {
  const vector = createPedagogicalFeatureVector(
    { string: 3, fret: 2 },
    { string: 2, fret: 5 },
  );

  assert.deepEqual(vector, {
    contractVersion: PEDAGOGICAL_FEATURE_VECTOR_VERSION,
    fretMovement: 3,
    stringMovement: 1,
    positionContinuity: false,
    openStringUsage: false,
    largeShift: false,
    handStability: false,
    phraseContinuity: false,
  });
  assert.equal(Object.isFrozen(vector), true);
});

test('marks open strings, continuity, stability and phrase continuity deterministically', () => {
  const vector = createPedagogicalFeatureVector(
    { string: 2, fret: 0 },
    { string: 1, fret: 0 },
  );

  assert.equal(vector.openStringUsage, true);
  assert.equal(vector.positionContinuity, true);
  assert.equal(vector.handStability, true);
  assert.equal(vector.phraseContinuity, true);
});

test('marks large shifts only above the configured threshold', () => {
  assert.equal(
    createPedagogicalFeatureVector({ string: 1, fret: 1 }, { string: 1, fret: 5 }).largeShift,
    false,
  );
  assert.equal(
    createPedagogicalFeatureVector({ string: 1, fret: 1 }, { string: 1, fret: 6 }).largeShift,
    true,
  );
  assert.equal(
    createPedagogicalFeatureVector(
      { string: 1, fret: 1 },
      { string: 1, fret: 4 },
      { largeShiftThreshold: 2 },
    ).largeShift,
    true,
  );
});

test('first position has zero movement and stable continuity baseline', () => {
  const vector = createPedagogicalFeatureVector(null, { string: 4, fret: 7 });
  assert.equal(vector.fretMovement, 0);
  assert.equal(vector.stringMovement, 0);
  assert.equal(vector.positionContinuity, true);
  assert.equal(vector.handStability, true);
  assert.equal(vector.phraseContinuity, true);
});

test('rejects invalid positions and thresholds fail-closed', () => {
  const invalidCases = [
    () => createPedagogicalFeatureVector(null, { string: 0, fret: 1 }),
    () => createPedagogicalFeatureVector(null, { string: 1, fret: -1 }),
    () => createPedagogicalFeatureVector(null, { string: 1, fret: 1.5 }),
    () => createPedagogicalFeatureVector(null, { string: 1, fret: 1 }, { largeShiftThreshold: -1 }),
    () => createPedagogicalFeatureVector(null, { string: 1, fret: 1 }, []),
  ];

  for (const invoke of invalidCases) {
    assert.throws(invoke, (error) => (
      error instanceof PedagogicalFeatureVectorError
      && error.code === 'INVALID_PEDAGOGICAL_FEATURE_VECTOR_INPUT'
    ));
  }
});
