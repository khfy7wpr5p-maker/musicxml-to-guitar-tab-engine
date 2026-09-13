'use strict';

const crypto = require('node:crypto');

const { createPolyphonicSourceModel } = require('../music/polyphonicSourceModel');
const { createDeterministicReductionPlan } = require('../music/deterministicReductionPlan');
const { createSustainTieGraph } = require('../music/sustainTieGraph');
const { createCanonicalTabResultV2 } = require('../tab/canonicalTabResultV2');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriterV2');

const PARTIAL_GUITAR_ARRANGEMENT_VERSION = '1.0.0';
const PARTIAL_GUITAR_ARRANGEMENT_DOCUMENT_TYPE = 'PartialGuitarTabArrangement';
const PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY = 'PROVISIONAL_REVIEW_ONLY';
const PARTIAL_GUITAR_ARRANGEMENT_POLICY = 'MELODY_BASS_BOUNDED_REDUCTION_1.0';
const RETAINED_NOTE_CAPS = Object.freeze([3, 2, 1]);

function isRecoverableArrangementFailure(error) {
  if (error?.code === 'LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED') return true;
  if (
    error?.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
    && error?.details?.reason === 'UNPLAYABLE_PHYSICAL_POINT'
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

function selectOuterRegisterNotes(sourceModel, reduction, cap, runtime, tieGraph) {
  const instructionById = new Map(
    reduction.instructions.map((instruction) => [instruction.sourceEventId, instruction]),
  );
  const selected = new Set();

  for (let measureIndex = 0; measureIndex < sourceModel.measures.length; measureIndex += 1) {
    const measure = sourceModel.measures[measureIndex];
    const byOnset = new Map();
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const instruction = instructionById.get(event.sourceEventId);
      if (!instruction || instruction.disposition !== 'KEEP') continue;
      const entries = byOnset.get(event.onsetDivisions) || [];
      entries.push({ event, instruction });
      byOnset.set(event.onsetDivisions, entries);
    }

    for (const [onsetDivisions, entries] of byOnset) {
      checkpoint(runtime, 'partial-arrangement:select-group', {
        measureIndex,
        onsetDivisions,
        sourceNoteCount: entries.length,
        retainedNoteCap: cap,
      });
      const descending = [...entries].sort((left, right) => (
        right.event.pitch.midi - left.event.pitch.midi
        || left.event.sourceOrder - right.event.sourceOrder
      ));
      const targetMidis = new Set();
      let highIndex = 0;
      let lowIndex = descending.length - 1;
      while (highIndex <= lowIndex && targetMidis.size < cap) {
        const candidates = [descending[highIndex]];
        highIndex += 1;
        if (highIndex <= lowIndex) {
          candidates.push(descending[lowIndex]);
          lowIndex -= 1;
        }
        for (const candidate of candidates) {
          if (targetMidis.size >= cap) break;
          const targetMidi = candidate.instruction.targetMidi;
          if (targetMidis.has(targetMidi)) continue;
          targetMidis.add(targetMidi);
          selected.add(candidate.event.sourceEventId);
        }
      }
    }
  }

  // A tied logical note is indivisible. If any segment was reduced, reduce the
  // complete chain rather than emitting a broken or pitch-changing tie.
  for (const chain of tieGraph?.chains || []) {
    if (chain.segments.some((segment) => !selected.has(segment.sourceEventId))) {
      for (const segment of chain.segments) selected.delete(segment.sourceEventId);
    }
  }
  return selected;
}

function selectMonophonicMelodyNotes(sourceModel, reduction, runtime, tieGraph) {
  const instructionById = new Map(
    reduction.instructions.map((instruction) => [instruction.sourceEventId, instruction]),
  );
  const selected = new Set();

  for (let measureIndex = 0; measureIndex < sourceModel.measures.length; measureIndex += 1) {
    const measure = sourceModel.measures[measureIndex];
    const byOnset = new Map();
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const instruction = instructionById.get(event.sourceEventId);
      if (!instruction || instruction.disposition !== 'KEEP') continue;
      const entries = byOnset.get(event.onsetDivisions) || [];
      entries.push({ event, instruction });
      byOnset.set(event.onsetDivisions, entries);
    }

    let activeUntil = 0;
    for (const [onsetDivisions, entries] of [...byOnset].sort((left, right) => left[0] - right[0])) {
      checkpoint(runtime, 'partial-arrangement:select-monophonic-group', {
        measureIndex,
        onsetDivisions,
        sourceNoteCount: entries.length,
      });
      if (onsetDivisions < activeUntil) continue;
      const chosen = [...entries].sort((left, right) => (
        right.instruction.targetMidi - left.instruction.targetMidi
        || left.event.sourceOrder - right.event.sourceOrder
      ))[0];
      selected.add(chosen.event.sourceEventId);
      activeUntil = onsetDivisions + chosen.event.durationDivisions;
    }
  }

  // Keep tie chains as all-or-nothing provenance units, matching the chord
  // reduction path. Removing an incomplete chain is safer than inventing a
  // detached note in the provisional melody line.
  for (const chain of tieGraph?.chains || []) {
    if (chain.segments.some((segment) => !selected.has(segment.sourceEventId))) {
      for (const segment of chain.segments) selected.delete(segment.sourceEventId);
    }
  }
  return selected;
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
        reasonCode: 'BOUNDED_GUITAR_REDUCTION',
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
      reasonCode: octaveShifted ? 'OCTAVE_NEAREST_IN_REGISTER' : 'PRESERVE_IN_REGISTER',
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

function isProcessingStop(error) {
  return error?.code === 'PROCESSING_ABORTED'
    || error?.code === 'PROCESSING_DEADLINE_EXCEEDED';
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
  if (!isRecoverableArrangementFailure(originalError)) return null;
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

  for (const retainedNoteCap of RETAINED_NOTE_CAPS) {
    try {
      const selected = retainedNoteCap === 1
        ? selectMonophonicMelodyNotes(sourceModel, reduction, processing, tieGraph)
        : selectOuterRegisterNotes(sourceModel, reduction, retainedNoteCap, processing, tieGraph);
      const reduced = reducedSourceModel(sourceModel, selected, processing, tieGraph !== null);
      const decisions = reducedDecisions(reduced.model, reduced.originalByReducedId, instructionById);
      const canonicalTabResult = createCanonicalTabResultV2(
        reduced.model,
        decisions,
        processing,
        guitarOptions,
      );
      const partialWriterOptions = Array.isArray(writerOptions.chordLabels)
        ? { chordLabels: writerOptions.chordLabels }
        : {};
      const musicXml = serializeCanonicalTabResultV2ToMusicXml(
        canonicalTabResult,
        partialWriterOptions,
        processing,
      );
      const arrangementArtifact = buildArtifact({
        sourceModel,
        sourceUploadSha256,
        reduction,
        selected,
        originalByReducedId: reduced.originalByReducedId,
        canonicalTabResult,
        musicXml,
        retainedNoteCap,
        originalError,
        graceOrnamentGroups,
        tiesNormalizedForReview: tieGraph === null,
      });
      checkpoint(processing, 'partial-arrangement:complete', {
        retainedNoteCap,
        assignedNoteCount: arrangementArtifact.assignedNoteCount,
        unassignedNoteCount: arrangementArtifact.unassignedNoteCount,
      });
      return Object.freeze({
        arrangementArtifact,
        musicXml,
        reviewIssues: Object.freeze(recoveryReviewIssues),
      });
    } catch (error) {
      if (isProcessingStop(error)) throw error;
      checkpoint(processing, 'partial-arrangement:retry', {
        retainedNoteCap,
        errorCode: error?.code || 'UNCLASSIFIED_ERROR',
      });
    }
  }
  return null;
}

module.exports = {
  PARTIAL_GUITAR_ARRANGEMENT_VERSION,
  PARTIAL_GUITAR_ARRANGEMENT_DOCUMENT_TYPE,
  PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY,
  PARTIAL_GUITAR_ARRANGEMENT_POLICY,
  recoverPartialGuitarArrangement,
};
