'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  LEFT_HAND_SHAPE_POLICY,
  MAX_LEFT_HAND_SHAPE_CANDIDATES,
  MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS,
  enumerateStaticLeftHandShapeCandidatesFromPositions,
} = require('./leftHandShapeModel');
const {
  PHYSICAL_PLAYABILITY_POLICY,
  PLAYABILITY_STATUS,
  MAXIMUM_STATIC_FRET_SPAN,
  MAXIMUM_EXTRA_FRET_REACH,
  evaluateStaticLeftHandShapeCandidate,
} = require('./physicalPlayabilityValidatorV2');
const {
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION,
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE,
  SUSTAINED_POSITION_POINT_STATUS,
  createSustainedGuitarPositionStateModel,
} = require('./sustainedGuitarPositionStateModel');

const SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION = '1.0.0';
const SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE = 'SustainedLeftHandPhysicalStateModel';
const SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_AUTHORITY = 'STATIC_PHYSICAL_CANDIDATES_ONLY';
const MAX_SUSTAINED_PHYSICAL_STATE_CANDIDATES = MAX_LEFT_HAND_SHAPE_CANDIDATES;

const SUSTAINED_PHYSICAL_POINT_STATUS = Object.freeze({
  PHYSICAL_CANDIDATES_AVAILABLE: 'PHYSICAL_CANDIDATES_AVAILABLE',
  EMPTY_SONORITY: 'EMPTY_SONORITY',
  UNPLAYABLE_EXACT: 'UNPLAYABLE_EXACT',
});

class SustainedLeftHandPhysicalStateModelError extends EngineError {
  constructor(message, code = 'INVALID_SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'SustainedLeftHandPhysicalStateModelError');
  }
}

function invalid(message, details = {}) {
  return new SustainedLeftHandPhysicalStateModelError(
    message,
    'INVALID_SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL',
    details,
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function adaptPositions(positionState) {
  return Object.freeze(positionState.positions.map((position) => Object.freeze({
    sourceEventId: position.logicalNoteId,
    targetMidi: position.targetMidi,
    string: position.string,
    fret: position.fret,
  })));
}

function positionIndex(positionState) {
  return new Map(positionState.positions.map((position) => [position.logicalNoteId, position]));
}

function copyBarres(barres) {
  return Object.freeze(barres.map((barre) => Object.freeze({
    finger: barre.finger,
    fret: barre.fret,
    startString: barre.startString,
    endString: barre.endString,
    stringSpan: barre.stringSpan,
    kind: barre.kind,
  })));
}

function convertPlayableShape(positionState, shape, verdict) {
  const byLogicalId = positionIndex(positionState);
  const fingerAssignments = shape.fingerAssignments.map((assignment) => {
    const sourcePosition = byLogicalId.get(assignment.sourceEventId);
    if (!sourcePosition) {
      throw invalid('Shared PA-8 shape assignment lost PS-4A logical-note provenance.', {
        positionStateCandidateId: positionState.stateCandidateId,
        logicalNoteId: assignment.sourceEventId,
      });
    }
    if (
      sourcePosition.targetMidi !== assignment.targetMidi
      || sourcePosition.string !== assignment.string
      || sourcePosition.fret !== assignment.fret
    ) {
      throw invalid('Shared PA-8 shape assignment diverged from PS-4A exact position facts.', {
        positionStateCandidateId: positionState.stateCandidateId,
        logicalNoteId: assignment.sourceEventId,
      });
    }
    return Object.freeze({
      logicalNoteId: sourcePosition.logicalNoteId,
      sourceEventId: sourcePosition.sourceEventId,
      sustainChainId: sourcePosition.sustainChainId,
      voice: sourcePosition.voice,
      staff: sourcePosition.staff,
      disposition: sourcePosition.disposition,
      targetMidi: sourcePosition.targetMidi,
      string: sourcePosition.string,
      fret: sourcePosition.fret,
      finger: assignment.finger,
    });
  });

  return Object.freeze({
    physicalStateCandidateId: `${shape.shapeCandidateId}:physical`,
    positionStateCandidateId: positionState.stateCandidateId,
    positions: positionState.positions,
    fingerAssignments: Object.freeze(fingerAssignments),
    barres: copyBarres(shape.barres),
    physicalValidation: Object.freeze({
      status: verdict.status,
      reasonCodes: verdict.reasonCodes,
      fretSpan: verdict.fretSpan,
      usedFingerCount: verdict.usedFingerCount,
      barreCount: verdict.barreCount,
    }),
  });
}

function emptyPhysicalState(point) {
  return Object.freeze({
    physicalStateCandidateId: `${point.sonorityPointId}:empty-physical-state`,
    positionStateCandidateId: null,
    positions: Object.freeze([]),
    fingerAssignments: Object.freeze([]),
    barres: Object.freeze([]),
    physicalValidation: Object.freeze({
      status: PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY,
      reasonCodes: Object.freeze([]),
      fretSpan: 0,
      usedFingerCount: 0,
      barreCount: 0,
    }),
  });
}

function createSustainedLeftHandPhysicalStateModel(sourceModel, runtime = null, guitarOptions = {}) {
  checkpoint(runtime, 'sustained-left-hand-physical:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const positionModel = createSustainedGuitarPositionStateModel(source, runtime, guitarOptions);
  const shapeCounters = { shapeCandidates: 0, assignmentAttempts: 0 };
  const measures = [];
  let pointCount = 0;
  let evaluatedShapeCount = 0;
  let playableShapeCount = 0;
  let rejectedShapeCount = 0;
  let unplayablePointCount = 0;

  for (let measureIndex = 0; measureIndex < positionModel.measures.length; measureIndex += 1) {
    checkpoint(runtime, 'sustained-left-hand-physical:measure', { measureIndex });
    const measure = positionModel.measures[measureIndex];
    const points = [];

    for (let pointIndex = 0; pointIndex < measure.points.length; pointIndex += 1) {
      checkpoint(runtime, 'sustained-left-hand-physical:point', { measureIndex, pointIndex });
      const point = measure.points[pointIndex];
      // PA-8 limits apply to the independently enumerated source group.  In
      // the sustained path that group is one PS-4A sonority point, which may
      // contain several position states.  Keep aggregate counters for model
      // reporting, but reset the enforced group window before enumerating the
      // point so earlier sonorities cannot consume this point's fixed budget.
      shapeCounters.groupShapeCandidates = 0;
      shapeCounters.groupAssignmentAttempts = 0;
      let status;
      let reason = null;
      let physicalCandidates = [];
      let pointEvaluatedShapeCount = 0;
      let pointRejectedShapeCount = 0;

      if (point.status === SUSTAINED_POSITION_POINT_STATUS.EMPTY_SONORITY) {
        status = SUSTAINED_PHYSICAL_POINT_STATUS.EMPTY_SONORITY;
        physicalCandidates = [emptyPhysicalState(point)];
      } else if (point.status === SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT) {
        status = SUSTAINED_PHYSICAL_POINT_STATUS.UNPLAYABLE_EXACT;
        reason = point.reason;
        unplayablePointCount += 1;
      } else if (point.status === SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE) {
        for (let stateIndex = 0; stateIndex < point.candidates.length; stateIndex += 1) {
          checkpoint(runtime, 'sustained-left-hand-physical:position-state', {
            measureIndex,
            pointIndex,
            stateIndex,
          });
          const positionState = point.candidates[stateIndex];
          const adapted = adaptPositions(positionState);
          const shapes = enumerateStaticLeftHandShapeCandidatesFromPositions(
            positionState.stateCandidateId,
            adapted,
            runtime,
            shapeCounters,
            point.sonorityPointId,
          );

          for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex += 1) {
            checkpoint(runtime, 'sustained-left-hand-physical:shape', {
              measureIndex,
              pointIndex,
              stateIndex,
              shapeIndex,
            });
            const shape = shapes[shapeIndex];
            const verdict = evaluateStaticLeftHandShapeCandidate(
              shape,
              adapted,
              positionState.stateCandidateId,
              point.sonorityPointId,
              guitarOptions,
            );
            evaluatedShapeCount += 1;
            pointEvaluatedShapeCount += 1;
            if (verdict.status !== PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY) {
              rejectedShapeCount += 1;
              pointRejectedShapeCount += 1;
              continue;
            }
            if (physicalCandidates.length + 1 > MAX_SUSTAINED_PHYSICAL_STATE_CANDIDATES) {
              throw new SustainedLeftHandPhysicalStateModelError(
                'PS-4C playable physical state count exceeds the fixed model boundary.',
                'SUSTAINED_PHYSICAL_STATE_LIMIT_EXCEEDED',
                {
                  limit: MAX_SUSTAINED_PHYSICAL_STATE_CANDIDATES,
                  observed: physicalCandidates.length + 1,
                  sonorityPointId: point.sonorityPointId,
                },
              );
            }
            physicalCandidates.push(convertPlayableShape(positionState, shape, verdict));
            playableShapeCount += 1;
          }
        }

        if (physicalCandidates.length === 0) {
          status = SUSTAINED_PHYSICAL_POINT_STATUS.UNPLAYABLE_EXACT;
          reason = 'NO_STATIC_LEFT_HAND_SHAPE';
          unplayablePointCount += 1;
        } else {
          status = SUSTAINED_PHYSICAL_POINT_STATUS.PHYSICAL_CANDIDATES_AVAILABLE;
        }
      } else {
        throw invalid('PS-4C encountered an unknown PS-4A point status.', {
          sonorityPointId: point.sonorityPointId,
          status: point.status,
        });
      }

      physicalCandidates = Object.freeze(physicalCandidates);
      points.push(Object.freeze({
        sonorityPointId: point.sonorityPointId,
        pointIndex: point.pointIndex,
        timeDivisions: point.timeDivisions,
        attackLogicalNoteIds: point.attackLogicalNoteIds,
        holdLogicalNoteIds: point.holdLogicalNoteIds,
        releaseLogicalNoteIds: point.releaseLogicalNoteIds,
        status,
        reason,
        positionStateCandidateCount: point.candidateCount,
        evaluatedShapeCount: pointEvaluatedShapeCount,
        rejectedShapeCount: pointRejectedShapeCount,
        physicalCandidateCount: physicalCandidates.length,
        physicalCandidates,
      }));
      pointCount += 1;
    }

    measures.push(Object.freeze({
      measureId: measure.measureId,
      index: measure.index,
      pointCount: points.length,
      points: Object.freeze(points),
    }));
  }

  const result = Object.freeze({
    documentType: SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE,
    contractVersion: SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION,
    authority: SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_AUTHORITY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    positionStates: Object.freeze({
      documentType: SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE,
      contractVersion: SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION,
    }),
    sharedPhysicalPolicy: Object.freeze({
      leftHandShapePolicy: LEFT_HAND_SHAPE_POLICY,
      physicalPlayabilityPolicy: PHYSICAL_PLAYABILITY_POLICY,
      maximumStaticFretSpan: MAXIMUM_STATIC_FRET_SPAN,
      maximumExtraFretReach: MAXIMUM_EXTRA_FRET_REACH,
      maximumShapeCandidates: MAX_LEFT_HAND_SHAPE_CANDIDATES,
      maximumAssignmentAttempts: MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS,
    }),
    pointCount,
    evaluatedShapeCount,
    playableShapeCount,
    rejectedShapeCount,
    unplayablePointCount,
    measures: Object.freeze(measures),
  });

  checkpoint(runtime, 'sustained-left-hand-physical:complete', {
    pointCount,
    evaluatedShapeCount,
    playableShapeCount,
    rejectedShapeCount,
    unplayablePointCount,
  });
  return result;
}

module.exports = {
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION,
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE,
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_AUTHORITY,
  SUSTAINED_PHYSICAL_POINT_STATUS,
  MAX_SUSTAINED_PHYSICAL_STATE_CANDIDATES,
  SustainedLeftHandPhysicalStateModelError,
  createSustainedLeftHandPhysicalStateModel,
};
