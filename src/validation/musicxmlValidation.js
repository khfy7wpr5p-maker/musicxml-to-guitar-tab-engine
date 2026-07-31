'use strict';

const { SaxesParser } = require('saxes');
const { XmlSafetyError, normalizeXmlInput } = require('./xmlSafety');

class MusicXmlValidationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MusicXmlValidationError';
    this.code = code;
    this.details = details;
  }
}

function localName(tag) {
  return tag.local || tag.name;
}

function getAttribute(tag, expectedLocalName) {
  for (const attribute of Object.values(tag.attributes || {})) {
    const attributeName = attribute.local || attribute.name;
    if (attributeName === expectedLocalName && (!attribute.uri || attribute.uri.length === 0)) {
      return attribute.value;
    }
  }
  return undefined;
}

function invalidMusicXml(message, details = {}) {
  return new MusicXmlValidationError(message, 'INVALID_MUSICXML', details);
}

function pathMatches(stack, expectedPath) {
  return stack.length === expectedPath.length
    && expectedPath.every((name, index) => stack[index] === name);
}

function validateMusicXml(input, options = {}) {
  const xml = normalizeXmlInput(input, options);
  const parser = new SaxesParser({ xmlns: true, position: true });
  const stack = [];
  const scorePartIds = [];
  const partIds = [];
  const measureCounts = [];

  let root = null;
  let version = null;
  let partListCount = 0;
  let activePartIndex = -1;

  parser.on('error', (error) => {
    throw error;
  });

  parser.on('opentag', (tag) => {
    const name = localName(tag);

    if (stack.length === 0) {
      root = name;
      version = getAttribute(tag, 'version') || null;
    } else if (name === 'part-list' && pathMatches(stack, ['score-partwise'])) {
      partListCount += 1;
    } else if (name === 'score-part' && pathMatches(stack, ['score-partwise', 'part-list'])) {
      scorePartIds.push(getAttribute(tag, 'id'));
    } else if (name === 'part' && pathMatches(stack, ['score-partwise'])) {
      activePartIndex = partIds.length;
      partIds.push(getAttribute(tag, 'id'));
      measureCounts.push(0);
    } else if (
      name === 'measure'
      && activePartIndex >= 0
      && pathMatches(stack, ['score-partwise', 'part'])
    ) {
      measureCounts[activePartIndex] += 1;
    }

    stack.push(name);
  });

  parser.on('closetag', () => {
    if (pathMatches(stack, ['score-partwise', 'part'])) {
      activePartIndex = -1;
    }
    stack.pop();
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof XmlSafetyError || error instanceof MusicXmlValidationError) {
      throw error;
    }
    throw new MusicXmlValidationError('XML is not well formed.', 'INVALID_XML');
  }

  if (root === 'score-timewise') {
    throw new MusicXmlValidationError(
      'score-timewise MusicXML is not supported by the MVP.',
      'UNSUPPORTED_SCORE_FORMAT',
      { format: root },
    );
  }

  if (root !== 'score-partwise') {
    throw new MusicXmlValidationError(
      'MusicXML root element must be score-partwise.',
      'UNSUPPORTED_SCORE_FORMAT',
      { format: root },
    );
  }

  if (partListCount !== 1) {
    throw invalidMusicXml('MusicXML must contain exactly one direct part-list element.', {
      partListCount,
    });
  }

  if (scorePartIds.length > 1 || partIds.length > 1) {
    throw new MusicXmlValidationError(
      'Multiple score parts are not supported by the MVP.',
      'UNSUPPORTED_MULTIPART_SCORE',
      { scorePartCount: scorePartIds.length, partCount: partIds.length },
    );
  }

  if (scorePartIds.length !== 1 || partIds.length !== 1) {
    throw invalidMusicXml('MusicXML must define exactly one score-part and one part.', {
      scorePartCount: scorePartIds.length,
      partCount: partIds.length,
    });
  }

  const [scorePartId] = scorePartIds;
  const [partId] = partIds;

  if (typeof scorePartId !== 'string' || scorePartId.length === 0) {
    throw invalidMusicXml('score-part must define a non-empty id attribute.');
  }

  if (typeof partId !== 'string' || partId.length === 0) {
    throw invalidMusicXml('part must define a non-empty id attribute.');
  }

  if (partId !== scorePartId) {
    throw invalidMusicXml('part id must match the score-part id.', {
      scorePartId,
      partId,
    });
  }

  if (measureCounts[0] < 1) {
    throw invalidMusicXml('The score part must contain at least one measure.', {
      measureCount: measureCounts[0],
    });
  }

  return Object.freeze({
    format: 'score-partwise',
    version,
    partId,
    measureCount: measureCounts[0],
  });
}

module.exports = {
  MusicXmlValidationError,
  validateMusicXml,
};
