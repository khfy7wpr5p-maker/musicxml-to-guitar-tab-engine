'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROOT,
  CANONICAL_TAB_VALIDATION_LIMITS,
  CanonicalTabContractError,
  validateJsonGraph,
} = require('../src/contracts/canonicalTabContractCore');
const {
  CanonicalTabAsciiWriterError,
  serializeCanonicalTabResultToAscii,
} = require('../src/writers/canonicalTabAsciiWriter');
const {
  CanonicalTabJsonWriterError,
  serializeCanonicalTabResult,
} = require('../src/writers/canonicalTabJsonWriter');
const {
  CanonicalTabMusicXmlWriterError,
  serializeCanonicalTabResultToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriter');
const {
  emptyMeasureResult,
} = require('./support/canonicalTabContractTestSupport');

function limits(overrides = {}) {
  return {
    maxDepth: 100,
    maxNodes: 1_000,
    maxOutputBytes: 10_000,
    ...overrides,
  };
}

function valueAtDepth(depth) {
  let value = true;
  for (let currentDepth = 1; currentDepth < depth; currentDepth += 1) {
    value = { child: value };
  }
  return value;
}

function captureContractLimit(fn, rule) {
  let captured;
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabContractError);
    assert.equal(error.code, 'UNSAFE_CANONICAL_TAB_VALUE');
    assert.equal(error.details.rule, rule);
    captured = error;
    return true;
  });
  return captured;
}

test('defines immutable production JSON-graph limits', () => {
  assert.deepEqual(CANONICAL_TAB_VALIDATION_LIMITS, {
    maxDepth: 128,
    maxNodes: 4_000_000,
    maxOutputBytes: 128 * 1024 * 1024,
  });
  assert.ok(Object.isFrozen(CANONICAL_TAB_VALIDATION_LIMITS));
});

test('accepts the exact JSON depth boundary and rejects the first deeper value', () => {
  assert.doesNotThrow(() => validateJsonGraph(
    valueAtDepth(3),
    ROOT,
    limits({ maxDepth: 3 }),
  ));

  const error = captureContractLimit(
    () => validateJsonGraph(
      valueAtDepth(4),
      ROOT,
      limits({ maxDepth: 3 }),
    ),
    'CANONICAL_JSON_DEPTH_LIMIT_EXCEEDED',
  );
  assert.equal(error.details.path, `${ROOT}.child.child.child`);
  assert.equal(error.details.field, 'maxDepth');
  assert.equal(error.details.limit, 3);
  assert.equal(error.details.observed, 4);
});

test('accepts the exact expanded node boundary and rejects the first excess node', () => {
  const value = [null, null];
  assert.doesNotThrow(() => validateJsonGraph(
    value,
    ROOT,
    limits({ maxNodes: 3 }),
  ));

  const error = captureContractLimit(
    () => validateJsonGraph(value, ROOT, limits({ maxNodes: 2 })),
    'CANONICAL_JSON_NODE_LIMIT_EXCEEDED',
  );
  assert.equal(error.details.path, `${ROOT}[1]`);
  assert.equal(error.details.field, 'maxNodes');
  assert.equal(error.details.limit, 2);
  assert.equal(error.details.observed, 3);
});

test('counts repeated shared values as JSON output expands them', () => {
  const shared = { value: 'x' };
  const value = [shared, shared];
  assert.doesNotThrow(() => validateJsonGraph(
    value,
    ROOT,
    limits({ maxNodes: 5 }),
  ));

  const error = captureContractLimit(
    () => validateJsonGraph(value, ROOT, limits({ maxNodes: 4 })),
    'CANONICAL_JSON_NODE_LIMIT_EXCEEDED',
  );
  assert.equal(error.details.path, `${ROOT}[1].value`);
  assert.equal(error.details.observed, 5);
});

test('measures escaped UTF-8 JSON bytes exactly at the pretty-output boundary', () => {
  const value = { text: `é\u0000"\\\ud800😀` };
  const outputBytes = Buffer.byteLength(JSON.stringify(value, null, 2));

  assert.doesNotThrow(() => validateJsonGraph(
    value,
    ROOT,
    limits({ maxOutputBytes: outputBytes }),
  ));

  const error = captureContractLimit(
    () => validateJsonGraph(
      value,
      ROOT,
      limits({ maxOutputBytes: outputBytes - 1 }),
    ),
    'CANONICAL_JSON_OUTPUT_LIMIT_EXCEEDED',
  );
  assert.equal(error.details.field, 'maxOutputBytes');
  assert.equal(error.details.limit, outputBytes - 1);
  assert.equal(error.details.observed, outputBytes);
  assert.equal(error.details.format, 'pretty');
});

test('all public writers reject a 20,000-level graph without a native RangeError', () => {
  const result = JSON.parse(JSON.stringify(emptyMeasureResult()));
  let cursor = {};
  result.unsafe = cursor;
  for (let depth = 0; depth < 20_000; depth += 1) {
    cursor.child = {};
    cursor = cursor.child;
  }

  const scenarios = [
    {
      write: () => serializeCanonicalTabResult(result),
      ErrorClass: CanonicalTabJsonWriterError,
      code: 'UNSAFE_CANONICAL_TAB_JSON_VALUE',
    },
    {
      write: () => serializeCanonicalTabResultToAscii(result),
      ErrorClass: CanonicalTabAsciiWriterError,
      code: 'INVALID_CANONICAL_TAB_ASCII_RESULT',
    },
    {
      write: () => serializeCanonicalTabResultToMusicXml(result),
      ErrorClass: CanonicalTabMusicXmlWriterError,
      code: 'INVALID_CANONICAL_TAB_MUSICXML_RESULT',
    },
  ];

  for (const scenario of scenarios) {
    assert.throws(scenario.write, (error) => {
      assert.ok(error instanceof scenario.ErrorClass);
      assert.equal(error.code, scenario.code);
      assert.equal(error.details.contractCode, 'UNSAFE_CANONICAL_TAB_VALUE');
      assert.equal(error.details.rule, 'CANONICAL_JSON_DEPTH_LIMIT_EXCEEDED');
      assert.equal(error.details.field, 'maxDepth');
      assert.equal(error.details.limit, CANONICAL_TAB_VALIDATION_LIMITS.maxDepth);
      assert.equal(error.details.observed, CANONICAL_TAB_VALIDATION_LIMITS.maxDepth + 1);
      assert.equal(error instanceof RangeError, false);
      return true;
    });
  }
});
