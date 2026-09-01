'use strict';

const { EngineError } = require('../errors/engineError');
const {
  GUITAR_CONFIGURATION_VERSION,
  GUITAR_STRING_COUNT,
  DEFAULT_FRET_RANGE,
} = require('../guitar/tuning');
const { getPositionCandidates, positionToMidi } = require('../guitar/fretboard');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const { createSimultaneousEventModel } = require('./simultaneousEventModel');
const {
  GUITAR_ARRANGEMENT_PLAN_VERSION,
  GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
  createGuitarArrangementPlan,
} = require('./guitarArrangementPlan');
const {
  DETERMINISTIC_REDUCTION_PLAN_VERSION,
  DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
  DETERMINISTIC_REDUCTION_POLICY,
  createDeterministicReductionPlan,
} = require('./deterministicReductionPlan');
const {
  createDeterministicPa7CandidateSnapshotHandoff,
} = require('./deterministicPa7CandidateSnapshotHandoff');
const { PLAYABILITY_STATUS } = require('./physicalPlayabilityValidatorV2');

const DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION = '1.0.0';
const DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_DOCUMENT_TYPE =
  'DeterministicPolyphonicFinalSelection';
const DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY =
  'STATIC_ATTACK_PATH_LEXICOGRAPHIC_1.0';
const DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_TRANSITION_POLICY =
  'MIN_FRET_ANCHOR_DISTANCE_THEN_ERGONOMIC_TOTALS_1.0';
const DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_SUSTAINED_POLICY =
  'FAIL_CLOSED_ON_RETAINED_OVERLAP_OR_TIE_1.0';
const MAX_FINAL_SELECTION_CANDIDATES_PER_UNIT = 10_000;
const MAX_FINAL_SELECTION_PATH_STATES = 400_000;

class DeterministicPolyphonicFinalSelectionError extends EngineError {
  constructor(message, code = 'INVALID_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'DeterministicPolyphonicFinalSelectionError',
    );
  }
}

function invalid(message, details = {}) {
  return new DeterministicPolyphonicFinalSelectionError(message, undefined, details);
}

function unsupported(message, reason, details = {}) {
  return new DeterministicPolyphonicFinalSelectionError(
    message,
    'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION',
    { reason, ...details },
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function safeAdd(left, right, field) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw invalid('Final-selection path cost exceeded the safe-integer range.', { field });
  }
  return value;
}

function compareNumberArrays(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] === undefined ? Number.POSITIVE_INFINITY : left[index];
    const rightValue = right[index] === undefined ? Number.POSITIVE_INFINITY : right[index];
    if (leftValue !== rightValue) return leftValue - rightValue;
  }
  return 0;
}

function compareStates(left, right) {
  const numeric = compareNumberArrays(left.cost, right.cost);
  if (numeric !== 0) return numeric;
  return left.tieRank - right.tieRank;
}

function copyBarres(barres) {
  return Object.freeze(barres.map((barre) => Object.freeze({
    finger: barre.finger,
    fret: barre.fret,
    startString: barre.startString,
    endString: barre.endString,
    stringSpan: barre.stringSpan,
    kind: barre.kind,
  })));
}

function positionSignature(positions) {
  return positions.map((position) => (
    `${position.sourceEventId}:${position.targetMidi}:${position.string}:${position.fret}`
  )).join(';');
}

function shapeSignature(shape) {
  const assignments = shape.fingerAssignments
    .map((entry) => `${entry.sourceEventId}:${entry.string}:${entry.fret}:${entry.finger}`)
    .join(';');
  const barres = shape.barres
    .map((barre) => (
      `${barre.finger}:${barre.fret}:${barre.startString}:${barre.endString}:${barre.kind}`
    ))
    .join(';');
  return `${assignments}|${barres}`;
}

function anchorFret(positions) {
  const fretted = positions.filter((position) => position.fret > 0).map((position) => position.fret);
  return fretted.length === 0 ? 0 : Math.min(...fretted);
}

function localCost(positions, verdict) {
  const frets = positions.map((position) => position.fret);
  const strings = positions.map((position) => position.string);
  return Object.freeze([
    verdict ? verdict.fretSpan : 0,
    verdict ? verdict.usedFingerCount : (frets[0] > 0 ? 1 : 0),
    verdict ? verdict.barreCount : 0,
    frets.length === 0 ? 0 : Math.max(...frets),
    frets.reduce((sum, fret) => safeAdd(sum, fret, 'fretSum'), 0),
    strings.reduce((sum, string) => safeAdd(sum, string, 'stringSum'), 0),
  ]);
}

function candidateFromSingleton(unit, position, guitarOptions) {
  if (positionToMidi(position, guitarOptions) !== unit.targetMidi) {
    throw invalid('Singleton position failed exact target-MIDI round trip.', {
      sourceEventId: unit.sourceEventId,
      targetMidi: unit.targetMidi,
      string: position.string,
      fret: position.fret,
    });
  }
  const positions = Object.freeze([Object.freeze({
    sourceEventId: unit.sourceEventId,
    targetMidi: unit.targetMidi,
    string: position.string,
    fret: position.fret,
  })]);
  return Object.freeze({
    kind: 'SINGLETON',
    sourceGroupId: null,
    sourceEventIds: Object.freeze([unit.sourceEventId]),
    positions,
    voicingCandidateId: null,
    shapeCandidateId: null,
    fingerAssignments: Object.freeze([]),
    barres: Object.freeze([]),
    physicalValidation: null,
    anchorFret: anchorFret(positions),
    localCost: localCost(positions, null),
    signature: `singleton|${positionSignature(positions)}`,
  });
}

function chooseBestShapeForVoicing(voicing, physicalVoicing, sourceGroupId) {
  const verdictByShapeId = new Map(
    physicalVoicing.shapeVerdicts.map((entry) => [entry.shapeCandidateId, entry]),
  );
  const candidates = [];

  for (const shape of voicing.shapeCandidates) {
    const verdict = verdictByShapeId.get(shape.shapeCandidateId);
    if (!verdict) {
      throw invalid('PA-9 omitted a PA-8 shape verdict during final selection.', {
        sourceGroupId,
        voicingCandidateId: voicing.voicingCandidateId,
        shapeCandidateId: shape.shapeCandidateId,
      });
    }
    if (
      verdict.status !== PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY
      || verdict.reasonCodes.length !== 0
    ) {
      continue;
    }
    candidates.push({
      shape,
      verdict,
      signature: `${positionSignature(voicing.positions)}|${shapeSignature(shape)}`,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((left, right) => {
    const numeric = compareNumberArrays(
      localCost(voicing.positions, left.verdict),
      localCost(voicing.positions, right.verdict),
    );
    return numeric !== 0 ? numeric : left.signature.localeCompare(right.signature);
  });
  return candidates[0];
}

function candidatesFromGroup(unit, handoff) {
  const leftGroup = handoff.leftHandShapeSnapshot.groups.find(
    (group) => group.sourceGroupId === unit.sourceGroupId,
  );
  const physicalGroup = handoff.physicalPlayabilitySnapshot.groups.find(
    (group) => group.sourceGroupId === unit.sourceGroupId,
  );
  if (!leftGroup || !physicalGroup) {
    throw invalid('Final selection could not join an active group to the PA-8/PA-9 handoff.', {
      sourceGroupId: unit.sourceGroupId,
    });
  }

  const physicalByVoicingId = new Map(
    physicalGroup.voicingCandidates.map((entry) => [entry.voicingCandidateId, entry]),
  );
  const candidates = [];

  for (const voicing of leftGroup.voicingCandidates) {
    const physicalVoicing = physicalByVoicingId.get(voicing.voicingCandidateId);
    if (!physicalVoicing) {
      throw invalid('PA-9 omitted a PA-8 voicing candidate during final selection.', {
        sourceGroupId: unit.sourceGroupId,
        voicingCandidateId: voicing.voicingCandidateId,
      });
    }
    const best = chooseBestShapeForVoicing(voicing, physicalVoicing, unit.sourceGroupId);
    if (!best) continue;
    if (voicing.positions.length !== unit.sourceEventIds.length) {
      throw invalid('Selected voicing membership diverged from retained group membership.', {
        sourceGroupId: unit.sourceGroupId,
        voicingCandidateId: voicing.voicingCandidateId,
      });
    }
    candidates.push(Object.freeze({
      kind: 'GROUP',
      sourceGroupId: unit.sourceGroupId,
      sourceEventIds: unit.sourceEventIds,
      positions: voicing.positions,
      voicingCandidateId: voicing.voicingCandidateId,
      shapeCandidateId: best.shape.shapeCandidateId,
      fingerAssignments: best.shape.fingerAssignments,
      barres: best.shape.barres,
      physicalValidation: Object.freeze({ status: best.verdict.status }),
      anchorFret: anchorFret(voicing.positions),
      localCost: localCost(voicing.positions, best.verdict),
      signature: `group|${unit.sourceGroupId}|${best.signature}`,
    }));
  }

  return candidates;
}

function buildIndexes(source, grouping, reduction) {
  const noteLocationById = new Map();
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      noteLocationById.set(event.sourceEventId, Object.freeze({
        measureIndex: measure.index,
        onsetDivisions: event.onsetDivisions,
        endDivisions: event.onsetDivisions + event.durationDivisions,
      }));
    }
  }

  const groupsById = new Map();
  const groupIdBySourceEventId = new Map();
  for (const measure of grouping.measures) {
    for (const group of measure.groups) {
      const record = Object.freeze({ ...group, measureIndex: measure.index });
      groupsById.set(group.groupId, record);
      for (const sourceEventId of group.sourceEventIds) {
        groupIdBySourceEventId.set(sourceEventId, group.groupId);
      }
    }
  }

  return {
    noteLocationById,
    groupsById,
    groupIdBySourceEventId,
    instructionsBySourceEventId: new Map(
      reduction.instructions.map((instruction) => [instruction.sourceEventId, instruction]),
    ),
  };
}

function buildSelectionUnits(source, indexes) {
  const units = [];
  const consumedGroupIds = new Set();

  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const instruction = indexes.instructionsBySourceEventId.get(event.sourceEventId);
      if (!instruction) {
        throw invalid('Final selection lost exact PA-6 instruction provenance.', {
          sourceEventId: event.sourceEventId,
        });
      }
      if (instruction.disposition === 'OMIT') continue;
      if (instruction.disposition !== 'KEEP' || !Number.isInteger(instruction.targetMidi)) {
        throw invalid('Final selection received an unsupported PA-6 instruction.', {
          sourceEventId: event.sourceEventId,
          disposition: instruction.disposition,
        });
      }
      if (event.tieStart || event.tieStop) {
        throw unsupported(
          'Retained ties require a separately versioned sustained-sonority selector.',
          'RETAINED_TIE_NOT_SUPPORTED',
          { sourceEventId: event.sourceEventId },
        );
      }

      const sourceGroupId = indexes.groupIdBySourceEventId.get(event.sourceEventId) || null;
      if (sourceGroupId) {
        if (consumedGroupIds.has(sourceGroupId)) continue;
        consumedGroupIds.add(sourceGroupId);
        const group = indexes.groupsById.get(sourceGroupId);
        const active = group.sourceEventIds.filter((sourceEventId) => {
          const memberInstruction = indexes.instructionsBySourceEventId.get(sourceEventId);
          return memberInstruction && memberInstruction.disposition === 'KEEP';
        });
        if (active.length === 0) continue;
        if (active.length === 1) {
          const memberInstruction = indexes.instructionsBySourceEventId.get(active[0]);
          units.push(Object.freeze({
            kind: 'SINGLETON',
            measureIndex: group.measureIndex,
            onsetDivisions: group.onsetDivisions,
            sourceEventId: active[0],
            sourceEventIds: Object.freeze([active[0]]),
            targetMidi: memberInstruction.targetMidi,
          }));
        } else {
          units.push(Object.freeze({
            kind: 'GROUP',
            measureIndex: group.measureIndex,
            onsetDivisions: group.onsetDivisions,
            sourceGroupId,
            sourceEventIds: Object.freeze(active),
          }));
        }
        continue;
      }

      units.push(Object.freeze({
        kind: 'SINGLETON',
        measureIndex: measure.index,
        onsetDivisions: event.onsetDivisions,
        sourceEventId: event.sourceEventId,
        sourceEventIds: Object.freeze([event.sourceEventId]),
        targetMidi: instruction.targetMidi,
      }));
    }
  }

  units.sort((left, right) => (
    left.measureIndex - right.measureIndex
    || left.onsetDivisions - right.onsetDivisions
    || left.sourceEventIds[0].localeCompare(right.sourceEventIds[0])
  ));

  for (let index = 1; index < units.length; index += 1) {
    const previous = units[index - 1];
    const current = units[index];
    if (
      previous.measureIndex === current.measureIndex
      && previous.onsetDivisions === current.onsetDivisions
    ) {
      throw invalid('Retained notes at one onset must resolve through exactly one selection unit.', {
        measureIndex: current.measureIndex,
        onsetDivisions: current.onsetDivisions,
      });
    }
  }
  return Object.freeze(units);
}

function assertNoUnsupportedSustainedOverlap(units, indexes) {
  for (let unitIndex = 0; unitIndex < units.length - 1; unitIndex += 1) {
    const unit = units[unitIndex];
    const next = units[unitIndex + 1];
    if (unit.measureIndex !== next.measureIndex) continue;
    for (const sourceEventId of unit.sourceEventIds) {
      const location = indexes.noteLocationById.get(sourceEventId);
      if (!location) {
        throw invalid('Final selection lost source timing provenance.', { sourceEventId });
      }
      if (location.endDivisions > next.onsetDivisions) {
        throw unsupported(
          'Retained-note overlap into a later attack requires a separately versioned sustained-sonority selector.',
          'RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED',
          {
            sourceEventId,
            measureIndex: unit.measureIndex,
            endDivisions: location.endDivisions,
            nextOnsetDivisions: next.onsetDivisions,
          },
        );
      }
    }
  }
}

function buildUnitCandidates(unit, handoff, guitarOptions) {
  const candidates = unit.kind === 'GROUP'
    ? candidatesFromGroup(unit, handoff)
    : getPositionCandidates(unit.targetMidi, guitarOptions)
      .map((position) => candidateFromSingleton(unit, position, guitarOptions));

  if (candidates.length === 0) {
    throw unsupported(
      'No physically valid deterministic candidate exists for a retained selection unit.',
      'NO_PLAYABLE_FINAL_SELECTION_CANDIDATE',
      {
        kind: unit.kind,
        measureIndex: unit.measureIndex,
        onsetDivisions: unit.onsetDivisions,
        sourceGroupId: unit.sourceGroupId || null,
      },
    );
  }
  if (candidates.length > MAX_FINAL_SELECTION_CANDIDATES_PER_UNIT) {
    throw unsupported(
      'Final-selection candidate count exceeds the fixed path-search boundary.',
      'FINAL_SELECTION_CANDIDATE_LIMIT_EXCEEDED',
      {
        limit: MAX_FINAL_SELECTION_CANDIDATES_PER_UNIT,
        observed: candidates.length,
      },
    );
  }
  candidates.sort((left, right) => {
    const numeric = compareNumberArrays(left.localCost, right.localCost);
    return numeric !== 0 ? numeric : left.signature.localeCompare(right.signature);
  });
  return Object.freeze(candidates);
}

function initialCost(candidate) {
  return Object.freeze([
    0,
    candidate.localCost[0],
    candidate.localCost[1],
    candidate.localCost[2],
    candidate.localCost[3],
    candidate.localCost[4],
    candidate.localCost[5],
  ]);
}

function extendCost(previousCost, candidate, previousAnchor) {
  return Object.freeze([
    safeAdd(previousCost[0], Math.abs(candidate.anchorFret - previousAnchor), 'transitionFretDistance'),
    safeAdd(previousCost[1], candidate.localCost[0], 'totalFretSpan'),
    safeAdd(previousCost[2], candidate.localCost[1], 'totalUsedFingerCount'),
    safeAdd(previousCost[3], candidate.localCost[2], 'totalBarreCount'),
    safeAdd(previousCost[4], candidate.localCost[3], 'totalMaximumFret'),
    safeAdd(previousCost[5], candidate.localCost[4], 'totalFretSum'),
    safeAdd(previousCost[6], candidate.localCost[5], 'totalStringSum'),
  ]);
}

function assignTieRanks(states) {
  const order = states.map((_, index) => index).sort((leftIndex, rightIndex) => {
    const left = states[leftIndex];
    const right = states[rightIndex];
    return left.previousTieRank - right.previousTieRank
      || left.candidateRank - right.candidateRank;
  });
  for (let rank = 0; rank < order.length; rank += 1) {
    states[order[rank]].tieRank = rank;
  }
}

function selectPath(unitCandidates, runtime) {
  let states = unitCandidates[0].map((candidate, candidateRank) => Object.freeze({
    candidate,
    previous: null,
    cost: initialCost(candidate),
    tieRank: candidateRank,
  }));

  for (let unitIndex = 1; unitIndex < unitCandidates.length; unitIndex += 1) {
    checkpoint(runtime, 'deterministic-final-selection:path-unit', { unitIndex });
    const bestByAnchor = new Map();
    for (const state of states) {
      const anchor = state.candidate.anchorFret;
      const incumbent = bestByAnchor.get(anchor);
      if (!incumbent || compareStates(state, incumbent) < 0) bestByAnchor.set(anchor, state);
    }

    const nextStates = new Array(unitCandidates[unitIndex].length);
    for (let candidateRank = 0; candidateRank < unitCandidates[unitIndex].length; candidateRank += 1) {
      checkpoint(runtime, 'deterministic-final-selection:path-candidate', { unitIndex, candidateRank });
      const candidate = unitCandidates[unitIndex][candidateRank];
      let best = null;
      for (const [anchor, previous] of bestByAnchor) {
        const cost = extendCost(previous.cost, candidate, anchor);
        if (
          !best
          || compareNumberArrays(cost, best.cost) < 0
          || (
            compareNumberArrays(cost, best.cost) === 0
            && previous.tieRank < best.previous.tieRank
          )
        ) {
          best = {
            candidate,
            previous,
            cost,
            previousTieRank: previous.tieRank,
            candidateRank,
            tieRank: 0,
          };
        }
      }
      nextStates[candidateRank] = best;
    }
    assignTieRanks(nextStates);
    states = nextStates.map((state) => Object.freeze({
      candidate: state.candidate,
      previous: state.previous,
      cost: state.cost,
      tieRank: state.tieRank,
    }));
  }

  states.sort(compareStates);
  const best = states[0];
  const selected = new Array(unitCandidates.length);
  let cursor = best;
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    selected[index] = cursor.candidate;
    cursor = cursor.previous;
  }
  return Object.freeze({ selected: Object.freeze(selected), cost: best.cost });
}

function buildFinalFacts(units, path) {
  const noteSelections = [];
  const selectedShapes = [];
  const seenNotes = new Set();

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const candidate = path.selected[unitIndex];
    const selectedShapeId = candidate.kind === 'GROUP'
      ? `${candidate.sourceGroupId}:selected-shape`
      : null;

    for (const position of candidate.positions) {
      if (seenNotes.has(position.sourceEventId)) {
        throw invalid('Final selection selected one source note more than once.', {
          sourceEventId: position.sourceEventId,
        });
      }
      seenNotes.add(position.sourceEventId);
      noteSelections.push(Object.freeze({
        sourceEventId: position.sourceEventId,
        targetMidi: position.targetMidi,
        string: position.string,
        fret: position.fret,
        selectedShapeId,
      }));
    }

    if (candidate.kind === 'GROUP') {
      selectedShapes.push(Object.freeze({
        selectedShapeId,
        sourceGroupId: candidate.sourceGroupId,
        sourceEventIds: candidate.sourceEventIds,
        voicingCandidateId: candidate.voicingCandidateId,
        shapeCandidateId: candidate.shapeCandidateId,
        positions: Object.freeze(candidate.positions.map((position) => Object.freeze({ ...position }))),
        fingerAssignments: Object.freeze(candidate.fingerAssignments.map((assignment) => Object.freeze({
          sourceEventId: assignment.sourceEventId,
          finger: assignment.finger,
        }))),
        barres: copyBarres(candidate.barres),
        physicalValidation: candidate.physicalValidation,
      }));
    }
  }

  return Object.freeze({
    noteSelections: Object.freeze(noteSelections),
    selectedShapes: Object.freeze(selectedShapes),
  });
}

function createDeterministicPolyphonicFinalSelection(
  sourceModel,
  arrangementDecisions,
  runtime = null,
  guitarOptions = {},
) {
  checkpoint(runtime, 'deterministic-final-selection:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const grouping = createSimultaneousEventModel(source, runtime);
  createGuitarArrangementPlan(source, arrangementDecisions, runtime);
  const reduction = createDeterministicReductionPlan(source, arrangementDecisions, runtime, guitarOptions);
  const handoff = createDeterministicPa7CandidateSnapshotHandoff(
    source,
    arrangementDecisions,
    runtime,
    guitarOptions,
  );
  if (handoff.candidateGenerationCount !== 1) {
    throw invalid('Final selection requires exactly one authentic PA-7 candidate generation.');
  }

  const indexes = buildIndexes(source, grouping, reduction);
  const units = buildSelectionUnits(source, indexes);
  const retainedInstructionCount = reduction.instructions.filter(
    (instruction) => instruction.disposition === 'KEEP',
  ).length;
  const omittedInstructionCount = reduction.instructions.length - retainedInstructionCount;

  if (retainedInstructionCount === 0) {
    throw unsupported('Final selection requires at least one retained output note.', 'NO_RETAINED_OUTPUT_NOTES');
  }
  assertNoUnsupportedSustainedOverlap(units, indexes);

  let observedPathStates = 0;
  const unitCandidates = units.map((unit, unitIndex) => {
    checkpoint(runtime, 'deterministic-final-selection:unit', { unitIndex });
    const candidates = buildUnitCandidates(unit, handoff, guitarOptions);
    observedPathStates = safeAdd(observedPathStates, candidates.length, 'pathStateCount');
    if (observedPathStates > MAX_FINAL_SELECTION_PATH_STATES) {
      throw unsupported(
        'Final-selection path state count exceeds the fixed aggregate boundary.',
        'FINAL_SELECTION_PATH_STATE_LIMIT_EXCEEDED',
        { limit: MAX_FINAL_SELECTION_PATH_STATES, observed: observedPathStates },
      );
    }
    return candidates;
  });

  const path = selectPath(unitCandidates, runtime);
  const facts = buildFinalFacts(units, path);
  if (facts.noteSelections.length !== retainedInstructionCount) {
    throw invalid('Final selection did not conserve every retained PA-6 source note exactly once.', {
      expected: retainedInstructionCount,
      observed: facts.noteSelections.length,
    });
  }

  checkpoint(runtime, 'deterministic-final-selection:complete', {
    selectionUnitCount: units.length,
    selectedNoteCount: facts.noteSelections.length,
    selectedShapeCount: facts.selectedShapes.length,
    pathStateCount: observedPathStates,
  });

  return Object.freeze({
    documentType: DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_DOCUMENT_TYPE,
    contractVersion: DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION,
    policy: DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY,
    transitionPolicy: DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_TRANSITION_POLICY,
    sustainedSonorityPolicy: DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_SUSTAINED_POLICY,
    authority: 'DETERMINISTIC_NON_ML',
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    arrangement: Object.freeze({
      documentType: GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
      contractVersion: GUITAR_ARRANGEMENT_PLAN_VERSION,
    }),
    reduction: Object.freeze({
      documentType: DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
      contractVersion: DETERMINISTIC_REDUCTION_PLAN_VERSION,
      policy: DETERMINISTIC_REDUCTION_POLICY,
    }),
    guitar: Object.freeze({
      contractVersion: GUITAR_CONFIGURATION_VERSION,
      stringCount: GUITAR_STRING_COUNT,
      minimumFret: DEFAULT_FRET_RANGE.minimumFret,
      maximumFret: DEFAULT_FRET_RANGE.maximumFret,
    }),
    candidateGenerationCount: handoff.candidateGenerationCount,
    selectionUnitCount: units.length,
    pathStateCount: observedPathStates,
    selectedNoteCount: facts.noteSelections.length,
    omittedNoteCount: omittedInstructionCount,
    selectedShapeCount: facts.selectedShapes.length,
    pathCost: Object.freeze({
      transitionFretDistance: path.cost[0],
      totalFretSpan: path.cost[1],
      totalUsedFingerCount: path.cost[2],
      totalBarreCount: path.cost[3],
      totalMaximumFret: path.cost[4],
      totalFretSum: path.cost[5],
      totalStringSum: path.cost[6],
    }),
    noteSelections: facts.noteSelections,
    selectedShapes: facts.selectedShapes,
  });
}

module.exports = {
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_DOCUMENT_TYPE,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_TRANSITION_POLICY,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_SUSTAINED_POLICY,
  MAX_FINAL_SELECTION_CANDIDATES_PER_UNIT,
  MAX_FINAL_SELECTION_PATH_STATES,
  DeterministicPolyphonicFinalSelectionError,
  createDeterministicPolyphonicFinalSelection,
};
