'use strict';

const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  validateTeacherArrangementBenchmarkCoreSemantics,
} = require('./teacherArrangementBenchmarkCoreSemanticValidator');

const TEACHER_ARRANGEMENT_BENCHMARK_SHAPE_SEMANTIC_VERSION = '1.0.0';
const MAX_SHAPE_MEMBERS = 256;
const MAX_BARRES_PER_SHAPE = 4;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
const GROUP_ID_PATTERN = /^([A-Za-z0-9._-]{1,64}):measure:(\d+):simultaneous:(\d+)$/;

class TeacherArrangementBenchmarkShapeSemanticError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_SHAPE_SEMANTICS',
      details,
      'TeacherArrangementBenchmarkShapeSemanticError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkShapeSemanticError(message, { field, ...details });
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
    if (error instanceof TeacherArrangementBenchmarkShapeSemanticError) {
      throw error;
    }
    throw invalid('Array prototype could not be inspected safely.', field);
  }
  if (value.length < min || value.length > max) {
    throw invalid(`${field} length is outside the shape semantic boundary.`, field, {
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

function sameSequence(actual, expected) {
  if (actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function validateShapeGroupIdentity(shape, field, sourceSelection) {
  const groupId = requireId(shape.sourceGroupId, `${field}.sourceGroupId`, GROUP_ID_PATTERN);
  const match = GROUP_ID_PATTERN.exec(groupId);
  if (match[1] !== sourceSelection.partId || Number(match[2]) !== sourceSelection.measureIndex) {
    throw invalid('Selected shape group identity must match sourceSelection.', `${field}.sourceGroupId`);
  }
}

function validatePositionRecord(position, field, outcome) {
  assertExactDataFields(position, ['sourceEventId', 'targetMidi', 'string', 'fret'], field);
  requireId(position.sourceEventId, `${field}.sourceEventId`);
  requireInteger(position.targetMidi, `${field}.targetMidi`, 0, 127);
  requireInteger(position.string, `${field}.string`, 1, 6);
  requireInteger(position.fret, `${field}.fret`, 0, 36);
  if (
    position.sourceEventId !== outcome.sourceEventId
    || position.targetMidi !== outcome.targetMidi
    || position.string !== outcome.selectedPosition.string
    || position.fret !== outcome.selectedPosition.fret
  ) {
    throw invalid('Shape position must exactly match its retained note outcome.', field);
  }
}

function validateFingerAssignment(assignment, field, position) {
  assertExactDataFields(
    assignment,
    ['sourceEventId', 'targetMidi', 'string', 'fret', 'finger'],
    field,
  );
  requireId(assignment.sourceEventId, `${field}.sourceEventId`);
  requireInteger(assignment.targetMidi, `${field}.targetMidi`, 0, 127);
  requireInteger(assignment.string, `${field}.string`, 1, 6);
  requireInteger(assignment.fret, `${field}.fret`, 0, 36);
  if (
    assignment.sourceEventId !== position.sourceEventId
    || assignment.targetMidi !== position.targetMidi
    || assignment.string !== position.string
    || assignment.fret !== position.fret
  ) {
    throw invalid('Finger assignment must exactly match its shape position.', field);
  }
  if (assignment.fret === 0) {
    if (assignment.finger !== 0) {
      throw invalid('Open-string positions require finger 0.', `${field}.finger`);
    }
  } else {
    requireInteger(assignment.finger, `${field}.finger`, 1, 4);
  }
}

function validateOrderedFrettingFingers(fingerAssignments, field) {
  for (let leftIndex = 0; leftIndex < fingerAssignments.length; leftIndex += 1) {
    const left = fingerAssignments[leftIndex];
    if (left.fret === 0) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < fingerAssignments.length; rightIndex += 1) {
      const right = fingerAssignments[rightIndex];
      if (right.fret === 0 || right.fret === left.fret) {
        continue;
      }
      const lower = left.fret < right.fret ? left : right;
      const higher = left.fret < right.fret ? right : left;
      if (lower.finger >= higher.finger) {
        throw invalid(
          'Across different frets, lower frets must use lower-numbered fingers.',
          `${field}.fingerAssignments`,
        );
      }
    }
  }
}

function deriveBarres(fingerAssignments, positions, field) {
  const fingerFret = new Map();
  const groups = new Map();
  const assignmentByString = new Map();

  for (let index = 0; index < fingerAssignments.length; index += 1) {
    const assignment = fingerAssignments[index];
    assignmentByString.set(assignment.string, assignment);
    if (assignment.finger === 0) {
      continue;
    }
    if (fingerFret.has(assignment.finger) && fingerFret.get(assignment.finger) !== assignment.fret) {
      throw invalid(
        'One fretting finger may not be assigned to multiple frets in one shape.',
        `${field}.fingerAssignments[${index}].finger`,
      );
    }
    fingerFret.set(assignment.finger, assignment.fret);
    const key = `${assignment.finger}:${assignment.fret}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(assignment.string);
  }

  const derived = [];
  for (const [key, strings] of groups) {
    if (strings.length < 2) {
      continue;
    }
    const [fingerText, fretText] = key.split(':');
    const finger = Number(fingerText);
    const fret = Number(fretText);
    const startString = Math.min(...strings);
    const endString = Math.max(...strings);

    for (const position of positions) {
      if (position.string < startString || position.string > endString) {
        continue;
      }
      const activeAssignment = assignmentByString.get(position.string);
      if (position.fret < fret) {
        throw invalid('Derived barre would alter an active lower-fret/open pitch.', `${field}.barres`);
      }
      if (
        position.fret === fret
        && (!activeAssignment || activeAssignment.finger !== finger)
      ) {
        throw invalid('Same-fret pitch inside a barre span must use the barre finger.', `${field}.barres`);
      }
    }

    derived.push({
      finger,
      fret,
      startString,
      endString,
      stringSpan: endString - startString + 1,
      kind: startString === 1 && endString === 6 ? 'FULL_BARRE' : 'PARTIAL_BARRE',
    });
  }

  derived.sort((left, right) => (
    left.finger - right.finger
    || left.fret - right.fret
    || left.startString - right.startString
    || left.endString - right.endString
  ));
  return derived;
}

function validateProvidedBarres(barres, field, derived) {
  assertDenseNativeArray(barres, field, 0, MAX_BARRES_PER_SHAPE);
  if (barres.length !== derived.length) {
    throw invalid('Stored barre count must equal deterministic finger-derived barre count.', field);
  }
  for (let index = 0; index < barres.length; index += 1) {
    const barreField = `${field}[${index}]`;
    const barre = barres[index];
    assertExactDataFields(
      barre,
      ['finger', 'fret', 'startString', 'endString', 'stringSpan', 'kind'],
      barreField,
    );
    requireInteger(barre.finger, `${barreField}.finger`, 1, 4);
    requireInteger(barre.fret, `${barreField}.fret`, 1, 36);
    requireInteger(barre.startString, `${barreField}.startString`, 1, 6);
    requireInteger(barre.endString, `${barreField}.endString`, barre.startString, 6);
    requireInteger(barre.stringSpan, `${barreField}.stringSpan`, 1, 6);
    if (barre.kind !== 'PARTIAL_BARRE' && barre.kind !== 'FULL_BARRE') {
      throw invalid('Unsupported barre kind.', `${barreField}.kind`);
    }
    const expected = derived[index];
    if (
      barre.finger !== expected.finger
      || barre.fret !== expected.fret
      || barre.startString !== expected.startString
      || barre.endString !== expected.endString
      || barre.stringSpan !== expected.stringSpan
      || barre.kind !== expected.kind
    ) {
      throw invalid('Stored barre must exactly equal deterministic finger-derived barre facts.', barreField);
    }
  }
}

function validateShape(shape, field, sourceSelection, expectedOutcomes) {
  assertExactDataFields(
    shape,
    [
      'shapeId',
      'sourceGroupId',
      'sourceEventIds',
      'positions',
      'fingerAssignments',
      'barres',
      'physicalStatus',
    ],
    field,
  );
  requireId(shape.shapeId, `${field}.shapeId`);
  validateShapeGroupIdentity(shape, field, sourceSelection);
  if (shape.physicalStatus !== 'PLAYABLE_WITHIN_POLICY') {
    throw invalid('Accepted benchmark selected shapes must be PLAYABLE_WITHIN_POLICY.', `${field}.physicalStatus`);
  }
  if (expectedOutcomes.length < 2) {
    throw invalid('A multi-note selected shape requires at least two retained members.', `${field}.sourceEventIds`);
  }

  assertDenseNativeArray(shape.sourceEventIds, `${field}.sourceEventIds`, 2, MAX_SHAPE_MEMBERS);
  const expectedEventIds = expectedOutcomes.map((outcome) => outcome.sourceEventId);
  if (!sameSequence(shape.sourceEventIds, expectedEventIds)) {
    throw invalid('Selected shape membership/order must exactly match referencing retained outcomes.', `${field}.sourceEventIds`);
  }

  assertDenseNativeArray(shape.positions, `${field}.positions`, expectedOutcomes.length, expectedOutcomes.length);
  const strings = new Set();
  for (let index = 0; index < shape.positions.length; index += 1) {
    validatePositionRecord(shape.positions[index], `${field}.positions[${index}]`, expectedOutcomes[index]);
    if (strings.has(shape.positions[index].string)) {
      throw invalid('Selected shape positions must use distinct strings.', `${field}.positions[${index}].string`);
    }
    strings.add(shape.positions[index].string);
  }

  assertDenseNativeArray(
    shape.fingerAssignments,
    `${field}.fingerAssignments`,
    expectedOutcomes.length,
    expectedOutcomes.length,
  );
  for (let index = 0; index < shape.fingerAssignments.length; index += 1) {
    validateFingerAssignment(
      shape.fingerAssignments[index],
      `${field}.fingerAssignments[${index}]`,
      shape.positions[index],
    );
  }
  validateOrderedFrettingFingers(shape.fingerAssignments, field);

  const derivedBarres = deriveBarres(shape.fingerAssignments, shape.positions, field);
  validateProvidedBarres(shape.barres, `${field}.barres`, derivedBarres);
}

function validateArrangementShapes(arrangement, field, sourceSelection) {
  const retained = arrangement.noteOutcomes.filter((outcome) => outcome.disposition === 'RETAINED');
  const shapeById = new Map();

  for (let index = 0; index < arrangement.selectedShapes.length; index += 1) {
    const shape = arrangement.selectedShapes[index];
    const shapeField = `${field}.selectedShapes[${index}]`;
    if (!isPlainObject(shape)) {
      throw invalid('selectedShapes entries must be non-proxy plain objects.', shapeField);
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(shape, 'shapeId');
    } catch {
      throw invalid('shapeId descriptor could not be inspected safely.', `${shapeField}.shapeId`);
    }
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('selected shape requires an enumerable shapeId data field.', `${shapeField}.shapeId`);
    }
    const shapeId = requireId(descriptor.value, `${shapeField}.shapeId`);
    if (shapeById.has(shapeId)) {
      throw invalid('shapeId must be unique inside one accepted arrangement.', `${shapeField}.shapeId`);
    }
    shapeById.set(shapeId, { shape, field: shapeField });
  }

  for (let index = 0; index < retained.length; index += 1) {
    const outcome = retained[index];
    if (outcome.selectedShapeId !== null && !shapeById.has(outcome.selectedShapeId)) {
      throw invalid(
        'Retained outcome selectedShapeId must reference an existing selected shape.',
        `${field}.noteOutcomes[${arrangement.noteOutcomes.indexOf(outcome)}].selectedShapeId`,
      );
    }
  }

  for (const [shapeId, entry] of shapeById) {
    const expectedOutcomes = retained.filter((outcome) => outcome.selectedShapeId === shapeId);
    validateShape(entry.shape, entry.field, sourceSelection, expectedOutcomes);
  }
}

function validateTeacherArrangementBenchmarkShapeSemantics(benchmark) {
  try {
    validateTeacherArrangementBenchmarkCoreSemantics(benchmark);
  } catch (error) {
    throw invalid(
      'Benchmark failed PA-11.3B core semantics before shape semantic validation.',
      'benchmark',
      {
        causeCode: error && error.code,
        causeField: error && error.details && error.details.field,
      },
    );
  }

  for (let caseIndex = 0; caseIndex < benchmark.cases.length; caseIndex += 1) {
    const benchmarkCase = benchmark.cases[caseIndex];
    const caseField = `cases[${caseIndex}]`;
    for (
      let arrangementIndex = 0;
      arrangementIndex < benchmarkCase.acceptedArrangements.length;
      arrangementIndex += 1
    ) {
      validateArrangementShapes(
        benchmarkCase.acceptedArrangements[arrangementIndex],
        `${caseField}.acceptedArrangements[${arrangementIndex}]`,
        benchmarkCase.sourceSelection,
      );
    }
  }
  return true;
}

module.exports = {
  TEACHER_ARRANGEMENT_BENCHMARK_SHAPE_SEMANTIC_VERSION,
  TeacherArrangementBenchmarkShapeSemanticError,
  validateTeacherArrangementBenchmarkShapeSemantics,
};
