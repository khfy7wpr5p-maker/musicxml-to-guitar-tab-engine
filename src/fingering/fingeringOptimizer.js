'use strict';

const {
  createFingeringCostProfile,
  calculatePositionCost,
  calculateTransitionCost,
} = require('./costModel');

class FingeringOptimizerError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'FingeringOptimizerError';
    this.code = code;
    this.details = details;
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

function validateCandidateLayers(candidateLayers, profile) {
  if (!Array.isArray(candidateLayers) || candidateLayers.length === 0) {
    throw invalidCandidates('candidateLayers must be a non-empty array.');
  }

  return candidateLayers.map((layer, layerIndex) => {
    if (!Array.isArray(layer) || layer.length === 0) {
      throw invalidCandidates(
        'Every candidate layer must be a non-empty array.',
        { layerIndex },
      );
    }

    return layer
      .map((position, candidateIndex) => {
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
        a.position.string - b.position.string
        || a.position.fret - b.position.fret
        || a.originalIndex - b.originalIndex
      ));
  });
}

function comparePaths(a, b) {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const comparison = (
      a[index].string - b[index].string
      || a[index].fret - b[index].fret
    );
    if (comparison !== 0) {
      return comparison;
    }
  }
  return a.length - b.length;
}

function chooseBetter(current, candidate) {
  if (!current) {
    return candidate;
  }
  if (candidate.totalCost < current.totalCost) {
    return candidate;
  }
  if (candidate.totalCost > current.totalCost) {
    return current;
  }
  return comparePaths(candidate.positions, current.positions) < 0
    ? candidate
    : current;
}

function optimizeFingering(candidateLayers, options = {}) {
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
  const layers = validateCandidateLayers(candidateLayers, profile);

  let states = layers[0].map(({ position }) => {
    const cost = calculatePositionCost(position, profile);
    return {
      position,
      totalCost: cost.total,
      positions: [position],
      costs: [cost],
    };
  });

  for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
    const nextStates = [];

    for (const { position: nextPosition } of layers[layerIndex]) {
      let best = null;

      for (const previousState of states) {
        const transitionCost = calculateTransitionCost(
          previousState.position,
          nextPosition,
          profile,
        );

        if (!transitionCost.isPlayable) {
          continue;
        }

        const totalCost = previousState.totalCost + transitionCost.total;
        if (!Number.isFinite(totalCost)) {
          throw new FingeringOptimizerError(
            'Accumulated fingering cost must remain finite.',
            'FINGERING_COST_OVERFLOW',
            { layerIndex, totalCost },
          );
        }

        best = chooseBetter(best, {
          position: nextPosition,
          totalCost,
          positions: [...previousState.positions, nextPosition],
          costs: [...previousState.costs, transitionCost],
        });
      }

      if (best) {
        nextStates.push(best);
      }
    }

    if (nextStates.length === 0) {
      throw noPlayableFingering({ layerIndex });
    }

    states = nextStates;
  }

  let best = null;
  for (const state of states) {
    best = chooseBetter(best, state);
  }

  if (!best) {
    throw noPlayableFingering({ layerIndex: 0 });
  }

  return deepFreeze({
    totalCost: best.totalCost,
    positions: best.positions.map(clonePosition),
    costs: best.costs,
  });
}

module.exports = {
  FingeringOptimizerError,
  optimizeFingering,
};
