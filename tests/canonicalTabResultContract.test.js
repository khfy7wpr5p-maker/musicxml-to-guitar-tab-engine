'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readJsonFixture,
  fullResult,
  expectContractError,
  validateCanonicalTabResult,
} = require('./support/canonicalTabContractTestSupport');

test('accepts reviewed v1 data without mutation', () => {
  const fixture = readJsonFixture('canonical-tab-result-v1.valid.json');
  const generated = fullResult();
  const fixtureBefore = structuredClone(fixture);
  const generatedBefore = structuredClone(generated);

  assert.strictEqual(validateCanonicalTabResult(fixture), fixture);
  assert.strictEqual(validateCanonicalTabResult(generated), generated);
  assert.deepEqual(fixture, fixtureBefore);
  assert.deepEqual(generated, generatedBefore);
  assert.ok(Object.isFrozen(generated));
});

test('rejects unsupported schema and exact-field violations deterministically', () => {
  const unsupported = readJsonFixture('canonical-tab-result-v1.invalid-schema.json');
  expectContractError(() => validateCanonicalTabResult(unsupported), {
    code: 'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
    rule: 'UNSUPPORTED_SCHEMA_VERSION',
    path: 'canonicalTabResult.schemaVersion',
  });

  const missing = readJsonFixture('canonical-tab-result-v1.valid.json');
  delete missing.engine;
  expectContractError(() => validateCanonicalTabResult(missing), {
    rule: 'MISSING_FIELD', path: 'canonicalTabResult.engine',
  });

  const unknown = readJsonFixture('canonical-tab-result-v1.valid.json');
  unknown.modelVersion = 'future';
  expectContractError(() => validateCanonicalTabResult(unknown), {
    rule: 'UNKNOWN_FIELD', path: 'canonicalTabResult.modelVersion',
  });

  const wrongType = readJsonFixture('canonical-tab-result-v1.valid.json');
  wrongType.measureCount = '1';
  expectContractError(() => validateCanonicalTabResult(wrongType), {
    rule: 'SAFE_INTEGER_RANGE', path: 'canonicalTabResult.measureCount',
  });

  const repeated = readJsonFixture('canonical-tab-result-v1.valid.json');
  repeated.noteCount = 1;
  let first;
  let second;
  try { validateCanonicalTabResult(repeated); } catch (error) { first = error; }
  try { validateCanonicalTabResult(repeated); } catch (error) { second = error; }
  assert.deepEqual(first.details, second.details);
});

test('rejects cyclic and JSON-unsafe graphs before structural validation', () => {
  const scenarios = [
    ['JSON_UNSAFE_NUMBER', 'canonicalTabResult.totalFingeringCost', (value) => { value.totalFingeringCost = Number.NaN; }],
    ['JSON_UNSAFE_NUMBER', 'canonicalTabResult.totalFingeringCost', (value) => { value.totalFingeringCost = -0; }],
    ['SPARSE_ARRAY', 'canonicalTabResult.measures[0]', (value) => { value.measures = new Array(value.measureCount); }],
    ['ACCESSOR_PROPERTY', 'canonicalTabResult.engine', (value) => {
      const engine = value.engine;
      Object.defineProperty(value, 'engine', { enumerable: true, get: () => engine });
    }],
    ['SYMBOL_KEY', 'canonicalTabResult', (value) => { value[Symbol('future')] = true; }],
  ];

  for (const [rule, path, apply] of scenarios) {
    const value = readJsonFixture('canonical-tab-result-v1.valid.json');
    apply(value);
    expectContractError(() => validateCanonicalTabResult(value), {
      code: 'UNSAFE_CANONICAL_TAB_VALUE', rule, path,
    });
  }

  const cyclic = readJsonFixture('canonical-tab-result-v1.valid.json');
  cyclic.self = cyclic;
  expectContractError(() => validateCanonicalTabResult(cyclic), {
    code: 'CYCLIC_CANONICAL_TAB_RESULT',
    rule: 'CYCLIC_REFERENCE',
    path: 'canonicalTabResult.self',
  });
});
