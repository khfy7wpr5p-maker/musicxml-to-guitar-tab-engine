'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cloneJson,
  fullResult,
  emptyMeasureResult,
  expectContractError,
  validateCanonicalTabResult,
} = require('./support/canonicalTabContractTestSupport');

test('preserves one positive voice plus current tuning and beam metadata behavior', () => {
  const value = cloneJson(fullResult());
  for (const measure of value.measures) {
    for (const event of measure.events) event.voice = 2;
  }
  value.guitar.tuning[0].pitch = null;
  value.guitar.tuning[1].pitch = 'metadata-only';
  value.measures[0].events[0].rhythm.beam = [{ level: 9, value: 'begin' }];
  assert.strictEqual(validateCanonicalTabResult(value), value);
});

test('enforces counts, deterministic indexes, sequencing and durations', () => {
  const cases = [
    ['NOTE_COUNT_MISMATCH', 'canonicalTabResult.noteCount', (value) => { value.noteCount += 1; }],
    ['MEASURE_INDEX_MISMATCH', 'canonicalTabResult.measures[0].measureIndex', (value) => { value.measures[0].measureIndex = 2; }],
    ['EVENT_INDEX_MISMATCH', 'canonicalTabResult.measures[0].events[0].eventIndex', (value) => { value.measures[0].events[0].eventIndex = 3; }],
    ['EVENT_START_SEQUENCE_MISMATCH', 'canonicalTabResult.measures[0].events[1].start.divisions', (value) => { value.measures[0].events[1].start.divisions += 1; }],
    ['RHYTHM_DURATION_MISMATCH', 'canonicalTabResult.measures[0].events[0].rhythm.durationDivisions', (value) => { value.measures[0].events[0].rhythm.durationDivisions = 1; }],
  ];
  for (const [rule, path, apply] of cases) {
    const value = cloneJson(fullResult());
    apply(value);
    expectContractError(() => validateCanonicalTabResult(value), { rule, path });
  }
});

test('enforces written pitch, physical positions, alternatives and rest invariants', () => {
  const pitchMismatch = cloneJson(fullResult());
  pitchMismatch.measures[0].events[0].pitch.midi += 1;
  expectContractError(() => validateCanonicalTabResult(pitchMismatch), {
    rule: 'PITCH_MIDI_MISMATCH',
    path: 'canonicalTabResult.measures[0].events[0].pitch.midi',
  });

  const positionMismatch = cloneJson(fullResult());
  positionMismatch.measures[0].events[0].selectedPosition.fret += 1;
  expectContractError(() => validateCanonicalTabResult(positionMismatch), {
    rule: 'POSITION_PITCH_MISMATCH',
    path: 'canonicalTabResult.measures[0].events[0].selectedPosition',
  });

  const duplicate = cloneJson(fullResult());
  duplicate.measures[0].events[0].alternativePositions.unshift(
    cloneJson(duplicate.measures[0].events[0].selectedPosition),
  );
  expectContractError(() => validateCanonicalTabResult(duplicate), {
    rule: 'DUPLICATE_TAB_POSITION',
    path: 'canonicalTabResult.measures[0].events[0].alternativePositions[0]',
  });

  const rest = cloneJson(emptyMeasureResult());
  rest.warnings = [];
  expectContractError(() => validateCanonicalTabResult(rest), {
    rule: 'WARNING_INDEX_MISMATCH', path: 'canonicalTabResult.warnings',
  });
});
