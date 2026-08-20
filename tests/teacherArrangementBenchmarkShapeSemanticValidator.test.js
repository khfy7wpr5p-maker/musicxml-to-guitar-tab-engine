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

test('PA-11.3C enforces ordered fretting fingers across different frets', () => {
  const benchmark = readBenchmark();
  const shape = benchmark.cases[1].acceptedArrangements[1].selectedShapes[0];
  shape.fingerAssignments[0].finger = 2;
  shape.fingerAssignments[1].finger = 3;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[1].acceptedArrangements[1].selectedShapes[0].fingerAssignments',
  );
});

test('PA-11.3C rejects two selected positions on the same string', () => {
  const benchmark = readBenchmark();
  const arrangement = benchmark.cases[1].acceptedArrangements[1];
  arrangement.noteOutcomes[0].selectedPosition = { string: 3, fret: 5 };
  arrangement.selectedShapes[0].positions[0].string = 3;
  arrangement.selectedShapes[0].positions[0].fret = 5;
  arrangement.selectedShapes[0].fingerAssignments[0].string = 3;
  arrangement.selectedShapes[0].fingerAssignments[0].fret = 5;
  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[1].acceptedArrangements[1].selectedShapes[0].positions[1].string',
  );
});

test('PA-11.3C rejects a barre that would alter an active lower-fret pitch', () => {
  const benchmark = readBenchmark();
  const arrangement = benchmark.cases[1].acceptedArrangements[0];
  const shape = arrangement.selectedShapes[0];

  for (const decision of arrangement.decisions) {
    decision.decisionType = 'REVOICED';
  }
  for (const outcome of arrangement.noteOutcomes) {
    outcome.decisionType = 'REVOICED';
  }

  const targets = [
    { targetMidi: 60, string: 3, fret: 5, finger: 2 },
    { targetMidi: 69, string: 1, fret: 5, finger: 2 },
    { targetMidi: 62, string: 2, fret: 3, finger: 1 },
  ];

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    arrangement.noteOutcomes[index].targetMidi = target.targetMidi;
    arrangement.noteOutcomes[index].selectedPosition = {
      string: target.string,
      fret: target.fret,
    };
    shape.positions[index].targetMidi = target.targetMidi;
    shape.positions[index].string = target.string;
    shape.positions[index].fret = target.fret;
    shape.fingerAssignments[index].targetMidi = target.targetMidi;
    shape.fingerAssignments[index].string = target.string;
    shape.fingerAssignments[index].fret = target.fret;
    shape.fingerAssignments[index].finger = target.finger;
  }

  expectInvalid(
    () => validateTeacherArrangementBenchmarkShapeSemantics(benchmark),
    'cases[1].acceptedArrangements[0].selectedShapes[0].barres',
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
