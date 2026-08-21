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

function inspectRecord(value, fields, field, seen) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) {
    throw invalid(`${field} must be a non-proxy plain object.`, field);
  }
  let prototype;
  let keys;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid(`${field} could not be inspected safely.`, field);
  }
  if (prototype !== Object.prototype || seen.has(value)) {
    throw invalid(`${field} must be an unshared plain object.`, field);
  }
  seen.add(value);

  const allowed = new Set(fields);
  const result = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalid(`${field} contains an unknown or symbol field.`, field, {
        observedField: typeof key === 'string' ? key : '<symbol>',
      });
    }
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch {
      throw invalid(`${field}.${String(key)} could not be inspected safely.`, `${field}.${String(key)}`);
    }
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${field}.${String(key)} must be an enumerable data property.`, `${field}.${String(key)}`);
    }
    result[key] = descriptor.value;
  }
  for (const key of fields) {
    if (!Object.hasOwn(result, key)) {
      throw invalid(`${field}.${key} is required.`, `${field}.${key}`);
    }
  }
  return result;
}

function inspectArray(value, field, seen, minimum, maximum) {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalid(`${field} must be a non-proxy native array.`, field);
  }
  if (seen.has(value)) throw invalid(`${field} must not be shared or cyclic.`, field);
  seen.add(value);
  if (!Number.isSafeInteger(value.length) || value.length < minimum || value.length > maximum) {
    throw invalid(`${field} length is outside the allowed bound.`, field, { minimum, maximum });
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw invalid(`${field} cannot contain custom or symbol properties.`, field);
    }
  }
  return value.map((_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${field} must be dense and accessor-free.`, `${field}[${index}]`);
    }
    return descriptor.value;
  });
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
  const values = inspectArray(value, field, seen, minimum, maximum);
  const unique = new Set();
  return values.map((item, index) => {
    const normalized = boundedString(item, `${field}[${index}]`);
    if (unique.has(normalized)) throw invalid(`${field} must contain unique strings.`, `${field}[${index}]`);
    unique.add(normalized);
    return normalized;
  });
}

function readSourceOutcome(value, field, seen) {
  const record = inspectRecord(value, ['sourceEventId', 'sourceMidi', 'disposition', 'targetMidis'], field, seen);
  if (record.disposition !== 'RETAINED' && record.disposition !== 'OMITTED') {
    throw invalid(`${field}.disposition must be RETAINED or OMITTED.`, `${field}.disposition`);
  }
  const targetMidis = inspectArray(record.targetMidis, `${field}.targetMidis`, seen, 0, 6)
    .map((midi, index) => boundedInteger(midi, `${field}.targetMidis[${index}]`, 0, 127));
  if ((record.disposition === 'RETAINED' && targetMidis.length === 0)
      || (record.disposition === 'OMITTED' && targetMidis.length !== 0)) {
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
  const record = inspectRecord(value, ['sourceEventId', 'targetMidi', 'string', 'fret', 'finger'], field, seen);
  return {
    sourceEventId: boundedString(record.sourceEventId, `${field}.sourceEventId`),
    targetMidi: boundedInteger(record.targetMidi, `${field}.targetMidi`, 0, 127),
    string: boundedInteger(record.string, `${field}.string`, 1, 6),
    fret: boundedInteger(record.fret, `${field}.fret`, 0, 20),
    finger: record.finger === null ? null : boundedInteger(record.finger, `${field}.finger`, 0, 4),
  };
}

function readBarre(value, field, seen) {
  const record = inspectRecord(value, ['finger', 'fret', 'startString', 'endString', 'stringSpan', 'kind'], field, seen);
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

function readEngineResult(value, field, seen) {
  if (value === null) return null;
  const record = inspectRecord(value, ['sourceOutcomes', 'selectedTones', 'barres'], field, seen);
  const sourceOutcomes = inspectArray(record.sourceOutcomes, `${field}.sourceOutcomes`, seen, 1, 64)
    .map((entry, index) => readSourceOutcome(entry, `${field}.sourceOutcomes[${index}]`, seen));
  const selectedTones = inspectArray(record.selectedTones, `${field}.selectedTones`, seen, 1, 6)
    .map((entry, index) => readSelectedTone(entry, `${field}.selectedTones[${index}]`, seen));
  const barres = inspectArray(record.barres, `${field}.barres`, seen, 0, 4)
    .map((entry, index) => readBarre(entry, `${field}.barres[${index}]`, seen));

  const outcomeBySource = new Map();
  for (const outcome of sourceOutcomes) {
    if (outcomeBySource.has(outcome.sourceEventId)) {
      throw invalid(`${field}.sourceOutcomes cannot contain duplicate sourceEventId values.`, `${field}.sourceOutcomes`);
    }
    outcomeBySource.set(outcome.sourceEventId, outcome);
  }
  const tonesBySource = new Map();
  for (const tone of selectedTones) {
    if (!outcomeBySource.has(tone.sourceEventId)) {
      throw invalid(`${field}.selectedTones references an unknown source outcome.`, `${field}.selectedTones`);
    }
    const values = tonesBySource.get(tone.sourceEventId) || [];
    values.push(tone.targetMidi);
    tonesBySource.set(tone.sourceEventId, values);
  }
  for (const outcome of sourceOutcomes) {
    if (multisetKey(tonesBySource.get(outcome.sourceEventId) || []) !== multisetKey(outcome.targetMidis)) {
      throw invalid(`${field} source outcomes and selected tones disagree on target MIDI provenance.`, field, {
        sourceEventId: outcome.sourceEventId,
      });
    }
  }
  return { sourceOutcomes, selectedTones, barres };
}

function readObservation(value) {
  const seen = new WeakSet();
  const root = inspectRecord(value, ['documentType', 'contractVersion', 'evaluationScope', 'cases'], 'observation', seen);
  if (root.documentType !== 'IndependentEngineArrangementObservation') {
    throw invalid('observation.documentType is not supported.', 'observation.documentType');
  }
  if (root.contractVersion !== INDEPENDENT_ENGINE_ARRANGEMENT_OBSERVATION_VERSION) {
    throw invalid('observation.contractVersion is not supported.', 'observation.contractVersion');
  }
  const scopeRecord = inspectRecord(root.evaluationScope, ['benchmarkId', 'benchmarkVersion', 'caseIds'], 'observation.evaluationScope', seen);
  const scope = {
    benchmarkId: boundedString(scopeRecord.benchmarkId, 'observation.evaluationScope.benchmarkId'),
    benchmarkVersion: boundedString(scopeRecord.benchmarkVersion, 'observation.evaluationScope.benchmarkVersion'),
    caseIds: readStringArray(scopeRecord.caseIds, 'observation.evaluationScope.caseIds', seen, 1, 64),
  };
  const caseValues = inspectArray(root.cases, 'observation.cases', seen, 1, 64);
  const cases = [];
  const unique = new Set();
  for (let index = 0; index < caseValues.length; index += 1) {
    const field = `observation.cases[${index}]`;
    const record = inspectRecord(caseValues[index], ['caseId', 'result'], field, seen);
    const caseId = boundedString(record.caseId, `${field}.caseId`);
    if (unique.has(caseId)) throw invalid('observation.cases must contain unique caseId values.', `${field}.caseId`);
    unique.add(caseId);
    cases.push({ caseId, result: readEngineResult(record.result, `${field}.result`, seen) });
  }
  return { scope, cases };
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
    throw invalid('observation.cases must contain exactly one entry per evaluation-scope case.', 'observation.cases');
  }
  const byId = new Map(parsed.cases.map((entry) => [entry.caseId, entry]));
  for (const caseId of parsed.scope.caseIds) {
    if (!byId.has(caseId)) throw invalid('observation.cases is missing an evaluation-scope case.', 'observation.cases', { caseId });
  }
  for (const caseId of byId.keys()) {
    if (!parsed.scope.caseIds.includes(caseId)) throw invalid('observation.cases contains a case outside the evaluation scope.', 'observation.cases', { caseId });
  }

  const cases = parsed.scope.caseIds.map((caseId, caseIndex) => {
    const result = byId.get(caseId).result;
    if (result === null) return { caseId, observedArrangement: null };
    return {
      caseId,
      observedArrangement: {
        sourceOutcomes: result.sourceOutcomes.map((entry) => ({
          sourceEventId: entry.sourceEventId,
          sourceMidi: entry.sourceMidi,
          disposition: entry.disposition,
          targetMidis: [...entry.targetMidis],
        })),
        realizedTones: result.selectedTones.map((tone, toneIndex) => ({
          realizedToneId: `engine-observation:${caseIndex}:tone:${toneIndex}`,
          sourceEventId: tone.sourceEventId,
          targetMidi: tone.targetMidi,
          string: tone.string,
          fret: tone.fret,
          finger: tone.finger,
        })),
        barres: result.barres.map((barre) => ({ ...barre })),
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