'use strict';

const {
  ENGINE_NAME,
} = require('./canonicalTabContractMetadata');
const {
  CANONICAL_MUSIC_DOCUMENT_VERSION,
} = require('../music/canonicalMusicDocument');
const {
  pitchToMidi,
  PitchError,
} = require('../music/pitch');
const {
  FingeringCostError,
  calculatePositionCost,
  calculateTransitionCost,
} = require('../fingering/costModel');
const {
  ROOT,
  invalid,
  object,
  array,
  string,
  boolean,
  integer,
  number,
  nullableInteger,
  exactKeys,
  equal,
  warningArray,
} = require('./canonicalTabContractCore');

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
const POSITION_COST_FIELDS = Object.freeze([
  'highFretDistance',
  'highFretCost',
  'openStringPreferenceCost',
]);
const TRANSITION_COST_FIELDS = Object.freeze([
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
]);

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

function guitar(value, { supportsCapo = false } = {}) {
  const path = `${ROOT}.guitar`;
  exactKeys(
    value,
    supportsCapo
      ? ['tuning', 'minimumFret', 'maximumFret', 'capoFret', 'fretSemantics']
      : ['tuning', 'minimumFret', 'maximumFret'],
    path,
  );
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
    if (entry.pitch !== null && typeof entry.pitch !== 'string') {
      invalid(`${entryPath}.pitch`, 'TUNING_PITCH_METADATA_TYPE');
    }
    const midi = integer(entry.midi, `${entryPath}.midi`, 0, 127);
    openMidi.set(stringNumber, midi);
  });

  const capoFret = supportsCapo
    ? integer(value.capoFret, `${path}.capoFret`, 1, maximumFret)
    : 0;
  if (supportsCapo) {
    equal(
      value.fretSemantics,
      'RELATIVE_FROM_CAPO',
      `${path}.fretSemantics`,
      'UNSUPPORTED_FRET_SEMANTICS',
    );
  }
  return { minimumFret, maximumFret, capoFret, openMidi };
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

function measureDuration(divisions, timeSignatureValue, path) {
  const numerator = divisions * timeSignatureValue.beats * 4;
  if (!Number.isSafeInteger(numerator) || numerator % timeSignatureValue.beatType !== 0) {
    invalid(path, 'UNREPRESENTABLE_MEASURE_DURATION');
  }
  return numerator / timeSignatureValue.beatType;
}

function rhythmDuration(divisions, rhythmValue, path) {
  const base = RHYTHMS[rhythmValue.type];
  if (!base) {
    invalid(`${path}.type`, 'UNSUPPORTED_RHYTHM_TYPE', { actual: rhythmValue.type });
  }
  const dotNumerator = (2 ** (rhythmValue.dots + 1)) - 1;
  const numerator = divisions * base[0] * dotNumerator;
  const denominator = base[1] * (2 ** rhythmValue.dots);
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

function start(value, measureValue, expected, path) {
  exactKeys(value, ['divisions', 'beats'], path);
  integer(value.divisions, `${path}.divisions`, 0);
  equal(value.divisions, expected, `${path}.divisions`, 'EVENT_START_SEQUENCE_MISMATCH');
  number(value.beats, `${path}.beats`);
  equal(
    value.beats,
    value.divisions / measureValue.divisions,
    `${path}.beats`,
    'EVENT_START_BEATS_MISMATCH',
  );
}

function rhythm(value, measureValue, path) {
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
    rhythmDuration(measureValue.divisions, value, path),
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
    const level = integer(entry.level, `${beamPath}.level`, 1);
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

function sourceLocation(value, sourceValue, measureValue, eventIndex, path) {
  exactKeys(value, ['partId', 'measure', 'noteIndex'], path);
  equal(value.partId, sourceValue.partId, `${path}.partId`, 'SOURCE_PART_MISMATCH');
  equal(
    value.measure,
    measureValue.visibleMeasureNumber,
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
    guitarConfig.openMidi.get(stringNumber) + guitarConfig.capoFret + fret,
    expectedMidi,
    path,
    'POSITION_PITCH_MISMATCH',
  );
  return { string: stringNumber, fret };
}

function costBase(value, path, breakdownFields) {
  exactKeys(value, ['total', 'isPlayable', 'reasons', 'breakdown'], path);
  number(value.total, `${path}.total`);
  equal(value.isPlayable, true, `${path}.isPlayable`, 'COST_PLAYABILITY_MISMATCH');
  equal(
    array(value.reasons, `${path}.reasons`).length,
    0,
    `${path}.reasons.length`,
    'COST_REASONS_MUST_BE_EMPTY',
  );
  exactKeys(value.breakdown, breakdownFields, `${path}.breakdown`);
}

function recomputeCost(factory, args, path) {
  try {
    return factory(...args);
  } catch (error) {
    if (error instanceof FingeringCostError) {
      invalid(path, 'COST_RECOMPUTATION_FAILED', {
        costErrorCode: error.code,
        costErrorField: error.details && error.details.field,
      });
    }
    throw error;
  }
}

function compareBreakdown(value, expected, fields, path, rule) {
  for (const field of fields) {
    equal(value[field], expected[field], `${path}.${field}`, rule);
  }
}

function positionCost(value, selected, profileValue, path) {
  costBase(value, path, POSITION_COST_FIELDS);
  const expected = recomputeCost(
    calculatePositionCost,
    [selected, profileValue],
    path,
  );
  compareBreakdown(
    value.breakdown,
    expected.breakdown,
    POSITION_COST_FIELDS,
    `${path}.breakdown`,
    'POSITION_COST_BREAKDOWN_MISMATCH',
  );
  equal(value.total, expected.total, `${path}.total`, 'POSITION_COST_TOTAL_MISMATCH');
  return expected.total;
}

function transitionCost(value, previous, selected, profileValue, path) {
  costBase(value, path, TRANSITION_COST_FIELDS);
  const expected = recomputeCost(
    calculateTransitionCost,
    [previous, selected, profileValue],
    path,
  );
  if (!expected.isPlayable) {
    invalid(path, 'TRANSITION_COST_NOT_PLAYABLE', {
      reasons: Array.from(expected.reasons),
    });
  }
  compareBreakdown(
    value.breakdown,
    expected.breakdown,
    TRANSITION_COST_FIELDS,
    `${path}.breakdown`,
    'TRANSITION_COST_BREAKDOWN_MISMATCH',
  );
  equal(value.total, expected.total, `${path}.total`, 'TRANSITION_COST_TOTAL_MISMATCH');
  return expected.total;
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

module.exports = {
  PROFILE_FIELDS,
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
};
