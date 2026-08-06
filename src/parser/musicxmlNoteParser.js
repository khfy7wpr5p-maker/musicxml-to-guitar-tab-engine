'use strict';

const {
  resolveProcessingRuntime,
} = require('../core/processingRuntime');
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

function parseMusicXmlNotes(input, options = {}, runtime = null) {
  let parsedDocument;
  let processing;
  try {
    processing = resolveProcessingRuntime(options, runtime);
    processing.checkpoint('musicxml:start');
    parsedDocument = parseParsedMusicXmlDocument(input, {}, processing);
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
    enforceMusicXmlSemanticResourceLimits(parsedDocument, processing);
    processing.checkpoint('musicxml:adapter:start');
    const adapted = adaptParsedMusicXmlDocumentToNotes(parsedDocument);
    processing.checkpoint('musicxml:adapter:complete');
    return adapted;
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
