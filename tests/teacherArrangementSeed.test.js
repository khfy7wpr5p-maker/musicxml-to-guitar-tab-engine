'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const BENCHMARK_PATH = path.join(
  REPO_ROOT,
  'benchmarks',
  'teacher-arrangement-v1',
  'benchmark.proposed.json',
);
const ALLOWED_INITIAL_DECISIONS = new Set([
  'PRESERVED',
  'OMITTED',
  'OCTAVE_DISPLACED',
  'CHORD_REDUCED',
]);
const DEFERRED_DECISIONS = new Set([
  'VOICE_REDISTRIBUTED',
  'REVOICED',
  'ARPEGGIATED',
]);

function readBenchmark() {
  return JSON.parse(fs.readFileSync(BENCHMARK_PATH, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function tuningByString(benchmark) {
  return new Map(benchmark.guitar.tuning.map((entry) => [entry.string, entry.midi]));
}

test('PA-11.1 seed remains proposed evaluation-only evidence', () => {
  const benchmark = readBenchmark();
  assert.equal(benchmark.documentType, 'TeacherArrangementBenchmark');
  assert.equal(benchmark.contractVersion, '1.0.0');
  assert.equal(benchmark.reviewStatus, 'proposed');
  assert.notEqual(benchmark.reviewStatus, 'teacher-approved');
  assert.equal(benchmark.benchmarkId, 'teacher-arrangement-seed-v1');
  assert.equal(benchmark.benchmarkVersion, '0.1.0');
  assert.deepEqual(benchmark.physicalPolicy, {
    documentType: 'PhysicalPlayabilityValidation',
    contractVersion: '2.0.0',
    policy: 'CONSERVATIVE_STATIC_LEFT_HAND_2.0',
  });
  assert.equal(benchmark.guitar.minimumFret, 0);
  assert.equal(benchmark.guitar.maximumFret, 20);
  assert.deepEqual(
    benchmark.guitar.tuning,
    [
      { string: 1, midi: 64 },
      { string: 2, midi: 59 },
      { string: 3, midi: 55 },
      { string: 4, midi: 50 },
      { string: 5, midi: 45 },
      { string: 6, midi: 40 },
    ],
  );
});

test('PA-11.1 fixtures are repository-local self-authored bytes bound by SHA-256', () => {
  const benchmark = readBenchmark();
  const caseIds = benchmark.cases.map((item) => item.caseId);
  assert.deepEqual(caseIds, [...caseIds].sort());
  assert.equal(new Set(caseIds).size, caseIds.length);

  for (const item of benchmark.cases) {
    assert.equal(item.source.policy, 'self-authored');
    assert.equal(path.isAbsolute(item.source.path), false);
    assert.equal(item.source.path.includes('\\'), false);
    assert.equal(item.source.path.split('/').includes('..'), false);
    assert.match(item.source.sha256, /^[0-9a-f]{64}$/);
    const fixturePath = path.join(REPO_ROOT, item.source.path);
    assert.equal(sha256(fixturePath), item.source.sha256);
    assert.match(fs.readFileSync(fixturePath, 'utf8'), /<score-partwise version="4\.0">/);
  }
});

test('PA-11.1 seed excludes deferred transformations and does not infer a preferred arrangement', () => {
  const benchmark = readBenchmark();
  for (const item of benchmark.cases) {
    assert.equal(item.preferredArrangementId, null);
    assert.ok(item.acceptedArrangements.length > 0);
    const arrangementIds = item.acceptedArrangements.map((arrangement) => arrangement.arrangementId);
    assert.equal(new Set(arrangementIds).size, arrangementIds.length);
    for (const arrangement of item.acceptedArrangements) {
      assert.equal(arrangement.reviewNotesCode, null);
      for (const decision of arrangement.decisions) {
        assert.equal(ALLOWED_INITIAL_DECISIONS.has(decision.decisionType), true);
        assert.equal(DEFERRED_DECISIONS.has(decision.decisionType), false);
      }
    }
  }
});

test('PA-11.1 complete proposals preserve exact coverage and physical selected-position facts', () => {
  const benchmark = readBenchmark();
  const tuning = tuningByString(benchmark);

  for (const item of benchmark.cases) {
    const expectedEvents = item.sourceSelection.sourceEventIds;
    assert.equal(new Set(expectedEvents).size, expectedEvents.length);

    for (const arrangement of item.acceptedArrangements) {
      const decisionCoverage = arrangement.decisions.flatMap((decision) => decision.sourceEventIds);
      assert.deepEqual([...decisionCoverage].sort(), [...expectedEvents].sort());
      assert.equal(new Set(decisionCoverage).size, decisionCoverage.length);
      assert.deepEqual(
        arrangement.noteOutcomes.map((outcome) => outcome.sourceEventId),
        expectedEvents,
      );

      const retained = [];
      for (const outcome of arrangement.noteOutcomes) {
        if (outcome.disposition === 'OMITTED') {
          assert.equal(outcome.targetMidi, null);
          assert.equal(outcome.selectedPosition, null);
          assert.equal(outcome.selectedShapeId, null);
          continue;
        }
        assert.equal(outcome.disposition, 'RETAINED');
        const selected = outcome.selectedPosition;
        assert.ok(selected);
        assert.ok(selected.string >= 1 && selected.string <= 6);
        assert.ok(selected.fret >= benchmark.guitar.minimumFret);
        assert.ok(selected.fret <= benchmark.guitar.maximumFret);
        assert.equal(tuning.get(selected.string) + selected.fret, outcome.targetMidi);
        if (outcome.decisionType === 'PRESERVED') {
          assert.equal(outcome.targetMidi, outcome.sourceMidi);
        }
        if (outcome.decisionType === 'OCTAVE_DISPLACED') {
          assert.notEqual(outcome.targetMidi, outcome.sourceMidi);
          assert.equal(Number.isInteger((outcome.targetMidi - outcome.sourceMidi) / 12), true);
          assert.ok(outcome.targetMidi >= 40 && outcome.targetMidi <= 84);
        }
        retained.push(outcome);
      }

      if (retained.length >= 2) {
        assert.equal(arrangement.selectedShapes.length, 1);
        const shape = arrangement.selectedShapes[0];
        assert.equal(shape.physicalStatus, 'PLAYABLE_WITHIN_POLICY');
        assert.deepEqual(
          [...shape.sourceEventIds].sort(),
          retained.map((outcome) => outcome.sourceEventId).sort(),
        );
        assert.equal(new Set(shape.positions.map((position) => position.string)).size, shape.positions.length);
        assert.ok(retained.every((outcome) => outcome.selectedShapeId === shape.shapeId));
        for (const assignment of shape.fingerAssignments) {
          if (assignment.fret === 0) {
            assert.equal(assignment.finger, 0);
          } else {
            assert.ok(assignment.finger >= 1 && assignment.finger <= 4);
          }
        }
      } else {
        assert.deepEqual(arrangement.selectedShapes, []);
        assert.ok(retained.every((outcome) => outcome.selectedShapeId === null));
      }
    }
  }
});
