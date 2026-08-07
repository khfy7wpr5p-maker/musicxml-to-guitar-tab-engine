'use strict';

const { EngineError } = require('../errors/engineError');

const ROOT = 'canonicalTabResult';

class CanonicalTabContractError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'CanonicalTabContractError');
  }
}

function raise(code, path, rule, message, details = {}) {
  throw new CanonicalTabContractError(message, code, { path, rule, ...details });
}

function invalid(path, rule, details = {}) {
  raise(
    'INVALID_CANONICAL_TAB_RESULT',
    path,
    rule,
    `${path} violates CanonicalTabResult 1.0.0.`,
    details,
  );
}

function unsafe(path, rule, details = {}) {
  raise(
    'UNSAFE_CANONICAL_TAB_VALUE',
    path,
    rule,
    `${path} cannot be represented safely as canonical JSON data.`,
    details,
  );
}

function pathFor(path, key) {
  return typeof key === 'number' || /^(0|[1-9]\d*)$/.test(String(key))
    ? `${path}[${key}]`
    : `${path}.${key}`;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonGraph(value, path, active, done) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      unsafe(path, 'JSON_UNSAFE_NUMBER', { actual: String(value) });
    }
    return;
  }
  if (typeof value !== 'object') {
    unsafe(path, 'JSON_UNSAFE_VALUE_TYPE', { actualType: typeof value });
  }
  if (active.has(value)) {
    raise(
      'CYCLIC_CANONICAL_TAB_RESULT',
      path,
      'CYCLIC_REFERENCE',
      'CanonicalTabResult contains a cyclic reference.',
    );
  }
  if (done.has(value)) {
    return;
  }

  active.add(value);
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        unsafe(path, 'SYMBOL_KEY');
      }
      if (
        key !== 'length'
        && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
      ) {
        unsafe(pathFor(path, key), 'ARRAY_EXTRA_PROPERTY');
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const itemPath = pathFor(path, index);
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) {
        unsafe(itemPath, 'SPARSE_ARRAY');
      }
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        unsafe(itemPath, 'INVALID_ARRAY_PROPERTY');
      }
      validateJsonGraph(descriptor.value, itemPath, active, done);
    }
  } else {
    if (!isPlainObject(value)) {
      unsafe(path, 'NON_PLAIN_OBJECT');
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        unsafe(path, 'SYMBOL_KEY');
      }
      const propertyPath = pathFor(path, key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable) {
        unsafe(propertyPath, 'NON_ENUMERABLE_PROPERTY');
      }
      if (!Object.hasOwn(descriptor, 'value')) {
        unsafe(propertyPath, 'ACCESSOR_PROPERTY');
      }
      validateJsonGraph(descriptor.value, propertyPath, active, done);
    }
  }
  active.delete(value);
  done.add(value);
}

function object(value, path) {
  if (!isPlainObject(value)) {
    invalid(path, 'PLAIN_OBJECT_REQUIRED');
  }
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) {
    invalid(path, 'ARRAY_REQUIRED');
  }
  return value;
}

function string(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(path, 'NON_EMPTY_STRING_REQUIRED');
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== 'boolean') {
    invalid(path, 'BOOLEAN_REQUIRED');
  }
  return value;
}

function integer(
  value,
  path,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(path, 'SAFE_INTEGER_RANGE', { minimum, maximum, actual: value });
  }
  return value;
}

function number(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalid(path, 'FINITE_NON_NEGATIVE_NUMBER_REQUIRED', { actual: value });
  }
  return value;
}

function nullableInteger(value, path) {
  return value === null ? null : integer(value, path, 0);
}

function exactKeys(value, expected, path) {
  object(value, path);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) {
      invalid(pathFor(path, key), 'MISSING_FIELD', { field: key });
    }
  }
  const expectedSet = new Set(expected);
  const unknown = Object.keys(value)
    .filter((key) => !expectedSet.has(key))
    .sort()[0];
  if (unknown !== undefined) {
    invalid(pathFor(path, unknown), 'UNKNOWN_FIELD', { field: unknown });
  }
}

function equal(actual, expected, path, rule) {
  if (!Object.is(actual, expected)) {
    invalid(path, rule, { expected, actual });
  }
}

function warning(value, path) {
  exactKeys(value, ['code', 'message', 'severity', 'location', 'details'], path);
  string(value.code, `${path}.code`);
  string(value.message, `${path}.message`);
  string(value.severity, `${path}.severity`);
  if (value.location !== null) {
    object(value.location, `${path}.location`);
  }
  object(value.details, `${path}.details`);
}

function warningArray(value, path) {
  array(value, path).forEach((entry, index) => warning(entry, `${path}[${index}]`));
}

module.exports = {
  ROOT,
  CanonicalTabContractError,
  raise,
  invalid,
  validateJsonGraph,
  object,
  array,
  string,
  boolean,
  integer,
  number,
  nullableInteger,
  exactKeys,
  equal,
  warning,
  warningArray,
};
