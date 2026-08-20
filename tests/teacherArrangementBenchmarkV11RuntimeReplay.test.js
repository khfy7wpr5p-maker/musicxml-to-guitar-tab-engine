'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const publicApi = require('../src');
const {
  TeacherArrangementBenchmarkV11RuntimeReplayError,
  replayRealizedVoicingShapeEvaluation,
  replayTeacherApprovedV11BenchmarkRuntime,
} = require('../src/benchmark/teacherArrangementBenchmarkV11RuntimeReplay');

const ROOT = path.resolve(__dirname, '..');
const benchmarkPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.v0.2.0.json');
const approvalPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'approvals', 'teacher-approval-v0.2.0-2026-08-20.json');
const baselinePath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.json');
const reviewPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'reviews', 'teacher-review-2026-08-20.json');

function text(filePath) { return fs.readFileSync(filePath, 'utf8'); }
function json(filePath) { return JSON.parse(text(filePath)); }
function clone(value) { return structuredClone(value); }

function sourceEntries() {
  const baseline = json(baselinePath);
  return baseline.cases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    sourceText: text(path.join(ROOT, benchmarkCase.source.path)),
  }));
}

function input(entries = sourceEntries()) {
  return {
    benchmarkText: text(benchmarkPath),
    approvalText: text(approvalPath),
    baselineText: text(baselinePath),
    reviewText: text(reviewPath),
    sourceEntries: entries,
  };
}

test('PA-11.3H replays the exact teacher-approved v1.1 benchmark through bound MusicXML and PA-8/PA-9 evaluation paths', () => {
  const replay = replayTeacherApprovedV11BenchmarkRuntime(input());
  assert.equal(replay.documentType, 'TeacherArrangementBenchmarkV11RuntimeReplay');
  assert.equal(replay.contractVersion, '1.1.0');
  assert.equal(replay.authority, 'evaluation-only');
  assert.equal(replay.effectiveReviewStatus, 'teacher-approved');
  assert.equal(replay.semanticStatus, 'VALIDATED');
  assert.equal(replay.caseCount, 4);

  assert.equal(replay.cases[0].mode, 'BASELINE_REFERENCE');
  assert.equal(replay.cases[0].arrangements.length, 2);
  assert.equal(replay.cases[0].arrangements[0].status, 'RUNTIME_REPLAY_MATCH');
  assert.equal(replay.cases[0].arrangements[1].status, 'RUNTIME_REPLAY_MATCH');

  assert.equal(replay.cases[1].mode, 'REALIZED_VOICING');
  assert.equal(replay.cases[1].arrangements[0].status, 'PLAYABLE_WITHIN_POLICY');
  assert.equal(replay.cases[1].arrangements[0].realizedToneCount, 5);
  assert.deepEqual(replay.cases[1].arrangements[0].reasonCodes, []);

  assert.equal(replay.cases[2].mode, 'REALIZED_VOICING');
  assert.equal(replay.cases[2].arrangements[0].status, 'PLAYABLE_WITHIN_POLICY');
  assert.equal(replay.cases[2].arrangements[0].realizedToneCount, 5);
  assert.deepEqual(replay.cases[2].arrangements[0].reasonCodes, []);

  assert.equal(replay.cases[3].mode, 'BASELINE_REFERENCE');
  assert.equal(replay.cases[3].arrangements[0].status, 'NO_SELECTED_MULTI_NOTE_SHAPE');
  assert.equal(Object.isFrozen(replay), true);
  assert.equal(Object.isFrozen(replay.cases), true);
});

test('PA-11.3H fails closed when any bound MusicXML source bytes change', () => {
  const entries = sourceEntries();
  entries[1] = { ...entries[1], sourceText: `${entries[1].sourceText} ` };
  assert.throws(
    () => replayTeacherApprovedV11BenchmarkRuntime(input(entries)),
    (error) => error instanceof TeacherArrangementBenchmarkV11RuntimeReplayError,
  );
});

test('PA-11.3H evaluation adapter reproduces exact open C and Cmaj7 teacher shapes in PA-8/PA-9', () => {
  const benchmark = json(benchmarkPath);
  const c = replayRealizedVoicingShapeEvaluation(benchmark.cases[1].acceptedArrangements[0]);
  const cmaj7 = replayRealizedVoicingShapeEvaluation(benchmark.cases[2].acceptedArrangements[0]);
  assert.equal(c.status, 'PLAYABLE_WITHIN_POLICY');
  assert.equal(c.realizedToneCount, 5);
  assert.equal(cmaj7.status, 'PLAYABLE_WITHIN_POLICY');
  assert.equal(cmaj7.realizedToneCount, 5);
});

test('PA-11.3H rejects a synthetically replayed realized voicing that PA-9 deems physically invalid', () => {
  const benchmark = json(benchmarkPath);
  const arrangement = clone(benchmark.cases[1].acceptedArrangements[0]);
  const tone = arrangement.realizedTones[0];
  tone.fret = 10;
  tone.targetMidi = 55;
  const shapeString = arrangement.selectedShape.strings.find((entry) => entry.string === tone.string);
  shapeString.fret = 10;
  shapeString.midi = 55;

  assert.throws(
    () => replayRealizedVoicingShapeEvaluation(arrangement),
    (error) => error instanceof TeacherArrangementBenchmarkV11RuntimeReplayError,
  );
});

test('PA-11.3H remains internal and does not expand the package-root production API', () => {
  assert.equal(Object.hasOwn(publicApi, 'replayTeacherApprovedV11BenchmarkRuntime'), false);
  assert.equal(Object.hasOwn(publicApi, 'replayRealizedVoicingShapeEvaluation'), false);
});
