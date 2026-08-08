'use strict';

const { EngineError } = require('../errors/engineError');
const { GUITAR_CONFIGURATION_VERSION } = require('../guitar/tuning');
const {
  CANONICAL_FINGERING_CANDIDATES_VERSION,
} = require('./candidateLayerBuilder');
const {
  FINGERING_OPTIMIZER_VERSION,
} = require('./fingeringOptimizer');

const OPTIMIZER_OBSERVATION_VERSION = '1.0.0';
const MAX_OBSERVED_METADATA_DEPTH = 100;
const POSITION_COST_BREAKDOWN_FIELDS = Object.freeze([
  'highFretDistance',
  'highFretCost',
  'openStringPreferenceCost',
]);
const TRANSITION_COST_BREAKDOWN_FIELDS = Object.freeze([
  'fretMovement',
  'fretMovementCost',
  'stringMovement',
  'stringMovementCost',
  'largeShiftDistance',
  'largeShiftCost',
  'highFretDistance',
  'highFretCost',
  'openStringPreferenceCost',
  'samePositionPreferenceCost',
]);

class OptimizerObservationError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_OPTIMIZER_OBSERVATION_INPUT',
      details,
      'OptimizerObservationError',
    );
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clonePlainData(value, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (depth > MAX_OBSERVED_METADATA_DEPTH) {
    throw new OptimizerObservationError(
      `Observed metadata must not exceed ${MAX_OBSERVED_METADATA_DEPTH} levels of nesting.`,
      { maximumDepth: MAX_OBSERVED_METADATA_DEPTH },
    );
  }
  if (seen.has(value)) {
    throw new OptimizerObservationError('Observed metadata must not contain cycles.');
  }
  seen.add(value);

  let cloned;
  if (Array.isArray(value)) {
    cloned = Array.from(value, (nested) => clonePlainData(nested, seen, depth + 1));
  } else if (isObject(value)) {
    cloned = Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        clonePlainData(nested, seen, depth + 1),
      ]),
    );
  } else {
    cloned = value;
  }

  seen.delete(value);
  return cloned;
}

function deepFreeze(value) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || Object.isFrozen(current)) {
      continue;
    }
    Object.freeze(current);
    for (const nested of Object.values(current)) {
      pending.push(nested);
    }
  }
  return value;
}

function isDenseArray(value) {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return false;
    }
  }
  return true;
}

function validatePosition(position, field, maximumFret) {
  if (!isObject(position)) {
    throw new OptimizerObservationError(`${field} must be a position object.`, { field });
  }
  if (!Number.isSafeInteger(position.string) || position.string < 1 || position.string > 6) {
    throw new OptimizerObservationError(`${field}.string must be an integer from 1 to 6.`, {
      field,
      position,
    });
  }
  if (
    !Number.isSafeInteger(position.fret)
    || position.fret < 0
    || position.fret > maximumFret
  ) {
    throw new OptimizerObservationError(`${field}.fret is outside the guitar configuration.`, {
      field,
      position,
      maximumFret,
    });
  }
  return position;
}

function createCandidateId(eventId, position) {
  if (typeof eventId !== 'string' || eventId.length === 0) {
    throw new OptimizerObservationError('eventId must be a non-empty string.', { eventId });
  }
  validatePosition(position, 'position', Number.MAX_SAFE_INTEGER);
  return `candidate:${encodeURIComponent(eventId)}:s${position.string}:f${position.fret}`;
}

function samePosition(left, right) {
  return left.string === right.string && left.fret === right.fret;
}

function validateCandidateSet(candidateSet) {
  if (!isObject(candidateSet)) {
    throw new OptimizerObservationError('candidateSet must be an object.');
  }
  if (candidateSet.documentType !== 'CanonicalFingeringCandidates') {
    throw new OptimizerObservationError(
      'candidateSet.documentType must be CanonicalFingeringCandidates.',
      { documentType: candidateSet.documentType },
    );
  }
  if (candidateSet.contractVersion !== CANONICAL_FINGERING_CANDIDATES_VERSION) {
    throw new OptimizerObservationError('candidateSet.contractVersion is not supported.', {
      expectedContractVersion: CANONICAL_FINGERING_CANDIDATES_VERSION,
      actualContractVersion: candidateSet.contractVersion,
    });
  }
  if (!Number.isSafeInteger(candidateSet.noteCount) || candidateSet.noteCount < 0) {
    throw new OptimizerObservationError('candidateSet.noteCount must be a non-negative integer.');
  }
  if (
    !isDenseArray(candidateSet.notes)
    || !isDenseArray(candidateSet.candidateLayers)
    || candidateSet.notes.length !== candidateSet.noteCount
    || candidateSet.candidateLayers.length !== candidateSet.noteCount
  ) {
    throw new OptimizerObservationError(
      'candidateSet notes and candidateLayers must match noteCount.',
    );
  }
  if (!isObject(candidateSet.guitarConfiguration)) {
    throw new OptimizerObservationError('candidateSet.guitarConfiguration must be an object.');
  }
  if (!Number.isSafeInteger(candidateSet.guitarConfiguration.maximumFret)) {
    throw new OptimizerObservationError(
      'candidateSet.guitarConfiguration.maximumFret must be an integer.',
    );
  }
  return candidateSet;
}

function validateOptimizerResult(optimizerResult, noteCount) {
  if (!isObject(optimizerResult)) {
    throw new OptimizerObservationError('optimizerResult must be an object.');
  }
  if (
    !isDenseArray(optimizerResult.positions)
    || !isDenseArray(optimizerResult.costs)
    || optimizerResult.positions.length !== noteCount
    || optimizerResult.costs.length !== noteCount
  ) {
    throw new OptimizerObservationError(
      'optimizerResult positions and costs must match candidateSet.noteCount.',
    );
  }
  if (!Number.isFinite(optimizerResult.totalCost) || optimizerResult.totalCost < 0) {
    throw new OptimizerObservationError(
      'optimizerResult.totalCost must be a finite non-negative number.',
      { totalCost: optimizerResult.totalCost },
    );
  }
  return optimizerResult;
}

function validateObservedCost(cost, noteIndex) {
  if (!isObject(cost) || !Number.isFinite(cost.total) || cost.total < 0) {
    throw new OptimizerObservationError('Observed optimizer cost must be finite and non-negative.', {
      noteIndex,
    });
  }
  if (typeof cost.isPlayable !== 'boolean') {
    throw new OptimizerObservationError('Observed optimizer cost.isPlayable must be boolean.', {
      noteIndex,
    });
  }
  if (
    !isDenseArray(cost.reasons)
    || cost.reasons.some((reason) => typeof reason !== 'string' || reason.length === 0)
  ) {
    throw new OptimizerObservationError(
      'Observed optimizer cost.reasons must be a dense array of non-empty strings.',
      { noteIndex },
    );
  }
  if (cost.isPlayable !== true || cost.reasons.length !== 0) {
    throw new OptimizerObservationError(
      'Selected optimizer cost must be playable and contain no rejection reasons.',
      { noteIndex, isPlayable: cost.isPlayable, reasons: cost.reasons },
    );
  }
  if (!isObject(cost.breakdown)) {
    throw new OptimizerObservationError('Observed optimizer cost.breakdown must be an object.', {
      noteIndex,
    });
  }

  const requiredNumberFields = noteIndex === 0
    ? POSITION_COST_BREAKDOWN_FIELDS
    : TRANSITION_COST_BREAKDOWN_FIELDS;
  for (const field of requiredNumberFields) {
    const value = cost.breakdown[field];
    if (!Number.isFinite(value) || value < 0) {
      throw new OptimizerObservationError(
        `Observed optimizer cost.breakdown.${field} must be finite and non-negative.`,
        { noteIndex, field },
      );
    }
  }

  if (noteIndex > 0 && typeof cost.breakdown.samePosition !== 'boolean') {
    throw new OptimizerObservationError(
      'Observed optimizer transition cost.breakdown.samePosition must be boolean.',
      { noteIndex },
    );
  }

  return cost;
}

function createOptimizerObservation(candidateSet, optimizerResult) {
  validateCandidateSet(candidateSet);
  validateOptimizerResult(optimizerResult, candidateSet.noteCount);

  const maximumFret = candidateSet.guitarConfiguration.maximumFret;
  const decisions = candidateSet.notes.map((note, noteIndex) => {
    if (!isObject(note) || typeof note.eventId !== 'string' || note.eventId.length === 0) {
      throw new OptimizerObservationError('Every candidate note must contain eventId.', {
        noteIndex,
      });
    }
    const layer = candidateSet.candidateLayers[noteIndex];
    if (!isDenseArray(layer) || layer.length === 0) {
      throw new OptimizerObservationError('Every observed candidate layer must be non-empty.', {
        noteIndex,
      });
    }

    const candidates = layer.map((position, candidateIndex) => {
      validatePosition(position, 'candidate', maximumFret);
      return {
        candidateId: createCandidateId(note.eventId, position),
        candidateIndex,
        position: clonePlainData(position),
      };
    });

    const selectedPosition = optimizerResult.positions[noteIndex];
    validatePosition(selectedPosition, 'selectedPosition', maximumFret);
    const selectedCandidateIndex = layer.findIndex((position) => (
      samePosition(position, selectedPosition)
    ));
    if (selectedCandidateIndex < 0) {
      throw new OptimizerObservationError(
        'Optimizer selected a position outside the observed candidate layer.',
        { noteIndex, eventId: note.eventId, selectedPosition },
      );
    }

    const cost = validateObservedCost(optimizerResult.costs[noteIndex], noteIndex);

    return {
      decisionIndex: noteIndex,
      eventId: note.eventId,
      measureKey: note.measureKey,
      eventIndex: note.eventIndex,
      candidates,
      selectedCandidateId: candidates[selectedCandidateIndex].candidateId,
      selectedPosition: clonePlainData(selectedPosition),
      cost: clonePlainData(cost),
    };
  });

  return deepFreeze({
    documentType: 'OptimizerObservation',
    contractVersion: OPTIMIZER_OBSERVATION_VERSION,
    candidateContractVersion: CANONICAL_FINGERING_CANDIDATES_VERSION,
    optimizer: {
      name: 'deterministic-dynamic-programming',
      version: FINGERING_OPTIMIZER_VERSION,
    },
    guitarConfiguration: {
      contractVersion: GUITAR_CONFIGURATION_VERSION,
      value: clonePlainData(candidateSet.guitarConfiguration),
    },
    partId: candidateSet.partId,
    noteCount: candidateSet.noteCount,
    totalCost: optimizerResult.totalCost,
    decisions,
  });
}

module.exports = {
  OPTIMIZER_OBSERVATION_VERSION,
  OptimizerObservationError,
  createCandidateId,
  createOptimizerObservation,
};
