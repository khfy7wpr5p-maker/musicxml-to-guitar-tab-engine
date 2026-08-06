'use strict';

const {
  resolveProcessingRuntime,
} = require('../core/processingRuntime');
const {
  CanonicalTabResultError,
  createCanonicalTabResult,
} = require('../tab/canonicalTabResult');
const {
  parseCanonicalMusicDocument,
} = require('./parseCanonicalMusicDocument');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidOptions(message, details = {}) {
  return new CanonicalTabResultError(
    message,
    'INVALID_CANONICAL_TAB_OPTIONS',
    details,
  );
}

function normalizeOptions(options) {
  if (!isObject(options)) {
    throw invalidOptions('options must be an object.');
  }

  const allowedFields = new Set(['parser', 'guitar', 'costProfile']);
  for (const field of Object.keys(options)) {
    if (!allowedFields.has(field)) {
      throw invalidOptions('options contains an unknown field.', { field });
    }
  }

  for (const field of allowedFields) {
    if (Object.hasOwn(options, field) && !isObject(options[field])) {
      throw invalidOptions(`options.${field} must be an object.`);
    }
  }

  return {
    parser: options.parser || {},
    guitar: options.guitar || {},
    costProfile: options.costProfile || {},
  };
}

function parseCanonicalTabResult(input, options = {}, runtime = null) {
  const normalizedOptions = normalizeOptions(options);
  const processing = resolveProcessingRuntime(normalizedOptions.parser, runtime);
  const canonicalDocument = parseCanonicalMusicDocument(input, {}, processing);
  processing.checkpoint('canonical-tab-result:start');
  const result = createCanonicalTabResult(canonicalDocument, {
    guitar: normalizedOptions.guitar,
    costProfile: normalizedOptions.costProfile,
  });
  processing.checkpoint('canonical-tab-result:complete');
  return result;
}

module.exports = {
  parseCanonicalTabResult,
};
