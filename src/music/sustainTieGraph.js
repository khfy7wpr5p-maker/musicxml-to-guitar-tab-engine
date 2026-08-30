'use strict';

const { EngineError } = require('../errors/engineError');
const { DEFAULT_PROCESSING_LIMITS } = require('../core/processingBudget');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');

const SUSTAIN_TIE_GRAPH_VERSION = '1.1.0';
const SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE = 'SustainTieGraph';
const SUSTAIN_TIE_GRAPH_AUTHORITY = 'SUSTAIN_TIE_FACTS_ONLY';
const MAX_SUSTAIN_TIE_SEGMENTS = DEFAULT_PROCESSING_LIMITS.maxEvents;
const MAX_SUSTAIN_TIE_CHAINS = DEFAULT_PROCESSING_LIMITS.maxEvents;

class SustainTieGraphError extends EngineError {
  constructor(message, code = 'INVALID_SUSTAIN_TIE_GRAPH', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'SustainTieGraphError');
  }
}

function invalid(message, reason, details = {}) {
  return new SustainTieGraphError(message, 'INVALID_SUSTAIN_TIE_GRAPH', {
    reason,
    ...details,
  });
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function tieKey(event) {
  return `${event.staff}\u0000${event.voice}\u0000${event.pitch.midi}\u0000${event.pitch.written}`;
}

function eventLocation(measure, event) {
  return Object.freeze({
    measureIndex: measure.index,
    onsetDivisions: event.onsetDivisions,
    endDivisions: event.onsetDivisions + event.durationDivisions,
  });
}

function isContiguous(previousSegment, measure, event) {
  if (previousSegment.measureIndex === measure.index) {
    return previousSegment.endDivisions === event.onsetDivisions;
  }
  return previousSegment.measureIndex + 1 === measure.index
    && previousSegment.endDivisions === previousSegment.expectedDurationDivisions
    && event.onsetDivisions === 0;
}

function createSegment(measure, event, segmentIndex) {
  return Object.freeze({
    sourceEventId: event.sourceEventId,
    segmentIndex,
    measureIndex: measure.index,
    onsetDivisions: event.onsetDivisions,
    durationDivisions: event.durationDivisions,
    endDivisions: event.onsetDivisions + event.durationDivisions,
    expectedDurationDivisions: measure.expectedDurationDivisions,
    tieStart: event.tieStart,
    tieStop: event.tieStop,
  });
}

function canReopenClosedTieChain(builder, measure, event) {
  if (!builder || !event.tieStop || !event.tieStart) return false;
  const previousSegment = builder.segments[builder.segments.length - 1];
  return previousSegment.tieStop
    && !previousSegment.tieStart
    && isContiguous(previousSegment, measure, event);
}

function finalizeChain(builder) {
  const segments = Object.freeze([...builder.segments]);
  const first = segments[0];
  const last = segments[segments.length - 1];
  const measureIndexes = new Set(segments.map((segment) => segment.measureIndex));
  return Object.freeze({
    sustainChainId: builder.sustainChainId,
    voice: builder.voice,
    staff: builder.staff,
    pitch: Object.freeze({ ...builder.pitch }),
    segmentCount: segments.length,
    sourceEventIds: Object.freeze(segments.map((segment) => segment.sourceEventId)),
    start: Object.freeze({
      measureIndex: first.measureIndex,
      onsetDivisions: first.onsetDivisions,
    }),
    end: Object.freeze({
      measureIndex: last.measureIndex,
      endDivisions: last.endDivisions,
    }),
    spansMeasures: measureIndexes.size > 1,
    measureSpanCount: measureIndexes.size,
    segments,
  });
}

function createSustainTieGraph(sourceModel, runtime = null) {
  checkpoint(runtime, 'sustain-tie-graph:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const openByKey = new Map();
  const closedByKey = new Map();
  const builders = [];
  const memberships = [];
  let observedTieSegments = 0;
  let nextChainIndex = 0;

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    checkpoint(runtime, 'sustain-tie-graph:measure', { measureIndex });
    const measure = source.measures[measureIndex];

    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'sustain-tie-graph:event', { measureIndex, eventIndex });
      const event = measure.events[eventIndex];
      if (event.type !== 'note' || (!event.tieStart && !event.tieStop)) continue;

      observedTieSegments += 1;
      if (observedTieSegments > MAX_SUSTAIN_TIE_SEGMENTS) {
        throw new SustainTieGraphError(
          'Sustain/tie segment count exceeds the fixed PS-2 output boundary.',
          'SUSTAIN_TIE_SEGMENT_LIMIT_EXCEEDED',
          { limit: MAX_SUSTAIN_TIE_SEGMENTS, observed: observedTieSegments },
        );
      }

      const key = tieKey(event);
      let builder = openByKey.get(key) || null;

      if (event.tieStop) {
        if (!builder) {
          const closedBuilder = closedByKey.get(key) || null;
          if (!canReopenClosedTieChain(closedBuilder, measure, event)) {
            throw invalid('Tie stop has no matching open sustain chain.', 'ORPHAN_TIE_STOP', {
              sourceEventId: event.sourceEventId,
              ...eventLocation(measure, event),
            });
          }
          builder = closedBuilder;
          closedByKey.delete(key);
          openByKey.set(key, builder);
        }
        const previousSegment = builder.segments[builder.segments.length - 1];
        if (!isContiguous(previousSegment, measure, event)) {
          throw invalid('Tie continuation is not temporally contiguous with the prior segment.', 'NONCONTIGUOUS_TIE_CONTINUATION', {
            sustainChainId: builder.sustainChainId,
            priorSourceEventId: previousSegment.sourceEventId,
            sourceEventId: event.sourceEventId,
            priorMeasureIndex: previousSegment.measureIndex,
            priorEndDivisions: previousSegment.endDivisions,
            measureIndex: measure.index,
            onsetDivisions: event.onsetDivisions,
          });
        }
      } else if (builder) {
        const previousSegment = builder.segments[builder.segments.length - 1];
        if (isContiguous(previousSegment, measure, event)) {
          throw invalid('Open sustain chain reached a matching contiguous note without tie-stop.', 'MISSING_TIE_STOP_AT_CONTINUATION', {
            sustainChainId: builder.sustainChainId,
            priorSourceEventId: previousSegment.sourceEventId,
            sourceEventId: event.sourceEventId,
          });
        }
      }

      if (event.tieStart && !event.tieStop) {
        if (builder) {
          throw invalid('Tie start would open a second chain for the same voice/staff/pitch identity.', 'AMBIGUOUS_TIE_START', {
            sustainChainId: builder.sustainChainId,
            sourceEventId: event.sourceEventId,
          });
        }
        if (nextChainIndex >= MAX_SUSTAIN_TIE_CHAINS) {
          throw new SustainTieGraphError(
            'Sustain/tie chain count exceeds the fixed PS-2 output boundary.',
            'SUSTAIN_TIE_CHAIN_LIMIT_EXCEEDED',
            { limit: MAX_SUSTAIN_TIE_CHAINS, observed: nextChainIndex + 1 },
          );
        }
        builder = {
          sustainChainId: `${source.source.partId}:sustain-chain:${nextChainIndex}`,
          voice: event.voice,
          staff: event.staff,
          pitch: event.pitch,
          segments: [],
        };
        nextChainIndex += 1;
        builders.push(builder);
        closedByKey.delete(key);
        openByKey.set(key, builder);
      }

      if (!builder) {
        throw invalid('Tie segment could not be assigned to a sustain chain.', 'UNRESOLVED_TIE_SEGMENT', {
          sourceEventId: event.sourceEventId,
        });
      }

      const segment = createSegment(measure, event, builder.segments.length);
      builder.segments.push(segment);
      memberships.push(Object.freeze({
        sourceEventId: event.sourceEventId,
        sustainChainId: builder.sustainChainId,
        segmentIndex: segment.segmentIndex,
      }));

      if (event.tieStop && !event.tieStart) {
        openByKey.delete(key);
        closedByKey.set(key, builder);
      }
    }
  }

  if (openByKey.size !== 0) {
    const unresolved = [...openByKey.values()]
      .map((builder) => ({
        sustainChainId: builder.sustainChainId,
        sourceEventId: builder.segments[builder.segments.length - 1].sourceEventId,
      }))
      .sort((left, right) => left.sustainChainId.localeCompare(right.sustainChainId));
    throw invalid('One or more sustain chains ended without a tie-stop.', 'UNTERMINATED_TIE_CHAIN', {
      unresolved,
    });
  }

  const chains = builders
    .map((builder) => finalizeChain(builder))
    .sort((left, right) => left.sustainChainId.localeCompare(right.sustainChainId));
  memberships.sort((left, right) => left.sourceEventId.localeCompare(right.sourceEventId));

  const result = Object.freeze({
    documentType: SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE,
    contractVersion: SUSTAIN_TIE_GRAPH_VERSION,
    authority: SUSTAIN_TIE_GRAPH_AUTHORITY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    sustainChainCount: chains.length,
    tieSegmentCount: observedTieSegments,
    chains: Object.freeze(chains),
    memberships: Object.freeze(memberships),
  });

  checkpoint(runtime, 'sustain-tie-graph:complete', {
    sustainChainCount: result.sustainChainCount,
    tieSegmentCount: result.tieSegmentCount,
  });
  return result;
}

module.exports = {
  SUSTAIN_TIE_GRAPH_VERSION,
  SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE,
  SUSTAIN_TIE_GRAPH_AUTHORITY,
  MAX_SUSTAIN_TIE_SEGMENTS,
  MAX_SUSTAIN_TIE_CHAINS,
  SustainTieGraphError,
  createSustainTieGraph,
};
