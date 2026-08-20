'use strict';

const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const {
  MAX_BENCHMARK_CASES,
  verifyTeacherArrangementBenchmarkCaseSource,
} = require('./teacherArrangementBenchmarkAdmission');
const {
  validateTeacherArrangementBenchmarkShapeSemantics,
} = require('./teacherArrangementBenchmarkShapeSemanticValidator');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');

const TEACHER_ARRANGEMENT_BENCHMARK_SOURCE_REPLAY_VERSION = '1.0.0';

class TeacherArrangementBenchmarkSourceReplayError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_SOURCE_REPLAY',
      details,
      'TeacherArrangementBenchmarkSourceReplayError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkSourceReplayError(message, { field, ...details });
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

function assertDenseNativeArray(value, field, expectedLength) {
  if ((value !== null && typeof value === 'object' && isProxy(value)) || !Array.isArray(value)) {
    throw invalid(`${field} must be a non-proxy array.`, field);
  }
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw invalid('Array subclasses are not allowed.', field);
    }
  } catch (error) {
    if (error instanceof TeacherArrangementBenchmarkSourceReplayError) {
      throw error;
    }
    throw invalid('Array prototype could not be inspected safely.', field);
  }
  if (value.length !== expectedLength || value.length > MAX_BENCHMARK_CASES) {
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

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) {
      continue;
    }
    seen.add(value);
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) {
        pending.push(descriptor.value);
      }
    }
  }
  return root;
}

function buildSourceModel(sourceText, caseIndex) {
  try {
    const runtime = createMusicXmlProcessingRuntime();
    const parsed = parseParsedMusicXmlDocument(sourceText, {}, runtime);
    return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
  } catch (error) {
    throw invalid(
      'Bound source MusicXML could not be replayed through the PA-2 parser/projector path.',
      `sourceEntries[${caseIndex}].sourceText`,
      { causeCode: error && error.code },
    );
  }
}

function validateSourceEntry(entry, benchmarkCase, caseIndex) {
  const field = `sourceEntries[${caseIndex}]`;
  assertExactDataFields(entry, ['caseId', 'sourceText'], field);
  if (entry.caseId !== benchmarkCase.caseId) {
    throw invalid('sourceEntries must preserve exact benchmark case order and identity.', `${field}.caseId`, {
      expectedCaseId: benchmarkCase.caseId,
      actualCaseId: entry.caseId,
    });
  }
  try {
    verifyTeacherArrangementBenchmarkCaseSource(benchmarkCase, entry.sourceText);
  } catch (error) {
    throw invalid('Source bytes do not match the benchmark source binding.', `${field}.sourceText`, {
      causeCode: error && error.code,
      causeField: error && error.details && error.details.field,
    });
  }
}

function validateReplayedCase(benchmarkCase, sourceModel, caseIndex) {
  const caseField = `cases[${caseIndex}]`;
  if (sourceModel.source.partId !== benchmarkCase.sourceSelection.partId) {
    throw invalid('Replayed source part does not match sourceSelection.', `${caseField}.sourceSelection.partId`, {
      actualPartId: sourceModel.source.partId,
    });
  }

  const measure = sourceModel.measures.find(
    (candidate) => candidate.index === benchmarkCase.sourceSelection.measureIndex,
  );
  if (!measure) {
    throw invalid('Replayed source does not contain the selected measure.', `${caseField}.sourceSelection.measureIndex`);
  }

  const eventById = new Map(measure.events.map((event) => [event.sourceEventId, event]));
  for (let eventIndex = 0; eventIndex < benchmarkCase.sourceSelection.sourceEventIds.length; eventIndex += 1) {
    const sourceEventId = benchmarkCase.sourceSelection.sourceEventIds[eventIndex];
    const eventField = `${caseField}.sourceSelection.sourceEventIds[${eventIndex}]`;
    const replayedEvent = eventById.get(sourceEventId);
    if (!replayedEvent) {
      throw invalid('Selected source event is missing from replayed MusicXML.', eventField, { sourceEventId });
    }
    if (replayedEvent.type !== 'note' || !replayedEvent.pitch) {
      throw invalid('Teacher arrangement source selections must replay to pitched note events.', eventField, {
        sourceEventId,
        actualType: replayedEvent.type,
      });
    }

    for (
      let arrangementIndex = 0;
      arrangementIndex < benchmarkCase.acceptedArrangements.length;
      arrangementIndex += 1
    ) {
      const arrangement = benchmarkCase.acceptedArrangements[arrangementIndex];
      const outcomeIndex = arrangement.noteOutcomes.findIndex(
        (outcome) => outcome.sourceEventId === sourceEventId,
      );
      const outcome = arrangement.noteOutcomes[outcomeIndex];
      if (!outcome || outcome.sourceMidi !== replayedEvent.pitch.midi) {
        throw invalid(
          'Benchmark sourceMidi must equal the pitch replayed from bound MusicXML bytes.',
          `${caseField}.acceptedArrangements[${arrangementIndex}].noteOutcomes[${outcomeIndex}].sourceMidi`,
          {
            sourceEventId,
            expectedMidi: replayedEvent.pitch.midi,
            actualMidi: outcome && outcome.sourceMidi,
          },
        );
      }
    }
  }
}

function replayTeacherArrangementBenchmarkSources(input) {
  assertExactDataFields(input, ['benchmark', 'sourceEntries'], 'input');
  const { benchmark, sourceEntries } = input;

  try {
    validateTeacherArrangementBenchmarkShapeSemantics(benchmark);
  } catch (error) {
    throw invalid('Benchmark failed PA-11.3C shape semantics before source replay.', 'benchmark', {
      causeCode: error && error.code,
      causeField: error && error.details && error.details.field,
    });
  }

  assertDenseNativeArray(sourceEntries, 'sourceEntries', benchmark.cases.length);
  const cases = [];

  for (let caseIndex = 0; caseIndex < benchmark.cases.length; caseIndex += 1) {
    const benchmarkCase = benchmark.cases[caseIndex];
    const sourceEntry = sourceEntries[caseIndex];
    validateSourceEntry(sourceEntry, benchmarkCase, caseIndex);
    const sourceModel = buildSourceModel(sourceEntry.sourceText, caseIndex);
    validateReplayedCase(benchmarkCase, sourceModel, caseIndex);
    cases.push({
      caseId: benchmarkCase.caseId,
      sourceSha256: benchmarkCase.source.sha256,
      selectedSourceEventCount: benchmarkCase.sourceSelection.sourceEventIds.length,
      status: 'SOURCE_REPLAY_MATCH',
    });
  }

  return deepFreeze({
    documentType: 'TeacherArrangementBenchmarkSourceReplay',
    contractVersion: TEACHER_ARRANGEMENT_BENCHMARK_SOURCE_REPLAY_VERSION,
    mode: 'evaluation-source-replay',
    authority: 'none',
    benchmarkId: benchmark.benchmarkId,
    benchmarkVersion: benchmark.benchmarkVersion,
    benchmarkReviewStatus: benchmark.reviewStatus,
    caseCount: cases.length,
    cases,
  });
}

module.exports = {
  TEACHER_ARRANGEMENT_BENCHMARK_SOURCE_REPLAY_VERSION,
  TeacherArrangementBenchmarkSourceReplayError,
  replayTeacherArrangementBenchmarkSources,
};
