'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const publicApi = require('../src');
const {
  MATCH_CLASSIFICATION,
  TeacherArrangementObservedOutputError,
  evaluateTeacherApprovedV11ObservedOutput,
} = require('../src/benchmark/teacherArrangementObservedOutputScorer');

const ROOT = path.resolve(__dirname, '..');
const benchmarkPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.v0.2.0.json');
const approvalPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'approvals', 'teacher-approval-v0.2.0-2026-08-20.json');
const baselinePath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.json');
const reviewPath = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'reviews', 'teacher-review-2026-08-20.json');

function text(filePath) { return fs.readFileSync(filePath, 'utf8'); }
function json(filePath) { return JSON.parse(text(filePath)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function sourceEntries() {
  const baseline = json(baselinePath);
  return baseline.cases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    sourceText: text(path.join(ROOT, benchmarkCase.source.path)),
  }));
}

function retained(sourceEventId, sourceMidi, targetMidis) {
  return { sourceEventId, sourceMidi, disposition: 'RETAINED', targetMidis };
}

function omitted(sourceEventId, sourceMidi) {
  return { sourceEventId, sourceMidi, disposition: 'OMITTED', targetMidis: [] };
}

function tone(realizedToneId, sourceEventId, targetMidi, string, fret, finger) {
  return { realizedToneId, sourceEventId, targetMidi, string, fret, finger };
}

function acceptedObservedOutput() {
  return {
    documentType: 'TeacherArrangementObservedOutput',
    contractVersion: '1.0.0',
    benchmarkId: 'teacher-arrangement-seed-v1',
    benchmarkVersion: '0.2.0',
    cases: [
      {
        caseId: 'pa11-seed-001-two-note-open-vs-barre',
        observedArrangement: {
          sourceOutcomes: [
            retained('P1:measure:0:note:0', 60, [60]),
            retained('P1:measure:0:note:1', 64, [64]),
          ],
          realizedTones: [
            tone('obs-001-c4', 'P1:measure:0:note:0', 60, 2, 1, 1),
            tone('obs-001-e4', 'P1:measure:0:note:1', 64, 1, 0, 0),
          ],
          barres: [],
        },
      },
      {
        caseId: 'pa11-seed-002-three-note-voicing',
        observedArrangement: {
          sourceOutcomes: [
            retained('P1:measure:0:note:0', 60, [48, 60]),
            retained('P1:measure:0:note:1', 64, [52, 64]),
            retained('P1:measure:0:note:2', 67, [55]),
          ],
          realizedTones: [
            tone('obs-002-c3', 'P1:measure:0:note:0', 48, 5, 3, 3),
            tone('obs-002-e3', 'P1:measure:0:note:1', 52, 4, 2, 2),
            tone('obs-002-g3', 'P1:measure:0:note:2', 55, 3, 0, 0),
            tone('obs-002-c4', 'P1:measure:0:note:0', 60, 2, 1, 1),
            tone('obs-002-e4', 'P1:measure:0:note:1', 64, 1, 0, 0),
          ],
          barres: [],
        },
      },
      {
        caseId: 'pa11-seed-003-conservative-reduction',
        observedArrangement: {
          sourceOutcomes: [
            retained('P1:measure:0:note:0', 60, [48]),
            retained('P1:measure:0:note:1', 64, [52, 64]),
            retained('P1:measure:0:note:2', 67, [55]),
            retained('P1:measure:0:note:3', 71, [59]),
          ],
          realizedTones: [
            tone('obs-003-c3', 'P1:measure:0:note:0', 48, 5, 3, 3),
            tone('obs-003-e3', 'P1:measure:0:note:1', 52, 4, 2, 2),
            tone('obs-003-g3', 'P1:measure:0:note:2', 55, 3, 0, 0),
            tone('obs-003-b3', 'P1:measure:0:note:3', 59, 2, 0, 0),
            tone('obs-003-e4', 'P1:measure:0:note:1', 64, 1, 0, 0),
          ],
          barres: [],
        },
      },
      {
        caseId: 'pa11-seed-004-octave-displacement',
        observedArrangement: {
          sourceOutcomes: [retained('P1:measure:0:note:0', 86, [74])],
          realizedTones: [tone('obs-004-d5', 'P1:measure:0:note:0', 74, 1, 10, null)],
          barres: [],
        },
      },
    ],
  };
}

function input(observedOutput) {
  return {
    benchmarkText: text(benchmarkPath),
    approvalText: text(approvalPath),
    baselineText: text(baselinePath),
    reviewText: text(reviewPath),
    sourceEntries: sourceEntries(),
    observedOutput,
  };
}

function compactTriadObservation() {
  return {
    sourceOutcomes: [
      retained('P1:measure:0:note:0', 60, [60]),
      retained('P1:measure:0:note:1', 64, [64]),
      retained('P1:measure:0:note:2', 67, [67]),
    ],
    realizedTones: [
      tone('obs-alt-c4', 'P1:measure:0:note:0', 60, 3, 5, 2),
      tone('obs-alt-e4', 'P1:measure:0:note:1', 64, 2, 5, 2),
      tone('obs-alt-g4', 'P1:measure:0:note:2', 67, 1, 3, 1),
    ],
    barres: [{
      finger: 2,
      fret: 5,
      startString: 2,
      endString: 3,
      stringSpan: 2,
      kind: 'PARTIAL_BARRE',
    }],
  };
}

test('PA-11.3I scores independently observed complete arrangements against the exact teacher-approved benchmark', () => {
  const report = evaluateTeacherApprovedV11ObservedOutput(input(acceptedObservedOutput()));
  assert.equal(report.documentType, 'TeacherArrangementBenchmarkV11ScoreReport');
  assert.equal(report.contractVersion, '1.0.0');
  assert.equal(report.mode, 'evaluation-only');
  assert.equal(report.authority, 'none');
  assert.equal(report.effectiveReviewStatus, 'teacher-approved');
  assert.equal(report.caseCount, 4);
  assert.equal(report.matchedCaseCount, 4);
  assert.equal(report.matchedCaseRate, 1);
  assert.equal(report.preferredMatchCount, 0);
  assert.equal(report.acceptableMatchCount, 4);
  assert.equal(report.physicallyValidNotApprovedCount, 0);
  assert.equal(report.invalidCount, 0);
  assert.equal(report.unmatchedCount, 0);
  assert.deepEqual(
    report.cases.map((entry) => entry.classification),
    Array(4).fill(MATCH_CLASSIFICATION.ACCEPTABLE_MATCH),
  );
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.cases), true);
});

test('PA-11.3I matches semantics rather than observation-local tone identities', () => {
  const observed = acceptedObservedOutput();
  observed.cases[1].observedArrangement.realizedTones.forEach((entry, index) => {
    entry.realizedToneId = `independent-engine-tone-${index}`;
  });
  const report = evaluateTeacherApprovedV11ObservedOutput(input(observed));
  assert.equal(report.cases[1].classification, MATCH_CLASSIFICATION.ACCEPTABLE_MATCH);
  assert.equal(report.cases[1].matchedArrangementId, 'pa11-seed-002-arr-teacher-open-c');
});

test('PA-11.3I distinguishes a PA-8/PA-9-valid complete arrangement that is not teacher-approved', () => {
  const observed = acceptedObservedOutput();
  observed.cases[1].observedArrangement = compactTriadObservation();
  const report = evaluateTeacherApprovedV11ObservedOutput(input(observed));
  assert.equal(report.matchedCaseCount, 3);
  assert.equal(report.physicallyValidNotApprovedCount, 1);
  assert.equal(
    report.cases[1].classification,
    MATCH_CLASSIFICATION.PHYSICALLY_VALID_NOT_APPROVED,
  );
  assert.equal(report.cases[1].matchedArrangementId, null);
});

test('PA-11.3I classifies physically inconsistent observed output as INVALID instead of accepting an ID or label claim', () => {
  const observed = acceptedObservedOutput();
  observed.cases[1].observedArrangement.realizedTones[0].fret = 4;
  const report = evaluateTeacherApprovedV11ObservedOutput(input(observed));
  assert.equal(report.invalidCount, 1);
  assert.equal(report.cases[1].classification, MATCH_CLASSIFICATION.INVALID);
  assert.deepEqual(report.cases[1].reasonCodes, ['PHYSICAL_REPLAY_REJECTED']);
});

test('PA-11.3I reports an explicit missing engine result as UNMATCHED without inventing teacher output', () => {
  const observed = acceptedObservedOutput();
  observed.cases[0].observedArrangement = null;
  const report = evaluateTeacherApprovedV11ObservedOutput(input(observed));
  assert.equal(report.unmatchedCount, 1);
  assert.equal(report.matchedCaseCount, 3);
  assert.equal(report.matchedCaseRate, 0.75);
  assert.equal(report.cases[0].classification, MATCH_CLASSIFICATION.UNMATCHED);
});

test('PA-11.3I fails closed for hostile/unknown observed fields and never evaluates an accessor', () => {
  const unknown = acceptedObservedOutput();
  unknown.cases[0].observedArrangement.arrangementId = 'pa11-seed-001-arr-a-open';
  assert.throws(
    () => evaluateTeacherApprovedV11ObservedOutput(input(unknown)),
    (error) => error instanceof TeacherArrangementObservedOutputError,
  );

  const accessor = acceptedObservedOutput();
  let executed = false;
  Object.defineProperty(accessor.cases[0], 'caseId', {
    enumerable: true,
    configurable: true,
    get() {
      executed = true;
      return 'pa11-seed-001-two-note-open-vs-barre';
    },
  });
  assert.throws(
    () => evaluateTeacherApprovedV11ObservedOutput(input(accessor)),
    (error) => error instanceof TeacherArrangementObservedOutputError,
  );
  assert.equal(executed, false);
});

test('PA-11.3I rejects source-outcome/tone provenance disagreement as INVALID', () => {
  const observed = acceptedObservedOutput();
  observed.cases[2].observedArrangement.sourceOutcomes[1].targetMidis = [52];
  const report = evaluateTeacherApprovedV11ObservedOutput(input(observed));
  assert.equal(report.cases[2].classification, MATCH_CLASSIFICATION.INVALID);
  assert.ok(report.cases[2].reasonCodes.includes('SOURCE_TARGET_TONE_MISMATCH'));
});

test('PA-11.3I remains internal and does not expand the package-root production API', () => {
  assert.equal(Object.hasOwn(publicApi, 'evaluateTeacherApprovedV11ObservedOutput'), false);
  assert.equal(Object.hasOwn(publicApi, 'MATCH_CLASSIFICATION'), false);
});
