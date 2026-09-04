'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicPresentationMetadata,
} = require('./polyphonicPresentationMetadataNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_AUTHORITY =
  'NON_PITCH_NON_SCORE_TIMELINE_PERFORMANCE_DIRECTIONS_ONLY';

const SAFE_DIRECTION_TYPES = new Set([
  'dynamics',
  'metronome',
  'pedal',
  'wedge',
  'words',
]);
const SAFE_DIRECTION_ATTRIBUTES = new Set(['placement']);
const SAFE_DIRECTION_CHILDREN = new Set(['direction-type', 'offset', 'sound', 'staff']);
const SAFE_SOUND_ATTRIBUTES = new Set(['tempo', 'dynamics']);
const DEFERRED_PRODUCTION_DIRECTION_TYPES = new Set(['pedal', 'wedge', 'words']);
const MAX_NUMERIC_MAGNITUDE = 10000;

class PolyphonicPerformanceDirectionNormalizerError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZATION',
      Object.freeze({ ...details }),
      'PolyphonicPerformanceDirectionNormalizerError',
    );
  }
}

function invalid(message, details = {}) {
  return new PolyphonicPerformanceDirectionNormalizerError(message, details);
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime !== null && runtime !== undefined) {
    if (typeof runtime !== 'object' || typeof runtime.checkpoint !== 'function') {
      throw invalid('runtime must expose a ProcessingRuntime checkpoint function.', { field: 'runtime' });
    }
    runtime.checkpoint(phase, details);
  }
}

function sameNamespaceChildren(node) {
  return node.children.filter((child) => child.uri === node.uri);
}

function hasOnlyUnqualifiedAttributes(node, allowedNames) {
  return node.attributes.every((attribute) => (
    attribute.uri.length === 0 && allowedNames.has(attribute.name)
  ));
}

function isBoundedNumber(value, { minimum = -MAX_NUMERIC_MAGNITUDE, maximum = MAX_NUMERIC_MAGNITUDE } = {}) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum;
}

function isSafeOffset(node) {
  if (sameNamespaceChildren(node).length !== 0) return false;
  if (!node.attributes.every((attribute) => (
    attribute.uri.length === 0
    && attribute.name === 'sound'
    && (attribute.value === 'yes' || attribute.value === 'no')
  ))) return false;
  return /^-?\d+$/.test(node.text.trim())
    && Number.isSafeInteger(Number(node.text.trim()));
}

function isSafeStaff(node) {
  if (sameNamespaceChildren(node).length !== 0 || node.attributes.length !== 0) return false;
  const text = node.text.trim();
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0;
}

function isSafeSound(node) {
  if (sameNamespaceChildren(node).length !== 0) return false;
  if (node.attributes.length === 0) return false;
  if (!hasOnlyUnqualifiedAttributes(node, SAFE_SOUND_ATTRIBUTES)) return false;
  if (node.text.trim().length !== 0) return false;

  for (const attribute of node.attributes) {
    if (attribute.name === 'tempo') {
      if (!isBoundedNumber(attribute.value, { minimum: Number.MIN_VALUE })) return false;
    } else if (attribute.name === 'dynamics') {
      if (!isBoundedNumber(attribute.value, { minimum: 0 })) return false;
    }
  }
  return true;
}

function safeDirectionTypeNames(directionTypeNode) {
  if (directionTypeNode.attributes.length !== 0) return null;
  const children = sameNamespaceChildren(directionTypeNode);
  if (children.length === 0 || children.length !== directionTypeNode.children.length) return null;
  const names = [];
  for (const child of children) {
    if (!SAFE_DIRECTION_TYPES.has(child.name)) return null;
    names.push(child.name);
  }
  return names;
}

function hasExactUnqualifiedAttributes(node, validators) {
  const seen = new Set();
  for (const attribute of node.attributes) {
    if (attribute.uri.length !== 0 || !Object.hasOwn(validators, attribute.name)) return false;
    if (seen.has(attribute.name) || !validators[attribute.name](attribute.value)) return false;
    seen.add(attribute.name);
  }
  return true;
}

function isSafeDeferredWords(node) {
  return (
    sameNamespaceChildren(node).length === 0
    && node.children.length === 0
    && node.text.trim().length > 0
    && node.text.trim().length <= 256
    && hasExactUnqualifiedAttributes(node, {
      'font-style': (value) => value === 'normal' || value === 'italic',
    })
  );
}

function isSafeDeferredPedal(node) {
  if (sameNamespaceChildren(node).length !== 0 || node.children.length !== 0) return false;
  if (node.text.trim().length !== 0) return false;
  if (!hasExactUnqualifiedAttributes(node, {
    type: (value) => ['start', 'stop', 'change', 'continue', 'resume', 'discontinue'].includes(value),
    line: (value) => value === 'yes' || value === 'no',
    sign: (value) => value === 'yes' || value === 'no',
    number: (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 16,
  })) return false;
  return node.attributes.some((attribute) => attribute.name === 'type');
}

function isSafeDeferredWedge(node) {
  if (sameNamespaceChildren(node).length !== 0 || node.children.length !== 0) return false;
  if (node.text.trim().length !== 0) return false;
  if (!hasExactUnqualifiedAttributes(node, {
    type: (value) => ['crescendo', 'diminuendo', 'stop', 'continue'].includes(value),
    number: (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 16,
  })) return false;
  return node.attributes.some((attribute) => attribute.name === 'type');
}

function isSafeDeferredProductionDirection(directionNode, classification) {
  if (classification.hasOffset || classification.soundAttributes.length !== 0) return false;
  if (classification.typeNames.some((name) => !DEFERRED_PRODUCTION_DIRECTION_TYPES.has(name))) {
    return false;
  }
  if (directionNode.text.trim().length !== 0) return false;
  const placement = directionNode.attributes.find((attribute) => attribute.name === 'placement');
  if (placement && placement.value !== 'above' && placement.value !== 'below') return false;

  const directionTypes = sameNamespaceChildren(directionNode)
    .filter((child) => child.name === 'direction-type');
  return directionTypes.every((directionType) => (
    directionType.text.trim().length === 0
    && directionType.children.every((child) => {
      if (child.uri !== directionType.uri) return false;
      if (child.name === 'words') return isSafeDeferredWords(child);
      if (child.name === 'pedal') return isSafeDeferredPedal(child);
      if (child.name === 'wedge') return isSafeDeferredWedge(child);
      return false;
    })
  ));
}

function classifySafePerformanceDirection(directionNode) {
  if (!hasOnlyUnqualifiedAttributes(directionNode, SAFE_DIRECTION_ATTRIBUTES)) return null;
  const children = sameNamespaceChildren(directionNode);
  if (children.length !== directionNode.children.length || children.length === 0) return null;
  if (children.some((child) => !SAFE_DIRECTION_CHILDREN.has(child.name))) return null;

  const directionTypes = children.filter((child) => child.name === 'direction-type');
  if (directionTypes.length === 0) return null;
  const typeNames = [];
  for (const directionType of directionTypes) {
    const names = safeDirectionTypeNames(directionType);
    if (names === null) return null;
    typeNames.push(...names);
  }

  for (const child of children) {
    if (child.name === 'offset' && !isSafeOffset(child)) return null;
    if (child.name === 'staff' && !isSafeStaff(child)) return null;
    if (child.name === 'sound' && !isSafeSound(child)) return null;
  }

  return Object.freeze({
    typeNames: Object.freeze([...new Set(typeNames)].sort()),
    hasOffset: children.some((child) => child.name === 'offset'),
    soundAttributes: Object.freeze([
      ...new Set(children
        .filter((child) => child.name === 'sound')
        .flatMap((child) => child.attributes.map((attribute) => attribute.name))),
    ].sort()),
  });
}

function cloneAttributes(attributes) {
  if (!Array.isArray(attributes)) throw invalid('Parsed node attributes must be an array.');
  return attributes.map((attribute) => ({ ...attribute }));
}

function cloneNode(node, childMapper = null) {
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
    attributes: cloneAttributes(node.attributes),
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

function addCount(counts, feature) {
  counts.set(feature, (counts.get(feature) || 0) + 1);
}

function sanitizeMeasure(measure, provenance, runtime, measureIndex, shouldNormalizeDirection) {
  checkpoint(runtime, 'polyphonic-performance-direction-normalizer:measure', { measureIndex });
  return cloneNode(measure, (child) => {
    if (child.uri !== measure.uri || child.name !== 'direction') return cloneNode(child);
    const classification = classifySafePerformanceDirection(child);
    if (classification === null || !shouldNormalizeDirection(child, classification)) {
      return cloneNode(child);
    }

    provenance.ignoredDirectionCount += 1;
    for (const typeName of classification.typeNames) addCount(provenance.counts, `direction:${typeName}`);
    if (classification.hasOffset) addCount(provenance.counts, 'direction:offset');
    for (const attributeName of classification.soundAttributes) {
      addCount(provenance.counts, `direction:sound:${attributeName}`);
    }
    return null;
  });
}

function sanitizePart(part, provenance, runtime, shouldNormalizeDirection) {
  let measureIndex = 0;
  return cloneNode(part, (child) => {
    if (child.uri === part.uri && child.name === 'measure') {
      const normalized = sanitizeMeasure(
        child,
        provenance,
        runtime,
        measureIndex,
        shouldNormalizeDirection,
      );
      measureIndex += 1;
      return normalized;
    }
    return cloneNode(child);
  });
}

function normalizePolyphonicPerformanceDirectionsWithSelector(
  parsedDocument,
  runtime,
  shouldNormalizeDirection,
) {
  checkpoint(runtime, 'polyphonic-performance-direction-normalizer:start');
  const presentation = normalizePolyphonicPresentationMetadata(parsedDocument, runtime);
  const source = presentation.parsedDocument;
  const provenance = { counts: new Map(), ignoredDirectionCount: 0 };

  const normalizedRoot = cloneNode(source.root, (child) => {
    if (child.uri === source.root.uri && child.name === 'part') {
      return sanitizePart(child, provenance, runtime, shouldNormalizeDirection);
    }
    return cloneNode(child);
  });

  const directionFeatureCounts = Object.freeze(Object.fromEntries(
    [...provenance.counts].sort((a, b) => a[0].localeCompare(b[0])),
  ));
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...presentation.ignoredFeatures,
      ...provenance.counts.keys(),
    ]),
  ].sort());
  const normalizedDocument = Object.freeze({
    documentType: source.documentType,
    contractVersion: source.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-performance-direction-normalizer:complete', {
    ignoredDirectionCount: provenance.ignoredDirectionCount,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_VERSION,
    authority: POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_AUTHORITY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    ignoredDirectionCount: provenance.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: directionFeatureCounts,
  });
}

function normalizePolyphonicPerformanceDirections(parsedDocument, runtime = null) {
  return normalizePolyphonicPerformanceDirectionsWithSelector(
    parsedDocument,
    runtime,
    () => true,
  );
}

function normalizeDeferredPolyphonicPerformanceDirections(parsedDocument, runtime = null) {
  return normalizePolyphonicPerformanceDirectionsWithSelector(
    parsedDocument,
    runtime,
    isSafeDeferredProductionDirection,
  );
}

function projectParsedMusicXmlWithPerformanceDirectionCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicPerformanceDirections(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_VERSION,
    authority: POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_AUTHORITY,
    sourceModel,
    ignoredFeatures: normalization.ignoredFeatures,
    ignoredDirectionCount: normalization.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: normalization.ignoredDirectionFeatureCounts,
  });
}

module.exports = {
  POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_VERSION,
  POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_AUTHORITY,
  PolyphonicPerformanceDirectionNormalizerError,
  classifySafePerformanceDirection,
  normalizeDeferredPolyphonicPerformanceDirections,
  normalizePolyphonicPerformanceDirections,
  projectParsedMusicXmlWithPerformanceDirectionCompatibility,
};
