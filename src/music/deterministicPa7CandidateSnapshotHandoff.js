'use strict';

const { EngineError } = require('../errors/engineError');
const {
  createGuitarVoicingCandidateModel,
} = require('./guitarVoicingCandidateModel');
const {
  createLeftHandShapeModelFromVoicingCandidateSnapshot,
} = require('./leftHandShapeModel');
const {
  validatePhysicalPlayabilityV2FromLeftHandShapeSnapshot,
} = require('./physicalPlayabilityValidatorV2');

const DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_VERSION = '1.0.0';
const DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_DOCUMENT_TYPE =
  'DeterministicPa7CandidateSnapshotHandoff';
const DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_POLICY =
  'SINGLE_GENERATION_IMMUTABLE_PA7_HANDOFF_1.0';

class DeterministicPa7CandidateSnapshotHandoffError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF',
      Object.freeze({ ...details }),
      'DeterministicPa7CandidateSnapshotHandoffError',
    );
  }
}

function invalid(message, details = {}) {
  return new DeterministicPa7CandidateSnapshotHandoffError(message, details);
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function samePosition(left, right) {
  return left.sourceEventId === right.sourceEventId
    && left.targetMidi === right.targetMidi
    && left.string === right.string
    && left.fret === right.fret;
}

function assertPa7ToPa8Identity(voicing, leftHand) {
  if (voicing.groupCount !== leftHand.groupCount || voicing.groups.length !== leftHand.groups.length) {
    throw invalid('PA-8 group count diverged from the immutable PA-7 snapshot.');
  }
  let observedCandidateCount = 0;
  for (let groupIndex = 0; groupIndex < voicing.groups.length; groupIndex += 1) {
    const sourceGroup = voicing.groups[groupIndex];
    const leftGroup = leftHand.groups[groupIndex];
    if (
      sourceGroup.sourceGroupId !== leftGroup.sourceGroupId
      || sourceGroup.candidateCount !== leftGroup.voicingCandidateCount
      || sourceGroup.candidates.length !== leftGroup.voicingCandidates.length
    ) {
      throw invalid('PA-8 group identity diverged from the immutable PA-7 snapshot.', { groupIndex });
    }
    for (let candidateIndex = 0; candidateIndex < sourceGroup.candidates.length; candidateIndex += 1) {
      const sourceCandidate = sourceGroup.candidates[candidateIndex];
      const leftCandidate = leftGroup.voicingCandidates[candidateIndex];
      if (
        sourceCandidate.candidateId !== leftCandidate.voicingCandidateId
        || sourceCandidate.positions.length !== leftCandidate.positions.length
        || sourceCandidate.positions.some(
          (position, positionIndex) => !samePosition(position, leftCandidate.positions[positionIndex]),
        )
      ) {
        throw invalid('PA-8 candidate identity/order/position facts diverged from PA-7 snapshot.', {
          groupIndex,
          candidateIndex,
          candidateId: sourceCandidate.candidateId,
        });
      }
      observedCandidateCount += 1;
    }
  }
  if (
    observedCandidateCount !== voicing.candidateCount
    || observedCandidateCount !== leftHand.voicingCandidateCount
  ) {
    throw invalid('PA-7/PA-8 aggregate candidate counts diverged.', {
      pa7CandidateCount: voicing.candidateCount,
      pa8CandidateCount: leftHand.voicingCandidateCount,
      observedCandidateCount,
    });
  }
}

function assertPa8ToPa9Identity(leftHand, physical) {
  if (leftHand.groupCount !== physical.groupCount || leftHand.groups.length !== physical.groups.length) {
    throw invalid('PA-9 group count diverged from the immutable PA-8 snapshot.');
  }
  let observedCandidateCount = 0;
  for (let groupIndex = 0; groupIndex < leftHand.groups.length; groupIndex += 1) {
    const leftGroup = leftHand.groups[groupIndex];
    const physicalGroup = physical.groups[groupIndex];
    if (
      leftGroup.sourceGroupId !== physicalGroup.sourceGroupId
      || leftGroup.voicingCandidateCount !== physicalGroup.voicingCandidateCount
      || leftGroup.voicingCandidates.length !== physicalGroup.voicingCandidates.length
    ) {
      throw invalid('PA-9 group identity diverged from the immutable PA-8 snapshot.', { groupIndex });
    }
    for (let candidateIndex = 0; candidateIndex < leftGroup.voicingCandidates.length; candidateIndex += 1) {
      const leftCandidate = leftGroup.voicingCandidates[candidateIndex];
      const physicalCandidate = physicalGroup.voicingCandidates[candidateIndex];
      if (leftCandidate.voicingCandidateId !== physicalCandidate.voicingCandidateId) {
        throw invalid('PA-9 candidate identity/order diverged from the PA-8 snapshot.', {
          groupIndex,
          candidateIndex,
          candidateId: leftCandidate.voicingCandidateId,
        });
      }
      observedCandidateCount += 1;
    }
  }
  if (
    observedCandidateCount !== leftHand.voicingCandidateCount
    || observedCandidateCount !== physical.voicingCandidateCount
  ) {
    throw invalid('PA-8/PA-9 aggregate candidate counts diverged.', {
      pa8CandidateCount: leftHand.voicingCandidateCount,
      pa9CandidateCount: physical.voicingCandidateCount,
      observedCandidateCount,
    });
  }
}

function createDeterministicPa7CandidateSnapshotHandoff(
  sourceModel,
  arrangementDecisions,
  runtime = null,
  guitarOptions = {},
  exactFingeringConstraints = null,
) {
  checkpoint(runtime, 'deterministic-pa7-snapshot-handoff:start');
  const effectiveExactFingeringConstraints = exactFingeringConstraints
    || guitarOptions.exactFingeringConstraints
    || null;

  const voicingCandidateSnapshot = createGuitarVoicingCandidateModel(
    sourceModel,
    arrangementDecisions,
    runtime,
    guitarOptions,
  );
  const leftHandShapeSnapshot = createLeftHandShapeModelFromVoicingCandidateSnapshot(
    voicingCandidateSnapshot,
    runtime,
    effectiveExactFingeringConstraints,
  );
  assertPa7ToPa8Identity(voicingCandidateSnapshot, leftHandShapeSnapshot);

  const physicalPlayabilitySnapshot = validatePhysicalPlayabilityV2FromLeftHandShapeSnapshot(
    leftHandShapeSnapshot,
    runtime,
    guitarOptions,
  );
  assertPa8ToPa9Identity(leftHandShapeSnapshot, physicalPlayabilitySnapshot);

  checkpoint(runtime, 'deterministic-pa7-snapshot-handoff:complete', {
    groupCount: voicingCandidateSnapshot.groupCount,
    candidateCount: voicingCandidateSnapshot.candidateCount,
  });

  return Object.freeze({
    documentType: DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_DOCUMENT_TYPE,
    contractVersion: DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_VERSION,
    policy: DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_POLICY,
    candidateGenerationCount: 1,
    groupCount: voicingCandidateSnapshot.groupCount,
    candidateCount: voicingCandidateSnapshot.candidateCount,
    candidateIdentityPreserved: true,
    candidateOrderPreserved: true,
    candidatePositionFactsPreserved: true,
    voicingCandidateSnapshot,
    leftHandShapeSnapshot,
    physicalPlayabilitySnapshot,
  });
}

module.exports = {
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_VERSION,
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_DOCUMENT_TYPE,
  DETERMINISTIC_PA7_CANDIDATE_SNAPSHOT_HANDOFF_POLICY,
  DeterministicPa7CandidateSnapshotHandoffError,
  createDeterministicPa7CandidateSnapshotHandoff,
};