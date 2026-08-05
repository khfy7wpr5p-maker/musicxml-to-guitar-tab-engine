'use strict';

const {
  CANONICAL_TAB_RESULT_VERSION,
} = require('../tab/canonicalTabResult');

const STRING_COUNT = 6;
const MINIMUM_CELL_WIDTH = 3;

class CanonicalTabAsciiWriterError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CanonicalTabAsciiWriterError';
    this.code = code;
    this.details = details;
  }
}

function invalidResult(message, details = {}) {
  return new CanonicalTabAsciiWriterError(
    message,
    'INVALID_CANONICAL_TAB_ASCII_RESULT',
    details,
  );
}

function unsupportedSchema(details = {}) {
  return new CanonicalTabAsciiWriterError(
    'The CanonicalTabResult schema version is not supported by the ASCII writer.',
    'UNSUPPORTED_CANONICAL_TAB_ASCII_SCHEMA',
    details,
  );
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

function requirePlainObject(value, path) {
  if (!isPlainObject(value)) {
    throw invalidResult(`${path} must be a plain object.`, { path });
  }
  return value;
}

function requireDataProperty(object, key, path) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) {
    throw invalidResult(`${path} is required.`, { path });
  }
  if (!Object.hasOwn(descriptor, 'value')) {
    throw invalidResult(`${path} must be a data property.`, { path });
  }
  if (!descriptor.enumerable) {
    throw invalidResult(`${path} must be enumerable.`, { path });
  }
  return descriptor.value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    throw invalidResult(`${path} must be an array.`, { path });
  }
  return value;
}

function requireNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidResult(`${path} must be a non-empty string.`, { path });
  }
  return value;
}

function requireIntegerInRange(value, path, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw invalidResult(`${path} must be a safe integer from ${minimum} to ${maximum}.`, {
      path,
      value,
      minimum,
      maximum,
    });
  }
  return value;
}

function normalizeOptions(options) {
  if (!isPlainObject(options)) {
    throw invalidOptions('options must be a plain object.');
  }

  const allowedFields = new Set(['trailingNewline']);
  for (const field of Object.keys(options)) {
    if (!allowedFields.has(field)) {
      throw invalidOptions('options contains an unknown field.', { field });
    }
  }

  if (
    Object.hasOwn(options, 'trailingNewline')
    && typeof options.trailingNewline !== 'boolean'
  ) {
    throw invalidOptions('options.trailingNewline must be a boolean.', {
      field: 'trailingNewline',
    });
  }

  return {
    trailingNewline: options.trailingNewline === true,
  };
}

function validateGuitarConfiguration(canonicalTabResult) {
  const guitar = requirePlainObject(
    requireDataProperty(canonicalTabResult, 'guitar', 'canonicalTabResult.guitar'),
    'canonicalTabResult.guitar',
  );
  const minimumFret = requireIntegerInRange(
    requireDataProperty(guitar, 'minimumFret', 'canonicalTabResult.guitar.minimumFret'),
    'canonicalTabResult.guitar.minimumFret',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const maximumFret = requireIntegerInRange(
    requireDataProperty(guitar, 'maximumFret', 'canonicalTabResult.guitar.maximumFret'),
    'canonicalTabResult.guitar.maximumFret',
    minimumFret,
    Number.MAX_SAFE_INTEGER,
  );
  const tuning = requireArray(
    requireDataProperty(guitar, 'tuning', 'canonicalTabResult.guitar.tuning'),
    'canonicalTabResult.guitar.tuning',
  );

  if (tuning.length !== STRING_COUNT) {
    throw invalidResult(
      `canonicalTabResult.guitar.tuning must contain exactly ${STRING_COUNT} strings.`,
      { path: 'canonicalTabResult.guitar.tuning', length: tuning.length },
    );
  }

  const stringNumbers = new Set();
  for (let index = 0; index < tuning.length; index += 1) {
    const path = `canonicalTabResult.guitar.tuning[${index}]`;
    const stringConfiguration = requirePlainObject(tuning[index], path);
    const number = requireIntegerInRange(
      requireDataProperty(stringConfiguration, 'number', `${path}.number`),
      `${path}.number`,
      1,
      STRING_COUNT,
    );
    if (stringNumbers.has(number)) {
      throw invalidResult('canonicalTabResult.guitar.tuning contains a duplicate string number.', {
        path: `${path}.number`,
        number,
      });
    }
    stringNumbers.add(number);
  }

  return { minimumFret, maximumFret };
}

function validateEvent(event, path, fretRange) {
  requirePlainObject(event, path);
  const type = requireNonEmptyString(
    requireDataProperty(event, 'type', `${path}.type`),
    `${path}.type`,
  );
  const selectedPosition = requireDataProperty(
    event,
    'selectedPosition',
    `${path}.selectedPosition`,
  );

  if (type === 'rest') {
    if (selectedPosition !== null) {
      throw invalidResult(`${path}.selectedPosition must be null for a rest.`, {
        path: `${path}.selectedPosition`,
      });
    }
    return Object.freeze({ type: 'rest', selectedPosition: null });
  }

  if (type !== 'note') {
    throw invalidResult(`${path}.type must be note or rest.`, {
      path: `${path}.type`,
      type,
    });
  }

  const position = requirePlainObject(selectedPosition, `${path}.selectedPosition`);
  const string = requireIntegerInRange(
    requireDataProperty(position, 'string', `${path}.selectedPosition.string`),
    `${path}.selectedPosition.string`,
    1,
    STRING_COUNT,
  );
  const fret = requireIntegerInRange(
    requireDataProperty(position, 'fret', `${path}.selectedPosition.fret`),
    `${path}.selectedPosition.fret`,
    fretRange.minimumFret,
    fretRange.maximumFret,
  );

  return Object.freeze({
    type: 'note',
    selectedPosition: Object.freeze({ string, fret }),
  });
}

function validateCanonicalTabResult(canonicalTabResult) {
  requirePlainObject(canonicalTabResult, 'canonicalTabResult');

  const documentType = requireDataProperty(
    canonicalTabResult,
    'documentType',
    'canonicalTabResult.documentType',
  );
  if (documentType !== 'CanonicalTabResult') {
    throw invalidResult('canonicalTabResult.documentType must be CanonicalTabResult.', {
      documentType,
    });
  }

  const schemaVersion = requireDataProperty(
    canonicalTabResult,
    'schemaVersion',
    'canonicalTabResult.schemaVersion',
  );
  if (schemaVersion !== CANONICAL_TAB_RESULT_VERSION) {
    throw unsupportedSchema({
      expectedSchemaVersion: CANONICAL_TAB_RESULT_VERSION,
      actualSchemaVersion: schemaVersion,
    });
  }

  if (
    requireDataProperty(
      canonicalTabResult,
      'requiresTeacherReview',
      'canonicalTabResult.requiresTeacherReview',
    ) !== true
  ) {
    throw invalidResult('canonicalTabResult.requiresTeacherReview must be true.');
  }

  const fretRange = validateGuitarConfiguration(canonicalTabResult);
  const measures = requireArray(
    requireDataProperty(canonicalTabResult, 'measures', 'canonicalTabResult.measures'),
    'canonicalTabResult.measures',
  );
  const measureCount = requireIntegerInRange(
    requireDataProperty(canonicalTabResult, 'measureCount', 'canonicalTabResult.measureCount'),
    'canonicalTabResult.measureCount',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (measureCount !== measures.length) {
    throw invalidResult('canonicalTabResult.measureCount must match measures.length.', {
      measureCount,
      measuresLength: measures.length,
    });
  }

  return measures.map((measure, measureIndex) => {
    const path = `canonicalTabResult.measures[${measureIndex}]`;
    requirePlainObject(measure, path);
    requireNonEmptyString(
      requireDataProperty(measure, 'visibleMeasureNumber', `${path}.visibleMeasureNumber`),
      `${path}.visibleMeasureNumber`,
    );
    const events = requireArray(
      requireDataProperty(measure, 'events', `${path}.events`),
      `${path}.events`,
    );

    return Object.freeze({
      events: Object.freeze(events.map((event, eventIndex) => validateEvent(
        event,
        `${path}.events[${eventIndex}]`,
        fretRange,
      ))),
    });
  });
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
  const measures = validateCanonicalTabResult(canonicalTabResult);
  const lines = Array.from(
    { length: STRING_COUNT },
    (_, index) => `${index + 1}|`,
  );

  for (const measure of measures) {
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
