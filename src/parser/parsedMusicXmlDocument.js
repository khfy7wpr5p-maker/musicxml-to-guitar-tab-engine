'use strict';

const { SaxesParser } = require('saxes');
const {
  XmlSafetyError,
  normalizeXmlInput,
} = require('../validation/xmlSafety');

const PARSED_MUSICXML_DOCUMENT_VERSION = '1.0.0';

class ParsedMusicXmlDocumentError extends Error {
  constructor(message, code = 'INVALID_XML', details = {}) {
    super(message);
    this.name = 'ParsedMusicXmlDocumentError';
    this.code = code;
    this.details = details;
  }
}

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

function localName(tag) {
  return tag.local || tag.name;
}

function createAttributes(tag) {
  const attributes = {};
  for (const attribute of Object.values(tag.attributes || {})) {
    const name = attribute.local || attribute.name;
    attributes[name] = {
      name,
      value: attribute.value,
      uri: attribute.uri || '',
    };
  }
  return attributes;
}

function parseParsedMusicXmlDocument(input, options = {}) {
  const xml = normalizeXmlInput(input, options);
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack = [];
  let root = null;

  parser.on('error', (error) => {
    throw error;
  });

  parser.on('opentag', (tag) => {
    const node = {
      name: localName(tag),
      uri: tag.uri || '',
      attributes: createAttributes(tag),
      text: '',
      children: [],
    };

    if (stack.length === 0) {
      if (root !== null) {
        throw new ParsedMusicXmlDocumentError(
          'XML must contain exactly one root element.',
          'INVALID_XML',
        );
      }
      root = node;
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  });

  parser.on('text', (text) => {
    if (stack.length > 0) {
      stack[stack.length - 1].text += text;
    }
  });

  parser.on('cdata', (text) => {
    if (stack.length > 0) {
      stack[stack.length - 1].text += text;
    }
  });

  parser.on('closetag', () => {
    stack.pop();
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof XmlSafetyError || error instanceof ParsedMusicXmlDocumentError) {
      throw error;
    }
    throw new ParsedMusicXmlDocumentError('XML is not well formed.', 'INVALID_XML');
  }

  if (!root) {
    throw new ParsedMusicXmlDocumentError('XML is not well formed.', 'INVALID_XML');
  }

  return deepFreeze({
    documentType: 'ParsedMusicXmlDocument',
    contractVersion: PARSED_MUSICXML_DOCUMENT_VERSION,
    root,
  });
}

module.exports = {
  PARSED_MUSICXML_DOCUMENT_VERSION,
  ParsedMusicXmlDocumentError,
  parseParsedMusicXmlDocument,
};
