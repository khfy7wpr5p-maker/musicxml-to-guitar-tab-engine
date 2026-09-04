'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('..');
const {
  SOURCE_REVIEW_AVAILABILITY,
} = require('../src/app/reviewableScoreState');
const {
  STAGE08_REENTRY_REVIEW_EVIDENCE_DOCUMENT_TYPE,
  STAGE08_REENTRY_REVIEW_GATE_VERSION,
  Stage08ReentryReviewGateError,
  applyStage08ReentryReviewEvidence,
} = require('../src/app/stage08ReentryReviewGate');

const CORRECTED_SHA = 'b'.repeat(64);

function revalidatedRevision() {
  return {
    revision_id: 'revalidated-1',
    original_source: { source_id: 'source-1' },
  };
}

function blockedExecution({ category = 'content', code = 'MEASURE_DURATION_MISMATCH', route = 'POLY_V2' } = {}) {
  return Object.freeze({
    status: 'BLOCKED',
    route,
    sourceIdentity: Object.freeze({ sourceId: 'source-1', sha256: 'a'.repeat(64) }),
    materializationEvidence: Object.freeze({ correctedSha256: CORRECTED_SHA }),
    reentry: Object.freeze({
      status: 'BLOCKED',
      route,
      preflight: Object.freeze({
        status: 'BLOCKED',
        canProcess: false,
        issues: Object.freeze([Object.freeze({ category, code })]),
      }),
    }),
    canonicalTabResult: null,
    musicXml: null,
    approvedRevision: null,
  });
}

function issuePayload(overrides = {}) {
  return {
    issue_id: 'omr-issue-1',
    category: 'semantic',
    code: 'OMR_MEASURE_DURATION_MISMATCH',
    severity: 'error',
    measure: '1',
    staff: '1',
    voice: '1',
    event_id_or_location: { sourceEventId: 'event-1', measureIndex: 0, eventIndex: 0 },
    observed_value: { expected: 4, observed: 3 },
    confidence_or_evidence_if_available: { source: 'trusted-revalidation' },
    suggested_review_action: 'Review measure duration and missing/rest events.',
    source_provenance: { sourceId: 'source-1', correctedSha256: CORRECTED_SHA },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    documentType: STAGE08_REENTRY_REVIEW_EVIDENCE_DOCUMENT_TYPE,
    contractVersion: STAGE08_REENTRY_REVIEW_GATE_VERSION,
    sourceId: 'source-1',
    revalidatedRevisionId: 'revalidated-1',
    correctedSha256: CORRECTED_SHA,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
    issuePayloads: [issuePayload()],
    ...overrides,
  };
}

test('trusted Stage 04 OMR evidence may return a resolved semantic/content re-entry to REVIEW_REQUIRED', () => {
  const result = applyStage08ReentryReviewEvidence(
    blockedExecution(),
    revalidatedRevision(),
    evidence(),
  );

  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.reentryReviewState.status, 'REVIEW_REQUIRED');
  assert.equal(result.reentryReviewState.canOpenForReview, true);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.approvedRevision, null);
});

test('playability, capability, safety and unresolved failures cannot be hidden by review evidence', () => {
  for (const execution of [
    blockedExecution({ category: 'playability', code: 'UNPLAYABLE_GUITAR_POSITION' }),
    blockedExecution({ category: 'capability', code: 'UNSUPPORTED_NOTATION' }),
    blockedExecution({ category: 'safety', code: 'XML_SAFETY_FAILURE' }),
    blockedExecution({ category: 'content', code: 'STAGE08_REENTRY_PARSE_FAILED', route: 'UNRESOLVED' }),
  ]) {
    const result = applyStage08ReentryReviewEvidence(execution, revalidatedRevision(), evidence());
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reentryReviewState, null);
    assert.equal(result.approvedRevision, null);
  }
});

test('hard-block Stage 04 evidence remains BLOCKED even on a reviewable underlying content boundary', () => {
  const result = applyStage08ReentryReviewEvidence(
    blockedExecution(),
    revalidatedRevision(),
    evidence({
      issuePayloads: [issuePayload({
        category: 'safety',
        code: 'OMR_RESOURCE_SAFETY_VIOLATION',
      })],
    }),
  );

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reentryReviewState.status, 'BLOCKED');
});

test('review evidence must bind the exact corrected source and revalidated revision', () => {
  for (const [overrides, expectedCode] of [
    [{ sourceId: 'other-source' }, 'STAGE08_REENTRY_REVIEW_IDENTITY_MISMATCH'],
    [{ revalidatedRevisionId: 'other-revision' }, 'STAGE08_REENTRY_REVIEW_IDENTITY_MISMATCH'],
    [{ correctedSha256: 'c'.repeat(64) }, 'STAGE08_REENTRY_REVIEW_IDENTITY_MISMATCH'],
  ]) {
    assert.throws(
      () => applyStage08ReentryReviewEvidence(
        blockedExecution(),
        revalidatedRevision(),
        evidence(overrides),
      ),
      (error) => {
        assert.ok(error instanceof Stage08ReentryReviewGateError);
        assert.equal(error.code, expectedCode);
        return true;
      },
    );
  }
});

test('SAFE_TO_OPEN is required for reviewable evidence to become REVIEW_REQUIRED', () => {
  const result = applyStage08ReentryReviewEvidence(
    blockedExecution(),
    revalidatedRevision(),
    evidence({ sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.NOT_AVAILABLE }),
  );
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reentryReviewState.status, 'BLOCKED');
});

test('Stage 08 re-entry review gate remains internal', () => {
  assert.equal(publicApi.applyStage08ReentryReviewEvidence, undefined);
  assert.equal(publicApi.STAGE08_REENTRY_REVIEW_GATE_VERSION, undefined);
});
