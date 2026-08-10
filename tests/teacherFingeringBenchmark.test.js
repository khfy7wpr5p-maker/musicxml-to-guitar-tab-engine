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
  assertTeacherApprovedBenchmark,
  createTeacherFingeringBenchmark,
  validateTeacherFingeringBenchmark,
  verifyTeacherBenchmarkCaseSource,
} = require('../src/benchmark/teacherFingeringBenchmark');

function sourceDigest(sourceText) {
  return createHash('sha256').update(sourceText, 'utf8').digest('hex');
}

function standardConfiguration() {
  const value = createGuitarConfiguration();
  return {
    contractVersion: GUITAR_CONFIGURATION_VERSION,
    value: {
      tuning: value.tuning.map((entry) => ({ ...entry })),
      minimumFret: value.minimumFret,
      maximumFret: value.maximumFret,
    },
  };
}

function validInput(overrides = {}) {
  const sourceText = '<score-partwise version="4.0" />\n';
  return {
    documentType: 'TeacherFingeringBenchmark',
    contractVersion: TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION,
    benchmarkId: 'teacher-fingering-v1',
    benchmarkVersion: '1.0.0',
    reviewStatus: 'proposed',
    guitarConfiguration: standardConfiguration(),
    cases: [
      {
        caseId: 'open-e4',
        pedagogicalFocus: 'open-string-reference',
        source: {
          path: 'benchmarks/teacher-fingering-v1/fixtures/open-e4.musicxml',
          sha256: sourceDigest(sourceText),
          policy: 'self-authored',
        },
        events: [
          {
            eventId: 'm1-e0',
            pitchMidi: 64,
            acceptedPositions: [
              { string: 1, fret: 0 },
              { string: 2, fret: 5 },
            ],
            preferredPosition: { string: 1, fret: 0 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function expectInvalid(input, expectedField) {
  assert.throws(
    () => validateTeacherFingeringBenchmark(input),
    (error) => {
      assert.equal(error instanceof TeacherFingeringBenchmarkError, true);
      assert.equal(error.code, 'INVALID_TEACHER_FINGERING_BENCHMARK');
      if (expectedField !== undefined) {
        assert.equal(error.details.field, expectedField);
      }
      return true;
    },
  );
}

test('creates a deeply frozen internal TeacherFingeringBenchmark 1.0.0 record', () => {
  const benchmark = createTeacherFingeringBenchmark(validInput());

  assert.equal(benchmark.contractVersion, '1.0.0');
  assert.equal(Object.isFrozen(benchmark), true);
  assert.equal(Object.isFrozen(benchmark.guitarConfiguration), true);
  assert.equal(Object.isFrozen(benchmark.guitarConfiguration.value.tuning), true);
  assert.equal(Object.isFrozen(benchmark.cases), true);
  assert.equal(Object.isFrozen(benchmark.cases[0].source), true);
  assert.equal(Object.isFrozen(benchmark.cases[0].events), true);
  assert.equal(Object.isFrozen(benchmark.cases[0].events[0].acceptedPositions), true);
});

test('accepts teacher-approved review state separately from proposal state', () => {
  const approved = createTeacherFingeringBenchmark(validInput({
    reviewStatus: 'teacher-approved',
  }));

  assert.equal(assertTeacherApprovedBenchmark(approved), true);
  assert.throws(
    () => assertTeacherApprovedBenchmark(createTeacherFingeringBenchmark(validInput())),
    /teacher-approved/,
  );
});

test('verifies exact fixture content against the case SHA-256 binding', () => {
  const sourceText = '<score-partwise version="4.0" />\n';
  const benchmark = createTeacherFingeringBenchmark(validInput());
  const benchmarkCase = benchmark.cases[0];

  assert.equal(verifyTeacherBenchmarkCaseSource(benchmarkCase, sourceText), true);
  assert.throws(
    () => verifyTeacherBenchmarkCaseSource(benchmarkCase, `${sourceText} `),
    /SHA-256/,
  );
});

test('rejects unsupported top-level and nested fields including symbol properties', () => {
  expectInvalid({ ...validInput(), unknown: true }, 'unknown');

  const nested = validInput();
  nested.cases[0].source.unknown = true;
  expectInvalid(nested, 'cases[0].source.unknown');

  const symbolInput = validInput();
  symbolInput[Symbol('hidden')] = 'value';
  expectInvalid(symbolInput, 'symbol');
});

test('rejects non-enumerable benchmark data that could escape ordinary cloning', () => {
  const input = validInput();
  Object.defineProperty(input.cases[0], 'hidden', {
    value: true,
    enumerable: false,
  });

  expectInvalid(input, 'cases[0].hidden');
});

test('rejects duplicate case identities and duplicate event identities', () => {
  const duplicateCase = validInput();
  duplicateCase.cases.push(structuredClone(duplicateCase.cases[0]));
  expectInvalid(duplicateCase, 'cases[1].caseId');

  const duplicateEvent = validInput();
  duplicateEvent.cases[0].events.push(structuredClone(duplicateEvent.cases[0].events[0]));
  expectInvalid(duplicateEvent, 'cases[0].events[1].eventId');
});

test('rejects unsafe fixture paths and unsupported source policies', () => {
  for (const path of [
    '../secret.musicxml',
    '/tmp/secret.musicxml',
    'benchmarks/teacher-fingering-v1/fixtures/../secret.musicxml',
    'benchmarks\\teacher-fingering-v1\\fixtures\\bad.musicxml',
    'benchmarks/teacher-fingering-v1/fixtures/not-xml.txt',
  ]) {
    const input = validInput();
    input.cases[0].source.path = path;
    expectInvalid(input, 'cases[0].source.path');
  }

  const policy = validInput();
  policy.cases[0].source.policy = 'random-internet';
  expectInvalid(policy, 'cases[0].source.policy');
});

test('rejects malformed source digests and malformed deterministic event identities', () => {
  const digest = validInput();
  digest.cases[0].source.sha256 = 'ABC';
  expectInvalid(digest, 'cases[0].source.sha256');

  const eventId = validInput();
  eventId.cases[0].events[0].eventId = 'event-1';
  expectInvalid(eventId, 'cases[0].events[0].eventId');
});

test('rejects accepted positions that are duplicated, out of bounds, or pitch-inconsistent', () => {
  const duplicate = validInput();
  duplicate.cases[0].events[0].acceptedPositions.push({ string: 1, fret: 0 });
  expectInvalid(duplicate, 'cases[0].events[0].acceptedPositions[2]');

  const outOfBounds = validInput();
  outOfBounds.cases[0].events[0].acceptedPositions[0] = { string: 7, fret: 0 };
  expectInvalid(outOfBounds, 'cases[0].events[0].acceptedPositions[0].string');

  const wrongPitch = validInput();
  wrongPitch.cases[0].events[0].acceptedPositions[0] = { string: 1, fret: 1 };
  expectInvalid(wrongPitch, 'cases[0].events[0].acceptedPositions[0]');
});

test('requires preferredPosition to be null or an exact member of acceptedPositions', () => {
  const input = validInput();
  input.cases[0].events[0].preferredPosition = { string: 3, fret: 9 };
  expectInvalid(input, 'cases[0].events[0].preferredPosition');

  input.cases[0].events[0].preferredPosition = null;
  assert.equal(validateTeacherFingeringBenchmark(input), true);
});

test('enforces bounded benchmark, case, event, and accepted-position counts', () => {
  const emptyCases = validInput({ cases: [] });
  expectInvalid(emptyCases, 'cases');

  const emptyEvents = validInput();
  emptyEvents.cases[0].events = [];
  expectInvalid(emptyEvents, 'cases[0].events');

  const tooManyAccepted = validInput();
  tooManyAccepted.cases[0].events[0].acceptedPositions = Array.from(
    { length: 7 },
    (_, index) => ({ string: 1, fret: index }),
  );
  tooManyAccepted.cases[0].events[0].pitchMidi = 64;
  expectInvalid(tooManyAccepted, 'cases[0].events[0].acceptedPositions');
});

test('does not expose TeacherFingeringBenchmark APIs from the package root', () => {
  const publicApi = require('../src');

  for (const name of [
    'TEACHER_FINGERING_BENCHMARK_CONTRACT_VERSION',
    'TeacherFingeringBenchmarkError',
    'assertTeacherApprovedBenchmark',
    'createTeacherFingeringBenchmark',
    'validateTeacherFingeringBenchmark',
    'verifyTeacherBenchmarkCaseSource',
  ]) {
    assert.equal(Object.hasOwn(publicApi, name), false, `${name} must remain internal`);
  }
});
