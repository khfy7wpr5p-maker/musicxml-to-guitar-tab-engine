'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TeacherArrangementBenchmarkCoreSemanticError,
  validateTeacherArrangementBenchmarkCoreSemantics,
} = require('../src/benchmark/teacherArrangementBenchmarkCoreSemanticValidator');
const {
  TeacherArrangementBenchmarkAdmissionError,
  assertTeacherApprovedArrangementBenchmarkAdmission,
} = require('../src/benchmark/teacherArrangementBenchmarkAdmission');

const BENCHMARK_PATH = path.join(__dirname, '..', 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.json');

function readBenchmark() {
  return JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
}

function expectInvalid(fn, field) {
  assert.throws(fn, (error) => (
    error instanceof TeacherArrangementBenchmarkCoreSemanticError
    && error.code === 'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_CORE_SEMANTICS'
    && error.details.field === field
  ));
}

test('PA-11.3B validates proposed core semantics without granting teacher approval', () => {
  const benchmark = readBenchmark();
  assert.equal(validateTeacherArrangementBenchmarkCoreSemantics(benchmark), true);
  assert.throws(
    () => assertTeacherApprovedArrangementBenchmarkAdmission(benchmark),
    (error) => error instanceof TeacherArrangementBenchmarkAdmissionError
      && error.details.field === 'reviewStatus',
  );
});

test('PA-11.3B rejects duplicate decision coverage and outcome/decision mismatch', () => {
  const duplicate = readBenchmark();
  duplicate.cases[0].acceptedArrangements[0].decisions[1].sourceEventIds[0] =
    duplicate.cases[0].acceptedArrangements[0].decisions[0].sourceEventIds[0];
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(duplicate),
    'cases[0].acceptedArrangements[0].decisions[1].sourceEventIds',
  );

  const mismatch = readBenchmark();
  mismatch.cases[0].acceptedArrangements[0].noteOutcomes[0].decisionType = 'OCTAVE_DISPLACED';
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(mismatch),
    'cases[0].acceptedArrangements[0].noteOutcomes[0].decisionType',
  );
});

test('PA-11.3B rejects fabricated omitted facts and invalid octave displacement', () => {
  const fabricated = readBenchmark();
  fabricated.cases[2].acceptedArrangements[0].noteOutcomes[1].targetMidi = 64;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(fabricated),
    'cases[2].acceptedArrangements[0].noteOutcomes[1]',
  );

  const octave = readBenchmark();
  octave.cases[3].acceptedArrangements[0].noteOutcomes[0].targetMidi = 75;
  octave.cases[3].acceptedArrangements[0].noteOutcomes[0].selectedPosition.fret = 11;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(octave),
    'cases[3].acceptedArrangements[0].noteOutcomes[0].targetMidi',
  );
});

test('PA-11.3B rejects selected-position pitch mismatch and malformed source selection', () => {
  const pitch = readBenchmark();
  pitch.cases[0].acceptedArrangements[0].noteOutcomes[0].selectedPosition.fret = 2;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(pitch),
    'cases[0].acceptedArrangements[0].noteOutcomes[0].selectedPosition',
  );

  const source = readBenchmark();
  source.cases[0].sourceSelection.sourceEventIds[0] = 'P2:measure:0:note:0';
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(source),
    'cases[0].sourceSelection.sourceEventIds[0]',
  );
});

test('PA-11.3B rejects hostile nested accessor/proxy structures', () => {
  const accessor = readBenchmark();
  Object.defineProperty(accessor.cases[0].sourceSelection, 'partId', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(accessor),
    'cases[0].sourceSelection.partId',
  );

  const proxied = readBenchmark();
  proxied.cases[0].acceptedArrangements[0].decisions = new Proxy(
    proxied.cases[0].acceptedArrangements[0].decisions,
    {},
  );
  expectInvalid(
    () => validateTeacherArrangementBenchmarkCoreSemantics(proxied),
    'cases[0].acceptedArrangements[0].decisions',
  );
});
