'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const {
  GUITAR_CONFIGURATION_VERSION,
  createGuitarConfiguration,
} = require('../src/guitar/tuning');
const {
  TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION,
  TeacherFingeringBenchmarkError,
  validateTeacherFingeringBenchmark,
  verifyTeacherBenchmarkCaseSource,
} = require('../src/benchmark/teacherFingeringBenchmark');

function sourceDigest(sourceText) {
  return createHash('sha256').update(sourceText, 'utf8').digest('hex');
}

function benchmarkInput() {
  const sourceText = '<score-partwise version="4.0" />\n';
  const configuration = createGuitarConfiguration();
  return {
    sourceText,
    benchmark: {
      documentType: 'TeacherFingeringBenchmark',
      contractVersion: TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION,
      benchmarkId: 'teacher-fingering-v1',
      benchmarkVersion: '1.0.0',
      reviewStatus: 'proposed',
      guitarConfiguration: {
        contractVersion: GUITAR_CONFIGURATION_VERSION,
        value: {
          tuning: configuration.tuning.map((entry) => ({ ...entry })),
          minimumFret: configuration.minimumFret,
          maximumFret: configuration.maximumFret,
        },
      },
      cases: [
        {
          caseId: 'hostile-input-reference',
          pedagogicalFocus: 'hostile-input-reference',
          source: {
            path: 'benchmarks/teacher-fingering-v1/fixtures/hostile-input-reference.musicxml',
            sha256: sourceDigest(sourceText),
            policy: 'self-authored',
          },
          events: [
            {
              eventId: 'm1-e0',
              pitchMidi: 64,
              acceptedPositions: [{ string: 1, fret: 0 }],
              preferredPosition: { string: 1, fret: 0 },
            },
          ],
        },
      ],
    },
  };
}

function isStructuredBenchmarkFailure(error) {
  assert.equal(error instanceof TeacherFingeringBenchmarkError, true);
  assert.equal(error.code, 'INVALID_TEACHER_FINGERING_BENCHMARK');
  return true;
}

test('rejects proxy benchmark objects without leaking proxy trap exceptions', () => {
  const { benchmark } = benchmarkInput();
  const hostile = new Proxy(benchmark, {
    ownKeys() {
      throw new Error('proxy ownKeys trap must not escape');
    },
  });

  assert.throws(
    () => validateTeacherFingeringBenchmark(hostile),
    isStructuredBenchmarkFailure,
  );
});

test('rejects proxy arrays at the bounded dense-array boundary', () => {
  const { benchmark } = benchmarkInput();
  benchmark.cases = new Proxy(benchmark.cases, {
    ownKeys() {
      throw new Error('proxy array ownKeys trap must not escape');
    },
  });

  assert.throws(
    () => validateTeacherFingeringBenchmark(benchmark),
    isStructuredBenchmarkFailure,
  );
});

test('source verification rejects accessor-backed case fields without invoking them', () => {
  const { benchmark, sourceText } = benchmarkInput();
  const benchmarkCase = structuredClone(benchmark.cases[0]);
  let getterCalls = 0;
  Object.defineProperty(benchmarkCase, 'source', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error('source getter must not be invoked');
    },
  });

  assert.throws(
    () => verifyTeacherBenchmarkCaseSource(benchmarkCase, sourceText),
    isStructuredBenchmarkFailure,
  );
  assert.equal(getterCalls, 0);
});

test('source verification rejects proxy case records through the same structured boundary', () => {
  const { benchmark, sourceText } = benchmarkInput();
  const benchmarkCase = new Proxy(benchmark.cases[0], {
    getPrototypeOf() {
      throw new Error('proxy getPrototypeOf trap must not escape');
    },
  });

  assert.throws(
    () => verifyTeacherBenchmarkCaseSource(benchmarkCase, sourceText),
    isStructuredBenchmarkFailure,
  );
});
