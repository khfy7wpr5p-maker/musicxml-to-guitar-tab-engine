'use strict';

const { types: { isProxy } } = require('node:util');
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
  if (!value || typeof value !== 'object' || isProxy(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataPropertySnapshot(value, path) {
  if (!isPlainObject(value)) return null;
  const snapshot = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw invalid(`${path} must not contain symbol keys.`, { field: path });
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${path} fields must be enumerable data properties.`, {
        field: path,
        property: key,
      });
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
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
    !value
    || typeof value !== 'object'
    || isProxy(value)
    || !Array.isArray(value)
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

function isXml10String(value) {
  return typeof value === 'string' && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
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

function normalizeEndingBarlines(value, canonicalTabResult) {
  const input = boundedNativeArray(value, 'notationContext.endingBarlines', 4000);
  return Object.freeze(input.map((entry, index) => {
    const path = `notationContext.endingBarlines[${index}]`;
    const descriptors = exactDataObject(
      entry,
      ['measureIndex', 'measureNumber', 'location', 'number', 'type', 'defaultY', 'barStyle'],
      path,
    );
    const normalized = Object.fromEntries(Object.entries(descriptors).map(([key, value]) => [key, value.value]));
    if (
      !Number.isInteger(normalized.measureIndex)
      || canonicalTabResult.measures[normalized.measureIndex]?.number !== normalized.measureNumber
      || !['left', 'right'].includes(normalized.location)
      || !['1', '2'].includes(normalized.number)
      || !['start', 'stop', 'discontinue'].includes(normalized.type)
      || (normalized.defaultY !== null && (
        typeof normalized.defaultY !== 'string'
        || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized.defaultY)
        || Math.abs(Number(normalized.defaultY)) > 10000
      ))
      || (normalized.barStyle !== null && !SAFE_BARLINE_STYLES.has(normalized.barStyle))
    ) throw invalid('Ending metadata is inconsistent with the canonical source measures.', { field: path });
    return Object.freeze(normalized);
  }));
}

function normalizeAttributes(value, path, allowedNames) {
  const input = boundedNativeArray(value, path, allowedNames.size);
  const seen = new Set();
  return Object.freeze(input.map((attribute, index) => {
    const descriptors = exactDataObject(attribute, ['name', 'value'], `${path}[${index}]`);
    const name = descriptors.name.value;
    const attributeValue = descriptors.value.value;
    if (!allowedNames.has(name) || seen.has(name) || !isXml10String(attributeValue)) {
      throw invalid(`${path} contains an invalid attribute.`, { field: `${path}[${index}]` });
    }
    seen.add(name);
    return Object.freeze({ name, value: attributeValue });
  }));
}

function normalizeTempoDirections(value, canonicalTabResult) {
  const input = boundedNativeArray(value, 'notationContext.tempoDirections', 4000);
  return Object.freeze(input.map((entry, index) => {
    const path = `notationContext.tempoDirections[${index}]`;
    const descriptors = exactDataObject(
      entry,
      ['measureIndex', 'measureNumber', 'placement', 'staff', 'words', 'metronome', 'soundTempo'],
      path,
    );
    const measureIndex = descriptors.measureIndex.value;
    const measureNumber = descriptors.measureNumber.value;
    const placement = descriptors.placement.value;
    const staff = descriptors.staff.value;
    const soundTempo = descriptors.soundTempo.value;
    if (
      !Number.isInteger(measureIndex)
      || canonicalTabResult.measures[measureIndex]?.number !== measureNumber
      || (placement !== null && !['above', 'below'].includes(placement))
      || (staff !== null && (!Number.isInteger(staff) || staff < 1 || staff > 2))
      || typeof soundTempo !== 'string'
      || !/^(?:\d+|\d+\.\d+)$/.test(soundTempo)
      || Number(soundTempo) <= 0
      || Number(soundTempo) > 1000
    ) throw invalid('Tempo direction metadata is inconsistent with the canonical source measures.', { field: path });

    const wordsDescriptors = exactDataObject(descriptors.words.value, ['text', 'attributes'], `${path}.words`);
    const wordsText = wordsDescriptors.text.value;
    if (!isXml10String(wordsText) || wordsText.length === 0 || wordsText.length > 256) {
      throw invalid('Tempo words text is invalid.', { field: `${path}.words.text` });
    }
    const wordsAttributes = normalizeAttributes(
      wordsDescriptors.attributes.value,
      `${path}.words.attributes`,
      new Set(['default-x', 'default-y', 'relative-x', 'relative-y', 'font-family', 'font-style', 'font-size', 'font-weight', 'color', 'halign', 'valign', 'enclosure']),
    );

    let metronome = null;
    if (descriptors.metronome.value !== null) {
      const metronomeDescriptors = exactDataObject(
        descriptors.metronome.value,
        ['beatUnit', 'perMinute', 'attributes'],
        `${path}.metronome`,
      );
      const beatUnit = metronomeDescriptors.beatUnit.value;
      const perMinute = metronomeDescriptors.perMinute.value;
      if (!['whole', 'half', 'quarter', 'eighth', '16th', '32nd'].includes(beatUnit)
        || typeof perMinute !== 'string' || !/^(?:\d+|\d+\.\d+)$/.test(perMinute)
        || Number(perMinute) <= 0 || Number(perMinute) > 1000) {
        throw invalid('Tempo metronome metadata is invalid.', { field: `${path}.metronome` });
      }
      metronome = Object.freeze({
        beatUnit,
        perMinute,
        attributes: normalizeAttributes(
          metronomeDescriptors.attributes.value,
          `${path}.metronome.attributes`,
          new Set(['parentheses', 'default-y']),
        ),
      });
    }
    return Object.freeze({
      measureIndex, measureNumber, placement, staff, soundTempo,
      words: Object.freeze({ text: wordsText, attributes: wordsAttributes }),
      metronome,
    });
  }));
}

function splitRepeatNotationContext(options, canonicalTabResult) {
  if (options && typeof options === 'object' && isProxy(options)) {
    throw invalid('options must not be a Proxy.', { field: 'options' });
  }
  const optionsSnapshot = dataPropertySnapshot(options, 'options');
  if (optionsSnapshot === null) {
    return Object.freeze({
      baseOptions: options,
      measureOccurrencePlan: null,
      repeatBarlines: Object.freeze([]),
      endingBarlines: Object.freeze([]),
      tempoDirections: Object.freeze([]),
    });
  }
  const notationContext = Object.hasOwn(optionsSnapshot, 'notationContext')
    ? optionsSnapshot.notationContext
    : null;
  if (!notationContext) {
    return Object.freeze({
      baseOptions: options,
      measureOccurrencePlan: null,
      repeatBarlines: Object.freeze([]),
      endingBarlines: Object.freeze([]),
      tempoDirections: Object.freeze([]),
    });
  }
  if (typeof notationContext === 'object' && notationContext !== null && isProxy(notationContext)) {
    throw invalid('options.notationContext must not be a Proxy.', { field: 'notationContext' });
  }
  const notationSnapshot = dataPropertySnapshot(notationContext, 'options.notationContext');
  if (notationSnapshot === null) {
    throw invalid('options.notationContext must be a non-proxy plain object.', { field: 'notationContext' });
  }
  const hasOccurrencePlan = Object.hasOwn(notationSnapshot, 'measureOccurrencePlan');
  const hasRepeatBarlines = Object.hasOwn(notationSnapshot, 'repeatBarlines');
  const hasEndingBarlines = Object.hasOwn(notationSnapshot, 'endingBarlines');
  const hasTempoDirections = Object.hasOwn(notationSnapshot, 'tempoDirections');
  if (!hasOccurrencePlan && !hasRepeatBarlines && !hasEndingBarlines && !hasTempoDirections) {
    return Object.freeze({
      baseOptions: options,
      measureOccurrencePlan: null,
      repeatBarlines: Object.freeze([]),
      endingBarlines: Object.freeze([]),
      tempoDirections: Object.freeze([]),
    });
  }
  const allowed = new Set(['keySignatures', 'measureOccurrencePlan', 'repeatBarlines', 'endingBarlines', 'tempoDirections']);
  if (Reflect.ownKeys(notationSnapshot).some((key) => !allowed.has(key))) {
    throw invalid('options.notationContext contains an unknown repeat-context field.', {
      field: 'notationContext',
    });
  }
  if ((hasOccurrencePlan || hasRepeatBarlines) && (
    !Object.hasOwn(notationSnapshot, 'keySignatures')
    || !hasOccurrencePlan
    || !hasRepeatBarlines
  )) {
    throw invalid('Repeat-aware notationContext requires keySignatures, measureOccurrencePlan, and repeatBarlines.', {
      field: 'notationContext',
    });
  }

  const measureOccurrencePlan = hasOccurrencePlan
    ? normalizeOccurrencePlan(notationSnapshot.measureOccurrencePlan, canonicalTabResult)
    : null;
  const repeatBarlines = hasRepeatBarlines
    ? normalizeRepeatBarlines(notationSnapshot.repeatBarlines, canonicalTabResult)
    : Object.freeze([]);
  const endingBarlines = hasEndingBarlines
    ? normalizeEndingBarlines(notationSnapshot.endingBarlines, canonicalTabResult)
    : Object.freeze([]);
  const tempoDirections = hasTempoDirections
    ? normalizeTempoDirections(notationSnapshot.tempoDirections, canonicalTabResult)
    : Object.freeze([]);
  if (repeatBarlines.length > 0 && measureOccurrencePlan.length <= canonicalTabResult.measures.length) {
    throw invalid('Repeat barlines require a derived playback plan with repeated occurrences.', {
      field: 'notationContext.measureOccurrencePlan',
    });
  }

  const baseOptions = {
    ...optionsSnapshot,
    notationContext: { keySignatures: notationSnapshot.keySignatures },
  };
  return Object.freeze({
    baseOptions, measureOccurrencePlan, repeatBarlines, endingBarlines, tempoDirections,
  });
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function attributesXml(attributes) {
  return attributes.map(({ name, value }) => ` ${name}="${escapeXml(value)}"`).join('');
}

function tempoDirectionXml(record) {
  const placement = record.placement === null ? '' : ` placement="${record.placement}"`;
  const words = `<direction-type><words${attributesXml(record.words.attributes)}>${escapeXml(record.words.text)}</words></direction-type>`;
  const metronome = record.metronome === null ? ''
    : `<direction-type><metronome${attributesXml(record.metronome.attributes)}><beat-unit>${record.metronome.beatUnit}</beat-unit><per-minute>${record.metronome.perMinute}</per-minute></metronome></direction-type>`;
  const staff = record.staff === null ? '' : `<staff>${record.staff}</staff>`;
  return `<direction${placement}>${words}${metronome}${staff}<sound tempo="${record.soundTempo}"/></direction>`;
}

function barlineXml(record, ending = null) {
  const barStyleValue = record?.barStyle ?? ending?.barStyle ?? null;
  const barStyle = barStyleValue === null ? '' : `<bar-style>${barStyleValue}</bar-style>`;
  const endingXml = ending === null ? ''
    : `<ending number="${ending.number}" type="${ending.type}"${ending.defaultY === null ? '' : ` default-y="${ending.defaultY}"`}/>`;
  const times = record?.times == null ? '' : ` times="${record.times}"`;
  const repeat = record == null ? '' : `<repeat direction="${record.direction}"${times}/>`;
  return `<barline location="${record?.location ?? ending.location}">${barStyle}${endingXml}${repeat}</barline>`;
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

function injectIntoMeasure(measureXml, markers, endings) {
  if (markers.length === 0 && endings.length === 0) return measureXml;
  const forward = markers.find((marker) => marker.direction === 'forward') || null;
  const backward = markers.find((marker) => marker.direction === 'backward') || null;
  if (markers.length !== Number(Boolean(forward)) + Number(Boolean(backward))) {
    throw invalid('Writer received duplicate repeat markers for one source measure.');
  }
  const leftEnding = endings.find((ending) => ending.location === 'left') || null;
  const rightEnding = endings.find((ending) => ending.location === 'right') || null;
  if (endings.length !== Number(Boolean(leftEnding)) + Number(Boolean(rightEnding))) {
    throw invalid('Writer received duplicate ending markers for one source measure boundary.');
  }

  let result = measureXml;
  if (forward || leftEnding) {
    const attributesClose = result.indexOf('</attributes>');
    const insertion = attributesClose >= 0
      ? attributesClose + '</attributes>'.length
      : result.indexOf('>') + 1;
    if (insertion <= 0) throw invalid('Writer could not locate the forward-repeat insertion boundary.');
    result = `${result.slice(0, insertion)}${barlineXml(forward, leftEnding)}${result.slice(insertion)}`;
  }
  if (backward || rightEnding) {
    const close = result.lastIndexOf('</measure>');
    if (close < 0) throw invalid('Writer could not locate the backward-repeat insertion boundary.');
    result = `${result.slice(0, close)}${barlineXml(backward, rightEnding)}${result.slice(close)}`;
  }
  return result;
}

function injectRepeatBarlines(xml, canonicalTabResult, repeatBarlines, endingBarlines) {
  if (repeatBarlines.length === 0 && endingBarlines.length === 0) return xml;
  const blocks = measureBlocks(xml, canonicalTabResult.measures.length);
  const byMeasure = new Map();
  for (const marker of repeatBarlines) {
    const list = byMeasure.get(marker.measureIndex) || [];
    list.push(marker);
    byMeasure.set(marker.measureIndex, list);
  }
  const endingsByMeasure = new Map();
  for (const ending of endingBarlines) {
    const list = endingsByMeasure.get(ending.measureIndex) || [];
    list.push(ending);
    endingsByMeasure.set(ending.measureIndex, list);
  }

  let result = '';
  let cursor = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    result += xml.slice(cursor, block.start);
    result += injectIntoMeasure(
      block.xml,
      byMeasure.get(index) || [],
      endingsByMeasure.get(index) || [],
    );
    cursor = block.end;
  }
  result += xml.slice(cursor);
  return result;
}

function injectTempoDirections(xml, canonicalTabResult, tempoDirections) {
  if (tempoDirections.length === 0) return xml;
  const blocks = measureBlocks(xml, canonicalTabResult.measures.length);
  const byMeasure = new Map();
  for (const direction of tempoDirections) {
    const list = byMeasure.get(direction.measureIndex) || [];
    list.push(direction);
    byMeasure.set(direction.measureIndex, list);
  }
  let result = '';
  let cursor = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    let measureXml = block.xml;
    const directions = byMeasure.get(index) || [];
    if (directions.length > 0) {
      const attributesClose = measureXml.indexOf('</attributes>');
      const insertion = attributesClose >= 0
        ? attributesClose + '</attributes>'.length
        : measureXml.indexOf('>') + 1;
      measureXml = `${measureXml.slice(0, insertion)}${directions.map(tempoDirectionXml).join('')}${measureXml.slice(insertion)}`;
    }
    result += xml.slice(cursor, block.start) + measureXml;
    cursor = block.end;
  }
  return result + xml.slice(cursor);
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
  const repeatXml = injectRepeatBarlines(
    xml,
    canonicalTabResult,
    repeatContext.repeatBarlines,
    repeatContext.endingBarlines,
  );
  return injectTempoDirections(
    repeatXml,
    canonicalTabResult,
    repeatContext.tempoDirections,
  );
}

module.exports = {
  ...baseWriter,
  serializeCanonicalTabResultV2ToMusicXml,
};
