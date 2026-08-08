'use strict';

const { EngineError } = require('../errors/engineError');

const ROOT = 'canonicalTabResult';
// The supported 50,000-event budget remains below 2.7 million expanded nodes
// and 80 MiB of pretty JSON with the current largest note-event shape.
const CANONICAL_TAB_VALIDATION_LIMITS = Object.freeze({
  maxDepth: 128,
  maxNodes: 4_000_000,
  maxOutputBytes: 128 * 1024 * 1024,
});

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

function assertValidationLimits(limits) {
  for (const field of ['maxDepth', 'maxNodes', 'maxOutputBytes']) {
    if (!Number.isSafeInteger(limits[field]) || limits[field] <= 0) {
      throw new TypeError(`Canonical TAB validation limit ${field} must be a positive safe integer.`);
    }
  }
}

function jsonStringByteLength(value, maximum) {
  let bytes = 2;
  if (bytes > maximum) {
    return maximum + 1;
  }

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    let additionalBytes;

    if (
      codeUnit === 0x22
      || codeUnit === 0x5C
      || codeUnit === 0x08
      || codeUnit === 0x09
      || codeUnit === 0x0A
      || codeUnit === 0x0C
      || codeUnit === 0x0D
    ) {
      additionalBytes = 2;
    } else if (codeUnit <= 0x1F) {
      additionalBytes = 6;
    } else if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        additionalBytes = 4;
        index += 1;
      } else {
        additionalBytes = 6;
      }
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      additionalBytes = 6;
    } else if (codeUnit <= 0x7F) {
      additionalBytes = 1;
    } else if (codeUnit <= 0x7FF) {
      additionalBytes = 2;
    } else {
      additionalBytes = 3;
    }

    bytes += additionalBytes;
    if (bytes > maximum) {
      return maximum + 1;
    }
  }

  return bytes;
}

function validateJsonGraph(
  value,
  path,
  limits = CANONICAL_TAB_VALIDATION_LIMITS,
) {
  assertValidationLimits(limits);

  const active = new WeakSet();
  const stack = [{ kind: 'value', value, path, depth: 1 }];
  let nodeCount = 0;
  let compactOutputBytes = 0;
  let prettyOutputBytes = 0;

  function addOutputBytes(compact, pretty, outputPath) {
    compactOutputBytes += compact;
    prettyOutputBytes += pretty;

    if (compactOutputBytes > limits.maxOutputBytes) {
      unsafe(outputPath, 'CANONICAL_JSON_OUTPUT_LIMIT_EXCEEDED', {
        field: 'maxOutputBytes',
        limit: limits.maxOutputBytes,
        observed: compactOutputBytes,
        format: 'compact',
      });
    }
    if (prettyOutputBytes > limits.maxOutputBytes) {
      unsafe(outputPath, 'CANONICAL_JSON_OUTPUT_LIMIT_EXCEEDED', {
        field: 'maxOutputBytes',
        limit: limits.maxOutputBytes,
        observed: prettyOutputBytes,
        format: 'pretty',
      });
    }
  }

  function addJsonString(valueToMeasure, outputPath) {
    const remaining = Math.max(0, limits.maxOutputBytes - prettyOutputBytes);
    const bytes = jsonStringByteLength(valueToMeasure, remaining);
    addOutputBytes(bytes, bytes, outputPath);
  }

  while (stack.length > 0) {
    const frame = stack.pop();

    if (frame.kind === 'close') {
      if (frame.hasChildren) {
        addOutputBytes(0, 1 + (2 * (frame.depth - 1)), frame.path);
      }
      addOutputBytes(1, 1, frame.path);
      active.delete(frame.value);
      continue;
    }

    if (frame.kind === 'arrayItem') {
      const itemPath = pathFor(frame.path, frame.index);
      const descriptor = Object.getOwnPropertyDescriptor(
        frame.value,
        String(frame.index),
      );
      if (!descriptor) {
        unsafe(itemPath, 'SPARSE_ARRAY');
      }
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        unsafe(itemPath, 'INVALID_ARRAY_PROPERTY');
      }

      if (frame.index > 0) {
        addOutputBytes(1, 2, itemPath);
      }
      addOutputBytes(0, 2 * frame.depth, itemPath);

      if (frame.index + 1 < frame.value.length) {
        stack.push({ ...frame, index: frame.index + 1 });
      }
      stack.push({
        kind: 'value',
        value: descriptor.value,
        path: itemPath,
        depth: frame.depth + 1,
      });
      continue;
    }

    if (frame.kind === 'objectProperty') {
      const key = frame.keys[frame.index];
      if (typeof key === 'symbol') {
        unsafe(frame.path, 'SYMBOL_KEY');
      }
      const propertyPath = pathFor(frame.path, key);
      const descriptor = Object.getOwnPropertyDescriptor(frame.value, key);
      if (!descriptor || !descriptor.enumerable) {
        unsafe(propertyPath, 'NON_ENUMERABLE_PROPERTY');
      }
      if (!Object.hasOwn(descriptor, 'value')) {
        unsafe(propertyPath, 'ACCESSOR_PROPERTY');
      }

      if (frame.index > 0) {
        addOutputBytes(1, 2, propertyPath);
      }
      addOutputBytes(0, 2 * frame.depth, propertyPath);
      addJsonString(key, propertyPath);
      addOutputBytes(1, 2, propertyPath);

      if (frame.index + 1 < frame.keys.length) {
        stack.push({ ...frame, index: frame.index + 1 });
      }
      stack.push({
        kind: 'value',
        value: descriptor.value,
        path: propertyPath,
        depth: frame.depth + 1,
      });
      continue;
    }

    nodeCount += 1;
    if (nodeCount > limits.maxNodes) {
      unsafe(frame.path, 'CANONICAL_JSON_NODE_LIMIT_EXCEEDED', {
        field: 'maxNodes',
        limit: limits.maxNodes,
        observed: nodeCount,
      });
    }
    if (frame.depth > limits.maxDepth) {
      unsafe(frame.path, 'CANONICAL_JSON_DEPTH_LIMIT_EXCEEDED', {
        field: 'maxDepth',
        limit: limits.maxDepth,
        observed: frame.depth,
      });
    }

    if (frame.value === null) {
      addOutputBytes(4, 4, frame.path);
      continue;
    }
    if (typeof frame.value === 'string') {
      addJsonString(frame.value, frame.path);
      continue;
    }
    if (typeof frame.value === 'boolean') {
      const bytes = frame.value ? 4 : 5;
      addOutputBytes(bytes, bytes, frame.path);
      continue;
    }
    if (typeof frame.value === 'number') {
      if (!Number.isFinite(frame.value) || Object.is(frame.value, -0)) {
        unsafe(frame.path, 'JSON_UNSAFE_NUMBER', { actual: String(frame.value) });
      }
      const bytes = String(frame.value).length;
      addOutputBytes(bytes, bytes, frame.path);
      continue;
    }
    if (typeof frame.value !== 'object') {
      unsafe(frame.path, 'JSON_UNSAFE_VALUE_TYPE', { actualType: typeof frame.value });
    }
    if (active.has(frame.value)) {
      raise(
        'CYCLIC_CANONICAL_TAB_RESULT',
        frame.path,
        'CYCLIC_REFERENCE',
        'CanonicalTabResult contains a cyclic reference.',
      );
    }

    let keys;
    if (Array.isArray(frame.value)) {
      for (const key of Reflect.ownKeys(frame.value)) {
        if (typeof key === 'symbol') {
          unsafe(frame.path, 'SYMBOL_KEY');
        }
        if (
          key !== 'length'
          && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= frame.value.length)
        ) {
          unsafe(pathFor(frame.path, key), 'ARRAY_EXTRA_PROPERTY');
        }
      }
    } else {
      if (!isPlainObject(frame.value)) {
        unsafe(frame.path, 'NON_PLAIN_OBJECT');
      }
      keys = Reflect.ownKeys(frame.value);
    }

    active.add(frame.value);
    const childCount = Array.isArray(frame.value) ? frame.value.length : keys.length;
    addOutputBytes(1, 1, frame.path);
    if (childCount > 0) {
      addOutputBytes(0, 1, frame.path);
    }
    stack.push({
      kind: 'close',
      value: frame.value,
      path: frame.path,
      depth: frame.depth,
      hasChildren: childCount > 0,
    });
    if (Array.isArray(frame.value) && childCount > 0) {
      stack.push({
        kind: 'arrayItem',
        value: frame.value,
        path: frame.path,
        depth: frame.depth,
        index: 0,
      });
    } else if (childCount > 0) {
      stack.push({
        kind: 'objectProperty',
        value: frame.value,
        path: frame.path,
        depth: frame.depth,
        keys,
        index: 0,
      });
    }
  }
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
  CANONICAL_TAB_VALIDATION_LIMITS,
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
