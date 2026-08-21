'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { validatePosition } = require('../guitar/playability');
const {
  TeacherArrangementBenchmarkV11RuntimeReplayError,
  replayRealizedVoicingShapeEvaluation,
  replayTeacherApprovedV11BenchmarkRuntime,
} = require('./teacherArrangementBenchmarkV11RuntimeReplay');

const TEACHER_ARRANGEMENT_OBSERVED_OUTPUT_VERSION = '1.0.0';
const TEACHER_ARRANGEMENT_SCORE_REPORT_VERSION = '1.0.0';
const MATCH_CLASSIFICATION = Object.freeze({
  PREFERRED_MATCH: 'PREFERRED_MATCH',
  ACCEPTABLE_MATCH: 'ACCEPTABLE_MATCH',
  PHYSICALLY_VALID_NOT_APPROVED: 'PHYSICALLY_VALID_NOT_APPROVED',
  INVALID: 'INVALID',
  UNMATCHED: 'UNMATCHED',
});

class TeacherArrangementObservedOutputError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_OBSERVED_OUTPUT',
      details,
      'TeacherArrangementObservedOutputError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementObservedOutputError(message, { field, ...details });
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

function readRecord(value, fields, field, seen) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) {
    throw invalid(`${field} must be a non-proxy plain object.`, field);
  }
  let prototype;
  let keys;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw invalid(`${field} could not be inspected safely.`, field);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid(`${field} must be a plain object.`, field);
  }
  if (seen.has(value)) {
    throw invalid(`${field} must not contain cycles or shared object references.`, field);
  }
  seen.add(value);

  const allowed = new Set(fields);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalid(`${field} contains an unknown or symbol field.`, field, {
        observedField: typeof key === 'string' ? key : '<symbol>',
      });
    }
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${field}.${key} must be an enumerable data property.`, `${field}.${key}`);
    }
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

function readArray(value, field, seen, minimum, maximum) {
  if (!Array.isArray(value) || isProxy(value)) {
    throw invalid(`${field} must be a non-proxy array.`, field);
  }
  let prototype;
  let keys;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid(`${field} could not be inspected safely.`, field);
  }
  if (prototype !== Array.prototype) {
    throw invalid(`${field} must be a native array.`, field);
  }
  if (seen.has(value)) {
    throw invalid(`${field} must not contain cycles or shared object references.`, field);
  }
  seen.add(value);
  if (!Number.isSafeInteger(value.length) || value.length < minimum || value.length > maximum) {
    throw invalid(`${field} length is outside the allowed bound.`, field, {
      minimum,
      maximum,
      observed: value.length,
    });
  }
  for (const key of keys) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw invalid(`${field} cannot contain custom or symbol properties.`, field);
    }
  }
  const result = new Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
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

function readSourceOutcome(value, field, seen) {
  const record = readRecord(
    value,
    ['sourceEventId', 'sourceMidi', 'disposition', 'targetMidis'],
    field,
    seen,
  );
  const targetValues = readArray(record.targetMidis, `${field}.targetMidis`, seen, 0, 6)
    .map((midi, index) => boundedInteger(midi, `${field}.targetMidis[${index}]`, 0, 127));
  if (record.disposition !== 'RETAINED' && record.disposition !== 'OMITTED') {
    throw invalid(`${field}.disposition must be RETAINED or OMITTED.`, `${field}.disposition`);
  }
  return {
    sourceEventId: boundedString(record.sourceEventId, `${field}.sourceEventId`),
    sourceMidi: boundedInteger(record.sourceMidi, `${field}.sourceMidi`, 0, 127),
    disposition: record.disposition,
    targetMidis: targetValues,
  };
}

function readRealizedTone(value, field, seen) {
  const record = readRecord(
    value,
    ['realizedToneId', 'sourceEventId', 'targetMidi', 'string', 'fret', 'finger'],
    field,
    seen,
  );
  const finger = record.finger === null
    ? null
    : boundedInteger(record.finger, `${field}.finger`, 0, 4);
  return {
    realizedToneId: boundedString(record.realizedToneId, `${field}.realizedToneId`, 128),
    sourceEventId: boundedString(record.sourceEventId, `${field}.sourceEventId`),
    targetMidi: boundedInteger(record.targetMidi, `${field}.targetMidi`, 0, 127),
    string: boundedInteger(record.string, `${field}.string`, 1, 6),
    fret: boundedInteger(record.fret, `${field}.fret`, 0, 20),
    finger,
  };
}

function readBarre(value, field, seen) {
  const record = readRecord(
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

function readObservedArrangement(value, field, seen) {
  if (value === null) return null;
  const record = readRecord(value, ['sourceOutcomes', 'realizedTones', 'barres'], field, seen);
  const sourceOutcomes = readArray(record.sourceOutcomes, `${field}.sourceOutcomes`, seen, 1, 64)
    .map((entry, index) => readSourceOutcome(entry, `${field}.sourceOutcomes[${index}]`, seen));
  const realizedTones = readArray(record.realizedTones, `${field}.realizedTones`, seen, 1, 6)
    .map((entry, index) => readRealizedTone(entry, `${field}.realizedTones[${index}]`, seen));
  const barres = readArray(record.barres, `${field}.barres`, seen, 0, 4)
    .map((entry, index) => readBarre(entry, `${field}.barres[${index}]`, seen));
  return { sourceOutcomes, realizedTones, barres };
}

function readObservedOutput(value) {
  const seen = new WeakSet();
  const root = readRecord(
    value,
    ['documentType', 'contractVersion', 'benchmarkId', 'benchmarkVersion', 'cases'],
    'observedOutput',
    seen,
  );
  if (root.documentType !== 'TeacherArrangementObservedOutput') {
    throw invalid('observedOutput.documentType is not supported.', 'observedOutput.documentType');
  }
  if (root.contractVersion !== TEACHER_ARRANGEMENT_OBSERVED_OUTPUT_VERSION) {
    throw invalid('observedOutput.contractVersion is not supported.', 'observedOutput.contractVersion');
  }
  const caseValues = readArray(root.cases, 'observedOutput.cases', seen, 1, 64);
  const cases = caseValues.map((entry, index) => {
    const record = readRecord(entry, ['caseId', 'observedArrangement'], `observedOutput.cases[${index}]`, seen);
    return {
      caseId: boundedString(record.caseId, `observedOutput.cases[${index}].caseId`),
      observedArrangement: readObservedArrangement(
        record.observedArrangement,
        `observedOutput.cases[${index}].observedArrangement`,
        seen,
      ),
    };
  });
  return {
    documentType: root.documentType,
    contractVersion: root.contractVersion,
    benchmarkId: boundedString(root.benchmarkId, 'observedOutput.benchmarkId'),
    benchmarkVersion: boundedString(root.benchmarkVersion, 'observedOutput.benchmarkVersion'),
    cases,
  };
}

function sortedNumbers(values) {
  return [...values].sort((left, right) => left - right);
}

function normalizeSignature(data, sourceEventIds) {
  const sourceOrder = new Map(sourceEventIds.map((sourceEventId, index) => [sourceEventId, index]));
  const sourceOutcomes = data.sourceOutcomes.map((entry) => ({
    sourceEventId: entry.sourceEventId,
    sourceMidi: entry.sourceMidi,
    disposition: entry.disposition,
    targetMidis: sortedNumbers(entry.targetMidis),
  })).sort((left, right) => sourceOrder.get(left.sourceEventId) - sourceOrder.get(right.sourceEventId));

  const realizedTones = data.realizedTones.map((tone) => ({
    sourceEventId: tone.sourceEventId,
    targetMidi: tone.targetMidi,
    string: tone.string,
    fret: tone.fret,
    finger: tone.finger,
  })).sort((left, right) => (
    right.string - left.string
    || left.targetMidi - right.targetMidi
    || sourceOrder.get(left.sourceEventId) - sourceOrder.get(right.sourceEventId)
  ));

  const barres = data.barres.map((barre) => ({ ...barre })).sort((left, right) => (
    left.fret - right.fret
    || left.finger - right.finger
    || left.startString - right.startString
    || left.endString - right.endString
  ));

  return { sourceOutcomes, realizedTones, barres };
}

function signatureKey(signature) {
  return JSON.stringify(signature);
}

function sourceMidiMapFromBaselineCase(baselineCase) {
  const first = baselineCase && baselineCase.acceptedArrangements && baselineCase.acceptedArrangements[0];
  if (!first || !Array.isArray(first.noteOutcomes)) {
    throw invalid('Bound baseline case does not expose source MIDI truth.', 'baselineText');
  }
  return new Map(first.noteOutcomes.map((outcome) => [outcome.sourceEventId, outcome.sourceMidi]));
}

function baselineGoldSignature(reference, baselineCase, sourceEventIds) {
  const arrangement = baselineCase.acceptedArrangements.find(
    (candidate) => candidate.arrangementId === reference.baselineArrangementId,
  );
  if (!arrangement) {
    throw invalid('Approved baseline reference cannot be resolved.', 'benchmarkText', {
      baselineArrangementId: reference.baselineArrangementId,
    });
  }

  const fingerBySourceEventId = new Map();
  const barres = [];
  for (const shape of arrangement.selectedShapes) {
    for (const assignment of shape.fingerAssignments) {
      fingerBySourceEventId.set(assignment.sourceEventId, assignment.finger);
    }
    barres.push(...shape.barres);
  }

  const sourceOutcomes = arrangement.noteOutcomes.map((outcome) => ({
    sourceEventId: outcome.sourceEventId,
    sourceMidi: outcome.sourceMidi,
    disposition: outcome.disposition === 'OMITTED' ? 'OMITTED' : 'RETAINED',
    targetMidis: outcome.disposition === 'OMITTED' ? [] : [outcome.targetMidi],
  }));
  const realizedTones = arrangement.noteOutcomes
    .filter((outcome) => outcome.disposition !== 'OMITTED')
    .map((outcome) => ({
      sourceEventId: outcome.sourceEventId,
      targetMidi: outcome.targetMidi,
      string: outcome.selectedPosition.string,
      fret: outcome.selectedPosition.fret,
      finger: fingerBySourceEventId.has(outcome.sourceEventId)
        ? fingerBySourceEventId.get(outcome.sourceEventId)
        : null,
    }));

  return normalizeSignature({ sourceOutcomes, realizedTones, barres }, sourceEventIds);
}

function realizedGoldSignature(arrangement, sourceEventIds) {
  const toneById = new Map(arrangement.realizedTones.map((tone) => [tone.realizedToneId, tone]));
  const sourceOutcomes = arrangement.sourceMappings.map((mapping) => ({
    sourceEventId: mapping.sourceEventId,
    sourceMidi: mapping.sourceMidi,
    disposition: 'RETAINED',
    targetMidis: mapping.realizedToneIds.map((realizedToneId) => toneById.get(realizedToneId).targetMidi),
  }));
  return normalizeSignature({
    sourceOutcomes,
    realizedTones: arrangement.realizedTones,
    barres: arrangement.selectedShape.barres,
  }, sourceEventIds);
}

function buildGoldCase(benchmarkCase, baselineCase) {
  const sourceEventIds = benchmarkCase.sourceSelection.sourceEventIds;
  const accepted = benchmarkCase.acceptedArrangements.map((arrangement) => ({
    arrangementId: arrangement.arrangementId,
    signature: arrangement.arrangementMode === 'BASELINE_REFERENCE'
      ? baselineGoldSignature(arrangement, baselineCase, sourceEventIds)
      : realizedGoldSignature(arrangement, sourceEventIds),
  }));
  return {
    caseId: benchmarkCase.caseId,
    sourceEventIds,
    sourceMidis: sourceMidiMapFromBaselineCase(baselineCase),
    preferredArrangementId: benchmarkCase.preferredArrangementId,
    accepted,
  };
}

function multisetKey(values) {
  return sortedNumbers(values).join(',');
}

function analyzeObservedArrangement(arrangement, goldCase) {
  const reasonCodes = [];
  const expectedIds = goldCase.sourceEventIds;
  const expectedSet = new Set(expectedIds);
  const outcomeBySource = new Map();

  if (arrangement.sourceOutcomes.length !== expectedIds.length) {
    reasonCodes.push('SOURCE_OUTCOME_COUNT_MISMATCH');
  }
  for (const outcome of arrangement.sourceOutcomes) {
    if (!expectedSet.has(outcome.sourceEventId) || outcomeBySource.has(outcome.sourceEventId)) {
      reasonCodes.push('SOURCE_OUTCOME_COVERAGE_MISMATCH');
      continue;
    }
    outcomeBySource.set(outcome.sourceEventId, outcome);
    if (goldCase.sourceMidis.get(outcome.sourceEventId) !== outcome.sourceMidi) {
      reasonCodes.push('SOURCE_MIDI_MISMATCH');
    }
    if (
      (outcome.disposition === 'RETAINED' && outcome.targetMidis.length === 0)
      || (outcome.disposition === 'OMITTED' && outcome.targetMidis.length !== 0)
    ) {
      reasonCodes.push('DISPOSITION_TARGET_MISMATCH');
    }
  }
  for (const sourceEventId of expectedIds) {
    if (!outcomeBySource.has(sourceEventId)) reasonCodes.push('SOURCE_OUTCOME_COVERAGE_MISMATCH');
  }

  const usedToneIds = new Set();
  const usedStrings = new Set();
  const targetMidisBySource = new Map(expectedIds.map((sourceEventId) => [sourceEventId, []]));
  for (const tone of arrangement.realizedTones) {
    if (usedToneIds.has(tone.realizedToneId)) reasonCodes.push('DUPLICATE_REALIZED_TONE_ID');
    usedToneIds.add(tone.realizedToneId);
    if (usedStrings.has(tone.string)) reasonCodes.push('DUPLICATE_GUITAR_STRING');
    usedStrings.add(tone.string);
    if (!expectedSet.has(tone.sourceEventId)) {
      reasonCodes.push('UNKNOWN_TONE_SOURCE_EVENT');
      continue;
    }
    targetMidisBySource.get(tone.sourceEventId).push(tone.targetMidi);
    if (arrangement.realizedTones.length > 1 && tone.finger === null) {
      reasonCodes.push('MULTI_TONE_FINGER_REQUIRED');
    }
    if (tone.finger !== null) {
      if (tone.fret === 0 && tone.finger !== 0) reasonCodes.push('OPEN_STRING_FINGER_MISMATCH');
      if (tone.fret > 0 && (tone.finger < 1 || tone.finger > 4)) reasonCodes.push('FRETTED_FINGER_MISMATCH');
    }
  }

  for (const sourceEventId of expectedIds) {
    const outcome = outcomeBySource.get(sourceEventId);
    if (!outcome) continue;
    if (multisetKey(targetMidisBySource.get(sourceEventId)) !== multisetKey(outcome.targetMidis)) {
      reasonCodes.push('SOURCE_TARGET_TONE_MISMATCH');
    }
  }

  if (reasonCodes.length > 0) {
    return { valid: false, reasonCodes: [...new Set(reasonCodes)] };
  }

  try {
    if (arrangement.realizedTones.length === 1) {
      const tone = arrangement.realizedTones[0];
      if (arrangement.barres.length !== 0) {
        return { valid: false, reasonCodes: ['SINGLE_TONE_BARRE_NOT_ALLOWED'] };
      }
      validatePosition({ string: tone.string, fret: tone.fret }, tone.targetMidi);
    } else {
      replayRealizedVoicingShapeEvaluation({
        arrangementMode: 'REALIZED_VOICING',
        realizedTones: arrangement.realizedTones,
        selectedShape: { barres: arrangement.barres },
      });
    }
  } catch (error) {
    return {
      valid: false,
      reasonCodes: ['PHYSICAL_REPLAY_REJECTED'],
      causeCode: error && error.code,
    };
  }

  return {
    valid: true,
    signature: normalizeSignature(arrangement, expectedIds),
  };
}

function evaluateCase(observedCase, goldCase) {
  if (observedCase.observedArrangement === null) {
    return {
      caseId: goldCase.caseId,
      classification: MATCH_CLASSIFICATION.UNMATCHED,
      matchedArrangementId: null,
      reasonCodes: ['NO_OBSERVED_ARRANGEMENT'],
    };
  }

  const analysis = analyzeObservedArrangement(observedCase.observedArrangement, goldCase);
  if (!analysis.valid) {
    return {
      caseId: goldCase.caseId,
      classification: MATCH_CLASSIFICATION.INVALID,
      matchedArrangementId: null,
      reasonCodes: analysis.reasonCodes,
    };
  }

  const observedKey = signatureKey(analysis.signature);
  const match = goldCase.accepted.find((candidate) => signatureKey(candidate.signature) === observedKey);
  if (!match) {
    return {
      caseId: goldCase.caseId,
      classification: MATCH_CLASSIFICATION.PHYSICALLY_VALID_NOT_APPROVED,
      matchedArrangementId: null,
      reasonCodes: [],
    };
  }

  const preferred = goldCase.preferredArrangementId !== null
    && match.arrangementId === goldCase.preferredArrangementId;
  return {
    caseId: goldCase.caseId,
    classification: preferred
      ? MATCH_CLASSIFICATION.PREFERRED_MATCH
      : MATCH_CLASSIFICATION.ACCEPTABLE_MATCH,
    matchedArrangementId: match.arrangementId,
    reasonCodes: [],
  };
}

function evaluateTeacherApprovedV11ObservedOutput(input) {
  const inputSeen = new WeakSet();
  const fields = readRecord(
    input,
    ['benchmarkText', 'approvalText', 'baselineText', 'reviewText', 'sourceEntries', 'observedOutput'],
    'input',
    inputSeen,
  );
  for (const textField of ['benchmarkText', 'approvalText', 'baselineText', 'reviewText']) {
    if (typeof fields[textField] !== 'string' || fields[textField].length === 0) {
      throw invalid(`${textField} must be non-empty text.`, `input.${textField}`);
    }
  }

  let runtimeEvidence;
  try {
    runtimeEvidence = replayTeacherApprovedV11BenchmarkRuntime({
      benchmarkText: fields.benchmarkText,
      approvalText: fields.approvalText,
      baselineText: fields.baselineText,
      reviewText: fields.reviewText,
      sourceEntries: fields.sourceEntries,
    });
  } catch (error) {
    throw invalid('Teacher-approved benchmark failed PA-11.3H before scoring.', 'input', {
      causeCode: error && error.code,
    });
  }

  let benchmark;
  let baseline;
  try {
    benchmark = JSON.parse(fields.benchmarkText);
    baseline = JSON.parse(fields.baselineText);
  } catch {
    throw invalid('Bound benchmark JSON could not be parsed after runtime admission.', 'input');
  }
  const observed = readObservedOutput(fields.observedOutput);
  if (
    observed.benchmarkId !== benchmark.benchmarkId
    || observed.benchmarkVersion !== benchmark.benchmarkVersion
  ) {
    throw invalid('Observed output is not scoped to the exact approved benchmark identity.', 'observedOutput');
  }
  if (observed.cases.length !== benchmark.cases.length) {
    throw invalid('Observed output must contain exactly one case entry per benchmark case.', 'observedOutput.cases');
  }

  const baselineByCase = new Map(baseline.cases.map((entry) => [entry.caseId, entry]));
  const caseReports = new Array(benchmark.cases.length);
  for (let index = 0; index < benchmark.cases.length; index += 1) {
    const benchmarkCase = benchmark.cases[index];
    const observedCase = observed.cases[index];
    if (observedCase.caseId !== benchmarkCase.caseId) {
      throw invalid('Observed cases must preserve exact benchmark order and identity.', `observedOutput.cases[${index}].caseId`);
    }
    const baselineCase = baselineByCase.get(benchmarkCase.caseId);
    if (!baselineCase) {
      throw invalid('Bound baseline is missing a benchmark case.', 'baselineText', { caseId: benchmarkCase.caseId });
    }
    caseReports[index] = evaluateCase(observedCase, buildGoldCase(benchmarkCase, baselineCase));
  }

  const counts = {
    preferredMatchCount: 0,
    acceptableMatchCount: 0,
    physicallyValidNotApprovedCount: 0,
    invalidCount: 0,
    unmatchedCount: 0,
  };
  for (const report of caseReports) {
    if (report.classification === MATCH_CLASSIFICATION.PREFERRED_MATCH) counts.preferredMatchCount += 1;
    else if (report.classification === MATCH_CLASSIFICATION.ACCEPTABLE_MATCH) counts.acceptableMatchCount += 1;
    else if (report.classification === MATCH_CLASSIFICATION.PHYSICALLY_VALID_NOT_APPROVED) counts.physicallyValidNotApprovedCount += 1;
    else if (report.classification === MATCH_CLASSIFICATION.INVALID) counts.invalidCount += 1;
    else if (report.classification === MATCH_CLASSIFICATION.UNMATCHED) counts.unmatchedCount += 1;
  }
  const matchedCaseCount = counts.preferredMatchCount + counts.acceptableMatchCount;

  return deepFreeze({
    documentType: 'TeacherArrangementBenchmarkV11ScoreReport',
    contractVersion: TEACHER_ARRANGEMENT_SCORE_REPORT_VERSION,
    mode: 'evaluation-only',
    authority: 'none',
    benchmarkId: benchmark.benchmarkId,
    benchmarkVersion: benchmark.benchmarkVersion,
    effectiveReviewStatus: runtimeEvidence.effectiveReviewStatus,
    observedOutputContractVersion: observed.contractVersion,
    caseCount: caseReports.length,
    matchedCaseCount,
    matchedCaseRate: matchedCaseCount / caseReports.length,
    ...counts,
    cases: caseReports,
  });
}

module.exports = {
  TEACHER_ARRANGEMENT_OBSERVED_OUTPUT_VERSION,
  TEACHER_ARRANGEMENT_SCORE_REPORT_VERSION,
  MATCH_CLASSIFICATION,
  TeacherArrangementObservedOutputError,
  evaluateTeacherApprovedV11ObservedOutput,
};
