'use strict';

const { SaxesParser } = require('saxes');
const {
  createProcessingBudget,
} = require('../core/processingBudget');
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
    this.details = Object.freeze({ ...details });
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

function createAttributes(tag) {
  const attributes = [];
  for (const attribute of Object.values(tag.attributes || {})) {
    attributes.push({
      name: attribute.local || attribute.name,
      value: attribute.value,
      uri: attribute.uri || '',
    });
  }
  return attributes;
}

function resourceLimitError(limit, maximum, actual) {
  return new ParsedMusicXmlDocumentError(
    'XML exceeds the configured structural processing limit.',
    'XML_RESOURCE_LIMIT_EXCEEDED',
    { limit, maximum, actual },
  );
}

function parseParsedMusicXmlDocument(input, options = {}) {
  const budget = createProcessingBudget(options);
  const { limits } = budget;
  const xml = normalizeXmlInput(input, { maxBytes: limits.maxBytes });
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack = [];
  let root = null;
  let elementCount = 0;
  let attributeCount = 0;
  let textByteCount = 0;

  parser.on('error', (error) => {
    throw error;
  });

  parser.on('opentag', (tag) => {
    const depth = stack.length + 1;
    if (depth > limits.maxDepth) {
      throw resourceLimitError('maxDepth', limits.maxDepth, depth);
    }

    const nextElementCount = elementCount + 1;
    if (nextElementCount > limits.maxElements) {
      throw resourceLimitError('maxElements', limits.maxElements, nextElementCount);
    }

    const tagAttributeCount = Object.keys(tag.attributes || {}).length;
    const nextAttributeCount = attributeCount + tagAttributeCount;
    if (nextAttributeCount > limits.maxAttributes) {
      throw resourceLimitError('maxAttributes', limits.maxAttributes, nextAttributeCount);
    }

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

    elementCount = nextElementCount;
    attributeCount = nextAttributeCount;
    stack.push(node);
  });

  function appendText(text) {
    const nextTextByteCount = textByteCount + Buffer.byteLength(text, 'utf8');
    if (nextTextByteCount > limits.maxTextBytes) {
      throw resourceLimitError('maxTextBytes', limits.maxTextBytes, nextTextByteCount);
    }

    textByteCount = nextTextByteCount;
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
