'use strict';

const { createHash } = require('node:crypto');
const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');

const TEACHER_ARRANGEMENT_BENCHMARK_CONTRACT_VERSION = '1.0.0';
const MAX_BENCHMARK_CASES = 64;
const MAX_ACCEPTED_ARRANGEMENTS_PER_CASE = 16;
const MAX_SOURCE_BYTES = 1024 * 1024;
const SOURCE_POLICIES = new Set(['self-authored', 'CC0', 'public-domain']);
const FIXTURE_PATH_PATTERN = /^benchmarks\/teacher-arrangement-v1\/fixtures\/[a-z0-9][a-z0-9-]*\.musicxml$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

class TeacherArrangementBenchmarkAdmissionError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_ADMISSION',
      details,
      'TeacherArrangementBenchmarkAdmissionError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkAdmissionError(message, { field, ...details });
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
    throw invalid(`${field || 'benchmark'} must be a non-proxy plain object.`, field || 'benchmark');
  }
  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid('Object keys could not be inspected safely.', field || 'benchmark');
  }
  const allowed = new Set(fields);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid('Symbol properties are not allowed.', field || 'benchmark');
    }
    const child = field ? `${field}.${key}` : key;
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
      throw invalid('Required field is missing.', field ? `${field}.${key}` : key);
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
    if (error instanceof TeacherArrangementBenchmarkAdmissionError) {
      throw error;
    }
    throw invalid('Array prototype could not be inspected safely.', field);
  }
  if (value.length < min || value.length > max) {
    throw invalid(`${field} length is outside the supported boundary.`, field, {
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

function boundedId(value, field) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw invalid(`${field} must be a bounded canonical identifier.`, field);
  }
  return value;
}

function validateSource(source, field) {
  assertExactDataFields(source, ['path', 'sha256', 'policy'], field);
  if (typeof source.path !== 'string' || !FIXTURE_PATH_PATTERN.test(source.path)) {
    throw invalid('Source path must be a safe repository-local teacher-arrangement fixture path.', `${field}.path`);
  }
  if (typeof source.sha256 !== 'string' || !SHA256_PATTERN.test(source.sha256)) {
    throw invalid('Source SHA-256 must use lowercase canonical form.', `${field}.sha256`);
  }
  if (!SOURCE_POLICIES.has(source.policy)) {
    throw invalid('Unsupported benchmark source policy.', `${field}.policy`, { policy: source.policy });
  }
}

function validateCaseAdmission(benchmarkCase, index) {
  const field = `cases[${index}]`;
  assertExactDataFields(
    benchmarkCase,
    [
      'caseId',
      'pedagogicalFocus',
      'source',
      'sourceSelection',
      'acceptedArrangements',
      'preferredArrangementId',
    ],
    field,
  );
  boundedId(benchmarkCase.caseId, `${field}.caseId`);
  if (
    typeof benchmarkCase.pedagogicalFocus !== 'string'
    || benchmarkCase.pedagogicalFocus.length === 0
    || benchmarkCase.pedagogicalFocus.length > 512
    || benchmarkCase.pedagogicalFocus.trim() !== benchmarkCase.pedagogicalFocus
  ) {
    throw invalid('pedagogicalFocus must be a bounded non-empty string.', `${field}.pedagogicalFocus`);
  }
  validateSource(benchmarkCase.source, `${field}.source`);

  if (!isPlainObject(benchmarkCase.sourceSelection)) {
    throw invalid('sourceSelection must be a non-proxy plain object.', `${field}.sourceSelection`);
  }
  assertDenseNativeArray(
    benchmarkCase.acceptedArrangements,
    `${field}.acceptedArrangements`,
    1,
    MAX_ACCEPTED_ARRANGEMENTS_PER_CASE,
  );

  const arrangementIds = new Set();
  for (let arrangementIndex = 0; arrangementIndex < benchmarkCase.acceptedArrangements.length; arrangementIndex += 1) {
    const arrangementField = `${field}.acceptedArrangements[${arrangementIndex}]`;
    const arrangement = benchmarkCase.acceptedArrangements[arrangementIndex];
    if (!isPlainObject(arrangement)) {
      throw invalid('Accepted arrangements must be non-proxy plain objects.', arrangementField);
    }
    const descriptor = Object.getOwnPropertyDescriptor(arrangement, 'arrangementId');
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('Accepted arrangements require an enumerable arrangementId data field.', `${arrangementField}.arrangementId`);
    }
    const arrangementId = boundedId(descriptor.value, `${arrangementField}.arrangementId`);
    if (arrangementIds.has(arrangementId)) {
      throw invalid('arrangementId must be unique inside a benchmark case.', `${arrangementField}.arrangementId`);
    }
    arrangementIds.add(arrangementId);
  }

  if (benchmarkCase.preferredArrangementId !== null) {
    boundedId(benchmarkCase.preferredArrangementId, `${field}.preferredArrangementId`);
    if (!arrangementIds.has(benchmarkCase.preferredArrangementId)) {
      throw invalid('preferredArrangementId must reference an accepted arrangement.', `${field}.preferredArrangementId`);
    }
  }
}

function validateTeacherArrangementBenchmarkAdmission(benchmark) {
  assertExactDataFields(
    benchmark,
    [
      'documentType',
      'contractVersion',
      'benchmarkId',
      'benchmarkVersion',
      'reviewStatus',
      'guitar',
      'physicalPolicy',
      'cases',
    ],
    '',
  );
  if (benchmark.documentType !== 'TeacherArrangementBenchmark') {
    throw invalid('documentType must be TeacherArrangementBenchmark.', 'documentType');
  }
  if (benchmark.contractVersion !== TEACHER_ARRANGEMENT_BENCHMARK_CONTRACT_VERSION) {
    throw invalid('Unsupported TeacherArrangementBenchmark contract version.', 'contractVersion', {
      expected: TEACHER_ARRANGEMENT_BENCHMARK_CONTRACT_VERSION,
      actual: benchmark.contractVersion,
    });
  }
  boundedId(benchmark.benchmarkId, 'benchmarkId');
  boundedId(benchmark.benchmarkVersion, 'benchmarkVersion');
  if (benchmark.reviewStatus !== 'proposed' && benchmark.reviewStatus !== 'teacher-approved') {
    throw invalid('reviewStatus must be proposed or teacher-approved.', 'reviewStatus');
  }
  if (!isPlainObject(benchmark.guitar)) {
    throw invalid('guitar must be a non-proxy plain object.', 'guitar');
  }
  if (!isPlainObject(benchmark.physicalPolicy)) {
    throw invalid('physicalPolicy must be a non-proxy plain object.', 'physicalPolicy');
  }
  assertDenseNativeArray(benchmark.cases, 'cases', 1, MAX_BENCHMARK_CASES);

  const caseIds = new Set();
  const sourcePaths = new Set();
  for (let index = 0; index < benchmark.cases.length; index += 1) {
    const benchmarkCase = benchmark.cases[index];
    validateCaseAdmission(benchmarkCase, index);
    if (caseIds.has(benchmarkCase.caseId)) {
      throw invalid('caseId must be unique.', `cases[${index}].caseId`);
    }
    if (sourcePaths.has(benchmarkCase.source.path)) {
      throw invalid('Each case must bind a distinct source fixture.', `cases[${index}].source.path`);
    }
    caseIds.add(benchmarkCase.caseId);
    sourcePaths.add(benchmarkCase.source.path);
  }
  return true;
}

function assertTeacherApprovedArrangementBenchmarkAdmission(benchmark) {
  validateTeacherArrangementBenchmarkAdmission(benchmark);
  if (benchmark.reviewStatus !== 'teacher-approved') {
    throw invalid(
      'Benchmark must be teacher-approved before evaluator admission.',
      'reviewStatus',
      { reviewStatus: benchmark.reviewStatus },
    );
  }
  return true;
}

function verifyTeacherArrangementBenchmarkCaseSource(benchmarkCase, sourceText) {
  if (!isPlainObject(benchmarkCase)) {
    throw invalid('benchmarkCase must be a non-proxy plain object.', 'benchmarkCase');
  }
  const sourceDescriptor = Object.getOwnPropertyDescriptor(benchmarkCase, 'source');
  if (!sourceDescriptor || !sourceDescriptor.enumerable || !Object.hasOwn(sourceDescriptor, 'value')) {
    throw invalid('benchmarkCase.source must be an enumerable own data property.', 'benchmarkCase.source');
  }
  validateSource(sourceDescriptor.value, 'benchmarkCase.source');
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    throw invalid('Source content must be non-empty UTF-8 text.', 'sourceText');
  }
  const sourceBytes = Buffer.byteLength(sourceText, 'utf8');
  if (sourceBytes > MAX_SOURCE_BYTES) {
    throw invalid('Source content exceeds the fixed byte boundary.', 'sourceText', {
      sourceBytes,
      maxSourceBytes: MAX_SOURCE_BYTES,
    });
  }
  const actualSha256 = createHash('sha256').update(sourceText, 'utf8').digest('hex');
  if (actualSha256 !== sourceDescriptor.value.sha256) {
    throw invalid('Source SHA-256 does not match the benchmark binding.', 'sourceText', {
      expectedSha256: sourceDescriptor.value.sha256,
      actualSha256,
    });
  }
  return true;
}

module.exports = {
  MAX_BENCHMARK_CASES,
  MAX_SOURCE_BYTES,
  TEACHER_ARRANGEMENT_BENCHMARK_CONTRACT_VERSION,
  TeacherArrangementBenchmarkAdmissionError,
  assertTeacherApprovedArrangementBenchmarkAdmission,
  validateTeacherArrangementBenchmarkAdmission,
  verifyTeacherArrangementBenchmarkCaseSource,
};
