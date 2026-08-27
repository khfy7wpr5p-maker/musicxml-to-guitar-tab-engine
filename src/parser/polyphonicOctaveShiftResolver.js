'use strict';

const { EngineError } = require('../errors/engineError');
const {
  normalizePolyphonicPerformanceDirections,
} = require('./polyphonicPerformanceDirectionNormalizer');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_OCTAVE_SHIFT_RESOLVER_VERSION = '1.0.0';
const POLYPHONIC_OCTAVE_SHIFT_RESOLVER_AUTHORITY =
  'DISPLAY_OCTAVE_SHIFT_VALIDATION_NO_PITCH_REWRITE';
const MAX_SHIFT_NUMBER = 16;
const SUPPORTED_SHIFT_SIZES = new Set([8, 15, 22]);
const SAFE_DIRECTION_ATTRIBUTES = new Set(['placement']);
const SAFE_OCTAVE_SHIFT_ATTRIBUTES = new Set([
  'type',
  'number',
  'size',
  'color',
  'dash-length',
  'default-x',
  'default-y',
  'line-type',
  'relative-x',
  'relative-y',
  'space-length',
]);

class PolyphonicOctaveShiftResolverError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_OCTAVE_SHIFT', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicOctaveShiftResolverError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicOctaveShiftResolverError(message, 'INVALID_POLYPHONIC_OCTAVE_SHIFT', details);
}

function unsupported(message, details = {}) {
  return new PolyphonicOctaveShiftResolverError(
    message,
    'UNSUPPORTED_POLYPHONIC_OCTAVE_SHIFT',
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

function unqualifiedAttribute(node, name) {
  const matches = node.attributes.filter((attribute) => (
    attribute.uri.length === 0 && attribute.name === name
  ));
  if (matches.length > 1) throw invalid('Duplicate octave-shift attribute.', { attribute: name });
  return matches.length === 1 ? matches[0].value : undefined;
}

function hasOnlyAttributes(node, allowed) {
  return node.attributes.every((attribute) => (
    attribute.uri.length === 0 && allowed.has(attribute.name)
  ));
}

function positiveInteger(value, field, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw invalid(`${field} must be a positive integer.`, { field, value });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw invalid(`${field} is outside the supported positive integer range.`, {
      field,
      value,
      maximum,
    });
  }
  return parsed;
}

function scalarDuration(node, field, location) {
  if (!node || directChildren(node).length !== 0 || node.attributes.length !== 0) {
    throw invalid(`${field} must be a scalar leaf.`, { ...location, field });
  }
  return positiveInteger(node.text.trim(), field);
}

function parseStaff(directionNode, location) {
  const staffNodes = directChildren(directionNode, 'staff');
  if (staffNodes.length > 1) throw invalid('octave-shift direction staff must appear at most once.', location);
  if (staffNodes.length === 0) return 1;
  const staff = positiveInteger(staffNodes[0].text.trim(), 'staff', { maximum: 2 });
  if (directChildren(staffNodes[0]).length !== 0 || staffNodes[0].attributes.length !== 0) {
    throw invalid('octave-shift staff must be a scalar leaf.', location);
  }
  return staff;
}

function parseExactOctaveShiftDirection(directionNode, location) {
  if (!hasOnlyAttributes(directionNode, SAFE_DIRECTION_ATTRIBUTES)) return null;
  if (directionNode.children.some((child) => child.uri !== directionNode.uri)) return null;
  const children = directChildren(directionNode);
  if (children.some((child) => child.name !== 'direction-type' && child.name !== 'staff')) return null;

  const directionTypes = directChildren(directionNode, 'direction-type');
  if (directionTypes.length !== 1) return null;
  const directionType = directionTypes[0];
  if (directionType.attributes.length !== 0 || directionType.children.some((child) => child.uri !== directionType.uri)) {
    return null;
  }
  const typeChildren = directChildren(directionType);
  if (typeChildren.length !== 1 || typeChildren[0].name !== 'octave-shift') return null;

  const octaveShift = typeChildren[0];
  if (
    directChildren(octaveShift).length !== 0
    || octaveShift.text.trim().length !== 0
    || !hasOnlyAttributes(octaveShift, SAFE_OCTAVE_SHIFT_ATTRIBUTES)
  ) {
    throw unsupported('octave-shift contains an unsupported child, text value, or attribute.', location);
  }

  const type = unqualifiedAttribute(octaveShift, 'type');
  if (!['up', 'down', 'stop', 'continue'].includes(type)) {
    throw invalid('octave-shift type must be up, down, stop, or continue.', { ...location, type });
  }
  const numberText = unqualifiedAttribute(octaveShift, 'number');
  const number = numberText === undefined
    ? 1
    : positiveInteger(numberText, 'octave-shift.number', { maximum: MAX_SHIFT_NUMBER });
  const sizeText = unqualifiedAttribute(octaveShift, 'size');
  const size = sizeText === undefined ? null : positiveInteger(sizeText, 'octave-shift.size');
  if (size !== null && !SUPPORTED_SHIFT_SIZES.has(size)) {
    throw unsupported('octave-shift size is outside the supported 8/15/22 display set.', {
      ...location,
      size,
    });
  }

  return Object.freeze({
    type,
    number,
    size,
    staff: parseStaff(directionNode, location),
  });
}

function parseCursorDuration(operationNode, location) {
  const durations = directChildren(operationNode, 'duration');
  if (durations.length !== 1) {
    throw invalid(`${operationNode.name} must contain exactly one duration.`, location);
  }
  if (operationNode.attributes.length !== 0 || directChildren(operationNode).length !== 1) {
    throw invalid(`${operationNode.name} contains unsupported structure.`, location);
  }
  return scalarDuration(durations[0], `${operationNode.name}.duration`, location);
}

function noteTiming(noteNode, cursor, chordAnchorCursor, location) {
  const chord = directChildren(noteNode, 'chord');
  if (chord.length > 1) throw invalid('chord must appear at most once during octave-shift timing.', location);
  const isChord = chord.length === 1;
  const isGrace = directChildren(noteNode, 'grace').length > 0;
  if (isChord && chordAnchorCursor === null) {
    throw invalid('A chord note requires a prior non-chord timing anchor.', location);
  }
  const onset = isChord ? chordAnchorCursor : cursor;
  if (isGrace || isChord) return { onset, nextCursor: cursor, nextAnchor: isChord ? chordAnchorCursor : onset };

  const durations = directChildren(noteNode, 'duration');
  if (durations.length !== 1) throw invalid('Non-grace notes require one duration during octave-shift timing.', location);
  const duration = scalarDuration(durations[0], 'note.duration', location);
  if (cursor > Number.MAX_SAFE_INTEGER - duration) {
    throw invalid('octave-shift timing cursor exceeds the safe integer range.', location);
  }
  return { onset, nextCursor: cursor + duration, nextAnchor: onset };
}

function collectMarkers(root, runtime) {
  const markers = [];
  const parts = directChildren(root, 'part');
  if (parts.length !== 1) throw invalid('octave-shift resolver requires exactly one MusicXML part.');
  const measures = directChildren(parts[0], 'measure');
  let markerOrder = 0;

  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const measure = measures[measureIndex];
    const numberAttribute = measure.attributes.find((attribute) => (
      attribute.uri.length === 0 && attribute.name === 'number'
    ));
    const measureNumber = numberAttribute ? numberAttribute.value : String(measureIndex + 1);
    let cursor = 0;
    let chordAnchorCursor = null;
    checkpoint(runtime, 'polyphonic-octave-shift-resolver:measure', { measureIndex, measureNumber });

    for (let childIndex = 0; childIndex < measure.children.length; childIndex += 1) {
      const child = measure.children[childIndex];
      if (child.uri !== measure.uri) continue;
      const location = { measureIndex, measureNumber, childIndex, cursorDivisions: cursor };
      checkpoint(runtime, 'polyphonic-octave-shift-resolver:child', location);

      if (child.name === 'backup') {
        const duration = parseCursorDuration(child, location);
        if (duration > cursor) throw invalid('backup moves octave-shift timing before measure start.', location);
        cursor -= duration;
        chordAnchorCursor = null;
        continue;
      }
      if (child.name === 'forward') {
        const duration = parseCursorDuration(child, location);
        if (cursor > Number.MAX_SAFE_INTEGER - duration) {
          throw invalid('forward exceeds octave-shift timing safe integer range.', location);
        }
        cursor += duration;
        chordAnchorCursor = null;
        continue;
      }
      if (child.name === 'note') {
        const timing = noteTiming(child, cursor, chordAnchorCursor, location);
        cursor = timing.nextCursor;
        chordAnchorCursor = timing.nextAnchor;
        continue;
      }
      if (child.name !== 'direction') continue;

      const parsed = parseExactOctaveShiftDirection(child, location);
      if (parsed === null) continue;
      markers.push(Object.freeze({
        ...parsed,
        measureIndex,
        measureNumber,
        cursorDivisions: cursor,
        childIndex,
        markerOrder,
      }));
      markerOrder += 1;
    }
  }
  return markers;
}

function markerTypeRank(type) {
  if (type === 'stop') return 0;
  if (type === 'continue') return 1;
  return 2;
}

function displayOctaveMagnitude(size) {
  return (size - 1) / 7;
}

function validateMarkerChains(markers, runtime) {
  const ordered = [...markers].sort((a, b) => (
    a.measureIndex - b.measureIndex
    || a.cursorDivisions - b.cursorDivisions
    || a.staff - b.staff
    || a.number - b.number
    || markerTypeRank(a.type) - markerTypeRank(b.type)
    || a.markerOrder - b.markerOrder
  ));
  const active = new Map();
  const resolved = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const marker = ordered[index];
    checkpoint(runtime, 'polyphonic-octave-shift-resolver:marker', { index });
    const key = `${marker.staff}:${marker.number}`;
    const current = active.get(key);

    if (marker.type === 'up' || marker.type === 'down') {
      if (current) {
        throw invalid('octave-shift start overlaps an active shift with the same staff and number.', {
          staff: marker.staff,
          number: marker.number,
          measureIndex: marker.measureIndex,
          cursorDivisions: marker.cursorDivisions,
        });
      }
      const size = marker.size === null ? 8 : marker.size;
      const magnitude = displayOctaveMagnitude(size);
      const displayOctaveDelta = marker.type === 'up' ? magnitude : -magnitude;
      const state = Object.freeze({ direction: marker.type, size, displayOctaveDelta });
      active.set(key, state);
      resolved.push(Object.freeze({ ...marker, size, displayOctaveDelta }));
      continue;
    }

    if (!current) {
      throw invalid(`octave-shift ${marker.type} has no active start.`, {
        staff: marker.staff,
        number: marker.number,
        measureIndex: marker.measureIndex,
        cursorDivisions: marker.cursorDivisions,
      });
    }
    if (marker.size !== null && marker.size !== current.size) {
      throw invalid('octave-shift continuation/stop size does not match its active start.', {
        staff: marker.staff,
        number: marker.number,
        expectedSize: current.size,
        actualSize: marker.size,
      });
    }
    resolved.push(Object.freeze({
      ...marker,
      size: current.size,
      displayOctaveDelta: current.displayOctaveDelta,
    }));
    if (marker.type === 'stop') active.delete(key);
  }

  if (active.size !== 0) {
    throw invalid('octave-shift document ends with an unterminated active shift.', {
      activeKeys: Object.freeze([...active.keys()].sort()),
    });
  }
  return Object.freeze(resolved);
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

function removeResolvedDirections(root, markerKeys) {
  let measureIndex = 0;
  return cloneNode(root, (rootChild) => {
    if (rootChild.uri !== root.uri || rootChild.name !== 'part') return cloneNode(rootChild);
    return cloneNode(rootChild, (partChild) => {
      if (partChild.uri !== rootChild.uri || partChild.name !== 'measure') return cloneNode(partChild);
      const currentMeasureIndex = measureIndex;
      measureIndex += 1;
      return cloneNode(partChild, (measureChild, childIndex) => {
        if (
          measureChild.uri === partChild.uri
          && measureChild.name === 'direction'
          && markerKeys.has(`${currentMeasureIndex}:${childIndex}`)
        ) return null;
        return cloneNode(measureChild);
      });
    });
  });
}

function normalizePolyphonicOctaveShifts(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-octave-shift-resolver:start');
  const performance = normalizePolyphonicPerformanceDirections(parsedDocument, runtime);
  const markers = collectMarkers(performance.parsedDocument.root, runtime);
  const resolvedMarkers = validateMarkerChains(markers, runtime);
  const markerKeys = new Set(resolvedMarkers.map((marker) => `${marker.measureIndex}:${marker.childIndex}`));
  const normalizedRoot = removeResolvedDirections(performance.parsedDocument.root, markerKeys);
  const ignoredFeatures = Object.freeze([
    ...new Set([
      ...performance.ignoredFeatures,
      ...(resolvedMarkers.length > 0 ? ['direction:octave-shift-display'] : []),
    ]),
  ].sort());
  const normalizedDocument = Object.freeze({
    documentType: performance.parsedDocument.documentType,
    contractVersion: performance.parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-octave-shift-resolver:complete', {
    resolvedMarkerCount: resolvedMarkers.length,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_OCTAVE_SHIFT_RESOLVER_VERSION,
    authority: POLYPHONIC_OCTAVE_SHIFT_RESOLVER_AUTHORITY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    ignoredDirectionCount: performance.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: performance.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: resolvedMarkers,
  });
}

function projectParsedMusicXmlWithOctaveShiftCompatibility(parsedDocument, runtime = null) {
  const normalization = normalizePolyphonicOctaveShifts(parsedDocument, runtime);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    normalization.parsedDocument,
    runtime,
  );
  return Object.freeze({
    contractVersion: POLYPHONIC_OCTAVE_SHIFT_RESOLVER_VERSION,
    authority: POLYPHONIC_OCTAVE_SHIFT_RESOLVER_AUTHORITY,
    sourceModel,
    ignoredFeatures: normalization.ignoredFeatures,
    ignoredDirectionCount: normalization.ignoredDirectionCount,
    ignoredDirectionFeatureCounts: normalization.ignoredDirectionFeatureCounts,
    octaveShiftMarkers: normalization.octaveShiftMarkers,
  });
}

module.exports = {
  POLYPHONIC_OCTAVE_SHIFT_RESOLVER_VERSION,
  POLYPHONIC_OCTAVE_SHIFT_RESOLVER_AUTHORITY,
  PolyphonicOctaveShiftResolverError,
  normalizePolyphonicOctaveShifts,
  projectParsedMusicXmlWithOctaveShiftCompatibility,
};
