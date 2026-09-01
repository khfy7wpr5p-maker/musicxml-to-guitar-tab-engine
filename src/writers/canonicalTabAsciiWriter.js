'use strict';

const { EngineError } = require('../errors/engineError');
const {
  CanonicalTabContractError,
  validateCanonicalTabResult,
  validateCanonicalTabResultV1_1,
} = require('../contracts/canonicalTabResultContract');

const STRING_COUNT = 6;
const MINIMUM_CELL_WIDTH = 3;

class CanonicalTabAsciiWriterError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'CanonicalTabAsciiWriterError');
  }
}

function invalidOptions(message, details = {}) {
  return new CanonicalTabAsciiWriterError(
    message,
    'INVALID_CANONICAL_TAB_ASCII_OPTIONS',
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

  const normalized = {
    trailingNewline: false,
  };

  for (const key of Reflect.ownKeys(options)) {
    if (typeof key === 'symbol' || key !== 'trailingNewline') {
      throw invalidOptions('options contains an unknown field.', {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }

    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidOptions('options fields must be enumerable data properties.', {
        field: key,
      });
    }
    if (typeof descriptor.value !== 'boolean') {
      throw invalidOptions('options.trailingNewline must be a boolean.', {
        field: 'trailingNewline',
        value: descriptor.value,
      });
    }
    normalized.trailingNewline = descriptor.value;
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
    return new CanonicalTabAsciiWriterError(
      'The CanonicalTabResult schema version is not supported by the ASCII writer.',
      'UNSUPPORTED_CANONICAL_TAB_ASCII_SCHEMA',
      details,
    );
  }

  return new CanonicalTabAsciiWriterError(
    'canonicalTabResult violates the CanonicalTabResult contract.',
    'INVALID_CANONICAL_TAB_ASCII_RESULT',
    details,
  );
}

function validateForAsciiWriter(canonicalTabResult) {
  try {
    return validateCanonicalTabResult(canonicalTabResult);
  } catch (error) {
    if (
      error instanceof CanonicalTabContractError
      && error.code === 'UNSUPPORTED_CANONICAL_TAB_SCHEMA'
      && error.details.actual === '1.1.0'
    ) {
      try {
        return validateCanonicalTabResultV1_1(canonicalTabResult);
      } catch (v1_1Error) {
        throw adaptContractError(v1_1Error);
      }
    }
    throw adaptContractError(error);
  }
}

function renderEventCell(event, stringNumber) {
  if (event.type === 'rest') {
    return '-'.repeat(MINIMUM_CELL_WIDTH);
  }

  const fretText = String(event.selectedPosition.fret);
  const width = Math.max(MINIMUM_CELL_WIDTH, fretText.length + 2);
  if (event.selectedPosition.string !== stringNumber) {
    return '-'.repeat(width);
  }
  return `-${fretText}-`;
}

function serializeCanonicalTabResultToAscii(canonicalTabResult, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const validated = validateForAsciiWriter(canonicalTabResult);
  const lines = Array.from(
    { length: STRING_COUNT },
    (_, index) => `${index + 1}|`,
  );

  for (const measure of validated.measures) {
    if (measure.events.length === 0) {
      for (let stringIndex = 0; stringIndex < STRING_COUNT; stringIndex += 1) {
        lines[stringIndex] += `${'-'.repeat(MINIMUM_CELL_WIDTH)}|`;
      }
      continue;
    }

    for (const event of measure.events) {
      for (let stringIndex = 0; stringIndex < STRING_COUNT; stringIndex += 1) {
        lines[stringIndex] += renderEventCell(event, stringIndex + 1);
      }
    }
    for (let stringIndex = 0; stringIndex < STRING_COUNT; stringIndex += 1) {
      lines[stringIndex] += '|';
    }
  }

  const ascii = lines.join('\n');
  return normalizedOptions.trailingNewline ? `${ascii}\n` : ascii;
}

module.exports = {
  CanonicalTabAsciiWriterError,
  serializeCanonicalTabResultToAscii,
};
