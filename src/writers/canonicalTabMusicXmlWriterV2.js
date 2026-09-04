'use strict';

const baseWriter = require('./canonicalTabMusicXmlWriterV2Base');
const {
  DEFAULT_REPEAT_PLAY_COUNT,
  MAX_REPEAT_PLAY_COUNT,
  MAX_PLAYBACK_MEASURE_OCCURRENCES,
} = require('../parser/polyphonicRepeatBarlineNormalizer');

const SAFE_BARLINE_STYLES = new Set([
  'regular', 'dotted', 'dashed', 'heavy', 'light-light', 'light-heavy',
  'heavy-light', 'heavy-heavy', 'tick', 'short', 'none',
]);

function invalid(message, details = {}) {
  return new baseWriter.CanonicalTabMusicXmlWriterV2Error(
    message,
    'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
    details,
  );
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactDataObject(value, fields, path) {
  if (!isPlainObject(value)) throw invalid(`${path} must be a plain object.`, { field: path });
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length
    || keys.some((key) => typeof key !== 'string' || !fields.includes(key))
    || fields.some((field) => (
      !Object.hasOwn(descriptors, field)
      || !descriptors[field].enumerable
      || !Object.hasOwn(descriptors[field], 'value')
    ))
  ) {
    throw invalid(`${path} must use the exact repeat-plan data shape.`, { field: path });
  }
  return descriptors;
}

function boundedNativeArray(value, path, maximumLength) {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximumLength
    || Reflect.ownKeys(value).some((key) => (
      key !== 'length'
      && (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
    ))
  ) {
    throw invalid(`${path} must be a bounded dense native array.`, { field: path });
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw invalid(`${path} must be dense.`, { field: path, index });
  }
  return value;
}

function normalizeOccurrencePlan(value, canonicalTabResult) {
  const sourceMeasureCount = canonicalTabResult.measures.length;
  const input = boundedNativeArray(
    value,
    'notationContext.measureOccurrencePlan',
    MAX_PLAYBACK_MEASURE_OCCURRENCES,
  );
  if (input.length < sourceMeasureCount) {
    throw invalid('Repeat occurrence plan may not drop source measures.', {
      field: 'notationContext.measureOccurrencePlan',
      sourceMeasureCount,
      occurrenceCount: input.length,
    });
  }
  const seenSourceMeasures = new Set();
  const normalized = input.map((entry, index) => {
    const descriptors = exactDataObject(
      entry,
      ['occurrenceIndex', 'sourceMeasureIndex', 'repeatPass'],
      `notationContext.measureOccurrencePlan[${index}]`,
    );
    const occurrenceIndex = descriptors.occurrenceIndex.value;
    const sourceMeasureIndex = descriptors.sourceMeasureIndex.value;
    const repeatPass = descriptors.repeatPass.value;
    if (
      occurrenceIndex !== index
      || !Number.isInteger(sourceMeasureIndex)
      || sourceMeasureIndex < 0
      || sourceMeasureIndex >= sourceMeasureCount
      || !Number.isInteger(repeatPass)
      || repeatPass < 0
      || repeatPass > MAX_REPEAT_PLAY_COUNT
    ) {
      throw invalid('Repeat occurrence plan contains an invalid occurrence.', {
        field: `notationContext.measureOccurrencePlan[${index}]`,
      });
    }
    seenSourceMeasures.add(sourceMeasureIndex);
    return Object.freeze({ occurrenceIndex, sourceMeasureIndex, repeatPass });
  });
  if (seenSourceMeasures.size !== sourceMeasureCount) {
    throw invalid('Repeat occurrence plan must retain every source measure identity.', {
      field: 'notationContext.measureOccurrencePlan',
      sourceMeasureCount,
      retainedSourceMeasureCount: seenSourceMeasures.size,
    });
  }
  return Object.freeze(normalized);
}

function normalizeRepeatBarlines(value, canonicalTabResult) {
  const input = boundedNativeArray(value, 'notationContext.repeatBarlines', 4000);
  let previousMeasureIndex = -1;
  return Object.freeze(input.map((entry, index) => {
    const descriptors = exactDataObject(
      entry,
      ['measureIndex', 'measureNumber', 'location', 'direction', 'barStyle', 'times', 'playCount'],
      `notationContext.repeatBarlines[${index}]`,
    );
    const measureIndex = descriptors.measureIndex.value;
    const measureNumber = descriptors.measureNumber.value;
    const location = descriptors.location.value;
    const direction = descriptors.direction.value;
    const barStyle = descriptors.barStyle.value;
    const times = descriptors.times.value;
    const playCount = descriptors.playCount.value;
    const sourceMeasure = canonicalTabResult.measures[measureIndex];
    if (
      !Number.isInteger(measureIndex)
      || measureIndex < 0
      || measureIndex >= canonicalTabResult.measures.length
      || measureIndex < previousMeasureIndex
      || !sourceMeasure
      || measureNumber !== sourceMeasure.number
      || !['left', 'right'].includes(location)
      || !['forward', 'backward'].includes(direction)
      || (barStyle !== null && !SAFE_BARLINE_STYLES.has(barStyle))
      || (direction === 'forward' && (location !== 'left' || times !== null || playCount !== null))
      || (direction === 'backward' && (
        location !== 'right'
        || !Number.isInteger(playCount)
        || playCount < DEFAULT_REPEAT_PLAY_COUNT
        || playCount > MAX_REPEAT_PLAY_COUNT
        || (times !== null && times !== playCount)
      ))
    ) {
      throw invalid('Repeat barline metadata is inconsistent with the canonical source measures.', {
        field: `notationContext.repeatBarlines[${index}]`,
      });
    }
    previousMeasureIndex = measureIndex;
    return Object.freeze({
      measureIndex,
      measureNumber,
      location,
      direction,
      barStyle,
      times,
      playCount,
    });
  }));
}

function splitRepeatNotationContext(options, canonicalTabResult) {
  const notationContext = options && options.notationContext;
  if (!notationContext || (
    !Object.hasOwn(notationContext, 'measureOccurrencePlan')
    && !Object.hasOwn(notationContext, 'repeatBarlines')
  )) {
    return Object.freeze({
      baseOptions: options,
      measureOccurrencePlan: null,
      repeatBarlines: Object.freeze([]),
    });
  }
  if (!isPlainObject(notationContext)) {
    throw invalid('options.notationContext must be a plain object.', { field: 'notationContext' });
  }
  const allowed = new Set(['keySignatures', 'measureOccurrencePlan', 'repeatBarlines']);
  if (Reflect.ownKeys(notationContext).some((key) => typeof key !== 'string' || !allowed.has(key))) {
    throw invalid('options.notationContext contains an unknown repeat-context field.', {
      field: 'notationContext',
    });
  }
  if (
    !Object.hasOwn(notationContext, 'keySignatures')
    || !Object.hasOwn(notationContext, 'measureOccurrencePlan')
    || !Object.hasOwn(notationContext, 'repeatBarlines')
  ) {
    throw invalid('Repeat-aware notationContext requires keySignatures, measureOccurrencePlan, and repeatBarlines.', {
      field: 'notationContext',
    });
  }

  const measureOccurrencePlan = normalizeOccurrencePlan(
    notationContext.measureOccurrencePlan,
    canonicalTabResult,
  );
  const repeatBarlines = normalizeRepeatBarlines(
    notationContext.repeatBarlines,
    canonicalTabResult,
  );
  if (repeatBarlines.length > 0 && measureOccurrencePlan.length <= canonicalTabResult.measures.length) {
    throw invalid('Repeat barlines require a derived playback plan with repeated occurrences.', {
      field: 'notationContext.measureOccurrencePlan',
    });
  }

  const baseOptions = {
    ...options,
    notationContext: { keySignatures: notationContext.keySignatures },
  };
  return Object.freeze({ baseOptions, measureOccurrencePlan, repeatBarlines });
}

function barlineXml(record) {
  const barStyle = record.barStyle === null ? '' : `<bar-style>${record.barStyle}</bar-style>`;
  const times = record.times === null ? '' : ` times="${record.times}"`;
  return `<barline location="${record.location}">${barStyle}<repeat direction="${record.direction}"${times}/></barline>`;
}

function measureBlocks(xml, expectedCount) {
  const partStart = xml.indexOf('<part id="P1">');
  const partEnd = partStart < 0 ? -1 : xml.indexOf('</part>', partStart);
  if (partStart < 0 || partEnd < 0) {
    throw invalid('Base canonical TAB writer output does not contain the expected P1 part.');
  }
  const blocks = [];
  let cursor = partStart;
  while (true) {
    const start = xml.indexOf('<measure ', cursor);
    if (start < 0 || start >= partEnd) break;
    const closeStart = xml.indexOf('</measure>', start);
    if (closeStart < 0 || closeStart >= partEnd) {
      throw invalid('Base canonical TAB writer output contains an unterminated measure.');
    }
    const end = closeStart + '</measure>'.length;
    blocks.push(Object.freeze({ start, end, xml: xml.slice(start, end) }));
    cursor = end;
  }
  if (blocks.length !== expectedCount) {
    throw invalid('Base canonical TAB writer measure count diverged from the canonical result.', {
      expectedCount,
      observedCount: blocks.length,
    });
  }
  return blocks;
}

function injectIntoMeasure(measureXml, markers) {
  if (markers.length === 0) return measureXml;
  const forward = markers.find((marker) => marker.direction === 'forward') || null;
  const backward = markers.find((marker) => marker.direction === 'backward') || null;
  if (markers.length !== Number(Boolean(forward)) + Number(Boolean(backward))) {
    throw invalid('Writer received duplicate repeat markers for one source measure.');
  }

  let result = measureXml;
  if (forward) {
    const attributesClose = result.indexOf('</attributes>');
    const insertion = attributesClose >= 0
      ? attributesClose + '</attributes>'.length
      : result.indexOf('>') + 1;
    if (insertion <= 0) throw invalid('Writer could not locate the forward-repeat insertion boundary.');
    result = `${result.slice(0, insertion)}${barlineXml(forward)}${result.slice(insertion)}`;
  }
  if (backward) {
    const close = result.lastIndexOf('</measure>');
    if (close < 0) throw invalid('Writer could not locate the backward-repeat insertion boundary.');
    result = `${result.slice(0, close)}${barlineXml(backward)}${result.slice(close)}`;
  }
  return result;
}

function injectRepeatBarlines(xml, canonicalTabResult, repeatBarlines) {
  if (repeatBarlines.length === 0) return xml;
  const blocks = measureBlocks(xml, canonicalTabResult.measures.length);
  const byMeasure = new Map();
  for (const marker of repeatBarlines) {
    const list = byMeasure.get(marker.measureIndex) || [];
    list.push(marker);
    byMeasure.set(marker.measureIndex, list);
  }

  let result = '';
  let cursor = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    result += xml.slice(cursor, block.start);
    result += injectIntoMeasure(block.xml, byMeasure.get(index) || []);
    cursor = block.end;
  }
  result += xml.slice(cursor);
  return result;
}

function serializeCanonicalTabResultV2ToMusicXml(canonicalTabResult, options = {}, runtime = null) {
  const repeatContext = splitRepeatNotationContext(options, canonicalTabResult);
  const xml = baseWriter.serializeCanonicalTabResultV2ToMusicXml(
    canonicalTabResult,
    repeatContext.baseOptions,
    runtime,
  );
  // The explicit occurrence plan is validated as the authoritative bounded
  // playback traversal. Output retains equivalent MusicXML repeat marks instead
  // of duplicating source measures, preserving source measure/event identity.
  return injectRepeatBarlines(xml, canonicalTabResult, repeatContext.repeatBarlines);
}

module.exports = {
  ...baseWriter,
  serializeCanonicalTabResultV2ToMusicXml,
};
