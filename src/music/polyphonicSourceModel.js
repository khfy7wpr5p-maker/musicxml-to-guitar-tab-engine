'use strict';

const { types } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { DEFAULT_PROCESSING_LIMITS } = require('../core/processingBudget');
const { isProcessingRuntime } = require('../core/processingRuntime');
const { pitchToMidi, PitchError } = require('./pitch');

const POLYPHONIC_SOURCE_MODEL_VERSION = '1.0.0';
const POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE = 'PolyphonicSourceModel';
const MAX_SOURCE_STRING_LENGTH = 256;
const MAX_VOICE_ID_LENGTH = 64;
const MAX_STAFF = 2;

class PolyphonicSourceModelError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_POLYPHONIC_SOURCE_MODEL',
      Object.freeze({ ...details }),
      'PolyphonicSourceModelError',
    );
  }
}

function invalid(message, details = {}) {
  return new PolyphonicSourceModelError(message, details);
}

function resolveOptionalProcessingRuntime(runtime) {
  if (runtime === null || runtime === undefined) {
    return null;
  }
  if (!isProcessingRuntime(runtime)) {
    throw invalid('runtime must be a ProcessingRuntime 1.0.0 value.', { field: 'runtime' });
  }
  return runtime;
}

function requireSafeInteger(value, field, details = {}) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    throw invalid(`${field} must be a safe integer other than -0.`, { ...details, field });
  }
  return value;
}

function requirePositiveInteger(value, field, details = {}) {
  requireSafeInteger(value, field, details);
  if (value <= 0) {
    throw invalid(`${field} must be positive.`, { ...details, field });
  }
  return value;
}

function requireNonNegativeInteger(value, field, details = {}) {
  requireSafeInteger(value, field, details);
  if (value < 0) {
    throw invalid(`${field} must not be negative.`, { ...details, field });
  }
  return value;
}

function requireBoolean(value, field, details = {}) {
  if (typeof value !== 'boolean') {
    throw invalid(`${field} must be boolean.`, { ...details, field });
  }
  return value;
}

function requireString(value, field, {
  allowEmpty = false,
  maximumLength = MAX_SOURCE_STRING_LENGTH,
  details = {},
} = {}) {
  if (
    typeof value !== 'string'
    || (!allowEmpty && value.length === 0)
    || value.length > maximumLength
  ) {
    throw invalid(`${field} must be a bounded ${allowEmpty ? '' : 'non-empty '}string.`, {
      ...details,
      field,
      maximumLength,
    });
  }
  return value;
}

function safeObjectDescriptors(value, field, seen, allowedKeys, requiredKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(`${field} must be a plain object.`, { field });
  }
  if (types.isProxy(value)) {
    throw invalid(`${field} must not be a Proxy.`, { field });
  }

  let prototype;
  let keys;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw invalid(`${field} could not be safely inspected.`, { field });
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid(`${field} must be a plain object.`, { field });
  }
  if (seen.has(value)) {
    throw invalid(`${field} must not contain cycles or shared object references.`, { field });
  }
  seen.add(value);

  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid(`${field} must not contain symbol keys.`, { field });
    }
    if (!allowedKeys.has(key)) {
      throw invalid(`${field} contains an unknown field.`, { field, unknownField: key });
    }
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw invalid(`${field}.${key} must be an enumerable data property, not an accessor.`, {
        field,
        property: key,
      });
    }
  }

  for (const key of requiredKeys) {
    if (!Object.hasOwn(descriptors, key)) {
      throw invalid(`${field}.${key} is required.`, { field, property: key });
    }
  }

  return descriptors;
}

function safeArrayValues(value, field, seen, maximumLength) {
  if (!Array.isArray(value)) {
    throw invalid(`${field} must be an array.`, { field });
  }
  if (types.isProxy(value)) {
    throw invalid(`${field} must not be a Proxy.`, { field });
  }

  let prototype;
  let keys;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw invalid(`${field} could not be safely inspected.`, { field });
  }

  if (prototype !== Array.prototype) {
    throw invalid(`${field} must be a native array.`, { field });
  }
  if (seen.has(value)) {
    throw invalid(`${field} must not contain cycles or shared object references.`, { field });
  }
  seen.add(value);

  if (!Number.isSafeInteger(value.length) || value.length > maximumLength) {
    throw invalid(`${field} exceeds its configured maximum length.`, {
      field,
      maximumLength,
      observedLength: value.length,
    });
  }

  for (const key of keys) {
    if (key === 'length') {
      continue;
    }
    if (
      typeof key !== 'string'
      || !/^(0|[1-9]\d*)$/.test(key)
      || Number(key) >= value.length
    ) {
      throw invalid(`${field} must not contain custom or symbol properties.`, { field });
    }
  }

  const values = new Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw invalid(`${field} must be dense, enumerable and accessor-free.`, { field, index });
    }
    values[index] = descriptor.value;
  }
  return values;
}

function descriptorValue(descriptors, key) {
  return descriptors[key].value;
}

function createMeasureId(partId, measureIndex) {
  return `${partId}:measure:${measureIndex}`;
}

function createSourceEventId(partId, measureIndex, noteIndex) {
  return `${partId}:measure:${measureIndex}:note:${noteIndex}`;
}

function expectedWrittenPitch(step, alter, octave) {
  const accidental = {
    '-2': 'bb',
    '-1': 'b',
    0: '',
    1: '#',
    2: '##',
  }[alter];
  return `${step}${accidental}${octave}`;
}

function validatePitch(pitch, field, seen, details) {
  const descriptors = safeObjectDescriptors(
    pitch,
    field,
    seen,
    new Set(['step', 'alter', 'octave', 'midi', 'written']),
    new Set(['step', 'alter', 'octave', 'midi', 'written']),
  );

  const step = requireString(descriptorValue(descriptors, 'step'), `${field}.step`, {
    maximumLength: 1,
    details,
  });
  const alter = requireSafeInteger(descriptorValue(descriptors, 'alter'), `${field}.alter`, details);
  const octave = requireSafeInteger(
    descriptorValue(descriptors, 'octave'),
    `${field}.octave`,
    details,
  );
  const midi = requireSafeInteger(descriptorValue(descriptors, 'midi'), `${field}.midi`, details);
  const written = requireString(descriptorValue(descriptors, 'written'), `${field}.written`, {
    maximumLength: 16,
    details,
  });

  if (!/^[A-G]$/.test(step) || alter < -2 || alter > 2) {
    throw invalid(`${field} contains unsupported pitch spelling.`, details);
  }

  let expectedMidi;
  try {
    expectedMidi = pitchToMidi({ step, alter, octave });
  } catch (error) {
    if (error instanceof PitchError) {
      throw invalid(`${field} contains invalid pitch components.`, details);
    }
    throw error;
  }

  if (midi !== expectedMidi) {
    throw invalid(`${field}.midi does not match pitch components.`, {
      ...details,
      expectedMidi,
      actualMidi: midi,
    });
  }

  const expectedWritten = expectedWrittenPitch(step, alter, octave);
  if (written !== expectedWritten) {
    throw invalid(`${field}.written does not match pitch components.`, {
      ...details,
      expectedWritten,
      actualWritten: written,
    });
  }

  return Object.freeze({ step, alter, octave, midi, written });
}

function validateTimeSignature(timeSignature, field, seen, details) {
  const descriptors = safeObjectDescriptors(
    timeSignature,
    field,
    seen,
    new Set(['beats', 'beatType']),
    new Set(['beats', 'beatType']),
  );
  return Object.freeze({
    beats: requirePositiveInteger(descriptorValue(descriptors, 'beats'), `${field}.beats`, details),
    beatType: requirePositiveInteger(
      descriptorValue(descriptors, 'beatType'),
      `${field}.beatType`,
      details,
    ),
  });
}

function validateSourceLocation(source, field, seen, context) {
  const {
    partId,
    measureIndex,
    measureNumber,
    sourceOrder,
  } = context;
  const descriptors = safeObjectDescriptors(
    source,
    field,
    seen,
    new Set(['partId', 'measureIndex', 'measureNumber', 'noteIndex', 'chordWithPrevious']),
    new Set(['partId', 'measureIndex', 'measureNumber', 'noteIndex', 'chordWithPrevious']),
  );

  const actualPartId = requireString(descriptorValue(descriptors, 'partId'), `${field}.partId`);
  const actualMeasureIndex = requireNonNegativeInteger(
    descriptorValue(descriptors, 'measureIndex'),
    `${field}.measureIndex`,
  );
  const actualMeasureNumber = requireString(
    descriptorValue(descriptors, 'measureNumber'),
    `${field}.measureNumber`,
  );
  const noteIndex = requireNonNegativeInteger(
    descriptorValue(descriptors, 'noteIndex'),
    `${field}.noteIndex`,
  );
  const chordWithPrevious = requireBoolean(
    descriptorValue(descriptors, 'chordWithPrevious'),
    `${field}.chordWithPrevious`,
  );

  if (
    actualPartId !== partId
    || actualMeasureIndex !== measureIndex
    || actualMeasureNumber !== measureNumber
    || noteIndex !== sourceOrder
  ) {
    throw invalid(`${field} does not match the containing source structure.`, {
      measureIndex,
      sourceOrder,
    });
  }

  return Object.freeze({
    partId: actualPartId,
    measureIndex: actualMeasureIndex,
    measureNumber: actualMeasureNumber,
    noteIndex,
    chordWithPrevious,
  });
}

function validateEvent(event, field, seen, context) {
  const {
    partId,
    measureIndex,
    measureNumber,
    expectedDurationDivisions,
    eventIndex,
    previousEvent,
  } = context;

  const descriptors = safeObjectDescriptors(
    event,
    field,
    seen,
    new Set([
      'sourceEventId',
      'sourceOrder',
      'type',
      'voice',
      'staff',
      'onsetDivisions',
      'durationDivisions',
      'pitch',
      'tieStart',
      'tieStop',
      'source',
    ]),
    new Set([
      'sourceEventId',
      'sourceOrder',
      'type',
      'voice',
      'staff',
      'onsetDivisions',
      'durationDivisions',
      'tieStart',
      'tieStop',
      'source',
    ]),
  );

  const sourceOrder = requireNonNegativeInteger(
    descriptorValue(descriptors, 'sourceOrder'),
    `${field}.sourceOrder`,
    { measureIndex, eventIndex },
  );
  if (sourceOrder !== eventIndex) {
    throw invalid(`${field}.sourceOrder must match its source-order array position.`, {
      measureIndex,
      eventIndex,
      sourceOrder,
    });
  }

  const expectedSourceEventId = createSourceEventId(partId, measureIndex, sourceOrder);
  const sourceEventId = requireString(
    descriptorValue(descriptors, 'sourceEventId'),
    `${field}.sourceEventId`,
  );
  if (sourceEventId !== expectedSourceEventId) {
    throw invalid(`${field}.sourceEventId is not deterministic.`, {
      measureIndex,
      eventIndex,
      expectedSourceEventId,
      actualSourceEventId: sourceEventId,
    });
  }

  const type = requireString(descriptorValue(descriptors, 'type'), `${field}.type`, {
    maximumLength: 8,
  });
  if (type !== 'note' && type !== 'rest') {
    throw invalid(`${field}.type must be note or rest.`, { measureIndex, eventIndex });
  }

  const voice = requireString(descriptorValue(descriptors, 'voice'), `${field}.voice`, {
    maximumLength: MAX_VOICE_ID_LENGTH,
    details: { measureIndex, eventIndex },
  });
  const staff = requirePositiveInteger(
    descriptorValue(descriptors, 'staff'),
    `${field}.staff`,
    { measureIndex, eventIndex },
  );
  if (staff > MAX_STAFF) {
    throw invalid(`${field}.staff exceeds the PA-1 two-staff boundary.`, {
      measureIndex,
      eventIndex,
      staff,
      maximumStaff: MAX_STAFF,
    });
  }

  const onsetDivisions = requireNonNegativeInteger(
    descriptorValue(descriptors, 'onsetDivisions'),
    `${field}.onsetDivisions`,
    { measureIndex, eventIndex },
  );
  const durationDivisions = requirePositiveInteger(
    descriptorValue(descriptors, 'durationDivisions'),
    `${field}.durationDivisions`,
    { measureIndex, eventIndex },
  );
  if (onsetDivisions > Number.MAX_SAFE_INTEGER - durationDivisions) {
    throw invalid(`${field} onset plus duration exceeds the safe-integer range.`, {
      measureIndex,
      eventIndex,
    });
  }
  const endDivisions = onsetDivisions + durationDivisions;
  if (endDivisions > expectedDurationDivisions) {
    throw invalid(`${field} extends beyond the measure boundary.`, {
      measureIndex,
      eventIndex,
      endDivisions,
      expectedDurationDivisions,
    });
  }

  const tieStart = requireBoolean(
    descriptorValue(descriptors, 'tieStart'),
    `${field}.tieStart`,
    { measureIndex, eventIndex },
  );
  const tieStop = requireBoolean(
    descriptorValue(descriptors, 'tieStop'),
    `${field}.tieStop`,
    { measureIndex, eventIndex },
  );
  if (type === 'rest' && (tieStart || tieStop)) {
    throw invalid(`${field} rest events must not carry tie markers.`, {
      measureIndex,
      eventIndex,
    });
  }
  const source = validateSourceLocation(
    descriptorValue(descriptors, 'source'),
    `${field}.source`,
    seen,
    {
      partId,
      measureIndex,
      measureNumber,
      sourceOrder,
    },
  );

  let pitch;
  if (type === 'note') {
    if (!Object.hasOwn(descriptors, 'pitch')) {
      throw invalid(`${field}.pitch is required for note events.`, {
        measureIndex,
        eventIndex,
      });
    }
    pitch = validatePitch(
      descriptorValue(descriptors, 'pitch'),
      `${field}.pitch`,
      seen,
      { measureIndex, eventIndex },
    );
  } else if (Object.hasOwn(descriptors, 'pitch')) {
    throw invalid(`${field}.pitch must be absent for rest events.`, {
      measureIndex,
      eventIndex,
    });
  }

  if (source.chordWithPrevious) {
    if (
      type !== 'note'
      || !previousEvent
      || previousEvent.type !== 'note'
      || previousEvent.voice !== voice
      || previousEvent.staff !== staff
      || previousEvent.onsetDivisions !== onsetDivisions
    ) {
      throw invalid(`${field}.source.chordWithPrevious is inconsistent with source order.`, {
        measureIndex,
        eventIndex,
      });
    }
  }

  return Object.freeze({
    sourceEventId,
    sourceOrder,
    type,
    voice,
    staff,
    onsetDivisions,
    durationDivisions,
    ...(pitch ? { pitch } : {}),
    tieStart,
    tieStop,
    source,
  });
}

function validateMeasure(measure, field, seen, context) {
  const {
    partId,
    measureIndex,
    remainingEventBudget,
    processing,
  } = context;
  const descriptors = safeObjectDescriptors(
    measure,
    field,
    seen,
    new Set([
      'measureId',
      'index',
      'number',
      'implicit',
      'divisions',
      'timeSignature',
      'expectedDurationDivisions',
      'events',
    ]),
    new Set([
      'measureId',
      'index',
      'number',
      'implicit',
      'divisions',
      'timeSignature',
      'expectedDurationDivisions',
      'events',
    ]),
  );

  const index = requireNonNegativeInteger(descriptorValue(descriptors, 'index'), `${field}.index`);
  if (index !== measureIndex) {
    throw invalid(`${field}.index must match its array position.`, {
      measureIndex,
      actualIndex: index,
    });
  }

  const number = requireString(descriptorValue(descriptors, 'number'), `${field}.number`);
  const measureId = requireString(descriptorValue(descriptors, 'measureId'), `${field}.measureId`);
  const expectedMeasureId = createMeasureId(partId, measureIndex);
  if (measureId !== expectedMeasureId) {
    throw invalid(`${field}.measureId is not deterministic.`, {
      measureIndex,
      expectedMeasureId,
      actualMeasureId: measureId,
    });
  }

  const implicit = requireBoolean(descriptorValue(descriptors, 'implicit'), `${field}.implicit`);
  const divisions = requirePositiveInteger(descriptorValue(descriptors, 'divisions'), `${field}.divisions`);
  const timeSignature = validateTimeSignature(
    descriptorValue(descriptors, 'timeSignature'),
    `${field}.timeSignature`,
    seen,
    { measureIndex },
  );
  const expectedDurationDivisions = requirePositiveInteger(
    descriptorValue(descriptors, 'expectedDurationDivisions'),
    `${field}.expectedDurationDivisions`,
    { measureIndex },
  );
  const calculatedNumerator = divisions * timeSignature.beats * 4;
  if (
    !Number.isSafeInteger(calculatedNumerator)
    || calculatedNumerator % timeSignature.beatType !== 0
    || calculatedNumerator / timeSignature.beatType !== expectedDurationDivisions
  ) {
    throw invalid(`${field}.expectedDurationDivisions does not match divisions/time signature.`, {
      measureIndex,
    });
  }

  const rawEvents = descriptorValue(descriptors, 'events');
  if (
    !types.isProxy(rawEvents)
    && Array.isArray(rawEvents)
    && rawEvents.length > remainingEventBudget
  ) {
    throw invalid('model events exceed the ProcessingBudget default boundary.', {
      maximumEvents: DEFAULT_PROCESSING_LIMITS.maxEvents,
    });
  }

  const eventValues = safeArrayValues(
    rawEvents,
    `${field}.events`,
    seen,
    DEFAULT_PROCESSING_LIMITS.maxEvents,
  );

  const events = [];
  let previousEvent = null;
  for (let eventIndex = 0; eventIndex < eventValues.length; eventIndex += 1) {
    if (processing) {
      processing.checkpoint('polyphonic-source-model:event', {
        measureIndex,
        eventIndex,
      });
    }
    const validated = validateEvent(
      eventValues[eventIndex],
      `${field}.events[${eventIndex}]`,
      seen,
      {
        partId,
        measureIndex,
        measureNumber: number,
        expectedDurationDivisions,
        eventIndex,
        previousEvent,
      },
    );
    events.push(validated);
    previousEvent = validated;
  }

  return Object.freeze({
    measureId,
    index,
    number,
    implicit,
    divisions,
    timeSignature,
    expectedDurationDivisions,
    events: Object.freeze(events),
  });
}

function validateSourceMetadata(source, field, seen) {
  const descriptors = safeObjectDescriptors(
    source,
    field,
    seen,
    new Set(['format', 'musicXmlVersion', 'partId']),
    new Set(['format', 'musicXmlVersion', 'partId']),
  );
  const format = requireString(descriptorValue(descriptors, 'format'), `${field}.format`);
  if (format !== 'score-partwise') {
    throw invalid(`${field}.format must be score-partwise.`, { format });
  }
  const musicXmlVersion = descriptorValue(descriptors, 'musicXmlVersion');
  if (musicXmlVersion !== null) {
    requireString(musicXmlVersion, `${field}.musicXmlVersion`, { maximumLength: 32 });
  }
  const partId = requireString(descriptorValue(descriptors, 'partId'), `${field}.partId`);
  return Object.freeze({ format, musicXmlVersion, partId });
}

function validatePolyphonicSourceModel(model, runtime = null) {
  const processing = resolveOptionalProcessingRuntime(runtime);
  const seen = new WeakSet();
  const descriptors = safeObjectDescriptors(
    model,
    'model',
    seen,
    new Set([
      'documentType',
      'contractVersion',
      'source',
      'measureCount',
      'eventCount',
      'measures',
    ]),
    new Set([
      'documentType',
      'contractVersion',
      'source',
      'measureCount',
      'eventCount',
      'measures',
    ]),
  );

  const documentType = requireString(
    descriptorValue(descriptors, 'documentType'),
    'model.documentType',
  );
  if (documentType !== POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE) {
    throw invalid('model.documentType is not supported.', { documentType });
  }
  const contractVersion = requireString(
    descriptorValue(descriptors, 'contractVersion'),
    'model.contractVersion',
  );
  if (contractVersion !== POLYPHONIC_SOURCE_MODEL_VERSION) {
    throw invalid('model.contractVersion is not supported.', {
      expectedContractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      actualContractVersion: contractVersion,
    });
  }

  const source = validateSourceMetadata(descriptorValue(descriptors, 'source'), 'model.source', seen);
  const measureCount = requirePositiveInteger(
    descriptorValue(descriptors, 'measureCount'),
    'model.measureCount',
  );
  if (measureCount > DEFAULT_PROCESSING_LIMITS.maxMeasures) {
    throw invalid('model.measureCount exceeds the ProcessingBudget default boundary.', {
      measureCount,
      maximumMeasures: DEFAULT_PROCESSING_LIMITS.maxMeasures,
    });
  }
  const eventCount = requireNonNegativeInteger(
    descriptorValue(descriptors, 'eventCount'),
    'model.eventCount',
  );
  if (eventCount > DEFAULT_PROCESSING_LIMITS.maxEvents) {
    throw invalid('model.eventCount exceeds the ProcessingBudget default boundary.', {
      eventCount,
      maximumEvents: DEFAULT_PROCESSING_LIMITS.maxEvents,
    });
  }

  const measureValues = safeArrayValues(
    descriptorValue(descriptors, 'measures'),
    'model.measures',
    seen,
    DEFAULT_PROCESSING_LIMITS.maxMeasures,
  );
  if (measureValues.length !== measureCount) {
    throw invalid('model.measureCount must match model.measures.length.', {
      measureCount,
      actualMeasureCount: measureValues.length,
    });
  }

  const measures = [];
  let observedEventCount = 0;
  const sourceEventIds = new Set();
  for (let measureIndex = 0; measureIndex < measureValues.length; measureIndex += 1) {
    const measure = validateMeasure(
      measureValues[measureIndex],
      `model.measures[${measureIndex}]`,
      seen,
      {
        partId: source.partId,
        measureIndex,
        remainingEventBudget: DEFAULT_PROCESSING_LIMITS.maxEvents - observedEventCount,
        processing,
      },
    );
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      if (processing) {
        processing.checkpoint('polyphonic-source-model:index-event', {
          measureIndex,
          eventIndex,
        });
      }
      const event = measure.events[eventIndex];
      observedEventCount += 1;
      if (observedEventCount > DEFAULT_PROCESSING_LIMITS.maxEvents) {
        throw invalid('model events exceed the ProcessingBudget default boundary.', {
          maximumEvents: DEFAULT_PROCESSING_LIMITS.maxEvents,
        });
      }
      if (sourceEventIds.has(event.sourceEventId)) {
        throw invalid('sourceEventId values must be unique across the model.', {
          sourceEventId: event.sourceEventId,
        });
      }
      sourceEventIds.add(event.sourceEventId);
    }
    measures.push(measure);
  }

  if (observedEventCount !== eventCount) {
    throw invalid('model.eventCount must match the total event count.', {
      eventCount,
      observedEventCount,
    });
  }

  return Object.freeze({
    documentType,
    contractVersion,
    source,
    measureCount,
    eventCount,
    measures: Object.freeze(measures),
  });
}

function createPolyphonicSourceModel(input, runtime = null) {
  return validatePolyphonicSourceModel(input, runtime);
}

module.exports = {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  PolyphonicSourceModelError,
  createMeasureId,
  createSourceEventId,
  validatePolyphonicSourceModel,
  createPolyphonicSourceModel,
};