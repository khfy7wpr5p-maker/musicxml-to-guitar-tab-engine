'use strict';

// Preserve the production base runtime and layer bounded single-pass diagnostic
// policies on the public path. Collectors are active while the base call runs,
// so no policy reparses caller bytes or escapes the processing budget.
const baseRuntime = require('./musicXmlUploadRuntimeBase');
const {
  collectSourceNotationRuntimeIssues,
} = require('./polySourceNotationRuntimeDiagnostics');
const {
  collectPerformanceMetadataRuntimeIssues,
} = require('./polyPerformanceMetadataRuntimeDiagnostics');
const {
  collectFingeringRuntimeIssues,
} = require('./polyFingeringRuntimeDiagnostics');
const {
  collectSlurRuntimeIssues,
} = require('./polySlurRuntimeDiagnostics');
const {
  MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION,
  decorateUploadResultWithCapabilities,
} = require('./reviewRequiredCapabilityContract');
const {
  SCORE_ROUTE,
  SCORE_STATUS,
  SOURCE_REVIEW_AVAILABILITY,
  buildScoreState,
} = require('./reviewableScoreState');

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function finalize(result) {
  return decorateUploadResultWithCapabilities(result);
}

function mergeIssues(...issueLists) {
  const merged = [];
  const keys = new Set();
  for (const issue of issueLists.flat()) {
    const location = issue.location || {};
    const key = JSON.stringify([
      issue.severity,
      issue.category,
      issue.code,
      location.measure ?? null,
      location.measureIndex ?? null,
      location.eventIndex ?? null,
      location.sourceEventId ?? null,
      issue.details?.feature ?? null,
      issue.details?.rawLexeme ?? null,
      issue.details?.rawPerMinute ?? null,
      issue.details?.rawSoundTempo ?? null,
      issue.details?.slurNumber ?? null,
      issue.details?.slurType ?? null,
    ]);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(issue);
  }
  return merged;
}

function promoteBoundedRepeatReview(result) {
  const issues = Array.isArray(result.preflight?.issues) ? result.preflight.issues : [];
  const exactReviewableRepeat = (
    result.status === SCORE_STATUS.BLOCKED
    && result.route === SCORE_ROUTE.POLY_V2
    && issues.length > 0
    && issues.every((issue) => (
      issue.code === 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE'
      && issue.category === 'capability'
      && issue.details?.feature === 'barline-repeat'
      && issue.details?.reviewDisposition === 'REVIEW_REQUIRED'
    ))
  );
  if (!exactReviewableRepeat) return result;

  const reviewIssues = issues.map((issue) => ({
    ...issue,
    category: 'semantic',
    reviewDisposition: 'REVIEW_REQUIRED',
  }));
  const scoreState = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issues: reviewIssues,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
  });
  if (scoreState.status !== SCORE_STATUS.REVIEW_REQUIRED) {
    throw new baseRuntime.MusicXmlUploadRuntimeError(
      'Bounded repeat review evidence produced an unexpected score state.',
      'INVALID_REPEAT_REVIEW_SCORE_STATE',
      { status: scoreState.status },
    );
  }

  return deepFreeze({
    ...result,
    status: SCORE_STATUS.REVIEW_REQUIRED,
    preflight: {
      ...result.preflight,
      status: 'REVIEW_REQUIRED',
      canProcess: false,
      issues: reviewIssues,
    },
    canonicalTabResult: null,
    musicXml: null,
  });
}

function promoteBoundedEndingReview(result) {
  const issues = Array.isArray(result.preflight?.issues) ? result.preflight.issues : [];
  const exactReviewableEnding = (
    result.status === SCORE_STATUS.BLOCKED
    && result.route === SCORE_ROUTE.POLY_V2
    && issues.length > 0
    && issues.every((issue) => (
      issue.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
      && issue.category === 'capability'
      && issue.details?.feature === 'barline-ending'
      && issue.details?.reviewDisposition === 'REVIEW_REQUIRED'
      && issue.details?.reason === 'ENDING_PLAYBACK_POLICY_REQUIRES_REVIEW'
    ))
  );
  if (!exactReviewableEnding) return result;

  const reviewIssues = issues.map((issue) => ({
    ...issue,
    category: 'semantic',
    reviewDisposition: 'REVIEW_REQUIRED',
  }));
  const scoreState = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issues: reviewIssues,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
  });
  if (scoreState.status !== SCORE_STATUS.REVIEW_REQUIRED) {
    throw new baseRuntime.MusicXmlUploadRuntimeError(
      'Bounded ending review evidence produced an unexpected score state.',
      'INVALID_ENDING_REVIEW_SCORE_STATE',
      { status: scoreState.status },
    );
  }

  return deepFreeze({
    ...result,
    status: SCORE_STATUS.REVIEW_REQUIRED,
    preflight: {
      ...result.preflight,
      status: 'REVIEW_REQUIRED',
      canProcess: false,
      issues: reviewIssues,
    },
    canonicalTabResult: null,
    musicXml: null,
  });
}

function promoteBoundedDirectionReview(result) {
  const issues = Array.isArray(result.preflight?.issues) ? result.preflight.issues : [];
  const exactReviewableDirection = (
    result.status === SCORE_STATUS.BLOCKED
    && result.route === SCORE_ROUTE.POLY_V2
    && issues.length > 0
    && issues.every((issue) => (
      issue.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
      && issue.category === 'capability'
      && issue.details?.feature === 'direction-review'
      && issue.details?.reviewDisposition === 'REVIEW_REQUIRED'
      && issue.details?.reason === 'PERFORMANCE_DIRECTION_REQUIRES_REVIEW'
    ))
  );
  if (!exactReviewableDirection) return result;

  const reviewIssues = issues.map((issue) => ({
    ...issue,
    category: 'semantic',
    reviewDisposition: 'REVIEW_REQUIRED',
  }));
  const scoreState = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issues: reviewIssues,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
  });
  if (scoreState.status !== SCORE_STATUS.REVIEW_REQUIRED) {
    throw new baseRuntime.MusicXmlUploadRuntimeError(
      'Bounded direction review evidence produced an unexpected score state.',
      'INVALID_DIRECTION_REVIEW_SCORE_STATE',
      { status: scoreState.status },
    );
  }
  return deepFreeze({
    ...result,
    status: SCORE_STATUS.REVIEW_REQUIRED,
    preflight: {
      ...result.preflight,
      status: 'REVIEW_REQUIRED',
      canProcess: false,
      issues: reviewIssues,
    },
    canonicalTabResult: null,
    musicXml: null,
  });
}

function promoteUnplayablePhysicalPointReview(result) {
  const issues = Array.isArray(result.preflight?.issues) ? result.preflight.issues : [];
  const exactPhysicalReview = (
    result.status === SCORE_STATUS.BLOCKED
    && result.route === SCORE_ROUTE.POLY_V2
    && issues.length > 0
    && issues.every((issue) => (
      issue.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
      && issue.details?.reason === 'UNPLAYABLE_PHYSICAL_POINT'
      && Number.isInteger(issue.details?.measureIndex)
      && Number.isInteger(issue.details?.timeDivisions)
    ))
  );
  if (!exactPhysicalReview) return result;

  const reviewIssues = issues.map((issue) => ({
    ...issue,
    category: 'semantic',
    reviewDisposition: 'REVIEW_REQUIRED',
    details: {
      ...issue.details,
      originalCategory: issue.category,
    },
  }));
  const scoreState = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issues: reviewIssues,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
  });
  if (scoreState.status !== SCORE_STATUS.REVIEW_REQUIRED) {
    throw new baseRuntime.MusicXmlUploadRuntimeError(
      'Physical-point review evidence produced an unexpected score state.',
      'INVALID_PHYSICAL_POINT_REVIEW_SCORE_STATE',
      { status: scoreState.status },
    );
  }
  return deepFreeze({
    ...result,
    status: SCORE_STATUS.REVIEW_REQUIRED,
    preflight: {
      ...result.preflight,
      status: 'REVIEW_REQUIRED',
      canProcess: false,
      issues: reviewIssues,
    },
    canonicalTabResult: null,
    musicXml: null,
  });
}

function processMusicXmlUpload(upload, options = {}, runtime = null) {
  const sourceNotationCollected = collectSourceNotationRuntimeIssues(() => (
    collectSlurRuntimeIssues(() => (
      collectFingeringRuntimeIssues(() => (
        collectPerformanceMetadataRuntimeIssues(
          () => baseRuntime.processMusicXmlUpload(upload, options, runtime),
        )
      ))
    ))
  ));
  const slurCollected = sourceNotationCollected.result;
  const fingeringCollected = slurCollected.result;
  const performanceCollected = fingeringCollected.result;
  const result = promoteUnplayablePhysicalPointReview(
    promoteBoundedDirectionReview(
      promoteBoundedEndingReview(
        promoteBoundedRepeatReview(performanceCollected.result),
      ),
    ),
  );
  const policyIssues = mergeIssues(
    performanceCollected.issues,
    fingeringCollected.issues,
    slurCollected.issues,
    sourceNotationCollected.issues,
  );
  if (
    result.status !== SCORE_STATUS.PASS
    || result.route !== SCORE_ROUTE.POLY_V2
    || policyIssues.length === 0
  ) {
    return finalize(result);
  }

  const issues = mergeIssues(result.preflight?.issues || [], policyIssues);
  const scoreState = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issues,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
  });

  if (scoreState.status === SCORE_STATUS.REVIEW_REQUIRED) {
    // The conversion already completed successfully. Keep those artifacts as a
    // review-only provisional surface instead of deleting them merely because
    // a diagnostic requires teacher attention. Export authority stays false in
    // the capability contract until review is resolved.
    return finalize(deepFreeze({
      ...result,
      status: SCORE_STATUS.REVIEW_REQUIRED,
      preflight: {
        ...result.preflight,
        status: 'REVIEW_REQUIRED',
        canProcess: false,
        canOpenForReview: true,
        issues,
      },
    }));
  }

  if (scoreState.status !== SCORE_STATUS.PASS) {
    throw new baseRuntime.MusicXmlUploadRuntimeError(
      'Bounded runtime diagnostics produced an unexpected score state.',
      'INVALID_RUNTIME_DIAGNOSTIC_SCORE_STATE',
      { status: scoreState.status },
    );
  }

  return finalize(deepFreeze({
    ...result,
    status: SCORE_STATUS.PASS,
    preflight: {
      ...result.preflight,
      status: 'WARNING',
      canProcess: true,
      issues,
    },
  }));
}

module.exports = {
  ...baseRuntime,
  MUSICXML_UPLOAD_RUNTIME_VERSION: MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION,
  processMusicXmlUpload,
};
