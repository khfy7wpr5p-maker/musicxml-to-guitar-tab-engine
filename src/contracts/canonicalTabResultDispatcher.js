'use strict';

const { EngineError } = require('../errors/engineError');
const { validateCanonicalTabResult } = require('./canonicalTabResultContract');
const {
  CANONICAL_TAB_RESULT_V2_VERSION,
  validateCanonicalTabResultV2,
} = require('./canonicalTabResultV2Contract');
const {
  hostileSafeGraph,
} = require('./canonicalTabResultV2ValidationSupport');
const {
  CANONICAL_TAB_RESULT_VERSION,
} = require('./canonicalTabContractMetadata');

class CanonicalTabResultDispatchError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, Object.freeze({ ...details }), 'CanonicalTabResultDispatchError');
  }
}

function dispatchFailure(code, rule, details = {}) {
  throw new CanonicalTabResultDispatchError(
    'Canonical artifact could not be dispatched safely.',
    code,
    { rule, ...details },
  );
}

function exactIdentityValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    dispatchFailure('INVALID_CANONICAL_IDENTITY', 'ENUMERABLE_DATA_IDENTITY_REQUIRED', { field: key });
  }
  if (typeof descriptor.value !== 'string' || descriptor.value.length === 0) {
    dispatchFailure('INVALID_CANONICAL_IDENTITY', 'NON_EMPTY_STRING_IDENTITY_REQUIRED', { field: key });
  }
  return descriptor.value;
}

function dispatchCanonicalTabResult(value) {
  try {
    hostileSafeGraph(value);
  } catch (error) {
    if (error && error.code === 'UNSAFE_CANONICAL_TAB_RESULT_V2') {
      dispatchFailure('UNSAFE_CANONICAL_INPUT', 'HOSTILE_GRAPH_REJECTED', {
        causeRule: error.details && error.details.rule,
      });
    }
    throw error;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    dispatchFailure('INVALID_CANONICAL_IDENTITY', 'ROOT_OBJECT_REQUIRED');
  }
  const documentType = exactIdentityValue(value, 'documentType');
  if (documentType !== 'CanonicalTabResult') {
    dispatchFailure('INVALID_CANONICAL_IDENTITY', 'DOCUMENT_TYPE_MISMATCH', {
      actual: documentType,
    });
  }
  const schemaVersion = exactIdentityValue(value, 'schemaVersion');

  if (schemaVersion === CANONICAL_TAB_RESULT_VERSION) {
    return validateCanonicalTabResult(value);
  }
  if (schemaVersion === CANONICAL_TAB_RESULT_V2_VERSION) {
    return validateCanonicalTabResultV2(value);
  }
  dispatchFailure('UNSUPPORTED_CANONICAL_VERSION', 'UNREGISTERED_EXACT_VERSION', {
    schemaVersion,
  });
}

module.exports = {
  CanonicalTabResultDispatchError,
  dispatchCanonicalTabResult,
};