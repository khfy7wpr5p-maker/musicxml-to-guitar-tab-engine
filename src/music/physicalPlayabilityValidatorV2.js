'use strict';

const { EngineError } = require('../errors/engineError');
const { validatePosition } = require('../guitar/playability');
const {
  LEFT_HAND_SHAPE_MODEL_VERSION,
  LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
  LEFT_HAND_SHAPE_POLICY,
  MAX_LEFT_HAND_SHAPE_CANDIDATES,
  createLeftHandShapeModel,
} = require('./leftHandShapeModel');

const PHYSICAL_PLAYABILITY_VALIDATION_VERSION = '2.0.0';
const PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE = 'PhysicalPlayabilityValidation';
const PHYSICAL_PLAYABILITY_POLICY = 'CONSERVATIVE_STATIC_LEFT_HAND_2.0';
const MAXIMUM_STATIC_FRET_SPAN = 4;
const MAXIMUM_EXTRA_FRET_REACH = 1;
const MAX_PHYSICAL_PLAYABILITY_VALIDATIONS = MAX_LEFT_HAND_SHAPE_CANDIDATES;

const PLAYABILITY_STATUS = Object.freeze({
  PLAYABLE_WITHIN_POLICY: 'PLAYABLE_WITHIN_POLICY',
  REJECTED: 'REJECTED',
});

const PLAYABILITY_REJECTION_REASONS = Object.freeze({
  FRET_SPAN_EXCEEDED: 'FRET_SPAN_EXCEEDED',
  FINGER_REACH_EXCEEDED: 'FINGER_REACH_EXCEEDED',
});

class PhysicalPlayabilityValidationError extends EngineError {
  constructor(message, code = 'INVALID_PHYSICAL_PLAYABILITY_VALIDATION', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'PhysicalPlayabilityValidationError',
    );
  }
}

function invalid(message, details = {}) {
  return new PhysicalPlayabilityValidationError(
    message,
    'INVALID_PHYSICAL_PLAYABILITY_VALIDATION',
    details,
  );
}

function validationLimitExceeded(observed, details = {}) {
  return new PhysicalPlayabilityValidationError(
    'PA-9 aggregate physical-playability validation count exceeds the fixed limit.',
    'PHYSICAL_PLAYABILITY_VALIDATION_LIMIT_EXCEEDED',
    {
      limit: MAX_PHYSICAL_PLAYABILITY_VALIDATIONS,
      observed,
      ...details,
    },
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) {
    runtime.checkpoint(phase, details);
  }
}

function validateLeftHandIdentity(leftHand) {
  if (
    !leftHand
    || leftHand.documentType !== LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE
    || leftHand.contractVersion !== LEFT_HAND_SHAPE_MODEL_VERSION
    || leftHand.policy !== LEFT_HAND_SHAPE_POLICY
    || !Array.isArray(leftHand.groups)
    || !Number.isInteger(leftHand.groupCount)
    || leftHand.groupCount !== leftHand.groups.length
    || !Number.isInteger(leftHand.voicingCandidateCount)
    || leftHand.voicingCandidateCount < 0
    || !Number.isInteger(leftHand.shapeCandidateCount)
    || leftHand.shapeCandidateCount < 0
  ) {
    throw invalid('PA-9 received an invalid recomputed PA-8 model identity.');
  }
}

function validateShapeFacts(shape, voicingCandidateId, sourceGroupId) {
  if (
    !shape
    || typeof shape.shapeCandidateId !== 'string'
    || shape.shapeCandidateId.length === 0
    || !Array.isArray(shape.fingerAssignments)
    || !Array.isArray(shape.barres)
    || !Number.isInteger(shape.assignmentCount)
    || shape.assignmentCount !== shape.fingerAssignments.length
    || !Number.isInteger(shape.usedFingerCount)
    || shape.usedFingerCount < 0
    || !Number.isInteger(shape.fretSpan)
    || shape.fretSpan < 0
    || !Number.isInteger(shape.barreCount)
    || shape.barreCount !== shape.barres.length
  ) {
    throw invalid('PA-9 encountered invalid recomputed PA-8 shape facts.', {
      sourceGroupId,
      voicingCandidateId,
    });
  }

  const fingerToFret = new Map();
  const frettedFrets = [];
  const usedFingers = new Set();

  for (let index = 0; index < shape.fingerAssignments.length; index += 1) {
    const assignment = shape.fingerAssignments[index];
    if (
      !assignment
      || typeof assignment.sourceEventId !== 'string'
      || assignment.sourceEventId.length === 0
      || !Number.isInteger(assignment.targetMidi)
      || !Number.isInteger(assignment.string)
      || !Number.isInteger(assignment.fret)
      || !Number.isInteger(assignment.finger)
    ) {
      throw invalid('PA-9 encountered invalid recomputed PA-8 finger assignment facts.', {
        sourceGroupId,
        voicingCandidateId,
        shapeCandidateId: shape.shapeCandidateId,
        assignmentIndex: index,
      });
    }

    validatePosition(
      { string: assignment.string, fret: assignment.fret },
      assignment.targetMidi,
    );

    if (assignment.fret === 0) {
      if (assignment.finger !== 0) {
        throw invalid('PA-9 requires open strings to preserve PA-8 finger 0 semantics.', {
          sourceGroupId,
          voicingCandidateId,
          shapeCandidateId: shape.shapeCandidateId,
          assignmentIndex: index,
        });
      }
      continue;
    }

    if (assignment.finger < 1 || assignment.finger > 4) {
      throw invalid('PA-9 requires fretted PA-8 assignments to use fingers 1 through 4.', {
        sourceGroupId,
        voicingCandidateId,
        shapeCandidateId: shape.shapeCandidateId,
        assignmentIndex: index,
      });
    }

    const priorFret = fingerToFret.get(assignment.finger);
    if (priorFret !== undefined && priorFret !== assignment.fret) {
      throw invalid('PA-9 requires one PA-8 finger to remain on one fret.', {
        sourceGroupId,
        voicingCandidateId,
        shapeCandidateId: shape.shapeCandidateId,
        finger: assignment.finger,
      });
    }
    fingerToFret.set(assignment.finger, assignment.fret);
    usedFingers.add(assignment.finger);
    frettedFrets.push(assignment.fret);
  }

  const minimumFrettedFret = frettedFrets.length === 0 ? null : Math.min(...frettedFrets);
  const maximumFrettedFret = frettedFrets.length === 0 ? null : Math.max(...frettedFrets);
  const fretSpan = frettedFrets.length === 0 ? 0 : maximumFrettedFret - minimumFrettedFret;

  if (
    shape.minimumFrettedFret !== minimumFrettedFret
    || shape.maximumFrettedFret !== maximumFrettedFret
    || shape.fretSpan !== fretSpan
    || shape.usedFingerCount !== usedFingers.size
  ) {
    throw invalid('PA-9 detected inconsistent recomputed PA-8 shape summary facts.', {
      sourceGroupId,
      voicingCandidateId,
      shapeCandidateId: shape.shapeCandidateId,
    });
  }

  const orderedFingerFrets = [...fingerToFret.entries()].sort((a, b) => a[1] - b[1]);
  for (let index = 1; index < orderedFingerFrets.length; index += 1) {
    const previous = orderedFingerFrets[index - 1];
    const current = orderedFingerFrets[index];
    if (previous[1] < current[1] && previous[0] >= current[0]) {
      throw invalid('PA-9 detected a violation of the PA-8 ordered-finger invariant.', {
        sourceGroupId,
        voicingCandidateId,
        shapeCandidateId: shape.shapeCandidateId,
      });
    }
  }

  for (let index = 0; index < shape.barres.length; index += 1) {
    const barre = shape.barres[index];
    if (
      !barre
      || (barre.barreType !== 'PARTIAL_BARRE' && barre.barreType !== 'FULL_BARRE')
      || !Number.isInteger(barre.finger)
      || barre.finger < 1
      || barre.finger > 4
      || !Number.isInteger(barre.fret)
      || barre.fret <= 0
      || !Number.isInteger(barre.fromString)
      || !Number.isInteger(barre.toString)
      || barre.fromString < barre.toString
    ) {
      throw invalid('PA-9 encountered invalid recomputed PA-8 barre facts.', {
        sourceGroupId,
        voicingCandidateId,
        shapeCandidateId: shape.shapeCandidateId,
        barreIndex: index,
      });
    }
  }

  return {
    fretSpan,
    usedFingerCount: usedFingers.size,
    barreCount: shape.barres.length,
    fingerToFret,
  };
}

function hasFingerReachViolation(fingerToFret) {
  const entries = [...fingerToFret.entries()];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const [leftFinger, leftFret] = entries[leftIndex];
      const [rightFinger, rightFret] = entries[rightIndex];
      if (leftFret === rightFret) {
        continue;
      }
      const fretDistance = Math.abs(leftFret - rightFret);
      const fingerNumberDistance = Math.abs(leftFinger - rightFinger);
      if (fretDistance > fingerNumberDistance + MAXIMUM_EXTRA_FRET_REACH) {
        return true;
      }
    }
  }
  return false;
}

function buildShapeVerdict(shape, voicingCandidateId, sourceGroupId) {
  const facts = validateShapeFacts(shape, voicingCandidateId, sourceGroupId);
  const reasonCodes = [];

  if (facts.fretSpan > MAXIMUM_STATIC_FRET_SPAN) {
    reasonCodes.push(PLAYABILITY_REJECTION_REASONS.FRET_SPAN_EXCEEDED);
  }
  if (hasFingerReachViolation(facts.fingerToFret)) {
    reasonCodes.push(PLAYABILITY_REJECTION_REASONS.FINGER_REACH_EXCEEDED);
  }

  return Object.freeze({
    shapeCandidateId: shape.shapeCandidateId,
    status: reasonCodes.length === 0
      ? PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY
      : PLAYABILITY_STATUS.REJECTED,
    reasonCodes: Object.freeze(reasonCodes),
    fretSpan: facts.fretSpan,
    usedFingerCount: facts.usedFingerCount,
    barreCount: facts.barreCount,
  });
}

function validatePhysicalPlayabilityV2(sourceModel, arrangementDecisions, runtime = null) {
  checkpoint(runtime, 'physical-playability-v2:start');

  const leftHand = createLeftHandShapeModel(sourceModel, arrangementDecisions, runtime);
  validateLeftHandIdentity(leftHand);

  const counters = {
    voicingCandidates: 0,
    shapeCandidates: 0,
    playableShapes: 0,
    rejectedShapes: 0,
  };
  const groups = new Array(leftHand.groups.length);

  for (let groupIndex = 0; groupIndex < leftHand.groups.length; groupIndex += 1) {
    checkpoint(runtime, 'physical-playability-v2:group', { groupIndex });
    const group = leftHand.groups[groupIndex];
    if (
      !group
      || typeof group.sourceGroupId !== 'string'
      || !Array.isArray(group.voicingCandidates)
      || group.voicingCandidateCount !== group.voicingCandidates.length
    ) {
      throw invalid('PA-9 encountered an invalid recomputed PA-8 group.', { groupIndex });
    }

    const voicingCandidates = new Array(group.voicingCandidates.length);
    for (let voicingIndex = 0; voicingIndex < group.voicingCandidates.length; voicingIndex += 1) {
      checkpoint(runtime, 'physical-playability-v2:voicing', { groupIndex, voicingIndex });
      const voicing = group.voicingCandidates[voicingIndex];
      if (
        !voicing
        || typeof voicing.voicingCandidateId !== 'string'
        || voicing.voicingCandidateId.length === 0
        || !Array.isArray(voicing.shapeCandidates)
        || voicing.shapeCandidateCount !== voicing.shapeCandidates.length
      ) {
        throw invalid('PA-9 encountered an invalid recomputed PA-8 voicing candidate.', {
          groupIndex,
          voicingIndex,
        });
      }

      const shapeVerdicts = new Array(voicing.shapeCandidates.length);
      let playableShapeCount = 0;
      let rejectedShapeCount = 0;

      for (let shapeIndex = 0; shapeIndex < voicing.shapeCandidates.length; shapeIndex += 1) {
        checkpoint(runtime, 'physical-playability-v2:shape', {
          groupIndex,
          voicingIndex,
          shapeIndex,
        });
        const observed = counters.shapeCandidates + 1;
        if (observed > MAX_PHYSICAL_PLAYABILITY_VALIDATIONS) {
          throw validationLimitExceeded(observed, {
            sourceGroupId: group.sourceGroupId,
            voicingCandidateId: voicing.voicingCandidateId,
          });
        }
        counters.shapeCandidates = observed;

        const verdict = buildShapeVerdict(
          voicing.shapeCandidates[shapeIndex],
          voicing.voicingCandidateId,
          group.sourceGroupId,
        );
        shapeVerdicts[shapeIndex] = verdict;
        if (verdict.status === PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY) {
          playableShapeCount += 1;
          counters.playableShapes += 1;
        } else {
          rejectedShapeCount += 1;
          counters.rejectedShapes += 1;
        }
      }

      counters.voicingCandidates += 1;
      voicingCandidates[voicingIndex] = Object.freeze({
        voicingCandidateId: voicing.voicingCandidateId,
        shapeCandidateCount: shapeVerdicts.length,
        playableShapeCount,
        rejectedShapeCount,
        shapeVerdicts: Object.freeze(shapeVerdicts),
      });
    }

    groups[groupIndex] = Object.freeze({
      sourceGroupId: group.sourceGroupId,
      voicingCandidateCount: voicingCandidates.length,
      voicingCandidates: Object.freeze(voicingCandidates),
    });
  }

  if (
    counters.voicingCandidates !== leftHand.voicingCandidateCount
    || counters.shapeCandidates !== leftHand.shapeCandidateCount
  ) {
    throw invalid('PA-9 detected inconsistent recomputed PA-8 aggregate counts.');
  }

  checkpoint(runtime, 'physical-playability-v2:complete', {
    groupCount: groups.length,
    voicingCandidateCount: counters.voicingCandidates,
    shapeCandidateCount: counters.shapeCandidates,
    playableShapeCount: counters.playableShapes,
    rejectedShapeCount: counters.rejectedShapes,
  });

  return Object.freeze({
    documentType: PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE,
    contractVersion: PHYSICAL_PLAYABILITY_VALIDATION_VERSION,
    policy: PHYSICAL_PLAYABILITY_POLICY,
    leftHand: Object.freeze({
      documentType: LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
      contractVersion: LEFT_HAND_SHAPE_MODEL_VERSION,
      policy: LEFT_HAND_SHAPE_POLICY,
    }),
    configuration: Object.freeze({
      maximumStaticFretSpan: MAXIMUM_STATIC_FRET_SPAN,
      maximumExtraFretReach: MAXIMUM_EXTRA_FRET_REACH,
    }),
    groupCount: groups.length,
    voicingCandidateCount: counters.voicingCandidates,
    shapeCandidateCount: counters.shapeCandidates,
    playableShapeCount: counters.playableShapes,
    rejectedShapeCount: counters.rejectedShapes,
    groups: Object.freeze(groups),
  });
}

module.exports = {
  PHYSICAL_PLAYABILITY_VALIDATION_VERSION,
  PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE,
  PHYSICAL_PLAYABILITY_POLICY,
  PLAYABILITY_STATUS,
  PLAYABILITY_REJECTION_REASONS,
  MAXIMUM_STATIC_FRET_SPAN,
  MAXIMUM_EXTRA_FRET_REACH,
  MAX_PHYSICAL_PLAYABILITY_VALIDATIONS,
  PhysicalPlayabilityValidationError,
  validatePhysicalPlayabilityV2,
};
