'use strict';

const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  CANONICAL_TAB_RESULT_VERSION,
  ENGINE_NAME,
  ENGINE_VERSION,
} = require('../tab/canonicalTabResult');
const { convertMusicXmlToCanonicalTab } = require('../core/conversionPipeline');
const { GUITAR_CONFIGURATION_VERSION } = require('../guitar/tuning');
const {
  MAX_BENCHMARK_CASES,
  assertTeacherApprovedBenchmark,
  verifyTeacherBenchmarkCaseSource,
} = require('./teacherFingeringBenchmark');

const TEACHER_FINGERING_BENCHMARK_EVALUATION_CONTRACT_VERSION = '1.0.0';

class TeacherFingeringBenchmarkEvaluationError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_FINGERING_BENCHMARK_EVALUATION',
      details,
      'TeacherFingeringBenchmarkEvaluationError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherFingeringBenchmarkEvaluationError(message, {
    field,
    ...details,
  });
}

function isPlainObject(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
  ) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function assertExactOwnDataFields(value, allowedFields, path) {
  if (!isPlainObject(value)) {
    throw invalid(`${path} must be a non-proxy plain object.`, path);
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid('Object keys could not be inspected safely.', path);
  }

  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid('Symbol properties are not allowed.', `${path}.symbol`);
    }
    const field = `${path}.${key}`;
    if (!allowedFields.has(key)) {
      throw invalid('Unknown field is not allowed.', field);
    }

    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw invalid('Field descriptor could not be inspected safely.', field);
    }
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw invalid('Fields must be enumerable own data properties.', field);
    }
  }

  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) {
      throw invalid('Required field is missing.', `${path}.${key}`);
    }
  }
}

function assertNativeArrayPrototype(value, field) {
  if ((value !== null && typeof value === 'object' && isProxy(value)) || !Array.isArray(value)) {
    throw invalid(`${field} must be a non-proxy array.`, field);
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw invalid('Array subclasses are not allowed at the B2 boundary.', field);
    }
  } catch (error) {
    if (error instanceof TeacherFingeringBenchmarkEvaluationError) {
      throw error;
    }
    throw invalid('Array prototype could not be inspected safely.', field);
  }
}

function assertDenseArray(value, field, expectedLength = null) {
  assertNativeArrayPrototype(value, field);
  if (value.length > MAX_BENCHMARK_CASES) {
    throw invalid(`${field} exceeds the fixed B2 case boundary.`, field, {
      length: value.length,
      maximum: MAX_BENCHMARK_CASES,
    });
  }
  if (expectedLength !== null && value.length !== expectedLength) {
    throw invalid(`${field} must contain exactly one entry per benchmark case.`, field, {
      length: value.length,
      expectedLength,
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
    if (key === 'length') {
      continue;
    }
    if (!/^(0|[1-9]\d*)$/.test(key)) {
      throw invalid('Custom array properties are not allowed.', field, { key });
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw invalid(`${field} must be dense.`, `${field}[${index}]`);
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    } catch {
      throw invalid('Array entry descriptor could not be inspected safely.', `${field}[${index}]`);
    }
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw invalid('Array entries must be enumerable own data properties.', `${field}[${index}]`);
    }
  }
}

function getOwnDataValue(value, key) {
  if (!isPlainObject(value)) {
    return undefined;
  }
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return undefined;
  }
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    return undefined;
  }
  return descriptor.value;
}

function preflightBenchmarkArrayPrototypes(benchmark) {
  if (!isPlainObject(benchmark)) {
    return;
  }

  const guitarConfiguration = getOwnDataValue(benchmark, 'guitarConfiguration');
  const guitarValue = getOwnDataValue(guitarConfiguration, 'value');
  const tuning = getOwnDataValue(guitarValue, 'tuning');
  if (tuning !== undefined) {
    assertNativeArrayPrototype(tuning, 'benchmark.guitarConfiguration.value.tuning');
  }

  const cases = getOwnDataValue(benchmark, 'cases');
  if (cases === undefined) {
    return;
  }
  assertNativeArrayPrototype(cases, 'benchmark.cases');

  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    if (!Object.hasOwn(cases, caseIndex)) {
      continue;
    }
    const benchmarkCase = cases[caseIndex];
    const events = getOwnDataValue(benchmarkCase, 'events');
    if (events === undefined) {
      continue;
    }
    assertNativeArrayPrototype(events, `benchmark.cases[${caseIndex}].events`);

    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      if (!Object.hasOwn(events, eventIndex)) {
        continue;
      }
      const acceptedPositions = getOwnDataValue(events[eventIndex], 'acceptedPositions');
      if (acceptedPositions !== undefined) {
        assertNativeArrayPrototype(
          acceptedPositions,
          `benchmark.cases[${caseIndex}].events[${eventIndex}].acceptedPositions`,
        );
      }
    }
  }
}

function samePosition(left, right) {
  return left.string === right.string && left.fret === right.fret;
}

function clonePosition(position) {
  return {
    string: position.string,
    fret: position.fret,
  };
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

function normalizeBenchmark(benchmark) {
  preflightBenchmarkArrayPrototypes(benchmark);
  try {
    assertTeacherApprovedBenchmark(benchmark);
  } catch (error) {
    throw invalid('A valid teacher-approved B1 benchmark is required.', 'benchmark', {
      causeCode: error && error.code,
    });
  }
  return benchmark;
}

function normalizeSourceEntries(sourceEntries, benchmark) {
  assertDenseArray(sourceEntries, 'sourceEntries', benchmark.cases.length);

  const normalized = [];
  for (let index = 0; index < sourceEntries.length; index += 1) {
    const entry = sourceEntries[index];
    const field = `sourceEntries[${index}]`;
    assertExactOwnDataFields(entry, new Set(['caseId', 'sourceText']), field);

    if (typeof entry.caseId !== 'string' || entry.caseId !== benchmark.cases[index].caseId) {
      throw invalid('sourceEntries must exactly follow benchmark case order.', `${field}.caseId`, {
        expectedCaseId: benchmark.cases[index].caseId,
        actualCaseId: entry.caseId,
      });
    }
    if (typeof entry.sourceText !== 'string' || entry.sourceText.length === 0) {
      throw invalid('sourceText must be a non-empty UTF-8 string.', `${field}.sourceText`);
    }

    try {
      verifyTeacherBenchmarkCaseSource(benchmark.cases[index], entry.sourceText);
    } catch (error) {
      throw invalid('Benchmark source content failed the B1 integrity binding.', `${field}.sourceText`, {
        caseId: entry.caseId,
        causeCode: error && error.code,
      });
    }

    normalized.push({
      caseId: entry.caseId,
      sourceText: entry.sourceText,
    });
  }
  return normalized;
}

function guitarOptionsFromBenchmark(benchmark) {
  const tuning = [];
  const benchmarkTuning = benchmark.guitarConfiguration.value.tuning;
  for (let index = 0; index < benchmarkTuning.length; index += 1) {
    const entry = benchmarkTuning[index];
    tuning.push({
      number: entry.number,
      pitch: entry.pitch,
      midi: entry.midi,
    });
  }
  return {
    tuning,
    minimumFret: benchmark.guitarConfiguration.value.minimumFret,
    maximumFret: benchmark.guitarConfiguration.value.maximumFret,
  };
}

function flattenNoteEvents(canonicalTabResult) {
  const events = [];
  for (const measure of canonicalTabResult.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') {
        events.push(event);
      }
    }
  }
  return events;
}

function assertAlignedEvents(benchmarkCase, resultEvents, caseIndex) {
  const field = `benchmark.cases[${caseIndex}].events`;
  if (resultEvents.length !== benchmarkCase.events.length) {
    throw invalid('Successful conversion event count does not match benchmark labels.', field, {
      caseId: benchmarkCase.caseId,
      expectedEventCount: benchmarkCase.events.length,
      actualEventCount: resultEvents.length,
    });
  }

  for (let index = 0; index < benchmarkCase.events.length; index += 1) {
    if (resultEvents[index].eventId !== benchmarkCase.events[index].eventId) {
      throw invalid('Successful conversion event identities do not match benchmark labels.', field, {
        caseId: benchmarkCase.caseId,
        eventIndex: index,
        expectedEventId: benchmarkCase.events[index].eventId,
        actualEventId: resultEvents[index].eventId,
      });
    }
  }
}

function includesPosition(positions, target) {
  for (let index = 0; index < positions.length; index += 1) {
    if (samePosition(positions[index], target)) {
      return true;
    }
  }
  return false;
}

function hasCandidateCoverage(acceptedPositions, candidatePositions) {
  for (let acceptedIndex = 0; acceptedIndex < acceptedPositions.length; acceptedIndex += 1) {
    if (includesPosition(candidatePositions, acceptedPositions[acceptedIndex])) {
      return true;
    }
  }
  return false;
}

function evaluateEvent(benchmarkEvent, resultEvent) {
  const selectedPosition = clonePosition(resultEvent.selectedPosition);
  const candidatePositions = [selectedPosition];
  for (let index = 0; index < resultEvent.alternativePositions.length; index += 1) {
    candidatePositions.push(clonePosition(resultEvent.alternativePositions[index]));
  }

  const acceptableMatch = includesPosition(
    benchmarkEvent.acceptedPositions,
    selectedPosition,
  );
  const preferredEligible = benchmarkEvent.preferredPosition !== null;
  const preferredMatch = preferredEligible
    && samePosition(benchmarkEvent.preferredPosition, selectedPosition);
  const candidateCoveragePresent = hasCandidateCoverage(
    benchmarkEvent.acceptedPositions,
    candidatePositions,
  );

  return {
    eventId: benchmarkEvent.eventId,
    selectedPosition,
    acceptableMatch,
    preferredEligible,
    preferredMatch,
    candidateCoveragePresent,
  };
}

function countPreferredEligible(benchmarkCase) {
  let count = 0;
  for (let index = 0; index < benchmarkCase.events.length; index += 1) {
    if (benchmarkCase.events[index].preferredPosition !== null) {
      count += 1;
    }
  }
  return count;
}

function createBlockedCase(benchmarkCase) {
  return {
    caseId: benchmarkCase.caseId,
    pedagogicalFocus: benchmarkCase.pedagogicalFocus,
    status: 'blocked',
    pass: false,
    eventCount: benchmarkCase.events.length,
    evaluatedEventCount: 0,
    acceptableMatchCount: 0,
    preferredEligibleEventCount: countPreferredEligible(benchmarkCase),
    preferredMatchCount: 0,
    candidateCoverageFailureCount: 0,
    events: [],
  };
}

function createEvaluatedCase(benchmarkCase, resultEvents) {
  const events = [];
  let acceptableMatchCount = 0;
  let preferredEligibleEventCount = 0;
  let preferredMatchCount = 0;
  let candidateCoverageFailureCount = 0;

  for (let index = 0; index < benchmarkCase.events.length; index += 1) {
    const eventReport = evaluateEvent(benchmarkCase.events[index], resultEvents[index]);
    events.push(eventReport);
    if (eventReport.acceptableMatch) {
      acceptableMatchCount += 1;
    }
    if (eventReport.preferredEligible) {
      preferredEligibleEventCount += 1;
    }
    if (eventReport.preferredMatch) {
      preferredMatchCount += 1;
    }
    if (!eventReport.candidateCoveragePresent) {
      candidateCoverageFailureCount += 1;
    }
  }

  const pass = acceptableMatchCount === events.length && candidateCoverageFailureCount === 0;

  return {
    caseId: benchmarkCase.caseId,
    pedagogicalFocus: benchmarkCase.pedagogicalFocus,
    status: 'evaluated',
    pass,
    eventCount: benchmarkCase.events.length,
    evaluatedEventCount: events.length,
    acceptableMatchCount,
    preferredEligibleEventCount,
    preferredMatchCount,
    candidateCoverageFailureCount,
    events,
  };
}

function addCounts(counts, caseReport) {
  counts.preferredEligibleEventCount += caseReport.preferredEligibleEventCount;
  counts.acceptableMatchCount += caseReport.acceptableMatchCount;
  counts.preferredMatchCount += caseReport.preferredMatchCount;
  counts.candidateCoverageFailureCount += caseReport.candidateCoverageFailureCount;

  if (caseReport.status === 'blocked') {
    counts.blockedConversionCount += 1;
    counts.unevaluatedEventCount += caseReport.eventCount;
    return;
  }

  counts.evaluatedCaseCount += 1;
  counts.evaluatedEventCount += caseReport.evaluatedEventCount;
  if (caseReport.pass) {
    counts.casePassCount += 1;
  }
}

function countBenchmarkEvents(benchmark) {
  let count = 0;
  for (let index = 0; index < benchmark.cases.length; index += 1) {
    count += benchmark.cases[index].events.length;
  }
  return count;
}

function evaluateTeacherFingeringBenchmark(input) {
  assertExactOwnDataFields(input, new Set(['benchmark', 'sourceEntries']), 'input');
  const benchmark = normalizeBenchmark(input.benchmark);
  const sourceEntries = normalizeSourceEntries(input.sourceEntries, benchmark);
  const guitar = guitarOptionsFromBenchmark(benchmark);

  const counts = {
    benchmarkCaseCount: benchmark.cases.length,
    benchmarkEventCount: countBenchmarkEvents(benchmark),
    evaluatedCaseCount: 0,
    evaluatedEventCount: 0,
    unevaluatedEventCount: 0,
    acceptableMatchCount: 0,
    preferredEligibleEventCount: 0,
    preferredMatchCount: 0,
    casePassCount: 0,
    candidateCoverageFailureCount: 0,
    blockedConversionCount: 0,
  };

  const cases = [];
  for (let index = 0; index < benchmark.cases.length; index += 1) {
    const benchmarkCase = benchmark.cases[index];
    let conversion;
    try {
      conversion = convertMusicXmlToCanonicalTab(
        sourceEntries[index].sourceText,
        { guitar },
      );
    } catch (error) {
      throw invalid('Benchmark case conversion threw before a deterministic report could be produced.', `sourceEntries[${index}].sourceText`, {
        caseId: benchmarkCase.caseId,
        causeCode: error && error.code,
      });
    }

    let caseReport;
    if (conversion.canonicalTabResult === null) {
      if (!conversion.preflight || conversion.preflight.canProcess !== false) {
        throw invalid('Blocked conversion result is internally inconsistent.', `sourceEntries[${index}].sourceText`, {
          caseId: benchmarkCase.caseId,
        });
      }
      caseReport = createBlockedCase(benchmarkCase);
    } else {
      if (!conversion.preflight || conversion.preflight.canProcess !== true) {
        throw invalid('Successful conversion result is internally inconsistent.', `sourceEntries[${index}].sourceText`, {
          caseId: benchmarkCase.caseId,
        });
      }
      const resultEvents = flattenNoteEvents(conversion.canonicalTabResult);
      assertAlignedEvents(benchmarkCase, resultEvents, index);
      caseReport = createEvaluatedCase(benchmarkCase, resultEvents);
    }

    addCounts(counts, caseReport);
    cases.push(caseReport);
  }

  if (counts.evaluatedEventCount + counts.unevaluatedEventCount !== counts.benchmarkEventCount) {
    throw invalid('Evaluation accounting no longer covers the complete benchmark denominator.', 'counts', {
      benchmarkEventCount: counts.benchmarkEventCount,
      evaluatedEventCount: counts.evaluatedEventCount,
      unevaluatedEventCount: counts.unevaluatedEventCount,
    });
  }

  const report = {
    documentType: 'TeacherFingeringBenchmarkEvaluation',
    contractVersion: TEACHER_FINGERING_BENCHMARK_EVALUATION_CONTRACT_VERSION,
    benchmark: {
      contractVersion: benchmark.contractVersion,
      benchmarkId: benchmark.benchmarkId,
      benchmarkVersion: benchmark.benchmarkVersion,
      reviewStatus: benchmark.reviewStatus,
    },
    evaluationContext: {
      engine: {
        name: ENGINE_NAME,
        version: ENGINE_VERSION,
      },
      canonicalTabResultVersion: CANONICAL_TAB_RESULT_VERSION,
      guitarConfigurationVersion: GUITAR_CONFIGURATION_VERSION,
    },
    counts,
    cases,
  };

  return deepFreeze(report);
}

module.exports = {
  TEACHER_FINGERING_BENCHMARK_EVALUATION_CONTRACT_VERSION,
  TeacherFingeringBenchmarkEvaluationError,
  evaluateTeacherFingeringBenchmark,
};
