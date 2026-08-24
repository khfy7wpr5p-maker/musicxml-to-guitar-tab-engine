'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const {
  CANONICAL_TAB_VALIDATION_LIMITS,
  validateJsonGraph,
} = require('./canonicalTabContractCore');
const { pitchToMidi } = require('../music/pitch');

class CanonicalTabResultV2ContractError extends EngineError {
  constructor(message, code = 'INVALID_CANONICAL_TAB_RESULT_V2', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'CanonicalTabResultV2ContractError');
  }
}

function fail(path, rule, details = {}) {
  throw new CanonicalTabResultV2ContractError(
    `${path} violates CanonicalTabResult 2.0.0.`,
    'INVALID_CANONICAL_TAB_RESULT_V2',
    { path, rule, ...details },
  );
}

function unsafe(path, rule, details = {}) {
  throw new CanonicalTabResultV2ContractError(
    `${path} is not safe canonical JSON data.`,
    'UNSAFE_CANONICAL_TAB_RESULT_V2',
    { path, rule, ...details },
  );
}

function ownDescriptor(value, key, path) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    unsafe(path, 'UNSAFE_PROPERTY_INSPECTION');
  }
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    unsafe(path, 'ENUMERABLE_DATA_PROPERTY_REQUIRED');
  }
  return descriptor;
}

function hostileSafeGraph(value) {
  const seen = new WeakSet();
  const stack = [{ value, path: 'canonicalTabResult', depth: 1 }];
  let nodes = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    const current = frame.value;
    nodes += 1;
    if (nodes > CANONICAL_TAB_VALIDATION_LIMITS.maxNodes) {
      unsafe(frame.path, 'CANONICAL_JSON_NODE_LIMIT_EXCEEDED');
    }
    if (frame.depth > CANONICAL_TAB_VALIDATION_LIMITS.maxDepth) {
      unsafe(frame.path, 'CANONICAL_JSON_DEPTH_LIMIT_EXCEEDED');
    }

    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) unsafe(frame.path, 'JSON_UNSAFE_NUMBER');
      continue;
    }
    if (typeof current !== 'object') unsafe(frame.path, 'JSON_UNSAFE_VALUE_TYPE');
    if (isProxy(current)) unsafe(frame.path, 'PROXY_NOT_ALLOWED');
    if (seen.has(current)) unsafe(frame.path, 'SHARED_OR_CYCLIC_REFERENCE');
    seen.add(current);

    let prototype;
    let keys;
    try {
      prototype = Object.getPrototypeOf(current);
      keys = Reflect.ownKeys(current);
    } catch {
      unsafe(frame.path, 'UNSAFE_OBJECT_INSPECTION');
    }

    if (Array.isArray(current)) {
      if (prototype !== Array.prototype) unsafe(frame.path, 'NATIVE_ARRAY_REQUIRED');
      for (const key of keys) {
        if (typeof key === 'symbol') unsafe(frame.path, 'SYMBOL_KEY');
        if (key === 'length') continue;
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length) {
          unsafe(`${frame.path}.${key}`, 'ARRAY_EXTRA_PROPERTY');
        }
      }
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const path = `${frame.path}[${index}]`;
        const descriptor = ownDescriptor(current, String(index), path);
        stack.push({ value: descriptor.value, path, depth: frame.depth + 1 });
      }
      continue;
    }

    if (prototype !== Object.prototype && prototype !== null) unsafe(frame.path, 'PLAIN_OBJECT_REQUIRED');
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (typeof key === 'symbol') unsafe(frame.path, 'SYMBOL_KEY');
      const path = `${frame.path}.${key}`;
      const descriptor = ownDescriptor(current, key, path);
      stack.push({ value: descriptor.value, path, depth: frame.depth + 1 });
    }
  }

  validateJsonGraph(value, 'canonicalTabResult');
}

function exact(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'OBJECT_REQUIRED');
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'MISSING_FIELD');
  }
  const expected = new Set(keys);
  const unknown = Object.keys(value).find((key) => !expected.has(key));
  if (unknown !== undefined) fail(`${path}.${unknown}`, 'UNKNOWN_FIELD');
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, 'ARRAY_REQUIRED');
  return value;
}

function string(value, path) {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'NON_EMPTY_STRING_REQUIRED');
  return value;
}

function nullableString(value, path) {
  return value === null ? null : string(value, path);
}

function integer(value, path, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) {
    fail(path, 'SAFE_INTEGER_RANGE', { minimum, maximum, actual: value });
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'BOOLEAN_REQUIRED');
  return value;
}

function equal(actual, expected, path, rule) {
  if (!Object.is(actual, expected)) fail(path, rule, { expected, actual });
}

function expectedWritten(step, alter, octave) {
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter];
  return accidental === undefined ? null : `${step}${accidental}${octave}`;
}

function validatePitch(value, path) {
  exact(value, ['step', 'alter', 'octave', 'midi', 'written'], path);
  const step = string(value.step, `${path}.step`);
  if (!/^[A-G]$/.test(step)) fail(`${path}.step`, 'PITCH_STEP');
  const alter = integer(value.alter, `${path}.alter`, -2, 2);
  const octave = integer(value.octave, `${path}.octave`, -1, 9);
  const midi = integer(value.midi, `${path}.midi`, 0, 127);
  equal(value.written, expectedWritten(step, alter, octave), `${path}.written`, 'WRITTEN_PITCH_MISMATCH');
  let expectedMidi;
  try {
    expectedMidi = pitchToMidi({ step, alter, octave });
  } catch {
    fail(path, 'INVALID_PITCH_COMPONENTS');
  }
  equal(midi, expectedMidi, `${path}.midi`, 'PITCH_MIDI_MISMATCH');
  return value;
}

module.exports = {
  CanonicalTabResultV2ContractError,
  fail,
  hostileSafeGraph,
  exact,
  array,
  string,
  nullableString,
  integer,
  boolean,
  equal,
  expectedWritten,
  validatePitch,
};