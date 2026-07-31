'use strict';

const DEFAULT_FINGERING_COST_PROFILE = Object.freeze({
  maximumFret: 20,
  fretMovementWeight: 1,
  stringMovementWeight: 1,
  largeShiftThreshold: 4,
  largeShiftWeight: 0,
  highFretThreshold: 12,
  highFretWeight: 0,
  openStringPreferenceWeight: 0,
  samePositionPreferenceWeight: 0,
  maximumFretMovement: null,
  maximumStringMovement: null,
});

class FingeringCostError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'FingeringCostError';
    this.code = code;
    this.details = details;
  }
}

function invalidProfile(message, details = {}) {
  return new FingeringCostError(message, 'INVALID_FINGERING_COST_PROFILE', details);
}

function invalidPosition(message, details = {}) {
  return new FingeringCostError(message, 'INVALID_POSITION', details);
}

function requireNonNegativeFinite(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw invalidProfile(`${field} must be a finite non-negative number.`, {
      field,
      value,
    });
  }
  return value;
}

function requireFiniteCost(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw invalidProfile(`${field} must remain a finite non-negative number.`, {
      field,
      value,
    });
  }
  return value;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidProfile(`${field} must be a non-negative safe integer.`, {
      field,
      value,
    });
  }
  return value;
}

function requireOptionalNonNegativeInteger(value, field) {
  if (value === null) {
    return null;
  }
  return requireNonNegativeInteger(value, field);
}

function createFingeringCostProfile(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw invalidProfile('Fingering cost profile overrides must be an object.', {
      overrides,
    });
  }

  const allowedFields = new Set(Object.keys(DEFAULT_FINGERING_COST_PROFILE));
  for (const field of Object.keys(overrides)) {
    if (!allowedFields.has(field)) {
      throw invalidProfile('Fingering cost profile contains an unknown field.', {
        field,
      });
    }
  }

  const profile = {
    ...DEFAULT_FINGERING_COST_PROFILE,
    ...overrides,
  };

  requireNonNegativeInteger(profile.maximumFret, 'maximumFret');
  requireNonNegativeFinite(profile.fretMovementWeight, 'fretMovementWeight');
  requireNonNegativeFinite(profile.stringMovementWeight, 'stringMovementWeight');
  requireNonNegativeInteger(profile.largeShiftThreshold, 'largeShiftThreshold');
  requireNonNegativeFinite(profile.largeShiftWeight, 'largeShiftWeight');
  requireNonNegativeInteger(profile.highFretThreshold, 'highFretThreshold');
  requireNonNegativeFinite(profile.highFretWeight, 'highFretWeight');
  requireNonNegativeFinite(
    profile.openStringPreferenceWeight,
    'openStringPreferenceWeight',
  );
  requireNonNegativeFinite(
    profile.samePositionPreferenceWeight,
    'samePositionPreferenceWeight',
  );
  requireOptionalNonNegativeInteger(
    profile.maximumFretMovement,
    'maximumFretMovement',
  );
  requireOptionalNonNegativeInteger(
    profile.maximumStringMovement,
    'maximumStringMovement',
  );

  if (profile.highFretThreshold > profile.maximumFret) {
    throw invalidProfile('highFretThreshold cannot exceed maximumFret.', {
      highFretThreshold: profile.highFretThreshold,
      maximumFret: profile.maximumFret,
    });
  }

  return Object.freeze(profile);
}

function validateCostPosition(position, profile, field) {
  if (!position || typeof position !== 'object' || Array.isArray(position)) {
    throw invalidPosition(`${field} must be a position object.`, {
      field,
      position,
    });
  }

  if (!Number.isSafeInteger(position.string) || position.string < 1 || position.string > 6) {
    throw invalidPosition(`${field}.string must be an integer from 1 to 6.`, {
      field,
      position,
    });
  }

  if (
    !Number.isSafeInteger(position.fret)
    || position.fret < 0
    || position.fret > profile.maximumFret
  ) {
    throw invalidPosition(`${field}.fret is outside the configured range.`, {
      field,
      position,
      maximumFret: profile.maximumFret,
    });
  }

  return position;
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

function calculatePositionCost(position, profileOverrides = {}) {
  const profile = createFingeringCostProfile(profileOverrides);
  validateCostPosition(position, profile, 'position');

  const highFretDistance = Math.max(0, position.fret - profile.highFretThreshold);
  const highFretCost = requireFiniteCost(
    highFretDistance * profile.highFretWeight,
    'highFretCost',
  );
  const openStringPreferenceCost = requireFiniteCost(
    position.fret === 0 ? 0 : profile.openStringPreferenceWeight,
    'openStringPreferenceCost',
  );
  const total = requireFiniteCost(
    highFretCost + openStringPreferenceCost,
    'positionCostTotal',
  );

  return deepFreeze({
    total,
    isPlayable: true,
    reasons: [],
    breakdown: {
      highFretDistance,
      highFretCost,
      openStringPreferenceCost,
    },
  });
}

function calculateTransitionCost(previousPosition, nextPosition, profileOverrides = {}) {
  const profile = createFingeringCostProfile(profileOverrides);
  validateCostPosition(previousPosition, profile, 'previousPosition');
  validateCostPosition(nextPosition, profile, 'nextPosition');

  const fretMovement = Math.abs(nextPosition.fret - previousPosition.fret);
  const stringMovement = Math.abs(nextPosition.string - previousPosition.string);
  const samePosition = fretMovement === 0 && stringMovement === 0;
  const largeShiftDistance = Math.max(0, fretMovement - profile.largeShiftThreshold);
  const positionCost = calculatePositionCost(nextPosition, profile);

  const fretMovementCost = requireFiniteCost(
    fretMovement * profile.fretMovementWeight,
    'fretMovementCost',
  );
  const stringMovementCost = requireFiniteCost(
    stringMovement * profile.stringMovementWeight,
    'stringMovementCost',
  );
  const largeShiftCost = requireFiniteCost(
    largeShiftDistance * profile.largeShiftWeight,
    'largeShiftCost',
  );
  const samePositionPreferenceCost = requireFiniteCost(
    samePosition ? 0 : profile.samePositionPreferenceWeight,
    'samePositionPreferenceCost',
  );

  const reasons = [];
  if (
    profile.maximumFretMovement !== null
    && fretMovement > profile.maximumFretMovement
  ) {
    reasons.push('MAXIMUM_FRET_MOVEMENT_EXCEEDED');
  }
  if (
    profile.maximumStringMovement !== null
    && stringMovement > profile.maximumStringMovement
  ) {
    reasons.push('MAXIMUM_STRING_MOVEMENT_EXCEEDED');
  }

  const isPlayable = reasons.length === 0;
  const finiteTotal = requireFiniteCost(
    fretMovementCost
      + stringMovementCost
      + largeShiftCost
      + positionCost.total
      + samePositionPreferenceCost,
    'transitionCostTotal',
  );

  return deepFreeze({
    total: isPlayable ? finiteTotal : Number.POSITIVE_INFINITY,
    isPlayable,
    reasons,
    breakdown: {
      fretMovement,
      fretMovementCost,
      stringMovement,
      stringMovementCost,
      largeShiftDistance,
      largeShiftCost,
      highFretDistance: positionCost.breakdown.highFretDistance,
      highFretCost: positionCost.breakdown.highFretCost,
      openStringPreferenceCost: positionCost.breakdown.openStringPreferenceCost,
      samePosition,
      samePositionPreferenceCost,
    },
  });
}

module.exports = {
  DEFAULT_FINGERING_COST_PROFILE,
  FingeringCostError,
  createFingeringCostProfile,
  calculatePositionCost,
  calculateTransitionCost,
};
