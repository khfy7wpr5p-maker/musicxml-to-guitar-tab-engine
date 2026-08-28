'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  DETERMINISTIC_REDUCTION_PLAN_VERSION,
  DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
  DETERMINISTIC_REDUCTION_POLICY,
  createDeterministicReductionPlan,
} = require('./deterministicReductionPlan');
const {
  SUSTAIN_TIE_GRAPH_VERSION,
  SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE,
  createSustainTieGraph,
} = require('./sustainTieGraph');

const SUSTAINED_CANONICAL_SELECTION_BRIDGE_VERSION = '1.0.0';
const SUSTAINED_CANONICAL_SELECTION_BRIDGE_DOCUMENT_TYPE = 'SustainedCanonicalSelectionBridgeProjection';
const SUSTAINED_CANONICAL_SELECTION_BRIDGE_AUTHORITY = 'REDUCTION_PROJECTION_FACTS_ONLY';
const SUSTAINED_CANONICAL_SELECTION_BRIDGE_TARGET_POLICY = 'PA6_TARGET_MIDI_AS_SUSTAINED_SELECTION_INPUT_1.0';

class SustainedCanonicalSelectionBridgeError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'UNSUPPORTED_SUSTAINED_CANONICAL_SELECTION_BRIDGE',
      Object.freeze({ ...details }),
      'SustainedCanonicalSelectionBridgeError',
    );
  }
}

function unsupported(message, reason, details = {}) {
  return new SustainedCanonicalSelectionBridgeError(message, {
    reason,
    ...details,
  });
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function buildSourceNoteIndex(source, runtime) {
  const byId = new Map();
  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    const measure = source.measures[measureIndex];
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'sustained-canonical-selection-bridge:source-event', {
        measureIndex,
        eventIndex,
      });
      const event = measure.events[eventIndex];
      if (event.type === 'note') byId.set(event.sourceEventId, event);
    }
  }
  return byId;
}

function buildTieMembershipIndex(tieGraph, runtime) {
  const byEventId = new Map();
  for (let index = 0; index < tieGraph.memberships.length; index += 1) {
    checkpoint(runtime, 'sustained-canonical-selection-bridge:tie-membership', { index });
    const membership = tieGraph.memberships[index];
    byEventId.set(membership.sourceEventId, membership.sustainChainId);
  }
  return byEventId;
}

function validateTieReductionContinuity(instructions, runtime) {
  const byChainId = new Map();
  for (let index = 0; index < instructions.length; index += 1) {
    checkpoint(runtime, 'sustained-canonical-selection-bridge:tie-continuity', { index });
    const instruction = instructions[index];
    if (instruction.sustainChainId === null) continue;
    const chain = byChainId.get(instruction.sustainChainId) || [];
    chain.push(instruction);
    byChainId.set(instruction.sustainChainId, chain);
  }

  for (const [sustainChainId, chain] of byChainId) {
    const first = chain[0];
    for (let index = 1; index < chain.length; index += 1) {
      const current = chain[index];
      if (
        current.disposition !== first.disposition
        || current.targetMidi !== first.targetMidi
        || current.octaveShiftSemitones !== first.octaveShiftSemitones
      ) {
        throw unsupported(
          'A sustain chain cannot carry conflicting reduction facts into sustained selection.',
          'INCONSISTENT_TIE_REDUCTION',
          {
            sustainChainId,
            firstSourceEventId: first.sourceEventId,
            conflictingSourceEventId: current.sourceEventId,
            firstDisposition: first.disposition,
            conflictingDisposition: current.disposition,
            firstTargetMidi: first.targetMidi,
            conflictingTargetMidi: current.targetMidi,
            firstOctaveShiftSemitones: first.octaveShiftSemitones,
            conflictingOctaveShiftSemitones: current.octaveShiftSemitones,
          },
        );
      }
    }
  }
}

function createSustainedCanonicalSelectionBridgeProjection(
  sourceModel,
  arrangementDecisions,
  runtime = null,
) {
  checkpoint(runtime, 'sustained-canonical-selection-bridge:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const reductionPlan = createDeterministicReductionPlan(
    source,
    arrangementDecisions,
    runtime,
  );
  const tieGraph = createSustainTieGraph(source, runtime);
  const notesById = buildSourceNoteIndex(source, runtime);
  const chainByEventId = buildTieMembershipIndex(tieGraph, runtime);

  const instructions = new Array(reductionPlan.instructions.length);
  const retainedSourceEventIds = [];
  const omittedSourceEventIds = [];

  for (let index = 0; index < reductionPlan.instructions.length; index += 1) {
    checkpoint(runtime, 'sustained-canonical-selection-bridge:instruction', { index });
    const reduction = reductionPlan.instructions[index];
    const sourceEvent = notesById.get(reduction.sourceEventId);
    if (!sourceEvent || !sourceEvent.pitch || !Number.isInteger(sourceEvent.pitch.midi)) {
      throw unsupported(
        'Reduction provenance does not resolve to one pitched source note.',
        'UNRESOLVED_SOURCE_NOTE',
        { sourceEventId: reduction.sourceEventId },
      );
    }

    if (reduction.disposition === 'KEEP') {
      if (!Number.isInteger(reduction.targetMidi)) {
        throw unsupported(
          'Retained reduction instruction is missing an integer target MIDI pitch.',
          'INVALID_RETAINED_TARGET_MIDI',
          { sourceEventId: reduction.sourceEventId },
        );
      }
      retainedSourceEventIds.push(reduction.sourceEventId);
    } else if (reduction.disposition === 'OMIT') {
      if (reduction.targetMidi !== null || reduction.octaveShiftSemitones !== null) {
        throw unsupported(
          'Omitted reduction instruction cannot carry a sustained-selection target pitch.',
          'INVALID_OMITTED_TARGET_MIDI',
          { sourceEventId: reduction.sourceEventId },
        );
      }
      omittedSourceEventIds.push(reduction.sourceEventId);
    } else {
      throw unsupported(
        'Reduction disposition is not supported by Bridge v1.',
        'UNSUPPORTED_REDUCTION_DISPOSITION',
        {
          sourceEventId: reduction.sourceEventId,
          disposition: reduction.disposition,
        },
      );
    }

    instructions[index] = Object.freeze({
      sourceEventId: reduction.sourceEventId,
      decisionId: reduction.decisionId,
      decisionType: reduction.decisionType,
      sourceGroupId: reduction.sourceGroupId,
      sourceMidi: sourceEvent.pitch.midi,
      disposition: reduction.disposition,
      targetMidi: reduction.targetMidi,
      octaveShiftSemitones: reduction.octaveShiftSemitones,
      ruleId: reduction.ruleId,
      sustainChainId: chainByEventId.get(reduction.sourceEventId) || null,
    });
  }

  validateTieReductionContinuity(instructions, runtime);

  const result = Object.freeze({
    documentType: SUSTAINED_CANONICAL_SELECTION_BRIDGE_DOCUMENT_TYPE,
    contractVersion: SUSTAINED_CANONICAL_SELECTION_BRIDGE_VERSION,
    authority: SUSTAINED_CANONICAL_SELECTION_BRIDGE_AUTHORITY,
    targetPolicy: SUSTAINED_CANONICAL_SELECTION_BRIDGE_TARGET_POLICY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    reduction: Object.freeze({
      documentType: DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
      contractVersion: DETERMINISTIC_REDUCTION_PLAN_VERSION,
      policy: DETERMINISTIC_REDUCTION_POLICY,
    }),
    sustainTieGraph: Object.freeze({
      documentType: SUSTAIN_TIE_GRAPH_DOCUMENT_TYPE,
      contractVersion: SUSTAIN_TIE_GRAPH_VERSION,
    }),
    instructionCount: instructions.length,
    retainedSourceEventIds: Object.freeze(retainedSourceEventIds),
    omittedSourceEventIds: Object.freeze(omittedSourceEventIds),
    instructions: Object.freeze(instructions),
  });

  checkpoint(runtime, 'sustained-canonical-selection-bridge:complete', {
    instructionCount: result.instructionCount,
    retainedCount: result.retainedSourceEventIds.length,
    omittedCount: result.omittedSourceEventIds.length,
  });
  return result;
}

module.exports = {
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_VERSION,
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_DOCUMENT_TYPE,
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_AUTHORITY,
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_TARGET_POLICY,
  SustainedCanonicalSelectionBridgeError,
  createSustainedCanonicalSelectionBridgeProjection,
};
