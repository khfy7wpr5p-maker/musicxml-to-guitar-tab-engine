'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION,
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE,
  SUSTAINED_PHYSICAL_POINT_STATUS,
  MAX_SUSTAINED_PHYSICAL_STATE_CANDIDATES,
  createSustainedLeftHandPhysicalStateModel,
} = require('./sustainedLeftHandPhysicalStateModel');
const {
  SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION,
  SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE,
  TRANSITION_STATUS,
  TRANSITION_COMPATIBILITY_MODE,
  createSustainedGuitarTransitionModel,
} = require('./sustainedGuitarTransitionModel');

const SUSTAINED_POLYPHONIC_PATH_SELECTION_VERSION = '1.0.0';
const SUSTAINED_POLYPHONIC_PATH_SELECTION_DOCUMENT_TYPE = 'SustainedPolyphonicPathSelection';
const SUSTAINED_POLYPHONIC_PATH_SELECTION_POLICY = 'SUSTAINED_PHYSICAL_PATH_LEXICOGRAPHIC_1.0';
const SUSTAINED_POLYPHONIC_PATH_TRANSITION_POLICY = 'HOLD_STRING_FRET_STABLE_THEN_MIN_FINGER_SUBSTITUTION_1.0';
const SUSTAINED_POLYPHONIC_PATH_FINGER_SUBSTITUTION_POLICY = 'ALLOW_HELD_FINGER_SUBSTITUTION_MIN_COUNT_1.0';
const SUSTAINED_POLYPHONIC_PATH_SELECTION_AUTHORITY = 'DETERMINISTIC_SUSTAINED_PATH_FACTS_ONLY';
const MAX_SUSTAINED_PATH_CANDIDATES_PER_POINT = MAX_SUSTAINED_PHYSICAL_STATE_CANDIDATES;
const MAX_SUSTAINED_PATH_STATES = 400_000;

class SustainedPolyphonicPathSelectionError extends EngineError {
  constructor(message, code = 'INVALID_SUSTAINED_POLYPHONIC_PATH_SELECTION', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'SustainedPolyphonicPathSelectionError');
  }
}

function invalid(message, details = {}) {
  return new SustainedPolyphonicPathSelectionError(
    message,
    'INVALID_SUSTAINED_POLYPHONIC_PATH_SELECTION',
    details,
  );
}

function unsupported(message, reason, details = {}) {
  return new SustainedPolyphonicPathSelectionError(
    message,
    'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION',
    { reason, ...details },
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function safeAdd(left, right, field) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw invalid('Sustained path cost exceeded the safe-integer range.', { field });
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

function anchorFret(positions) {
  const fretted = positions.filter((position) => position.fret > 0).map((position) => position.fret);
  return fretted.length === 0 ? 0 : Math.min(...fretted);
}

function localCost(candidate) {
  const frets = candidate.positions.map((position) => position.fret);
  const strings = candidate.positions.map((position) => position.string);
  const verdict = candidate.physicalValidation;
  return Object.freeze([
    verdict.fretSpan,
    verdict.usedFingerCount,
    verdict.barreCount,
    frets.length === 0 ? 0 : Math.max(...frets),
    frets.reduce((sum, fret) => safeAdd(sum, fret, 'fretSum'), 0),
    strings.reduce((sum, string) => safeAdd(sum, string, 'stringSum'), 0),
  ]);
}

function candidateSignature(candidate) {
  const assignments = candidate.fingerAssignments.map((assignment) => (
    `${assignment.logicalNoteId}:${assignment.targetMidi}:${assignment.string}:${assignment.fret}:${assignment.finger}`
  )).join(';');
  const barres = candidate.barres.map((barre) => (
    `${barre.finger}:${barre.fret}:${barre.startString}:${barre.endString}:${barre.kind}`
  )).join(';');
  return `${candidate.positionStateCandidateId || 'empty'}|${assignments}|${barres}`;
}

function positionStateIdForCandidate(point, candidate) {
  if (
    typeof candidate.positionStateCandidateId === 'string'
    && candidate.positionStateCandidateId.length > 0
  ) {
    return candidate.positionStateCandidateId;
  }
  if (
    point.status === SUSTAINED_PHYSICAL_POINT_STATUS.EMPTY_SONORITY
    && candidate.positionStateCandidateId === null
    && candidate.positions.length === 0
  ) {
    return `${point.sonorityPointId}:empty-state`;
  }
  throw invalid('Physical candidate is missing exact PS-4A position-state provenance.', {
    sonorityPointId: point.sonorityPointId,
    physicalStateCandidateId: candidate.physicalStateCandidateId,
  });
}

function flattenPhysicalPoints(model) {
  const points = [];
  for (const measure of model.measures) {
    for (const point of measure.points) {
      points.push(Object.freeze({
        measureId: measure.measureId,
        measureIndex: measure.index,
        ...point,
      }));
    }
  }
  return Object.freeze(points);
}

function validateModelHeaders(source, physical, transitions) {
  if (
    physical.documentType !== SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE
    || physical.contractVersion !== SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION
    || physical.source.partId !== source.source.partId
  ) {
    throw invalid('PS-5 received an inconsistent PS-4C physical-state model.');
  }
  if (
    transitions.documentType !== SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE
    || transitions.contractVersion !== SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION
    || transitions.source.partId !== source.source.partId
  ) {
    throw invalid('PS-5 received an inconsistent PS-4B transition model.');
  }
}

function buildPointCandidates(point, runtime, pointIndex) {
  if (point.status === SUSTAINED_PHYSICAL_POINT_STATUS.UNPLAYABLE_EXACT) {
    throw unsupported(
      'Exact sustained sonority has no physically playable static left-hand state.',
      'UNPLAYABLE_PHYSICAL_POINT',
      {
        sonorityPointId: point.sonorityPointId,
        measureIndex: point.measureIndex,
        timeDivisions: point.timeDivisions,
        physicalReason: point.reason,
      },
    );
  }
  if (!Array.isArray(point.physicalCandidates) || point.physicalCandidates.length === 0) {
    throw invalid('Playable PS-4C point must expose at least one physical candidate.', {
      sonorityPointId: point.sonorityPointId,
      status: point.status,
    });
  }
  if (point.physicalCandidates.length > MAX_SUSTAINED_PATH_CANDIDATES_PER_POINT) {
    throw unsupported(
      'Sustained path candidate count exceeds the fixed per-point boundary.',
      'SUSTAINED_PATH_CANDIDATE_LIMIT_EXCEEDED',
      {
        sonorityPointId: point.sonorityPointId,
        limit: MAX_SUSTAINED_PATH_CANDIDATES_PER_POINT,
        observed: point.physicalCandidates.length,
      },
    );
  }

  const candidates = point.physicalCandidates.map((physical, candidateIndex) => {
    checkpoint(runtime, 'sustained-polyphonic-path:point-candidate', {
      pointIndex,
      candidateIndex,
    });
    return Object.freeze({
      physical,
      positionStateCandidateId: positionStateIdForCandidate(point, physical),
      anchorFret: anchorFret(physical.positions),
      localCost: localCost(physical),
      signature: candidateSignature(physical),
    });
  });
  candidates.sort((left, right) => {
    const numeric = compareNumberArrays(left.localCost, right.localCost);
    return numeric !== 0 ? numeric : left.signature.localeCompare(right.signature);
  });
  return Object.freeze(candidates);
}

function initialCost(candidate) {
  return Object.freeze([
    0,
    0,
    candidate.localCost[0],
    candidate.localCost[1],
    candidate.localCost[2],
    candidate.localCost[3],
    candidate.localCost[4],
    candidate.localCost[5],
  ]);
}

function extendCost(previousCost, candidate, previousAnchor, heldFingerSubstitutionCount) {
  return Object.freeze([
    safeAdd(previousCost[0], heldFingerSubstitutionCount, 'heldFingerSubstitutionCount'),
    safeAdd(previousCost[1], Math.abs(candidate.anchorFret - previousAnchor), 'transitionFretDistance'),
    safeAdd(previousCost[2], candidate.localCost[0], 'totalFretSpan'),
    safeAdd(previousCost[3], candidate.localCost[1], 'totalUsedFingerCount'),
    safeAdd(previousCost[4], candidate.localCost[2], 'totalBarreCount'),
    safeAdd(previousCost[5], candidate.localCost[3], 'totalMaximumFret'),
    safeAdd(previousCost[6], candidate.localCost[4], 'totalFretSum'),
    safeAdd(previousCost[7], candidate.localCost[5], 'totalStringSum'),
  ]);
}

function bestByAnchor(states) {
  const byAnchor = new Map();
  for (const state of states) {
    const anchor = state.candidate.anchorFret;
    const incumbent = byAnchor.get(anchor);
    if (!incumbent || compareStates(state, incumbent) < 0) byAnchor.set(anchor, state);
  }
  return byAnchor;
}

function heldAssignmentMap(candidate, holdLogicalNoteIds, point, side) {
  const byLogicalNoteId = new Map();
  for (const logicalNoteId of holdLogicalNoteIds) {
    const matches = candidate.physical.fingerAssignments.filter(
      (assignment) => assignment.logicalNoteId === logicalNoteId,
    );
    if (matches.length !== 1) {
      throw invalid('Held logical note must have exactly one physical finger assignment.', {
        sonorityPointId: point.sonorityPointId,
        physicalStateCandidateId: candidate.physical.physicalStateCandidateId,
        logicalNoteId,
        side,
        observed: matches.length,
      });
    }
    byLogicalNoteId.set(logicalNoteId, matches[0]);
  }
  return byLogicalNoteId;
}

function heldFingerSignature(assignments, holdLogicalNoteIds) {
  return holdLogicalNoteIds.map((logicalNoteId) => {
    const assignment = assignments.get(logicalNoteId);
    return `${logicalNoteId}@${assignment.string}:${assignment.fret}:f${assignment.finger}`;
  }).join('|');
}

function countHeldFingerSubstitutions(previousAssignments, currentAssignments, holdLogicalNoteIds) {
  let substitutions = 0;
  for (const logicalNoteId of holdLogicalNoteIds) {
    const previous = previousAssignments.get(logicalNoteId);
    const current = currentAssignments.get(logicalNoteId);
    if (!previous || !current) {
      throw invalid('Held logical-note assignment disappeared from a prepared transition.', {
        logicalNoteId,
      });
    }
    if (previous.string !== current.string || previous.fret !== current.fret) {
      throw invalid('PS-5 received a PS-4B hold bucket that changed exact string/fret placement.', {
        logicalNoteId,
        previousString: previous.string,
        previousFret: previous.fret,
        currentString: current.string,
        currentFret: current.fret,
      });
    }
    if (previous.finger !== current.finger) substitutions += 1;
  }
  return substitutions;
}

function prepareHoldTransition(transition, previousStates, previousPoint, currentPoint) {
  const previousBucketByPositionId = new Map();
  const currentBucketByPositionId = new Map();

  for (let bucketIndex = 0; bucketIndex < transition.buckets.length; bucketIndex += 1) {
    const bucket = transition.buckets[bucketIndex];
    for (const positionStateCandidateId of bucket.previousStateCandidateIds) {
      if (previousBucketByPositionId.has(positionStateCandidateId)) {
        throw invalid('PS-4B previous position state appeared in more than one hold bucket.', {
          transitionId: transition.transitionId,
          positionStateCandidateId,
        });
      }
      previousBucketByPositionId.set(positionStateCandidateId, bucketIndex);
    }
    for (const positionStateCandidateId of bucket.currentStateCandidateIds) {
      if (currentBucketByPositionId.has(positionStateCandidateId)) {
        throw invalid('PS-4B current position state appeared in more than one hold bucket.', {
          transitionId: transition.transitionId,
          positionStateCandidateId,
        });
      }
      currentBucketByPositionId.set(positionStateCandidateId, bucketIndex);
    }
  }

  const groupsByBucket = new Map();
  for (const state of previousStates) {
    const bucketIndex = previousBucketByPositionId.get(state.candidate.positionStateCandidateId);
    if (bucketIndex === undefined) continue;
    const assignments = heldAssignmentMap(
      state.candidate,
      transition.holdLogicalNoteIds,
      previousPoint,
      'previous',
    );
    const signature = heldFingerSignature(assignments, transition.holdLogicalNoteIds);
    let groups = groupsByBucket.get(bucketIndex);
    if (!groups) {
      groups = new Map();
      groupsByBucket.set(bucketIndex, groups);
    }
    let group = groups.get(signature);
    if (!group) {
      group = {
        assignments,
        byAnchor: new Map(),
      };
      groups.set(signature, group);
    }
    const anchor = state.candidate.anchorFret;
    const incumbent = group.byAnchor.get(anchor);
    if (!incumbent || compareStates(state, incumbent) < 0) group.byAnchor.set(anchor, state);
  }

  return Object.freeze({
    currentBucketByPositionId,
    groupsByBucket,
    previousPoint,
    currentPoint,
  });
}

function candidatePreviousGroups(candidate, transition, prepared) {
  if (transition.compatibilityMode === TRANSITION_COMPATIBILITY_MODE.ALL_TO_ALL) {
    return Object.freeze([Object.freeze({ assignments: null, byAnchor: prepared })]);
  }
  if (transition.compatibilityMode !== TRANSITION_COMPATIBILITY_MODE.HOLD_SIGNATURE_BUCKETS) {
    return Object.freeze([]);
  }
  const bucketIndex = prepared.currentBucketByPositionId.get(candidate.positionStateCandidateId);
  if (bucketIndex === undefined) return Object.freeze([]);
  const groups = prepared.groupsByBucket.get(bucketIndex);
  return groups ? Object.freeze([...groups.values()]) : Object.freeze([]);
}

function bestExtension(candidate, previousGroups, transition, currentPoint) {
  if (!previousGroups || previousGroups.length === 0) return null;
  const currentAssignments = transition.holdLogicalNoteIds.length === 0
    ? null
    : heldAssignmentMap(candidate, transition.holdLogicalNoteIds, currentPoint, 'current');
  let best = null;

  for (const group of previousGroups) {
    const substitutionCount = currentAssignments === null
      ? 0
      : countHeldFingerSubstitutions(
        group.assignments,
        currentAssignments,
        transition.holdLogicalNoteIds,
      );
    for (const [anchor, previous] of group.byAnchor) {
      const cost = extendCost(previous.cost, candidate, anchor, substitutionCount);
      if (
        !best
        || compareNumberArrays(cost, best.cost) < 0
        || (
          compareNumberArrays(cost, best.cost) === 0
          && previous.tieRank < best.previousTieRank
        )
      ) {
        best = {
          candidate,
          previous,
          cost,
          previousTieRank: previous.tieRank,
        };
      }
    }
  }
  return best;
}

function assignTieRanks(states) {
  const ordered = states.slice().sort((left, right) => (
    left.previousTieRank - right.previousTieRank
    || left.candidateRank - right.candidateRank
  ));
  for (let rank = 0; rank < ordered.length; rank += 1) {
    ordered[rank].tieRank = rank;
  }
}

function assertTransitionAlignment(transition, previousPoint, currentPoint, transitionIndex) {
  if (
    transition.transitionIndex !== transitionIndex
    || transition.from.sonorityPointId !== previousPoint.sonorityPointId
    || transition.to.sonorityPointId !== currentPoint.sonorityPointId
  ) {
    throw invalid('PS-4B transition endpoints diverged from PS-4C physical point order.', {
      transitionIndex,
      transitionId: transition.transitionId,
      expectedFrom: previousPoint.sonorityPointId,
      observedFrom: transition.from.sonorityPointId,
      expectedTo: currentPoint.sonorityPointId,
      observedTo: transition.to.sonorityPointId,
    });
  }
}

function selectPath(points, pointCandidates, transitions, runtime) {
  let states = pointCandidates[0].map((candidate, candidateRank) => Object.freeze({
    candidate,
    previous: null,
    cost: initialCost(candidate),
    tieRank: candidateRank,
  }));

  for (let pointIndex = 1; pointIndex < pointCandidates.length; pointIndex += 1) {
    checkpoint(runtime, 'sustained-polyphonic-path:path-point', { pointIndex });
    const transitionIndex = pointIndex - 1;
    const transition = transitions[transitionIndex];
    const previousPoint = points[pointIndex - 1];
    const currentPoint = points[pointIndex];
    if (!transition) {
      throw invalid('PS-5 lost an expected PS-4B transition.', { transitionIndex });
    }
    assertTransitionAlignment(transition, previousPoint, currentPoint, transitionIndex);
    if (transition.status !== TRANSITION_STATUS.COMPATIBLE) {
      throw unsupported(
        'No exact hold-preserving transition exists between adjacent sustained sonorities.',
        'UNPLAYABLE_SUSTAINED_TRANSITION',
        {
          transitionId: transition.transitionId,
          transitionReason: transition.reason,
          fromSonorityPointId: previousPoint.sonorityPointId,
          toSonorityPointId: currentPoint.sonorityPointId,
        },
      );
    }

    let prepared;
    if (transition.compatibilityMode === TRANSITION_COMPATIBILITY_MODE.ALL_TO_ALL) {
      if (transition.holdLogicalNoteIds.length !== 0) {
        throw invalid('ALL_TO_ALL transition cannot carry held logical-note identities.', {
          transitionId: transition.transitionId,
        });
      }
      prepared = bestByAnchor(states);
    } else if (transition.compatibilityMode === TRANSITION_COMPATIBILITY_MODE.HOLD_SIGNATURE_BUCKETS) {
      if (transition.holdLogicalNoteIds.length === 0) {
        throw invalid('Hold-bucket transition requires held logical-note identities.', {
          transitionId: transition.transitionId,
        });
      }
      prepared = prepareHoldTransition(transition, states, previousPoint, currentPoint);
    } else {
      throw unsupported(
        'Sustained transition exposes no compatible deterministic path mode.',
        'UNPLAYABLE_SUSTAINED_TRANSITION',
        { transitionId: transition.transitionId, compatibilityMode: transition.compatibilityMode },
      );
    }

    const drafts = [];
    for (let candidateRank = 0; candidateRank < pointCandidates[pointIndex].length; candidateRank += 1) {
      checkpoint(runtime, 'sustained-polyphonic-path:path-candidate', { pointIndex, candidateRank });
      const candidate = pointCandidates[pointIndex][candidateRank];
      const previousGroups = candidatePreviousGroups(candidate, transition, prepared);
      const best = bestExtension(candidate, previousGroups, transition, currentPoint);
      if (!best) continue;
      drafts.push({
        candidate,
        previous: best.previous,
        cost: best.cost,
        previousTieRank: best.previousTieRank,
        candidateRank,
        tieRank: 0,
      });
    }

    if (drafts.length === 0) {
      throw unsupported(
        'No deterministic physical path preserves held string/fret continuity.',
        'NO_HOLD_PRESERVING_PHYSICAL_PATH',
        {
          transitionId: transition.transitionId,
          holdLogicalNoteIds: transition.holdLogicalNoteIds,
        },
      );
    }
    assignTieRanks(drafts);
    states = drafts.map((state) => Object.freeze({
      candidate: state.candidate,
      previous: state.previous,
      cost: state.cost,
      tieRank: state.tieRank,
    }));
  }

  states.sort(compareStates);
  const best = states[0];
  const selected = new Array(pointCandidates.length);
  let cursor = best;
  for (let pointIndex = selected.length - 1; pointIndex >= 0; pointIndex -= 1) {
    selected[pointIndex] = cursor.candidate;
    cursor = cursor.previous;
  }
  return Object.freeze({ selected: Object.freeze(selected), cost: best.cost });
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

function buildSelectedFacts(points, path) {
  const selectedPointStates = [];
  const logical = new Map();

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex];
    const selected = path.selected[pointIndex].physical;
    const positions = Object.freeze(selected.positions.map((position) => Object.freeze({ ...position })));
    const fingerAssignments = Object.freeze(selected.fingerAssignments.map((assignment) => Object.freeze({ ...assignment })));
    selectedPointStates.push(Object.freeze({
      sonorityPointId: point.sonorityPointId,
      measureId: point.measureId,
      measureIndex: point.measureIndex,
      timeDivisions: point.timeDivisions,
      attackLogicalNoteIds: point.attackLogicalNoteIds,
      holdLogicalNoteIds: point.holdLogicalNoteIds,
      releaseLogicalNoteIds: point.releaseLogicalNoteIds,
      physicalStateCandidateId: selected.physicalStateCandidateId,
      positionStateCandidateId: path.selected[pointIndex].positionStateCandidateId,
      positions,
      fingerAssignments,
      barres: copyBarres(selected.barres),
      physicalValidation: selected.physicalValidation,
    }));

    for (const assignment of fingerAssignments) {
      let record = logical.get(assignment.logicalNoteId);
      if (!record) {
        record = {
          logicalNoteId: assignment.logicalNoteId,
          sustainChainId: assignment.sustainChainId,
          voice: assignment.voice,
          staff: assignment.staff,
          targetMidi: assignment.targetMidi,
          string: assignment.string,
          fret: assignment.fret,
          initialFinger: assignment.finger,
          finalFinger: assignment.finger,
          sourceEventIds: new Set(),
          fingerSubstitutions: [],
        };
        logical.set(assignment.logicalNoteId, record);
      } else {
        if (
          record.sustainChainId !== assignment.sustainChainId
          || record.voice !== assignment.voice
          || record.staff !== assignment.staff
          || record.targetMidi !== assignment.targetMidi
          || record.string !== assignment.string
          || record.fret !== assignment.fret
        ) {
          throw invalid('Selected path changed exact string/fret placement for one active logical note.', {
            logicalNoteId: assignment.logicalNoteId,
            sonorityPointId: point.sonorityPointId,
          });
        }
        if (record.finalFinger !== assignment.finger) {
          record.fingerSubstitutions.push(Object.freeze({
            pointIndex,
            sonorityPointId: point.sonorityPointId,
            measureIndex: point.measureIndex,
            timeDivisions: point.timeDivisions,
            fromFinger: record.finalFinger,
            toFinger: assignment.finger,
          }));
          record.finalFinger = assignment.finger;
        }
      }
      record.sourceEventIds.add(assignment.sourceEventId);
    }
  }

  const logicalNoteSelections = [...logical.values()]
    .sort((left, right) => left.logicalNoteId.localeCompare(right.logicalNoteId))
    .map((record) => Object.freeze({
      logicalNoteId: record.logicalNoteId,
      sustainChainId: record.sustainChainId,
      voice: record.voice,
      staff: record.staff,
      targetMidi: record.targetMidi,
      string: record.string,
      fret: record.fret,
      initialFinger: record.initialFinger,
      finalFinger: record.finalFinger,
      fingerSubstitutionCount: record.fingerSubstitutions.length,
      fingerSubstitutions: Object.freeze(record.fingerSubstitutions.slice()),
      sourceEventIds: Object.freeze([...record.sourceEventIds].sort()),
    }));

  return Object.freeze({
    selectedPointStates: Object.freeze(selectedPointStates),
    logicalNoteSelections: Object.freeze(logicalNoteSelections),
  });
}

function createSustainedPolyphonicPathSelection(sourceModel, runtime = null, guitarOptions = {}) {
  checkpoint(runtime, 'sustained-polyphonic-path:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const physical = createSustainedLeftHandPhysicalStateModel(source, runtime, guitarOptions);
  const transitions = createSustainedGuitarTransitionModel(source, runtime, guitarOptions);
  validateModelHeaders(source, physical, transitions);
  const points = flattenPhysicalPoints(physical);

  if (points.length === 0) {
    throw unsupported('Sustained path selection requires at least one sonority point.', 'NO_SONORITY_POINTS');
  }
  if (transitions.transitionCount !== Math.max(0, points.length - 1)) {
    throw invalid('PS-4B transition count diverged from PS-4C physical point count.', {
      pointCount: points.length,
      transitionCount: transitions.transitionCount,
    });
  }

  let observedPathStates = 0;
  const pointCandidates = points.map((point, pointIndex) => {
    checkpoint(runtime, 'sustained-polyphonic-path:point', { pointIndex });
    const candidates = buildPointCandidates(point, runtime, pointIndex);
    observedPathStates = safeAdd(observedPathStates, candidates.length, 'pathStateCount');
    if (observedPathStates > MAX_SUSTAINED_PATH_STATES) {
      throw unsupported(
        'Sustained path state count exceeds the fixed aggregate boundary.',
        'SUSTAINED_PATH_STATE_LIMIT_EXCEEDED',
        { limit: MAX_SUSTAINED_PATH_STATES, observed: observedPathStates },
      );
    }
    return candidates;
  });

  const path = selectPath(points, pointCandidates, transitions.transitions, runtime);
  const facts = buildSelectedFacts(points, path);

  checkpoint(runtime, 'sustained-polyphonic-path:complete', {
    pointCount: points.length,
    pathStateCount: observedPathStates,
    selectedLogicalNoteCount: facts.logicalNoteSelections.length,
  });

  return Object.freeze({
    documentType: SUSTAINED_POLYPHONIC_PATH_SELECTION_DOCUMENT_TYPE,
    contractVersion: SUSTAINED_POLYPHONIC_PATH_SELECTION_VERSION,
    policy: SUSTAINED_POLYPHONIC_PATH_SELECTION_POLICY,
    transitionPolicy: SUSTAINED_POLYPHONIC_PATH_TRANSITION_POLICY,
    fingerSubstitutionPolicy: SUSTAINED_POLYPHONIC_PATH_FINGER_SUBSTITUTION_POLICY,
    authority: SUSTAINED_POLYPHONIC_PATH_SELECTION_AUTHORITY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    physicalStates: Object.freeze({
      documentType: SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE,
      contractVersion: SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION,
    }),
    transitions: Object.freeze({
      documentType: SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE,
      contractVersion: SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION,
    }),
    pointCount: points.length,
    pathStateCount: observedPathStates,
    selectedLogicalNoteCount: facts.logicalNoteSelections.length,
    pathCost: Object.freeze({
      heldFingerSubstitutionCount: path.cost[0],
      transitionFretDistance: path.cost[1],
      totalFretSpan: path.cost[2],
      totalUsedFingerCount: path.cost[3],
      totalBarreCount: path.cost[4],
      totalMaximumFret: path.cost[5],
      totalFretSum: path.cost[6],
      totalStringSum: path.cost[7],
    }),
    selectedPointStates: facts.selectedPointStates,
    logicalNoteSelections: facts.logicalNoteSelections,
  });
}

module.exports = {
  SUSTAINED_POLYPHONIC_PATH_SELECTION_VERSION,
  SUSTAINED_POLYPHONIC_PATH_SELECTION_DOCUMENT_TYPE,
  SUSTAINED_POLYPHONIC_PATH_SELECTION_POLICY,
  SUSTAINED_POLYPHONIC_PATH_TRANSITION_POLICY,
  SUSTAINED_POLYPHONIC_PATH_FINGER_SUBSTITUTION_POLICY,
  SUSTAINED_POLYPHONIC_PATH_SELECTION_AUTHORITY,
  MAX_SUSTAINED_PATH_CANDIDATES_PER_POINT,
  MAX_SUSTAINED_PATH_STATES,
  SustainedPolyphonicPathSelectionError,
  createSustainedPolyphonicPathSelection,
};