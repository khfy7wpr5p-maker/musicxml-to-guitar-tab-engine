'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  POLYPHONIC_TEMPORAL_EVENT_MODEL_VERSION,
  POLYPHONIC_TEMPORAL_EVENT_MODEL_DOCUMENT_TYPE,
  createPolyphonicTemporalEventModel,
} = require('./polyphonicTemporalEventModel');
const {
  SUSTAIN_TIE_GRAPH_VERSION,
  SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE,
  createSustainTieGraph,
} = require('./sustainTieGraph');

const ACTIVE_SONORITY_MODEL_VERSION = '1.0.0';
const ACTIVE_SONORITY_MODEL_DOCUMENT_TYPE = 'ActiveSonorityModel';
const ACTIVE_SONORITY_MODEL_AUTHORITY = 'ACTIVE_SONORITY_FACTS_ONLY';

class ActiveSonorityModelError extends EngineError {
  constructor(message, code = 'INVALID_ACTIVE_SONORITY_MODEL', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'ActiveSonorityModelError');
  }
}

function invalid(message, reason, details = {}) {
  return new ActiveSonorityModelError(message, 'INVALID_ACTIVE_SONORITY_MODEL', {
    reason,
    ...details,
  });
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function buildIndexes(source, tieGraph) {
  const eventById = new Map();
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      eventById.set(event.sourceEventId, Object.freeze({
        event,
        measureIndex: measure.index,
        sourceOrder: event.sourceOrder,
      }));
    }
  }

  const chainById = new Map(tieGraph.chains.map((chain) => [chain.sustainChainId, chain]));
  const membershipBySourceEventId = new Map();
  for (const membership of tieGraph.memberships) {
    const chain = chainById.get(membership.sustainChainId);
    if (!chain) {
      throw invalid('Tie membership references a missing sustain chain.', 'MISSING_SUSTAIN_CHAIN', {
        sustainChainId: membership.sustainChainId,
        sourceEventId: membership.sourceEventId,
      });
    }
    const segment = chain.segments[membership.segmentIndex];
    if (!segment || segment.sourceEventId !== membership.sourceEventId) {
      throw invalid('Tie membership does not match its chain segment.', 'INVALID_SUSTAIN_MEMBERSHIP', {
        sustainChainId: membership.sustainChainId,
        sourceEventId: membership.sourceEventId,
        segmentIndex: membership.segmentIndex,
      });
    }
    membershipBySourceEventId.set(membership.sourceEventId, Object.freeze({ chain, segment }));
  }

  return { eventById, membershipBySourceEventId };
}

function logicalIdentity(sourceEventId, indexes) {
  const membership = indexes.membershipBySourceEventId.get(sourceEventId);
  return membership ? membership.chain.sustainChainId : sourceEventId;
}

function assertMembershipMatchesEvent(sourceEventId, indexes) {
  const membership = indexes.membershipBySourceEventId.get(sourceEventId);
  if (!membership) return null;
  const located = indexes.eventById.get(sourceEventId);
  if (!located) {
    throw invalid('Sustain membership references a missing source note.', 'MISSING_SOURCE_NOTE', {
      sourceEventId,
    });
  }
  const { event } = located;
  if (
    membership.chain.voice !== event.voice
    || membership.chain.staff !== event.staff
    || membership.chain.pitch.midi !== event.pitch.midi
    || membership.chain.pitch.written !== event.pitch.written
    || membership.segment.tieStart !== event.tieStart
    || membership.segment.tieStop !== event.tieStop
  ) {
    throw invalid('Sustain-chain facts diverged from source-event identity.', 'SUSTAIN_SOURCE_DIVERGENCE', {
      sourceEventId,
      sustainChainId: membership.chain.sustainChainId,
    });
  }
  return membership;
}

function createActiveRecord(sourceEventId, indexes) {
  const located = indexes.eventById.get(sourceEventId);
  if (!located) {
    throw invalid('Active-sonority transition references a missing pitched source event.', 'MISSING_SOURCE_EVENT', {
      sourceEventId,
    });
  }
  const { event } = located;
  const membership = assertMembershipMatchesEvent(sourceEventId, indexes);
  return {
    logicalNoteId: membership ? membership.chain.sustainChainId : sourceEventId,
    sourceEventId,
    sustainChainId: membership ? membership.chain.sustainChainId : null,
    voice: event.voice,
    staff: event.staff,
    pitch: event.pitch,
    measureIndex: located.measureIndex,
    sourceOrder: located.sourceOrder,
  };
}

function compareRecords(left, right) {
  return left.measureIndex - right.measureIndex
    || left.sourceOrder - right.sourceOrder
    || left.logicalNoteId.localeCompare(right.logicalNoteId);
}

function freezeNoteFact(record) {
  return Object.freeze({
    logicalNoteId: record.logicalNoteId,
    sourceEventId: record.sourceEventId,
    sustainChainId: record.sustainChainId,
    voice: record.voice,
    staff: record.staff,
    pitch: Object.freeze({ ...record.pitch }),
  });
}

function freezeOrderedFacts(records) {
  return Object.freeze([...records].sort(compareRecords).map(freezeNoteFact));
}

function processPoint(point, active, indexes, location) {
  const releasedRecords = [];
  const newlyAttackedIds = new Set();

  for (const sourceEventId of point.releaseSourceEventIds) {
    const membership = assertMembershipMatchesEvent(sourceEventId, indexes);
    const logicalNoteId = logicalIdentity(sourceEventId, indexes);
    const current = active.get(logicalNoteId);
    if (!current) {
      throw invalid('Source release could not resolve to an active logical note.', 'ORPHAN_LOGICAL_RELEASE', {
        ...location,
        sourceEventId,
        logicalNoteId,
      });
    }
    if (current.sourceEventId !== sourceEventId) {
      throw invalid('Source release does not match the currently active sustain segment.', 'STALE_SUSTAIN_SEGMENT_RELEASE', {
        ...location,
        sourceEventId,
        currentSourceEventId: current.sourceEventId,
        logicalNoteId,
      });
    }

    if (membership && membership.segment.tieStart) {
      continue;
    }

    active.delete(logicalNoteId);
    releasedRecords.push(current);
  }

  for (const sourceEventId of point.attackSourceEventIds) {
    const membership = assertMembershipMatchesEvent(sourceEventId, indexes);
    const logicalNoteId = logicalIdentity(sourceEventId, indexes);

    if (membership && membership.segment.tieStop) {
      const current = active.get(logicalNoteId);
      if (!current) {
        throw invalid('Tie continuation attack has no active logical sustain identity.', 'ORPHAN_SUSTAIN_CONTINUATION', {
          ...location,
          sourceEventId,
          logicalNoteId,
        });
      }
      const next = createActiveRecord(sourceEventId, indexes);
      active.set(logicalNoteId, next);
      continue;
    }

    if (active.has(logicalNoteId)) {
      throw invalid('Logical note attacked while the same identity is already active.', 'DUPLICATE_LOGICAL_ATTACK', {
        ...location,
        sourceEventId,
        logicalNoteId,
      });
    }
    const record = createActiveRecord(sourceEventId, indexes);
    active.set(logicalNoteId, record);
    newlyAttackedIds.add(logicalNoteId);
  }

  const activeRecords = [...active.values()];
  const attackRecords = activeRecords.filter((record) => newlyAttackedIds.has(record.logicalNoteId));
  const holdRecords = activeRecords.filter((record) => !newlyAttackedIds.has(record.logicalNoteId));

  return Object.freeze({
    sonorityPointId: `${location.measureId}:sonority:${point.timeDivisions}`,
    pointIndex: point.pointIndex,
    timeDivisions: point.timeDivisions,
    attackNotes: freezeOrderedFacts(attackRecords),
    holdNotes: freezeOrderedFacts(holdRecords),
    releaseNotes: freezeOrderedFacts(releasedRecords),
    activeNotes: freezeOrderedFacts(activeRecords),
  });
}

function createActiveSonorityModel(sourceModel, runtime = null) {
  checkpoint(runtime, 'active-sonority-model:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const temporal = createPolyphonicTemporalEventModel(source, runtime);
  const tieGraph = createSustainTieGraph(source, runtime);
  const indexes = buildIndexes(source, tieGraph);
  const active = new Map();
  const measures = [];
  let sonorityPointCount = 0;

  for (let measureIndex = 0; measureIndex < temporal.measures.length; measureIndex += 1) {
    checkpoint(runtime, 'active-sonority-model:measure', { measureIndex });
    const temporalMeasure = temporal.measures[measureIndex];
    const sonorityPoints = [];

    for (let pointIndex = 0; pointIndex < temporalMeasure.temporalPoints.length; pointIndex += 1) {
      checkpoint(runtime, 'active-sonority-model:point', { measureIndex, pointIndex });
      const point = temporalMeasure.temporalPoints[pointIndex];
      sonorityPoints.push(processPoint(point, active, indexes, {
        measureId: temporalMeasure.measureId,
        measureIndex,
        pointIndex,
      }));
      sonorityPointCount += 1;
    }

    measures.push(Object.freeze({
      measureId: temporalMeasure.measureId,
      index: temporalMeasure.index,
      expectedDurationDivisions: temporalMeasure.expectedDurationDivisions,
      sonorityPointCount: sonorityPoints.length,
      sonorityPoints: Object.freeze(sonorityPoints),
    }));
  }

  if (active.size !== 0) {
    throw invalid('Score completed with logical notes still active.', 'UNRELEASED_LOGICAL_NOTES', {
      logicalNoteIds: [...active.keys()].sort(),
    });
  }

  const result = Object.freeze({
    documentType: ACTIVE_SONORITY_MODEL_DOCUMENT_TYPE,
    contractVersion: ACTIVE_SONORITY_MODEL_VERSION,
    authority: ACTIVE_SONORITY_MODEL_AUTHORITY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    temporal: Object.freeze({
      documentType: POLYPHONIC_TEMPORAL_EVENT_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_TEMPORAL_EVENT_MODEL_VERSION,
    }),
    sustain: Object.freeze({
      documentType: SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE,
      contractVersion: SUSTAIN_TIE_GRAPH_VERSION,
      sustainChainCount: tieGraph.sustainChainCount,
    }),
    measureCount: measures.length,
    sonorityPointCount,
    measures: Object.freeze(measures),
  });

  checkpoint(runtime, 'active-sonority-model:complete', {
    measureCount: result.measureCount,
    sonorityPointCount: result.sonorityPointCount,
  });
  return result;
}

module.exports = {
  ACTIVE_SONORITY_MODEL_VERSION,
  ACTIVE_SONORITY_MODEL_DOCUMENT_TYPE,
  ACTIVE_SONORITY_MODEL_AUTHORITY,
  ActiveSonorityModelError,
  createActiveSonorityModel,
};
