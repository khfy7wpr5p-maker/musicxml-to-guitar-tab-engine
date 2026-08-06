'use strict';

const {
  MusicXmlNoteParserError,
  parseMusicXmlNotes,
} = require('../parser/musicxmlNoteParser');
const {
  MusicXmlValidationError,
} = require('./musicxmlValidation');
const {
  XmlSafetyError,
} = require('./xmlSafety');

const PREFLIGHT_STATUS = Object.freeze({
  PASS: 'PASS',
  WARNING: 'WARNING',
  BLOCKED: 'BLOCKED',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return value;
}

function errorCategory(error) {
  if (error instanceof XmlSafetyError) {
    return 'safety';
  }

  if (String(error.code).startsWith('UNSUPPORTED_')) {
    return 'capability';
  }

  if (error instanceof MusicXmlValidationError) {
    return 'structure';
  }

  return 'content';
}

function isKnownPreflightError(error) {
  return error instanceof XmlSafetyError
    || error instanceof MusicXmlValidationError
    || error instanceof MusicXmlNoteParserError;
}

function createBlockedPreflightReport(error) {
  return deepFreeze({
    status: PREFLIGHT_STATUS.BLOCKED,
    canProcess: false,
    summary: null,
    issues: [{
      severity: 'error',
      category: errorCategory(error),
      code: error.code,
      message: error.message,
      location: {
        measure: error.details?.measure ?? null,
        eventIndex: error.details?.eventIndex ?? null,
      },
      details: error.details || {},
    }],
  });
}

function collectWarnings(parsed) {
  return parsed.measures.flatMap((measure) =>
    measure.warnings.map((warning) => ({
      severity: 'warning',
      category: 'quality',
      code: warning.code,
      message: warning.message,
      location: warning.location || {},
      details: warning.details || {},
    }))
  );
}

function createPreflightReport(parsed) {
  const issues = collectWarnings(parsed);

  return deepFreeze({
    status: issues.length > 0
      ? PREFLIGHT_STATUS.WARNING
      : PREFLIGHT_STATUS.PASS,
    canProcess: true,
    summary: {
      format: parsed.format,
      version: parsed.version,
      partId: parsed.partId,
      measureCount: parsed.measureCount,
      voiceCount: parsed.voiceCount,
    },
    issues,
  });
}

function inspectMusicXml(input, options = {}, runtime = null) {
  try {
    const parsedNotes = parseMusicXmlNotes(input, options, runtime);
    return Object.freeze({
      preflight: createPreflightReport(parsedNotes),
      parsedNotes,
    });
  } catch (error) {
    if (isKnownPreflightError(error)) {
      return Object.freeze({
        preflight: createBlockedPreflightReport(error),
        parsedNotes: null,
      });
    }

    throw error;
  }
}

function preflightMusicXml(input, options = {}, runtime = null) {
  return inspectMusicXml(input, options, runtime).preflight;
}

module.exports = {
  PREFLIGHT_STATUS,
  createBlockedPreflightReport,
  inspectMusicXml,
  preflightMusicXml,
};
