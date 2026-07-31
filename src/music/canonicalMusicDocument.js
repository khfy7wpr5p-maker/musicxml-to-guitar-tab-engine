'use strict';

const { pitchToMidi, PitchError } = require('./pitch');

const CANONICAL_MUSIC_DOCUMENT_VERSION = '1.0.0';
const SUPPORTED_RHYTHM_TYPES = Object.freeze({
  whole: Object.freeze({ numerator: 4, denominator: 1 }),
  half: Object.freeze({ numerator: 2, denominator: 1 }),
  quarter: Object.freeze({ numerator: 1, denominator: 1 }),
  eighth: Object.freeze({ numerator: 1, denominator: 2 }),
  '16th': Object.freeze({ numerator: 1, denominator: 4 }),
});
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

function expectedRhythmDuration(divisions, type, dots, location) {
  const base = SUPPORTED_RHYTHM_TYPES[type];
  if (!base) {
    throw invalid('event.rhythm.type is not supported by the canonical contract.', {
      ...location,
      type,
    });
  }

  const dotDenominator = 2 ** dots;
  const dotNumerator = (2 ** (dots + 1)) - 1;
  const numerator = divisions * base.numerator * dotNumerator;
  const denominator = base.denominator * dotDenominator;

  if (numerator % denominator !== 0) {
    throw invalid('event rhythm cannot be represented by measure divisions.', {
      ...location,
      divisions,
      type,
      dots,
    });
  }

  return numerator / denominator;
}

function expectedMeasureDuration(divisions, timeSignature, location) {
  const numerator = divisions * timeSignature.beats * 4;
  if (numerator % timeSignature.beatType !== 0) {
    throw invalid('time signature cannot be represented by measure divisions.', {
      ...location,
      divisions,
      timeSignature: clonePlainData(timeSignature),
    });
  }
  return numerator / timeSignature.beatType;
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

function validateRhythm(rhythm, divisions, location) {
  requireObject(rhythm, 'event.rhythm', location);
  const duration = requirePositiveInteger(
    rhythm.durationDivisions,
    'event.rhythm.durationDivisions',
    location,
  );
  const type = requireNonEmptyString(rhythm.type, 'event.rhythm.type', location);
  const dots = requireNonNegativeInteger(rhythm.dots, 'event.rhythm.dots', location);
  if (dots > 3) {
    throw invalid('event.rhythm.dots must not exceed three.', location);
  }

  const expectedDuration = expectedRhythmDuration(divisions, type, dots, location);
  if (duration !== expectedDuration) {
    throw invalid('event.rhythm.durationDivisions does not match type and dots.', {
      ...location,
      duration,
      expectedDuration,
      divisions,
      type,
      dots,
    });
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
  const {
    partId,
    measure,
    measureArrayIndex,
    eventArrayIndex,
    expectedStart,
  } = context;
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

  const duration = validateRhythm(event.rhythm, measure.divisions, location);

  if (Object.hasOwn(event, 'selectedPosition') && event.selectedPosition !== null) {
    throw invalid('Parser output must not select a guitar position.', location);
  }
  if (Object.hasOwn(event, 'alternativePositions')) {
    const alternativePositions = requireArray(
      event.alternativePositions,
      'event.alternativePositions',
      location,
    );
    if (alternativePositions.length !== 0) {
      throw invalid('Parser output must not contain guitar position alternatives.', location);
    }
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
  const divisions = requirePositiveInteger(measure.divisions, 'measure.divisions', location);

  const timeSignature = requireObject(measure.timeSignature, 'measure.timeSignature', location);
  requirePositiveInteger(timeSignature.beats, 'timeSignature.beats', location);
  requirePositiveInteger(timeSignature.beatType, 'timeSignature.beatType', location);

  const declaredExpectedDuration = requirePositiveInteger(
    measure.expectedDurationDivisions,
    'measure.expectedDurationDivisions',
    location,
  );
  const calculatedExpectedDuration = expectedMeasureDuration(
    divisions,
    timeSignature,
    location,
  );
  if (declaredExpectedDuration !== calculatedExpectedDuration) {
    throw invalid('measure.expectedDurationDivisions does not match time signature and divisions.', {
      ...location,
      declaredExpectedDuration,
      calculatedExpectedDuration,
    });
  }

  requireNonNegativeInteger(
    measure.actualDurationDivisions,
    'measure.actualDurationDivisions',
    location,
  );
  if (measure.actualDurationDivisions > declaredExpectedDuration) {
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
  if (events.length > 0 && !measure.implicit && cursor !== declaredExpectedDuration) {
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
  requirePositiveInteger(parsedDocument.measureCount, 'parsedDocument.measureCount');
  requireNonNegativeInteger(parsedDocument.voiceCount, 'parsedDocument.voiceCount');
  if (parsedDocument.voiceCount > 1) {
    throw invalid('Monophonic parser output must not report more than one voice.');
  }

  const measures = requireArray(parsedDocument.measures, 'parsedDocument.measures');
  if (measures.length === 0) {
    throw invalid('parsedDocument.measures must contain at least one measure.');
  }
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

function createCanonicalStart(start) {
  return {
    divisions: start.divisions,
    beats: start.beats,
  };
}

function createCanonicalBeam(beam) {
  return {
    level: beam.level,
    value: beam.value,
  };
}

function createCanonicalRhythm(rhythm) {
  return {
    durationDivisions: rhythm.durationDivisions,
    type: rhythm.type,
    dots: rhythm.dots,
    timeModification: rhythm.timeModification,
    tieStart: rhythm.tieStart,
    tieStop: rhythm.tieStop,
    beam: rhythm.beam.map(createCanonicalBeam),
  };
}

function createCanonicalPitch(pitch) {
  return {
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
    written: pitch.written,
    midi: pitch.midi,
  };
}

function createCanonicalSourceLocation(sourceLocation) {
  return {
    partId: sourceLocation.partId,
    measure: sourceLocation.measure,
    noteIndex: sourceLocation.noteIndex,
  };
}

function createCanonicalTimeSignature(timeSignature) {
  return {
    beats: timeSignature.beats,
    beatType: timeSignature.beatType,
  };
}

function createCanonicalWarning(warning) {
  return {
    code: warning.code,
    message: warning.message,
    severity: warning.severity,
    location: isObject(warning.location)
      ? { measure: warning.location.measure }
      : null,
    details: {},
  };
}

function createCanonicalWarnings(warnings) {
  return warnings.map(createCanonicalWarning);
}

function createCanonicalEvent(event, measureKey) {
  const canonicalEvent = {
    eventId: event.eventId,
    eventIndex: event.eventIndex,
    measureKey,
    type: event.type,
    voice: event.voice,
    staff: event.staff,
    start: createCanonicalStart(event.start),
    rhythm: createCanonicalRhythm(event.rhythm),
    sourceLocation: createCanonicalSourceLocation(event.sourceLocation),
    warnings: createCanonicalWarnings(event.warnings),
  };

  if (event.type === 'note') {
    canonicalEvent.pitch = createCanonicalPitch(event.pitch);
  }

  return canonicalEvent;
}

function createCanonicalMusicDocument(parsedDocument) {
  validateParsedMusicDocument(parsedDocument);

  const measures = parsedDocument.measures.map((measure) => {
    const measureKey = createMeasureKey(parsedDocument.partId, measure.index);
    const events = measure.events.map((event) => createCanonicalEvent(event, measureKey));

    return {
      measureKey,
      measureIndex: measure.index,
      visibleMeasureNumber: measure.number,
      implicit: measure.implicit,
      timeSignature: createCanonicalTimeSignature(measure.timeSignature),
      divisions: measure.divisions,
      expectedDurationDivisions: measure.expectedDurationDivisions,
      actualDurationDivisions: measure.actualDurationDivisions,
      events,
      warnings: createCanonicalWarnings(measure.warnings),
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
