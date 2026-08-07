'use strict';

const { EngineError } = require('../errors/engineError');
const {
  CanonicalTabContractError,
  validateCanonicalTabResult,
} = require('../contracts/canonicalTabResultContract');

class CanonicalTabJsonWriterError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'CanonicalTabJsonWriterError');
  }
}

function invalidOptions(message, details = {}) {
  return new CanonicalTabJsonWriterError(
    message,
    'INVALID_CANONICAL_TAB_JSON_OPTIONS',
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

function normalizeOptions(options) {
  if (!isPlainObject(options)) {
    throw invalidOptions('options must be a plain object.');
  }

  const allowedFields = new Set(['pretty', 'trailingNewline']);
  const normalized = {
    pretty: false,
    trailingNewline: false,
  };

  for (const key of Reflect.ownKeys(options)) {
    if (typeof key === 'symbol' || !allowedFields.has(key)) {
      throw invalidOptions('options contains an unknown field.', {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }

    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidOptions('options fields must be enumerable data properties.', { field: key });
    }
    if (typeof descriptor.value !== 'boolean') {
      throw invalidOptions(`options.${key} must be boolean.`, {
        field: key,
        value: descriptor.value,
      });
    }
    normalized[key] = descriptor.value;
  }

  return normalized;
}

function adaptContractError(error) {
  if (!(error instanceof CanonicalTabContractError)) {
    return error;
  }

  const details = {
    ...error.details,
    contractCode: error.code,
  };

  if (error.code === 'UNSUPPORTED_CANONICAL_TAB_SCHEMA') {
    return new CanonicalTabJsonWriterError(
      'The CanonicalTabResult schema version is not supported.',
      'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
      details,
    );
  }
  if (error.code === 'UNSAFE_CANONICAL_TAB_VALUE') {
    return new CanonicalTabJsonWriterError(
      'CanonicalTabResult contains a value that cannot round-trip through JSON.',
      'UNSAFE_CANONICAL_TAB_JSON_VALUE',
      details,
    );
  }
  if (error.code === 'CYCLIC_CANONICAL_TAB_RESULT') {
    return new CanonicalTabJsonWriterError(
      'CanonicalTabResult contains a cyclic reference.',
      'CYCLIC_CANONICAL_TAB_RESULT',
      details,
    );
  }
  return new CanonicalTabJsonWriterError(
    'canonicalTabResult violates the CanonicalTabResult contract.',
    'INVALID_CANONICAL_TAB_RESULT',
    details,
  );
}

function validateForJsonWriter(canonicalTabResult) {
  try {
    return validateCanonicalTabResult(canonicalTabResult);
  } catch (error) {
    throw adaptContractError(error);
  }
}

function serializeCanonicalTabResult(canonicalTabResult, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  validateForJsonWriter(canonicalTabResult);

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
