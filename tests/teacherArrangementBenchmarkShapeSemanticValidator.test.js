'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TeacherArrangementBenchmarkShapeSemanticError,
  validateTeacherArrangementBenchmarkShapeSemantics,
} = require('../src/benchmark/teacherArrangementBenchmarkShapeSemanticValidator');
const {
  TeacherArrangementBenchmarkAdmissionError,
  assertTeacherApprovedArrangementBenchmarkAdmission,
} = require('../src/benchmark/teacherArrangementBenchmarkAdmission');

const BENCHMARK_PATH = path.join(
  __dirname,
  '..',
  'benchmarks',
  'teacher-arrangement-v1',
  'benchmark.proposed.json',
);

function readBenchmark() {
  return JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
}

function expectInvalid(fn, field) {
  assert.throws(fn, (error) => (
    error instanceof TeacherArrangementBenchmarkShapeSemanticError
    && error.code === 'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_SHAPE_SEMANTICS'
    && error.details.field === field
  ));
}

test('PA-11.3C validates proposed selected-shape semantics without granting teacher approval', () => {
  const benchmark = readBenchmark();
  assert.equal(validateTeacherArrangementBenchmarkShapeSemantics(benchmark), true);
  assert.throws(
    () => assertTeacherApprovedArrangementBenchmarkAdmission(benchmark),
    (error) => error instanceof TeacherArrangementBenchmarkAdmissionError
      && error.details.field === 'reviewStatus',
  );
});

test('PA-11.3C rejects selected-shape membership/order divergence', () => {
  const benchmark = readBenchmark();
  benchmark.cases[0].acceptedArrangements[0].selectedShapes[0].sourceEventIds.reverse();
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[0].acceptedArrangements[0].selectedShapes[0].sourceEventIds',
  );
});

test('PA-11.3C rejects shape positions that diverge from retained note outcomes', () => {
  const benchmark = readBenchmark();
  benchmark.cases[0].acceptedArrangements[0].selectedShapes[0].positions[0].fret = 6;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[0].acceptedArrangements[0].selectedShapes[0].positions[0]',
  );
});

test('PA-11.3C enforces open-string finger zero', () => {
  const benchmark = readBenchmark();
  benchmark.cases[0].acceptedArrangements[0].selectedShapes[0].fingerAssignments[1].finger = 1;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[0].acceptedArrangements[0].selectedShapes[0].fingerAssignments[1].finger',
  );
});

test('PA-11.3C rejects stored barres that do not equal deterministic finger-derived facts', () => {
  const benchmark = readBenchmark();
  benchmark.cases[0].acceptedArrangements[1].selectedShapes[0].barres[0].startString = 1;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[0].acceptedArrangements[1].selectedShapes[0].barres[0]',
  );
});

test('PA-11.3C binds selected-shape group provenance to sourceSelection', () => {
  const benchmark = readBenchmark();
  benchmark.cases[0].acceptedArrangements[0].selectedShapes[0].sourceGroupId =
    'P2:measure:0:simultaneous:0';
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[0].acceptedArrangements[0].selectedShapes[0].sourceGroupId',
  );
});

test('PA-11.3C rejects retained shape references that do not resolve', () => {
  const benchmark = readBenchmark();
  benchmark.cases[0].acceptedArrangements[0].noteOutcomes[0].selectedShapeId = 'missing-shape';
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[0].acceptedArrangements[0].noteOutcomes[0].selectedShapeId',
  );
});

test('PA-11.3C rejects hostile nested shape arrays', () => {
  const benchmark = readBenchmark();
  benchmark.cases[0].acceptedArrangements[0].selectedShapes[0].positions = new Proxy(
    benchmark.cases[0].acceptedArrangements[0].selectedShapes[0].positions,
    {},
  );
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[0].acceptedArrangements[0].selectedShapes[0].positions',
  );
});
