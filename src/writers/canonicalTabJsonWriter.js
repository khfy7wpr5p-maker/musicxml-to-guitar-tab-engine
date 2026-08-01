'use strict';

const {
  CANONICAL_TAB_RESULT_VERSION,
} = require('../tab/canonicalTabResult');

class CanonicalTabJsonWriterError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CanonicalTabJsonWriterError';
    this.code = code;
    this.details = details;
  }
}

function invalidResult(message, details = {}) {
  return new CanonicalTabJsonWriterError(
    message,
    'INVALID_CANONICAL_TAB_RESULT',
    details,
  );
}

function unsupportedSchema(details = {}) {
  return new CanonicalTabJsonWriterError(
    'The CanonicalTabResult schema version is not supported.',
    'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
    details,
  );
}

function invalidOptions(message, details = {}) {
  return new CanonicalTabJsonWriterError(
    message,
    'INVALID_CANONICAL_TAB_JSON_OPTIONS',
    details,
  );
}

function unsafeValue(message, details = {}) {
  return new CanonicalTabJsonWriterError(
    message,
    'UNSAFE_CANONICAL_TAB_JSON_VALUE',
    details,
  );
}

function cyclicResult(details = {}) {
  return new CanonicalTabJsonWriterError(
    'CanonicalTabResult contains a cyclic reference.',
    'CYCLIC_CANONICAL_TAB_RESULT',
    details,
  );
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidResult(`${field} must be a non-empty string.`, { field });
  }
  return value;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidResult(`${field} must be a non-negative safe integer.`, {
      field,
      value,
    });
  }
  return value;
}

function validateCanonicalTabResultIdentity(canonicalTabResult) {
  if (!isPlainObject(canonicalTabResult)) {
    throw invalidResult('canonicalTabResult must be a plain object.');
  }
  if (canonicalTabResult.documentType !== 'CanonicalTabResult') {
    throw invalidResult(
      'canonicalTabResult.documentType must be CanonicalTabResult.',
      { documentType: canonicalTabResult.documentType },
    );
  }
  if (canonicalTabResult.schemaVersion !== CANONICAL_TAB_RESULT_VERSION) {
    throw unsupportedSchema({
      expectedSchemaVersion: CANONICAL_TAB_RESULT_VERSION,
      actualSchemaVersion: canonicalTabResult.schemaVersion,
    });
  }
  if (!isPlainObject(canonicalTabResult.engine)) {
    throw invalidResult('canonicalTabResult.engine must be a plain object.');
  }
  requireNonEmptyString(canonicalTabResult.engine.name, 'canonicalTabResult.engine.name');
  requireNonEmptyString(canonicalTabResult.engine.version, 'canonicalTabResult.engine.version');
  if (!isPlainObject(canonicalTabResult.source)) {
    throw invalidResult('canonicalTabResult.source must be a plain object.');
  }
  if (canonicalTabResult.requiresTeacherReview !== true) {
    throw invalidResult('canonicalTabResult.requiresTeacherReview must be true.');
  }
  if (!isPlainObject(canonicalTabResult.guitar)) {
    throw invalidResult('canonicalTabResult.guitar must be a plain object.');
  }
  if (!isPlainObject(canonicalTabResult.fingeringProfile)) {
    throw invalidResult('canonicalTabResult.fingeringProfile must be a plain object.');
  }
  if (
    typeof canonicalTabResult.totalFingeringCost !== 'number'
    || !Number.isFinite(canonicalTabResult.totalFingeringCost)
    || canonicalTabResult.totalFingeringCost < 0
  ) {
    throw invalidResult(
      'canonicalTabResult.totalFingeringCost must be a finite non-negative number.',
      { value: canonicalTabResult.totalFingeringCost },
    );
  }

  requireNonNegativeInteger(canonicalTabResult.measureCount, 'canonicalTabResult.measureCount');
  requireNonNegativeInteger(canonicalTabResult.voiceCount, 'canonicalTabResult.voiceCount');
  requireNonNegativeInteger(canonicalTabResult.noteCount, 'canonicalTabResult.noteCount');
  requireNonNegativeInteger(canonicalTabResult.restCount, 'canonicalTabResult.restCount');

  if (!Array.isArray(canonicalTabResult.measures)) {
    throw invalidResult('canonicalTabResult.measures must be an array.');
  }
  if (canonicalTabResult.measures.length !== canonicalTabResult.measureCount) {
    throw invalidResult(
      'canonicalTabResult.measureCount must match measures.length.',
      {
        measureCount: canonicalTabResult.measureCount,
        actualMeasureCount: canonicalTabResult.measures.length,
      },
    );
  }
  if (!Array.isArray(canonicalTabResult.warnings)) {
    throw invalidResult('canonicalTabResult.warnings must be an array.');
  }
}

function normalizeOptions(options) {
  if (!isPlainObject(options)) {
    throw invalidOptions('options must be a plain object.');
  }

  const allowedFields = new Set(['pretty', 'trailingNewline']);
  for (const field of Object.keys(options)) {
    if (!allowedFields.has(field)) {
      throw invalidOptions('options contains an unknown field.', { field });
    }
  }

  for (const field of allowedFields) {
    if (Object.hasOwn(options, field) && typeof options[field] !== 'boolean') {
      throw invalidOptions(`options.${field} must be boolean.`, {
        field,
        value: options[field],
      });
    }
  }

  return {
    pretty: options.pretty === true,
    trailingNewline: options.trailingNewline === true,
  };
}

function appendPath(path, key) {
  if (typeof key === 'number' || /^(0|[1-9]\d*)$/.test(key)) {
    return `${path}[${key}]`;
  }
  return `${path}.${key}`;
}

function validateJsonValue(value, path, active, validated) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw unsafeValue('CanonicalTabResult contains a number that cannot round-trip through JSON.', {
        path,
        value: String(value),
      });
    }
    return;
  }

  if (typeof value !== 'object') {
    throw unsafeValue('CanonicalTabResult contains a value that JSON would omit or reject.', {
      path,
      valueType: typeof value,
    });
  }

  if (active.has(value)) {
    throw cyclicResult({ path });
  }
  if (validated.has(value)) {
    return;
  }

  active.add(value);

  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value);
    for (const key of ownKeys) {
      if (typeof key === 'symbol') {
        throw unsafeValue('CanonicalTabResult arrays must not contain symbol keys.', { path });
      }
      if (key === 'length') {
        continue;
      }
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw unsafeValue('CanonicalTabResult arrays must not contain non-index properties.', {
          path: appendPath(path, key),
        });
      }
    }

    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw unsafeValue('CanonicalTabResult arrays must not be sparse.', {
          path: appendPath(path, index),
        });
      }
      validateJsonValue(value[index], appendPath(path, index), active, validated);
    }
  } else {
    if (!isPlainObject(value)) {
      throw unsafeValue('CanonicalTabResult must contain only plain objects and arrays.', {
        path,
        constructorName: value.constructor && value.constructor.name,
      });
    }

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        throw unsafeValue('CanonicalTabResult objects must not contain symbol keys.', { path });
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable) {
        throw unsafeValue('CanonicalTabResult contains a non-enumerable property.', {
          path: appendPath(path, key),
        });
      }
      if (!Object.hasOwn(descriptor, 'value')) {
        throw unsafeValue('CanonicalTabResult contains an accessor property.', {
          path: appendPath(path, key),
        });
      }
      validateJsonValue(
        descriptor.value,
        appendPath(path, key),
        active,
        validated,
      );
    }
  }

  active.delete(value);
  validated.add(value);
}

function serializeCanonicalTabResult(canonicalTabResult, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  validateCanonicalTabResultIdentity(canonicalTabResult);
  validateJsonValue(canonicalTabResult, '$', new WeakSet(), new WeakSet());

  let jsonText;
  try {
    jsonText = JSON.stringify(
      canonicalTabResult,
      null,
      normalizedOptions.pretty ? 2 : 0,
    );
  } catch (error) {
    throw new CanonicalTabJsonWriterError(
      'CanonicalTabResult could not be serialized as JSON.',
      'CANONICAL_TAB_JSON_SERIALIZATION_FAILED',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  if (typeof jsonText !== 'string') {
    throw new CanonicalTabJsonWriterError(
      'CanonicalTabResult serialization did not produce JSON text.',
      'CANONICAL_TAB_JSON_SERIALIZATION_FAILED',
    );
  }

  return normalizedOptions.trailingNewline ? `${jsonText}\n` : jsonText;
}

module.exports = {
  CanonicalTabJsonWriterError,
  serializeCanonicalTabResult,
};
