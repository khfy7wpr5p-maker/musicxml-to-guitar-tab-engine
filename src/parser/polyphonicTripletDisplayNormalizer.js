'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicTripletTimeModification,
} = require('./polyphonicTripletTimeModificationNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_AUTHORITY =
  'TRIPLET_DISPLAY_PROVENANCE_ONLY';

class PolyphonicTripletDisplayNormalizerError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_TRIPLET_DISPLAY', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicTripletDisplayNormalizerError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicTripletDisplayNormalizerError(
    message,
    'INVALID_POLYPHONIC_TRIPLET_DISPLAY',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicTripletDisplayNormalizerError(
    message,
    'UNSUPPORTED_POLYPHONIC_TRIPLET_DISPLAY',
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

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function scalarLaneValue(note, name, fallback, location) {
  const matches = directChildren(note, name);
  if (matches.length === 0) return fallback;
  if (matches.length !== 1) {
    throw invalid(`${name} must appear at most once for bounded tuplet display validation.`, {
      ...location,
      field: name,
      observedCount: matches.length,
    });
  }
  const node = matches[0];
  if (node.attributes.length !== 0 || node.children.length !== 0 || node.text.trim().length === 0) {
    throw unsupported(`${name} must be a simple scalar when tuplet display is present.`, {
      ...location,
      field: name,
    });
  }
  return node.text.trim();
}

function parseExactTupletDisplay(node, location) {
  if (
    node.text.trim().length !== 0
    || node.children.length !== 0
    || node.attributes.some((attribute) => attribute.uri.length !== 0)
  ) {
    throw unsupported('tuplet display must be an empty element with only bounded unqualified attributes.', location);
  }
  const attributes = Object.fromEntries(node.attributes.map((attribute) => [attribute.name, attribute.value]));
  const names = Object.keys(attributes).sort();

  if (
    names.length === 2
    && names[0] === 'bracket'
    && names[1] === 'type'
    && attributes.type === 'start'
    && attributes.bracket === 'no'
  ) {
    return Object.freeze({ type: 'start', bracket: false });
  }
  if (names.length === 1 && names[0] === 'type' && attributes.type === 'stop') {
    return Object.freeze({ type: 'stop', bracket: null });
  }
  throw unsupported('Only exact triplet start bracket="no" and attribute-free stop display markers are supported.', {
    ...location,
    observedAttributes: attributes,
  });
}

function sanitizeNotations(notations, context, markers, laneState, tripletMarkerKeys) {
  let tupletCount = 0;
  return cloneNode(notations, (notationChild, notationChildIndex) => {
    if (notationChild.uri !== notations.uri || notationChild.name !== 'tuplet') {
      return cloneNode(notationChild);
    }
    tupletCount += 1;
    if (tupletCount > 1) {
      throw unsupported('At most one tuplet display marker per note is supported in this stage.', context);
    }

    const location = { ...context, notationChildIndex };
    const tripletKey = `${context.measureIndex}:${context.sourceOrder}`;
    if (!tripletMarkerKeys.has(tripletKey)) {
      throw invalid('Tuplet display must be backed by a validated 3:2 time-modification on the same note.', location);
    }

    const display = parseExactTupletDisplay(notationChild, location);
    const laneKey = `${context.voice}:${context.staff}`;
    const open = laneState.get(laneKey);
    if (display.type === 'start') {
      if (open) {
        throw invalid('Nested or overlapping tuplets in the same voice/staff lane are not supported.', {
          ...location,
          laneKey,
        });
      }
      laneState.set(laneKey, location);
    } else {
      if (!open) {
        throw invalid('Tuplet stop must match an earlier start in the same voice/staff lane.', {
          ...location,
          laneKey,
        });
      }
      laneState.delete(laneKey);
    }

    markers.push(Object.freeze({
      kind: 'triplet-display',
      type: display.type,
      bracket: display.bracket,
      voice: context.voice,
      staff: context.staff,
      ...location,
    }));
    return null;
  });
}

function sanitizeNote(note, context, markers, laneState, tripletMarkerKeys) {
  const voice = scalarLaneValue(note, 'voice', '1', context);
  const staff = scalarLaneValue(note, 'staff', '1', context);
  return cloneNode(note, (noteChild) => {
    if (noteChild.uri === note.uri && noteChild.name === 'notations') {
      return sanitizeNotations(
        noteChild,
        { ...context, voice, staff },
        markers,
        laneState,
        tripletMarkerKeys,
      );
    }
    return cloneNode(noteChild);
  });
}

function sanitizePart(part, markers, runtime, tripletMarkerKeys) {
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
    const laneState = new Map();
    checkpoint(runtime, 'polyphonic-triplet-display-normalizer:measure', {
      measureIndex: currentMeasureIndex,
      measureNumber,
    });
    const normalizedMeasure = cloneNode(measure, (measureChild) => {
      if (measureChild.uri === measure.uri && measureChild.name === 'note') {
        const currentSourceOrder = sourceOrder;
        sourceOrder += 1;
        return sanitizeNote(
          measureChild,
          {
            measureIndex: currentMeasureIndex,
            measureNumber,
            sourceOrder: currentSourceOrder,
          },
          markers,
          laneState,
          tripletMarkerKeys,
        );
      }
      return cloneNode(measureChild);
    });
    if (laneState.size !== 0) {
      throw invalid('Tuplet display start may not cross a measure boundary in this stage.', {
        measureIndex: currentMeasureIndex,
        measureNumber,
        openLanes: [...laneState.keys()].sort(),
      });
    }
    return normalizedMeasure;
  });
}

function normalizePolyphonicTripletDisplay(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-triplet-display-normalizer:start');
  const triplet = normalizePolyphonicTripletTimeModification(parsedDocument, runtime);
  const tripletMarkerKeys = new Set(
    triplet.tripletTimeModificationMarkers.map(
      (marker) => `${marker.measureIndex}:${marker.sourceOrder}`,
    ),
  );
  const markers = [];
  const root = triplet.parsedDocument.root;
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild.uri === root.uri && rootChild.name === 'part') {
      return sanitizePart(rootChild, markers, runtime, tripletMarkerKeys);
    }
    return cloneNode(rootChild);
  });

  const frozenMarkers = Object.freeze(markers);
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...triplet.ignoredFeatures,
      ...(frozenMarkers.length > 0 ? ['notation:triplet-display-context'] : []),
    ]),
  ].sort());
  const normalizedDocument = Object.freeze({
    documentType: triplet.parsedDocument.documentType,
    contractVersion: triplet.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-triplet-display-normalizer:complete', {
    tripletDisplayMarkerCount: frozenMarkers.length,
  });

  return Object.freeze({
    contractVersion: POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_VERSION,
    authority: POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_AUTHORITY,
    durationPolicy: triplet.durationPolicy,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    performanceTimingCaveats: triplet.performanceTimingCaveats,
    ignoredDirectionCount: triplet.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: triplet.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: triplet.octaveShiftMarkers,
    notationContextMarkers: triplet.notationContextMarkers,
    timeSignatureDisplayMarkers: triplet.timeSignatureDisplayMarkers,
    fermataMarkers: triplet.fermataMarkers,
    staccatoMarkers: triplet.staccatoMarkers,
    tripletTimeModificationMarkers: triplet.tripletTimeModificationMarkers,
    tripletDisplayMarkers: frozenMarkers,
  });
}

function projectParsedMusicXmlWithTripletDisplayCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicTripletDisplay(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_VERSION,
    authority: POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_AUTHORITY,
    durationPolicy: normalization.durationPolicy,
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
    tripletDisplayMarkers: normalization.tripletDisplayMarkers,
  });
}

module.exports = {
  POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_VERSION,
  POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_AUTHORITY,
  PolyphonicTripletDisplayNormalizerError,
  normalizePolyphonicTripletDisplay,
  projectParsedMusicXmlWithTripletDisplayCompatibility,
};
