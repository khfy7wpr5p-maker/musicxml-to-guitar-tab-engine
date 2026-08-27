'use strict';

const { EngineError } = require('../errors/engineError');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_VERSION = '1.1.0';
const POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_AUTHORITY =
  'NON_MUSICAL_DOCUMENT_AND_LAYOUT_METADATA_ONLY';
const PARSED_MUSICXML_DOCUMENT_TYPE = 'ParsedMusicXmlDocument';
const PARSED_MUSICXML_DOCUMENT_VERSION = '1.0.0';
const MAX_LAYOUT_TENTHS_MAGNITUDE = 1_000_000;

const SAFE_ROOT_METADATA = new Set([
  'work',
  'movement-number',
  'movement-title',
  'identification',
  'defaults',
  'credit',
]);
const SAFE_MEASURE_METADATA = new Set(['print']);

class PolyphonicPresentationMetadataNormalizerError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_POLYPHONIC_PRESENTATION_METADATA_NORMALIZATION',
      Object.freeze({ ...details }),
      'PolyphonicPresentationMetadataNormalizerError',
    );
  }
}

function invalid(message, details = {}) {
  return new PolyphonicPresentationMetadataNormalizerError(message, details);
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime !== null && runtime !== undefined) {
    if (typeof runtime !== 'object' || typeof runtime.checkpoint !== 'function') {
      throw invalid('runtime must expose a ProcessingRuntime checkpoint function.', { field: 'runtime' });
    }
    runtime.checkpoint(phase, details);
  }
}

function isBoundedLayoutTenths(value) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= MAX_LAYOUT_TENTHS_MAGNITUDE;
}

function cloneAttributes(attributes, attributeMapper = null) {
  if (!Array.isArray(attributes)) throw invalid('Parsed node attributes must be an array.');
  const cloned = [];
  for (let index = 0; index < attributes.length; index += 1) {
    const attribute = attributes[index];
    const mapped = attributeMapper ? attributeMapper(attribute, index) : { ...attribute };
    if (mapped !== null) cloned.push(mapped);
  }
  return cloned;
}

function cloneNode(node, childMapper = null, attributeMapper = null) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.children)) {
    throw invalid('Parsed MusicXML node shape is invalid.');
  }
  const children = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const mapped = childMapper ? childMapper(child, index) : cloneNode(child);
    if (mapped !== null) children.push(mapped);
  }
  return {
    name: node.name,
    uri: node.uri,
    attributes: cloneAttributes(node.attributes, attributeMapper),
    text: node.text,
    children,
  };
}

function sanitizeMeasure(measure, ignoredFeatures, runtime, measureIndex) {
  checkpoint(runtime, 'polyphonic-presentation-normalizer:measure', { measureIndex });
  return cloneNode(
    measure,
    (child) => {
      if (child.uri === measure.uri && SAFE_MEASURE_METADATA.has(child.name)) {
        ignoredFeatures.add(`measure:${child.name}`);
        return null;
      }
      return cloneNode(child);
    },
    (attribute) => {
      if (
        attribute.uri.length === 0
        && attribute.name === 'width'
        && isBoundedLayoutTenths(attribute.value)
      ) {
        ignoredFeatures.add('measure-attribute:width');
        return null;
      }
      return { ...attribute };
    },
  );
}

function sanitizePart(part, ignoredFeatures, runtime) {
  let measureIndex = 0;
  return cloneNode(part, (child) => {
    if (child.uri === part.uri && child.name === 'measure') {
      const normalized = sanitizeMeasure(child, ignoredFeatures, runtime, measureIndex);
      measureIndex += 1;
      return normalized;
    }
    return cloneNode(child);
  });
}

function validateDocumentHeader(parsedDocument) {
  if (
    !parsedDocument
    || typeof parsedDocument !== 'object'
    || parsedDocument.documentType !== PARSED_MUSICXML_DOCUMENT_TYPE
    || parsedDocument.contractVersion !== PARSED_MUSICXML_DOCUMENT_VERSION
    || !parsedDocument.root
  ) {
    throw invalid('PS-6B presentation normalization requires ParsedMusicXmlDocument 1.0.0.');
  }
}

function deepFreezeNode(node) {
  for (const attribute of node.attributes) Object.freeze(attribute);
  Object.freeze(node.attributes);
  for (const child of node.children) deepFreezeNode(child);
  Object.freeze(node.children);
  return Object.freeze(node);
}

function normalizePolyphonicPresentationMetadata(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-presentation-normalizer:start');
  validateDocumentHeader(parsedDocument);

  const root = parsedDocument.root;
  const ignoredFeatures = new Set();
  const normalizedRoot = cloneNode(root, (child) => {
    if (child.uri === root.uri && SAFE_ROOT_METADATA.has(child.name)) {
      ignoredFeatures.add(`root:${child.name}`);
      return null;
    }
    if (child.uri === root.uri && child.name === 'part') {
      return sanitizePart(child, ignoredFeatures, runtime);
    }
    return cloneNode(child);
  });

  const normalizedDocument = Object.freeze({
    documentType: PARSED_MUSICXML_DOCUMENT_TYPE,
    contractVersion: PARSED_MUSICXML_DOCUMENT_VERSION,
    root: deepFreezeNode(normalizedRoot),
  });
  const ignored = Object.freeze([...ignoredFeatures].sort());

  checkpoint(runtime, 'polyphonic-presentation-normalizer:complete', {
    ignoredFeatureCount: ignored.length,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_VERSION,
    authority: POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_AUTHORITY,
    parsedDocument: normalizedDocument,
    ignoredFeatures: ignored,
  });
}

function projectParsedMusicXmlWithPresentationCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicPresentationMetadata(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_VERSION,
    authority: POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_AUTHORITY,
    sourceModel,
    ignoredFeatures: normalization.ignoredFeatures,
  });
}

module.exports = {
  POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_VERSION,
  POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_AUTHORITY,
  PolyphonicPresentationMetadataNormalizerError,
  normalizePolyphonicPresentationMetadata,
  projectParsedMusicXmlWithPresentationCompatibility,
};
