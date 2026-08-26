'use strict';

const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION,
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE,
  SUSTAINED_POSITION_POINT_STATUS,
  createSustainedGuitarPositionStateModel,
} = require('./sustainedGuitarPositionStateModel');

const SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION = '1.0.0';
const SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE = 'SustainedGuitarTransitionModel';
const SUSTAINED_GUITAR_TRANSITION_MODEL_AUTHORITY = 'HOLD_CONTINUITY_FACTS_ONLY';
const MAX_TRANSITION_COMPATIBILITY_PAIRS = 10_000_000;
const MAX_AGGREGATE_COMPATIBILITY_PAIRS = 40_000_000;

const TRANSITION_STATUS = Object.freeze({
  COMPATIBLE: 'COMPATIBLE',
  UNPLAYABLE_EXACT: 'UNPLAYABLE_EXACT',
});

const TRANSITION_COMPATIBILITY_MODE = Object.freeze({
  ALL_TO_ALL: 'ALL_TO_ALL',
  HOLD_SIGNATURE_BUCKETS: 'HOLD_SIGNATURE_BUCKETS',
  NONE: 'NONE',
});

class SustainedGuitarTransitionModelError extends EngineError {
  constructor(message, code = 'INVALID_SUSTAINED_GUITAR_TRANSITION_MODEL', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'SustainedGuitarTransitionModelError');
  }
}

function invalid(message, details = {}) {
  return new SustainedGuitarTransitionModelError(
    message,
    'INVALID_SUSTAINED_GUITAR_TRANSITION_MODEL',
    details,
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function safeMultiply(left, right, details = {}) {
  const value = left * right;
  if (!Number.isSafeInteger(value)) {
    throw invalid('Transition compatibility count exceeded the safe-integer range.', details);
  }
  return value;
}

function safeAdd(left, right, details = {}) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw invalid('Aggregate transition compatibility count exceeded the safe-integer range.', details);
  }
  return value;
}

function flattenPoints(positionModel) {
  const points = [];
  for (const measure of positionModel.measures) {
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

function stateRecords(point) {
  if (point.status === SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE) {
    return point.candidates.map((candidate) => Object.freeze({
      stateCandidateId: candidate.stateCandidateId,
      positions: candidate.positions,
    }));
  }
  if (point.status === SUSTAINED_POSITION_POINT_STATUS.EMPTY_SONORITY) {
    return [Object.freeze({
      stateCandidateId: `${point.sonorityPointId}:empty-state`,
      positions: Object.freeze([]),
    })];
  }
  if (point.status === SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT) return [];
  throw invalid('PS-4B encountered an unknown PS-4A point status.', {
    sonorityPointId: point.sonorityPointId,
    status: point.status,
  });
}

function positionByLogicalId(state, logicalNoteId, point, side) {
  const matches = state.positions.filter((position) => position.logicalNoteId === logicalNoteId);
  if (matches.length !== 1) {
    throw invalid('Hold identity must occur exactly once in each compatible endpoint state.', {
      sonorityPointId: point.sonorityPointId,
      stateCandidateId: state.stateCandidateId,
      logicalNoteId,
      side,
      observed: matches.length,
    });
  }
  return matches[0];
}

function holdSignature(state, holdLogicalNoteIds, point, side) {
  return holdLogicalNoteIds.map((logicalNoteId) => {
    const position = positionByLogicalId(state, logicalNoteId, point, side);
    return `${logicalNoteId}@${position.string}:${position.fret}`;
  }).join('|');
}

function groupByHoldSignature(states, holdLogicalNoteIds, point, side, runtime, transitionIndex) {
  const bySignature = new Map();
  for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
    checkpoint(runtime, 'sustained-guitar-transition:state-signature', {
      transitionIndex,
      side,
      stateIndex,
    });
    const state = states[stateIndex];
    const signature = holdSignature(state, holdLogicalNoteIds, point, side);
    let ids = bySignature.get(signature);
    if (!ids) {
      ids = [];
      bySignature.set(signature, ids);
    }
    ids.push(state.stateCandidateId);
  }
  return bySignature;
}

function ensureHoldWasPreviouslyActive(previousStates, holdLogicalNoteIds, previousPoint) {
  if (holdLogicalNoteIds.length === 0 || previousStates.length === 0) return;
  const representative = previousStates[0];
  for (const logicalNoteId of holdLogicalNoteIds) {
    positionByLogicalId(representative, logicalNoteId, previousPoint, 'previous');
  }
}

function enforcePairBudget(pairCount, aggregateCounter, transitionIndex) {
  if (pairCount > MAX_TRANSITION_COMPATIBILITY_PAIRS) {
    throw new SustainedGuitarTransitionModelError(
      'PS-4B potential compatibility pairs exceed the fixed per-transition boundary.',
      'SUSTAINED_TRANSITION_PAIR_LIMIT_EXCEEDED',
      {
        transitionIndex,
        limit: MAX_TRANSITION_COMPATIBILITY_PAIRS,
        observed: pairCount,
      },
    );
  }
  const aggregate = safeAdd(aggregateCounter.count, pairCount, { transitionIndex });
  if (aggregate > MAX_AGGREGATE_COMPATIBILITY_PAIRS) {
    throw new SustainedGuitarTransitionModelError(
      'PS-4B aggregate compatibility pairs exceed the fixed model boundary.',
      'SUSTAINED_TRANSITION_TOTAL_PAIR_LIMIT_EXCEEDED',
      {
        transitionIndex,
        limit: MAX_AGGREGATE_COMPATIBILITY_PAIRS,
        observed: aggregate,
      },
    );
  }
  aggregateCounter.count = aggregate;
}

function createTransition(previousPoint, currentPoint, runtime, transitionIndex, aggregateCounter) {
  checkpoint(runtime, 'sustained-guitar-transition:transition', { transitionIndex });
  const previousStates = stateRecords(previousPoint);
  const currentStates = stateRecords(currentPoint);
  const holdLogicalNoteIds = Object.freeze([...currentPoint.holdLogicalNoteIds].sort());
  const base = {
    transitionId: `sustained-transition:${transitionIndex}`,
    transitionIndex,
    from: Object.freeze({
      sonorityPointId: previousPoint.sonorityPointId,
      measureIndex: previousPoint.measureIndex,
      timeDivisions: previousPoint.timeDivisions,
      stateCount: previousStates.length,
    }),
    to: Object.freeze({
      sonorityPointId: currentPoint.sonorityPointId,
      measureIndex: currentPoint.measureIndex,
      timeDivisions: currentPoint.timeDivisions,
      stateCount: currentStates.length,
    }),
    holdLogicalNoteIds,
  };

  if (previousStates.length === 0 || currentStates.length === 0) {
    return Object.freeze({
      ...base,
      status: TRANSITION_STATUS.UNPLAYABLE_EXACT,
      reason: 'UNPLAYABLE_ENDPOINT',
      compatibilityMode: TRANSITION_COMPATIBILITY_MODE.NONE,
      potentialPairCount: 0,
      buckets: Object.freeze([]),
    });
  }

  ensureHoldWasPreviouslyActive(previousStates, holdLogicalNoteIds, previousPoint);

  if (holdLogicalNoteIds.length === 0) {
    const pairCount = safeMultiply(previousStates.length, currentStates.length, { transitionIndex });
    enforcePairBudget(pairCount, aggregateCounter, transitionIndex);
    return Object.freeze({
      ...base,
      status: TRANSITION_STATUS.COMPATIBLE,
      reason: null,
      compatibilityMode: TRANSITION_COMPATIBILITY_MODE.ALL_TO_ALL,
      potentialPairCount: pairCount,
      buckets: Object.freeze([]),
    });
  }

  const previousBySignature = groupByHoldSignature(
    previousStates,
    holdLogicalNoteIds,
    previousPoint,
    'previous',
    runtime,
    transitionIndex,
  );
  const currentBySignature = groupByHoldSignature(
    currentStates,
    holdLogicalNoteIds,
    currentPoint,
    'current',
    runtime,
    transitionIndex,
  );

  const signatures = [...currentBySignature.keys()]
    .filter((signature) => previousBySignature.has(signature))
    .sort();
  const buckets = [];
  let pairCount = 0;
  for (let bucketIndex = 0; bucketIndex < signatures.length; bucketIndex += 1) {
    checkpoint(runtime, 'sustained-guitar-transition:bucket', { transitionIndex, bucketIndex });
    const signature = signatures[bucketIndex];
    const previousStateCandidateIds = Object.freeze([...previousBySignature.get(signature)].sort());
    const currentStateCandidateIds = Object.freeze([...currentBySignature.get(signature)].sort());
    const bucketPairCount = safeMultiply(
      previousStateCandidateIds.length,
      currentStateCandidateIds.length,
      { transitionIndex, bucketIndex },
    );
    pairCount = safeAdd(pairCount, bucketPairCount, { transitionIndex, bucketIndex });
    buckets.push(Object.freeze({
      holdSignature: signature,
      previousStateCandidateIds,
      currentStateCandidateIds,
      potentialPairCount: bucketPairCount,
    }));
  }

  if (buckets.length === 0) {
    return Object.freeze({
      ...base,
      status: TRANSITION_STATUS.UNPLAYABLE_EXACT,
      reason: 'NO_HOLD_PRESERVING_TRANSITION',
      compatibilityMode: TRANSITION_COMPATIBILITY_MODE.NONE,
      potentialPairCount: 0,
      buckets: Object.freeze([]),
    });
  }

  enforcePairBudget(pairCount, aggregateCounter, transitionIndex);
  return Object.freeze({
    ...base,
    status: TRANSITION_STATUS.COMPATIBLE,
    reason: null,
    compatibilityMode: TRANSITION_COMPATIBILITY_MODE.HOLD_SIGNATURE_BUCKETS,
    potentialPairCount: pairCount,
    buckets: Object.freeze(buckets),
  });
}

function createSustainedGuitarTransitionModel(sourceModel, runtime = null) {
  checkpoint(runtime, 'sustained-guitar-transition:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const positions = createSustainedGuitarPositionStateModel(source, runtime);
  const points = flattenPoints(positions);
  const transitions = [];
  const aggregateCounter = { count: 0 };
  let unplayableTransitionCount = 0;

  for (let transitionIndex = 0; transitionIndex < Math.max(0, points.length - 1); transitionIndex += 1) {
    const transition = createTransition(
      points[transitionIndex],
      points[transitionIndex + 1],
      runtime,
      transitionIndex,
      aggregateCounter,
    );
    if (transition.status === TRANSITION_STATUS.UNPLAYABLE_EXACT) {
      unplayableTransitionCount += 1;
    }
    transitions.push(transition);
  }

  const result = Object.freeze({
    documentType: SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE,
    contractVersion: SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION,
    authority: SUSTAINED_GUITAR_TRANSITION_MODEL_AUTHORITY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    positionStates: Object.freeze({
      documentType: SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE,
      contractVersion: SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION,
    }),
    pointCount: points.length,
    transitionCount: transitions.length,
    unplayableTransitionCount,
    potentialCompatibilityPairCount: aggregateCounter.count,
    transitions: Object.freeze(transitions),
  });
  checkpoint(runtime, 'sustained-guitar-transition:complete', {
    transitionCount: result.transitionCount,
    unplayableTransitionCount,
    potentialCompatibilityPairCount: result.potentialCompatibilityPairCount,
  });
  return result;
}

module.exports = {
  SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION,
  SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE,
  SUSTAINED_GUITAR_TRANSITION_MODEL_AUTHORITY,
  TRANSITION_STATUS,
  TRANSITION_COMPATIBILITY_MODE,
  MAX_TRANSITION_COMPATIBILITY_PAIRS,
  MAX_AGGREGATE_COMPATIBILITY_PAIRS,
  SustainedGuitarTransitionModelError,
  createSustainedGuitarTransitionModel,
};
