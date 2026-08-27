'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicFermataNotation,
} = require('./polyphonicFermataNotationNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_STACCATO_NOTATION_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_STACCATO_NOTATION_NORMALIZER_AUTHORITY =
  'STACCATO_NOTATION_PRESERVED_NOMINAL_SCORE_TIME';
const POLYPHONIC_STACCATO_TIMING_POLICY =
  'NO_INTERPRETIVE_RELEASE_SHORTENING_WITHOUT_EXPLICIT_NOTE_RELEASE';

class PolyphonicStaccatoNotationNormalizerError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_STACCATO_NOTATION', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicStaccatoNotationNormalizerError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicStaccatoNotationNormalizerError(
    message,
    'INVALID_POLYPHONIC_STACCATO_NOTATION',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicStaccatoNotationNormalizerError(
    message,
    'UNSUPPORTED_POLYPHONIC_STACCATO_NOTATION',
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

function parseExactStaccatoArticulations(articulations, location) {
  if (
    articulations.text.trim().length !== 0
    || articulations.attributes.length !== 0
    || articulations.children.some((child) => child.uri !== articulations.uri)
  ) {
    throw unsupported('articulations must use the exact attribute-free staccato-only shape.', location);
  }
  const children = articulations.children.filter((child) => child.uri === articulations.uri);
  if (children.length !== 1 || children[0].name !== 'staccato') {
    throw unsupported('Only a single staccato articulation is supported in this stage.', {
      ...location,
      observedChildren: children.map((child) => child.name),
    });
  }
  const staccato = children[0];
  if (
    staccato.text.trim().length !== 0
    || staccato.attributes.length !== 0
    || staccato.children.length !== 0
  ) {
    throw unsupported('staccato must be an empty attribute-free element in this stage.', location);
  }
  return Object.freeze({ kind: 'staccato' });
}

function sanitizeNotations(notations, context, markers) {
  return cloneNode(notations, (notationChild, notationChildIndex) => {
    if (notationChild.uri !== notations.uri || notationChild.name !== 'articulations') {
      return cloneNode(notationChild);
    }
    const location = {
      measureIndex: context.measureIndex,
      measureNumber: context.measureNumber,
      sourceOrder: context.sourceOrder,
      notationChildIndex,
    };
    const marker = parseExactStaccatoArticulations(notationChild, location);
    markers.push(Object.freeze({ ...marker, ...location }));
    return null;
  });
}

function sanitizeNote(note, context, markers) {
  return cloneNode(note, (noteChild) => {
    if (noteChild.uri === note.uri && noteChild.name === 'notations') {
      return sanitizeNotations(noteChild, context, markers);
    }
    return cloneNode(noteChild);
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
    let sourceOrder = 0;
    checkpoint(runtime, 'polyphonic-staccato-notation-normalizer:measure', {
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

function normalizePolyphonicStaccatoNotation(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-staccato-notation-normalizer:start');
  const fermata = normalizePolyphonicFermataNotation(parsedDocument, runtime);
  const markers = [];
  const root = fermata.parsedDocument.root;
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild.uri === root.uri && rootChild.name === 'part') {
      return sanitizePart(rootChild, markers, runtime);
    }
    return cloneNode(rootChild);
  });
  const frozenMarkers = Object.freeze(markers);
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...fermata.ignoredFeatures,
      ...(frozenMarkers.length > 0 ? ['notation:staccato-context'] : []),
    ]),
  ].sort());
  const performanceTimingCaveats = Object.freeze(
    frozenMarkers.length > 0
      ? ['STACCATO_HAS_NO_NUMERIC_RELEASE_SHORTENING_IN_THIS_SOURCE_STAGE']
      : [],
  );
  const normalizedDocument = Object.freeze({
    documentType: fermata.parsedDocument.documentType,
    contractVersion: fermata.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-staccato-notation-normalizer:complete', {
    staccatoMarkerCount: frozenMarkers.length,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_STACCATO_NOTATION_NORMALIZER_VERSION,
    authority: POLYPHONIC_STACCATO_NOTATION_NORMALIZER_AUTHORITY,
    timingPolicy: POLYPHONIC_STACCATO_TIMING_POLICY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    performanceTimingCaveats,
    ignoredDirectionCount: fermata.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: fermata.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: fermata.octaveShiftMarkers,
    notationContextMarkers: fermata.notationContextMarkers,
    timeSignatureDisplayMarkers: fermata.timeSignatureDisplayMarkers,
    fermataMarkers: fermata.fermataMarkers,
    staccatoMarkers: frozenMarkers,
  });
}

function projectParsedMusicXmlWithStaccatoCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicStaccatoNotation(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_STACCATO_NOTATION_NORMALIZER_VERSION,
    authority: POLYPHONIC_STACCATO_NOTATION_NORMALIZER_AUTHORITY,
    timingPolicy: POLYPHONIC_STACCATO_TIMING_POLICY,
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
  });
}

module.exports = {
  POLYPHONIC_STACCATO_NOTATION_NORMALIZER_VERSION,
  POLYPHONIC_STACCATO_NOTATION_NORMALIZER_AUTHORITY,
  POLYPHONIC_STACCATO_TIMING_POLICY,
  PolyphonicStaccatoNotationNormalizerError,
  normalizePolyphonicStaccatoNotation,
  projectParsedMusicXmlWithStaccatoCompatibility,
};
