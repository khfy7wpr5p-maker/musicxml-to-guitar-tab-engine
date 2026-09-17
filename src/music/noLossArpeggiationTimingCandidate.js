'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  createSimultaneousEventModel,
} = require('./simultaneousEventModel');
const {
  SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_VERSION,
  SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_DOCUMENT_TYPE,
} = require('./sourceCompleteArrangementAlternative');

const NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_VERSION = '1.0.0';
const NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_DOCUMENT_TYPE =
  'NoLossArpeggiationTimingCandidate';

class NoLossArpeggiationTimingCandidateError extends EngineError {
  constructor(message, code = 'INVALID_A3_ARPEGGIATION_TIMING_CANDIDATE', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'NoLossArpeggiationTimingCandidateError',
    );
  }
}

function invalid(message, details = {}) {
  return new NoLossArpeggiationTimingCandidateError(message, undefined, details);
}

function collectSourceNotes(source) {
  const notes = [];
  const timingById = new Map();
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      notes.push(event);
      timingById.set(event.sourceEventId, {
        measureIndex: measure.index,
        measureNumber: measure.number,
        measureEndDivisions: measure.expectedDurationDivisions,
        onsetDivisions: event.onsetDivisions,
        durationDivisions: event.durationDivisions,
      });
    }
  }
  return { notes, timingById };
}

function findProvenGroup(source, sourceGroupId) {
  const grouping = createSimultaneousEventModel(source);
  for (const measure of grouping.measures) {
    for (const group of measure.groups) {
      if (group.groupId === sourceGroupId) {
        return { group, measureIndex: measure.index };
      }
    }
  }
  throw invalid('sourceGroupId is not a proven simultaneous source group.', { sourceGroupId });
}

function assertAlternativeMatchesSource(alternative, source, notes) {
  if (
    !alternative
    || typeof alternative !== 'object'
    || Array.isArray(alternative)
  ) {
    throw invalid('Source-complete arrangement alternative must be an object.');
  }
  if (alternative.documentType !== SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_DOCUMENT_TYPE) {
    throw invalid('Source-complete arrangement alternative documentType is not supported.');
  }
  if (alternative.contractVersion !== SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_VERSION) {
    throw invalid('Source-complete arrangement alternative contractVersion is not supported.');
  }
  if (
    !alternative.source
    || alternative.source.documentType !== POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE
    || alternative.source.contractVersion !== POLYPHONIC_SOURCE_MODEL_VERSION
    || alternative.source.partId !== source.source.partId
  ) {
    throw invalid('Source-complete arrangement alternative source identity does not match.');
  }
  if (
    alternative.sourceNoteLossAllowed !== false
    || alternative.sourceTimingAuthority !== true
    || alternative.targetTimingAuthority !== false
    || alternative.requiresReview !== true
    || alternative.exportAllowed !== false
  ) {
    throw invalid('Source-complete arrangement alternative authority flags are invalid.');
  }
  if (
    !Array.isArray(alternative.sourceEventIds)
    || !Array.isArray(alternative.sourceTiming)
    || !Array.isArray(alternative.decisions)
    || alternative.sourceEventIds.length !== notes.length
    || alternative.sourceTiming.length !== notes.length
  ) {
    throw invalid('Source-complete arrangement alternative source coverage is malformed.');
  }

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    const sourceEventId = alternative.sourceEventIds[index];
    const timing = alternative.sourceTiming[index];
    if (
      sourceEventId !== note.sourceEventId
      || !timing
      || timing.sourceEventId !== note.sourceEventId
      || timing.onsetDivisions !== note.onsetDivisions
      || timing.durationDivisions !== note.durationDivisions
    ) {
      throw invalid('Source-complete arrangement alternative does not preserve source timing.', {
        index,
        sourceEventId: note.sourceEventId,
      });
    }
  }
}

function normalizePolicy(policy, sourceGroupId) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw invalid('Arpeggiation timing policy must be an object.');
  }
  const keys = Object.keys(policy);
  if (
    keys.length !== 2
    || !Object.hasOwn(policy, 'sourceGroupId')
    || !Object.hasOwn(policy, 'spreadDivisions')
  ) {
    throw invalid('Arpeggiation timing policy must contain only sourceGroupId and spreadDivisions.');
  }
  if (policy.sourceGroupId !== sourceGroupId) {
    throw invalid('Arpeggiation timing policy sourceGroupId does not match.', {
      expected: sourceGroupId,
      observed: policy.sourceGroupId,
    });
  }
  if (policy.spreadDivisions !== 1) {
    throw new NoLossArpeggiationTimingCandidateError(
      'The A3 first migration slice requires spreadDivisions=1.',
      'UNSUPPORTED_A3_ARPEGGIATION_SPREAD',
      { spreadDivisions: policy.spreadDivisions },
    );
  }
  return Object.freeze({
    sourceGroupId,
    spreadDivisions: 1,
  });
}

function createNoLossArpeggiationTimingCandidate(sourceModel, alternative, policyInput) {
  const source = validatePolyphonicSourceModel(sourceModel);
  const { notes, timingById } = collectSourceNotes(source);
  assertAlternativeMatchesSource(alternative, source, notes);

  if (!policyInput || typeof policyInput !== 'object' || Array.isArray(policyInput)) {
    throw invalid('Arpeggiation timing policy must be an object.');
  }
  const requestedGroupId = policyInput.sourceGroupId;
  if (typeof requestedGroupId !== 'string' || requestedGroupId.length === 0) {
    throw invalid('Arpeggiation timing policy requires a sourceGroupId.');
  }

  const { group } = findProvenGroup(source, requestedGroupId);
  const policy = normalizePolicy(policyInput, group.groupId);

  const matchingDecisions = alternative.decisions.filter(
    (decision) => decision.decisionType === 'ARPEGGIATED'
      && decision.sourceGroupId === group.groupId,
  );
  if (matchingDecisions.length !== 1) {
    throw invalid('Exactly one ARPEGGIATED decision must match the requested source group.', {
      sourceGroupId: group.groupId,
      observed: matchingDecisions.length,
    });
  }
  const arpeggiatedDecision = matchingDecisions[0];
  if (arpeggiatedDecision.target !== null) {
    throw invalid('Source-complete ARPEGGIATED decision must not already contain target timing.');
  }
  if (arpeggiatedDecision.sourceEventIds.length !== group.sourceEventIds.length) {
    throw invalid('ARPEGGIATED decision does not cover the complete simultaneous group.');
  }
  for (let index = 0; index < group.sourceEventIds.length; index += 1) {
    if (arpeggiatedDecision.sourceEventIds[index] !== group.sourceEventIds[index]) {
      throw invalid('ARPEGGIATED decision membership does not match source-group order.', {
        sourceGroupId: group.groupId,
        index,
      });
    }
  }

  const groupOrdinal = new Map(
    group.sourceEventIds.map((sourceEventId, index) => [sourceEventId, index]),
  );
  const targetTiming = notes.map((note) => {
    const sourceTiming = timingById.get(note.sourceEventId);
    const ordinal = groupOrdinal.get(note.sourceEventId);
    const onsetDivisions = ordinal === undefined
      ? sourceTiming.onsetDivisions
      : sourceTiming.onsetDivisions + (ordinal * policy.spreadDivisions);
    const durationDivisions = sourceTiming.durationDivisions;
    const endDivisions = onsetDivisions + durationDivisions;

    if (
      !Number.isSafeInteger(onsetDivisions)
      || !Number.isSafeInteger(endDivisions)
      || endDivisions > sourceTiming.measureEndDivisions
    ) {
      throw new NoLossArpeggiationTimingCandidateError(
        'Provisional no-loss arpeggiation timing would cross the source measure boundary.',
        'A3_ARPEGGIATION_TARGET_TIMING_EXCEEDS_MEASURE',
        {
          sourceGroupId: group.groupId,
          sourceEventId: note.sourceEventId,
          measureIndex: sourceTiming.measureIndex,
          measureNumber: sourceTiming.measureNumber,
          onsetDivisions,
          durationDivisions,
          measureEndDivisions: sourceTiming.measureEndDivisions,
        },
      );
    }

    return Object.freeze({
      sourceEventId: note.sourceEventId,
      onsetDivisions,
      durationDivisions,
    });
  });

  const decisions = alternative.decisions.map((decision) => {
    const target = decision === arpeggiatedDecision
      ? Object.freeze({
        orderedSourceEventIds: Object.freeze([...group.sourceEventIds]),
        spreadDivisions: policy.spreadDivisions,
      })
      : decision.target;
    return Object.freeze({
      decisionId: decision.decisionId,
      decisionType: decision.decisionType,
      sourceEventIds: Object.freeze([...decision.sourceEventIds]),
      sourceGroupId: decision.sourceGroupId,
      target,
    });
  });

  return Object.freeze({
    documentType: NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_DOCUMENT_TYPE,
    contractVersion: NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_VERSION,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    sourceGroupId: group.groupId,
    sourceNoteLossAllowed: false,
    sourceTimingAuthority: true,
    targetTimingAuthority: false,
    requiresReview: true,
    exportAllowed: false,
    candidateOrderIsPreferenceRank: false,
    orderStrategy: 'SOURCE_ORDER',
    spreadDivisions: policy.spreadDivisions,
    sourceEventIds: Object.freeze([...alternative.sourceEventIds]),
    sourceTiming: Object.freeze(
      alternative.sourceTiming.map((entry) => Object.freeze({
        sourceEventId: entry.sourceEventId,
        onsetDivisions: entry.onsetDivisions,
        durationDivisions: entry.durationDivisions,
      })),
    ),
    targetTiming: Object.freeze(targetTiming),
    decisions: Object.freeze(decisions),
  });
}

module.exports = {
  NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_VERSION,
  NO_LOSS_ARPEGGIATION_TIMING_CANDIDATE_DOCUMENT_TYPE,
  NoLossArpeggiationTimingCandidateError,
  createNoLossArpeggiationTimingCandidate,
};
