'use strict';

const {
  CanonicalTabResultError,
  createCanonicalTabResult,
} = require('../tab/canonicalTabResult');
const {
  createCanonicalMusicDocument,
} = require('../music/canonicalMusicDocument');
const {
  inspectMusicXml,
} = require('../validation/musicxmlPreflight');

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

function convertMusicXmlToCanonicalTab(input, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const inspection = inspectMusicXml(input, normalizedOptions.parser);
  const { preflight, parsedNotes } = inspection;

  if (!preflight.canProcess) {
    return Object.freeze({
      preflight,
      canonicalTabResult: null,
    });
  }

  const canonicalDocument = createCanonicalMusicDocument(parsedNotes);
  const canonicalTabResult = createCanonicalTabResult(canonicalDocument, {
    guitar: normalizedOptions.guitar,
    costProfile: normalizedOptions.costProfile,
  });

  return Object.freeze({
    preflight,
    canonicalTabResult,
  });
}

module.exports = {
  convertMusicXmlToCanonicalTab,
};
