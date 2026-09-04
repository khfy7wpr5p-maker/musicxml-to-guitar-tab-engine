'use strict';

const { types: { isProxy } } = require('node:util');
const { createStage08ReviewPort } = require('./stage08ReviewPort');
const {
  continueStage08ProductionToCanonicalTab,
} = require('./stage08ProductionContinuation');

const STAGE08_PRODUCTION_REVIEW_PORT_VERSION = '1.0.0';

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createStage08ProductionReviewPort({
  reviewPort,
  getCurrentSession,
  buildContinuationRequest,
  options = {},
  runtime = null,
}) {
  if (!isPlainObject(options)) throw new TypeError('Stage 08 production review-port options must be a plain object.');
  return createStage08ReviewPort({
    reviewPort,
    getCurrentSession,
    buildContinuationRequest,
    continuation: continueStage08ProductionToCanonicalTab,
    options,
    runtime,
  });
}

module.exports = {
  STAGE08_PRODUCTION_REVIEW_PORT_VERSION,
  createStage08ProductionReviewPort,
};
