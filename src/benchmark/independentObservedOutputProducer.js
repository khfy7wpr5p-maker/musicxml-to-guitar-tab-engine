'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');

const INDEPENDENT_ENGINE_ARRANGEMENT_OBSERVATION_VERSION = '1.0.0';
const TEACHER_ARRANGEMENT_OBSERVED_OUTPUT_VERSION = '1.0.0';

class IndependentObservedOutputProducerError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_INDEPENDENT_ENGINE_ARRANGEMENT_OBSERVATION',
      details,
      'IndependentObservedOutputProducerError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new IndependentObservedOutputProducerError(message, { field, ...details });
}

function safeOwnKeys(value, field) {
  try { return Reflect.ownKeys(value); } catch { throw invalid(`${field} could not be inspected safely.`, field); }
}

function safePrototype(value, field) {
  try { return Object.getPrototypeOf(value); } catch { throw invalid(`${field} could not be inspected safely.`, field); }
}

function safeDescriptor(value, key, field) {
  try { return Object.getOwnPropertyDescriptor(value, key); } catch { throw invalid(`${field} could not be inspected safely.`, field); }
}

function assertPlainRecord(value, fields, field, seen) {
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
    throw invalid(`${field} must not contain cycles or shared object references.`, field);
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
    throw invalid(`${field} must not contain cycles or shared object references.`, field);
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
      throw invalid(`${field} cannot contain custom or symbol properties.`, field);
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

function boundedInteger(value, field, minimum, maximum) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) {
    throw invalid(`${field} must be an integer inside the allowed bound.`, field, { minimum, maximum });
  }
  return value;
}

function readStringArray(value, field, seen, minimum, maximum) {
  const values = readDenseArray(value, field, seen, minimum, maximum);
  const result = new Array(values.length);
  const unique = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const item = boundedString(values[index], `${field}[${index}]`);
    if (unique.has(item)) {
      throw invalid(`${field} must contain unique strings.`, `${field}[${index}]`, { item });
    }
    unique.add(item);
    result[index] = item;
  }
  return result;
}

function readScope(value, seen) {
  const record = assertPlainRecord(
    value,
    ['benchmarkId', 'benchmarkVersion', 'caseIds'],
    'observation.evaluationScope',
    seen,
  );
  return {
    benchmarkId: boundedString(record.benchmarkId, 'observation.evaluationScope.benchmarkId'),
    benchmarkVersion: boundedString(record.benchmarkVersion, 'observation.evaluationScope.benchmarkVersion'),
    caseIds: readStringArray(record.caseIds, 'observation.evaluationScope.caseIds', seen, 1, 64),
  };
}

function readSourceOutcome(value, field, seen) {
  const record = assertPlainRecord(
    value,
    ['sourceEventId', 'sourceMidi', 'disposition', 'targetMidis'],
    field,
    seen,
  );
  if (record.disposition !== 'RETAINED' && record.disposition !== 'OMITTED') {
    throw invalid(`${field}.disposition must be RETAINED or OMITTED.`, `${field}.disposition`);
  }
  const targetMidis = readDenseArray(record.targetMidis, `${field}.targetMidis`, seen, 0, 6)
    .map((midi, index) => boundedInteger(midi, `${field}.targetMidis[${index}]`, 0, 127));
  if (
    (record.disposition === 'RETAINED' && targetMidis.length === 0)
    || (record.disposition === 'OMITTED' && targetMidis.length !== 0)
  ) {
    throw invalid(`${field}.disposition and targetMidis are inconsistent.`, `${field}.targetMidis`);
  }
  return {
    sourceEventId: boundedString(record.sourceEventId, `${field}.sourceEventId`),
    sourceMidi: boundedInteger(record.sourceMidi, `${field}.sourceMidi`, 0, 127),
    disposition: record.disposition,
    targetMidis,
  };
}

function readSelectedTone(value, field, seen) {
  const record = assertPlainRecord(
    value,
    ['sourceEventId', 'targetMidi', 'string', 'fret', 'finger'],
    field,
    seen,
  );
  const finger = record.finger === null ? null : boundedInteger(record.finger, `${field}.finger`, 0, 4);
  return {
    sourceEventId: boundedString(record.sourceEventId, `${field}.sourceEventId`),
    targetMidi: boundedInteger(record.targetMidi, `${field}.targetMidi`, 0, 127),
    string: boundedInteger(record.string, `${field}.string`, 1, 6),
    fret: boundedInteger(record.fret, `${field}.fret`, 0, 20),
    finger,
  };
}

function readBarre(value, field, seen) {
  const record = assertPlainRecord(
    value,
    ['finger', 'fret', 'startString', 'endString', 'stringSpan', 'kind'],
    field,
    seen,
  );
  if (record.kind !== 'PARTIAL_BARRE' && record.kind !== 'FULL_BARRE') {
    throw invalid(`${field}.kind must be PARTIAL_BARRE or FULL_BARRE.`, `${field}.kind`);
  }
  return {
    finger: boundedInteger(record.finger, `${field}.finger`, 1, 4),
    fret: boundedInteger(record.fret, `${field}.fret`, 1, 20),
    startString: boundedInteger(record.startString, `${field}.startString`, 1, 6),
    endString: boundedInteger(record.endString, `${field}.endString`, 1, 6),
    stringSpan: boundedInteger(record.stringSpan, `${field}.stringSpan`, 1, 6),
    kind: record.kind,
  };
}

function multisetKey(values) {
  return [...values].sort((left, right) => left - right).join(',');
}

function validateResultProvenance(result, field) {
  const outcomeBySource = new Map();
  for (const outcome of result.sourceOutcomes) {
    if (outcomeBySource.has(outcome.sourceEventId)) {
      throw invalid(
        `${field}.sourceOutcomes cannot contain duplicate sourceEventId values.`,
        `${field}.sourceOutcomes`,
        { sourceEventId: outcome.sourceEventId },
      );
    }
    outcomeBySource.set(outcome.sourceEventId, outcome);
  }

  const toneTargetsBySource = new Map();
  for (const tone of result.selectedTones) {
    if (!outcomeBySource.has(tone.sourceEventId)) {
      throw invalid(
        `${field}.selectedTones references a source event without a source outcome.`,
        `${field}.selectedTones`,
        { sourceEventId: tone.sourceEventId },
      );
    }
    let values = toneTargetsBySource.get(tone.sourceEventId);
    if (!values) {
      values = [];
      toneTargetsBySource.set(tone.sourceEventId, values);
    }
    values.push(tone.targetMidi);
  }

  for (const outcome of result.sourceOutcomes) {
    const observedTargets = toneTargetsBySource.get(outcome.sourceEventId) || [];
    if (multisetKey(observedTargets) !== multisetKey(outcome.targetMidis)) {
      throw invalid(
        `${field} source outcomes and selected tones disagree on target MIDI provenance.`,
        field,
        { sourceEventId: outcome.sourceEventId },
      );
    }
  }
}

function readEngineResult(value, field, seen) {
  if (value === null) return null;
  const record = assertPlainRecord(value, ['sourceOutcomes', 'selectedTones', 'barres'], field, seen);
  const sourceOutcomes = readDenseArray(record.sourceOutcomes, `${field}.sourceOutcomes`, seen, 1, 64)
    .map((entry, index) => readSourceOutcome(entry, `${field}.sourceOutcomes[${index}]`, seen));
  const selectedTones = readDenseArray(record.selectedTones, `${field}.selectedTones`, seen, 1, 6)
    .map((entry, index) => readSelectedTone(entry, `${field}.selectedTones[${index}]`, seen));
  const barres = readDenseArray(record.barres, `${field}.barres`, seen, 0, 4)
    .map((entry, index) => readBarre(entry, `${field}.barres[${index}]`, seen));

  const result = { sourceOutcomes, selectedTones, barres };
  validateResultProvenance(result, field);
  return result;
}

function readCases(value, seen) {
  const values = readDenseArray(value, 'observation.cases', seen, 1, 64);
  const result = new Array(values.length);
  const seenCaseIds = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const field = `observation.cases[${index}]`;
    const record = assertPlainRecord(values[index], ['caseId', 'result'], field, seen);
    const caseId = boundedString(record.caseId, `${field}.caseId`);
    if (seenCaseIds.has(caseId)) {
      throw invalid('observation.cases must contain unique caseId values.', `${field}.caseId`, { caseId });
    }
    seenCaseIds.add(caseId);
    result[index] = { caseId, result: readEngineResult(record.result, `${field}.result`, seen) };
  }
  return result;
}

function readObservation(value) {
  const seen = new WeakSet();
  const root = assertPlainRecord(
    value,
    ['documentType', 'contractVersion', 'evaluationScope', 'cases'],
    'observation',
    seen,
  );
  if (root.documentType !== 'IndependentEngineArrangementObservation') {
    throw invalid('observation.documentType is not supported.', 'observation.documentType');
  }
  if (root.contractVersion !== INDEPENDENT_ENGINE_ARRANGEMENT_OBSERVATION_VERSION) {
    throw invalid('observation.contractVersion is not supported.', 'observation.contractVersion');
  }
  return { scope: readScope(root.evaluationScope, seen), cases: readCases(root.cases, seen) };
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function createTeacherArrangementObservedOutput(observation) {
  const parsed = readObservation(observation);
  if (parsed.cases.length !== parsed.scope.caseIds.length) {
    throw invalid(
      'observation.cases must contain exactly one result entry per evaluation-scope case.',
      'observation.cases',
    );
  }

  const caseById = new Map(parsed.cases.map((entry) => [entry.caseId, entry]));
  for (const caseId of parsed.scope.caseIds) {
    if (!caseById.has(caseId)) {
      throw invalid('observation.cases is missing an evaluation-scope case.', 'observation.cases', { caseId });
    }
  }
  for (const caseId of caseById.keys()) {
    if (!parsed.scope.caseIds.includes(caseId)) {
      throw invalid('observation.cases contains a case outside the evaluation scope.', 'observation.cases', { caseId });
    }
  }

  const cases = parsed.scope.caseIds.map((caseId, caseIndex) => {
    const engineCase = caseById.get(caseId);
    if (engineCase.result === null) return { caseId, observedArrangement: null };

    return {
      caseId,
      observedArrangement: {
        sourceOutcomes: engineCase.result.sourceOutcomes.map((entry) => ({
          sourceEventId: entry.sourceEventId,
          sourceMidi: entry.sourceMidi,
          disposition: entry.disposition,
          targetMidis: [...entry.targetMidis],
        })),
        realizedTones: engineCase.result.selectedTones.map((tone, toneIndex) => ({
          realizedToneId: `engine-observation:${caseIndex}:tone:${toneIndex}`,
          sourceEventId: tone.sourceEventId,
          targetMidi: tone.targetMidi,
          string: tone.string,
          fret: tone.fret,
          finger: tone.finger,
        })),
        barres: engineCase.result.barres.map((barre) => ({ ...barre })),
      },
    };
  });

  return deepFreeze({
    documentType: 'TeacherArrangementObservedOutput',
    contractVersion: TEACHER_ARRANGEMENT_OBSERVED_OUTPUT_VERSION,
    benchmarkId: parsed.scope.benchmarkId,
    benchmarkVersion: parsed.scope.benchmarkVersion,
    cases,
  });
}

module.exports = {
  INDEPENDENT_ENGINE_ARRANGEMENT_OBSERVATION_VERSION,
  TEACHER_ARRANGEMENT_OBSERVED_OUTPUT_VERSION,
  IndependentObservedOutputProducerError,
  createTeacherArrangementObservedOutput,
};