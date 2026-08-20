'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TeacherArrangementBenchmarkV11SemanticError,
  assertTeacherApprovedV11BenchmarkSemantics,
  validateTeacherArrangementBenchmarkV11Semantics,
} = require('../src/benchmark/teacherArrangementBenchmarkV11Semantics');

const ROOT = path.resolve(__dirname, '..');
const paths = {
  benchmark: path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.v0.2.0.json'),
  approval: path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'approvals', 'teacher-approval-v0.2.0-2026-08-20.json'),
  baseline: path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.json'),
  review: path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'reviews', 'teacher-review-2026-08-20.json'),
};

function text(name) { return fs.readFileSync(paths[name], 'utf8'); }
function json(name) { return JSON.parse(text(name)); }
function clone(value) { return structuredClone(value); }

function expectSemanticFailure(benchmark) {
  assert.throws(
    () => validateTeacherArrangementBenchmarkV11Semantics(benchmark, json('baseline'), json('review')),
    (error) => error instanceof TeacherArrangementBenchmarkV11SemanticError,
  );
}

test('PA-11.3G validates the exact admitted benchmark through complete 1.1 semantics', () => {
  const evidence = assertTeacherApprovedV11BenchmarkSemantics(
    text('benchmark'), text('approval'), text('baseline'), text('review'),
  );
  assert.equal(evidence.effectiveReviewStatus, 'teacher-approved');
  assert.equal(evidence.semanticStatus, 'VALIDATED');
  assert.equal(evidence.authority, 'evaluation-only');
  assert.equal(Object.isFrozen(evidence), true);
});

test('PA-11.3G rejects broken baseline references', () => {
  const benchmark = clone(json('benchmark'));
  benchmark.cases[0].acceptedArrangements[0].baselineArrangementId = 'missing-arrangement';
  expectSemanticFailure(benchmark);
});

test('PA-11.3G rejects duplicate or incomplete realized-tone mapping coverage', () => {
  const duplicate = clone(json('benchmark'));
  duplicate.cases[1].sourceMappings[1].realizedToneIds[0] = duplicate.cases[1].sourceMappings[0].realizedToneIds[0];
  expectSemanticFailure(duplicate);

  const incomplete = clone(json('benchmark'));
  incomplete.cases[1].sourceMappings[0].realizedToneIds.pop();
  expectSemanticFailure(incomplete);
});

test('PA-11.3G rejects pitch-class-changing realized tones', () => {
  const benchmark = clone(json('benchmark'));
  benchmark.cases[1].acceptedArrangements[0].realizedTones[0].targetMidi = 49;
  expectSemanticFailure(benchmark);
});

test('PA-11.3G rejects selected-shape string/fret/finger/MIDI disagreement', () => {
  for (const mutation of [
    (b) => { b.cases[1].acceptedArrangements[0].selectedShape.strings[1].fret = 4; },
    (b) => { b.cases[1].acceptedArrangements[0].selectedShape.strings[1].finger = 2; },
    (b) => { b.cases[1].acceptedArrangements[0].selectedShape.strings[1].midi = 49; },
  ]) {
    const benchmark = clone(json('benchmark'));
    mutation(benchmark);
    expectSemanticFailure(benchmark);
  }
});

test('PA-11.3G rejects duplicate guitar strings and invalid open-string fingering', () => {
  const duplicateString = clone(json('benchmark'));
  duplicateString.cases[1].acceptedArrangements[0].realizedTones[1].string = 5;
  expectSemanticFailure(duplicateString);

  const openFinger = clone(json('benchmark'));
  const arrangement = openFinger.cases[1].acceptedArrangements[0];
  arrangement.realizedTones[2].finger = 1;
  arrangement.selectedShape.strings.find((entry) => entry.string === 3).finger = 1;
  expectSemanticFailure(openFinger);
});

test('PA-11.3G rejects non-monotonic static finger order', () => {
  const benchmark = clone(json('benchmark'));
  const arrangement = benchmark.cases[1].acceptedArrangements[0];
  arrangement.realizedTones[0].finger = 1;
  arrangement.realizedTones[1].finger = 2;
  arrangement.selectedShape.strings.find((entry) => entry.string === 5).finger = 1;
  arrangement.selectedShape.strings.find((entry) => entry.string === 4).finger = 2;
  expectSemanticFailure(benchmark);
});

test('PA-11.3G keeps teacher preference uninferred and physical status mandatory', () => {
  const preference = clone(json('benchmark'));
  preference.cases[1].preferredArrangementId = preference.cases[1].acceptedArrangements[0].arrangementId;
  expectSemanticFailure(preference);

  const physical = clone(json('benchmark'));
  physical.cases[2].acceptedArrangements[0].selectedShape.physicalStatus = 'REJECTED_BY_POLICY';
  expectSemanticFailure(physical);
});
