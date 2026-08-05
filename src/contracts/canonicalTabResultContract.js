'use strict';

const { isDeepStrictEqual } = require('node:util');
const {
  ENGINE_NAME,
  CANONICAL_TAB_RESULT_VERSION,
} = require('../tab/canonicalTabResult');
const {
  CANONICAL_MUSIC_DOCUMENT_VERSION,
} = require('../music/canonicalMusicDocument');
const {
  parsePitchName,
  pitchToMidi,
  PitchError,
} = require('../music/pitch');

const ROOT = 'canonicalTabResult';
const STRING_COUNT = 6;
const RHYTHMS = Object.freeze({
  whole: [4, 1],
  half: [2, 1],
  quarter: [1, 1],
  eighth: [1, 2],
  '16th': [1, 4],
});
const BEAMS = new Set([
  'begin',
  'continue',
  'end',
  'forward-hook',
  'backward-hook',
]);
const PROFILE_FIELDS = Object.freeze([
  'maximumFret',
  'fretMovementWeight',
  'stringMovementWeight',
  'largeShiftThreshold',
  'largeShiftWeight',
  'highFretThreshold',
  'highFretWeight',
  'openStringPreferenceWeight',
  'samePositionPreferenceWeight',
  'maximumFretMovement',
  'maximumStringMovement',
]);
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

class CanonicalTabContractError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CanonicalTabContractError';
    this.code = code;
    this.details = details;
  }
}

function raise(code, path, rule, message, details = {}) {
  throw new CanonicalTabContractError(
    message,
    code,
    { path, rule, ...details },
  );
}

function invalid(path, rule, details = {}) {
  raise(
    'INVALID_CANONICAL_TAB_RESULT',
    path,
    rule,
    `${path} violates CanonicalTabResult 1.0.0.`,
    details,
  );
}

function unsafe(path, rule, details = {}) {
  raise(
    'UNSAFE_CANONICAL_TAB_VALUE',
    path,
    rule,
    `${path} cannot be represented safely as canonical JSON data.`,
    details,
  );
}

function pathFor(path, key) {
  return typeof key === 'number' || /^(0|[1-9]\d*)$/.test(String(key))
    ? `${path}[${key}]`
    : `${path}.${key}`;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonGraph(value, path, active, done) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      unsafe(path, 'JSON_UNSAFE_NUMBER', { actual: String(value) });
    }
    return;
  }
  if (typeof value !== 'object') {
    unsafe(path, 'JSON_UNSAFE_VALUE_TYPE', { actualType: typeof value });
  }
  if (active.has(value)) {
    raise(
      'CYCLIC_CANONICAL_TAB_RESULT',
      path,
      'CYCLIC_REFERENCE',
      'CanonicalTabResult contains a cyclic reference.',
    );
  }
  if (done.has(value)) {
    return;
  }

  active.add(value);
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        unsafe(path, 'SYMBOL_KEY');
      }
      if (
        key !== 'length'
        && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
      ) {
        unsafe(pathFor(path, key), 'ARRAY_EXTRA_PROPERTY');
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const itemPath = pathFor(path, index);
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) {
        unsafe(itemPath, 'SPARSE_ARRAY');
      }
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        unsafe(itemPath, 'INVALID_ARRAY_PROPERTY');
      }
      validateJsonGraph(descriptor.value, itemPath, active, done);
    }
  } else {
    if (!isPlainObject(value)) {
      unsafe(path, 'NON_PLAIN_OBJECT');
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') {
        unsafe(path, 'SYMBOL_KEY');
      }
      const propertyPath = pathFor(path, key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable) {
        unsafe(propertyPath, 'NON_ENUMERABLE_PROPERTY');
      }
      if (!Object.hasOwn(descriptor, 'value')) {
        unsafe(propertyPath, 'ACCESSOR_PROPERTY');
      }
      validateJsonGraph(descriptor.value, propertyPath, active, done);
    }
  }
  active.delete(value);
  done.add(value);
}

function object(value, path) {
  if (!isPlainObject(value)) {
    invalid(path, 'PLAIN_OBJECT_REQUIRED');
  }
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) {
    invalid(path, 'ARRAY_REQUIRED');
  }
  return value;
}

function string(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(path, 'NON_EMPTY_STRING_REQUIRED');
  }
  return value;
}

function boolean(value, path) {
  if (typeof value !== 'boolean') {
    invalid(path, 'BOOLEAN_REQUIRED');
  }
  return value;
}

function integer(value, path, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(path, 'SAFE_INTEGER_RANGE', { minimum, maximum, actual: value });
  }
  return value;
}

function number(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    invalid(path, 'FINITE_NON_NEGATIVE_NUMBER_REQUIRED', { actual: value });
  }
  return value;
}

function nullableInteger(value, path) {
  return value === null ? null : integer(value, path, 0);
}

function exactKeys(value, expected, path) {
  object(value, path);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) {
      invalid(pathFor(path, key), 'MISSING_FIELD', { field: key });
    }
  }
  const expectedSet = new Set(expected);
  const unknown = Object.keys(value)
    .filter((key) => !expectedSet.has(key))
    .sort()[0];
  if (unknown !== undefined) {
    invalid(pathFor(path, unknown), 'UNKNOWN_FIELD', { field: unknown });
  }
}

function equal(actual, expected, path, rule) {
  if (!Object.is(actual, expected)) {
    invalid(path, rule, { expected, actual });
  }
}

function warning(value, path) {
  exactKeys(value, ['code', 'message', 'severity', 'location', 'details'], path);
  string(value.code, `${path}.code`);
  string(value.message, `${path}.message`);
  string(value.severity, `${path}.severity`);
  if (value.location !== null) {
    object(value.location, `${path}.location`);
  }
  object(value.details, `${path}.details`);
}

function warningArray(value, path) {
  array(value, path).forEach((entry, index) => warning(entry, `${path}[${index}]`));
}

function engine(value) {
  const path = `${ROOT}.engine`;
  exactKeys(value, ['name', 'version'], path);
  equal(value.name, ENGINE_NAME, `${path}.name`, 'ENGINE_NAME_MISMATCH');
  string(value.version, `${path}.version`);
}

function source(value) {
  const path = `${ROOT}.source`;
  exactKeys(
    value,
    ['documentType', 'contractVersion', 'format', 'version', 'partId'],
    path,
  );
  equal(
    value.documentType,
    'CanonicalMusicDocument',
    `${path}.documentType`,
    'SOURCE_DOCUMENT_TYPE_MISMATCH',
  );
  equal(
    value.contractVersion,
    CANONICAL_MUSIC_DOCUMENT_VERSION,
    `${path}.contractVersion`,
    'SOURCE_CONTRACT_VERSION_MISMATCH',
  );
  equal(value.format, 'score-partwise', `${path}.format`, 'SOURCE_FORMAT_MISMATCH');
  if (value.version !== null) {
    string(value.version, `${path}.version`);
  }
  string(value.partId, `${path}.partId`);
}

function guitar(value) {
  const path = `${ROOT}.guitar`;
  exactKeys(value, ['tuning', 'minimumFret', 'maximumFret'], path);
  const minimumFret = integer(value.minimumFret, `${path}.minimumFret`, 0);
  const maximumFret = integer(
    value.maximumFret,
    `${path}.maximumFret`,
    minimumFret,
  );
  const tuning = array(value.tuning, `${path}.tuning`);
  equal(tuning.length, STRING_COUNT, `${path}.tuning`, 'SIX_STRING_TUNING_REQUIRED');

  const openMidi = new Map();
  tuning.forEach((entry, index) => {
    const entryPath = `${path}.tuning[${index}]`;
    exactKeys(entry, ['number', 'pitch', 'midi'], entryPath);
    const stringNumber = integer(entry.number, `${entryPath}.number`, 1, STRING_COUNT);
    equal(stringNumber, index + 1, `${entryPath}.number`, 'TUNING_ORDER_MISMATCH');
    string(entry.pitch, `${entryPath}.pitch`);
    const midi = integer(entry.midi, `${entryPath}.midi`, 0, 127);

    let expectedMidi;
    try {
      expectedMidi = pitchToMidi(parsePitchName(entry.pitch));
    } catch (error) {
      if (error instanceof PitchError) {
        invalid(`${entryPath}.pitch`, 'INVALID_TUNING_PITCH');
      }
      throw error;
    }
    equal(midi, expectedMidi, `${entryPath}.midi`, 'TUNING_PITCH_MIDI_MISMATCH');
    openMidi.set(stringNumber, midi);
  });

  return { minimumFret, maximumFret, openMidi };
}

function profile(value, guitarConfig) {
  const path = `${ROOT}.fingeringProfile`;
  exactKeys(value, PROFILE_FIELDS, path);
  integer(value.maximumFret, `${path}.maximumFret`, 0);
  equal(
    value.maximumFret,
    guitarConfig.maximumFret,
    `${path}.maximumFret`,
    'FINGERING_PROFILE_FRET_RANGE_MISMATCH',
  );
  for (const field of [
    'fretMovementWeight',
    'stringMovementWeight',
    'largeShiftWeight',
    'highFretWeight',
    'openStringPreferenceWeight',
    'samePositionPreferenceWeight',
  ]) {
    number(value[field], `${path}.${field}`);
  }
  integer(value.largeShiftThreshold, `${path}.largeShiftThreshold`, 0);
  integer(
    value.highFretThreshold,
    `${path}.highFretThreshold`,
    0,
    value.maximumFret,
  );
  nullableInteger(value.maximumFretMovement, `${path}.maximumFretMovement`);
  nullableInteger(value.maximumStringMovement, `${path}.maximumStringMovement`);
  return value;
}

function measureDuration(divisions, timeSignature, path) {
  const numerator = divisions * timeSignature.beats * 4;
  if (!Number.isSafeInteger(numerator) || numerator % timeSignature.beatType !== 0) {
    invalid(path, 'UNREPRESENTABLE_MEASURE_DURATION');
  }
  return numerator / timeSignature.beatType;
}

function rhythmDuration(divisions, rhythm, path) {
  const base = RHYTHMS[rhythm.type];
  if (!base) {
    invalid(`${path}.type`, 'UNSUPPORTED_RHYTHM_TYPE', { actual: rhythm.type });
  }
  const dotNumerator = (2 ** (rhythm.dots + 1)) - 1;
  const numerator = divisions * base[0] * dotNumerator;
  const denominator = base[1] * (2 ** rhythm.dots);
  if (!Number.isSafeInteger(numerator) || numerator % denominator !== 0) {
    invalid(path, 'UNREPRESENTABLE_RHYTHM_DURATION');
  }
  return numerator / denominator;
}

function timeSignature(value, path) {
  exactKeys(value, ['beats', 'beatType'], path);
  integer(value.beats, `${path}.beats`, 1);
  integer(value.beatType, `${path}.beatType`, 1);
}

function start(value, measure, expected, path) {
  exactKeys(value, ['divisions', 'beats'], path);
  integer(value.divisions, `${path}.divisions`, 0);
  equal(value.divisions, expected, `${path}.divisions`, 'EVENT_START_SEQUENCE_MISMATCH');
  number(value.beats, `${path}.beats`);
  equal(
    value.beats,
    value.divisions / measure.divisions,
    `${path}.beats`,
    'EVENT_START_BEATS_MISMATCH',
  );
}

function rhythm(value, measure, path) {
  exactKeys(
    value,
    [
      'durationDivisions',
      'type',
      'dots',
      'timeModification',
      'tieStart',
      'tieStop',
      'beam',
    ],
    path,
  );
  integer(value.durationDivisions, `${path}.durationDivisions`, 1);
  string(value.type, `${path}.type`);
  integer(value.dots, `${path}.dots`, 0, 3);
  equal(
    value.durationDivisions,
    rhythmDuration(measure.divisions, value, path),
    `${path}.durationDivisions`,
    'RHYTHM_DURATION_MISMATCH',
  );
  equal(
    value.timeModification,
    null,
    `${path}.timeModification`,
    'TIME_MODIFICATION_NOT_SUPPORTED',
  );
  boolean(value.tieStart, `${path}.tieStart`);
  boolean(value.tieStop, `${path}.tieStop`);

  let previousLevel = 0;
  const levels = new Set();
  array(value.beam, `${path}.beam`).forEach((entry, index) => {
    const beamPath = `${path}.beam[${index}]`;
    exactKeys(entry, ['level', 'value'], beamPath);
    const level = integer(entry.level, `${beamPath}.level`, 1, 8);
    if (levels.has(level)) {
      invalid(`${beamPath}.level`, 'DUPLICATE_BEAM_LEVEL');
    }
    if (level < previousLevel) {
      invalid(`${beamPath}.level`, 'UNSORTED_BEAM_LEVEL');
    }
    if (!BEAMS.has(entry.value)) {
      invalid(`${beamPath}.value`, 'UNSUPPORTED_BEAM_VALUE');
    }
    levels.add(level);
    previousLevel = level;
  });
  return value.durationDivisions;
}

function sourceLocation(value, sourceValue, measure, eventIndex, path) {
  exactKeys(value, ['partId', 'measure', 'noteIndex'], path);
  equal(value.partId, sourceValue.partId, `${path}.partId`, 'SOURCE_PART_MISMATCH');
  equal(
    value.measure,
    measure.visibleMeasureNumber,
    `${path}.measure`,
    'SOURCE_MEASURE_MISMATCH',
  );
  equal(value.noteIndex, eventIndex, `${path}.noteIndex`, 'SOURCE_NOTE_INDEX_MISMATCH');
}

function writtenPitch(step, alter, octave) {
  return `${step}${{ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter]}${octave}`;
}

function pitch(value, path) {
  exactKeys(value, ['step', 'alter', 'octave', 'written', 'midi'], path);
  if (typeof value.step !== 'string' || !/^[A-G]$/.test(value.step)) {
    invalid(`${path}.step`, 'INVALID_PITCH_STEP');
  }
  integer(value.alter, `${path}.alter`, -2, 2);
  integer(value.octave, `${path}.octave`);
  string(value.written, `${path}.written`);
  integer(value.midi, `${path}.midi`, 0, 127);

  let expectedMidi;
  try {
    expectedMidi = pitchToMidi(value);
  } catch (error) {
    if (error instanceof PitchError) {
      invalid(path, 'INVALID_PITCH_COMPONENTS');
    }
    throw error;
  }
  equal(value.midi, expectedMidi, `${path}.midi`, 'PITCH_MIDI_MISMATCH');
  equal(
    value.written,
    writtenPitch(value.step, value.alter, value.octave),
    `${path}.written`,
    'WRITTEN_PITCH_MISMATCH',
  );
}

function position(value, guitarConfig, expectedMidi, path) {
  exactKeys(value, ['string', 'fret'], path);
  const stringNumber = integer(value.string, `${path}.string`, 1, STRING_COUNT);
  const fret = integer(
    value.fret,
    `${path}.fret`,
    guitarConfig.minimumFret,
    guitarConfig.maximumFret,
  );
  equal(
    guitarConfig.openMidi.get(stringNumber) + fret,
    expectedMidi,
    path,
    'POSITION_PITCH_MISMATCH',
  );
  return { string: stringNumber, fret };
}

function costBase(value, path, breakdownFields) {
  exactKeys(value, ['total', 'isPlayable', 'reasons', 'breakdown'], path);
  equal(value.isPlayable, true, `${path}.isPlayable`, 'COST_PLAYABILITY_MISMATCH');
  equal(
    array(value.reasons, `${path}.reasons`).length,
    0,
    `${path}.reasons.length`,
    'COST_REASONS_MUST_BE_EMPTY',
  );
  exactKeys(value.breakdown, breakdownFields, `${path}.breakdown`);
}

function positionCost(value, selected, profileValue, path) {
  const fields = ['highFretDistance', 'highFretCost', 'openStringPreferenceCost'];
  costBase(value, path, fields);
  const expected = {
    highFretDistance: Math.max(0, selected.fret - profileValue.highFretThreshold),
  };
  expected.highFretCost = expected.highFretDistance * profileValue.highFretWeight;
  expected.openStringPreferenceCost = selected.fret === 0
    ? 0
    : profileValue.openStringPreferenceWeight;
  for (const field of fields) {
    equal(
      value.breakdown[field],
      expected[field],
      `${path}.breakdown.${field}`,
      'POSITION_COST_BREAKDOWN_MISMATCH',
    );
  }
  const total = expected.highFretCost + expected.openStringPreferenceCost;
  equal(value.total, total, `${path}.total`, 'POSITION_COST_TOTAL_MISMATCH');
  return total;
}

function transitionCost(value, previous, selected, profileValue, path) {
  const fields = [
    'fretMovement',
    'fretMovementCost',
    'stringMovement',
    'stringMovementCost',
    'largeShiftDistance',
    'largeShiftCost',
    'highFretDistance',
    'highFretCost',
    'openStringPreferenceCost',
    'samePosition',
    'samePositionPreferenceCost',
  ];
  costBase(value, path, fields);

  const fretMovement = Math.abs(selected.fret - previous.fret);
  const stringMovement = Math.abs(selected.string - previous.string);
  if (
    profileValue.maximumFretMovement !== null
    && fretMovement > profileValue.maximumFretMovement
  ) {
    invalid(path, 'MAXIMUM_FRET_MOVEMENT_EXCEEDED');
  }
  if (
    profileValue.maximumStringMovement !== null
    && stringMovement > profileValue.maximumStringMovement
  ) {
    invalid(path, 'MAXIMUM_STRING_MOVEMENT_EXCEEDED');
  }

  const expected = {
    fretMovement,
    fretMovementCost: fretMovement * profileValue.fretMovementWeight,
    stringMovement,
    stringMovementCost: stringMovement * profileValue.stringMovementWeight,
    largeShiftDistance: Math.max(0, fretMovement - profileValue.largeShiftThreshold),
    highFretDistance: Math.max(0, selected.fret - profileValue.highFretThreshold),
    openStringPreferenceCost: selected.fret === 0
      ? 0
      : profileValue.openStringPreferenceWeight,
    samePosition: fretMovement === 0 && stringMovement === 0,
  };
  expected.largeShiftCost = expected.largeShiftDistance * profileValue.largeShiftWeight;
  expected.highFretCost = expected.highFretDistance * profileValue.highFretWeight;
  expected.samePositionPreferenceCost = expected.samePosition
    ? 0
    : profileValue.samePositionPreferenceWeight;

  for (const field of fields) {
    equal(
      value.breakdown[field],
      expected[field],
      `${path}.breakdown.${field}`,
      'TRANSITION_COST_BREAKDOWN_MISMATCH',
    );
  }
  const total = expected.fretMovementCost
    + expected.stringMovementCost
    + expected.largeShiftCost
    + expected.highFretCost
    + expected.openStringPreferenceCost
    + expected.samePositionPreferenceCost;
  equal(value.total, total, `${path}.total`, 'TRANSITION_COST_TOTAL_MISMATCH');
  return total;
}

function restEvent(value, path) {
  if (Object.hasOwn(value, 'pitch')) {
    invalid(`${path}.pitch`, 'REST_MUST_NOT_HAVE_PITCH');
  }
  equal(
    value.selectedPosition,
    null,
    `${path}.selectedPosition`,
    'REST_SELECTED_POSITION_MISMATCH',
  );
  equal(
    array(value.alternativePositions, `${path}.alternativePositions`).length,
    0,
    `${path}.alternativePositions.length`,
    'REST_ALTERNATIVES_MUST_BE_EMPTY',
  );
  equal(value.fingeringCost, null, `${path}.fingeringCost`, 'REST_COST_MUST_BE_NULL');
}

function noteEvent(value, state, path) {
  pitch(value.pitch, `${path}.pitch`);
  const selected = position(
    value.selectedPosition,
    state.guitar,
    value.pitch.midi,
    `${path}.selectedPosition`,
  );

  const seen = new Set([`${selected.string}:${selected.fret}`]);
  let previousString = 0;
  array(value.alternativePositions, `${path}.alternativePositions`)
    .forEach((entry, index) => {
      const alternativePath = `${path}.alternativePositions[${index}]`;
      const alternative = position(
        entry,
        state.guitar,
        value.pitch.midi,
        alternativePath,
      );
      const key = `${alternative.string}:${alternative.fret}`;
      if (seen.has(key)) {
        invalid(alternativePath, 'DUPLICATE_TAB_POSITION');
      }
      if (alternative.string <= previousString) {
        invalid(`${alternativePath}.string`, 'UNSORTED_ALTERNATIVE_POSITIONS');
      }
      previousString = alternative.string;
      seen.add(key);
    });

  object(value.fingeringCost, `${path}.fingeringCost`);
  const cost = state.previousPosition === null
    ? positionCost(value.fingeringCost, selected, state.profile, `${path}.fingeringCost`)
    : transitionCost(
      value.fingeringCost,
      state.previousPosition,
      selected,
      state.profile,
      `${path}.fingeringCost`,
    );
  return { selected, cost };
}

function event(value, state) {
  const {
    source: sourceValue,
    measure,
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
  equal(value.measureKey, measure.measureKey, `${path}.measureKey`, 'EVENT_MEASURE_KEY_MISMATCH');
  const voice = integer(value.voice, `${path}.voice`, 1);
  equal(value.staff, 1, `${path}.staff`, 'SINGLE_STAFF_REQUIRED');
  start(value.start, measure, cursor, `${path}.start`);
  const duration = rhythm(value.rhythm, measure, `${path}.rhythm`);
  warningArray(value.warnings, `${path}.warnings`);
  sourceLocation(
    value.sourceLocation,
    sourceValue,
    measure,
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
      cost: 0,
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
    eventCount: 0,
    cost: 0,
    previousPosition: state.previousPosition,
    voice: null,
    warningIndex,
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
    result.eventCount += 1;
    result.cost += validated.cost;
    result.previousPosition = validated.selected;
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

function validateCanonicalTabResult(value) {
  validateJsonGraph(value, ROOT, new WeakSet(), new WeakSet());
  object(value, ROOT);
  if (value.documentType !== 'CanonicalTabResult') {
    invalid(`${ROOT}.documentType`, 'DOCUMENT_TYPE_MISMATCH');
  }
  if (value.schemaVersion !== CANONICAL_TAB_RESULT_VERSION) {
    raise(
      'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
      `${ROOT}.schemaVersion`,
      'UNSUPPORTED_SCHEMA_VERSION',
      'The CanonicalTabResult schema version is not supported.',
      { expected: CANONICAL_TAB_RESULT_VERSION, actual: value.schemaVersion },
    );
  }

  exactKeys(value, ROOT_FIELDS, ROOT);
  engine(value.engine);
  source(value.source);
  equal(value.requiresTeacherReview, true, `${ROOT}.requiresTeacherReview`, 'TEACHER_REVIEW_REQUIRED');
  const guitarConfig = guitar(value.guitar);
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
    total.cost += validated.cost;
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

module.exports = {
  CanonicalTabContractError,
  validateCanonicalTabResult,
};
