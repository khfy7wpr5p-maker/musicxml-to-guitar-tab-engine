'use strict';

const { EngineError } = require('../errors/engineError');
const {
  FingeringCostError,
  createFingeringCostProfile,
  calculatePositionCost,
  calculateTransitionCost,
} = require('./costModel');

const COST_OVERFLOW_FIELDS = new Set([
  'highFretCost',
  'openStringPreferenceCost',
  'positionCostTotal',
  'fretMovementCost',
  'stringMovementCost',
  'largeShiftCost',
  'samePositionPreferenceCost',
  'transitionCostTotal',
]);

class FingeringOptimizerError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'FingeringOptimizerError');
  }
}

function invalidCandidates(message, details = {}) {
  return new FingeringOptimizerError(
    message,
    'INVALID_FINGERING_CANDIDATES',
    details,
  );
}

function noPlayableFingering(details = {}) {
  return new FingeringOptimizerError(
    'No playable fingering path exists for the supplied candidate layers.',
    'NO_PLAYABLE_FINGERING',
    details,
  );
}

function fingeringCostOverflow(details = {}) {
  return new FingeringOptimizerError(
    'No finite fingering path exists for the supplied candidate layers.',
    'FINGERING_COST_OVERFLOW',
    details,
  );
}

function isCostOverflowError(error) {
  return (
    error instanceof FingeringCostError
    && error.code === 'INVALID_FINGERING_COST_PROFILE'
    && COST_OVERFLOW_FIELDS.has(error.details?.field)
    && !Number.isFinite(error.details?.value)
  );
}

function checkpoint(runtime, phase, location = {}) {
  if (runtime !== null && runtime !== undefined) {
    runtime.checkpoint(phase, location);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function clonePosition(position) {
  return {
    string: position.string,
    fret: position.fret,
  };
}

function comparePositions(a, b) {
  return (
    a.string - b.string
    || a.fret - b.fret
  );
}

function validateCandidateLayers(candidateLayers, profile, runtime = null) {
  if (!Array.isArray(candidateLayers) || candidateLayers.length === 0) {
    throw invalidCandidates('candidateLayers must be a non-empty array.');
  }

  return Array.from(candidateLayers, (layer, layerIndex) => {
    checkpoint(runtime, 'fingering:optimizer:validate-layer', { layerIndex });

    if (!Array.isArray(layer) || layer.length === 0) {
      throw invalidCandidates(
        'Every candidate layer must be a non-empty array.',
        { layerIndex },
      );
    }

    return Array.from(layer, (position, candidateIndex) => {
      checkpoint(runtime, 'fingering:optimizer:validate-candidate', {
        layerIndex,
        candidateIndex,
      });

      if (!position || typeof position !== 'object' || Array.isArray(position)) {
        throw invalidCandidates(
          'Every candidate must be a position object.',
          { layerIndex, candidateIndex },
        );
      }
      if (
        !Number.isSafeInteger(position.string)
        || position.string < 1
        || position.string > 6
      ) {
        throw invalidCandidates(
          'Candidate string must be an integer from 1 to 6.',
          { layerIndex, candidateIndex, position },
        );
      }
      if (
        !Number.isSafeInteger(position.fret)
        || position.fret < 0
        || position.fret > profile.maximumFret
      ) {
        throw invalidCandidates(
          'Candidate fret is outside the configured range.',
          {
            layerIndex,
            candidateIndex,
            position,
            maximumFret: profile.maximumFret,
          },
        );
      }

      return {
        position: clonePosition(position),
        originalIndex: candidateIndex,
      };
    })
      .sort((a, b) => (
        comparePositions(a.position, b.position)
        || a.originalIndex - b.originalIndex
      ));
  });
}

function compareStatePaths(a, b) {
  const previousRankA = a.previousState?.pathRank ?? -1;
  const previousRankB = b.previousState?.pathRank ?? -1;

  return (
    previousRankA - previousRankB
    || comparePositions(a.position, b.position)
  );
}

function assignPathRanks(states, runtime = null, layerIndex = null) {
  const orderedStates = [...states].sort(compareStatePaths);
  let pathRank = -1;
  let previousState = null;

  for (let stateIndex = 0; stateIndex < orderedStates.length; stateIndex += 1) {
    checkpoint(runtime, 'fingering:optimizer:path-rank', {
      layerIndex,
      stateIndex,
    });
    const state = orderedStates[stateIndex];
    if (!previousState || compareStatePaths(previousState, state) !== 0) {
      pathRank += 1;
    }
    state.pathRank = pathRank;
    previousState = state;
  }
}

function chooseBetterTransition(current, candidate) {
  if (!current) {
    return candidate;
  }
  if (candidate.totalCost < current.totalCost) {
    return candidate;
  }
  if (candidate.totalCost > current.totalCost) {
    return current;
  }
  return candidate.previousState.pathRank < current.previousState.pathRank
    ? candidate
    : current;
}

function chooseBetterFinalState(current, candidate) {
  if (!current) {
    return candidate;
  }
  if (candidate.totalCost < current.totalCost) {
    return candidate;
  }
  if (candidate.totalCost > current.totalCost) {
    return current;
  }
  return candidate.pathRank < current.pathRank
    ? candidate
    : current;
}

function exceedsMovementLimits(previousPosition, nextPosition, profile) {
  const fretMovement = Math.abs(nextPosition.fret - previousPosition.fret);
  const stringMovement = Math.abs(nextPosition.string - previousPosition.string);

  return (
    (
      profile.maximumFretMovement !== null
      && fretMovement > profile.maximumFretMovement
    )
    || (
      profile.maximumStringMovement !== null
      && stringMovement > profile.maximumStringMovement
    )
  );
}

function reconstructResult(bestState, runtime = null) {
  const positions = [];
  const costs = [];
  let pathIndex = 0;

  for (let state = bestState; state; state = state.previousState) {
    checkpoint(runtime, 'fingering:optimizer:reconstruct', { pathIndex });
    positions.push(clonePosition(state.position));
    costs.push(state.cost);
    pathIndex += 1;
  }

  positions.reverse();
  costs.reverse();

  return deepFreeze({
    totalCost: bestState.totalCost,
    positions,
    costs,
  });
}

function optimizeFingering(candidateLayers, options = {}, runtime = null) {
  checkpoint(runtime, 'fingering:optimizer:start');

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw invalidCandidates('options must be an object.');
  }

  const allowedOptionFields = new Set(['costProfile']);
  for (const field of Object.keys(options)) {
    if (!allowedOptionFields.has(field)) {
      throw invalidCandidates('options contains an unknown field.', { field });
    }
  }

  const costProfile = Object.hasOwn(options, 'costProfile')
    ? options.costProfile
    : {};
  const profile = createFingeringCostProfile(costProfile);
  const layers = validateCandidateLayers(candidateLayers, profile, runtime);

  let firstLayerSawOverflow = false;
  let states = [];

  for (let candidateIndex = 0; candidateIndex < layers[0].length; candidateIndex += 1) {
    checkpoint(runtime, 'fingering:optimizer:first-layer-candidate', {
      layerIndex: 0,
      candidateIndex,
    });
    const { position } = layers[0][candidateIndex];
    let cost;
    try {
      cost = calculatePositionCost(position, profile);
    } catch (error) {
      if (!isCostOverflowError(error)) {
        throw error;
      }
      firstLayerSawOverflow = true;
      continue;
    }

    states.push({
      position,
      totalCost: cost.total,
      cost,
      previousState: null,
      pathRank: -1,
    });
  }

  if (states.length === 0) {
    if (firstLayerSawOverflow) {
      throw fingeringCostOverflow({ layerIndex: 0 });
    }
    throw noPlayableFingering({ layerIndex: 0 });
  }

  assignPathRanks(states, runtime, 0);

  for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
    checkpoint(runtime, 'fingering:optimizer:layer', { layerIndex });
    const nextStates = [];
    let layerSawOverflow = false;

    for (let candidateIndex = 0; candidateIndex < layers[layerIndex].length; candidateIndex += 1) {
      checkpoint(runtime, 'fingering:optimizer:candidate', {
        layerIndex,
        candidateIndex,
      });
      const { position: nextPosition } = layers[layerIndex][candidateIndex];
      let best = null;

      for (let previousStateIndex = 0; previousStateIndex < states.length; previousStateIndex += 1) {
        checkpoint(runtime, 'fingering:optimizer:transition', {
          layerIndex,
          candidateIndex,
          previousStateIndex,
        });
        const previousState = states[previousStateIndex];
        if (exceedsMovementLimits(previousState.position, nextPosition, profile)) {
          continue;
        }

        let transitionCost;
        try {
          transitionCost = calculateTransitionCost(
            previousState.position,
            nextPosition,
            profile,
          );
        } catch (error) {
          if (!isCostOverflowError(error)) {
            throw error;
          }
          layerSawOverflow = true;
          continue;
        }

        if (!transitionCost.isPlayable) {
          continue;
        }

        const totalCost = previousState.totalCost + transitionCost.total;
        if (!Number.isFinite(totalCost)) {
          layerSawOverflow = true;
          continue;
        }

        best = chooseBetterTransition(best, {
          position: nextPosition,
          totalCost,
          cost: transitionCost,
          previousState,
          pathRank: -1,
        });
      }

      if (best) {
        nextStates.push(best);
      }
    }

    if (nextStates.length === 0) {
      if (layerSawOverflow) {
        throw fingeringCostOverflow({ layerIndex });
      }
      throw noPlayableFingering({ layerIndex });
    }

    assignPathRanks(nextStates, runtime, layerIndex);
    states = nextStates;
  }

  let best = null;
  for (let finalStateIndex = 0; finalStateIndex < states.length; finalStateIndex += 1) {
    checkpoint(runtime, 'fingering:optimizer:final-state', { finalStateIndex });
    best = chooseBetterFinalState(best, states[finalStateIndex]);
  }

  if (!best) {
    throw noPlayableFingering({ layerIndex: 0 });
  }

  const result = reconstructResult(best, runtime);
  checkpoint(runtime, 'fingering:optimizer:complete', {
    layerCount: layers.length,
  });
  return result;
}

module.exports = {
  FingeringOptimizerError,
  optimizeFingering,
};
