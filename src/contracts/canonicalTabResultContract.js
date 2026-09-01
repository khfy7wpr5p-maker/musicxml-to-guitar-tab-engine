'use strict';

const { isDeepStrictEqual } = require('node:util');
const {
  CANONICAL_TAB_RESULT_VERSION,
  CANONICAL_TAB_RESULT_V1_1_VERSION,
} = require('./canonicalTabContractMetadata');
const {
  ROOT,
  CanonicalTabContractError,
  raise,
  invalid,
  validateJsonGraph,
  object,
  array,
  string,
  boolean,
  integer,
  number,
  exactKeys,
  equal,
  warning,
  warningArray,
} = require('./canonicalTabContractCore');
const {
  engine,
  source,
  guitar,
  profile,
  measureDuration,
  timeSignature,
  start,
  rhythm,
  sourceLocation,
  restEvent,
  noteEvent,
} = require('./canonicalTabContractValueValidators');

const ROOT_FIELDS = Object.freeze([
  'documentType',
  'schemaVersion',
  'engine',
  'source',
  'requiresTeacherReview',
  'guitar',
  'fingeringProfile',
  'totalFingeringCost',
  'measureCount',
  'voiceCount',
  'noteCount',
  'restCount',
  'measures',
  'warnings',
]);
const MEASURE_FIELDS = Object.freeze([
  'measureKey',
  'measureIndex',
  'visibleMeasureNumber',
  'implicit',
  'timeSignature',
  'divisions',
  'expectedDurationDivisions',
  'actualDurationDivisions',
  'events',
  'warnings',
]);
const EVENT_BASE_FIELDS = Object.freeze([
  'eventId',
  'eventIndex',
  'measureKey',
  'type',
  'voice',
  'staff',
  'start',
  'rhythm',
  'warnings',
  'sourceLocation',
  'selectedPosition',
  'alternativePositions',
  'fingeringCost',
]);
const NOTE_FIELDS = Object.freeze([
  ...EVENT_BASE_FIELDS.slice(0, 10),
  'pitch',
  ...EVENT_BASE_FIELDS.slice(10),
]);

function event(value, state) {
  const {
    source: sourceValue,
    measure: measureValue,
    measureIndex,
    eventIndex,
    cursor,
  } = state;
  const path = `${ROOT}.measures[${measureIndex}].events[${eventIndex}]`;
  object(value, path);
  if (value.type === 'note') {
    exactKeys(value, NOTE_FIELDS, path);
  } else if (value.type === 'rest') {
    exactKeys(value, EVENT_BASE_FIELDS, path);
  } else {
    invalid(`${path}.type`, 'UNSUPPORTED_EVENT_TYPE');
  }

  equal(value.eventId, `m${measureIndex + 1}-e${eventIndex}`, `${path}.eventId`, 'EVENT_ID_MISMATCH');
  equal(value.eventIndex, eventIndex, `${path}.eventIndex`, 'EVENT_INDEX_MISMATCH');
  equal(value.measureKey, measureValue.measureKey, `${path}.measureKey`, 'EVENT_MEASURE_KEY_MISMATCH');
  const voice = integer(value.voice, `${path}.voice`, 1);
  equal(value.staff, 1, `${path}.staff`, 'SINGLE_STAFF_REQUIRED');
  start(value.start, measureValue, cursor, `${path}.start`);
  const duration = rhythm(value.rhythm, measureValue, `${path}.rhythm`);
  warningArray(value.warnings, `${path}.warnings`);
  sourceLocation(
    value.sourceLocation,
    sourceValue,
    measureValue,
    eventIndex,
    `${path}.sourceLocation`,
  );

  if (value.type === 'rest') {
    restEvent(value, path);
    return {
      duration,
      voice,
      noteCount: 0,
      restCount: 1,
      selected: state.previousPosition,
      cost: null,
    };
  }
  const note = noteEvent(value, state, path);
  return {
    duration,
    voice,
    noteCount: 1,
    restCount: 0,
    selected: note.selected,
    cost: note.cost,
  };
}

function measure(value, state) {
  const { source: sourceValue, measureIndex } = state;
  const path = `${ROOT}.measures[${measureIndex}]`;
  exactKeys(value, MEASURE_FIELDS, path);
  equal(value.measureIndex, measureIndex, `${path}.measureIndex`, 'MEASURE_INDEX_MISMATCH');
  equal(
    value.measureKey,
    `${sourceValue.partId}:measure:${measureIndex}`,
    `${path}.measureKey`,
    'MEASURE_KEY_MISMATCH',
  );
  string(value.visibleMeasureNumber, `${path}.visibleMeasureNumber`);
  boolean(value.implicit, `${path}.implicit`);
  timeSignature(value.timeSignature, `${path}.timeSignature`);
  integer(value.divisions, `${path}.divisions`, 1);
  integer(value.expectedDurationDivisions, `${path}.expectedDurationDivisions`, 1);
  equal(
    value.expectedDurationDivisions,
    measureDuration(value.divisions, value.timeSignature, `${path}.expectedDurationDivisions`),
    `${path}.expectedDurationDivisions`,
    'EXPECTED_MEASURE_DURATION_MISMATCH',
  );
  integer(
    value.actualDurationDivisions,
    `${path}.actualDurationDivisions`,
    0,
    value.expectedDurationDivisions,
  );
  warningArray(value.warnings, `${path}.warnings`);

  const warningIndex = value.warnings.map((entry) => ({
    scope: 'measure',
    measureKey: value.measureKey,
    eventId: null,
    warning: entry,
  }));
  const result = {
    noteCount: 0,
    restCount: 0,
    previousPosition: state.previousPosition,
    voice: null,
    warningIndex,
    costs: [],
  };

  let cursor = 0;
  array(value.events, `${path}.events`).forEach((entry, eventIndex) => {
    const validated = event(entry, {
      ...state,
      measure: value,
      eventIndex,
      cursor,
      previousPosition: result.previousPosition,
    });
    cursor += validated.duration;
    result.noteCount += validated.noteCount;
    result.restCount += validated.restCount;
    result.previousPosition = validated.selected;
    if (validated.cost !== null) {
      result.costs.push(validated.cost);
    }
    if (result.voice === null) {
      result.voice = validated.voice;
    } else {
      equal(
        validated.voice,
        result.voice,
        `${path}.events[${eventIndex}].voice`,
        'MULTIPLE_VOICES_NOT_SUPPORTED',
      );
    }
    for (const entryWarning of entry.warnings) {
      result.warningIndex.push({
        scope: 'event',
        measureKey: value.measureKey,
        eventId: entry.eventId,
        warning: entryWarning,
      });
    }
  });

  equal(
    value.actualDurationDivisions,
    cursor,
    `${path}.actualDurationDivisions`,
    'ACTUAL_MEASURE_DURATION_MISMATCH',
  );
  if (value.events.length > 0 && !value.implicit) {
    equal(
      cursor,
      value.expectedDurationDivisions,
      `${path}.actualDurationDivisions`,
      'NON_PICKUP_MEASURE_DURATION_MISMATCH',
    );
  }
  return result;
}

function warningIndex(value, expected) {
  const path = `${ROOT}.warnings`;
  array(value, path).forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    exactKeys(entry, ['scope', 'measureKey', 'eventId', 'warning'], entryPath);
    if (entry.scope !== 'measure' && entry.scope !== 'event') {
      invalid(`${entryPath}.scope`, 'INVALID_WARNING_SCOPE');
    }
    string(entry.measureKey, `${entryPath}.measureKey`);
    if (entry.eventId !== null) {
      string(entry.eventId, `${entryPath}.eventId`);
    }
    warning(entry.warning, `${entryPath}.warning`);
  });
  if (!isDeepStrictEqual(value, expected)) {
    invalid(path, 'WARNING_INDEX_MISMATCH', { expected, actual: value });
  }
}

function validateCanonicalTabResultForSchema(value, {
  schemaVersion,
  supportsCapo,
}) {
  validateJsonGraph(value, ROOT);
  object(value, ROOT);
  if (value.documentType !== 'CanonicalTabResult') {
    invalid(`${ROOT}.documentType`, 'DOCUMENT_TYPE_MISMATCH');
  }
  if (value.schemaVersion !== schemaVersion) {
    raise(
      'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
      `${ROOT}.schemaVersion`,
      'UNSUPPORTED_SCHEMA_VERSION',
      'The CanonicalTabResult schema version is not supported.',
      { expected: schemaVersion, actual: value.schemaVersion },
    );
  }

  exactKeys(value, ROOT_FIELDS, ROOT);
  engine(value.engine);
  source(value.source);
  equal(value.requiresTeacherReview, true, `${ROOT}.requiresTeacherReview`, 'TEACHER_REVIEW_REQUIRED');
  const guitarConfig = guitar(value.guitar, { supportsCapo });
  const profileValue = profile(value.fingeringProfile, guitarConfig);
  number(value.totalFingeringCost, `${ROOT}.totalFingeringCost`);
  integer(value.measureCount, `${ROOT}.measureCount`, 1);
  integer(value.voiceCount, `${ROOT}.voiceCount`, 0, 1);
  integer(value.noteCount, `${ROOT}.noteCount`, 0);
  integer(value.restCount, `${ROOT}.restCount`, 0);
  const measures = array(value.measures, `${ROOT}.measures`);
  equal(measures.length, value.measureCount, `${ROOT}.measureCount`, 'MEASURE_COUNT_MISMATCH');

  const total = {
    noteCount: 0,
    restCount: 0,
    cost: 0,
    previousPosition: null,
    voice: null,
    warningIndex: [],
  };
  measures.forEach((entry, measureIndex) => {
    const validated = measure(entry, {
      source: value.source,
      guitar: guitarConfig,
      profile: profileValue,
      measureIndex,
      previousPosition: total.previousPosition,
    });
    total.noteCount += validated.noteCount;
    total.restCount += validated.restCount;
    for (const eventCost of validated.costs) {
      total.cost += eventCost;
    }
    total.previousPosition = validated.previousPosition;
    total.warningIndex.push(...validated.warningIndex);
    if (validated.voice !== null) {
      if (total.voice === null) {
        total.voice = validated.voice;
      } else {
        equal(
          validated.voice,
          total.voice,
          `${ROOT}.measures[${measureIndex}].events[0].voice`,
          'MULTIPLE_VOICES_NOT_SUPPORTED',
        );
      }
    }
  });

  equal(value.noteCount, total.noteCount, `${ROOT}.noteCount`, 'NOTE_COUNT_MISMATCH');
  equal(value.restCount, total.restCount, `${ROOT}.restCount`, 'REST_COUNT_MISMATCH');
  equal(
    value.voiceCount,
    total.voice === null ? 0 : 1,
    `${ROOT}.voiceCount`,
    'VOICE_COUNT_MISMATCH',
  );
  equal(
    value.totalFingeringCost,
    total.cost,
    `${ROOT}.totalFingeringCost`,
    'TOTAL_FINGERING_COST_MISMATCH',
  );
  warningIndex(value.warnings, total.warningIndex);
  return value;
}

function validateCanonicalTabResult(value) {
  return validateCanonicalTabResultForSchema(value, {
    schemaVersion: CANONICAL_TAB_RESULT_VERSION,
    supportsCapo: false,
  });
}

function validateCanonicalTabResultV1_1(value) {
  return validateCanonicalTabResultForSchema(value, {
    schemaVersion: CANONICAL_TAB_RESULT_V1_1_VERSION,
    supportsCapo: true,
  });
}

module.exports = {
  CanonicalTabContractError,
  validateCanonicalTabResult,
  validateCanonicalTabResultV1_1,
};
