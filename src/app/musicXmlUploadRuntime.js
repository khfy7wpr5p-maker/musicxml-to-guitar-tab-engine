'use strict';

// Preserve the production base runtime and layer bounded single-pass diagnostic
// policies on the public path. Both collectors are active while the base call
// runs, so neither policy reparses caller bytes or escapes the processing budget.
const baseRuntime = require('./musicXmlUploadRuntimeBase');
const {
  collectPerformanceMetadataRuntimeIssues,
} = require('./polyPerformanceMetadataRuntimeDiagnostics');
const {
  collectFingeringRuntimeIssues,
} = require('./polyFingeringRuntimeDiagnostics');
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
      issue.details?.rawLexeme ?? null,
      issue.details?.rawPerMinute ?? null,
      issue.details?.rawSoundTempo ?? null,
    ]);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(issue);
  }
  return merged;
}

function processMusicXmlUpload(upload, options = {}, runtime = null) {
  const fingeringCollected = collectFingeringRuntimeIssues(() => (
    collectPerformanceMetadataRuntimeIssues(
      () => baseRuntime.processMusicXmlUpload(upload, options, runtime),
    )
  ));
  const performanceCollected = fingeringCollected.result;
  const result = performanceCollected.result;
  const policyIssues = mergeIssues(
    performanceCollected.issues,
    fingeringCollected.issues,
  );
  if (
    result.status !== SCORE_STATUS.PASS
    || result.route !== SCORE_ROUTE.POLY_V2
    || policyIssues.length === 0
  ) {
    return result;
  }

  const issues = mergeIssues(result.preflight?.issues || [], policyIssues);
  const scoreState = buildScoreState({
    route: SCORE_ROUTE.POLY_V2,
    issues,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
  });

  if (scoreState.status === SCORE_STATUS.REVIEW_REQUIRED) {
    return deepFreeze({
      ...result,
      status: SCORE_STATUS.REVIEW_REQUIRED,
      preflight: {
        ...result.preflight,
        status: 'REVIEW_REQUIRED',
        canProcess: false,
        issues,
      },
      canonicalTabResult: null,
      musicXml: null,
    });
  }

  if (scoreState.status !== SCORE_STATUS.PASS) {
    throw new baseRuntime.MusicXmlUploadRuntimeError(
      'Bounded runtime diagnostics produced an unexpected score state.',
      'INVALID_RUNTIME_DIAGNOSTIC_SCORE_STATE',
      { status: scoreState.status },
    );
  }

  return deepFreeze({
    ...result,
    status: SCORE_STATUS.PASS,
    preflight: {
      ...result.preflight,
      status: 'WARNING',
      canProcess: true,
      issues,
    },
  });
}

module.exports = {
  ...baseRuntime,
  processMusicXmlUpload,
};