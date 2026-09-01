'use strict';

const { version: ENGINE_VERSION } = require('../../package.json');
const { ENGINE_NAME } = require('../contracts/canonicalTabContractMetadata');
const {
  CANONICAL_TAB_RESULT_V2_VERSION,
  CANONICAL_TAB_RESULT_V2_CAPO_VERSION,
  CANONICAL_TAB_RESULT_DOCUMENT_TYPE,
  validateCanonicalTabResultV2,
} = require('../contracts/canonicalTabResultV2Contract');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('../music/polyphonicSourceModel');
const { createSimultaneousEventModel } = require('../music/simultaneousEventModel');
const { createGuitarArrangementPlan } = require('../music/guitarArrangementPlan');
const { createDeterministicReductionPlan } = require('../music/deterministicReductionPlan');
const {
  createDeterministicPolyphonicFinalSelection,
} = require('../music/deterministicPolyphonicFinalSelector');
const {
  createSustainedCanonicalFinalSelection,
} = require('../music/sustainedCanonicalFinalSelector');
const {
  clonePitch,
  createGuitarFacts,
  createPolicyProvenance,
  createMeasureFacts,
  createGroupFacts,
  deepFreeze,
} = require('./canonicalTabResultV2BuilderSupport');

function createArrangementFacts(arrangement) {
  return arrangement.decisions.map((decision) => ({
    decisionId: decision.decisionId,
    decisionType: decision.decisionType,
    sourceEventIds: [...decision.sourceEventIds],
    sourceGroupId: decision.sourceGroupId,
  }));
}

function createDispositionFacts(source, reduction, finalSelection) {
  const sourceNotesById = new Map();
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') sourceNotesById.set(event.sourceEventId, event);
    }
  }
  const selectedBySourceId = new Map(
    finalSelection.noteSelections.map((entry) => [entry.sourceEventId, entry]),
  );

  return reduction.instructions.map((instruction) => {
    if (instruction.disposition === 'OMIT') {
      return {
        sourceEventId: instruction.sourceEventId,
        decisionId: instruction.decisionId,
        disposition: 'OMIT',
        targetPitch: null,
        octaveShiftSemitones: null,
        ruleId: instruction.ruleId,
        selectedPosition: null,
        selectedShapeId: null,
      };
    }
    const sourceNote = sourceNotesById.get(instruction.sourceEventId);
    const selected = selectedBySourceId.get(instruction.sourceEventId);
    if (!sourceNote || !selected) {
      throw new TypeError('Canonical v2 producer lost retained-note selection provenance.');
    }
    return {
      sourceEventId: instruction.sourceEventId,
      decisionId: instruction.decisionId,
      disposition: 'KEEP',
      targetPitch: clonePitch(
        sourceNote.pitch,
        instruction.octaveShiftSemitones,
        instruction.targetMidi,
      ),
      octaveShiftSemitones: instruction.octaveShiftSemitones,
      ruleId: instruction.ruleId,
      selectedPosition: {
        string: selected.string,
        fret: selected.fret,
      },
      selectedShapeId: selected.selectedShapeId,
    };
  });
}

function createSelectedShapeFacts(finalSelection) {
  return finalSelection.selectedShapes.map((shape) => ({
    selectedShapeId: shape.selectedShapeId,
    sourceGroupId: shape.sourceGroupId,
    sourceEventIds: [...shape.sourceEventIds],
    voicingCandidateId: shape.voicingCandidateId,
    shapeCandidateId: shape.shapeCandidateId,
    fingerAssignments: shape.fingerAssignments.map((assignment) => ({
      sourceEventId: assignment.sourceEventId,
      finger: assignment.finger,
    })),
    barres: shape.barres.map((barre) => ({
      finger: barre.finger,
      fret: barre.fret,
      startString: barre.startString,
      endString: barre.endString,
      stringSpan: barre.stringSpan,
      kind: barre.kind,
    })),
    physicalValidation: {
      status: shape.physicalValidation.status,
    },
  }));
}

function createCanonicalTabResultV2(
  sourceModel,
  arrangementDecisions,
  runtime = null,
  guitarOptions = {},
) {
  if (runtime) runtime.checkpoint('canonical-tab-result-v2:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const grouping = createSimultaneousEventModel(source, runtime);
  const arrangement = createGuitarArrangementPlan(source, arrangementDecisions, runtime);
  const reduction = createDeterministicReductionPlan(source, arrangementDecisions, runtime);
  let finalSelection;
  try {
    finalSelection = createDeterministicPolyphonicFinalSelection(
      source,
      arrangementDecisions,
      runtime,
      guitarOptions,
    );
  } catch (error) {
    const reason = error && error.details && error.details.reason;
    if (
      !error
      || error.code !== 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
      || (reason !== 'RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED'
        && reason !== 'RETAINED_TIE_NOT_SUPPORTED')
    ) {
      throw error;
    }
    if (runtime) runtime.checkpoint('canonical-tab-result-v2:sustained-fallback', { reason });
    finalSelection = createSustainedCanonicalFinalSelection(
      source,
      arrangementDecisions,
      runtime,
      guitarOptions,
    );
  }

  const result = {
    documentType: CANONICAL_TAB_RESULT_DOCUMENT_TYPE,
    schemaVersion: guitarOptions.capoFret > 0
      ? CANONICAL_TAB_RESULT_V2_CAPO_VERSION
      : CANONICAL_TAB_RESULT_V2_VERSION,
    engine: {
      name: ENGINE_NAME,
      version: ENGINE_VERSION,
    },
    source: {
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      format: source.source.format,
      musicXmlVersion: source.source.musicXmlVersion,
      partId: source.source.partId,
    },
    review: { teacherReviewStatus: 'NOT_REVIEWED' },
    guitar: createGuitarFacts(guitarOptions),
    policyProvenance: createPolicyProvenance(),
    measures: createMeasureFacts(source),
    simultaneousGroups: createGroupFacts(grouping),
    arrangementDecisions: createArrangementFacts(arrangement),
    noteDispositions: createDispositionFacts(source, reduction, finalSelection),
    selectedShapes: createSelectedShapeFacts(finalSelection),
  };

  validateCanonicalTabResultV2(result);
  deepFreeze(result);
  if (runtime) {
    runtime.checkpoint('canonical-tab-result-v2:complete', {
      noteDispositionCount: result.noteDispositions.length,
      selectedShapeCount: result.selectedShapes.length,
    });
  }
  return result;
}

module.exports = {
  CANONICAL_TAB_RESULT_V2_VERSION,
  CANONICAL_TAB_RESULT_V2_CAPO_VERSION,
  CANONICAL_TAB_RESULT_DOCUMENT_TYPE,
  createCanonicalTabResultV2,
};
