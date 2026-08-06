'use strict';

const { SaxesParser } = require('saxes');
const {
  ProcessingBudgetConfigurationError,
  createProcessingBudget,
} = require('../core/processingBudget');
const {
  XmlSafetyError,
  normalizeXmlInput,
} = require('../validation/xmlSafety');

const PARSED_MUSICXML_DOCUMENT_VERSION = '1.0.0';

const XML_RESOURCE_LIMIT_CODES = Object.freeze({
  maxDepth: 'XML_DEPTH_LIMIT_EXCEEDED',
  maxElements: 'XML_ELEMENT_LIMIT_EXCEEDED',
  maxAttributes: 'XML_ATTRIBUTE_LIMIT_EXCEEDED',
  maxTextBytes: 'XML_TEXT_LIMIT_EXCEEDED',
});

class ParsedMusicXmlDocumentError extends Error {
  constructor(message, code = 'INVALID_XML', details = {}) {
    super(message);
    this.name = 'ParsedMusicXmlDocumentError';
    this.code = code;
    this.details = details;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const stack = [value];
  const seen = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }

    seen.add(current);
    for (const nested of Object.values(current)) {
      if (nested && typeof nested === 'object' && !seen.has(nested)) {
        stack.push(nested);
      }
    }
    Object.freeze(current);
  }

  return value;
}

function localName(tag) {
  return tag.local || tag.name;
}

function createAttributes(attributeValues) {
  return attributeValues.map((attribute) => ({
    name: attribute.local || attribute.name,
    value: attribute.value,
    uri: attribute.uri || '',
  }));
}

function createParserProcessingBudget(options) {
  try {
    return createProcessingBudget(options);
  } catch (error) {
    if (error instanceof ProcessingBudgetConfigurationError) {
      throw new XmlSafetyError(
        error.message,
        'INVALID_CONFIGURATION',
        Object.freeze({ ...error.details }),
      );
    }
    throw error;
  }
}

function resourceLimitExceeded(field, limit, observed) {
  const messages = {
    maxDepth: 'XML nesting depth exceeds the configured limit.',
    maxElements: 'XML element count exceeds the configured limit.',
    maxAttributes: 'XML attribute count exceeds the configured limit.',
    maxTextBytes: 'XML text content exceeds the configured byte limit.',
  };

  return new XmlSafetyError(
    messages[field],
    XML_RESOURCE_LIMIT_CODES[field],
    Object.freeze({ field, limit, observed }),
  );
}

function enforceLimit(field, limit, observed) {
  if (observed > limit) {
    throw resourceLimitExceeded(field, limit, observed);
  }
}

function parseParsedMusicXmlDocument(input, options = {}) {
  const budget = createParserProcessingBudget(options);
  const { limits } = budget;
  const xml = normalizeXmlInput(input, { maxBytes: limits.maxBytes });
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack = [];
  let root = null;
  let elementCount = 0;
  let attributeCount = 0;
  let textBytes = 0;

  parser.on('error', (error) => {
    throw error;
  });

  parser.on('opentag', (tag) => {
    const depth = stack.length + 1;
    enforceLimit('maxDepth', limits.maxDepth, depth);

    const nextElementCount = elementCount + 1;
    enforceLimit('maxElements', limits.maxElements, nextElementCount);

    const attributeValues = Object.values(tag.attributes || {});
    const nextAttributeCount = attributeCount + attributeValues.length;
    enforceLimit('maxAttributes', limits.maxAttributes, nextAttributeCount);

    elementCount = nextElementCount;
    attributeCount = nextAttributeCount;

    const node = {
      name: localName(tag),
      uri: tag.uri || '',
      attributes: createAttributes(attributeValues),
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

  function appendText(text) {
    const nextTextBytes = textBytes + Buffer.byteLength(text, 'utf8');
    enforceLimit('maxTextBytes', limits.maxTextBytes, nextTextBytes);
    textBytes = nextTextBytes;

    if (stack.length > 0) {
      stack[stack.length - 1].text += text;
    }
  }

  parser.on('text', appendText);
  parser.on('cdata', appendText);

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
