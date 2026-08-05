'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cloneJson,
  score,
  multiMeasureScore,
  note,
  fullResult,
  expectContractError,
  parseCanonicalTabResult,
  validateCanonicalTabResult,
} = require('./support/canonicalTabContractTestSupport');

test('recomputes event and top-level fingering costs', () => {
  const eventCost = cloneJson(fullResult());
  eventCost.measures[0].events[0].fingeringCost.total += 1;
  expectContractError(() => validateCanonicalTabResult(eventCost), {
    rule: 'POSITION_COST_TOTAL_MISMATCH',
    path: 'canonicalTabResult.measures[0].events[0].fingeringCost.total',
  });

  const transition = cloneJson(fullResult());
  transition.measures[0].events[1].fingeringCost.breakdown.fretMovement += 1;
  expectContractError(() => validateCanonicalTabResult(transition), {
    rule: 'TRANSITION_COST_BREAKDOWN_MISMATCH',
    path: 'canonicalTabResult.measures[0].events[1].fingeringCost.breakdown.fretMovement',
  });

  const total = cloneJson(fullResult());
  total.totalFingeringCost += 1;
  expectContractError(() => validateCanonicalTabResult(total), {
    rule: 'TOTAL_FINGERING_COST_MISMATCH',
    path: 'canonicalTabResult.totalFingeringCost',
  });
});

test('uses cost-model floating-point grouping for transition weights', () => {
  const result = parseCanonicalTabResult(
    score(`${note({ step: 'C' })}${note({ step: 'D' })}`, { beats: 2 }),
    {
      guitar: {
        tuning: [
          { number: 1, pitch: 'C4', midi: 60 }, { number: 2, pitch: 'E4', midi: 64 },
          { number: 3, pitch: 'G4', midi: 67 }, { number: 4, pitch: 'C5', midi: 72 },
          { number: 5, pitch: 'E5', midi: 76 }, { number: 6, pitch: 'G5', midi: 79 },
        ], minimumFret: 0, maximumFret: 2,
      },
      costProfile: {
        fretMovementWeight: 5e15, stringMovementWeight: 0,
        largeShiftThreshold: 2, largeShiftWeight: 0,
        highFretThreshold: 1, highFretWeight: 1,
        openStringPreferenceWeight: 1, samePositionPreferenceWeight: 0,
      },
    },
  );
  assert.equal(result.measures[0].events[1].fingeringCost.total, 1e16 + 2);
  assert.strictEqual(validateCanonicalTabResult(result), result);
});

test('matches optimizer accumulation order across measure boundaries', () => {
  const result = parseCanonicalTabResult(
    multiMeasureScore(note({ step: 'G' }), `${note({ step: 'E' })}${note({ step: 'F' })}`),
    {
      guitar: {
        tuning: [
          { number: 1, pitch: 'E4', midi: 64 }, { number: 2, pitch: 'A4', midi: 69 },
          { number: 3, pitch: 'C5', midi: 72 }, { number: 4, pitch: 'E5', midi: 76 },
          { number: 5, pitch: 'A5', midi: 81 }, { number: 6, pitch: 'C6', midi: 84 },
        ], minimumFret: 0, maximumFret: 3,
      },
      costProfile: {
        fretMovementWeight: 0, stringMovementWeight: 0,
        largeShiftThreshold: 3, largeShiftWeight: 0,
        highFretThreshold: 1, highFretWeight: 5e15,
        openStringPreferenceWeight: 0, samePositionPreferenceWeight: 1,
      },
    },
  );
  assert.equal(result.totalFingeringCost, 1e16);
  assert.strictEqual(validateCanonicalTabResult(result), result);
});
