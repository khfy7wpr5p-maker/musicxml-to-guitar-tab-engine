'use strict';

const GUITARSET_SHADOW_COVERAGE_GATE_VERSION = '1.0.0';
const MIN_DETERMINISM_REPETITIONS = 10;

class GuitarSetShadowCoverageGateError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'GuitarSetShadowCoverageGateError';
    this.code = 'GUITARSET_SHADOW_COVERAGE_HARD_STOP';
    this.details = Object.freeze({ ...details });
  }
}

function hardStop(message, details = {}) {
  throw new GuitarSetShadowCoverageGateError(message, details);
}

function assertRecord(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    hardStop(`${field} must be an object.`, { field });
  }
  return value;
}

function assertNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    hardStop(`${field} must be a non-negative safe integer.`, { field, value });
  }
  return value;
}

function assertRate(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    hardStop(`${field} must be a finite rate from 0 to 1.`, { field, value });
  }
  return value;
}

function normalizeRate(numerator, denominator) {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(12));
}

function assertAuthorityClosed(evidence) {
  const authorityFields = [
    'runtimeConnectionAuthorized',
    'authoritativeDecisionEffectAuthorized',
    'canonicalResultEffectAuthorized',
    'tabOutputEffectAuthorized',
    'productionAuthorized',
  ];
  for (const field of authorityFields) {
    if (evidence[field] !== false) {
      hardStop('Shadow coverage review requires every authority boundary to remain closed.', {
        field,
        actual: evidence[field],
      });
    }
  }
}

function evaluateGuitarSetShadowCoverage({ evidence, determinism }) {
  assertRecord(evidence, 'evidence');
  assertRecord(evidence.metrics, 'evidence.metrics');
  assertRecord(determinism, 'determinism');

  const metrics = evidence.metrics;
  const totalGroupCount = assertNonNegativeInteger(metrics.totalGroupCount, 'metrics.totalGroupCount');
  const scoredGroupCount = assertNonNegativeInteger(metrics.scoredGroupCount, 'metrics.scoredGroupCount');
  const noCandidateGroupCount = assertNonNegativeInteger(
    metrics.noCandidateGroupCount,
    'metrics.noCandidateGroupCount',
  );
  const modelDomainIncompleteGroupCount = assertNonNegativeInteger(
    metrics.modelDomainIncompleteGroupCount,
    'metrics.modelDomainIncompleteGroupCount',
  );
  const baselineComparableGroupCount = assertNonNegativeInteger(
    metrics.baselineComparableGroupCount,
    'metrics.baselineComparableGroupCount',
  );
  const top1AgreementCount = assertNonNegativeInteger(
    metrics.top1AgreementCount,
    'metrics.top1AgreementCount',
  );
  const disagreementCount = assertNonNegativeInteger(
    metrics.disagreementCount,
    'metrics.disagreementCount',
  );

  if (totalGroupCount < 1) {
    hardStop('Coverage review requires at least one controlled shadow group.');
  }
  if (scoredGroupCount + noCandidateGroupCount + modelDomainIncompleteGroupCount !== totalGroupCount) {
    hardStop('Controlled shadow group accounting is inconsistent.', {
      totalGroupCount,
      scoredGroupCount,
      noCandidateGroupCount,
      modelDomainIncompleteGroupCount,
    });
  }
  if (baselineComparableGroupCount > scoredGroupCount) {
    hardStop('Baseline-comparable groups cannot exceed scored groups.');
  }
  if (top1AgreementCount + disagreementCount !== baselineComparableGroupCount) {
    hardStop('Agreement/disagreement accounting does not match comparable groups.');
  }

  const candidateCountPreservationRate = assertRate(
    metrics.candidateCountPreservationRate,
    'metrics.candidateCountPreservationRate',
  );
  if (candidateCountPreservationRate !== 1) {
    hardStop('Shadow execution changed or lost authoritative candidates.', {
      candidateCountPreservationRate,
    });
  }
  if (assertNonNegativeInteger(metrics.shadowErrorCount, 'metrics.shadowErrorCount') !== 0) {
    hardStop('Shadow execution reported errors.');
  }

  const repetitions = assertNonNegativeInteger(determinism.repetitions, 'determinism.repetitions');
  if (determinism.deterministic !== true || repetitions < MIN_DETERMINISM_REPETITIONS) {
    hardStop('Shadow determinism evidence is insufficient.', {
      deterministic: determinism.deterministic,
      repetitions,
      minimumRepetitions: MIN_DETERMINISM_REPETITIONS,
    });
  }

  assertAuthorityClosed(evidence);

  const candidateBearingGroupCount = totalGroupCount - noCandidateGroupCount;
  const candidateBearingCoverageRate = normalizeRate(scoredGroupCount, candidateBearingGroupCount);
  const modelDomainIncompleteRate = normalizeRate(
    modelDomainIncompleteGroupCount,
    candidateBearingGroupCount,
  );
  const noScoreGroupCount = noCandidateGroupCount + modelDomainIncompleteGroupCount;
  const noScoreGroupRate = normalizeRate(noScoreGroupCount, totalGroupCount);
  const scorableGroupRate = normalizeRate(scoredGroupCount, totalGroupCount);

  if (metrics.scorableGroupRate !== scorableGroupRate) {
    hardStop('Stored scorableGroupRate does not match controlled group counts.', {
      expected: scorableGroupRate,
      actual: metrics.scorableGroupRate,
    });
  }
  if (metrics.noCandidateGroupRate !== normalizeRate(noCandidateGroupCount, totalGroupCount)) {
    hardStop('Stored noCandidateGroupRate does not match controlled group counts.');
  }
  if (
    metrics.modelDomainIncompleteRate
    !== normalizeRate(modelDomainIncompleteGroupCount, totalGroupCount)
  ) {
    hardStop('Stored modelDomainIncompleteRate does not match controlled group counts.');
  }

  const coverageComplete = modelDomainIncompleteGroupCount === 0;
  const status = coverageComplete
    ? 'CONTROLLED_MODEL_DOMAIN_COVERAGE_COMPLETE_NON_AUTHORITATIVE'
    : 'HOLD_MODEL_DOMAIN_INCOMPLETE';

  return Object.freeze({
    contractVersion: GUITARSET_SHADOW_COVERAGE_GATE_VERSION,
    status,
    coverageComplete,
    totalGroupCount,
    candidateBearingGroupCount,
    scoredGroupCount,
    noCandidateGroupCount,
    modelDomainIncompleteGroupCount,
    candidateBearingCoverageRate,
    modelDomainIncompleteRate,
    scorableGroupRate,
    noScoreGroupCount,
    noScoreGroupRate,
    baselineComparableGroupCount,
    top1AgreementCount,
    disagreementCount,
    deterministicRepetitions: repetitions,
    candidateCountPreservationRate,
    shadowErrorCount: 0,
    promotionAuthorized: false,
    runtimeConnectionAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    productionAuthorized: false,
  });
}

module.exports = {
  GUITARSET_SHADOW_COVERAGE_GATE_VERSION,
  MIN_DETERMINISM_REPETITIONS,
  GuitarSetShadowCoverageGateError,
  evaluateGuitarSetShadowCoverage,
};
