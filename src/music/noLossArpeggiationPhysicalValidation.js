'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
  createPolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_VERSION,
  NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_DOCUMENT_TYPE,
} = require('./noLossArpeggiationTimingCandidate');
const {
  createCanonicalTabResultV2,
} = require('../tab/canonicalTabResultV2');

const NO_LOSS_ARPEGGIATION_PHYSICAL_VALIDATION_VERSION = '1.0.0';
const NO_LOSS_ARPEGGIATION_PHYSICAL_VALIDATION_DOCUMENT_TYPE =
  'NoLossArpeggiationPhysicalValidation';

class NoLossArpeggiationPhysicalValidationError extends EngineError {
  constructor(message, code = 'INVALID_A3_ARPEGGIATION_PHYSICAL_VALIDATION', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'NoLossArpeggiationPhysicalValidationError',
    );
  }
}

function invalid(message, details = {}) {
  return new NoLossArpeggiationPhysicalValidationError(message, undefined, details);
}

function sourceNotes(source) {
  return source.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
}

function assertCandidateMatchesSource(source, candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw invalid('Timing candidate must be an object.');
  }
  if (candidate.documentType !== NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_DOCUMENT_TYPE) {
    throw invalid('Timing candidate documentType is not supported.');
  }
  if (candidate.contractVersion !== NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_VERSION) {
    throw invalid('Timing candidate contractVersion is not supported.');
  }
  if (
    !candidate.source
    || candidate.source.documentType !== POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE
    || candidate.source.contractVersion !== POLYPHONIC_SOURCE_MODEL_VERSION
    || candidate.source.partId !== source.source.partId
  ) {
    throw invalid('Timing candidate source identity does not match the source model.');
  }
  if (
    candidate.sourceNoteLossAllowed !== false
    || candidate.sourceTimingAuthority !== true
    || candidate.targetTimingAuthority !== false
    || candidate.requiresReview !== true
    || candidate.exportAllowed !== false
    || candidate.candidateOrderIsPreferenceRank !== false
  ) {
    throw invalid('Timing candidate authority flags are invalid.');
  }
  if (
    !Array.isArray(candidate.sourceEventIds)
    || !Array.isArray(candidate.sourceTiming)
    || !Array.isArray(candidate.targetTiming)
    || !Array.isArray(candidate.decisions)
  ) {
    throw invalid('Timing candidate coverage lists are malformed.');
  }

  const notes = sourceNotes(source);
  if (
    candidate.sourceEventIds.length !== notes.length
    || candidate.sourceTiming.length !== notes.length
    || candidate.targetTiming.length !== notes.length
  ) {
    throw invalid('Timing candidate does not cover every source note exactly once.');
  }

  const targetTimingById = new Map();
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    const sourceEventId = candidate.sourceEventIds[index];
    const sourceTiming = candidate.sourceTiming[index];
    const targetTiming = candidate.targetTiming[index];

    if (
      sourceEventId !== note.sourceEventId
      || !sourceTiming
      || sourceTiming.sourceEventId !== note.sourceEventId
      || sourceTiming.onsetDivisions !== note.onsetDivisions
      || sourceTiming.durationDivisions !== note.durationDivisions
      || !targetTiming
      || targetTiming.sourceEventId !== note.sourceEventId
      || !Number.isSafeInteger(targetTiming.onsetDivisions)
      || targetTiming.onsetDivisions < 0
      || !Number.isSafeInteger(targetTiming.durationDivisions)
      || targetTiming.durationDivisions <= 0
    ) {
      throw invalid('Timing candidate does not preserve source identity/timing evidence.', {
        index,
        sourceEventId: note.sourceEventId,
      });
    }
    if (targetTimingById.has(note.sourceEventId)) {
      throw invalid('Timing candidate contains duplicate target timing evidence.', {
        sourceEventId: note.sourceEventId,
      });
    }
    targetTimingById.set(note.sourceEventId, targetTiming);
  }

  return { notes, targetTimingById };
}

function clonePitch(pitch) {
  return {
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
    midi: pitch.midi,
    written: pitch.written,
  };
}

function buildValidationTargetModel(source, targetTimingById, runtime) {
  let eventCount = 0;
  const measures = source.measures.map((measure) => {
    const events = measure.events.map((event) => {
      eventCount += 1;
      if (event.type === 'rest') {
        return {
          sourceEventId: event.sourceEventId,
          sourceOrder: event.sourceOrder,
          type: event.type,
          voice: event.voice,
          staff: event.staff,
          onsetDivisions: event.onsetDivisions,
          durationDivisions: event.durationDivisions,
          tieStart: event.tieStart,
          tieStop: event.tieStop,
          source: { ...event.source },
        };
      }

      const targetTiming = targetTimingById.get(event.sourceEventId);
      if (!targetTiming) {
        throw invalid('Timing candidate is missing target timing for a source note.', {
          sourceEventId: event.sourceEventId,
        });
      }
      const endDivisions = targetTiming.onsetDivisions + targetTiming.durationDivisions;
      if (
        !Number.isSafeInteger(endDivisions)
        || endDivisions > measure.expectedDurationDivisions
      ) {
        throw invalid('Validation target timing exceeds the source measure boundary.', {
          sourceEventId: event.sourceEventId,
          measureIndex: measure.index,
          endDivisions,
          measureEndDivisions: measure.expectedDurationDivisions,
        });
      }
      return {
        sourceEventId: event.sourceEventId,
        sourceOrder: event.sourceOrder,
        type: event.type,
        voice: event.voice,
        staff: event.staff,
        onsetDivisions: targetTiming.onsetDivisions,
        durationDivisions: targetTiming.durationDivisions,
        pitch: clonePitch(event.pitch),
        tieStart: event.tieStart,
        tieStop: event.tieStop,
        ...(Object.hasOwn(event, 'letRing') ? { letRing: event.letRing } : {}),
        source: { ...event.source },
      };
    });

    for (let index = 0; index < events.length; index += 1) {
      const original = measure.events[index];
      const event = events[index];
      if (!original.source.chordWithPrevious) {
        event.source.chordWithPrevious = false;
        continue;
      }
      const previous = events[index - 1] || null;
      event.source.chordWithPrevious = Boolean(
        event.type === 'note'
        && previous
        && previous.type === 'note'
        && previous.voice === event.voice
        && previous.staff === event.staff
        && previous.onsetDivisions === event.onsetDivisions,
      );
    }

    return {
      measureId: measure.measureId,
      index: measure.index,
      number: measure.number,
      implicit: measure.implicit,
      divisions: measure.divisions,
      timeSignature: {
        beats: measure.timeSignature.beats,
        beatType: measure.timeSignature.beatType,
      },
      expectedDurationDivisions: measure.expectedDurationDivisions,
      events,
    };
  });

  return createPolyphonicSourceModel({
    documentType: source.documentType,
    contractVersion: source.contractVersion,
    source: {
      format: source.source.format,
      musicXmlVersion: source.source.musicXmlVersion,
      partId: source.source.partId,
    },
    measureCount: source.measureCount,
    eventCount,
    measures,
  }, runtime);
}

function buildValidationDecisions(source, candidate) {
  const decisionBySourceEventId = new Map();
  for (const decision of candidate.decisions) {
    if (
      !decision
      || typeof decision !== 'object'
      || !Array.isArray(decision.sourceEventIds)
      || typeof decision.decisionType !== 'string'
    ) {
      throw invalid('Timing candidate contains a malformed arrangement decision.');
    }
    for (const sourceEventId of decision.sourceEventIds) {
      if (decisionBySourceEventId.has(sourceEventId)) {
        throw invalid('Timing candidate arrangement decisions overlap.', { sourceEventId });
      }
      decisionBySourceEventId.set(sourceEventId, decision);
    }
  }

  const decisions = [];
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const decision = decisionBySourceEventId.get(event.sourceEventId);
      if (!decision) {
        throw invalid('Timing candidate arrangement decisions do not cover every source note.', {
          sourceEventId: event.sourceEventId,
        });
      }
      let decisionType;
      if (decision.decisionType === 'ARPEGGIATED' || decision.decisionType === 'PRESERVED') {
        decisionType = 'PRESERVED';
      } else if (decision.decisionType === 'OCTAVE_DISPLACED') {
        decisionType = 'OCTAVE_DISPLACED';
      } else {
        throw invalid('A3 first-slice physical validation does not support this decision type.', {
          decisionType: decision.decisionType,
          sourceEventId: event.sourceEventId,
        });
      }
      decisions.push(Object.freeze({
        decisionType,
        sourceEventIds: Object.freeze([event.sourceEventId]),
        sourceGroupId: null,
      }));
    }
  }
  return Object.freeze(decisions);
}

function isRecoverablePhysicalFailure(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.code === 'LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED') return true;
  if (error.code === 'UNPLAYABLE_SOURCE_PITCH') return true;
  if (
    error.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
    && error.details?.reason === 'UNPLAYABLE_PHYSICAL_POINT'
  ) return true;
  return error.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
    && [
      'NO_PLAYABLE_FINAL_SELECTION_CANDIDATE',
      'RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED',
      'RETAINED_TIE_NOT_SUPPORTED',
    ].includes(error.details?.reason);
}

function baseResult(source, candidate, status) {
  return {
    documentType: NO_LOSS_ARPEGGIATION_PHYSICAL_VALIDATION_DOCUMENT_TYPE,
    contractVersion: NO_LOSS_ARPEGGIATION_PHYSICAL_VALIDATION_VERSION,
    status,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    sourceGroupId: candidate.sourceGroupId,
    sourceNoteLossAllowed: false,
    targetTimingAuthority: false,
    canonicalAuthority: false,
    exportAllowed: false,
    requiresReview: true,
    validationOnly: true,
  };
}

function validateNoLossArpeggiationTimingCandidatePhysically(
  sourceModel,
  candidate,
  runtime = null,
  guitarOptions = {},
) {
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const { targetTimingById } = assertCandidateMatchesSource(source, candidate);
  const validationTargetModel = buildValidationTargetModel(source, targetTimingById, runtime);
  const validationDecisions = buildValidationDecisions(source, candidate);

  let canonical;
  try {
    canonical = createCanonicalTabResultV2(
      validationTargetModel,
      validationDecisions,
      runtime,
      guitarOptions,
    );
  } catch (error) {
    if (!isRecoverablePhysicalFailure(error)) throw error;
    return Object.freeze({
      ...baseResult(source, candidate, 'INFEASIBLE'),
      noteSelections: Object.freeze([]),
      failure: Object.freeze({
        code: error.code,
        reason: error.details?.reason ?? null,
      }),
    });
  }

  const noteSelections = canonical.noteDispositions.map((entry) => {
    if (entry.disposition !== 'KEEP' || !entry.selectedPosition || !entry.targetPitch) {
      throw new NoLossArpeggiationPhysicalValidationError(
        'Physical validation produced source-note loss or missing guitar placement.',
        'A3_PHYSICAL_VALIDATION_NOTE_LOSS',
        { sourceEventId: entry.sourceEventId, disposition: entry.disposition },
      );
    }
    return Object.freeze({
      sourceEventId: entry.sourceEventId,
      disposition: entry.disposition,
      targetPitch: Object.freeze({ ...entry.targetPitch }),
      octaveShiftSemitones: entry.octaveShiftSemitones,
      selectedPosition: Object.freeze({ ...entry.selectedPosition }),
      selectedShapeId: entry.selectedShapeId,
      ruleId: entry.ruleId,
    });
  });

  if (noteSelections.length !== candidate.sourceEventIds.length) {
    throw new NoLossArpeggiationPhysicalValidationError(
      'Physical validation changed the source-note count.',
      'A3_PHYSICAL_VALIDATION_NOTE_LOSS',
      {
        sourceNoteCount: candidate.sourceEventIds.length,
        selectionCount: noteSelections.length,
      },
    );
  }

  return Object.freeze({
    ...baseResult(source, candidate, 'FEASIBLE'),
    noteSelections: Object.freeze(noteSelections),
    selectedShapeCount: canonical.selectedShapes.length,
    failure: null,
  });
}

module.exports = {
  NO_LOSS_ARPEGGIATION_PHYSICAL_VALIDATION_VERSION,
  NO_LOSS_ARPEGGIATION_PHYSICAL_VALIDATION_DOCUMENT_TYPE,
  NoLossArpeggiationPhysicalValidationError,
  validateNoLossArpeggiationTimingCandidatePhysically,
};
