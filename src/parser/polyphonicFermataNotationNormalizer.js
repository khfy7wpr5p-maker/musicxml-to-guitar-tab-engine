'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicTimeSignatureDisplay,
} = require('./polyphonicTimeSignatureDisplayNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_FERMATA_NOTATION_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_FERMATA_NOTATION_NORMALIZER_AUTHORITY =
  'NORMAL_FERMATA_NOTATION_NO_SCORE_TIME_REWRITE';
const MAX_LAYOUT_TENTHS = 1_000_000;
const SAFE_FERMATA_ATTRIBUTES = new Set(['type', 'default-y', 'relative-y']);

class PolyphonicFermataNotationNormalizerError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_FERMATA_NOTATION', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicFermataNotationNormalizerError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicFermataNotationNormalizerError(
    message,
    'INVALID_POLYPHONIC_FERMATA_NOTATION',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicFermataNotationNormalizerError(
    message,
    'UNSUPPORTED_POLYPHONIC_FERMATA_NOTATION',
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

function parseBoundedTenths(value, field, location) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
    throw unsupported(`${field} must be a finite decimal layout value.`, {
      ...location,
      field,
      value,
    });
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_LAYOUT_TENTHS) {
    throw unsupported(`${field} exceeds the bounded layout range.`, {
      ...location,
      field,
      value,
      maximumAbsoluteValue: MAX_LAYOUT_TENTHS,
    });
  }
  return parsed;
}

function parseFermata(fermata, location) {
  if (
    fermata.text.trim().length !== 0
    || directChildren(fermata).length !== 0
    || fermata.children.some((child) => child.uri !== fermata.uri)
  ) {
    throw unsupported('Only empty normal-shape fermata notation is supported in this stage.', location);
  }

  const seen = new Set();
  let type = 'upright';
  let defaultY = null;
  let relativeY = null;
  for (const attribute of fermata.attributes) {
    if (attribute.uri.length !== 0 || !SAFE_FERMATA_ATTRIBUTES.has(attribute.name)) {
      throw unsupported('Fermata contains an unsupported attribute.', {
        ...location,
        attribute: attribute.name,
      });
    }
    if (seen.has(attribute.name)) {
      throw invalid('Fermata attribute must not be duplicated.', {
        ...location,
        attribute: attribute.name,
      });
    }
    seen.add(attribute.name);
    if (attribute.name === 'type') {
      if (attribute.value !== 'upright' && attribute.value !== 'inverted') {
        throw unsupported('Fermata type must be upright or inverted.', {
          ...location,
          type: attribute.value,
        });
      }
      type = attribute.value;
    } else if (attribute.name === 'default-y') {
      defaultY = parseBoundedTenths(attribute.value, 'fermata.default-y', location);
    } else if (attribute.name === 'relative-y') {
      relativeY = parseBoundedTenths(attribute.value, 'fermata.relative-y', location);
    }
  }

  return Object.freeze({
    kind: 'fermata',
    shape: 'normal',
    type,
    defaultY,
    relativeY,
  });
}

function sanitizeNotations(notations, context, markers) {
  return cloneNode(notations, (notationChild, notationChildIndex) => {
    if (notationChild.uri !== notations.uri || notationChild.name !== 'fermata') {
      return cloneNode(notationChild);
    }
    const location = {
      measureIndex: context.measureIndex,
      measureNumber: context.measureNumber,
      sourceOrder: context.sourceOrder,
      notationChildIndex,
    };
    const marker = parseFermata(notationChild, location);
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
    checkpoint(runtime, 'polyphonic-fermata-notation-normalizer:measure', {
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

function normalizePolyphonicFermataNotation(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-fermata-notation-normalizer:start');
  const timeDisplay = normalizePolyphonicTimeSignatureDisplay(parsedDocument, runtime);
  const markers = [];
  const root = timeDisplay.parsedDocument.root;
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild.uri === root.uri && rootChild.name === 'part') {
      return sanitizePart(rootChild, markers, runtime);
    }
    return cloneNode(rootChild);
  });
  const frozenMarkers = Object.freeze(markers);
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...timeDisplay.ignoredFeatures,
      ...(frozenMarkers.length > 0 ? ['notation:fermata-normal-context'] : []),
    ]),
  ].sort());
  const normalizedDocument = Object.freeze({
    documentType: timeDisplay.parsedDocument.documentType,
    contractVersion: timeDisplay.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-fermata-notation-normalizer:complete', {
    fermataMarkerCount: frozenMarkers.length,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_FERMATA_NOTATION_NORMALIZER_VERSION,
    authority: POLYPHONIC_FERMATA_NOTATION_NORMALIZER_AUTHORITY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    ignoredDirectionCount: timeDisplay.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: timeDisplay.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: timeDisplay.octaveShiftMarkers,
    notationContextMarkers: timeDisplay.notationContextMarkers,
    timeSignatureDisplayMarkers: timeDisplay.timeSignatureDisplayMarkers,
    fermataMarkers: frozenMarkers,
  });
}

function projectParsedMusicXmlWithFermataCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicFermataNotation(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_FERMATA_NOTATION_NORMALIZER_VERSION,
    authority: POLYPHONIC_FERMATA_NOTATION_NORMALIZER_AUTHORITY,
    sourceModel,
    ignoredFeatures: normalization.ignoredFeatures,
    ignoredDirectionCount: normalization.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: normalization.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: normalization.octaveShiftMarkers,
    notationContextMarkers: normalization.notationContextMarkers,
    timeSignatureDisplayMarkers: normalization.timeSignatureDisplayMarkers,
    fermataMarkers: normalization.fermataMarkers,
  });
}

module.exports = {
  POLYPHONIC_FERMATA_NOTATION_NORMALIZER_VERSION,
  POLYPHONIC_FERMATA_NOTATION_NORMALIZER_AUTHORITY,
  PolyphonicFermataNotationNormalizerError,
  normalizePolyphonicFermataNotation,
  projectParsedMusicXmlWithFermataCompatibility,
};
