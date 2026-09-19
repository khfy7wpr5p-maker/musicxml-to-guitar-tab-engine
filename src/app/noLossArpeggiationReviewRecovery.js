'use strict';

const crypto = require('node:crypto');

const {
  createSimultaneousEventModel,
} = require('../music/simultaneousEventModel');
const {
  createGuitarArrangementPlan,
} = require('../music/guitarArrangementPlan');
const {
  createSourceCompleteArrangementAlternative,
} = require('../music/sourceCompleteArrangementAlternative');
const {
  createNoLossArpeggiationTimingCandidate,
} = require('../music/noLossArpeggiationTimingCandidate');
const {
  createNoLossArpeggiationPhysicalValidationBundle,
} = require('../music/noLossArpeggiationPhysicalValidation');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriterV2');
const {
  PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY,
  REVIEW_EDITABLE_PROJECTION_VERSION,
  REVIEW_EDITABLE_PROJECTION_DOCUMENT_TYPE,
} = require('./partialGuitarArrangement');

const NO_LOSS_ARPEGGIATED_GUITAR_ARRANGEMENT_VERSION = '1.0.0';
const NO_LOSS_ARPEGGIATED_GUITAR_ARRANGEMENT_DOCUMENT_TYPE =
  'NoLossArpeggiatedGuitarArrangement';
const NO_LOSS_ARPEGGIATION_RECOVERY_POLICY =
  'NO_LOSS_ARPEGGIATION_REVIEW_RECOVERY_1.0';

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function sourceNotes(sourceModel) {
  return sourceModel.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
}

function isEligibleFailure(error) {
  return Boolean(
    error
    && error.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
    && error.details?.reason === 'NO_PLAYABLE_FINAL_SELECTION_CANDIDATE'
    && typeof error.details?.sourceGroupId === 'string'
    && error.details.sourceGroupId.length > 0
  );
}

function findGroup(sourceModel, sourceGroupId, runtime) {
  const grouping = createSimultaneousEventModel(sourceModel, runtime);
  for (const measure of grouping.measures) {
    for (const group of measure.groups) {
      if (group.groupId === sourceGroupId) return { grouping, group };
    }
  }
  return { grouping, group: null };
}

function decisionIndexBySourceEventId(arrangementDecisions) {
  const byId = new Map();
  for (let index = 0; index < arrangementDecisions.length; index += 1) {
    const decision = arrangementDecisions[index];
    if (
      !decision
      || typeof decision !== 'object'
      || !Array.isArray(decision.sourceEventIds)
      || decision.sourceEventIds.length !== 1
    ) {
      return null;
    }
    const sourceEventId = decision.sourceEventIds[0];
    if (byId.has(sourceEventId)) return null;
    byId.set(sourceEventId, decision);
  }
  return byId;
}

function buildArpeggiatedDecisions(sourceModel, arrangementDecisions, group) {
  const byId = decisionIndexBySourceEventId(arrangementDecisions);
  if (!byId) return null;

  const groupMembers = new Set(group.sourceEventIds);
  for (const sourceEventId of group.sourceEventIds) {
    const decision = byId.get(sourceEventId);
    if (
      !decision
      || decision.decisionType !== 'PRESERVED'
      || decision.sourceGroupId !== null
    ) {
      // Same-event transform ordering (e.g. octave displacement + arpeggiation)
      // is explicitly deferred by the A3 first-slice contract.
      return null;
    }
  }

  const raw = [];
  let groupInserted = false;
  for (const event of sourceNotes(sourceModel)) {
    if (groupMembers.has(event.sourceEventId)) {
      if (!groupInserted) {
        raw.push(Object.freeze({
          decisionType: 'ARPEGGIATED',
          sourceEventIds: Object.freeze([...group.sourceEventIds]),
          sourceGroupId: group.groupId,
        }));
        groupInserted = true;
      }
      continue;
    }

    const existing = byId.get(event.sourceEventId);
    if (
      !existing
      || !['PRESERVED', 'OCTAVE_DISPLACED'].includes(existing.decisionType)
      || existing.sourceGroupId !== null
    ) {
      return null;
    }
    raw.push(Object.freeze({
      decisionType: existing.decisionType,
      sourceEventIds: Object.freeze([event.sourceEventId]),
      sourceGroupId: null,
    }));
  }
  return Object.freeze(raw);
}

function sourcePitchById(sourceModel) {
  return new Map(sourceNotes(sourceModel).map((event) => [
    event.sourceEventId,
    Object.freeze({ ...event.pitch }),
  ]));
}

function buildArrangementArtifact({
  sourceModel,
  sourceUploadSha256,
  candidate,
  validation,
  musicXml,
  originalError,
}) {
  const pitchById = sourcePitchById(sourceModel);
  const noteDispositions = validation.noteSelections.map((selection) => {
    const sourcePitch = pitchById.get(selection.sourceEventId);
    const shifted = selection.octaveShiftSemitones !== 0;
    return Object.freeze({
      sourceEventId: selection.sourceEventId,
      sourcePitch,
      disposition: shifted ? 'OCTAVE_SHIFTED' : 'KEPT',
      targetPitch: selection.targetPitch,
      octaveShiftSemitones: selection.octaveShiftSemitones,
      selectedPosition: selection.selectedPosition,
      reasonCode: 'A3_NO_LOSS_ARPEGGIATION_REVIEW_RECOVERY',
    });
  });
  const bytes = Buffer.byteLength(musicXml, 'utf8');

  return Object.freeze({
    documentType: NO_LOSS_ARPEGGIATED_GUITAR_ARRANGEMENT_DOCUMENT_TYPE,
    contractVersion: NO_LOSS_ARPEGGIATED_GUITAR_ARRANGEMENT_VERSION,
    authority: PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY,
    policy: NO_LOSS_ARPEGGIATION_RECOVERY_POLICY,
    sourceUploadSha256,
    source: Object.freeze({
      documentType: sourceModel.documentType,
      contractVersion: sourceModel.contractVersion,
      partId: sourceModel.source.partId,
    }),
    recovery: Object.freeze({
      originalErrorCode: originalError.code,
      originalSourceGroupId: originalError.details?.sourceGroupId || null,
      transform: 'ARPEGGIATED',
      spreadDivisions: candidate.spreadDivisions,
      targetTimingAuthority: false,
      candidateOrderIsPreferenceRank: false,
      orderStrategy: candidate.orderStrategy,
      physicalValidationStatus: validation.status,
    }),
    sourceNoteCount: noteDispositions.length,
    assignedNoteCount: noteDispositions.length,
    unassignedNoteCount: 0,
    omittedNoteCount: 0,
    coverageBasisPoints: noteDispositions.length === 0 ? null : 10_000,
    noteDispositions: Object.freeze(noteDispositions),
    timing: Object.freeze({
      sourceTimingAuthority: true,
      targetTimingAuthority: false,
      source: candidate.sourceTiming,
      provisionalTarget: candidate.targetTiming,
    }),
    renderer: Object.freeze({
      mediaType: 'application/vnd.recordare.musicxml+xml',
      byteLength: bytes,
      sha256: crypto.createHash('sha256').update(musicXml).digest('hex'),
    }),
  });
}

function buildReviewEditableProjection(
  sourceModel,
  sourceUploadSha256,
  grouping,
  arrangementArtifact,
) {
  const dispositionById = new Map(
    arrangementArtifact.noteDispositions.map((entry) => [entry.sourceEventId, entry]),
  );
  const noteDispositions = sourceNotes(sourceModel).map((event) => {
    const disposition = dispositionById.get(event.sourceEventId);
    if (!disposition) {
      throw new TypeError('No-loss arpeggiation recovery lost source-note provenance.');
    }
    return Object.freeze({
      sourceEventId: event.sourceEventId,
      disposition: 'KEEP',
      reasonCode: disposition.reasonCode,
      assignmentEligible: false,
      octaveShiftSemitones: disposition.octaveShiftSemitones,
      targetPitch: disposition.targetPitch,
      selectedPosition: disposition.selectedPosition,
    });
  });

  return Object.freeze({
    documentType: REVIEW_EDITABLE_PROJECTION_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITABLE_PROJECTION_VERSION,
    authority: PARTIAL_GUITAR_ARRANGEMENT_AUTHORITY,
    sourceUploadSha256,
    source: sourceModel.source,
    measures: sourceModel.measures,
    simultaneousGroups: Object.freeze(
      grouping.measures.flatMap((measure) => measure.groups),
    ),
    noteDispositions: Object.freeze(noteDispositions),
  });
}

function recoverNoLossArpeggiationReviewArrangement({
  sourceModel,
  arrangementDecisions,
  processing,
  writerOptions = {},
  guitarOptions = {},
  sourceUploadSha256,
  originalError,
  graceOrnamentGroups = [],
}) {
  if (!isEligibleFailure(originalError)) return null;
  if (graceOrnamentGroups.length > 0) return null;

  checkpoint(processing, 'a3-no-loss-arpeggiation:start', {
    sourceGroupId: originalError.details.sourceGroupId,
  });

  const { grouping, group } = findGroup(
    sourceModel,
    originalError.details.sourceGroupId,
    processing,
  );
  if (!group) return null;

  const eventById = new Map(sourceNotes(sourceModel).map((event) => [event.sourceEventId, event]));
  if (group.sourceEventIds.some((sourceEventId) => {
    const event = eventById.get(sourceEventId);
    return !event || event.tieStart || event.tieStop;
  })) {
    return null;
  }

  const arpeggiatedDecisions = buildArpeggiatedDecisions(
    sourceModel,
    arrangementDecisions,
    group,
  );
  if (!arpeggiatedDecisions) return null;

  let candidate;
  try {
    const plan = createGuitarArrangementPlan(
      sourceModel,
      arpeggiatedDecisions,
      processing,
    );
    const alternative = createSourceCompleteArrangementAlternative(
      sourceModel,
      plan,
    );
    candidate = createNoLossArpeggiationTimingCandidate(
      sourceModel,
      alternative,
      {
        sourceGroupId: group.groupId,
        spreadDivisions: 1,
      },
    );
  } catch (error) {
    if (
      error?.code === 'A3_ARPEGGIATION_TARGET_TIMING_EXCEEDS_MEASURE'
      || error?.code === 'NON_SOURCE_COMPLETE_ARRANGEMENT_DECISION'
    ) {
      checkpoint(processing, 'a3-no-loss-arpeggiation:not-applicable', {
        sourceGroupId: group.groupId,
        reason: error.code,
      });
      return null;
    }
    throw error;
  }

  const bundle = createNoLossArpeggiationPhysicalValidationBundle(
    sourceModel,
    candidate,
    processing,
    guitarOptions,
  );
  if (bundle.validation.status !== 'FEASIBLE') {
    checkpoint(processing, 'a3-no-loss-arpeggiation:infeasible', {
      sourceGroupId: group.groupId,
      failureCode: bundle.validation.failure?.code || null,
      failureReason: bundle.validation.failure?.reason || null,
    });
    return null;
  }

  const musicXml = serializeCanonicalTabResultV2ToMusicXml(
    bundle.validationCanonicalTabResult,
    writerOptions,
    processing,
  );
  const arrangementArtifact = buildArrangementArtifact({
    sourceModel,
    sourceUploadSha256,
    candidate,
    validation: bundle.validation,
    musicXml,
    originalError,
  });
  const reviewEditableProjection = buildReviewEditableProjection(
    sourceModel,
    sourceUploadSha256,
    grouping,
    arrangementArtifact,
  );

  checkpoint(processing, 'a3-no-loss-arpeggiation:complete', {
    sourceGroupId: group.groupId,
    sourceNoteCount: arrangementArtifact.sourceNoteCount,
  });

  return Object.freeze({
    arrangementArtifact,
    reviewEditableProjection,
    musicXml,
    reviewIssues: Object.freeze([]),
  });
}

module.exports = {
  NO_LOSS_ARPEGGIATED_GUITAR_ARRANGEMENT_VERSION,
  NO_LOSS_ARPEGGIATED_GUITAR_ARRANGEMENT_DOCUMENT_TYPE,
  NO_LOSS_ARPEGGIATION_RECOVERY_POLICY,
  recoverNoLossArpeggiationReviewArrangement,
};
