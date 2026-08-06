'use strict';

const { performance } = require('node:perf_hooks');
const {
  DEFAULT_PROCESSING_LIMITS,
  ProcessingBudgetConfigurationError,
  createProcessingBudget,
} = require('./processingBudget');
const { XmlSafetyError } = require('../validation/xmlSafety');

const PROCESSING_RUNTIME_VERSION = '1.0.0';
const PROCESSING_ABORTED = 'PROCESSING_ABORTED';
const PROCESSING_DEADLINE_EXCEEDED = 'PROCESSING_DEADLINE_EXCEEDED';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidConfiguration(message, details = {}) {
  return new XmlSafetyError(
    message,
    'INVALID_CONFIGURATION',
    Object.freeze({ ...details }),
  );
}

function isAbortSignal(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.aborted === 'boolean'
    && typeof value.addEventListener === 'function'
    && typeof value.removeEventListener === 'function';
}

function splitProcessingOptions(options) {
  if (!isPlainObject(options)) {
    throw invalidConfiguration('Processing options must be a plain object.');
  }

  const budgetFields = new Set(Object.keys(DEFAULT_PROCESSING_LIMITS));
  const budgetOptions = {};
  let signal = null;

  for (const field of Object.keys(options)) {
    if (budgetFields.has(field)) {
      budgetOptions[field] = options[field];
      continue;
    }

    if (field === 'signal') {
      signal = options[field];
      continue;
    }

    throw invalidConfiguration(
      'Processing budget contains an unknown field.',
      { field, value: options[field] },
    );
  }

  if (signal !== null && signal !== undefined && !isAbortSignal(signal)) {
    throw invalidConfiguration(
      'signal must be an AbortSignal.',
      { field: 'signal' },
    );
  }

  return {
    budgetOptions,
    signal: signal ?? null,
  };
}

function normalizeRuntimeOptions(runtimeOptions) {
  if (!isPlainObject(runtimeOptions)) {
    throw invalidConfiguration('Runtime options must be a plain object.');
  }

  for (const field of Object.keys(runtimeOptions)) {
    if (field !== 'clock') {
      throw invalidConfiguration('Runtime options contain an unknown field.', {
        field,
        value: runtimeOptions[field],
      });
    }
  }

  const clock = Object.hasOwn(runtimeOptions, 'clock')
    ? runtimeOptions.clock
    : ((phase) => {
      void phase;
      return performance.now();
    });
  if (typeof clock !== 'function') {
    throw invalidConfiguration('clock must be a function.', { field: 'clock' });
  }
  return clock;
}

function createBudget(options) {
  try {
    return createProcessingBudget(options);
  } catch (error) {
    if (error instanceof ProcessingBudgetConfigurationError) {
      throw invalidConfiguration(error.message, error.details);
    }
    throw error;
  }
}

function readClock(clock, phase) {
  let observed;
  try {
    observed = clock(phase);
  } catch {
    throw invalidConfiguration('clock must return a finite monotonic number.', {
      field: 'clock',
      phase,
    });
  }

  if (!Number.isFinite(observed)) {
    throw invalidConfiguration('clock must return a finite monotonic number.', {
      field: 'clock',
      phase,
    });
  }
  return observed;
}

function createProcessingRuntime(options = {}, runtimeOptions = {}) {
  const { budgetOptions, signal } = splitProcessingOptions(options);
  const budget = createBudget(budgetOptions);
  const clock = normalizeRuntimeOptions(runtimeOptions);
  const startedAt = readClock(clock, 'runtime:start');
  let lastObserved = startedAt;

  function checkpoint(phase, location = {}) {
    const normalizedPhase = typeof phase === 'string' && phase.length > 0
      ? phase
      : 'processing';
    const safeLocation = isPlainObject(location) ? location : {};

    if (signal && signal.aborted) {
      throw new XmlSafetyError(
        'Processing was cancelled by the supplied AbortSignal.',
        PROCESSING_ABORTED,
        Object.freeze({
          field: 'signal',
          phase: normalizedPhase,
          ...safeLocation,
        }),
      );
    }

    const observedAt = readClock(clock, normalizedPhase);
    if (observedAt < lastObserved) {
      throw invalidConfiguration('clock must return a finite monotonic number.', {
        field: 'clock',
        phase: normalizedPhase,
      });
    }
    lastObserved = observedAt;

    const elapsedMilliseconds = observedAt - startedAt;
    const limit = budget.limits.maxProcessingMilliseconds;
    if (elapsedMilliseconds > limit) {
      throw new XmlSafetyError(
        'Processing time exceeds the configured deadline.',
        PROCESSING_DEADLINE_EXCEEDED,
        Object.freeze({
          field: 'maxProcessingMilliseconds',
          limit,
          observed: elapsedMilliseconds,
          phase: normalizedPhase,
          ...safeLocation,
        }),
      );
    }

    return elapsedMilliseconds;
  }

  return Object.freeze({
    documentType: 'ProcessingRuntime',
    contractVersion: PROCESSING_RUNTIME_VERSION,
    budget,
    checkpoint,
  });
}

function isProcessingRuntime(value) {
  return value !== null
    && typeof value === 'object'
    && value.documentType === 'ProcessingRuntime'
    && value.contractVersion === PROCESSING_RUNTIME_VERSION
    && value.budget !== null
    && typeof value.budget === 'object'
    && typeof value.checkpoint === 'function';
}

function resolveProcessingRuntime(options = {}, runtime = null, runtimeOptions = {}) {
  if (runtime === null || runtime === undefined) {
    return createProcessingRuntime(options, runtimeOptions);
  }
  if (!isProcessingRuntime(runtime)) {
    throw invalidConfiguration('runtime must be a ProcessingRuntime 1.0.0 value.', {
      field: 'runtime',
    });
  }
  return runtime;
}

module.exports = {
  PROCESSING_RUNTIME_VERSION,
  PROCESSING_ABORTED,
  PROCESSING_DEADLINE_EXCEEDED,
  createProcessingRuntime,
  isProcessingRuntime,
  resolveProcessingRuntime,
};
