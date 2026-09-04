'use strict';

const { types: { isProxy } } = require('node:util');
const {
  buildOmrReviewScoreState,
} = require('./omrReviewEvidence');
const {
  SCORE_STATUS,
} = require('./reviewableScoreState');

const STAGE08_REENTRY_REVIEW_GATE_VERSION = '1.0.0';
const STAGE08_REENTRY_REVIEW_EVIDENCE_DOCUMENT_TYPE = 'Stage08ReentryReviewEvidence';
const MAX_ISSUES = 128;
const MAX_ID_LENGTH = 160;

class Stage08ReentryReviewGateError extends Error {
  constructor(message, code = 'INVALID_STAGE08_REENTRY_REVIEW_EVIDENCE', details = {}) {
    super(message);
    this.name = 'Stage08ReentryReviewGateError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

function fail(message, code, details = {}) {
  throw new Stage08ReentryReviewGateError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactFields(value, fields, label) {
  if (!isPlainObject(value)) fail(`${label} must be a non-proxy plain object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail(`${label} must not contain symbol keys.`);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(`${label}.${key} must be an enumerable data property.`);
    }
  }
  const observed = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) {
    fail(`${label} must contain exactly the required fields.`, 'INVALID_STAGE08_REENTRY_REVIEW_EVIDENCE', {
      observed,
      expected,
    });
  }
  return descriptors;
}

function id(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ID_LENGTH
    || value !== value.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)
  ) {
    fail(`${field} must be a bounded stable identifier.`, 'INVALID_STAGE08_REENTRY_REVIEW_EVIDENCE', { field });
  }
  return value;
}

function digest(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${field} must be a lowercase SHA-256 digest.`, 'INVALID_STAGE08_REENTRY_REVIEW_EVIDENCE', { field });
  }
  return value;
}

function normalizeEvidence(value, execution, revalidatedRevision) {
  const descriptors = exactFields(
    value,
    [
      'documentType',
      'contractVersion',
      'sourceId',
      'revalidatedRevisionId',
      'correctedSha256',
      'sourceReviewAvailability',
      'issuePayloads',
    ],
    'reentryReviewEvidence',
  );
  if (
    descriptors.documentType.value !== STAGE08_REENTRY_REVIEW_EVIDENCE_DOCUMENT_TYPE
    || descriptors.contractVersion.value !== STAGE08_REENTRY_REVIEW_GATE_VERSION
  ) {
    fail('Stage 08 re-entry review evidence contract is unsupported.');
  }

  const sourceId = id(descriptors.sourceId.value, 'reentryReviewEvidence.sourceId');
  const revalidatedRevisionId = id(
    descriptors.revalidatedRevisionId.value,
    'reentryReviewEvidence.revalidatedRevisionId',
  );
  const correctedSha256 = digest(
    descriptors.correctedSha256.value,
    'reentryReviewEvidence.correctedSha256',
  );
  const issuePayloads = descriptors.issuePayloads.value;
  if (!Array.isArray(issuePayloads) || isProxy(issuePayloads) || issuePayloads.length === 0 || issuePayloads.length > MAX_ISSUES) {
    fail('reentryReviewEvidence.issuePayloads must be a bounded non-empty array.');
  }

  if (
    sourceId !== execution.sourceIdentity?.sourceId
    || correctedSha256 !== execution.materializationEvidence?.correctedSha256
    || sourceId !== revalidatedRevision?.original_source?.source_id
    || revalidatedRevisionId !== revalidatedRevision?.revision_id
  ) {
    fail(
      'Stage 08 re-entry review evidence does not match the exact corrected revision.',
      'STAGE08_REENTRY_REVIEW_IDENTITY_MISMATCH',
      {
        expectedSourceId: revalidatedRevision?.original_source?.source_id ?? null,
        observedSourceId: sourceId,
        expectedRevisionId: revalidatedRevision?.revision_id ?? null,
        observedRevisionId: revalidatedRevisionId,
      },
    );
  }

  return Object.freeze({
    sourceId,
    revalidatedRevisionId,
    correctedSha256,
    sourceReviewAvailability: descriptors.sourceReviewAvailability.value,
    issuePayloads,
  });
}

function applyStage08ReentryReviewEvidence(execution, revalidatedRevision, evidence = null) {
  if (evidence === null || evidence === undefined) return execution;
  if (!execution || execution.status !== SCORE_STATUS.BLOCKED) {
    fail(
      'Stage 08 re-entry review evidence may only classify a bounded BLOCKED re-entry.',
      'STAGE08_REENTRY_REVIEW_NOT_APPLICABLE',
      { status: execution?.status ?? null },
    );
  }
  if (execution.canonicalTabResult !== null || execution.musicXml !== null || execution.approvedRevision !== null) {
    fail('Blocked Stage 08 re-entry must not carry canonical success state.', 'STAGE08_REENTRY_REVIEW_NOT_APPLICABLE');
  }

  const normalized = normalizeEvidence(evidence, execution, revalidatedRevision);
  const reviewState = buildOmrReviewScoreState({
    route: execution.route,
    issuePayloads: normalized.issuePayloads,
    sourceReviewAvailability: normalized.sourceReviewAvailability,
  });

  if (reviewState.status !== SCORE_STATUS.REVIEW_REQUIRED) {
    return Object.freeze({
      ...execution,
      reentryReviewState: reviewState,
    });
  }

  return Object.freeze({
    ...execution,
    status: SCORE_STATUS.REVIEW_REQUIRED,
    reentryReviewState: reviewState,
    canonicalTabResult: null,
    musicXml: null,
    approvedRevision: null,
  });
}

module.exports = {
  STAGE08_REENTRY_REVIEW_EVIDENCE_DOCUMENT_TYPE,
  STAGE08_REENTRY_REVIEW_GATE_VERSION,
  Stage08ReentryReviewGateError,
  applyStage08ReentryReviewEvidence,
};
