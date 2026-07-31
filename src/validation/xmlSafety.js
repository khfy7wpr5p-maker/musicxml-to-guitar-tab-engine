'use strict';

const DEFAULT_MAX_XML_BYTES = 5 * 1024 * 1024;

class XmlSafetyError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'XmlSafetyError';
    this.code = code;
    this.details = details;
  }
}

function validateMaxBytes(maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new XmlSafetyError(
      'Maximum XML size must be a positive integer.',
      'INVALID_CONFIGURATION',
      { maxBytes },
    );
  }
  return maxBytes;
}

function decodeUtf8Buffer(input) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new XmlSafetyError('Input is not valid UTF-8.', 'INVALID_ENCODING');
  }
}

function normalizeXmlInput(input, options = {}) {
  const maxBytes = validateMaxBytes(options.maxBytes ?? DEFAULT_MAX_XML_BYTES);
  let xml;
  let byteLength;

  if (typeof input === 'string') {
    xml = input;
    byteLength = Buffer.byteLength(input, 'utf8');
  } else if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    byteLength = input.byteLength;
    if (byteLength > maxBytes) {
      throw new XmlSafetyError('XML input exceeds the configured size limit.', 'FILE_TOO_LARGE', {
        maxBytes,
        byteLength,
      });
    }
    xml = decodeUtf8Buffer(input);
  } else {
    throw new XmlSafetyError(
      'XML input must be a UTF-8 string, Buffer or Uint8Array.',
      'INVALID_ENCODING',
      { inputType: input === null ? 'null' : typeof input },
    );
  }

  if (byteLength > maxBytes) {
    throw new XmlSafetyError('XML input exceeds the configured size limit.', 'FILE_TOO_LARGE', {
      maxBytes,
      byteLength,
    });
  }

  if (xml.replace(/^\uFEFF/, '').trim().length === 0) {
    throw new XmlSafetyError('XML input is empty.', 'EMPTY_INPUT');
  }

  if (xml.includes('\u0000')) {
    throw new XmlSafetyError('XML input contains a forbidden null byte.', 'INVALID_ENCODING');
  }

  const declaration = /^\uFEFF?\s*<\?xml\b([^?]*)\?>/i.exec(xml);
  const encoding = declaration?.[1].match(/\bencoding\s*=\s*(['"])([^'"]+)\1/i)?.[2];
  if (encoding && !/^utf-?8$/i.test(encoding)) {
    throw new XmlSafetyError('XML declaration must use UTF-8 encoding.', 'INVALID_ENCODING', {
      declaredEncoding: encoding,
    });
  }

  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new XmlSafetyError(
      'DTD and entity declarations are not allowed.',
      'UNSAFE_XML_DECLARATION',
    );
  }

  return xml;
}

module.exports = {
  DEFAULT_MAX_XML_BYTES,
  XmlSafetyError,
  normalizeXmlInput,
};
