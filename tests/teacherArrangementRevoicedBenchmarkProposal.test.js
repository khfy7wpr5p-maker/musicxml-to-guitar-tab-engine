'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TeacherArrangementBenchmarkAdmissionError,
  validateTeacherArrangementBenchmarkAdmission,
} = require('../src/benchmark/teacherArrangementBenchmarkAdmission');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATE_PATH = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.v0.2.0.json');
const BASELINE_PATH = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.json');
const REVIEW_PATH = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'reviews', 'teacher-review-2026-08-20.json');
const TUNING = new Map([[1,64],[2,59],[3,55],[4,50],[5,45],[6,40]]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function byCase(document) {
  return new Map(document.cases.map((entry) => [entry.caseId, entry]));
}

function sourceMidis(baselineCase) {
  return new Map(
    baselineCase.acceptedArrangements[0].noteOutcomes.map(
      (outcome) => [outcome.sourceEventId, outcome.sourceMidi],
    ),
  );
}

test('PA-11.2S fixes a proposed evaluation-only 1.1.0 identity', () => {
  const candidate = readJson(CANDIDATE_PATH);
  assert.equal(candidate.documentType, 'TeacherArrangementBenchmark');
  assert.equal(candidate.contractVersion, '1.1.0');
  assert.equal(candidate.benchmarkId, 'teacher-arrangement-seed-v1');
  assert.equal(candidate.benchmarkVersion, '0.2.0');
  assert.equal(candidate.reviewStatus, 'proposed');
  assert.equal(candidate.supportStatus, 'PROPOSED_EVALUATION_SCHEMA_ONLY');
  assert.equal(candidate.authority, 'evaluation-only');
  assert.equal(candidate.trainingAuthority, false);
  assert.equal(candidate.productionAuthority, false);
});

test('PA-11.2S binds exact baseline and review-record bytes', () => {
  const candidate = readJson(CANDIDATE_PATH);
  const baselineBytes = fs.readFileSync(BASELINE_PATH);
  const reviewBytes = fs.readFileSync(REVIEW_PATH);
  const baseline = JSON.parse(baselineBytes.toString('utf8'));
  const review = JSON.parse(reviewBytes.toString('utf8'));

  assert.equal(candidate.baseBenchmark.path, 'benchmarks/teacher-arrangement-v1/benchmark.proposed.json');
  assert.equal(candidate.baseBenchmark.contractVersion, baseline.contractVersion);
  assert.equal(candidate.baseBenchmark.benchmarkVersion, baseline.benchmarkVersion);
  assert.equal(candidate.baseBenchmark.gitBlobSha, gitBlobSha(baselineBytes));

  assert.equal(candidate.reviewRecord.path, 'benchmarks/teacher-arrangement-v1/reviews/teacher-review-2026-08-20.json');
  assert.equal(candidate.reviewRecord.contractVersion, review.contractVersion);
  assert.equal(candidate.reviewRecord.reviewRecordId, review.reviewRecordId);
  assert.equal(candidate.reviewRecord.gitBlobSha, gitBlobSha(reviewBytes));
});

test('PA-11.2S baseline references preserve exact source scope and resolve to accepted baseline arrangements', () => {
  const candidate = readJson(CANDIDATE_PATH);
  const baseline = readJson(BASELINE_PATH);
  const baselineByCase = byCase(baseline);

  for (const caseIndex of [0, 3]) {
    const proposedCase = candidate.cases[caseIndex];
    const baselineCase = baselineByCase.get(proposedCase.caseId);
    assert.ok(baselineCase);
    assert.deepEqual(proposedCase.source, baselineCase.source);
    assert.deepEqual(proposedCase.sourceSelection, baselineCase.sourceSelection);

    const acceptedIds = new Set(
      baselineCase.acceptedArrangements.map((arrangement) => arrangement.arrangementId),
    );
    for (const arrangement of proposedCase.acceptedArrangements) {
      assert.equal(arrangement.arrangementMode, 'BASELINE_REFERENCE');
      assert.equal(arrangement.arrangementId, arrangement.baselineArrangementId);
      assert.equal(acceptedIds.has(arrangement.baselineArrangementId), true);
    }
    assert.equal(proposedCase.preferredArrangementId, null);
  }
});

test('PA-11.2S realized voicings exactly reproduce the immutable teacher shape directions', () => {
  const candidate = readJson(CANDIDATE_PATH);
  const review = readJson(REVIEW_PATH);

  for (const caseIndex of [1, 2]) {
    const proposedCase = candidate.cases[caseIndex];
    const arrangement = proposedCase.acceptedArrangements[0];
    const requested = review.cases[caseIndex].teacherRequestedShape;

    assert.equal(arrangement.arrangementMode, 'REALIZED_VOICING');
    assert.equal(arrangement.decision.decisionType, 'REVOICED');
    assert.deepEqual(arrangement.decision.supportingDecisionTypes, ['VOICE_REDISTRIBUTED']);
    assert.deepEqual(arrangement.decision.sourceEventIds, proposedCase.sourceSelection.sourceEventIds);
    assert.equal(arrangement.selectedShape.label, requested.label);
    assert.equal(arrangement.selectedShape.positionCode, requested.positionCode);
    assert.deepEqual(arrangement.selectedShape.strings, requested.strings);
    assert.deepEqual(arrangement.selectedShape.barres, requested.barres);
    assert.equal(arrangement.selectedShape.physicalStatus, 'PLAYABLE_WITHIN_POLICY');
    assert.equal(proposedCase.preferredArrangementId, null);
  }
});

test('PA-11.2S one-to-many mappings are complete, pitch-class preserving, and shape-consistent', () => {
  const candidate = readJson(CANDIDATE_PATH);
  const baselineByCase = byCase(readJson(BASELINE_PATH));

  for (const caseIndex of [1, 2]) {
    const proposedCase = candidate.cases[caseIndex];
    const arrangement = proposedCase.acceptedArrangements[0];
    const sourceMidiById = sourceMidis(baselineByCase.get(proposedCase.caseId));
    const toneById = new Map(arrangement.realizedTones.map((tone) => [tone.realizedToneId, tone]));
    const shapeByString = new Map(
      arrangement.selectedShape.strings
        .filter((entry) => entry.state === 'SOUNDED')
        .map((entry) => [entry.string, entry]),
    );

    assert.equal(toneById.size, arrangement.realizedTones.length);
    assert.deepEqual(
      arrangement.sourceMappings.map((mapping) => mapping.sourceEventId),
      proposedCase.sourceSelection.sourceEventIds,
    );

    const mappedToneIds = [];
    let observedOneToMany = false;
    for (const mapping of arrangement.sourceMappings) {
      assert.equal(mapping.sourceMidi, sourceMidiById.get(mapping.sourceEventId));
      assert.ok(mapping.realizedToneIds.length >= 1);
      observedOneToMany ||= mapping.realizedToneIds.length > 1;
      for (const toneId of mapping.realizedToneIds) {
        const tone = toneById.get(toneId);
        assert.ok(tone);
        assert.equal(tone.sourceEventId, mapping.sourceEventId);
        assert.equal(tone.targetMidi % 12, mapping.sourceMidi % 12);
        mappedToneIds.push(toneId);
      }
    }
    assert.equal(observedOneToMany, true);
    assert.deepEqual([...mappedToneIds].sort(), [...toneById.keys()].sort());
    assert.deepEqual(
      arrangement.selectedShape.realizedToneIds,
      arrangement.realizedTones.map((tone) => tone.realizedToneId),
    );

    const usedStrings = new Set();
    for (const tone of arrangement.realizedTones) {
      assert.equal(usedStrings.has(tone.string), false);
      usedStrings.add(tone.string);
      assert.equal(TUNING.get(tone.string) + tone.fret, tone.targetMidi);
      const shapeString = shapeByString.get(tone.string);
      assert.ok(shapeString);
      assert.equal(shapeString.fret, tone.fret);
      assert.equal(shapeString.finger, tone.finger);
      assert.equal(shapeString.midi, tone.targetMidi);
      if (tone.fret === 0) {
        assert.equal(tone.finger, 0);
      } else {
        assert.ok(tone.finger >= 1 && tone.finger <= 4);
      }
    }
    assert.equal(usedStrings.size, shapeByString.size);

    const fretted = arrangement.realizedTones.filter((tone) => tone.fret > 0);
    for (const lower of fretted) {
      for (const higher of fretted) {
        if (lower.fret < higher.fret) {
          assert.ok(lower.finger < higher.finger);
        }
      }
    }
  }
});

test('PA-11.2S is deliberately fail-closed in the old 1.0 admission/evaluator path', () => {
  const candidate = readJson(CANDIDATE_PATH);
  assert.throws(
    () => validateTeacherArrangementBenchmarkAdmission(candidate),
    (error) => error instanceof TeacherArrangementBenchmarkAdmissionError,
  );
});
