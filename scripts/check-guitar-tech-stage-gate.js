'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_STATE_PATH = path.join(
  __dirname,
  '..',
  'verification',
  'guitar-tech-real-corpus-state.json',
);
const DEFAULT_REPOSITORY_ROOT = path.resolve(__dirname, '..');
const PRODUCTION_RUNTIME_PATHS = Object.freeze([
  'src',
  'package.json',
  'package-lock.json',
]);

function validCommitSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function runtimeTreeEquivalent({
  auditedMainSha,
  expectedBaseSha,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) {
  if (!validCommitSha(auditedMainSha) || !validCommitSha(expectedBaseSha)) return false;
  if (auditedMainSha === expectedBaseSha) return true;

  const result = spawnSync(
    'git',
    [
      'diff',
      '--quiet',
      '--no-ext-diff',
      auditedMainSha,
      expectedBaseSha,
      '--',
      ...PRODUCTION_RUNTIME_PATHS,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return !result.error && result.status === 0;
}

function validateStageGate(
  state,
  {
    targetStage = 'PROD-TECH-03',
    expectedBaseSha = null,
    auditedRuntimeEquivalent = false,
  } = {},
) {
  const reasons = [];
  if (!state || state.documentType !== 'GuitarTechniqueProductionStageGateState') {
    reasons.push('INVALID_GATE_STATE');
  } else {
    if (state.contractVersion !== '1.0.0') reasons.push('UNSUPPORTED_GATE_VERSION');
    if (state.prerequisiteFor !== targetStage) reasons.push('WRONG_TARGET_STAGE');
    if (state.status !== 'PASS') reasons.push('REAL_CORPUS_GATE_NOT_PASS');
    if (state.prodTech03MergeAllowed !== true) reasons.push('PROD_TECH_03_MERGE_NOT_ALLOWED');
    if (!state.corpusIdentityVerified) reasons.push('CORPUS_IDENTITY_NOT_VERIFIED');
    if (!state.twoRunDeterminismVerified) reasons.push('DETERMINISM_NOT_VERIFIED');
    if (!state.sourceByteImmutabilityVerified) reasons.push('SOURCE_IMMUTABILITY_NOT_VERIFIED');
    if (!state.blockerDiffReviewed) reasons.push('BLOCKER_DIFF_NOT_REVIEWED');
    if (!validCommitSha(state.auditedMainSha)) reasons.push('AUDITED_MAIN_SHA_MISSING');
    if (typeof state.auditReportSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(state.auditReportSha256)) {
      reasons.push('AUDIT_REPORT_HASH_MISSING');
    }
    if (
      expectedBaseSha
      && state.auditedMainSha !== expectedBaseSha
      && auditedRuntimeEquivalent !== true
    ) {
      reasons.push('AUDITED_MAIN_RUNTIME_STALE');
    }
  }
  return Object.freeze({ ok: reasons.length === 0, reasons: Object.freeze(reasons) });
}

function validateStageGateFromRepository(
  state,
  {
    targetStage = 'PROD-TECH-03',
    expectedBaseSha = null,
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  } = {},
) {
  const auditedRuntimeEquivalent = Boolean(
    expectedBaseSha
    && validCommitSha(state?.auditedMainSha)
    && runtimeTreeEquivalent({
      auditedMainSha: state.auditedMainSha,
      expectedBaseSha,
      repositoryRoot,
    }),
  );
  return validateStageGate(state, {
    targetStage,
    expectedBaseSha,
    auditedRuntimeEquivalent,
  });
}

function readState(statePath = DEFAULT_STATE_PATH) {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

if (require.main === module) {
  const targetStage = process.argv[2] || 'PROD-TECH-03';
  const expectedBaseSha = process.argv[3] || process.env.GUITAR_TECH_EXPECTED_BASE_SHA || null;
  const statePath = process.argv[4] || DEFAULT_STATE_PATH;
  const verdict = validateStageGateFromRepository(readState(statePath), {
    targetStage,
    expectedBaseSha,
  });
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  process.exitCode = verdict.ok ? 0 : 1;
}

module.exports = {
  DEFAULT_STATE_PATH,
  PRODUCTION_RUNTIME_PATHS,
  readState,
  runtimeTreeEquivalent,
  validateStageGate,
  validateStageGateFromRepository,
};
