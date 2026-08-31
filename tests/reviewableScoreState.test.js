'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  REVIEW_DISPOSITION,
  SCORE_ROUTE,
  SCORE_STATUS,
  SOURCE_REVIEW_AVAILABILITY,
  buildScoreState,
} = require('../src/app/reviewableScoreState');

const safeSource = SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN;

function reviewableIssue() {
  return {
    severity: 'error',
    category: 'semantic',
    code: 'OMR_MISSING_DURATION',
    message: 'The duration is missing.',
    reviewDisposition: REVIEW_DISPOSITION,
    location: { measure: '12', eventIndex: 3, sourceEventId: 'P1:measure:11:note:3' },
  };
}

test('POLY_V2 and REVIEW_REQUIRED are a valid independent route/status combination', () => {
  const state = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    sourceReviewAvailability: safeSource,
    issues: [reviewableIssue()],
  });

  assert.equal(state.status, SCORE_STATUS.REVIEW_REQUIRED);
  assert.equal(state.route, SCORE_ROUTE.POLY_V2);
  assert.equal(state.canProcess, false);
  assert.equal(state.canOpenForReview, true);
  assert.deepEqual(state.issues[0].location, {
    measure: '12', measureIndex: null, eventIndex: 3, sourceEventId: 'P1:measure:11:note:3',
  });
  assert.equal(Object.isFrozen(state), true);
});

test('warnings preserve PASS and do not turn an existing successful route into review', () => {
  const state = buildScoreState({
    route: SCORE_ROUTE.MONO_V1,
    sourceReviewAvailability: safeSource,
    issues: [{ severity: 'warning', category: 'quality', code: 'DISPLAY_METADATA_IGNORED' }],
  });

  assert.equal(state.status, SCORE_STATUS.PASS);
  assert.equal(state.canProcess, true);
  assert.equal(state.canOpenForReview, false);
});

test('hard safety issues take precedence over reviewable issues', () => {
  const state = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    sourceReviewAvailability: safeSource,
    issues: [
      reviewableIssue(),
      { severity: 'error', category: 'safety', code: 'XML_ENTITY_FORBIDDEN' },
    ],
  });

  assert.equal(state.status, SCORE_STATUS.BLOCKED);
  assert.equal(state.canOpenForReview, false);
});

test('an unclassified capability or content error remains BLOCKED by default', () => {
  const state = buildScoreState({
    route: SCORE_ROUTE.UNRESOLVED,
    sourceReviewAvailability: safeSource,
    issues: [{ severity: 'error', category: 'capability', code: 'UNSUPPORTED_NOTATION' }],
  });

  assert.equal(state.status, SCORE_STATUS.BLOCKED);
});

test('review requires a safely available immutable source', () => {
  const state = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.NOT_AVAILABLE,
    issues: [reviewableIssue()],
  });

  assert.equal(state.status, SCORE_STATUS.BLOCKED);
  assert.equal(state.canOpenForReview, false);
});
