'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TeacherArrangementBenchmarkRuntimeReplayError,
  replayTeacherArrangementBenchmarkRuntime,
} = require('../src/benchmark/teacherArrangementBenchmarkRuntimeReplay');
const {
  TeacherArrangementBenchmarkAdmissionError,
  assertTeacherApprovedArrangementBenchmarkAdmission,
} = require('../src/benchmark/teacherArrangementBenchmarkAdmission');

const REPO_ROOT = path.resolve(__dirname, '..');
const BENCHMARK_PATH = path.join(
  REPO_ROOT,
  'benchmarks',
  'teacher-arrangement-v1',
  'benchmark.proposed.json',
);

function readBenchmark() {
  return JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
}

function sourceEntries(benchmark) {
  return benchmark.cases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    sourceText: fs.readFileSync(path.join(REPO_ROOT, benchmarkCase.source.path), 'utf8'),
  }));
}

function expectInvalid(fn, field) {
  assert.throws(fn, (error) => (
    error instanceof TeacherArrangementBenchmarkRuntimeReplayError
    && error.code === 'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_RUNTIME_REPLAY'
    && error.details.field === field
  ));
}

test('PA-11.3E replays proposed selected shapes through current PA-8/PA-9 without granting authority', () => {
  const benchmark = readBenchmark();
  const report = replayTeacherArrangementBenchmarkRuntime({
    benchmark,
    sourceEntries: sourceEntries(benchmark),
  });

  assert.equal(report.documentType, 'TeacherArrangementBenchmarkRuntimeReplay');
  assert.equal(report.contractVersion, '1.0.0');
  assert.equal(report.mode, 'evaluation-runtime-replay');
  assert.equal(report.authority, 'none');
  assert.equal(report.benchmarkReviewStatus, 'proposed');
  assert.equal(report.caseCount, benchmark.cases.length);
  assert.equal(report.selectedShapeReplayCount, 5);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.cases), true);

  const arrangements = report.cases.flatMap((benchmarkCase) => benchmarkCase.arrangements);
  assert.equal(arrangements.filter((item) => item.status === 'RUNTIME_REPLAY_MATCH').length, 5);
  assert.equal(arrangements.filter((item) => item.status === 'NO_SELECTED_MULTI_NOTE_SHAPE').length, 1);
  assert.ok(
    arrangements
      .filter((item) => item.status === 'RUNTIME_REPLAY_MATCH')
      .flatMap((item) => item.shapes)
      .every((shape) => shape.status === 'PLAYABLE_WITHIN_POLICY' && shape.reasonCodes.length === 0),
  );

  assert.throws(
    () => assertTeacherApprovedArrangementBenchmarkAdmission(benchmark),
    (error) => error instanceof TeacherArrangementBenchmarkAdmissionError
      && error.details.field === 'reviewStatus',
  );
});

test('PA-11.3E rejects a shape that is internally coherent but rejected by current PA-9 policy', () => {
  const benchmark = readBenchmark();
  const arrangement = benchmark.cases[1].acceptedArrangements[0];
  const shape = arrangement.selectedShapes[0];

  const replacements = [
    { string: 5, fret: 15, finger: 3 },
    { string: 3, fret: 9, finger: 2 },
    { string: 1, fret: 3, finger: 1 },
  ];

  for (let index = 0; index < arrangement.noteOutcomes.length; index += 1) {
    const outcome = arrangement.noteOutcomes[index];
    const replacement = replacements[index];
    outcome.selectedPosition = { string: replacement.string, fret: replacement.fret };
    shape.positions[index] = {
      sourceEventId: outcome.sourceEventId,
      targetMidi: outcome.targetMidi,
      string: replacement.string,
      fret: replacement.fret,
    };
    shape.fingerAssignments[index] = {
      sourceEventId: outcome.sourceEventId,
      targetMidi: outcome.targetMidi,
      string: replacement.string,
      fret: replacement.fret,
      finger: replacement.finger,
    };
  }
  shape.barres = [];
  shape.physicalStatus = 'PLAYABLE_WITHIN_POLICY';

  expectInvalid(
    () => replayTeacherArrangementBenchmarkRuntime({
      benchmark,
      sourceEntries: sourceEntries(benchmark),
    }),
    'cases[1].acceptedArrangements[0].selectedShapes[0]',
  );
});

test('PA-11.3E fails closed when PA-11.3D source replay fails', () => {
  const benchmark = readBenchmark();
  const entries = sourceEntries(benchmark);
  entries[0].sourceText += '\n';

  expectInvalid(
    () => replayTeacherArrangementBenchmarkRuntime({ benchmark, sourceEntries: entries }),
    'input',
  );
});
