'use strict';

const { EngineError } = require('../errors/engineError');
const { createSimultaneousEventModel } = require('./simultaneousEventModel');
const {
  createSustainedCanonicalSelectionBridgeProjection,
} = require('./sustainedCanonicalSelectionBridgeV1');
const {
  createSustainedPolyphonicPathSelection,
} = require('./sustainedPolyphonicPathSolver');

class SustainedCanonicalFinalSelectionError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION',
      Object.freeze({ ...details }),
      'SustainedCanonicalFinalSelectionError',
    );
  }
}

function unsupported(message, reason, details = {}) {
  return new SustainedCanonicalFinalSelectionError(message, { reason, ...details });
}

function assertExactPreservedProjection(projection) {
  for (const instruction of projection.instructions) {
    if (
      instruction.disposition !== 'KEEP'
      || instruction.octaveShiftSemitones !== 0
      || instruction.targetMidi !== instruction.sourceMidi
    ) {
      throw unsupported(
        'Sustained canonical final selection v1 requires exact preserved pitches.',
        'NON_EXACT_SUSTAINED_REDUCTION_NOT_SUPPORTED',
        {
          sourceEventId: instruction.sourceEventId,
          disposition: instruction.disposition,
          sourceMidi: instruction.sourceMidi,
          targetMidi: instruction.targetMidi,
          octaveShiftSemitones: instruction.octaveShiftSemitones,
        },
      );
    }
  }
}

function assertNoIndependentSourceVoiceOverlap(source, runtime) {
  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    const measure = source.measures[measureIndex];
    const cursorByVoiceStaff = new Map();
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      if (runtime) {
        runtime.checkpoint('sustained-canonical-final-selection:source-event', {
          measureIndex,
          eventIndex,
        });
      }
      const event = measure.events[eventIndex];
      const key = `${event.staff}:${event.voice}`;
      const cursor = cursorByVoiceStaff.get(key) || 0;

      // A source <chord/> member is an additional pitch in the preceding
      // attack group, not an independently advancing voice event.  The
      // validated source model has already proved its exact same-onset,
      // same-voice/staff predecessor relationship.
      if (event.source.chordWithPrevious) continue;

      if (event.onsetDivisions < cursor) {
        throw unsupported(
          'Sustained selection cannot represent overlapping independent notes in one voice.',
          'OVERLAPPING_NOTES_WITHIN_ONE_VOICE',
          {
            measureId: measure.measureId,
            sourceEventId: event.sourceEventId,
            staff: event.staff,
            voice: event.voice,
            onsetDivisions: event.onsetDivisions,
            cursor,
          },
        );
      }
      cursorByVoiceStaff.set(key, event.onsetDivisions + event.durationDivisions);
    }
  }
}

function createSustainedCanonicalFinalSelection(
  sourceModel,
  arrangementDecisions,
  runtime = null,
) {
  if (runtime) runtime.checkpoint('sustained-canonical-final-selection:start');
  const projection = createSustainedCanonicalSelectionBridgeProjection(
    sourceModel,
    arrangementDecisions,
    runtime,
  );
  assertExactPreservedProjection(projection);
  assertNoIndependentSourceVoiceOverlap(sourceModel, runtime);

  const grouping = createSimultaneousEventModel(sourceModel, runtime);
  const path = createSustainedPolyphonicPathSelection(sourceModel, runtime);
  const logicalBySourceEventId = new Map();
  for (const logical of path.logicalNoteSelections) {
    for (const sourceEventId of logical.sourceEventIds) {
      logicalBySourceEventId.set(sourceEventId, logical);
    }
  }

  const groupBySourceEventId = new Map();
  const selectedShapes = [];
  for (const measure of grouping.measures) {
    for (const group of measure.groups) {
      const selectedShapeId = `${group.groupId}:selected-shape`;
      for (const sourceEventId of group.sourceEventIds) {
        groupBySourceEventId.set(sourceEventId, selectedShapeId);
      }

      const point = path.selectedPointStates.find((entry) => (
        entry.measureId === measure.measureId
        && entry.timeDivisions === group.onsetDivisions
      ));
      if (!point) {
        throw unsupported(
          'A simultaneous source group did not resolve to a sustained sonority point.',
          'MISSING_SIMULTANEOUS_SONORITY_POINT',
          { sourceGroupId: group.groupId },
        );
      }
      const assignmentBySourceEventId = new Map(
        point.fingerAssignments.map((entry) => [entry.sourceEventId, entry]),
      );
      const fingerAssignments = group.sourceEventIds.map((sourceEventId) => {
        const assignment = assignmentBySourceEventId.get(sourceEventId);
        if (!assignment) {
          throw unsupported(
            'A simultaneous source event is absent from its sustained physical state.',
            'MISSING_SIMULTANEOUS_FINGER_ASSIGNMENT',
            { sourceGroupId: group.groupId, sourceEventId },
          );
        }
        return Object.freeze({ sourceEventId, finger: assignment.finger });
      });
      selectedShapes.push(Object.freeze({
        selectedShapeId,
        sourceGroupId: group.groupId,
        sourceEventIds: group.sourceEventIds,
        voicingCandidateId: `${point.positionStateCandidateId}:canonical-voicing`,
        shapeCandidateId: `${point.physicalStateCandidateId}:canonical-shape`,
        fingerAssignments: Object.freeze(fingerAssignments),
        // The path validates the complete active sonority. Canonical shapes describe
        // only this attack group, so cross-onset barres are deliberately not copied.
        barres: Object.freeze([]),
        physicalValidation: Object.freeze({ status: point.physicalValidation.status }),
      }));
    }
  }

  const noteSelections = projection.retainedSourceEventIds.map((sourceEventId) => {
    const logical = logicalBySourceEventId.get(sourceEventId);
    if (!logical) {
      throw unsupported(
        'A retained source event did not resolve to a sustained logical note.',
        'MISSING_RETAINED_LOGICAL_NOTE',
        { sourceEventId },
      );
    }
    return Object.freeze({
      sourceEventId,
      string: logical.string,
      fret: logical.fret,
      selectedShapeId: groupBySourceEventId.get(sourceEventId) || null,
    });
  });

  if (runtime) {
    runtime.checkpoint('sustained-canonical-final-selection:complete', {
      noteSelectionCount: noteSelections.length,
      selectedShapeCount: selectedShapes.length,
    });
  }
  return Object.freeze({
    noteSelections: Object.freeze(noteSelections),
    selectedShapes: Object.freeze(selectedShapes),
  });
}

module.exports = {
  SustainedCanonicalFinalSelectionError,
  createSustainedCanonicalFinalSelection,
};
