'use strict';

const GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_VERSION = '1.0.0';

class GuitarSetOfflineShadowDiagnosticsError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'GuitarSetOfflineShadowDiagnosticsError';
    this.code = 'GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_HARD_STOP';
    this.details = Object.freeze({ ...details });
  }
}

function hardStop(message, details = {}) {
  throw new GuitarSetOfflineShadowDiagnosticsError(message, details);
}

function assertPlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    hardStop(`${field} must be a plain object.`, { field });
  }
  return value;
}

function assertNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    hardStop(`${field} must be a non-negative integer.`, { field, value });
  }
  return value;
}

function assertSha256(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    hardStop(`${field} must be a lowercase SHA-256 digest.`, { field });
  }
  return value;
}

function normalizedRate(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(12));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function requireClosedAuthority(evidence) {
  const fields = [
    'liveShadowExecutionAuthorized',
    'runtimeConnectionAuthorized',
    'authoritativeDecisionEffectAuthorized',
    'canonicalResultEffectAuthorized',
    'tabOutputEffectAuthorized',
    'checkpointMutationAuthorized',
    'refitAuthorized',
    'productionAuthorized',
  ];
  for (const field of fields) {
    if (evidence[field] !== false) {
      hardStop('Offline shadow authority boundary is not closed.', { field, value: evidence[field] });
    }
  }
}

function requirePrivacySeal(sealPolicy) {
  assertPlainObject(sealPolicy, 'sealPolicy');
  const fields = [
    'historicalEvidenceRecomputationAuthorized',
    'currentRunnerRequiredForVerification',
    'rawMusicXmlIncluded',
    'originalLocalPathIncluded',
    'userFilenameIncluded',
    'teacherLabelsIncluded',
    'validationLabelsIncluded',
    'finalLabelsIncluded',
    'networkTelemetryIncluded',
  ];
  for (const field of fields) {
    if (sealPolicy[field] !== false) {
      hardStop('Immutable evidence privacy/provenance boundary is not closed.', {
        field,
        value: sealPolicy[field],
      });
    }
  }
}

function createGuitarSetOfflineShadowDiagnostics(sealedArtifact) {
  assertPlainObject(sealedArtifact, 'sealedArtifact');
  if (sealedArtifact.documentType !== 'ImmutableControlledOfflineGuitarSetShadowEvidenceSeal') {
    hardStop('Diagnostics require an immutable controlled offline evidence seal.', {
      documentType: sealedArtifact.documentType,
    });
  }
  if (sealedArtifact.schemaVersion !== '1.0.0') {
    hardStop('Unsupported immutable evidence schema.', { schemaVersion: sealedArtifact.schemaVersion });
  }
  requirePrivacySeal(sealedArtifact.sealPolicy);

  const evidence = assertPlainObject(sealedArtifact.evidence, 'sealedArtifact.evidence');
  if (
    evidence.documentType !== 'ControlledOfflineGuitarSetShadowEvidence'
    || evidence.mode !== 'CONTROLLED_OFFLINE_PROJECT_SHADOW_EVIDENCE'
    || evidence.controlledOfflineExecution !== true
  ) {
    hardStop('Evidence is not controlled offline shadow evidence.');
  }
  requireClosedAuthority(evidence);
  assertSha256(evidence.runDigestSha256, 'evidence.runDigestSha256');

  const metrics = assertPlainObject(evidence.metrics, 'evidence.metrics');
  if (!Array.isArray(evidence.fixtureEvidence)) {
    hardStop('evidence.fixtureEvidence must be an array.');
  }

  let totalGroupCount = 0;
  let totalCandidateCount = 0;
  let scoredGroupCount = 0;
  let noCandidateGroupCount = 0;
  let modelDomainIncompleteGroupCount = 0;
  let baselineComparableGroupCount = 0;
  let top1AgreementCount = 0;
  let outOfModelDomainCandidateCount = 0;
  let domainIncompleteCandidateCount = 0;
  const disagreementDiagnostics = [];
  const domainIncompleteDiagnostics = [];
  const observedDisagreementIds = [];
  const margins = [];

  for (const fixture of evidence.fixtureEvidence) {
    assertPlainObject(fixture, 'fixtureEvidence[]');
    if (typeof fixture.evaluationId !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(fixture.evaluationId)) {
      hardStop('Invalid controlled evaluationId.', { evaluationId: fixture.evaluationId });
    }
    assertSha256(fixture.inputSha256, `${fixture.evaluationId}.inputSha256`);
    if (!Array.isArray(fixture.groups)) {
      hardStop('Fixture groups must be an array.', { evaluationId: fixture.evaluationId });
    }

    totalGroupCount += assertNonNegativeInteger(fixture.groupCount, `${fixture.evaluationId}.groupCount`);
    totalCandidateCount += assertNonNegativeInteger(
      fixture.candidateCount,
      `${fixture.evaluationId}.candidateCount`,
    );
    scoredGroupCount += assertNonNegativeInteger(
      fixture.scoredGroupCount,
      `${fixture.evaluationId}.scoredGroupCount`,
    );
    noCandidateGroupCount += assertNonNegativeInteger(
      fixture.noCandidateGroupCount,
      `${fixture.evaluationId}.noCandidateGroupCount`,
    );
    modelDomainIncompleteGroupCount += assertNonNegativeInteger(
      fixture.modelDomainIncompleteGroupCount,
      `${fixture.evaluationId}.modelDomainIncompleteGroupCount`,
    );

    if (fixture.groups.length !== fixture.groupCount) {
      hardStop('Fixture group accounting drift.', { evaluationId: fixture.evaluationId });
    }

    for (const group of fixture.groups) {
      assertPlainObject(group, 'fixtureEvidence[].groups[]');
      const before = assertNonNegativeInteger(
        group.candidateCountBeforeShadow,
        `${fixture.evaluationId}:${group.sourceGroupId}.candidateCountBeforeShadow`,
      );
      const after = assertNonNegativeInteger(
        group.candidateCountAfterShadow,
        `${fixture.evaluationId}:${group.sourceGroupId}.candidateCountAfterShadow`,
      );
      if (before !== after) {
        hardStop('Candidate count mutation detected in sealed shadow evidence.', {
          evaluationId: fixture.evaluationId,
          sourceGroupId: group.sourceGroupId,
          before,
          after,
        });
      }
      assertSha256(group.candidateSetSha256, 'group.candidateSetSha256');
      assertSha256(group.shadowRankingSha256, 'group.shadowRankingSha256');

      if (group.comparison === 'AGREE' || group.comparison === 'DISAGREE') {
        baselineComparableGroupCount += 1;
        if (group.comparison === 'AGREE') {
          top1AgreementCount += 1;
        } else {
          const disagreementId = `${fixture.evaluationId}:${group.sourceGroupId}`;
          observedDisagreementIds.push(disagreementId);
          disagreementDiagnostics.push(Object.freeze({
            disagreementId,
            evaluationId: fixture.evaluationId,
            sourceGroupId: group.sourceGroupId,
            candidateCount: before,
            candidateSetSha256: group.candidateSetSha256,
            shadowRankingSha256: group.shadowRankingSha256,
            topShadowCandidateId: group.topShadowCandidateId,
            blindBaselineCandidateId: group.baselineCandidateId,
            top1Top2Margin: group.top1Top2Margin,
          }));
        }
      } else if (group.comparison !== 'NOT_COMPARABLE') {
        hardStop('Unknown baseline comparison state.', { comparison: group.comparison });
      }

      if (group.top1Top2Margin !== null) {
        if (!Number.isFinite(group.top1Top2Margin) || group.top1Top2Margin < 0) {
          hardStop('Invalid top1/top2 margin.', { top1Top2Margin: group.top1Top2Margin });
        }
        margins.push(group.top1Top2Margin);
      }

      if (group.status === 'SHADOW_NOT_SCORED_MODEL_DOMAIN_INCOMPLETE') {
        if (
          group.shadowScored !== false
          || group.modelDomainComplete !== false
          || group.comparison !== 'NOT_COMPARABLE'
          || before === 0
        ) {
          hardStop('Model-domain-incomplete group violated the no-score/no-truncation contract.', {
            evaluationId: fixture.evaluationId,
            sourceGroupId: group.sourceGroupId,
          });
        }
        const outOfDomain = assertNonNegativeInteger(
          group.outOfModelDomainCandidateCount,
          'group.outOfModelDomainCandidateCount',
        );
        if (outOfDomain < 1 || outOfDomain > before) {
          hardStop('Invalid out-of-model-domain candidate accounting.', {
            evaluationId: fixture.evaluationId,
            sourceGroupId: group.sourceGroupId,
          });
        }
        outOfModelDomainCandidateCount += outOfDomain;
        domainIncompleteCandidateCount += before;
        domainIncompleteDiagnostics.push(Object.freeze({
          evaluationId: fixture.evaluationId,
          sourceGroupId: group.sourceGroupId,
          candidateCount: before,
          outOfModelDomainCandidateCount: outOfDomain,
          candidateSetSha256: group.candidateSetSha256,
          candidateCountPreserved: true,
          shadowScored: false,
        }));
      }
    }
  }

  const expectedMetricValues = {
    fixtureCount: evidence.fixtureEvidence.length,
    totalGroupCount,
    totalCandidateCount,
    scoredGroupCount,
    noCandidateGroupCount,
    modelDomainIncompleteGroupCount,
    baselineComparableGroupCount,
    top1AgreementCount,
    disagreementCount: observedDisagreementIds.length,
    candidateCountPreservationRate: 1,
    shadowErrorCount: 0,
  };
  for (const [field, expected] of Object.entries(expectedMetricValues)) {
    if (metrics[field] !== expected) {
      hardStop('Sealed aggregate metric accounting drift.', {
        field,
        expected,
        actual: metrics[field],
      });
    }
  }
  if (JSON.stringify(metrics.disagreementIds) !== JSON.stringify(observedDisagreementIds)) {
    hardStop('Disagreement identity accounting drift.');
  }

  const candidateBearingGroupCount = totalGroupCount - noCandidateGroupCount;
  const noScoreGroupCount = totalGroupCount - scoredGroupCount;
  const top1AgreementRate = normalizedRate(top1AgreementCount, baselineComparableGroupCount);
  if (metrics.top1AgreementRate !== top1AgreementRate) {
    hardStop('Top-1 agreement rate drift.', {
      expected: top1AgreementRate,
      actual: metrics.top1AgreementRate,
    });
  }

  const marginSummary = margins.length === 0
    ? Object.freeze({ count: 0, minimum: null, maximum: null, mean: null })
    : Object.freeze({
      count: margins.length,
      minimum: Math.min(...margins),
      maximum: Math.max(...margins),
      mean: Number((margins.reduce((sum, value) => sum + value, 0) / margins.length).toFixed(12)),
    });

  return deepFreeze({
    documentType: 'GuitarSetOfflineShadowDiagnostics',
    contractVersion: GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_VERSION,
    mode: 'SEALED_OFFLINE_SHADOW_DIAGNOSTICS_ONLY',
    engineCommitSha: evidence.engineCommitSha,
    evidenceRunDigestSha256: evidence.runDigestSha256,
    fixtureCount: evidence.fixtureEvidence.length,
    totalGroupCount,
    totalCandidateCount,
    candidateBearingGroupCount,
    scoredGroupCount,
    noCandidateGroupCount,
    noScoreGroupCount,
    modelDomainIncompleteGroupCount,
    candidateBearingScorableRate: normalizedRate(scoredGroupCount, candidateBearingGroupCount),
    noScoreGroupRate: normalizedRate(noScoreGroupCount, totalGroupCount),
    modelDomainIncompleteCandidateCount: domainIncompleteCandidateCount,
    outOfModelDomainCandidateCount,
    baselineComparableGroupCount,
    top1AgreementCount,
    top1AgreementRate,
    disagreementCount: disagreementDiagnostics.length,
    disagreementDiagnostics: Object.freeze(disagreementDiagnostics),
    domainIncompleteDiagnostics: Object.freeze(domainIncompleteDiagnostics),
    top1Top2MarginSummary: marginSummary,
    baselineSource: 'DETERMINISTIC_BLIND_BASELINE_EVIDENCE_ONLY',
    teacherGoldUsed: false,
    validationFinalLabelsUsed: false,
    candidateMutationAuthorized: false,
    optimizerInfluenceAuthorized: false,
    runtimeConnectionAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    productionAuthorized: false,
  });
}

module.exports = Object.freeze({
  GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_VERSION,
  GuitarSetOfflineShadowDiagnosticsError,
  createGuitarSetOfflineShadowDiagnostics,
});
