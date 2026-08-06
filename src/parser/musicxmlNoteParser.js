'use strict';

const {
  MusicXmlValidationError,
} = require('../validation/musicxmlValidation');
const {
  XmlSafetyError,
} = require('../validation/xmlSafety');
const {
  ParsedMusicXmlDocumentError,
  parseParsedMusicXmlDocument,
} = require('./parsedMusicXmlDocument');
const {
  MusicXmlDocumentAdapterError,
  adaptParsedMusicXmlDocumentToNotes,
} = require('./musicxmlDocumentAdapter');
const {
  createMusicXmlProcessingBudget,
  enforceMusicXmlSemanticResourceLimits,
} = require('./musicxmlSemanticResourceLimits');

class MusicXmlNoteParserError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MusicXmlNoteParserError';
    this.code = code;
    this.details = details;
  }
}

function parseMusicXmlNotes(input, options = {}) {
  let parsedDocument;
  let budget;
  try {
    budget = createMusicXmlProcessingBudget(options);
    parsedDocument = parseParsedMusicXmlDocument(input, budget.limits);
  } catch (error) {
    if (error instanceof XmlSafetyError) {
      throw error;
    }
    if (error instanceof ParsedMusicXmlDocumentError) {
      throw new MusicXmlValidationError(error.message, error.code, error.details);
    }
    throw error;
  }

  try {
    enforceMusicXmlSemanticResourceLimits(parsedDocument, budget);
    return adaptParsedMusicXmlDocumentToNotes(parsedDocument);
  } catch (error) {
    if (error instanceof XmlSafetyError) {
      throw error;
    }
    if (!(error instanceof MusicXmlDocumentAdapterError)) {
      throw error;
    }
    if (error.phase === 'structure') {
      throw new MusicXmlValidationError(error.message, error.code, error.details);
    }
    throw new MusicXmlNoteParserError(error.message, error.code, error.details);
  }
}

module.exports = {
  MusicXmlNoteParserError,
  parseMusicXmlNotes,
};
