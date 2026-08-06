'use strict';

const { XmlSafetyError } = require('./xmlSafety');
const {
  ParsedMusicXmlDocumentError,
  parseParsedMusicXmlDocument,
} = require('../parser/parsedMusicXmlDocument');
const {
  MusicXmlDocumentAdapterError,
  validateParsedMusicXmlStructure,
} = require('../parser/musicxmlDocumentAdapter');

class MusicXmlValidationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MusicXmlValidationError';
    this.code = code;
    this.details = details;
  }
}

function validationErrorFrom(error) {
  return new MusicXmlValidationError(error.message, error.code, error.details || {});
}

function validateMusicXml(input, options = {}) {
  let parsedDocument;
  try {
    parsedDocument = parseParsedMusicXmlDocument(input, options);
  } catch (error) {
    if (error instanceof XmlSafetyError) {
      throw error;
    }
    if (error instanceof ParsedMusicXmlDocumentError) {
      throw validationErrorFrom(error);
    }
    throw error;
  }

  try {
    return validateParsedMusicXmlStructure(parsedDocument);
  } catch (error) {
    if (error instanceof MusicXmlDocumentAdapterError) {
      throw validationErrorFrom(error);
    }
    throw error;
  }
}

module.exports = {
  MusicXmlValidationError,
  validateMusicXml,
};
