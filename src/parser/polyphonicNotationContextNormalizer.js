'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicOctaveShifts,
} = require('./polyphonicOctaveShiftResolver');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_AUTHORITY =
  'STANDARD_KEY_CLEF_CONTEXT_NO_PITCH_REWRITE';
const MIN_FIFTHS = -7;
const MAX_FIFTHS = 7;
const MAX_STAFF_NUMBER = 2;

class PolyphonicNotationContextNormalizerError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_NOTATION_CONTEXT', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicNotationContextNormalizerError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicNotationContextNormalizerError(
    message,
    'INVALID_POLYPHONIC_NOTATION_CONTEXT',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicNotationContextNormalizerError(
    message,
    'UNSUPPORTED_POLYPHONIC_NOTATION_CONTEXT',
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

function unqualifiedAttributes(node) {
  return node.attributes.filter((attribute) => attribute.uri.length === 0);
}

function attributeValue(node, name) {
  const matches = unqualifiedAttributes(node).filter((attribute) => attribute.name === name);
  if (matches.length > 1) {
    throw invalid('Notation context node contains a duplicate attribute.', {
      node: node.name,
      attribute: name,
    });
  }
  return matches.length === 1 ? matches[0].value : undefined;
}

function requireScalarLeaf(node, field, location) {
  if (
    directChildren(node).length !== 0
    || node.children.some((child) => child.uri !== node.uri)
    || node.attributes.length !== 0
  ) {
    throw unsupported(`${field} must be a scalar leaf without attributes or children.`, location);
  }
  return node.text.trim();
}

function parseInteger(text, field, location) {
  if (!/^-?\d+$/.test(text)) {
    throw invalid(`${field} must be an integer.`, { ...location, field, value: text });
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw invalid(`${field} must be a safe integer other than -0.`, {
      ...location,
      field,
      value: text,
    });
  }
  return value;
}

function parseStaffNumber(value, field, location) {
  if (value === undefined) return 1;
  if (!/^[12]$/.test(value)) {
    throw unsupported(`${field} must be staff 1 or 2 in the current notation-context subset.`, {
      ...location,
      field,
      value,
    });
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > MAX_STAFF_NUMBER) {
    throw unsupported(`${field} is outside the supported staff range.`, {
      ...location,
      field,
      value,
    });
  }
  return parsed;
}

function parseKeyNode(keyNode, location) {
  if (keyNode.text.trim().length !== 0 || keyNode.attributes.length !== 0) {
    throw unsupported('key must use the standard attribute-free fifths-only form.', location);
  }
  if (keyNode.children.some((child) => child.uri !== keyNode.uri)) {
    throw unsupported('key must not contain foreign-namespace children.', location);
  }
  const children = directChildren(keyNode);
  if (children.length !== 1 || children[0].name !== 'fifths') {
    throw unsupported('key must contain exactly one fifths child in this stage.', {
      ...location,
      observedChildren: children.map((child) => child.name),
    });
  }
  const fifths = parseInteger(
    requireScalarLeaf(children[0], 'key.fifths', location),
    'key.fifths',
    location,
  );
  if (fifths < MIN_FIFTHS || fifths > MAX_FIFTHS) {
    throw unsupported('key fifths is outside the standard -7 through +7 signature range.', {
      ...location,
      fifths,
    });
  }
  return Object.freeze({
    kind: 'key',
    fifths,
  });
}

function parseClefNode(clefNode, location) {
  if (clefNode.text.trim().length !== 0) {
    throw unsupported('clef must not contain direct text.', location);
  }
  if (clefNode.children.some((child) => child.uri !== clefNode.uri)) {
    throw unsupported('clef must not contain foreign-namespace children.', location);
  }
  const attributes = unqualifiedAttributes(clefNode);
  if (
    attributes.length !== clefNode.attributes.length
    || attributes.some((attribute) => attribute.name !== 'number')
  ) {
    throw unsupported('clef supports only the optional number attribute in this stage.', {
      ...location,
      observedAttributes: attributes.map((attribute) => attribute.name),
    });
  }
  const number = parseStaffNumber(attributeValue(clefNode, 'number'), 'clef.number', location);
  const children = directChildren(clefNode);
  if (children.length !== 2 || children[0].name !== 'sign' || children[1].name !== 'line') {
    throw unsupported('clef must contain exactly sign then line; transposing/custom clefs stay blocked.', {
      ...location,
      observedChildren: children.map((child) => child.name),
    });
  }
  const sign = requireScalarLeaf(children[0], 'clef.sign', location);
  const lineText = requireScalarLeaf(children[1], 'clef.line', location);
  const line = parseInteger(lineText, 'clef.line', location);
  const standard = (sign === 'G' && line === 2) || (sign === 'F' && line === 4);
  if (!standard) {
    throw unsupported('Only standard treble G/2 and bass F/4 clefs are supported in this stage.', {
      ...location,
      sign,
      line,
    });
  }
  return Object.freeze({
    kind: 'clef',
    number,
    sign,
    line,
  });
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

function sanitizeAttributesNode(attributesNode, context, markers) {
  let keyCount = 0;
  const clefNumbers = new Set();
  return cloneNode(attributesNode, (child, attributesChildIndex) => {
    if (child.uri !== attributesNode.uri) return cloneNode(child);
    const location = {
      measureIndex: context.measureIndex,
      measureNumber: context.measureNumber,
      measureChildIndex: context.measureChildIndex,
      attributesChildIndex,
    };
    if (child.name === 'key') {
      keyCount += 1;
      if (keyCount > 1) {
        throw unsupported('Multiple key elements in one attributes node are outside this stage.', location);
      }
      const parsed = parseKeyNode(child, location);
      markers.push(Object.freeze({ ...parsed, ...location }));
      return null;
    }
    if (child.name === 'clef') {
      const parsed = parseClefNode(child, location);
      if (clefNumbers.has(parsed.number)) {
        throw invalid('Duplicate clef staff number in one attributes node.', {
          ...location,
          number: parsed.number,
        });
      }
      clefNumbers.add(parsed.number);
      markers.push(Object.freeze({ ...parsed, ...location }));
      return null;
    }
    return cloneNode(child);
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
    checkpoint(runtime, 'polyphonic-notation-context-normalizer:measure', {
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

function normalizePolyphonicNotationContext(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-notation-context-normalizer:start');
  const octave = normalizePolyphonicOctaveShifts(parsedDocument, runtime);
  const markers = [];
  const root = octave.parsedDocument.root;
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild.uri === root.uri && rootChild.name === 'part') {
      return sanitizePart(rootChild, markers, runtime);
    }
    return cloneNode(rootChild);
  });
  const frozenMarkers = Object.freeze(markers);
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...octave.ignoredFeatures,
      ...(markers.some((marker) => marker.kind === 'key') ? ['attributes:key-signature-context'] : []),
      ...(markers.some((marker) => marker.kind === 'clef') ? ['attributes:clef-display-context'] : []),
    ]),
  ].sort());
  const normalizedDocument = Object.freeze({
    documentType: octave.parsedDocument.documentType,
    contractVersion: octave.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-notation-context-normalizer:complete', {
    notationContextMarkerCount: frozenMarkers.length,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_VERSION,
    authority: POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_AUTHORITY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    ignoredDirectionCount: octave.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: octave.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: octave.octaveShiftMarkers,
    notationContextMarkers: frozenMarkers,
  });
}

function projectParsedMusicXmlWithNotationContextCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicNotationContext(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_VERSION,
    authority: POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_AUTHORITY,
    sourceModel,
    ignoredFeatures: normalization.ignoredFeatures,
    ignoredDirectionCount: normalization.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: normalization.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: normalization.octaveShiftMarkers,
    notationContextMarkers: normalization.notationContextMarkers,
  });
}

module.exports = {
  POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_VERSION,
  POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_AUTHORITY,
  PolyphonicNotationContextNormalizerError,
  normalizePolyphonicNotationContext,
  projectParsedMusicXmlWithNotationContextCompatibility,
};
