'use strict';

const { pitchToMidi, PitchError } = require('./pitch');

const CANONICAL_MUSIC_DOCUMENT_VERSION = '1.0.0';
const BEAM_VALUES = new Set([
  'begin',
  'continue',
  'end',
  'forward-hook',
  'backward-hook',
]);

class CanonicalMusicDocumentError extends Error {
  constructor(message, code = 'INVALID_PARSER_OUTPUT', details = {}) {
    super(message);
    this.name = 'CanonicalMusicDocumentError';
    this.code = code;
    this.details = details;
  }
}

function invalid(message, details = {}) {
  return new CanonicalMusicDocumentError(message, 'INVALID_PARSER_OUTPUT', details);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, field, details = {}) {
  if (!isObject(value)) {
    throw invalid(`${field} must be an object.`, details);
  }
  return value;
}

function requireArray(value, field, details = {}) {
  if (!Array.isArray(value)) {
    throw invalid(`${field} must be an array.`, details);
  }
  return value;
}

function requireNonEmptyString(value, field, details = {}) {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalid(`${field} must be a non-empty string.`, details);
  }
  return value;
}

function requireInteger(value, field, details = {}) {
  if (!Number.isSafeInteger(value)) {
    throw invalid(`${field} must be a safe integer.`, details);
  }
  return value;
}

function requirePositiveInteger(value, field, details = {}) {
  requireInteger(value, field, details);
  if (value <= 0) {
    throw invalid(`${field} must be positive.`, details);
  }
  return value;
}

function requireNonNegativeInteger(value, field, details = {}) {
  requireInteger(value, field, details);
  if (value < 0) {
    throw invalid(`${field} must not be negative.`, details);
  }
  return value;
}

function clonePlainData(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlainData);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, clonePlainData(nested)]),
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function createMeasureKey(partId, measureIndex) {
  requireNonEmptyString(partId, 'partId');
  requireNonNegativeInteger(measureIndex, 'measureIndex');
  return `${partId}:measure:${measureIndex}`;
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

function validatePitch(pitch, location) {
  requireObject(pitch, 'event.pitch', location);
  if (!/^[A-G]$/.test(pitch.step)) {
    throw invalid('event.pitch.step must be A through G.', location);
  }
  requireInteger(pitch.alter, 'event.pitch.alter', location);
  if (pitch.alter < -2 || pitch.alter > 2) {
    throw invalid('event.pitch.alter must be from -2 to 2.', location);
  }
  requireInteger(pitch.octave, 'event.pitch.octave', location);
  requireInteger(pitch.midi, 'event.pitch.midi', location);

  let expectedMidi;
  try {
    expectedMidi = pitchToMidi({
      step: pitch.step,
      alter: pitch.alter,
      octave: pitch.octave,
    });
  } catch (error) {
    if (error instanceof PitchError) {
      throw invalid('event.pitch contains invalid pitch components.', location);
    }
    throw error;
  }

  if (pitch.midi !== expectedMidi) {
    throw invalid('event.pitch.midi does not match the pitch components.', {
      ...location,
      expectedMidi,
      actualMidi: pitch.midi,
    });
  }

  const expectedWritten = expectedWrittenPitch(pitch.step, pitch.alter, pitch.octave);
  if (pitch.written !== expectedWritten) {
    throw invalid('event.pitch.written does not match the pitch components.', {
      ...location,
      expectedWritten,
      actualWritten: pitch.written,
    });
  }
}

function validateRhythm(rhythm, location) {
  requireObject(rhythm, 'event.rhythm', location);
  const duration = requirePositiveInteger(
    rhythm.durationDivisions,
    'event.rhythm.durationDivisions',
    location,
  );
  requireNonEmptyString(rhythm.type, 'event.rhythm.type', location);
  requireNonNegativeInteger(rhythm.dots, 'event.rhythm.dots', location);
  if (rhythm.dots > 3) {
    throw invalid('event.rhythm.dots must not exceed three.', location);
  }
  if (rhythm.timeModification !== null) {
    throw invalid('Monophonic parser output must not contain timeModification.', location);
  }
  if (typeof rhythm.tieStart !== 'boolean' || typeof rhythm.tieStop !== 'boolean') {
    throw invalid('Tie fields must be boolean values.', location);
  }

  const beams = requireArray(rhythm.beam, 'event.rhythm.beam', location);
  const levels = new Set();
  let previousLevel = 0;
  for (const beam of beams) {
    requireObject(beam, 'beam', location);
    const level = requirePositiveInteger(beam.level, 'beam.level', location);
    if (levels.has(level)) {
      throw invalid('Beam levels must be unique within an event.', { ...location, level });
    }
    if (level < previousLevel) {
      throw invalid('Beam levels must be sorted in ascending order.', location);
    }
    if (!BEAM_VALUES.has(beam.value)) {
      throw invalid('Beam value is not supported by the canonical contract.', {
        ...location,
        beamValue: beam.value,
      });
    }
    levels.add(level);
    previousLevel = level;
  }

  return duration;
}

function validateEvent(event, context) {
  const { partId, measure, measureArrayIndex, eventArrayIndex, expectedStart } = context;
  const location = {
    measureIndex: measureArrayIndex,
    visibleMeasureNumber: measure.number,
    eventIndex: eventArrayIndex,
  };

  requireObject(event, 'event', location);
  if (event.eventIndex !== eventArrayIndex) {
    throw invalid('event.eventIndex must match its array position.', location);
  }

  const expectedEventId = `m${measureArrayIndex + 1}-e${eventArrayIndex}`;
  if (event.eventId !== expectedEventId) {
    throw invalid('event.eventId is not deterministic.', {
      ...location,
      expectedEventId,
      actualEventId: event.eventId,
    });
  }
  if (event.type !== 'note' && event.type !== 'rest') {
    throw invalid('event.type must be note or rest.', location);
  }

  requirePositiveInteger(event.voice, 'event.voice', location);
  if (event.staff !== 1) {
    throw invalid('Monophonic parser output must use staff 1.', location);
  }

  const start = requireObject(event.start, 'event.start', location);
  requireNonNegativeInteger(start.divisions, 'event.start.divisions', location);
  if (start.divisions !== expectedStart) {
    throw invalid('event.start.divisions must follow the previous event without overlap or gap.', {
      ...location,
      expectedStart,
      actualStart: start.divisions,
    });
  }
  const expectedBeats = start.divisions / measure.divisions;
  if (!Number.isFinite(start.beats) || start.beats !== expectedBeats) {
    throw invalid('event.start.beats does not match divisions.', {
      ...location,
      expectedBeats,
      actualBeats: start.beats,
    });
  }

  const duration = validateRhythm(event.rhythm, location);

  if (event.selectedPosition !== null) {
    throw invalid('Parser output must not select a guitar position.', location);
  }
  if (requireArray(event.alternativePositions, 'event.alternativePositions', location).length !== 0) {
    throw invalid('Parser output must not contain guitar position alternatives.', location);
  }
  if (
    typeof event.confidence !== 'number'
    || !Number.isFinite(event.confidence)
    || event.confidence < 0
    || event.confidence > 1
  ) {
    throw invalid('event.confidence must be a finite number from 0 to 1.', location);
  }
  if (typeof event.requiresTeacherReview !== 'boolean') {
    throw invalid('event.requiresTeacherReview must be boolean.', location);
  }
  requireArray(event.warnings, 'event.warnings', location);

  const sourceLocation = requireObject(event.sourceLocation, 'event.sourceLocation', location);
  if (
    sourceLocation.partId !== partId
    || sourceLocation.measure !== measure.number
    || sourceLocation.noteIndex !== eventArrayIndex
  ) {
    throw invalid('event.sourceLocation does not match the parser structure.', location);
  }

  if (event.type === 'rest') {
    if (Object.hasOwn(event, 'pitch')) {
      throw invalid('Rest events must not contain pitch data.', location);
    }
  } else {
    validatePitch(event.pitch, location);
  }

  return { duration, voice: event.voice };
}

function validateMeasure(measure, context) {
  const { partId, measureArrayIndex } = context;
  const location = { measureIndex: measureArrayIndex };

  requireObject(measure, 'measure', location);
  requireNonEmptyString(measure.number, 'measure.number', location);
  if (measure.index !== measureArrayIndex) {
    throw invalid('measure.index must match its array position.', {
      ...location,
      actualIndex: measure.index,
    });
  }
  if (typeof measure.implicit !== 'boolean') {
    throw invalid('measure.implicit must be boolean.', location);
  }
  requirePositiveInteger(measure.divisions, 'measure.divisions', location);

  const timeSignature = requireObject(measure.timeSignature, 'measure.timeSignature', location);
  requirePositiveInteger(timeSignature.beats, 'timeSignature.beats', location);
  requirePositiveInteger(timeSignature.beatType, 'timeSignature.beatType', location);

  requirePositiveInteger(
    measure.expectedDurationDivisions,
    'measure.expectedDurationDivisions',
    location,
  );
  requireNonNegativeInteger(
    measure.actualDurationDivisions,
    'measure.actualDurationDivisions',
    location,
  );
  if (measure.actualDurationDivisions > measure.expectedDurationDivisions) {
    throw invalid('Measure duration exceeds its expected duration.', location);
  }

  const events = requireArray(measure.events, 'measure.events', location);
  requireArray(measure.warnings, 'measure.warnings', location);

  let cursor = 0;
  let measureVoice = null;
  for (let eventArrayIndex = 0; eventArrayIndex < events.length; eventArrayIndex += 1) {
    const validated = validateEvent(events[eventArrayIndex], {
      partId,
      measure,
      measureArrayIndex,
      eventArrayIndex,
      expectedStart: cursor,
    });
    cursor += validated.duration;
    if (measureVoice === null) {
      measureVoice = validated.voice;
    } else if (measureVoice !== validated.voice) {
      throw invalid('Measure contains multiple voices.', location);
    }
  }

  if (cursor !== measure.actualDurationDivisions) {
    throw invalid('Measure event durations do not match actualDurationDivisions.', {
      ...location,
      eventDurationTotal: cursor,
      actualDurationDivisions: measure.actualDurationDivisions,
    });
  }
  if (events.length > 0 && !measure.implicit && cursor !== measure.expectedDurationDivisions) {
    throw invalid('Non-pickup measure duration does not match expectedDurationDivisions.', location);
  }

  return measureVoice;
}

function validateParsedMusicDocument(parsedDocument) {
  requireObject(parsedDocument, 'parsedDocument');
  if (parsedDocument.format !== 'score-partwise') {
    throw invalid('parsedDocument.format must be score-partwise.', {
      format: parsedDocument.format,
    });
  }
  if (parsedDocument.version !== null && typeof parsedDocument.version !== 'string') {
    throw invalid('parsedDocument.version must be a string or null.');
  }

  const partId = requireNonEmptyString(parsedDocument.partId, 'parsedDocument.partId');
  requireNonNegativeInteger(parsedDocument.measureCount, 'parsedDocument.measureCount');
  requireNonNegativeInteger(parsedDocument.voiceCount, 'parsedDocument.voiceCount');
  if (parsedDocument.voiceCount > 1) {
    throw invalid('Monophonic parser output must not report more than one voice.');
  }

  const measures = requireArray(parsedDocument.measures, 'parsedDocument.measures');
  if (parsedDocument.measureCount !== measures.length) {
    throw invalid('parsedDocument.measureCount does not match measures.length.', {
      measureCount: parsedDocument.measureCount,
      actualMeasureCount: measures.length,
    });
  }

  let documentVoice = null;
  for (let measureArrayIndex = 0; measureArrayIndex < measures.length; measureArrayIndex += 1) {
    const measureVoice = validateMeasure(measures[measureArrayIndex], {
      partId,
      measureArrayIndex,
    });
    if (measureVoice !== null) {
      if (documentVoice === null) {
        documentVoice = measureVoice;
      } else if (documentVoice !== measureVoice) {
        throw invalid('Parsed document contains multiple voices.', { measureIndex: measureArrayIndex });
      }
    }
  }

  const expectedVoiceCount = documentVoice === null ? 0 : 1;
  if (parsedDocument.voiceCount !== expectedVoiceCount) {
    throw invalid('parsedDocument.voiceCount does not match the event data.', {
      expectedVoiceCount,
      actualVoiceCount: parsedDocument.voiceCount,
    });
  }

  return true;
}

function createCanonicalMusicDocument(parsedDocument) {
  validateParsedMusicDocument(parsedDocument);

  const measures = parsedDocument.measures.map((measure) => {
    const measureKey = createMeasureKey(parsedDocument.partId, measure.index);
    const events = measure.events.map((event) => ({
      ...clonePlainData(event),
      measureKey,
    }));

    return {
      measureKey,
      measureIndex: measure.index,
      visibleMeasureNumber: measure.number,
      implicit: measure.implicit,
      timeSignature: clonePlainData(measure.timeSignature),
      divisions: measure.divisions,
      expectedDurationDivisions: measure.expectedDurationDivisions,
      actualDurationDivisions: measure.actualDurationDivisions,
      events,
      warnings: clonePlainData(measure.warnings),
    };
  });

  return deepFreeze({
    documentType: 'CanonicalMusicDocument',
    contractVersion: CANONICAL_MUSIC_DOCUMENT_VERSION,
    sourceFormat: parsedDocument.format,
    sourceVersion: parsedDocument.version,
    partId: parsedDocument.partId,
    measureCount: parsedDocument.measureCount,
    voiceCount: parsedDocument.voiceCount,
    measures,
  });
}

module.exports = {
  CANONICAL_MUSIC_DOCUMENT_VERSION,
  CanonicalMusicDocumentError,
  createMeasureKey,
  validateParsedMusicDocument,
  createCanonicalMusicDocument,
};
