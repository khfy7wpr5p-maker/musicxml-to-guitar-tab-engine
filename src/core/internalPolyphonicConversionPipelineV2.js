'use strict';

const { EngineError } = require('../errors/engineError');
const { resolveProcessingRuntime } = require('./processingRuntime');
const {
  parseParsedMusicXmlDocument,
} = require('../parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  createCanonicalTabResultV2,
} = require('../tab/canonicalTabResultV2');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriterV2');

const INTERNAL_POLYPHONIC_TAB_V2_CONVERSION_VERSION = '1.0.0';
const INTERNAL_POLYPHONIC_TAB_V2_CONVERSION_DOCUMENT_TYPE = 'InternalPolyphonicTabV2Conversion';
const MAX_INTERNAL_POLYPHONIC_MUSICXML_OUTPUT_BYTES = 64 * 1024 * 1024;

class InternalPolyphonicConversionV2Error extends EngineError {
  constructor(message, code = 'INVALID_INTERNAL_POLYPHONIC_V2_OPTIONS', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'InternalPolyphonicConversionV2Error');
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidOptions(message, details = {}) {
  return new InternalPolyphonicConversionV2Error(
    message,
    'INVALID_INTERNAL_POLYPHONIC_V2_OPTIONS',
    details,
  );
}

function normalizeOptions(options) {
  if (!isPlainObject(options)) throw invalidOptions('options must be a plain object.');
  const allowed = new Set(['processing', 'writer']);
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalidOptions('options contains an unknown field.', {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidOptions('options fields must be enumerable data properties.', { field: key });
    }
    if (!isPlainObject(descriptor.value)) {
      throw invalidOptions(`options.${key} must be a plain object.`, { field: key });
    }
  }
  return {
    processing: Object.hasOwn(options, 'processing') ? options.processing : {},
    writer: Object.hasOwn(options, 'writer') ? options.writer : {},
  };
}

function convertMusicXmlToInternalPolyphonicTabV2(
  input,
  arrangementDecisions,
  options = {},
  runtime = null,
) {
  const normalized = normalizeOptions(options);
  const processing = resolveProcessingRuntime(normalized.processing, runtime);
  processing.checkpoint('internal-polyphonic-v2:start');

  const parsedDocument = parseParsedMusicXmlDocument(input, {}, processing);
  processing.checkpoint('internal-polyphonic-v2:parsed');

  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(parsedDocument, processing);
  processing.checkpoint('internal-polyphonic-v2:projected', {
    measureCount: sourceModel.measureCount,
    eventCount: sourceModel.eventCount,
  });

  const canonicalTabResult = createCanonicalTabResultV2(
    sourceModel,
    arrangementDecisions,
    processing,
  );
  processing.checkpoint('internal-polyphonic-v2:canonical', {
    noteDispositionCount: canonicalTabResult.noteDispositions.length,
    selectedShapeCount: canonicalTabResult.selectedShapes.length,
  });

  const musicXml = serializeCanonicalTabResultV2ToMusicXml(
    canonicalTabResult,
    normalized.writer,
  );
  const outputBytes = Buffer.byteLength(musicXml, 'utf8');
  if (outputBytes > MAX_INTERNAL_POLYPHONIC_MUSICXML_OUTPUT_BYTES) {
    throw new InternalPolyphonicConversionV2Error(
      'Internal polyphonic MusicXML output exceeds the fixed output boundary.',
      'INTERNAL_POLYPHONIC_V2_OUTPUT_LIMIT_EXCEEDED',
      {
        limit: MAX_INTERNAL_POLYPHONIC_MUSICXML_OUTPUT_BYTES,
        observed: outputBytes,
      },
    );
  }
  processing.checkpoint('internal-polyphonic-v2:complete', { outputBytes });

  return Object.freeze({
    documentType: INTERNAL_POLYPHONIC_TAB_V2_CONVERSION_DOCUMENT_TYPE,
    contractVersion: INTERNAL_POLYPHONIC_TAB_V2_CONVERSION_VERSION,
    sourceModel,
    canonicalTabResult,
    musicXml,
  });
}

module.exports = {
  INTERNAL_POLYPHONIC_TAB_V2_CONVERSION_VERSION,
  INTERNAL_POLYPHONIC_TAB_V2_CONVERSION_DOCUMENT_TYPE,
  MAX_INTERNAL_POLYPHONIC_MUSICXML_OUTPUT_BYTES,
  InternalPolyphonicConversionV2Error,
  convertMusicXmlToInternalPolyphonicTabV2,
};