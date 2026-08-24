'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const {
  createGuitarVoicingCandidateModel,
} = require('../src/music/guitarVoicingCandidateModel');
const {
  createLeftHandShapeModel,
  createLeftHandShapeModelFromVoicingCandidateSnapshot,
} = require('../src/music/leftHandShapeModel');
const {
  validatePhysicalPlayabilityV2,
  validatePhysicalPlayabilityV2FromLeftHandShapeSnapshot,
} = require('../src/music/physicalPlayabilityValidatorV2');
const {
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_VERSION,
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_DOCUMENT_TYPE,
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_POLICY,
  createDeterministicPa7CandidateSnapshotHandoff,
} = require('../src/music/deterministicPa7CandidateSnapshotHandoff');

function pitch(step, midi) {
  return {
    step,
    alter: 0,
    octave: 4,
    midi,
    written: `${step}4`,
  };
}

function sourceEvent(index, pitchValue, chordWithPrevious) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'note',
    voice: '1',
    staff: 1,
    onsetDivisions: 0,
    durationDivisions: 4,
    pitch: pitchValue,
    tieStart: false,
    tieStop: false,
    source: {
      partId: 'P1',
      measureIndex: 0,
      measureNumber: '1',
      noteIndex: index,
      chordWithPrevious,
    },
  };
}

function createSource() {
  const events = [
    sourceEvent(0, pitch('C', 60), false),
    sourceEvent(1, pitch('E', 64), true),
  ];
  return createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: {
      format: 'score-partwise',
      musicXmlVersion: '4.0',
      partId: 'P1',
    },
    measureCount: 1,
    eventCount: events.length,
    measures: [{
      measureId: createMeasureId('P1', 0),
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events,
    }],
  });
}

function createDecisions() {
  return [0, 1].map((index) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [createSourceEventId('P1', 0, index)],
    sourceGroupId: null,
  }));
}

function deeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((nested) => deeplyFrozen(nested, seen));
}

function candidateIdsFromPa7(snapshot) {
  return snapshot.groups.map((group) => ({
    sourceGroupId: group.sourceGroupId,
    candidateIds: group.candidates.map((candidate) => candidate.candidateId),
  }));
}

function candidateIdsFromPa8(snapshot) {
  return snapshot.groups.map((group) => ({
    sourceGroupId: group.sourceGroupId,
    candidateIds: group.voicingCandidates.map((candidate) => candidate.voicingCandidateId),
  }));
}

function candidateIdsFromPa9(snapshot) {
  return snapshot.groups.map((group) => ({
    sourceGroupId: group.sourceGroupId,
    candidateIds: group.voicingCandidates.map((candidate) => candidate.voicingCandidateId),
  }));
}

test('PA-7 handoff generates candidates once and preserves exact identity/order through PA-8 and PA-9', () => {
  const phases = [];
  const runtime = {
    checkpoint(phase) {
      phases.push(phase);
    },
  };
  const source = createSource();
  const decisions = createDecisions();
  const handoff = createDeterministicPa7CandidateSnapshotHandoff(source, decisions, runtime);

  assert.equal(handoff.documentType, DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_DOCUMENT_TYPE);
  assert.equal(handoff.contractVersion, DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_VERSION);
  assert.equal(handoff.policy, DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_POLICY);
  assert.equal(handoff.candidateGenerationCount, 1);
  assert.equal(phases.filter((phase) => phase === 'guitar-voicing-candidate-model:start').length, 1);
  assert.equal(handoff.candidateIdentityPreserved, true);
  assert.equal(handoff.candidateOrderPreserved, true);
  assert.equal(handoff.candidatePositionFactsPreserved, true);

  assert.deepEqual(
    candidateIdsFromPa8(handoff.leftHandShapeSnapshot),
    candidateIdsFromPa7(handoff.voicingCandidateSnapshot),
  );
  assert.deepEqual(
    candidateIdsFromPa9(handoff.physicalPlayabilitySnapshot),
    candidateIdsFromPa8(handoff.leftHandShapeSnapshot),
  );

  for (let groupIndex = 0; groupIndex < handoff.voicingCandidateSnapshot.groups.length; groupIndex += 1) {
    const pa7Group = handoff.voicingCandidateSnapshot.groups[groupIndex];
    const pa8Group = handoff.leftHandShapeSnapshot.groups[groupIndex];
    for (let candidateIndex = 0; candidateIndex < pa7Group.candidates.length; candidateIndex += 1) {
      assert.deepEqual(
        pa8Group.voicingCandidates[candidateIndex].positions,
        pa7Group.candidates[candidateIndex].positions,
      );
    }
  }

  assert.equal(deeplyFrozen(handoff), true);
  assert.equal(handoff.candidateCount, handoff.voicingCandidateSnapshot.candidateCount);
  assert.equal(handoff.candidateCount, handoff.leftHandShapeSnapshot.voicingCandidateCount);
  assert.equal(handoff.candidateCount, handoff.physicalPlayabilitySnapshot.voicingCandidateCount);
});

test('snapshot consumers reject mutable PA-7 and PA-8 lookalikes fail-closed', () => {
  const source = createSource();
  const decisions = createDecisions();
  const pa7 = createGuitarVoicingCandidateModel(source, decisions);
  const mutablePa7 = JSON.parse(JSON.stringify(pa7));

  assert.throws(
    () => createLeftHandShapeModelFromVoicingCandidateSnapshot(mutablePa7),
    (error) => error && error.code === 'INVALID_LEFT_HAND_SHAPE_MODEL',
  );

  const pa8 = createLeftHandShapeModelFromVoicingCandidateSnapshot(pa7);
  const mutablePa8 = JSON.parse(JSON.stringify(pa8));
  assert.throws(
    () => validatePhysicalPlayabilityV2FromLeftHandShapeSnapshot(mutablePa8),
    (error) => error && error.code === 'INVALID_PHYSICAL_PLAYABILITY_VALIDATION',
  );
});

test('snapshot handoff preserves legacy deterministic PA-8 and PA-9 values', () => {
  const source = createSource();
  const decisions = createDecisions();
  const handoff = createDeterministicPa7CandidateSnapshotHandoff(source, decisions);

  assert.deepEqual(
    handoff.leftHandShapeSnapshot,
    createLeftHandShapeModel(source, decisions),
  );
  assert.deepEqual(
    handoff.physicalPlayabilitySnapshot,
    validatePhysicalPlayabilityV2(source, decisions),
  );
});