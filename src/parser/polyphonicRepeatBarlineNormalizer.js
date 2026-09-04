'use strict';

const { EngineError } = require('../errors/engineError');

const POLYPHONIC_REPEAT_BARLINE_NORMALIZER_VERSION = '1.0.0';
const POLYPHONIC_REPEAT_BARLINE_AUTHORITY =
  'EXACT_REPEAT_PLAYBACK_ORDER_WITH_SOURCE_IDENTITY_PRESERVATION';
const DEFAULT_REPEAT_PLAY_COUNT = 2;
const MAX_REPEAT_PLAY_COUNT = 8;
const MAX_PLAYBACK_MEASURE_OCCURRENCES = 10000;
const SAFE_BARLINE_STYLES = new Set([
  'regular',
  'dotted',
  'dashed',
  'heavy',
  'light-light',
  'light-heavy',
  'heavy-light',
  'heavy-heavy',
  'tick',
  'short',
  'none',
]);

class PolyphonicRepeatBarlineNormalizerError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_REPEAT_BARLINE', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicRepeatBarlineNormalizerError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicRepeatBarlineNormalizerError(
    message,
    'INVALID_POLYPHONIC_REPEAT_BARLINE',
    details,
  );
}

function unsupported(message, details = {}) {
  return new PolyphonicRepeatBarlineNormalizerError(
    message,
    'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE',
    {
      feature: 'barline-repeat',
      reviewDisposition: 'REVIEW_REQUIRED',
      ...details,
    },
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime === null || runtime === undefined) return;
  if (typeof runtime !== 'object' || typeof runtime.checkpoint !== 'function') {
    throw invalid('runtime must expose a ProcessingRuntime checkpoint function.', { field: 'runtime' });
  }
  runtime.checkpoint(phase, details);
}

function directChildren(node, name = null) {
  return node.children.filter((child) => (
    child.uri === node.uri && (name === null || child.name === name)
  ));
}

function getUniqueAttribute(node, name) {
  const matches = node.attributes.filter((attribute) => (
    attribute.uri.length === 0 && attribute.name === name
  ));
  return matches.length === 1 ? matches[0].value : undefined;
}

function hasExactUnqualifiedAttributes(node, allowedNames, requiredNames = []) {
  const seen = new Set();
  for (const attribute of node.attributes) {
    if (attribute.uri.length !== 0 || !allowedNames.has(attribute.name) || seen.has(attribute.name)) {
      return false;
    }
    seen.add(attribute.name);
  }
  return requiredNames.every((name) => seen.has(name));
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

function measureNumber(measure, measureIndex) {
  const matches = measure.attributes.filter((attribute) => (
    attribute.uri.length === 0 && attribute.name === 'number'
  ));
  return matches.length === 1 ? matches[0].value : String(measureIndex + 1);
}

function parseBarStyle(node, location) {
  if (
    node.text.trim().length === 0
    || node.children.length !== 0
    || node.attributes.length !== 0
    || !SAFE_BARLINE_STYLES.has(node.text.trim())
  ) {
    throw unsupported('Repeat barline contains an unsupported bar-style shape.', {
      ...location,
      reason: 'UNSUPPORTED_BAR_STYLE',
    });
  }
  return node.text.trim();
}

function parseRepeat(node, location) {
  if (
    node.text.trim().length !== 0
    || node.children.length !== 0
    || !hasExactUnqualifiedAttributes(node, new Set(['direction', 'times']), ['direction'])
  ) {
    throw unsupported('Repeat element must use the bounded direction/times attribute shape.', {
      ...location,
      reason: 'UNSUPPORTED_REPEAT_SHAPE',
    });
  }

  const direction = getUniqueAttribute(node, 'direction');
  if (direction !== 'forward' && direction !== 'backward') {
    throw unsupported('Repeat direction must be forward or backward.', {
      ...location,
      reason: 'UNSUPPORTED_REPEAT_DIRECTION',
      direction,
    });
  }

  const rawTimes = getUniqueAttribute(node, 'times');
  if (direction === 'forward' && rawTimes !== undefined) {
    throw unsupported('Repeat times is supported only on backward repeats.', {
      ...location,
      reason: 'FORWARD_REPEAT_TIMES_UNSUPPORTED',
      times: rawTimes,
    });
  }

  let times = null;
  let playCount = direction === 'backward' ? DEFAULT_REPEAT_PLAY_COUNT : null;
  if (rawTimes !== undefined) {
    if (!/^[1-9]\d*$/.test(rawTimes)) {
      throw unsupported('Repeat times must be a positive integer in the bounded V1 profile.', {
        ...location,
        reason: 'INVALID_REPEAT_TIMES',
        times: rawTimes,
      });
    }
    times = Number(rawTimes);
    if (
      !Number.isSafeInteger(times)
      || times < 2
      || times > MAX_REPEAT_PLAY_COUNT
    ) {
      throw unsupported('Repeat times exceeds the bounded V1 playback contract.', {
        ...location,
        reason: 'REPEAT_TIMES_OUT_OF_RANGE',
        times: rawTimes,
        minimum: 2,
        maximum: MAX_REPEAT_PLAY_COUNT,
      });
    }
    playCount = times;
  }

  return Object.freeze({ direction, times, playCount });
}

function parseRepeatBarline(node, location) {
  if (
    node.text.trim().length !== 0
    || !hasExactUnqualifiedAttributes(node, new Set(['location']))
    || node.children.some((child) => child.uri !== node.uri)
  ) {
    throw unsupported('Repeat barline contains unsupported text, attributes, or extension children.', {
      ...location,
      reason: 'UNSUPPORTED_BARLINE_SHAPE',
    });
  }

  const children = directChildren(node);
  const barStyles = directChildren(node, 'bar-style');
  const repeats = directChildren(node, 'repeat');
  if (repeats.length === 0) return null;
  if (
    repeats.length !== 1
    || barStyles.length > 1
    || children.some((child) => child.name !== 'bar-style' && child.name !== 'repeat')
  ) {
    throw unsupported('Repeat barline must contain one repeat and at most one bar-style.', {
      ...location,
      reason: 'UNSUPPORTED_BARLINE_CHILDREN',
    });
  }

  const expectedNames = barStyles.length === 1 ? ['bar-style', 'repeat'] : ['repeat'];
  if (
    children.length !== expectedNames.length
    || children.some((child, index) => child.name !== expectedNames[index])
  ) {
    throw unsupported('Repeat barline child order is outside the exact V1 contract.', {
      ...location,
      reason: 'UNSUPPORTED_BARLINE_CHILD_ORDER',
    });
  }

  const repeat = parseRepeat(repeats[0], location);
  const barStyle = barStyles.length === 1 ? parseBarStyle(barStyles[0], location) : null;
  const locationValue = getUniqueAttribute(node, 'location');
  if (
    (repeat.direction === 'forward' && locationValue !== 'left')
    || (repeat.direction === 'backward' && locationValue !== 'right')
  ) {
    throw unsupported('Repeat direction must use its exact left/right measure-boundary location.', {
      ...location,
      reason: 'REPEAT_LOCATION_MISMATCH',
      direction: repeat.direction,
      location: locationValue ?? null,
    });
  }

  return Object.freeze({
    location: locationValue,
    direction: repeat.direction,
    barStyle,
    times: repeat.times,
    playCount: repeat.playCount,
  });
}

function sanitizeRepeatBarline(node, parsed) {
  if (parsed.barStyle === null) return null;
  return {
    name: node.name,
    uri: node.uri,
    attributes: cloneAttributes(node.attributes),
    text: node.text,
    children: node.children
      .filter((child) => child.uri !== node.uri || child.name !== 'repeat')
      .map((child) => cloneNode(child)),
  };
}

function pushOccurrence(plan, sourceMeasureIndex, repeatPass) {
  if (plan.length >= MAX_PLAYBACK_MEASURE_OCCURRENCES) {
    throw unsupported('Repeat expansion exceeds the fixed playback occurrence ceiling.', {
      reason: 'REPEAT_OCCURRENCE_LIMIT_EXCEEDED',
      maximumOccurrenceCount: MAX_PLAYBACK_MEASURE_OCCURRENCES,
    });
  }
  plan.push(Object.freeze({
    occurrenceIndex: plan.length,
    sourceMeasureIndex,
    repeatPass,
  }));
}

function buildMeasureOccurrencePlan(measureCount, regions) {
  const plan = [];
  let cursor = 0;
  for (const region of regions) {
    while (cursor < region.startMeasureIndex) {
      pushOccurrence(plan, cursor, 0);
      cursor += 1;
    }
    for (let pass = 1; pass <= region.playCount; pass += 1) {
      for (
        let sourceMeasureIndex = region.startMeasureIndex;
        sourceMeasureIndex <= region.endMeasureIndex;
        sourceMeasureIndex += 1
      ) {
        pushOccurrence(plan, sourceMeasureIndex, pass);
      }
    }
    cursor = region.endMeasureIndex + 1;
  }
  while (cursor < measureCount) {
    pushOccurrence(plan, cursor, 0);
    cursor += 1;
  }
  return Object.freeze(plan);
}

function normalizeSelectedPart(part, runtime) {
  const measures = directChildren(part, 'measure');
  const repeatBarlines = [];
  const regions = [];
  let openRepeatStart = null;

  const normalizedPart = cloneNode(part, (measure, childIndex) => {
    if (measure.uri !== part.uri || measure.name !== 'measure') return cloneNode(measure);
    const measureIndex = measures.indexOf(measure);
    const number = measureNumber(measure, measureIndex);
    checkpoint(runtime, 'polyphonic-repeat-barline-normalizer:measure', {
      measureIndex,
      measureNumber: number,
    });

    let repeatMarkerCount = 0;
    return cloneNode(measure, (measureChild, measureChildIndex) => {
      if (measureChild.uri !== measure.uri || measureChild.name !== 'barline') {
        return cloneNode(measureChild);
      }
      const location = {
        measureIndex,
        measureNumber: number,
        measureChildIndex,
      };
      const parsed = parseRepeatBarline(measureChild, location);
      if (parsed === null) return cloneNode(measureChild);

      repeatMarkerCount += 1;
      if (repeatMarkerCount > 1) {
        throw unsupported('Multiple repeat markers in one measure are outside the bounded V1 contract.', {
          ...location,
          reason: 'MULTIPLE_REPEAT_MARKERS_PER_MEASURE',
        });
      }

      const marker = Object.freeze({
        measureIndex,
        measureNumber: number,
        location: parsed.location,
        direction: parsed.direction,
        barStyle: parsed.barStyle,
        times: parsed.times,
        playCount: parsed.playCount,
      });
      repeatBarlines.push(marker);

      if (parsed.direction === 'forward') {
        if (openRepeatStart !== null) {
          throw unsupported('Nested or crossing forward repeats are outside the bounded V1 contract.', {
            ...location,
            reason: 'NESTED_REPEAT_UNSUPPORTED',
            openRepeatStartMeasureIndex: openRepeatStart,
          });
        }
        openRepeatStart = measureIndex;
      } else {
        if (openRepeatStart === null) {
          throw unsupported('Backward repeat has no unambiguous forward-repeat boundary.', {
            ...location,
            reason: 'ORPHAN_BACKWARD_REPEAT',
          });
        }
        if (measureIndex < openRepeatStart) {
          throw invalid('Repeat region ordering became internally inconsistent.', location);
        }
        regions.push(Object.freeze({
          startMeasureIndex: openRepeatStart,
          endMeasureIndex: measureIndex,
          playCount: parsed.playCount,
        }));
        openRepeatStart = null;
      }

      return sanitizeRepeatBarline(measureChild, parsed);
    });
  });

  if (openRepeatStart !== null) {
    throw unsupported('Forward repeat is not closed by a bounded backward repeat.', {
      measureIndex: openRepeatStart,
      measureNumber: measureNumber(measures[openRepeatStart], openRepeatStart),
      reason: 'UNCLOSED_FORWARD_REPEAT',
    });
  }

  return Object.freeze({
    parsedPart: normalizedPart,
    measureCount: measures.length,
    repeatBarlines: Object.freeze(repeatBarlines),
    repeatRegions: Object.freeze(regions),
    measureOccurrencePlan: buildMeasureOccurrencePlan(measures.length, regions),
  });
}

function normalizePolyphonicRepeatBarlines(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-repeat-barline-normalizer:start');
  if (!parsedDocument || typeof parsedDocument !== 'object' || !parsedDocument.root) {
    throw invalid('parsedDocument must contain a parsed MusicXML root.', { field: 'parsedDocument' });
  }

  const root = parsedDocument.root;
  const parts = directChildren(root, 'part');
  if (parts.length !== 1) {
    const cloned = deepFreezeNode(cloneNode(root));
    return Object.freeze({
      contractVersion: POLYPHONIC_REPEAT_BARLINE_NORMALIZER_VERSION,
      authority: POLYPHONIC_REPEAT_BARLINE_AUTHORITY,
      parsedDocument: Object.freeze({
        documentType: parsedDocument.documentType,
        contractVersion: parsedDocument.contractVersion,
        root: cloned,
      }),
      ignoredFeatures: Object.freeze([]),
      repeatBarlines: Object.freeze([]),
      repeatRegions: Object.freeze([]),
      measureOccurrencePlan: Object.freeze([]),
    });
  }

  let partNormalization = null;
  const normalizedRoot = cloneNode(root, (rootChild) => {
    if (rootChild === parts[0]) {
      partNormalization = normalizeSelectedPart(rootChild, runtime);
      return partNormalization.parsedPart;
    }
    return cloneNode(rootChild);
  });
  const ignoredFeatures = Object.freeze(
    partNormalization.repeatBarlines.length > 0
      ? ['measure:barline:repeat-playback-order']
      : [],
  );
  const normalizedDocument = Object.freeze({
    documentType: parsedDocument.documentType,
    contractVersion: parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-repeat-barline-normalizer:complete', {
    repeatBarlineCount: partNormalization.repeatBarlines.length,
    repeatRegionCount: partNormalization.repeatRegions.length,
    playbackOccurrenceCount: partNormalization.measureOccurrencePlan.length,
  });

  return Object.freeze({
    contractVersion: POLYPHONIC_REPEAT_BARLINE_NORMALIZER_VERSION,
    authority: POLYPHONIC_REPEAT_BARLINE_AUTHORITY,
    parsedDocument: normalizedDocument,
    ignoredFeatures,
    repeatBarlines: partNormalization.repeatBarlines,
    repeatRegions: partNormalization.repeatRegions,
    measureOccurrencePlan: partNormalization.measureOccurrencePlan,
  });
}

module.exports = {
  POLYPHONIC_REPEAT_BARLINE_NORMALIZER_VERSION,
  POLYPHONIC_REPEAT_BARLINE_AUTHORITY,
  DEFAULT_REPEAT_PLAY_COUNT,
  MAX_REPEAT_PLAY_COUNT,
  MAX_PLAYBACK_MEASURE_OCCURRENCES,
  PolyphonicRepeatBarlineNormalizerError,
  normalizePolyphonicRepeatBarlines,
};
