'use strict';

const {
  resolveProcessingRuntime,
} = require('./processingRuntime');
const {
  CanonicalTabResultError,
  createCanonicalTabResult,
} = require('../tab/canonicalTabResult');
const {
  createCanonicalMusicDocument,
} = require('../music/canonicalMusicDocument');
const {
  createBlockedPreflightReport,
  inspectMusicXml,
} = require('../validation/musicxmlPreflight');
const {
  XmlSafetyError,
} = require('../validation/xmlSafety');

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

function blockedConversion(error) {
  return Object.freeze({
    preflight: createBlockedPreflightReport(error),
    canonicalTabResult: null,
  });
}

function convertMusicXmlToCanonicalTab(input, options = {}, runtime = null) {
  const normalizedOptions = normalizeOptions(options);
  let processing;

  try {
    processing = resolveProcessingRuntime(normalizedOptions.parser, runtime);
  } catch (error) {
    if (error instanceof XmlSafetyError) {
      return blockedConversion(error);
    }
    throw error;
  }

  const inspection = inspectMusicXml(input, {}, processing);
  const { preflight, parsedNotes } = inspection;

  if (!preflight.canProcess) {
    return Object.freeze({
      preflight,
      canonicalTabResult: null,
    });
  }

  try {
    processing.checkpoint('canonical-document:start');
    const canonicalDocument = createCanonicalMusicDocument(parsedNotes);
    processing.checkpoint('canonical-document:complete');
    processing.checkpoint('canonical-tab-result:start');
    const canonicalTabResult = createCanonicalTabResult(canonicalDocument, {
      guitar: normalizedOptions.guitar,
      costProfile: normalizedOptions.costProfile,
    });
    processing.checkpoint('canonical-tab-result:complete');

    return Object.freeze({
      preflight,
      canonicalTabResult,
    });
  } catch (error) {
    if (error instanceof XmlSafetyError) {
      return blockedConversion(error);
    }
    throw error;
  }
}

module.exports = {
  convertMusicXmlToCanonicalTab,
};
