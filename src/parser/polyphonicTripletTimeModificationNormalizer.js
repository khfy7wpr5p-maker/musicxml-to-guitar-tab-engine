'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicStaccatoNotation,
} = require('./polyphonicStaccatoNotationNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_AUTHORITY =
  'TRIPLET_RELATION_PRESERVED_DURATION_ALREADY_ENCODED';
const POLYPHONIC_TRIPLET_DURATION_POLICY =
  'MUSICXML_DURATION_AUTHORITATIVE_NO_RATIO_RESCALING';

class PolyphonicTripletTimeModificationNormalizerError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_TRIPLET_TIME_MODIFICATION', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'PolyphonicTripletTimeModificationNormalizerError',
    );
  }
}

function invalid(message, details = {}) {
  return new PolyphonicTripletTimeModificationNormalizerError(
    message,
    'INVALID_POLYPHONIC_TRIPLET_TIME_MODIFICATION',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicTripletTimeModificationNormalizerError(
    message,
    'UNSUPPORTED_POLYPHONIC_TRIPLET_TIME_MODIFICATION',
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

function cloneAttributes(attributes) {
  return attributes.map((attribute) => ({ ...attribute }));
}

function cloneNode(node, childMapper = null) {
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

function assertScalarLeaf(node, expectedText, field, location) {
  if (
    node.text.trim() !== expectedText
    || node.attributes.length !== 0
    || node.children.length !== 0
  ) {
    throw unsupported(`${field} must be the exact scalar value ${expectedText}.`, {
      ...location,
      field,
      observedText: node.text.trim(),
    });
  }
}

function parseExactTripletTimeModification(node, location) {
  if (
    node.text.trim().length !== 0
    || node.attributes.length !== 0
    || node.children.some((child) => child.uri !== node.uri)
  ) {
    throw unsupported('time-modification must use the exact attribute-free 3:2 shape.', location);
  }

  const children = node.children.filter((child) => child.uri === node.uri);
  if (
    children.length !== 2
    || children[0].name !== 'actual-notes'
    || children[1].name !== 'normal-notes'
  ) {
    throw unsupported('Only a simple actual-notes/normal-notes 3:2 time-modification is supported.', {
      ...location,
      observedChildren: children.map((child) => child.name),
    });
  }

  assertScalarLeaf(children[0], '3', 'actual-notes', location);
  assertScalarLeaf(children[1], '2', 'normal-notes', location);

  return Object.freeze({
    kind: 'triplet-time-modification',
    actualNotes: 3,
    normalNotes: 2,
  });
}

function sanitizeNote(note, context, markers) {
  let observedCount = 0;
  const normalized = cloneNode(note, (noteChild, noteChildIndex) => {
    if (noteChild.uri !== note.uri || noteChild.name !== 'time-modification') {
      return cloneNode(noteChild);
    }
    observedCount += 1;
    if (observedCount > 1) {
      throw invalid('note must contain at most one time-modification element.', {
        ...context,
        observedCount,
      });
    }
    const location = { ...context, noteChildIndex };
    const marker = parseExactTripletTimeModification(noteChild, location);
    markers.push(Object.freeze({ ...marker, ...location }));
    return null;
  });
  return normalized;
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
    let sourceOrder = 0;
    checkpoint(runtime, 'polyphonic-triplet-time-modification-normalizer:measure', {
      measureIndex: currentMeasureIndex,
      measureNumber,
    });
    return cloneNode(measure, (measureChild) => {
      if (measureChild.uri === measure.uri && measureChild.name === 'note') {
        const currentSourceOrder = sourceOrder;
        sourceOrder += 1;
        return sanitizeNote(measureChild, {
          measureIndex: currentMeasureIndex,
          measureNumber,
          sourceOrder: currentSourceOrder,
        }, markers);
      }
      return cloneNode(measureChild);
    });
  });
}

function normalizePolyphonicTripletTimeModification(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-triplet-time-modification-normalizer:start');
  const staccato = normalizePolyphonicStaccatoNotation(parsedDocument, runtime);
  const markers = [];
  const root = staccato.parsedDocument.root;
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild.uri === root.uri && rootChild.name === 'part') {
      return sanitizePart(rootChild, markers, runtime);
    }
    return cloneNode(rootChild);
  });

  const frozenMarkers = Object.freeze(markers);
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...staccato.ignoredFeatures,
      ...(frozenMarkers.length > 0 ? ['note:triplet-time-modification-context'] : []),
    ]),
  ].sort());
  const normalizedDocument = Object.freeze({
    documentType: staccato.parsedDocument.documentType,
    contractVersion: staccato.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-triplet-time-modification-normalizer:complete', {
    tripletTimeModificationMarkerCount: frozenMarkers.length,
  });

  return Object.freeze({
    contractVersion: POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_VERSION,
    authority: POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_AUTHORITY,
    durationPolicy: POLYPHONIC_TRIPLET_DURATION_POLICY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    performanceTimingCaveats: staccato.performanceTimingCaveats,
    ignoredDirectionCount: staccato.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: staccato.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: staccato.octaveShiftMarkers,
    notationContextMarkers: staccato.notationContextMarkers,
    timeSignatureDisplayMarkers: staccato.timeSignatureDisplayMarkers,
    fermataMarkers: staccato.fermataMarkers,
    staccatoMarkers: staccato.staccatoMarkers,
    tripletTimeModificationMarkers: frozenMarkers,
  });
}

function projectParsedMusicXmlWithTripletTimeModificationCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicTripletTimeModification(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_VERSION,
    authority: POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_AUTHORITY,
    durationPolicy: POLYPHONIC_TRIPLET_DURATION_POLICY,
    sourceModel,
    ignoredFeatures: normalization.ignoredFeatures,
    performanceTimingCaveats: normalization.performanceTimingCaveats,
    ignoredDirectionCount: normalization.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: normalization.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: normalization.octaveShiftMarkers,
    notationContextMarkers: normalization.notationContextMarkers,
    timeSignatureDisplayMarkers: normalization.timeSignatureDisplayMarkers,
    fermataMarkers: normalization.fermataMarkers,
    staccatoMarkers: normalization.staccatoMarkers,
    tripletTimeModificationMarkers: normalization.tripletTimeModificationMarkers,
  });
}

module.exports = {
  POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_VERSION,
  POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_AUTHORITY,
  POLYPHONIC_TRIPLET_DURATION_POLICY,
  PolyphonicTripletTimeModificationNormalizerError,
  normalizePolyphonicTripletTimeModification,
  projectParsedMusicXmlWithTripletTimeModificationCompatibility,
};
