'use strict';

// This is an application contract. It intentionally has no package-root export.
const SCORE_STATUS = Object.freeze({
  PASS: 'PASS',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
});

const SCORE_ROUTE = Object.freeze({
  MONO_V1: 'MONO_V1',
  POLY_V2: 'POLY_V2',
  UNRESOLVED: 'UNRESOLVED',
});

const SOURCE_REVIEW_AVAILABILITY = Object.freeze({
  SAFE_TO_OPEN: 'SAFE_TO_OPEN',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
});

const REVIEW_DISPOSITION = 'REVIEW_REQUIRED';
const HARD_BLOCK_CATEGORIES = new Set(['safety', 'parse', 'structure', 'transport']);
const REVIEWABLE_CATEGORIES = new Set(['content', 'semantic', 'quality']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKnownRoute(route) {
  if (!Object.values(SCORE_ROUTE).includes(route)) {
    throw new TypeError('route must be a known score route.');
  }
}

function assertKnownSourceReviewAvailability(value) {
  if (!Object.values(SOURCE_REVIEW_AVAILABILITY).includes(value)) {
    throw new TypeError('sourceReviewAvailability must be a known source-review availability.');
  }
}

function normalizeLocation(location) {
  if (location === undefined || location === null) {
    return Object.freeze({
      measure: null,
      measureIndex: null,
      eventIndex: null,
      sourceEventId: null,
    });
  }
  if (!isPlainObject(location)) throw new TypeError('issue.location must be a plain object.');
  return Object.freeze({
    measure: location.measure ?? null,
    measureIndex: location.measureIndex ?? null,
    eventIndex: location.eventIndex ?? null,
    sourceEventId: location.sourceEventId ?? null,
  });
}

function normalizeIssue(issue) {
  if (!isPlainObject(issue)) throw new TypeError('issue must be a plain object.');
  for (const field of ['category', 'code', 'severity']) {
    if (typeof issue[field] !== 'string' || issue[field].length === 0) {
      throw new TypeError(`issue.${field} must be a non-empty string.`);
    }
  }
  return Object.freeze({
    severity: issue.severity,
    category: issue.category,
    code: issue.code,
    message: typeof issue.message === 'string' ? issue.message : null,
    reviewDisposition: issue.reviewDisposition === REVIEW_DISPOSITION
      ? REVIEW_DISPOSITION
      : null,
    location: normalizeLocation(issue.location),
  });
}

function isError(issue) {
  return issue.severity === 'error';
}

function isHardBlockIssue(issue) {
  return isError(issue) && HARD_BLOCK_CATEGORIES.has(issue.category);
}

function isExplicitlyReviewableIssue(issue) {
  return isError(issue)
    && REVIEWABLE_CATEGORIES.has(issue.category)
    && issue.reviewDisposition === REVIEW_DISPOSITION;
}

function buildScoreState({ route, issues = [], sourceReviewAvailability }) {
  assertKnownRoute(route);
  assertKnownSourceReviewAvailability(sourceReviewAvailability);
  if (!Array.isArray(issues)) throw new TypeError('issues must be an array.');

  const normalizedIssues = Object.freeze(issues.map(normalizeIssue));
  const errorIssues = normalizedIssues.filter(isError);
  const hardBlockIssues = errorIssues.filter(isHardBlockIssue);
  const reviewableIssues = errorIssues.filter(isExplicitlyReviewableIssue);

  let status = SCORE_STATUS.PASS;
  let canProcess = true;
  let canOpenForReview = false;

  if (hardBlockIssues.length > 0 || errorIssues.length !== reviewableIssues.length) {
    status = SCORE_STATUS.BLOCKED;
    canProcess = false;
  } else if (reviewableIssues.length > 0) {
    if (sourceReviewAvailability === SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN) {
      status = SCORE_STATUS.REVIEW_REQUIRED;
      canProcess = false;
      canOpenForReview = true;
    } else {
      status = SCORE_STATUS.BLOCKED;
      canProcess = false;
    }
  }

  return Object.freeze({
    status,
    route,
    canProcess,
    canOpenForReview,
    sourceReviewAvailability,
    issues: normalizedIssues,
  });
}

module.exports = {
  SCORE_STATUS,
  SCORE_ROUTE,
  SOURCE_REVIEW_AVAILABILITY,
  REVIEW_DISPOSITION,
  buildScoreState,
  isExplicitlyReviewableIssue,
  isHardBlockIssue,
};
