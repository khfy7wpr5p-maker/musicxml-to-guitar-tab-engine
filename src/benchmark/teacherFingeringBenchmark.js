'use strict';

const { createHash } = require('node:crypto');
const { EngineError } = require('../errors/engineError');
const { positionToMidi } = require('../guitar/fretboard');
const {
  GUITAR_CONFIGURATION_VERSION,
  createGuitarConfiguration,
} = require('../guitar/tuning');

const TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION = '1.0.0';
const MAX_BENCHMARK_CASES = 64;
const MAX_EVENTS_PER_CASE = 256;
const MAX_ACCEPTED_POSITIONS_PER_EVENT = 6;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_SOURCE_PATH_LENGTH = 256;
const MAX_SOURCE_BYTES = 1024 * 1024;
const SOURCE_POLICIES = new Set(['self-authored', 'CC0', 'public-domain']);
const REVIEW_STATUSES = new Set(['proposed', 'teacher-approved']);
const FIXTURE_PATH_PATTERN = /^benchmarks\/teacher-fingering-v1\/fixtures\/[a-z0-9][a-z0-9-]*\.musicxml$/;
const EVENT_ID_PATTERN = /^m[1-9]\d*-e\d+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

class TeacherFingeringBenchmarkError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_FINGERING_BENCHMARK',
      details,
      'TeacherFingeringBenchmarkError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherFingeringBenchmarkError(message, {
    field,
    ...details,
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactOwnDataFields(value, allowedFields, path) {
  if (!isPlainObject(value)) {
    throw invalid(`${path || 'benchmark'} must be a plain object.`, path || 'benchmark');
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw invalid('Symbol properties are not allowed.', path ? `${path}.symbol` : 'symbol');
    }
    const field = path ? `${path}.${key}` : key;
    if (!allowedFields.has(key)) {
      throw invalid('Unknown field is not allowed.', field);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw invalid('Fields must be enumerable own data properties.', field);
    }
  }
}

function assertDenseArray(value, field, { min = 0, max }) {
  if (!Array.isArray(value)) {
    throw invalid(`${field} must be an array.`, field);
  }
  if (value.length < min || value.length > max) {
    throw invalid(`${field} length is outside the supported benchmark boundary.`, field, {
      length: value.length,
      min,
      max,
    });
  }

  for (const key of Reflect.ownKeys(value)) {
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
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw invalid('Array entries must be enumerable own data properties.', `${field}[${index}]`);
    }
  }
}

function requireBoundedString(value, field, { max = MAX_IDENTIFIER_LENGTH, pattern } = {}) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > max
    || value.trim() !== value
  ) {
    throw invalid(`${field} must be a bounded non-empty trimmed string.`, field);
  }
  if (pattern && !pattern.test(value)) {
    throw invalid(`${field} does not match the required canonical form.`, field);
  }
  return value;
}

function requireIntegerInRange(value, field, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw invalid(`${field} is outside the supported integer range.`, field, {
      value,
      min,
      max,
    });
  }
  return value;
}

function samePosition(left, right) {
  return left.string === right.string && left.fret === right.fret;
}

function validatePosition(position, field, configuration, pitchMidi) {
  assertExactOwnDataFields(position, new Set(['string', 'fret']), field);
  requireIntegerInRange(position.string, `${field}.string`, 1, 6);
  requireIntegerInRange(
    position.fret,
    `${field}.fret`,
    configuration.minimumFret,
    configuration.maximumFret,
  );

  let actualMidi;
  try {
    actualMidi = positionToMidi(position, configuration.tuning);
  } catch (error) {
    throw invalid('Position cannot be resolved against the benchmark tuning.', field, {
      causeCode: error && error.code,
    });
  }
  if (actualMidi !== pitchMidi) {
    throw invalid('Position does not produce the benchmark event pitch.', field, {
      expectedMidi: pitchMidi,
      actualMidi,
    });
  }
}

function validateGuitarConfiguration(configurationRecord) {
  const field = 'guitarConfiguration';
  assertExactOwnDataFields(
    configurationRecord,
    new Set(['contractVersion', 'value']),
    field,
  );
  if (configurationRecord.contractVersion !== GUITAR_CONFIGURATION_VERSION) {
    throw invalid('Unsupported GuitarConfiguration contract version.', `${field}.contractVersion`, {
      expected: GUITAR_CONFIGURATION_VERSION,
      actual: configurationRecord.contractVersion,
    });
  }

  const valueField = `${field}.value`;
  assertExactOwnDataFields(
    configurationRecord.value,
    new Set(['tuning', 'minimumFret', 'maximumFret']),
    valueField,
  );
  assertDenseArray(configurationRecord.value.tuning, `${valueField}.tuning`, {
    min: 6,
    max: 6,
  });

  for (let index = 0; index < configurationRecord.value.tuning.length; index += 1) {
    assertExactOwnDataFields(
      configurationRecord.value.tuning[index],
      new Set(['number', 'pitch', 'midi']),
      `${valueField}.tuning[${index}]`,
    );
  }

  let normalized;
  try {
    normalized = createGuitarConfiguration({
      tuning: configurationRecord.value.tuning,
      minimumFret: configurationRecord.value.minimumFret,
      maximumFret: configurationRecord.value.maximumFret,
    });
  } catch (error) {
    throw invalid('Benchmark guitar configuration is invalid.', valueField, {
      causeCode: error && error.code,
    });
  }

  if (normalized.tuning.length !== configurationRecord.value.tuning.length) {
    throw invalid('Benchmark tuning does not normalize losslessly.', `${valueField}.tuning`);
  }
  for (let index = 0; index < normalized.tuning.length; index += 1) {
    const actual = configurationRecord.value.tuning[index];
    const expected = normalized.tuning[index];
    if (
      actual.number !== expected.number
      || actual.pitch !== expected.pitch
      || actual.midi !== expected.midi
    ) {
      throw invalid(
        'Benchmark tuning must already be in canonical string-number order.',
        `${valueField}.tuning[${index}]`,
      );
    }
  }

  return normalized;
}

function validateSource(source, field) {
  assertExactOwnDataFields(source, new Set(['path', 'sha256', 'policy']), field);
  requireBoundedString(source.path, `${field}.path`, {
    max: MAX_SOURCE_PATH_LENGTH,
    pattern: FIXTURE_PATH_PATTERN,
  });
  requireBoundedString(source.sha256, `${field}.sha256`, {
    max: 64,
    pattern: SHA256_PATTERN,
  });
  if (!SOURCE_POLICIES.has(source.policy)) {
    throw invalid('Unsupported benchmark source policy.', `${field}.policy`, {
      policy: source.policy,
    });
  }
}

function validateEvent(event, field, configuration) {
  assertExactOwnDataFields(
    event,
    new Set([
      'eventId',
      'pitchMidi',
      'acceptedPositions',
      'preferredPosition',
    ]),
    field,
  );
  requireBoundedString(event.eventId, `${field}.eventId`, {
    max: 64,
    pattern: EVENT_ID_PATTERN,
  });
  requireIntegerInRange(event.pitchMidi, `${field}.pitchMidi`, 0, 127);
  assertDenseArray(event.acceptedPositions, `${field}.acceptedPositions`, {
    min: 1,
    max: MAX_ACCEPTED_POSITIONS_PER_EVENT,
  });

  for (let index = 0; index < event.acceptedPositions.length; index += 1) {
    const positionField = `${field}.acceptedPositions[${index}]`;
    const position = event.acceptedPositions[index];
    validatePosition(position, positionField, configuration, event.pitchMidi);
    for (let previous = 0; previous < index; previous += 1) {
      if (samePosition(position, event.acceptedPositions[previous])) {
        throw invalid('Accepted positions must be unique.', positionField);
      }
    }
  }

  if (event.preferredPosition !== null) {
    validatePosition(
      event.preferredPosition,
      `${field}.preferredPosition`,
      configuration,
      event.pitchMidi,
    );
    if (!event.acceptedPositions.some((position) => samePosition(position, event.preferredPosition))) {
      throw invalid(
        'preferredPosition must be null or an exact accepted position.',
        `${field}.preferredPosition`,
      );
    }
  }
}

function validateBenchmarkCase(benchmarkCase, field, configuration) {
  assertExactOwnDataFields(
    benchmarkCase,
    new Set(['caseId', 'pedagogicalFocus', 'source', 'events']),
    field,
  );
  requireBoundedString(benchmarkCase.caseId, `${field}.caseId`);
  requireBoundedString(benchmarkCase.pedagogicalFocus, `${field}.pedagogicalFocus`);
  validateSource(benchmarkCase.source, `${field}.source`);
  assertDenseArray(benchmarkCase.events, `${field}.events`, {
    min: 1,
    max: MAX_EVENTS_PER_CASE,
  });

  const eventIds = new Set();
  for (let index = 0; index < benchmarkCase.events.length; index += 1) {
    const eventField = `${field}.events[${index}]`;
    const event = benchmarkCase.events[index];
    validateEvent(event, eventField, configuration);
    if (eventIds.has(event.eventId)) {
      throw invalid('eventId must be unique inside each benchmark case.', `${eventField}.eventId`, {
        eventId: event.eventId,
      });
    }
    eventIds.add(event.eventId);
  }
}

function validateTeacherFingeringBenchmark(benchmark) {
  assertExactOwnDataFields(
    benchmark,
    new Set([
      'documentType',
      'contractVersion',
      'benchmarkId',
      'benchmarkVersion',
      'reviewStatus',
      'guitarConfiguration',
      'cases',
    ]),
    '',
  );

  if (benchmark.documentType !== 'TeacherFingeringBenchmark') {
    throw invalid('documentType must be TeacherFingeringBenchmark.', 'documentType');
  }
  if (benchmark.contractVersion !== TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION) {
    throw invalid('Unsupported TeacherFingeringBenchmark contract version.', 'contractVersion', {
      expected: TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION,
      actual: benchmark.contractVersion,
    });
  }
  requireBoundedString(benchmark.benchmarkId, 'benchmarkId');
  requireBoundedString(benchmark.benchmarkVersion, 'benchmarkVersion');
  if (!REVIEW_STATUSES.has(benchmark.reviewStatus)) {
    throw invalid('reviewStatus must be proposed or teacher-approved.', 'reviewStatus');
  }

  const configuration = validateGuitarConfiguration(benchmark.guitarConfiguration);
  assertDenseArray(benchmark.cases, 'cases', {
    min: 1,
    max: MAX_BENCHMARK_CASES,
  });

  const caseIds = new Set();
  const sourcePaths = new Set();
  for (let index = 0; index < benchmark.cases.length; index += 1) {
    const caseField = `cases[${index}]`;
    const benchmarkCase = benchmark.cases[index];
    validateBenchmarkCase(benchmarkCase, caseField, configuration);
    if (caseIds.has(benchmarkCase.caseId)) {
      throw invalid('caseId must be unique.', `${caseField}.caseId`, {
        caseId: benchmarkCase.caseId,
      });
    }
    if (sourcePaths.has(benchmarkCase.source.path)) {
      throw invalid('Each benchmark case must bind a distinct fixture path.', `${caseField}.source.path`, {
        path: benchmarkCase.source.path,
      });
    }
    caseIds.add(benchmarkCase.caseId);
    sourcePaths.add(benchmarkCase.source.path);
  }

  return true;
}

function clonePosition(position) {
  return {
    string: position.string,
    fret: position.fret,
  };
}

function cloneBenchmark(benchmark) {
  return {
    documentType: benchmark.documentType,
    contractVersion: benchmark.contractVersion,
    benchmarkId: benchmark.benchmarkId,
    benchmarkVersion: benchmark.benchmarkVersion,
    reviewStatus: benchmark.reviewStatus,
    guitarConfiguration: {
      contractVersion: benchmark.guitarConfiguration.contractVersion,
      value: {
        tuning: benchmark.guitarConfiguration.value.tuning.map((entry) => ({
          number: entry.number,
          pitch: entry.pitch,
          midi: entry.midi,
        })),
        minimumFret: benchmark.guitarConfiguration.value.minimumFret,
        maximumFret: benchmark.guitarConfiguration.value.maximumFret,
      },
    },
    cases: benchmark.cases.map((benchmarkCase) => ({
      caseId: benchmarkCase.caseId,
      pedagogicalFocus: benchmarkCase.pedagogicalFocus,
      source: {
        path: benchmarkCase.source.path,
        sha256: benchmarkCase.source.sha256,
        policy: benchmarkCase.source.policy,
      },
      events: benchmarkCase.events.map((event) => ({
        eventId: event.eventId,
        pitchMidi: event.pitchMidi,
        acceptedPositions: event.acceptedPositions.map(clonePosition),
        preferredPosition: event.preferredPosition === null
          ? null
          : clonePosition(event.preferredPosition),
      })),
    })),
  };
}

function deepFreezeBenchmark(benchmark) {
  for (const entry of benchmark.guitarConfiguration.value.tuning) {
    Object.freeze(entry);
  }
  Object.freeze(benchmark.guitarConfiguration.value.tuning);
  Object.freeze(benchmark.guitarConfiguration.value);
  Object.freeze(benchmark.guitarConfiguration);

  for (const benchmarkCase of benchmark.cases) {
    Object.freeze(benchmarkCase.source);
    for (const event of benchmarkCase.events) {
      for (const position of event.acceptedPositions) {
        Object.freeze(position);
      }
      Object.freeze(event.acceptedPositions);
      if (event.preferredPosition !== null) {
        Object.freeze(event.preferredPosition);
      }
      Object.freeze(event);
    }
    Object.freeze(benchmarkCase.events);
    Object.freeze(benchmarkCase);
  }
  Object.freeze(benchmark.cases);
  return Object.freeze(benchmark);
}

function createTeacherFingeringBenchmark(input) {
  validateTeacherFingeringBenchmark(input);
  return deepFreezeBenchmark(cloneBenchmark(input));
}

function assertTeacherApprovedBenchmark(benchmark) {
  validateTeacherFingeringBenchmark(benchmark);
  if (benchmark.reviewStatus !== 'teacher-approved') {
    throw invalid(
      'Benchmark must be teacher-approved before evaluation use.',
      'reviewStatus',
      { reviewStatus: benchmark.reviewStatus },
    );
  }
  return true;
}

function verifyTeacherBenchmarkCaseSource(benchmarkCase, sourceText) {
  if (!isPlainObject(benchmarkCase)) {
    throw invalid('benchmarkCase must be a plain object.', 'benchmarkCase');
  }
  validateSource(benchmarkCase.source, 'benchmarkCase.source');
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    throw invalid('Benchmark source content must be a non-empty UTF-8 string.', 'sourceText');
  }
  const sourceBytes = Buffer.byteLength(sourceText, 'utf8');
  if (sourceBytes > MAX_SOURCE_BYTES) {
    throw invalid('Benchmark source content exceeds the fixed source-byte limit.', 'sourceText', {
      sourceBytes,
      maxSourceBytes: MAX_SOURCE_BYTES,
    });
  }

  const actualSha256 = createHash('sha256').update(sourceText, 'utf8').digest('hex');
  if (actualSha256 !== benchmarkCase.source.sha256) {
    throw invalid('Benchmark source SHA-256 does not match the fixed artifact binding.', 'benchmarkCase.source.sha256', {
      expectedSha256: benchmarkCase.source.sha256,
      actualSha256,
    });
  }
  return true;
}

module.exports = {
  TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION,
  MAX_BENCHMARK_CASES,
  MAX_EVENTS_PER_CASE,
  MAX_ACCEPTED_POSITIONS_PER_EVENT,
  TeacherFingeringBenchmarkError,
  assertTeacherApprovedBenchmark,
  createTeacherFingeringBenchmark,
  validateTeacherFingeringBenchmark,
  verifyTeacherBenchmarkCaseSource,
};
