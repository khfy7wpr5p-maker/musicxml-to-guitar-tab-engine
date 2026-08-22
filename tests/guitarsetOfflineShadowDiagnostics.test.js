'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_VERSION,
  GuitarSetOfflineShadowDiagnosticsError,
  createGuitarSetOfflineShadowDiagnostics,
} = require('../tools/guitarsetOfflineShadowDiagnostics');

const SEALED_EVIDENCE_PATH = path.join(
  __dirname,
  '..',
  'evidence',
  'offline-shadow',
  'exact-main',
  'a2d4e9461382d5c4fdf49d04c5d949b2f40bbc35',
  'controlled-offline-shadow-evidence.v1.json',
);

function sealedEvidence() {
  return JSON.parse(fs.readFileSync(SEALED_EVIDENCE_PATH, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('sealed exact-main evidence produces bounded coverage and blind-baseline diagnostics', () => {
  const diagnostics = createGuitarSetOfflineShadowDiagnostics(sealedEvidence());

  assert.equal(diagnostics.documentType, 'GuitarSetOfflineShadowDiagnostics');
  assert.equal(diagnostics.contractVersion, GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_VERSION);
  assert.equal(diagnostics.mode, 'SEALED_OFFLINE_SHADOW_DIAGNOSTICS_ONLY');
  assert.equal(diagnostics.engineCommitSha, 'a2d4e9461382d5c4fdf49d04c5d949b2f40bbc35');
  assert.equal(
    diagnostics.evidenceRunDigestSha256,
    'bcf85e6c41cf9e63acb340b9fc1eebd8c9e61559306584537249750b186ba898',
  );

  assert.equal(diagnostics.fixtureCount, 6);
  assert.equal(diagnostics.totalGroupCount, 5);
  assert.equal(diagnostics.totalCandidateCount, 153);
  assert.equal(diagnostics.candidateBearingGroupCount, 4);
  assert.equal(diagnostics.scoredGroupCount, 1);
  assert.equal(diagnostics.noCandidateGroupCount, 1);
  assert.equal(diagnostics.noScoreGroupCount, 4);
  assert.equal(diagnostics.modelDomainIncompleteGroupCount, 3);
  assert.equal(diagnostics.candidateBearingScorableRate, 0.25);
  assert.equal(diagnostics.noScoreGroupRate, 0.8);
  assert.equal(diagnostics.modelDomainIncompleteCandidateCount, 149);
  assert.equal(diagnostics.outOfModelDomainCandidateCount, 48);

  assert.equal(diagnostics.baselineComparableGroupCount, 1);
  assert.equal(diagnostics.top1AgreementCount, 1);
  assert.equal(diagnostics.top1AgreementRate, 1);
  assert.equal(diagnostics.disagreementCount, 0);
  assert.deepEqual(diagnostics.disagreementDiagnostics, []);
  assert.deepEqual(diagnostics.top1Top2MarginSummary, {
    count: 1,
    minimum: 0.452842290727,
    maximum: 0.452842290727,
    mean: 0.452842290727,
  });

  assert.equal(diagnostics.domainIncompleteDiagnostics.length, 3);
  assert.deepEqual(
    diagnostics.domainIncompleteDiagnostics.map((entry) => ({
      evaluationId: entry.evaluationId,
      candidateCount: entry.candidateCount,
      outOfModelDomainCandidateCount: entry.outOfModelDomainCandidateCount,
      candidateCountPreserved: entry.candidateCountPreserved,
      shadowScored: entry.shadowScored,
    })),
    [
      {
        evaluationId: 'pa11-two-note-interval',
        candidateCount: 21,
        outOfModelDomainCandidateCount: 5,
        candidateCountPreserved: true,
        shadowScored: false,
      },
      {
        evaluationId: 'pa11-three-note-triad',
        candidateCount: 55,
        outOfModelDomainCandidateCount: 16,
        candidateCountPreserved: true,
        shadowScored: false,
      },
      {
        evaluationId: 'pa11-four-note-reduction',
        candidateCount: 73,
        outOfModelDomainCandidateCount: 27,
        candidateCountPreserved: true,
        shadowScored: false,
      },
    ],
  );

  assert.equal(diagnostics.baselineSource, 'DETERMINISTIC_BLIND_BASELINE_EVIDENCE_ONLY');
  assert.equal(diagnostics.teacherGoldUsed, false);
  assert.equal(diagnostics.validationFinalLabelsUsed, false);
  assert.equal(diagnostics.candidateMutationAuthorized, false);
  assert.equal(diagnostics.optimizerInfluenceAuthorized, false);
  assert.equal(diagnostics.runtimeConnectionAuthorized, false);
  assert.equal(diagnostics.authoritativeDecisionEffectAuthorized, false);
  assert.equal(diagnostics.canonicalResultEffectAuthorized, false);
  assert.equal(diagnostics.tabOutputEffectAuthorized, false);
  assert.equal(diagnostics.productionAuthorized, false);
  assert.equal(Object.isFrozen(diagnostics), true);
});

test('disagreement diagnostics expose candidate-space identities and margins without promotion authority', () => {
  const artifact = clone(sealedEvidence());
  const fixture = artifact.evidence.fixtureEvidence.find(
    (entry) => entry.evaluationId === 'shadow-control-in-domain-c3-e3',
  );
  const group = fixture.groups[0];
  const disagreementId = `${fixture.evaluationId}:${group.sourceGroupId}`;
  group.comparison = 'DISAGREE';
  group.topShadowCandidateId = 'P1:measure:0:simultaneous:0:voicing:1';
  artifact.evidence.metrics.top1AgreementCount = 0;
  artifact.evidence.metrics.top1AgreementRate = 0;
  artifact.evidence.metrics.disagreementCount = 1;
  artifact.evidence.metrics.disagreementIds = [disagreementId];

  const diagnostics = createGuitarSetOfflineShadowDiagnostics(artifact);
  assert.equal(diagnostics.baselineComparableGroupCount, 1);
  assert.equal(diagnostics.top1AgreementCount, 0);
  assert.equal(diagnostics.top1AgreementRate, 0);
  assert.equal(diagnostics.disagreementCount, 1);
  assert.deepEqual(diagnostics.disagreementDiagnostics, [
    {
      disagreementId,
      evaluationId: 'shadow-control-in-domain-c3-e3',
      sourceGroupId: 'P1:measure:0:simultaneous:0',
      candidateCount: 4,
      candidateSetSha256: 'b80a4d5e57bf9e03f7bfa912bff3c948db26195dfaddc0debcf5619deb3c623a',
      shadowRankingSha256: 'feaf611613ed3732504bafc76ad214c481d2e9a14ad79339d02b9a372e95c0ee',
      topShadowCandidateId: 'P1:measure:0:simultaneous:0:voicing:1',
      blindBaselineCandidateId: 'P1:measure:0:simultaneous:0:voicing:0',
      top1Top2Margin: 0.452842290727,
    },
  ]);
  assert.equal(diagnostics.optimizerInfluenceAuthorized, false);
  assert.equal(diagnostics.authoritativeDecisionEffectAuthorized, false);
  assert.equal(diagnostics.tabOutputEffectAuthorized, false);
});

test('diagnostics hard-stop candidate mutation, aggregate drift, authority drift and privacy-boundary drift', () => {
  const cases = [];

  const candidateMutation = clone(sealedEvidence());
  candidateMutation.evidence.fixtureEvidence[0].groups[0].candidateCountAfterShadow -= 1;
  cases.push(candidateMutation);

  const aggregateDrift = clone(sealedEvidence());
  aggregateDrift.evidence.metrics.scoredGroupCount += 1;
  cases.push(aggregateDrift);

  const authorityDrift = clone(sealedEvidence());
  authorityDrift.evidence.productionAuthorized = true;
  cases.push(authorityDrift);

  const privacyDrift = clone(sealedEvidence());
  privacyDrift.sealPolicy.teacherLabelsIncluded = true;
  cases.push(privacyDrift);

  for (const artifact of cases) {
    assert.throws(
      () => createGuitarSetOfflineShadowDiagnostics(artifact),
      (error) => error instanceof GuitarSetOfflineShadowDiagnosticsError
        && error.code === 'GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_HARD_STOP',
    );
  }
});

test('offline diagnostics tool remains outside the package-root public runtime API', () => {
  const publicApi = require('../src');
  assert.equal(Object.hasOwn(publicApi, 'createGuitarSetOfflineShadowDiagnostics'), false);
  assert.equal(Object.hasOwn(publicApi, 'GUITARSET_OFFLINE_SHADOW_DIAGNOSTICS_VERSION'), false);
});
