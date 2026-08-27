'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicNotationContext,
} = require('./polyphonicNotationContextNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_AUTHORITY =
  'COMMON_TIME_DISPLAY_NO_TIMING_REWRITE';

class PolyphonicTimeSignatureDisplayNormalizerError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_TIME_SIGNATURE_DISPLAY', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicTimeSignatureDisplayNormalizerError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicTimeSignatureDisplayNormalizerError(
    message,
    'INVALID_POLYPHONIC_TIME_SIGNATURE_DISPLAY',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicTimeSignatureDisplayNormalizerError(
    message,
    'UNSUPPORTED_POLYPHONIC_TIME_SIGNATURE_DISPLAY',
    details,
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime !== null && runtime !== undefined) {
    if (typeof runtime !== 'object' || typeof runtime.checkpoint !== 'function') {
      throw invalid('runtime must expose a ProcessingRuntime checkpoint function.', { field: 'runtime' });
    }
    runtime.checkpoint(phase, details);
  }
}

function directChildren(node, name = null) {
  return node.children.filter((child) => (
    child.uri === node.uri && (name === null || child.name === name)
  ));
}

function requireScalarLeaf(node, field, location) {
  if (
    node.attributes.length !== 0
    || directChildren(node).length !== 0
    || node.children.some((child) => child.uri !== node.uri)
  ) {
    throw unsupported(`${field} must be a scalar leaf without attributes or children.`, location);
  }
  return node.text.trim();
}

function cloneAttributes(attributes) {
  return attributes.map((attribute) => ({ ...attribute }));
}

function cloneNode(node, childMapper = null, attributeMapper = null) {
  const children = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const mapped = childMapper ? childMapper(child, index) : cloneNode(child);
    if (mapped !== null) children.push(mapped);
  }
  const attributes = attributeMapper
    ? attributeMapper(node.attributes)
    : cloneAttributes(node.attributes);
  return {
    name: node.name,
    uri: node.uri,
    attributes,
    text: node.text,
    children,
  };
}

function deepFreezeNode(node) {
  for (const attribute of node.attributes) Object.freeze(attribute);
  Object.freeze(node.attributes);
  for (const child of node.children) deepFreezeNode(child);
  Object.freeze(node.children);
  return Object.freeze(node);
}

function parseExactCommonTime(timeNode, location) {
  const symbolAttributes = timeNode.attributes.filter((attribute) => (
    attribute.uri.length === 0 && attribute.name === 'symbol'
  ));
  if (symbolAttributes.length === 0) return null;
  if (symbolAttributes.length !== 1) {
    throw invalid('time symbol attribute must not be duplicated.', location);
  }
  if (
    timeNode.attributes.length !== 1
    || timeNode.attributes.some((attribute) => attribute.uri.length !== 0)
  ) {
    throw unsupported('time with symbol supports no additional attributes in this stage.', {
      ...location,
      observedAttributes: timeNode.attributes.map((attribute) => attribute.name),
    });
  }
  const symbol = symbolAttributes[0].value;
  if (symbol !== 'common') {
    throw unsupported('Only symbol="common" is supported in the current display-only stage.', {
      ...location,
      symbol,
    });
  }
  if (timeNode.text.trim().length !== 0 || timeNode.children.some((child) => child.uri !== timeNode.uri)) {
    throw unsupported('common-time node contains unsupported direct text or foreign children.', location);
  }
  const children = directChildren(timeNode);
  if (children.length !== 2 || children[0].name !== 'beats' || children[1].name !== 'beat-type') {
    throw unsupported('common-time must contain exactly beats then beat-type.', {
      ...location,
      observedChildren: children.map((child) => child.name),
    });
  }
  const beats = requireScalarLeaf(children[0], 'time.beats', location);
  const beatType = requireScalarLeaf(children[1], 'time.beat-type', location);
  if (beats !== '4' || beatType !== '4') {
    throw unsupported('symbol="common" is accepted only for exact 4/4 timing in this stage.', {
      ...location,
      beats,
      beatType,
    });
  }
  return Object.freeze({
    kind: 'time-symbol',
    symbol: 'common',
    beats: 4,
    beatType: 4,
  });
}

function sanitizeAttributesNode(attributesNode, context, markers) {
  return cloneNode(attributesNode, (child, attributesChildIndex) => {
    if (child.uri !== attributesNode.uri || child.name !== 'time') return cloneNode(child);
    const location = {
      measureIndex: context.measureIndex,
      measureNumber: context.measureNumber,
      measureChildIndex: context.measureChildIndex,
      attributesChildIndex,
    };
    const marker = parseExactCommonTime(child, location);
    if (marker === null) return cloneNode(child);
    markers.push(Object.freeze({ ...marker, ...location }));
    return cloneNode(
      child,
      null,
      (attributes) => attributes
        .filter((attribute) => !(attribute.uri.length === 0 && attribute.name === 'symbol'))
        .map((attribute) => ({ ...attribute })),
    );
  });
}

function sanitizePart(part, markers, runtime) {
  let measureIndex = 0;
  return cloneNode(part, (measure) => {
    if (measure.uri !== part.uri || measure.name !== 'measure') return cloneNode(measure);
    const currentMeasureIndex = measureIndex;
    measureIndex += 1;
    const numberAttribute = measure.attributes.find((attribute) => (
      attribute.uri.length === 0 && attribute.name === 'number'
    ));
    const measureNumber = numberAttribute ? numberAttribute.value : String(currentMeasureIndex + 1);
    checkpoint(runtime, 'polyphonic-time-signature-display-normalizer:measure', {
      measureIndex: currentMeasureIndex,
      measureNumber,
    });
    return cloneNode(measure, (measureChild, measureChildIndex) => {
      if (measureChild.uri === measure.uri && measureChild.name === 'attributes') {
        return sanitizeAttributesNode(measureChild, {
          measureIndex: currentMeasureIndex,
          measureNumber,
          measureChildIndex,
        }, markers);
      }
      return cloneNode(measureChild);
    });
  });
}

function normalizePolyphonicTimeSignatureDisplay(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-time-signature-display-normalizer:start');
  const notation = normalizePolyphonicNotationContext(parsedDocument, runtime);
  const markers = [];
  const root = notation.parsedDocument.root;
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild.uri === root.uri && rootChild.name === 'part') {
      return sanitizePart(rootChild, markers, runtime);
    }
    return cloneNode(rootChild);
  });
  const frozenMarkers = Object.freeze(markers);
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...notation.ignoredFeatures,
      ...(frozenMarkers.length > 0 ? ['time-attribute:symbol-display'] : []),
    ]),
  ].sort());
  const normalizedDocument = Object.freeze({
    documentType: notation.parsedDocument.documentType,
    contractVersion: notation.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-time-signature-display-normalizer:complete', {
    timeSignatureDisplayMarkerCount: frozenMarkers.length,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_VERSION,
    authority: POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_AUTHORITY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    ignoredDirectionCount: notation.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: notation.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: notation.octaveShiftMarkers,
    notationContextMarkers: notation.notationContextMarkers,
    timeSignatureDisplayMarkers: frozenMarkers,
  });
}

function projectParsedMusicXmlWithTimeSignatureDisplayCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicTimeSignatureDisplay(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_VERSION,
    authority: POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_AUTHORITY,
    sourceModel,
    ignoredFeatures: normalization.ignoredFeatures,
    ignoredDirectionCount: normalization.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: normalization.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: normalization.octaveShiftMarkers,
    notationContextMarkers: normalization.notationContextMarkers,
    timeSignatureDisplayMarkers: normalization.timeSignatureDisplayMarkers,
  });
}

module.exports = {
  POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_VERSION,
  POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_AUTHORITY,
  PolyphonicTimeSignatureDisplayNormalizerError,
  normalizePolyphonicTimeSignatureDisplay,
  projectParsedMusicXmlWithTimeSignatureDisplayCompatibility,
};
