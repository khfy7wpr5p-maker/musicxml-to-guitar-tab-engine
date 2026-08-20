'use strict';

const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  validateTeacherArrangementBenchmarkAdmission,
} = require('./teacherArrangementBenchmarkAdmission');

const TEACHER_ARRANGEMENT_BENCHMARK_CORE_SEMANTIC_VERSION = '1.0.0';
const MAX_SOURCE_EVENTS_PER_CASE = 256;
const MAX_DECISIONS_PER_ARRANGEMENT = 256;
const MAX_SHAPES_PER_ARRANGEMENT = 64;
const DECISION_TYPES = new Set([
  'PRESERVED',
  'OMITTED',
  'OCTAVE_DISPLACED',
  'VOICE_REDISTRIBUTED',
  'CHORD_REDUCED',
  'REVOICED',
  'ARPEGGIATED',
]);
const DISPOSITIONS = new Set(['RETAINED', 'OMITTED']);
const EVENT_ID_PATTERN = /^([A-Za-z0-9._-]{1,64}):measure:(\d+):note:(\d+)$/;
const GROUP_ID_PATTERN = /^([A-Za-z0-9._-]{1,64}):measure:(\d+):simultaneous:(\d+)$/;
const DECISION_ID_PATTERN = /^([A-Za-z0-9._-]{1,64}):arrangement-decision:(\d+)$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;

class TeacherArrangementBenchmarkCoreSemanticError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_CORE_SEMANTICS',
      details,
      'TeacherArrangementBenchmarkCoreSemanticError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkCoreSemanticError(message, { field, ...details });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function assertExactDataFields(value, fields, field) {
  if (!isPlainObject(value)) {
    throw invalid(`${field} must be a non-proxy plain object.`, field);
  }
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid('Object keys could not be inspected safely.', field);
  }
  const allowed = new Set(fields);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid('Symbol properties are not allowed.', field);
    }
    const child = `${field}.${key}`;
    if (!allowed.has(key)) {
      throw invalid('Unknown field is not allowed.', child);
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw invalid('Field descriptor could not be inspected safely.', child);
    }
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('Fields must be enumerable own data properties.', child);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      throw invalid('Required field is missing.', `${field}.${key}`);
    }
  }
}

function assertDenseNativeArray(value, field, min, max) {
  if ((value !== null && typeof value === 'object' && isProxy(value)) || !Array.isArray(value)) {
    throw invalid(`${field} must be a non-proxy array.`, field);
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw invalid('Array subclasses are not allowed.', field);
    }
  } catch (error) {
    if (error instanceof TeacherArrangementBenchmarkCoreSemanticError) {
      throw error;
    }
    throw invalid('Array prototype could not be inspected safely.', field);
  }
  if (value.length < min || value.length > max) {
    throw invalid(`${field} length is outside the core semantic boundary.`, field, {
      length: value.length,
      min,
      max,
    });
  }
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid('Array keys could not be inspected safely.', field);
  }
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid('Array symbol properties are not allowed.', field);
    }
    if (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)) {
      throw invalid('Custom array properties are not allowed.', field, { key });
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw invalid(`${field} must be dense.`, `${field}[${index}]`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('Array entries must be enumerable own data properties.', `${field}[${index}]`);
    }
  }
}

function requireInteger(value, field, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw invalid(`${field} is outside the supported integer range.`, field, { value, min, max });
  }
  return value;
}

function requireId(value, field, pattern = ID_PATTERN) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw invalid(`${field} is not a canonical identifier.`, field);
  }
  return value;
}

function validateGuitar(guitar) {
  assertExactDataFields(guitar, ['tuning', 'minimumFret', 'maximumFret'], 'guitar');
  requireInteger(guitar.minimumFret, 'guitar.minimumFret', 0, 36);
  requireInteger(guitar.maximumFret, 'guitar.maximumFret', guitar.minimumFret, 36);
  assertDenseNativeArray(guitar.tuning, 'guitar.tuning', 6, 6);
  const tuning = new Map();
  for (let index = 0; index < guitar.tuning.length; index += 1) {
    const entry = guitar.tuning[index];
    const field = `guitar.tuning[${index}]`;
    assertExactDataFields(entry, ['string', 'midi'], field);
    requireInteger(entry.string, `${field}.string`, 1, 6);
    requireInteger(entry.midi, `${field}.midi`, 0, 127);
    if (entry.string !== index + 1 || tuning.has(entry.string)) {
      throw invalid('Tuning must contain strings 1..6 once in canonical order.', `${field}.string`);
    }
    tuning.set(entry.string, entry.midi);
  }
  return tuning;
}

function validatePhysicalPolicy(policy) {
  assertExactDataFields(policy, ['documentType', 'contractVersion', 'policy'], 'physicalPolicy');
  if (
    policy.documentType !== 'PhysicalPlayabilityValidation'
    || policy.contractVersion !== '2.0.0'
    || policy.policy !== 'CONSERVATIVE_STATIC_LEFT_HAND_2.0'
  ) {
    throw invalid('Unsupported physical playability policy identity.', 'physicalPolicy');
  }
}

function validateSourceSelection(sourceSelection, caseField) {
  const field = `${caseField}.sourceSelection`;
  assertExactDataFields(sourceSelection, ['partId', 'measureIndex', 'sourceEventIds'], field);
  requireId(sourceSelection.partId, `${field}.partId`, /^[A-Za-z0-9._-]{1,64}$/);
  requireInteger(sourceSelection.measureIndex, `${field}.measureIndex`, 0, 1000000);
  assertDenseNativeArray(sourceSelection.sourceEventIds, `${field}.sourceEventIds`, 1, MAX_SOURCE_EVENTS_PER_CASE);
  const seen = new Set();
  for (let index = 0; index < sourceSelection.sourceEventIds.length; index += 1) {
    const eventField = `${field}.sourceEventIds[${index}]`;
    const eventId = requireId(sourceSelection.sourceEventIds[index], eventField, EVENT_ID_PATTERN);
    const match = EVENT_ID_PATTERN.exec(eventId);
    if (match[1] !== sourceSelection.partId || Number(match[2]) !== sourceSelection.measureIndex) {
      throw invalid('Source event identity must match sourceSelection part and measure.', eventField);
    }
    if (seen.has(eventId)) {
      throw invalid('sourceEventIds must be unique.', eventField);
    }
    seen.add(eventId);
  }
  return seen;
}

function validatePosition(position, field, targetMidi, guitar, tuning) {
  assertExactDataFields(position, ['string', 'fret'], field);
  requireInteger(position.string, `${field}.string`, 1, 6);
  requireInteger(position.fret, `${field}.fret`, guitar.minimumFret, guitar.maximumFret);
  const actualMidi = tuning.get(position.string) + position.fret;
  if (actualMidi !== targetMidi) {
    throw invalid('Selected position does not produce targetMidi under benchmark tuning.', field, {
      targetMidi,
      actualMidi,
    });
  }
}

function validateDecision(decision, field, sourceEvents) {
  assertExactDataFields(decision, ['decisionId', 'decisionType', 'sourceEventIds', 'sourceGroupId'], field);
  requireId(decision.decisionId, `${field}.decisionId`, DECISION_ID_PATTERN);
  if (!DECISION_TYPES.has(decision.decisionType)) {
    throw invalid('Unsupported arrangement decision type.', `${field}.decisionType`);
  }
  assertDenseNativeArray(decision.sourceEventIds, `${field}.sourceEventIds`, 1, MAX_SOURCE_EVENTS_PER_CASE);
  const local = new Set();
  for (let index = 0; index < decision.sourceEventIds.length; index += 1) {
    const eventField = `${field}.sourceEventIds[${index}]`;
    const eventId = requireId(decision.sourceEventIds[index], eventField, EVENT_ID_PATTERN);
    if (!sourceEvents.has(eventId)) {
      throw invalid('Decision references an event outside sourceSelection.', eventField);
    }
    if (local.has(eventId)) {
      throw invalid('Decision sourceEventIds must be unique.', eventField);
    }
    local.add(eventId);
  }
  if (decision.sourceGroupId !== null) {
    requireId(decision.sourceGroupId, `${field}.sourceGroupId`, GROUP_ID_PATTERN);
  }
}

function validateOutcome(outcome, field, sourceEvents, decisionById, guitar, tuning) {
  assertExactDataFields(
    outcome,
    ['sourceEventId', 'decisionId', 'decisionType', 'disposition', 'sourceMidi', 'targetMidi', 'selectedPosition', 'selectedShapeId'],
    field,
  );
  const eventId = requireId(outcome.sourceEventId, `${field}.sourceEventId`, EVENT_ID_PATTERN);
  if (!sourceEvents.has(eventId)) {
    throw invalid('noteOutcome references an event outside sourceSelection.', `${field}.sourceEventId`);
  }
  const decisionId = requireId(outcome.decisionId, `${field}.decisionId`, DECISION_ID_PATTERN);
  const decision = decisionById.get(decisionId);
  if (!decision || !decision.sourceEventIds.includes(eventId)) {
    throw invalid('noteOutcome must bind to the decision that covers its source event.', `${field}.decisionId`);
  }
  if (outcome.decisionType !== decision.decisionType) {
    throw invalid('noteOutcome decisionType must match its decision.', `${field}.decisionType`);
  }
  if (!DISPOSITIONS.has(outcome.disposition)) {
    throw invalid('Unsupported note disposition.', `${field}.disposition`);
  }
  requireInteger(outcome.sourceMidi, `${field}.sourceMidi`, 0, 127);
  if (outcome.disposition === 'OMITTED') {
    if (outcome.targetMidi !== null || outcome.selectedPosition !== null || outcome.selectedShapeId !== null) {
      throw invalid('Omitted notes must not fabricate target/position/shape facts.', field);
    }
    return;
  }
  requireInteger(outcome.targetMidi, `${field}.targetMidi`, 0, 127);
  if (outcome.selectedPosition === null) {
    throw invalid('Retained notes require one selectedPosition.', `${field}.selectedPosition`);
  }
  validatePosition(outcome.selectedPosition, `${field}.selectedPosition`, outcome.targetMidi, guitar, tuning);
  if (outcome.selectedShapeId !== null) {
    requireId(outcome.selectedShapeId, `${field}.selectedShapeId`);
  }
  if (outcome.decisionType === 'PRESERVED' && outcome.targetMidi !== outcome.sourceMidi) {
    throw invalid('PRESERVED outcomes must retain source pitch.', `${field}.targetMidi`);
  }
  if (outcome.decisionType === 'OCTAVE_DISPLACED') {
    const delta = outcome.targetMidi - outcome.sourceMidi;
    if (delta === 0 || delta % 12 !== 0) {
      throw invalid('OCTAVE_DISPLACED target must differ by a non-zero whole octave.', `${field}.targetMidi`);
    }
  }
  if (outcome.decisionType === 'OMITTED') {
    throw invalid('OMITTED decisions cannot produce retained note outcomes.', `${field}.disposition`);
  }
}

function validateArrangementCore(arrangement, field, sourceEvents, guitar, tuning) {
  assertExactDataFields(arrangement, ['arrangementId', 'decisions', 'noteOutcomes', 'selectedShapes', 'reviewNotesCode'], field);
  requireId(arrangement.arrangementId, `${field}.arrangementId`);
  if (arrangement.reviewNotesCode !== null) {
    throw invalid('Initial PA-11 core semantics accept reviewNotesCode=null only.', `${field}.reviewNotesCode`);
  }
  assertDenseNativeArray(arrangement.decisions, `${field}.decisions`, 1, MAX_DECISIONS_PER_ARRANGEMENT);
  const decisionById = new Map();
  const covered = new Set();
  for (let index = 0; index < arrangement.decisions.length; index += 1) {
    const decision = arrangement.decisions[index];
    const decisionField = `${field}.decisions[${index}]`;
    validateDecision(decision, decisionField, sourceEvents);
    if (decisionById.has(decision.decisionId)) {
      throw invalid('decisionId must be unique.', `${decisionField}.decisionId`);
    }
    for (const eventId of decision.sourceEventIds) {
      if (covered.has(eventId)) {
        throw invalid('Each source event must be covered by exactly one decision.', `${decisionField}.sourceEventIds`);
      }
      covered.add(eventId);
    }
    decisionById.set(decision.decisionId, decision);
  }
  if (covered.size !== sourceEvents.size) {
    throw invalid('Decisions must cover every sourceSelection event exactly once.', `${field}.decisions`);
  }

  assertDenseNativeArray(arrangement.noteOutcomes, `${field}.noteOutcomes`, sourceEvents.size, sourceEvents.size);
  const outcomeEvents = new Set();
  for (let index = 0; index < arrangement.noteOutcomes.length; index += 1) {
    const outcome = arrangement.noteOutcomes[index];
    const outcomeField = `${field}.noteOutcomes[${index}]`;
    validateOutcome(outcome, outcomeField, sourceEvents, decisionById, guitar, tuning);
    if (outcomeEvents.has(outcome.sourceEventId)) {
      throw invalid('Each source event must have exactly one noteOutcome.', `${outcomeField}.sourceEventId`);
    }
    outcomeEvents.add(outcome.sourceEventId);
  }
  if (outcomeEvents.size !== sourceEvents.size) {
    throw invalid('noteOutcomes must cover every sourceSelection event exactly once.', `${field}.noteOutcomes`);
  }

  assertDenseNativeArray(arrangement.selectedShapes, `${field}.selectedShapes`, 0, MAX_SHAPES_PER_ARRANGEMENT);
  for (let index = 0; index < arrangement.selectedShapes.length; index += 1) {
    if (!isPlainObject(arrangement.selectedShapes[index])) {
      throw invalid('selectedShapes entries must be non-proxy plain objects.', `${field}.selectedShapes[${index}]`);
    }
  }
}

function validateTeacherArrangementBenchmarkCoreSemantics(benchmark) {
  try {
    validateTeacherArrangementBenchmarkAdmission(benchmark);
  } catch (error) {
    throw invalid('Benchmark failed PA-11.3A admission before core semantic validation.', 'benchmark', {
      causeCode: error && error.code,
      causeField: error && error.details && error.details.field,
    });
  }
  const tuning = validateGuitar(benchmark.guitar);
  validatePhysicalPolicy(benchmark.physicalPolicy);
  for (let caseIndex = 0; caseIndex < benchmark.cases.length; caseIndex += 1) {
    const benchmarkCase = benchmark.cases[caseIndex];
    const caseField = `cases[${caseIndex}]`;
    const sourceEvents = validateSourceSelection(benchmarkCase.sourceSelection, caseField);
    for (let arrangementIndex = 0; arrangementIndex < benchmarkCase.acceptedArrangements.length; arrangementIndex += 1) {
      validateArrangementCore(
        benchmarkCase.acceptedArrangements[arrangementIndex],
        `${caseField}.acceptedArrangements[${arrangementIndex}]`,
        sourceEvents,
        benchmark.guitar,
        tuning,
      );
    }
  }
  return true;
}

module.exports = {
  TEACHER_ARRANGEMENT_BENCHMARK_CORE_SEMANTIC_VERSION,
  TeacherArrangementBenchmarkCoreSemanticError,
  validateTeacherArrangementBenchmarkCoreSemantics,
};
