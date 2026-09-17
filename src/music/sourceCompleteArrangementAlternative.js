'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  GUITAR_ARRANGEMENT_PLAN_VERSION,
  GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
} = require('./guitarArrangementPlan');

const SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_VERSION = '1.0.0';
const SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_DOCUMENT_TYPE =
  'SourceCompleteGuitarArrangementAlternative';

const SOURCE_COMPLETE_DECISION_TYPES = new Set([
  'PRESERVED',
  'OCTAVE_DISPLACED',
  'VOICE_REDISTRIBUTED',
  'REVOICED',
  'ARPEGGIATED',
]);

class SourceCompleteArrangementAlternativeError extends EngineError {
  constructor(message, code = 'INVALID_SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'SourceCompleteArrangementAlternativeError',
    );
  }
}

function invalid(message, details = {}) {
  return new SourceCompleteArrangementAlternativeError(message, undefined, details);
}

function nonSourceComplete(decisionType, decisionIndex) {
  return new SourceCompleteArrangementAlternativeError(
    'Arrangement decision is not source-complete and cannot enter no-loss recovery.',
    'NON_SOURCE_COMPLETE_ARRANGEMENT_DECISION',
    { decisionType, decisionIndex },
  );
}

function collectSourceNotes(source) {
  const notes = [];
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') {
        notes.push(event);
      }
    }
  }
  return notes;
}

function assertPlanMatchesSource(plan, source, sourceNotes) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    throw invalid('Arrangement plan must be an object.');
  }
  if (plan.documentType !== GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE) {
    throw invalid('Arrangement plan documentType is not supported.', {
      documentType: plan.documentType,
    });
  }
  if (plan.contractVersion !== GUITAR_ARRANGEMENT_PLAN_VERSION) {
    throw invalid('Arrangement plan contractVersion is not supported.', {
      contractVersion: plan.contractVersion,
    });
  }
  if (
    !plan.source
    || plan.source.documentType !== POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE
    || plan.source.contractVersion !== POLYPHONIC_SOURCE_MODEL_VERSION
    || plan.source.partId !== source.source.partId
  ) {
    throw invalid('Arrangement plan source identity does not match the source model.');
  }
  if (!Array.isArray(plan.decisions) || plan.decisionCount !== plan.decisions.length) {
    throw invalid('Arrangement plan decisions are malformed.');
  }

  const expectedIds = sourceNotes.map((event) => event.sourceEventId);
  const observedIds = [];

  for (let decisionIndex = 0; decisionIndex < plan.decisions.length; decisionIndex += 1) {
    const decision = plan.decisions[decisionIndex];
    if (
      !decision
      || typeof decision !== 'object'
      || !Array.isArray(decision.sourceEventIds)
      || typeof decision.decisionType !== 'string'
    ) {
      throw invalid('Arrangement plan contains a malformed decision.', { decisionIndex });
    }

    if (!SOURCE_COMPLETE_DECISION_TYPES.has(decision.decisionType)) {
      throw nonSourceComplete(decision.decisionType, decisionIndex);
    }

    for (const sourceEventId of decision.sourceEventIds) {
      observedIds.push(sourceEventId);
    }
  }

  if (observedIds.length !== expectedIds.length) {
    throw invalid('Arrangement plan does not cover every source note exactly once.', {
      expected: expectedIds.length,
      observed: observedIds.length,
    });
  }
  for (let index = 0; index < expectedIds.length; index += 1) {
    if (observedIds[index] !== expectedIds[index]) {
      throw invalid('Arrangement plan does not preserve canonical source-note order.', {
        index,
        expectedSourceEventId: expectedIds[index],
        observedSourceEventId: observedIds[index],
      });
    }
  }
}

function createSourceCompleteArrangementAlternative(sourceModel, arrangementPlan) {
  const source = validatePolyphonicSourceModel(sourceModel);
  const sourceNotes = collectSourceNotes(source);

  assertPlanMatchesSource(arrangementPlan, source, sourceNotes);

  const sourceEventIds = Object.freeze(
    sourceNotes.map((event) => event.sourceEventId),
  );

  const sourceTiming = Object.freeze(
    sourceNotes.map((event) => Object.freeze({
      sourceEventId: event.sourceEventId,
      onsetDivisions: event.onsetDivisions,
      durationDivisions: event.durationDivisions,
    })),
  );

  const decisions = Object.freeze(
    arrangementPlan.decisions.map((decision) => Object.freeze({
      decisionId: decision.decisionId,
      decisionType: decision.decisionType,
      sourceEventIds: Object.freeze([...decision.sourceEventIds]),
      sourceGroupId: decision.sourceGroupId,
      target: null,
    })),
  );

  return Object.freeze({
    documentType: SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_DOCUMENT_TYPE,
    contractVersion: SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_VERSION,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    sourceNoteLossAllowed: false,
    sourceTimingAuthority: true,
    targetTimingAuthority: false,
    requiresReview: true,
    exportAllowed: false,
    sourceEventIds,
    decisions,
    sourceTiming,
  });
}

module.exports = {
  SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_VERSION,
  SOURCE_COMPLETE_ARRANGEMENT_ALTERNATIVE_DOCUMENT_TYPE,
  SOURCE_COMPLETE_DECISION_TYPES,
  SourceCompleteArrangementAlternativeError,
  createSourceCompleteArrangementAlternative,
};
