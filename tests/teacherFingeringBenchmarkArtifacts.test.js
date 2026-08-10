'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { convertMusicXmlToCanonicalTab } = require('../src');
const {
  assertTeacherApprovedBenchmark,
  createTeacherFingeringBenchmark,
  verifyTeacherBenchmarkCaseSource,
} = require('../src/benchmark/teacherFingeringBenchmark');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const BENCHMARK_ROOT = path.join(REPOSITORY_ROOT, 'benchmarks', 'teacher-fingering-v1');
const FIXTURE_ROOT = path.join(BENCHMARK_ROOT, 'fixtures');
const MANIFEST_PATH = path.join(BENCHMARK_ROOT, 'benchmark.json');

function loadBenchmark() {
  return createTeacherFingeringBenchmark(
    JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')),
  );
}

function samePosition(left, right) {
  return left.string === right.string && left.fret === right.fret;
}

function noteEvents(canonicalTabResult) {
  return canonicalTabResult.measures.flatMap((measure) =>
    measure.events.filter((event) => event.type === 'note'));
}

test('ships a bounded proposed B1 manifest for explicit teacher review', () => {
  const benchmark = loadBenchmark();

  assert.equal(benchmark.benchmarkId, 'teacher-fingering-v1');
  assert.equal(benchmark.benchmarkVersion, '1.0.0');
  assert.equal(benchmark.reviewStatus, 'proposed');
  assert.equal(benchmark.cases.length, 8);
  assert.equal(
    benchmark.cases.reduce((count, benchmarkCase) => count + benchmarkCase.events.length, 0),
    32,
  );
  assert.equal(
    benchmark.cases.every((benchmarkCase) => benchmarkCase.source.policy === 'self-authored'),
    true,
  );
  assert.throws(
    () => assertTeacherApprovedBenchmark(benchmark),
    /teacher-approved/,
  );
});

test('binds every benchmark case to an exact repository-local MusicXML fixture', () => {
  const benchmark = loadBenchmark();
  const expectedFixtureRoot = `${FIXTURE_ROOT}${path.sep}`;

  for (const benchmarkCase of benchmark.cases) {
    const fixturePath = path.resolve(REPOSITORY_ROOT, benchmarkCase.source.path);
    assert.equal(
      fixturePath.startsWith(expectedFixtureRoot),
      true,
      `${benchmarkCase.caseId} escaped the fixed fixture root`,
    );
    assert.equal(fs.existsSync(fixturePath), true, `${benchmarkCase.caseId} fixture is missing`);
    const sourceText = fs.readFileSync(fixturePath, 'utf8');
    assert.equal(verifyTeacherBenchmarkCaseSource(benchmarkCase, sourceText), true);
  }
});

test('keeps proposed labels aligned with supported source events and physical candidate membership', () => {
  const benchmark = loadBenchmark();
  const guitar = benchmark.guitarConfiguration.value;

  for (const benchmarkCase of benchmark.cases) {
    const fixturePath = path.resolve(REPOSITORY_ROOT, benchmarkCase.source.path);
    const sourceText = fs.readFileSync(fixturePath, 'utf8');
    const conversion = convertMusicXmlToCanonicalTab(sourceText, {
      guitar: {
        tuning: guitar.tuning,
        minimumFret: guitar.minimumFret,
        maximumFret: guitar.maximumFret,
      },
    });

    assert.equal(
      conversion.preflight.canProcess,
      true,
      `${benchmarkCase.caseId} must remain inside the supported MusicXML scope`,
    );
    assert.notEqual(conversion.canonicalTabResult, null);

    const events = noteEvents(conversion.canonicalTabResult);
    assert.equal(events.length, benchmarkCase.events.length);

    for (const benchmarkEvent of benchmarkCase.events) {
      const sourceEvent = events.find((event) => event.eventId === benchmarkEvent.eventId);
      assert.notEqual(
        sourceEvent,
        undefined,
        `${benchmarkCase.caseId}/${benchmarkEvent.eventId} is missing from the source fixture`,
      );
      assert.equal(sourceEvent.pitch.midi, benchmarkEvent.pitchMidi);

      const physicalCandidates = [
        sourceEvent.selectedPosition,
        ...sourceEvent.alternativePositions,
      ];
      for (const acceptedPosition of benchmarkEvent.acceptedPositions) {
        assert.equal(
          physicalCandidates.some((candidate) => samePosition(candidate, acceptedPosition)),
          true,
          `${benchmarkCase.caseId}/${benchmarkEvent.eventId} contains an impossible accepted position`,
        );
      }
    }
  }
});

test('does not score the current optimizer against proposed teacher labels in B1', () => {
  const source = fs.readFileSync(__filename, 'utf8');

  assert.equal(source.includes('acceptableMatchCount'), false);
  assert.equal(source.includes('preferredMatchCount'), false);
  assert.equal(source.includes('casePassCount'), false);
});
