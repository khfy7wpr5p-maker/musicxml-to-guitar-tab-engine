'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SCORE_ROUTE,
  SCORE_STATUS,
  SOURCE_REVIEW_AVAILABILITY,
} = require('../src/app/reviewableScoreState');
const {
  OMR_REVIEW_EVIDENCE_CONTRACT_VERSION,
  buildOmrReviewScoreState,
  createOmrEvidenceIssue,
} = require('../src/app/omrReviewEvidence');

function payload(overrides = {}) {
  return {
    issue_id: 'omr-issue-1',
    category: 'semantic',
    code: 'OMR_SUSPECTED_PITCH',
    severity: 'error',
    measure: '12',
    staff: 1,
    voice: 2,
    event_id_or_location: {
      measureIndex: 11,
      eventIndex: 3,
      sourceEventId: 'P1:measure:11:note:3',
      bbox: [10, 20, 30, 40],
    },
    observed_value: { pitch: 'F#4' },
    confidence_or_evidence_if_available: { confidence: 0.61, detector: 'omr' },
    suggested_review_action: 'VERIFY_PITCH',
    source_provenance: { engine: 'test-omr', source: 'fixture.musicxml' },
    ...overrides,
  };
}

test('reviewable OMR evidence produces POLY_V2 + REVIEW_REQUIRED without inventing a replacement value', () => {
  const state = buildOmrReviewScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issuePayloads: [payload()],
  });

  assert.equal(state.contractVersion, OMR_REVIEW_EVIDENCE_CONTRACT_VERSION);
  assert.equal(state.status, SCORE_STATUS.REVIEW_REQUIRED);
  assert.equal(state.route, SCORE_ROUTE.POLY_V2);
  assert.equal(state.canProcess, false);
  assert.equal(state.canOpenForReview, true);
  assert.deepEqual(state.issues[0].location, {
    measure: '12',
    measureIndex: 11,
    eventIndex: 3,
    sourceEventId: 'P1:measure:11:note:3',
  });
  assert.deepEqual(state.issues[0].reviewEvidence.observed_value, { pitch: 'F#4' });
  assert.equal(Object.hasOwn(state.issues[0].reviewEvidence, 'suggested_value'), false);
  assert.equal(Object.isFrozen(state.issues[0].reviewEvidence), true);
});

test('missing semantic data may remain null and still be reviewable when stable location evidence exists', () => {
  const state = buildOmrReviewScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issuePayloads: [payload({
      issue_id: 'omr-missing-duration',
      code: 'OMR_MISSING_OR_UNCERTAIN_DURATION',
      observed_value: null,
      confidence_or_evidence_if_available: null,
      suggested_review_action: 'VERIFY_DURATION',
    })],
  });

  assert.equal(state.status, SCORE_STATUS.REVIEW_REQUIRED);
  assert.equal(state.issues[0].reviewEvidence.observed_value, null);
  assert.equal(state.issues[0].reviewEvidence.confidence_or_evidence_if_available, null);
});

test('missing note evidence may use measure-level location without fabricating an event id', () => {
  const state = buildOmrReviewScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issuePayloads: [payload({
      issue_id: 'omr-missing-note',
      category: 'content',
      code: 'OMR_MISSING_NOTE',
      event_id_or_location: null,
      observed_value: null,
      suggested_review_action: 'VERIFY_AND_ADD_NOTE_IF_CONFIRMED',
    })],
  });

  assert.equal(state.status, SCORE_STATUS.REVIEW_REQUIRED);
  assert.equal(state.issues[0].location.measure, '12');
  assert.equal(state.issues[0].location.sourceEventId, null);
});

test('hard-block OMR evidence wins over reviewable evidence', () => {
  const state = buildOmrReviewScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issuePayloads: [
      payload(),
      payload({
        issue_id: 'omr-hard-block',
        category: 'parse',
        code: 'OMR_UNPARSEABLE_DOCUMENT',
        measure: null,
        staff: null,
        voice: null,
        event_id_or_location: null,
        observed_value: null,
        confidence_or_evidence_if_available: null,
        suggested_review_action: 'STOP_AND_REIMPORT_SOURCE',
      }),
    ],
  });

  assert.equal(state.status, SCORE_STATUS.BLOCKED);
  assert.equal(state.canOpenForReview, false);
});

test('reviewable OMR evidence stays blocked when immutable source is not safely available', () => {
  const state = buildOmrReviewScoreState({
    route: SCORE_ROUTE.POLY_V2,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.NOT_AVAILABLE,
    issuePayloads: [payload()],
  });

  assert.equal(state.status, SCORE_STATUS.BLOCKED);
  assert.equal(state.canOpenForReview, false);
});

test('unknown OMR codes fail closed instead of becoming reviewable', () => {
  assert.throws(
    () => createOmrEvidenceIssue(payload({ code: 'OMR_UNKNOWN_GUESSABLE_THING' })),
    /not allow-listed/,
  );
});

test('reviewable codes cannot be smuggled through a hard-block or capability category', () => {
  assert.throws(
    () => createOmrEvidenceIssue(payload({ category: 'capability' })),
    /reviewable Stage 01 category/,
  );
  assert.throws(
    () => createOmrEvidenceIssue(payload({ category: 'safety' })),
    /reviewable Stage 01 category/,
  );
});

test('reviewable evidence requires a stable measure or event/location reference', () => {
  assert.throws(
    () => createOmrEvidenceIssue(payload({
      measure: null,
      staff: 1,
      voice: 1,
      event_id_or_location: null,
    })),
    /stable measure or event\/location reference/,
  );
});

test('payload shape is exact and evidence values reject executable/accessor-style data', () => {
  const withExtra = { ...payload(), candidate_pitch: 'G4' };
  assert.throws(
    () => createOmrEvidenceIssue(withExtra),
    /exactly the Stage 04 required evidence fields/,
  );

  const observed = {};
  Object.defineProperty(observed, 'pitch', {
    enumerable: true,
    get() { return 'G4'; },
  });
  assert.throws(
    () => createOmrEvidenceIssue(payload({ observed_value: observed })),
    /enumerable data property/,
  );
});

test('evidence is copied, deeply frozen, deterministic and does not mutate producer input', () => {
  const original = payload();
  const before = JSON.stringify(original);
  const first = buildOmrReviewScoreState({ route: SCORE_ROUTE.POLY_V2, issuePayloads: [original] });
  const second = buildOmrReviewScoreState({ route: SCORE_ROUTE.POLY_V2, issuePayloads: [original] });

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(original), before);
  assert.notEqual(first.issues[0].reviewEvidence.source_provenance, original.source_provenance);
  assert.equal(Object.isFrozen(first.issues[0].reviewEvidence.source_provenance), true);

  original.source_provenance.engine = 'mutated-after-build';
  assert.equal(first.issues[0].reviewEvidence.source_provenance.engine, 'test-omr');
});
