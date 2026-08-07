'use strict';

const { EngineError } = require('../errors/engineError');

const PROCESSING_BUDGET_VERSION = '1.0.0';

const DEFAULT_PROCESSING_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxDepth: 128,
  maxElements: 100_000,
  maxAttributes: 200_000,
  maxTextBytes: 4 * 1024 * 1024,
  maxMeasures: 2_000,
  maxEvents: 50_000,
  maxProcessingMilliseconds: 10_000,
});

class ProcessingBudgetConfigurationError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_PROCESSING_BUDGET',
      Object.freeze({ ...details }),
      'ProcessingBudgetConfigurationError',
    );
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidBudget(message, field = null, value = undefined) {
  const details = field === null ? {} : { field, value };
  return new ProcessingBudgetConfigurationError(message, details);
}

function validateLimit(field, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalidBudget(
      'Processing budget limits must be positive safe integers.',
      field,
      value,
    );
  }
  return value;
}

function createProcessingBudget(options = {}) {
  if (!isPlainObject(options)) {
    throw invalidBudget('Processing budget options must be a plain object.');
  }

  const allowedFields = new Set(Object.keys(DEFAULT_PROCESSING_LIMITS));
  for (const field of Object.keys(options)) {
    if (!allowedFields.has(field)) {
      throw invalidBudget('Processing budget contains an unknown field.', field, options[field]);
    }
  }

  const limits = {};
  for (const [field, defaultValue] of Object.entries(DEFAULT_PROCESSING_LIMITS)) {
    limits[field] = validateLimit(
      field,
      Object.hasOwn(options, field) ? options[field] : defaultValue,
    );
  }

  return Object.freeze({
    documentType: 'ProcessingBudget',
    contractVersion: PROCESSING_BUDGET_VERSION,
    limits: Object.freeze(limits),
  });
}

module.exports = {
  PROCESSING_BUDGET_VERSION,
  DEFAULT_PROCESSING_LIMITS,
  ProcessingBudgetConfigurationError,
  createProcessingBudget,
};
