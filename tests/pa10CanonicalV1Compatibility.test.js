'use strict';

const test = require('node:test');
const {
  cloneJson,
  fullResult,
  expectContractError,
  validateCanonicalTabResult,
} = require('./support/canonicalTabContractTestSupport');

function freshV1Result() {
  return cloneJson(fullResult());
}

test('PA-10.1: CanonicalTabResult v1 rejects a v2 schema identity', () => {
  const value = freshV1Result();
  value.schemaVersion = '2.0.0';

  expectContractError(() => validateCanonicalTabResult(value), {
    code: 'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
    rule: 'UNSUPPORTED_SCHEMA_VERSION',
    path: 'canonicalTabResult.schemaVersion',
  });
});

test('PA-10.1: CanonicalTabResult v1 rejects additive polyphonic root fields', () => {
  const value = freshV1Result();
  value.simultaneousGroups = [];

  expectContractError(() => validateCanonicalTabResult(value), {
    rule: 'UNKNOWN_FIELD',
    path: 'canonicalTabResult.simultaneousGroups',
  });
});

test('PA-10.1: CanonicalTabResult v1 accepts only note/rest event vocabulary', () => {
  const value = freshV1Result();
  value.measures[0].events[0].type = 'chord';

  expectContractError(() => validateCanonicalTabResult(value), {
    rule: 'UNSUPPORTED_EVENT_TYPE',
    path: 'canonicalTabResult.measures[0].events[0].type',
  });
});

test('PA-10.1: CanonicalTabResult v1 rejects staff 2', () => {
  const value = freshV1Result();
  value.measures[0].events[0].staff = 2;

  expectContractError(() => validateCanonicalTabResult(value), {
    rule: 'SINGLE_STAFF_REQUIRED',
    path: 'canonicalTabResult.measures[0].events[0].staff',
  });
});

test('PA-10.1: CanonicalTabResult v1 rejects multiple logical voices', () => {
  const value = freshV1Result();
  value.measures[0].events[1].voice = value.measures[0].events[0].voice + 1;

  expectContractError(() => validateCanonicalTabResult(value), {
    rule: 'MULTIPLE_VOICES_NOT_SUPPORTED',
    path: 'canonicalTabResult.measures[0].events[1].voice',
  });
});

test('PA-10.1: CanonicalTabResult v1 preserves a single linear measure cursor', () => {
  const value = freshV1Result();
  value.measures[0].events[1].start.divisions = value.measures[0].events[0].start.divisions;

  expectContractError(() => validateCanonicalTabResult(value), {
    rule: 'EVENT_START_SEQUENCE_MISMATCH',
    path: 'canonicalTabResult.measures[0].events[1].start.divisions',
  });
});

test('PA-10.1: CanonicalTabResult v1 rejects multiple selected positions on one note', () => {
  const value = freshV1Result();
  value.measures[0].events[0].selectedPositions = [
    cloneJson(value.measures[0].events[0].selectedPosition),
  ];

  expectContractError(() => validateCanonicalTabResult(value), {
    rule: 'UNKNOWN_FIELD',
    path: 'canonicalTabResult.measures[0].events[0].selectedPositions',
  });
});
