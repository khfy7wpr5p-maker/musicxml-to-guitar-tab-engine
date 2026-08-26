'use strict';

const { EngineError } = require('../errors/engineError');
const { DEFAULT_PROCESSING_LIMITS } = require('../core/processingBudget');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');

const POLYPHONIC_TEMPORAL_EVENT_MODEL_VERSION = '1.0.0';
const POLYPHONIC_TEMPORAL_EVENT_MODEL_DOCUMENT_TYPE = 'PolyphonicTemporalEventModel';
const POLYPHONIC_TEMPORAL_EVENT_MODEL_AUTHORITY = 'TEMPORAL_FACTS_ONLY';
const MAX_TEMPORAL_POINTS = DEFAULT_PROCESSING_LIMITS.maxEvents * 2;

class PolyphonicTemporalEventModelError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_TEMPORAL_EVENT_MODEL', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'PolyphonicTemporalEventModelError',
    );
  }
}

function invalid(message, details = {}) {
  return new PolyphonicTemporalEventModelError(message, undefined, details);
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function addTimedEvent(index, time, event) {
  let events = index.get(time);
  if (!events) {
    events = [];
    index.set(time, events);
  }
  events.push(event);
}

function compareSourceEvents(left, right) {
  return left.sourceOrder - right.sourceOrder
    || left.sourceEventId.localeCompare(right.sourceEventId);
}

function frozenOrderedIds(events) {
  return Object.freeze(
    [...events]
      .sort(compareSourceEvents)
      .map((event) => event.sourceEventId),
  );
}

function createTemporalPoint(measure, timeDivisions, active, attacks, releases, pointIndex) {
  const releasingIds = new Set(releases.map((event) => event.sourceEventId));
  const holds = [...active.values()].filter((event) => !releasingIds.has(event.sourceEventId));

  for (const event of releases) {
    if (!active.delete(event.sourceEventId)) {
      throw invalid('Temporal release did not resolve to an active source event.', {
        measureIndex: measure.index,
        sourceEventId: event.sourceEventId,
        timeDivisions,
      });
    }
  }

  for (const event of attacks) {
    if (active.has(event.sourceEventId)) {
      throw invalid('Temporal attack attempted to activate one source event twice.', {
        measureIndex: measure.index,
        sourceEventId: event.sourceEventId,
        timeDivisions,
      });
    }
    active.set(event.sourceEventId, event);
  }

  const activeEvents = [...active.values()];
  return Object.freeze({
    pointId: `${measure.measureId}:temporal:${timeDivisions}`,
    pointIndex,
    timeDivisions,
    attackSourceEventIds: frozenOrderedIds(attacks),
    holdSourceEventIds: frozenOrderedIds(holds),
    releaseSourceEventIds: frozenOrderedIds(releases),
    activeSourceEventIds: frozenOrderedIds(activeEvents),
  });
}

function createPolyphonicTemporalEventModel(sourceModel, runtime = null) {
  checkpoint(runtime, 'polyphonic-temporal-event-model:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const measures = [];
  let temporalPointCount = 0;

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    checkpoint(runtime, 'polyphonic-temporal-event-model:measure', { measureIndex });
    const measure = source.measures[measureIndex];
    const attacksByTime = new Map();
    const releasesByTime = new Map();

    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'polyphonic-temporal-event-model:event', { measureIndex, eventIndex });
      const event = measure.events[eventIndex];
      if (event.type !== 'note') continue;

      const endDivisions = event.onsetDivisions + event.durationDivisions;
      if (!Number.isSafeInteger(endDivisions) || endDivisions > measure.expectedDurationDivisions) {
        throw invalid('Temporal event end is outside the validated measure boundary.', {
          measureIndex,
          eventIndex,
          sourceEventId: event.sourceEventId,
          endDivisions,
          expectedDurationDivisions: measure.expectedDurationDivisions,
        });
      }
      addTimedEvent(attacksByTime, event.onsetDivisions, event);
      addTimedEvent(releasesByTime, endDivisions, event);
    }

    const times = [...new Set([...attacksByTime.keys(), ...releasesByTime.keys()])]
      .sort((left, right) => left - right);
    temporalPointCount += times.length;
    if (temporalPointCount > MAX_TEMPORAL_POINTS) {
      throw new PolyphonicTemporalEventModelError(
        'Temporal point count exceeds the fixed PS-1 output boundary.',
        'POLYPHONIC_TEMPORAL_POINT_LIMIT_EXCEEDED',
        { limit: MAX_TEMPORAL_POINTS, observed: temporalPointCount, measureIndex },
      );
    }

    const active = new Map();
    const temporalPoints = [];
    for (let pointIndex = 0; pointIndex < times.length; pointIndex += 1) {
      checkpoint(runtime, 'polyphonic-temporal-event-model:point', {
        measureIndex,
        pointIndex,
      });
      const timeDivisions = times[pointIndex];
      const attacks = attacksByTime.get(timeDivisions) || [];
      const releases = releasesByTime.get(timeDivisions) || [];
      temporalPoints.push(createTemporalPoint(
        measure,
        timeDivisions,
        active,
        attacks,
        releases,
        pointIndex,
      ));
    }

    if (active.size !== 0) {
      throw invalid('Temporal measure completed with active source events still retained.', {
        measureIndex,
        activeSourceEventIds: [...active.keys()],
      });
    }

    measures.push(Object.freeze({
      measureId: measure.measureId,
      index: measure.index,
      expectedDurationDivisions: measure.expectedDurationDivisions,
      temporalPointCount: temporalPoints.length,
      temporalPoints: Object.freeze(temporalPoints),
    }));
  }

  const result = Object.freeze({
    documentType: POLYPHONIC_TEMPORAL_EVENT_MODEL_DOCUMENT_TYPE,
    contractVersion: POLYPHONIC_TEMPORAL_EVENT_MODEL_VERSION,
    authority: POLYPHONIC_TEMPORAL_EVENT_MODEL_AUTHORITY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    measureCount: source.measureCount,
    temporalPointCount,
    measures: Object.freeze(measures),
  });
  checkpoint(runtime, 'polyphonic-temporal-event-model:complete', {
    measureCount: result.measureCount,
    temporalPointCount: result.temporalPointCount,
  });
  return result;
}

module.exports = {
  POLYPHONIC_TEMPORAL_EVENT_MODEL_VERSION,
  POLYPHONIC_TEMPORAL_EVENT_MODEL_DOCUMENT_TYPE,
  POLYPHONIC_TEMPORAL_EVENT_MODEL_AUTHORITY,
  MAX_TEMPORAL_POINTS,
  PolyphonicTemporalEventModelError,
  createPolyphonicTemporalEventModel,
};
