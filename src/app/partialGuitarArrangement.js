'use strict';

const crypto = require('node:crypto');

const { EngineError } = require('../errors/engineError');
const { createPolyphonicSourceModel } = require('../music/polyphonicSourceModel');
const { createDeterministicReductionPlan } = require('../music/deterministicReductionPlan');
const {
  RETAINED_NOTE_CAPS,
  createMelodyBassArrangementSelection,
} = require('../music/melodyBassArrangementPolicy');
const { createSustainTieGraph } = require('../music/sustainTieGraph');
const { createSimultaneousEventModel } = require('../music/simultaneousEventModel');
const { createCanonicalTabResultV2 } = require('../tab/canonicalTabResultV2');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriterV2');

const PARTIAL_GUITAR_ARRANGEMENT_VERSION = '1.1.0';
const PARTIAL_GUITAR_ARRANGEMENT_DOCUMENT_TYPE = 'PartialGuitarTabArrangement';
const PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY = 'PROVISIONAL_REVIEW_ONLY';
const PARTIAL_GUITAR_ARRANGEMENT_POLICY = 'MELODY_BASS_PLAYABLE_MAXIMIZATION_2.0';
const REVIEW_EDITABLE_PROJECTION_VERSION = '1.1.0';
const REVIEW_EDITABLE_PROJECTION_DOCUMENT_TYPE = 'ReviewEditableTabProjection';

function isRecoverableArrangementFailure(error) {
  if (error?.code === 'LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED') return true;
  if (error?.code === 'GUITAR_VOICING_CANDIDATE_LIMIT_EXCEEDED') return true;
  if (
    error?.code === 'SUSTAINED_PHYSICAL_SEARCH_REQUIRES_REVIEW'
    && error?.details?.reason === 'POSITION_STATE_COMPLEXITY_EXCEEDS_EXACT_SEARCH_BOUNDARY'
  ) return true;
  if (
    error?.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
    && error?.details?.reason === 'UNPLAYABLE_PHYSICAL_POINT'
  ) return true;
  if (
    error?.code === 'UNPLAYABLE_GRACE_PHYSICAL_TRANSITION'
    && error?.details?.reason === 'GRACE_CHORD_REQUIRES_REVIEW'
  ) return true;
  return error?.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
    && error?.details?.reason === 'NO_PLAYABLE_FINAL_SELECTION_CANDIDATE';
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function sourceNotes(sourceModel) {
  return sourceModel.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
}

function graceNotes(graceOrnamentGroups) {
  return (graceOrnamentGroups || []).flatMap((group) => group.notes);
}

function reducedSourceModel(sourceModel, selected, runtime, preserveTies) {
  const originalByReducedId = new Map();
  let eventCount = 0;
  const measures = sourceModel.measures.map((measure) => {
    const retainedEvents = measure.events.filter((event) => (
      event.type === 'rest' || selected.has(event.sourceEventId)
    ));
    const events = retainedEvents.map((event, sourceOrder) => {
      checkpoint(runtime, 'partial-arrangement:reindex-event', {
        measureIndex: measure.index,
        sourceOrder,
      });
      const sourceEventId = `${sourceModel.source.partId}:measure:${measure.index}:note:${sourceOrder}`;
      const previous = retainedEvents[sourceOrder - 1] || null;
      const chordWithPrevious = Boolean(
        event.type === 'note'
        && event.source.chordWithPrevious
        && previous?.type === 'note'
        && previous.voice === event.voice
        && previous.staff === event.staff
        && previous.onsetDivisions === event.onsetDivisions
      );
      if (event.type === 'note') originalByReducedId.set(sourceEventId, event);
      return {
        sourceEventId,
        sourceOrder,
        type: event.type,
        voice: event.voice,
        staff: event.staff,
        onsetDivisions: event.onsetDivisions,
        durationDivisions: event.durationDivisions,
        ...(event.type === 'note' ? { pitch: { ...event.pitch } } : {}),
        tieStart: preserveTies ? event.tieStart : false,
        tieStop: preserveTies ? event.tieStop : false,
        source: {
          partId: sourceModel.source.partId,
          measureIndex: measure.index,
          measureNumber: measure.number,
          noteIndex: sourceOrder,
          chordWithPrevious,
        },
      };
    });
    eventCount += events.length;
    return {
      measureId: measure.measureId,
      index: measure.index,
      number: measure.number,
      implicit: measure.implicit,
      divisions: measure.divisions,
      timeSignature: { ...measure.timeSignature },
      expectedDurationDivisions: measure.expectedDurationDivisions,
      events,
    };
  });

  return {
    model: createPolyphonicSourceModel({
      documentType: sourceModel.documentType,
      contractVersion: sourceModel.contractVersion,
      source: { ...sourceModel.source },
      measureCount: sourceModel.measureCount,
      eventCount,
      measures,
    }, runtime),
    originalByReducedId,
  };
}

function reducedDecisions(model, originalByReducedId, instructionById) {
  const decisions = [];
  for (const measure of model.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const original = originalByReducedId.get(event.sourceEventId);
      const instruction = original && instructionById.get(original.sourceEventId);
      if (!instruction || instruction.disposition !== 'KEEP') {
        throw new TypeError('Partial arrangement lost retained-note reduction provenance.');
      }
      decisions.push(Object.freeze({
        decisionType: instruction.octaveShiftSemitones === 0
          ? 'PRESERVED'
          : 'OCTAVE_DISPLACED',
        sourceEventIds: Object.freeze([event.sourceEventId]),
        sourceGroupId: null,
      }));
    }
  }
  return Object.freeze(decisions);
}

function reducedGuitarOptions(guitarOptions, originalByReducedId) {
  const sourceOverrides = guitarOptions?.positionOverrides;
  if (!sourceOverrides || typeof sourceOverrides !== 'object') return guitarOptions;
  const positionOverrides = Object.create(null);
  for (const [reducedId, original] of originalByReducedId) {
    const override = sourceOverrides[original.sourceEventId];
    if (override) positionOverrides[reducedId] = { ...override };
  }
  return { ...guitarOptions, positionOverrides };
}

function assertPositionOverridesRetained(selected, guitarOptions) {
  const overrides = guitarOptions?.positionOverrides;
  if (!overrides || typeof overrides !== 'object') return;
  const missingSourceEventIds = Object.keys(overrides).filter((sourceEventId) => !selected.has(sourceEventId));
  if (missingSourceEventIds.length > 0) {
    throw new EngineError(
      'The requested string/fret note could not be retained by the provisional arrangement.',
      'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION',
      Object.freeze({ reason: 'POSITION_OVERRIDE_NOT_RETAINED', missingSourceEventIds }),
      'PartialGuitarArrangementError',
    );
  }
}

function pitchSnapshot(pitch) {
  return Object.freeze({
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
    midi: pitch.midi,
    written: pitch.written,
  });
}

function buildArtifact({
  sourceModel,
  sourceUploadSha256,
  reduction,
  selected,
  originalByReducedId,
  canonicalTabResult,
  musicXml,
  retainedNoteCap,
  attempts,
  reasonBySourceEventId,
  originalError,
  graceOrnamentGroups = [],
  tiesNormalizedForReview = false,
}) {
  const instructionById = new Map(
    reduction.instructions.map((instruction) => [instruction.sourceEventId, instruction]),
  );
  const selectionByOriginalId = new Map();
  for (const disposition of canonicalTabResult.noteDispositions) {
    const original = originalByReducedId.get(disposition.sourceEventId);
    if (!original || disposition.disposition !== 'KEEP' || !disposition.selectedPosition) {
      throw new TypeError('Partial arrangement lost physical selection provenance.');
    }
    selectionByOriginalId.set(original.sourceEventId, disposition);
  }

  const mainNoteDispositions = sourceNotes(sourceModel).map((event) => {
    const instruction = instructionById.get(event.sourceEventId);
    if (!instruction) throw new TypeError('Partial arrangement lost source-note provenance.');
    const selectedDisposition = selectionByOriginalId.get(event.sourceEventId);
    if (instruction.disposition === 'OMIT') {
      return Object.freeze({
        sourceEventId: event.sourceEventId,
        sourcePitch: pitchSnapshot(event.pitch),
        disposition: 'OMITTED',
        targetPitch: null,
        octaveShiftSemitones: null,
        selectedPosition: null,
        reasonCode: 'SOURCE_REPRESENTATION_NORMALIZATION',
      });
    }
    if (!selected.has(event.sourceEventId) || !selectedDisposition) {
      return Object.freeze({
        sourceEventId: event.sourceEventId,
        sourcePitch: pitchSnapshot(event.pitch),
        disposition: 'UNASSIGNED',
        targetPitch: null,
        octaveShiftSemitones: null,
        selectedPosition: null,
        reasonCode: reasonBySourceEventId[event.sourceEventId],
      });
    }
    const octaveShifted = selectedDisposition.octaveShiftSemitones !== 0;
    return Object.freeze({
      sourceEventId: event.sourceEventId,
      sourcePitch: pitchSnapshot(event.pitch),
      disposition: octaveShifted ? 'OCTAVE_SHIFTED' : 'KEPT',
      targetPitch: pitchSnapshot(selectedDisposition.targetPitch),
      octaveShiftSemitones: selectedDisposition.octaveShiftSemitones,
      selectedPosition: Object.freeze({ ...selectedDisposition.selectedPosition }),
      reasonCode: octaveShifted
        ? 'OCTAVE_NEAREST_IN_REGISTER'
        : reasonBySourceEventId[event.sourceEventId],
    });
  });
  const graceNoteDispositions = graceNotes(graceOrnamentGroups).map((event) => Object.freeze({
    sourceEventId: event.graceEventId,
    sourcePitch: pitchSnapshot(event.pitch),
    disposition: 'UNASSIGNED',
    targetPitch: null,
    octaveShiftSemitones: null,
    selectedPosition: null,
    reasonCode: 'GRACE_TIMING_REQUIRES_REVIEW',
  }));
  const noteDispositions = [...mainNoteDispositions, ...graceNoteDispositions];
  const assignedNoteCount = noteDispositions.filter((entry) => (
    entry.disposition === 'KEPT' || entry.disposition === 'OCTAVE_SHIFTED'
  )).length;
  const unassignedNoteCount = noteDispositions.filter(
    (entry) => entry.disposition === 'UNASSIGNED',
  ).length;
  const omittedNoteCount = noteDispositions.filter(
    (entry) => entry.disposition === 'OMITTED',
  ).length;
  const writerBytes = Buffer.byteLength(musicXml, 'utf8');

  return Object.freeze({
    documentType: PARTIAL_GUITAR_ARRANGEMENT_DOCUMENT_TYPE,
    contractVersion: PARTIAL_GUITAR_ARRANGEMENT_VERSION,
    authority: PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY,
    policy: PARTIAL_GUITAR_ARRANGEMENT_POLICY,
    sourceUploadSha256,
    source: Object.freeze({
      documentType: sourceModel.documentType,
      contractVersion: sourceModel.contractVersion,
      partId: sourceModel.source.partId,
    }),
    recovery: Object.freeze({
      originalErrorCode: originalError.code,
      originalSourceGroupId: originalError.details?.sourceGroupId || null,
      retainedNoteCap,
      attempts: Object.freeze(attempts.map((attempt) => Object.freeze({ ...attempt }))),
      unassignedGraceNoteCount: graceNoteDispositions.length,
      tiesNormalizedForReview,
    }),
    sourceNoteCount: noteDispositions.length,
    assignedNoteCount,
    unassignedNoteCount,
    omittedNoteCount,
    coverageBasisPoints: noteDispositions.length === 0
      ? null
      : Math.floor((assignedNoteCount * 10_000) / noteDispositions.length),
    noteDispositions: Object.freeze(noteDispositions),
    renderer: Object.freeze({
      mediaType: 'application/vnd.recordare.musicxml+xml',
      byteLength: writerBytes,
      sha256: crypto.createHash('sha256').update(musicXml).digest('hex'),
    }),
  });
}

function buildReviewEditableProjection(sourceModel, arrangementArtifact, runtime) {
  const dispositionById = new Map(
    arrangementArtifact.noteDispositions.map((entry) => [entry.sourceEventId, entry]),
  );
  const grouping = createSimultaneousEventModel(sourceModel, runtime);
  const eventById = new Map(
    sourceModel.measures.flatMap((measure) => measure.events)
      .filter((event) => event.type === 'note')
      .map((event) => [event.sourceEventId, event]),
  );
  const tiedGroupEventIds = new Set();
  for (const group of grouping.measures.flatMap((measure) => measure.groups)) {
    if (group.sourceEventIds.some((sourceEventId) => {
      const member = eventById.get(sourceEventId);
      return member?.tieStart || member?.tieStop;
    })) {
      for (const sourceEventId of group.sourceEventIds) tiedGroupEventIds.add(sourceEventId);
    }
  }
  const noteDispositions = [];
  for (const measure of sourceModel.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const disposition = dispositionById.get(event.sourceEventId);
      if (!disposition) throw new TypeError('Review projection lost source-note provenance.');
      noteDispositions.push(Object.freeze({
        sourceEventId: event.sourceEventId,
        disposition: disposition.disposition === 'KEPT' || disposition.disposition === 'OCTAVE_SHIFTED'
          ? 'KEEP'
          : 'OMIT',
        reasonCode: disposition.reasonCode,
        assignmentEligible: disposition.disposition === 'UNASSIGNED'
          && !event.tieStart
          && !event.tieStop
          && !tiedGroupEventIds.has(event.sourceEventId),
        octaveShiftSemitones: disposition.octaveShiftSemitones,
        targetPitch: disposition.targetPitch,
        selectedPosition: disposition.selectedPosition,
      }));
    }
  }
  return Object.freeze({
    documentType: REVIEW_EDITABLE_PROJECTION_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITABLE_PROJECTION_VERSION,
    authority: PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY,
    sourceUploadSha256: arrangementArtifact.sourceUploadSha256,
    source: sourceModel.source,
    measures: sourceModel.measures,
    simultaneousGroups: Object.freeze(grouping.measures.flatMap((measure) => measure.groups)),
    noteDispositions: Object.freeze(noteDispositions),
  });
}

function isProcessingStop(error) {
  return error?.code === 'PROCESSING_ABORTED'
    || error?.code === 'PROCESSING_DEADLINE_EXCEEDED';
}

function isRetryableCandidateFailure(error) {
  if (isRecoverableArrangementFailure(error)) return true;
  return error?.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
    && (error?.details?.reason === 'POSITION_OVERRIDE_NOT_PLAYABLE'
      || error?.details?.reason === 'POSITION_OVERRIDE_NOT_RETAINED');
}

function recoverPartialGuitarArrangement({
  sourceModel,
  arrangementDecisions,
  processing,
  writerOptions = {},
  guitarOptions = {},
  sourceUploadSha256,
  originalError,
  graceOrnamentGroups = [],
}) {
  if (!isRetryableCandidateFailure(originalError)) return null;
  checkpoint(processing, 'partial-arrangement:start', { originalErrorCode: originalError.code });
  let tieGraph = null;
  const recoveryReviewIssues = [];
  try {
    tieGraph = createSustainTieGraph(sourceModel, processing);
  } catch (error) {
    if (error?.code !== 'INVALID_SUSTAIN_TIE_GRAPH') throw error;
    recoveryReviewIssues.push(Object.freeze({
      severity: 'error',
      category: 'semantic',
      code: 'INVALID_TIE_CHAIN_OMITTED_FOR_REVIEW',
      message: 'Invalid tie markers were omitted only from the provisional TAB.',
      reviewDisposition: 'REVIEW_REQUIRED',
      location: Object.freeze({
        measure: null,
        measureIndex: error.details?.measureIndex ?? null,
        eventIndex: null,
        sourceEventId: error.details?.sourceEventId ?? null,
      }),
      details: Object.freeze({
        feature: 'tie',
        reason: error.details?.reason || 'INVALID_SUSTAIN_TIE_GRAPH',
        reviewDisposition: 'REVIEW_REQUIRED',
      }),
    }));
  }
  const reduction = createDeterministicReductionPlan(
    sourceModel,
    arrangementDecisions,
    processing,
    guitarOptions,
  );
  const instructionById = new Map(
    reduction.instructions.map((instruction) => [instruction.sourceEventId, instruction]),
  );
  const forcedSourceEventIds = new Set(Object.keys(guitarOptions.positionOverrides || {}));
  let positionOverrideError = null;
  const attempts = [];

  for (const retainedNoteCap of RETAINED_NOTE_CAPS) {
    try {
      const selection = createMelodyBassArrangementSelection({
        sourceModel,
        reduction,
        tieGraph,
        retainedNoteCap,
        forcedSourceEventIds,
      }, processing);
      const selected = new Set(selection.selectedSourceEventIds);
      assertPositionOverridesRetained(selected, guitarOptions);
      const reduced = reducedSourceModel(sourceModel, selected, processing, tieGraph !== null);
      const decisions = reducedDecisions(reduced.model, reduced.originalByReducedId, instructionById);
      const canonicalTabResult = createCanonicalTabResultV2(
        reduced.model,
        decisions,
        processing,
        reducedGuitarOptions(guitarOptions, reduced.originalByReducedId),
      );
      const partialWriterOptions = Array.isArray(writerOptions.chordLabels)
        ? { chordLabels: writerOptions.chordLabels }
        : {};
      const musicXml = serializeCanonicalTabResultV2ToMusicXml(
        canonicalTabResult,
        partialWriterOptions,
        processing,
      );
      const successfulAttempts = [...attempts, Object.freeze({
        retainedNoteCap,
        outcome: 'SELECTED',
        errorCode: null,
      })];
      const arrangementArtifact = buildArtifact({
        sourceModel,
        sourceUploadSha256,
        reduction,
        selected,
        originalByReducedId: reduced.originalByReducedId,
        canonicalTabResult,
        musicXml,
        retainedNoteCap,
        attempts: successfulAttempts,
        reasonBySourceEventId: selection.reasonBySourceEventId,
        originalError,
        graceOrnamentGroups,
        tiesNormalizedForReview: tieGraph === null,
      });
      let reviewEditableProjection;
      try {
        reviewEditableProjection = buildReviewEditableProjection(
          sourceModel,
          arrangementArtifact,
          processing,
        );
      } catch (projectionError) {
        throw new TypeError(`Review projection failed: ${projectionError.message}`);
      }
      checkpoint(processing, 'partial-arrangement:complete', {
        retainedNoteCap,
        assignedNoteCount: arrangementArtifact.assignedNoteCount,
        unassignedNoteCount: arrangementArtifact.unassignedNoteCount,
      });
      return Object.freeze({
        arrangementArtifact,
        reviewEditableProjection,
        musicXml,
        reviewIssues: Object.freeze(recoveryReviewIssues),
      });
    } catch (error) {
      if (isProcessingStop(error)) throw error;
      if (error instanceof TypeError && /Review projection/.test(error.message)) throw error;
      if (!isRetryableCandidateFailure(error)) throw error;
      if (
        error?.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
        && (error?.details?.reason === 'POSITION_OVERRIDE_NOT_PLAYABLE'
          || error?.details?.reason === 'POSITION_OVERRIDE_NOT_RETAINED')
      ) positionOverrideError = error;
      attempts.push(Object.freeze({
        retainedNoteCap,
        outcome: 'REJECTED',
        errorCode: error.code,
      }));
      checkpoint(processing, 'partial-arrangement:retry', {
        retainedNoteCap,
        errorCode: error?.code || 'UNCLASSIFIED_ERROR',
      });
    }
  }
  if (positionOverrideError) throw positionOverrideError;
  return null;
}

module.exports = {
  PARTIAL_GUITAR_ARRANGEMENT_VERSION,
  PARTIAL_GUITAR_ARRANGEMENT_DOCUMENT_TYPE,
  PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY,
  PARTIAL_GUITAR_ARRANGEMENT_POLICY,
  REVIEW_EDITABLE_PROJECTION_VERSION,
  REVIEW_EDITABLE_PROJECTION_DOCUMENT_TYPE,
  recoverPartialGuitarArrangement,
};
