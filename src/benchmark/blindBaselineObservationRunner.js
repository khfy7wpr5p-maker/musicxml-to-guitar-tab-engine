'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  createBlindBaselineEngineResult,
} = require('./blindBaselineEngineObserver');
const {
  createTeacherArrangementObservedOutput,
} = require('./independentObservedOutputProducer');

const BLIND_BASELINE_OBSERVATION_RUNNER_VERSION = '1.0.0';
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_CASES = 64;

class BlindBaselineObservationRunnerError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_BLIND_BASELINE_OBSERVATION_RUNNER',
      Object.freeze({ ...details }),
      'BlindBaselineObservationRunnerError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new BlindBaselineObservationRunnerError(message, { field, ...details });
}

function safePrototype(value, field) {
  try { return Object.getPrototypeOf(value); } catch { throw invalid(`${field} could not be inspected safely.`, field); }
}

function safeOwnKeys(value, field) {
  try { return Reflect.ownKeys(value); } catch { throw invalid(`${field} could not be inspected safely.`, field); }
}

function safeDescriptor(value, key, field) {
  try { return Object.getOwnPropertyDescriptor(value, key); } catch { throw invalid(`${field} could not be inspected safely.`, field); }
}

function readRecord(value, fields, field, seen) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
    || safePrototype(value, field) !== Object.prototype
  ) {
    throw invalid(`${field} must be a non-proxy plain object.`, field);
  }
  if (seen.has(value)) {
    throw invalid(`${field} must not contain cycles or shared references.`, field);
  }
  seen.add(value);

  const allowed = new Set(fields);
  const descriptors = {};
  for (const key of safeOwnKeys(value, field)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalid(`${field} contains an unknown or symbol field.`, field, {
        observedField: typeof key === 'string' ? key : '<symbol>',
      });
    }
    const descriptor = safeDescriptor(value, key, `${field}.${String(key)}`);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${field}.${String(key)} must be an enumerable data property.`, `${field}.${String(key)}`);
    }
    descriptors[key] = descriptor;
  }

  const result = {};
  for (const key of fields) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${field}.${key} is required.`, `${field}.${key}`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function readDenseArray(value, field, seen, minimum, maximum) {
  if (!Array.isArray(value) || isProxy(value) || safePrototype(value, field) !== Array.prototype) {
    throw invalid(`${field} must be a non-proxy native array.`, field);
  }
  if (seen.has(value)) {
    throw invalid(`${field} must not contain cycles or shared references.`, field);
  }
  seen.add(value);

  const lengthDescriptor = safeDescriptor(value, 'length', `${field}.length`);
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < minimum
    || lengthDescriptor.value > maximum
  ) {
    throw invalid(`${field} length is outside the allowed bound.`, field, { minimum, maximum });
  }
  const length = lengthDescriptor.value;

  for (const key of safeOwnKeys(value, field)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
      throw invalid(`${field} cannot contain custom or symbol fields.`, field);
    }
  }

  const result = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = safeDescriptor(value, String(index), `${field}[${index}]`);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${field} must be dense and accessor-free.`, `${field}[${index}]`);
    }
    result[index] = descriptor.value;
  }
  return result;
}

function boundedString(value, field, maximum = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw invalid(`${field} must be a bounded non-empty string.`, field, { maximum });
  }
  return value;
}

function readScope(value, seen) {
  const record = readRecord(value, ['benchmarkId', 'benchmarkVersion', 'caseIds'], 'input.evaluationScope', seen);
  const rawCaseIds = readDenseArray(record.caseIds, 'input.evaluationScope.caseIds', seen, 1, MAX_CASES);
  const caseIds = new Array(rawCaseIds.length);
  const unique = new Set();
  for (let index = 0; index < rawCaseIds.length; index += 1) {
    const caseId = boundedString(rawCaseIds[index], `input.evaluationScope.caseIds[${index}]`);
    if (unique.has(caseId)) {
      throw invalid('evaluationScope.caseIds must be unique.', `input.evaluationScope.caseIds[${index}]`, { caseId });
    }
    unique.add(caseId);
    caseIds[index] = caseId;
  }
  return {
    benchmarkId: boundedString(record.benchmarkId, 'input.evaluationScope.benchmarkId'),
    benchmarkVersion: boundedString(record.benchmarkVersion, 'input.evaluationScope.benchmarkVersion'),
    caseIds,
  };
}

function readSourceEntries(value, caseIds, seen) {
  const values = readDenseArray(value, 'input.sourceEntries', seen, caseIds.length, caseIds.length);
  const entries = new Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const field = `input.sourceEntries[${index}]`;
    const record = readRecord(values[index], ['caseId', 'sourceText'], field, seen);
    const caseId = boundedString(record.caseId, `${field}.caseId`);
    if (caseId !== caseIds[index]) {
      throw invalid('sourceEntries must preserve exact evaluation-scope order and identity.', `${field}.caseId`, {
        expectedCaseId: caseIds[index],
        observedCaseId: caseId,
      });
    }
    if (typeof record.sourceText !== 'string' || record.sourceText.length === 0) {
      throw invalid(`${field}.sourceText must be non-empty text.`, `${field}.sourceText`);
    }
    const byteLength = Buffer.byteLength(record.sourceText, 'utf8');
    if (byteLength > MAX_SOURCE_BYTES) {
      throw invalid(`${field}.sourceText exceeds the fixed byte limit.`, `${field}.sourceText`, {
        limit: MAX_SOURCE_BYTES,
        observed: byteLength,
      });
    }
    entries[index] = { caseId, sourceText: record.sourceText };
  }
  return entries;
}

function buildSourceModel(sourceText, caseId) {
  try {
    const runtime = createMusicXmlProcessingRuntime();
    const parsed = parseParsedMusicXmlDocument(sourceText, {}, runtime);
    return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
  } catch (error) {
    throw invalid('Blind baseline source could not be parsed/projected.', 'input.sourceEntries', {
      caseId,
      causeCode: error && error.code,
    });
  }
}

function produceBlindBaselineObservedOutput(input) {
  const seen = new WeakSet();
  const root = readRecord(input, ['evaluationScope', 'sourceEntries'], 'input', seen);
  const scope = readScope(root.evaluationScope, seen);
  const sourceEntries = readSourceEntries(root.sourceEntries, scope.caseIds, seen);

  const cases = sourceEntries.map((entry) => {
    const sourceModel = buildSourceModel(entry.sourceText, entry.caseId);
    return {
      caseId: entry.caseId,
      result: createBlindBaselineEngineResult(sourceModel),
    };
  });

  return createTeacherArrangementObservedOutput({
    documentType: 'IndependentEngineArrangementObservation',
    contractVersion: '1.0.0',
    evaluationScope: {
      benchmarkId: scope.benchmarkId,
      benchmarkVersion: scope.benchmarkVersion,
      caseIds: [...scope.caseIds],
    },
    cases,
  });
}

module.exports = {
  BLIND_BASELINE_OBSERVATION_RUNNER_VERSION,
  MAX_SOURCE_BYTES,
  BlindBaselineObservationRunnerError,
  produceBlindBaselineObservedOutput,
};
