'use strict';

const { createHash } = require('node:crypto');
const { EngineError } = require('../errors/engineError');

const TEACHER_ARRANGEMENT_BENCHMARK_V11_CONTRACT_VERSION = '1.1.0';
const TEACHER_ARRANGEMENT_BENCHMARK_V11_VERSION = '0.2.0';
const TEACHER_ARRANGEMENT_BENCHMARK_V11_ID = 'teacher-arrangement-seed-v1';
const EXPECTED_BENCHMARK_GIT_BLOB_SHA = '21a02c053a8bdfee781846a6c7f35b0c66600513';
const EXPECTED_APPROVAL_GIT_BLOB_SHA = '21e76f6f81ad22754b73e17253b413cc0ef9aebd';
const MAX_BENCHMARK_BYTES = 2 * 1024 * 1024;
const MAX_APPROVAL_BYTES = 64 * 1024;

class TeacherArrangementBenchmarkV11AdmissionError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_V11_ADMISSION',
      details,
      'TeacherArrangementBenchmarkV11AdmissionError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkV11AdmissionError(message, { field, ...details });
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function parseExactJsonText(text, field, maxBytes) {
  if (typeof text !== 'string' || text.length === 0) {
    throw invalid(`${field} must be non-empty UTF-8 JSON text.`, field);
  }
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > maxBytes) {
    throw invalid(`${field} exceeds the fixed byte boundary.`, field, { byteLength, maxBytes });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw invalid(`${field} must contain valid JSON.`, field);
  }
}

function requireExact(value, expected, field) {
  if (value !== expected) {
    throw invalid(`${field} does not match the approved benchmark identity.`, field, {
      expected,
      actual: value,
    });
  }
}

function findCase(benchmark, caseId) {
  if (!benchmark || !Array.isArray(benchmark.cases)) {
    throw invalid('benchmark.cases must be an array.', 'benchmark.cases');
  }
  const matches = benchmark.cases.filter((entry) => entry && entry.caseId === caseId);
  if (matches.length !== 1) {
    throw invalid('Expected exactly one approved benchmark case.', 'benchmark.cases', { caseId });
  }
  return matches[0];
}

function firstSelectedShape(benchmarkCase, field) {
  if (!Array.isArray(benchmarkCase.acceptedArrangements) || benchmarkCase.acceptedArrangements.length !== 1) {
    throw invalid(`${field}.acceptedArrangements must contain exactly one approved arrangement.`, `${field}.acceptedArrangements`);
  }
  const shape = benchmarkCase.acceptedArrangements[0] && benchmarkCase.acceptedArrangements[0].selectedShape;
  if (!shape || typeof shape !== 'object') {
    throw invalid(`${field} must expose the approved selectedShape.`, `${field}.acceptedArrangements[0].selectedShape`);
  }
  return shape;
}

function assertExactTeacherApprovedV11BenchmarkAdmission(benchmarkText, approvalText) {
  const actualBenchmarkBlobSha = gitBlobSha(
    typeof benchmarkText === 'string' ? benchmarkText : '',
  );
  const actualApprovalBlobSha = gitBlobSha(
    typeof approvalText === 'string' ? approvalText : '',
  );

  const benchmark = parseExactJsonText(benchmarkText, 'benchmarkText', MAX_BENCHMARK_BYTES);
  const approval = parseExactJsonText(approvalText, 'approvalText', MAX_APPROVAL_BYTES);

  requireExact(actualBenchmarkBlobSha, EXPECTED_BENCHMARK_GIT_BLOB_SHA, 'benchmarkText.gitBlobSha');
  requireExact(actualApprovalBlobSha, EXPECTED_APPROVAL_GIT_BLOB_SHA, 'approvalText.gitBlobSha');

  requireExact(benchmark.documentType, 'TeacherArrangementBenchmark', 'benchmark.documentType');
  requireExact(benchmark.contractVersion, TEACHER_ARRANGEMENT_BENCHMARK_V11_CONTRACT_VERSION, 'benchmark.contractVersion');
  requireExact(benchmark.benchmarkId, TEACHER_ARRANGEMENT_BENCHMARK_V11_ID, 'benchmark.benchmarkId');
  requireExact(benchmark.benchmarkVersion, TEACHER_ARRANGEMENT_BENCHMARK_V11_VERSION, 'benchmark.benchmarkVersion');
  requireExact(benchmark.reviewStatus, 'proposed', 'benchmark.reviewStatus');
  requireExact(benchmark.supportStatus, 'PROPOSED_EVALUATION_SCHEMA_ONLY', 'benchmark.supportStatus');
  requireExact(benchmark.authority, 'evaluation-only', 'benchmark.authority');
  requireExact(benchmark.trainingAuthority, false, 'benchmark.trainingAuthority');
  requireExact(benchmark.productionAuthority, false, 'benchmark.productionAuthority');

  requireExact(approval.documentType, 'TeacherArrangementBenchmarkApproval', 'approval.documentType');
  requireExact(approval.contractVersion, TEACHER_ARRANGEMENT_BENCHMARK_V11_CONTRACT_VERSION, 'approval.contractVersion');
  requireExact(approval.approvalStatus, 'TEACHER_APPROVED_EXACT_ARTIFACT', 'approval.approvalStatus');
  requireExact(approval.effectiveReviewStatus, 'teacher-approved', 'approval.effectiveReviewStatus');
  requireExact(approval.authority, 'evaluation-only', 'approval.authority');
  requireExact(approval.trainingAuthority, false, 'approval.trainingAuthority');
  requireExact(approval.productionAuthority, false, 'approval.productionAuthority');
  requireExact(approval.preferredArrangementInference, false, 'approval.preferredArrangementInference');
  requireExact(approval.approvalAppliesOnlyToExactGitBlob, true, 'approval.approvalAppliesOnlyToExactGitBlob');

  if (!approval.approvedArtifact || typeof approval.approvedArtifact !== 'object') {
    throw invalid('approval.approvedArtifact is required.', 'approval.approvedArtifact');
  }
  requireExact(
    approval.approvedArtifact.path,
    'benchmarks/teacher-arrangement-v1/benchmark.proposed.v0.2.0.json',
    'approval.approvedArtifact.path',
  );
  requireExact(approval.approvedArtifact.documentType, benchmark.documentType, 'approval.approvedArtifact.documentType');
  requireExact(approval.approvedArtifact.contractVersion, benchmark.contractVersion, 'approval.approvedArtifact.contractVersion');
  requireExact(approval.approvedArtifact.benchmarkId, benchmark.benchmarkId, 'approval.approvedArtifact.benchmarkId');
  requireExact(approval.approvedArtifact.benchmarkVersion, benchmark.benchmarkVersion, 'approval.approvedArtifact.benchmarkVersion');
  requireExact(approval.approvedArtifact.gitBlobSha, actualBenchmarkBlobSha, 'approval.approvedArtifact.gitBlobSha');

  if (!approval.explicitTeacherScope || typeof approval.explicitTeacherScope !== 'object') {
    throw invalid('approval.explicitTeacherScope is required.', 'approval.explicitTeacherScope');
  }
  const case2Scope = approval.explicitTeacherScope.case2;
  const case3Scope = approval.explicitTeacherScope.case3;
  if (!case2Scope || !case3Scope) {
    throw invalid('Both approved teacher scope entries are required.', 'approval.explicitTeacherScope');
  }

  requireExact(case2Scope.caseId, 'pa11-seed-002-three-note-voicing', 'approval.explicitTeacherScope.case2.caseId');
  requireExact(case2Scope.teacherShape, 'C', 'approval.explicitTeacherScope.case2.teacherShape');
  requireExact(case2Scope.positionCode, 'x32010', 'approval.explicitTeacherScope.case2.positionCode');
  requireExact(case3Scope.caseId, 'pa11-seed-003-conservative-reduction', 'approval.explicitTeacherScope.case3.caseId');
  requireExact(case3Scope.teacherShape, 'Cmaj7', 'approval.explicitTeacherScope.case3.teacherShape');
  requireExact(case3Scope.positionCode, 'x32000', 'approval.explicitTeacherScope.case3.positionCode');

  const case2Shape = firstSelectedShape(findCase(benchmark, case2Scope.caseId), 'benchmark.case2');
  const case3Shape = firstSelectedShape(findCase(benchmark, case3Scope.caseId), 'benchmark.case3');
  requireExact(case2Shape.label, case2Scope.teacherShape, 'benchmark.case2.selectedShape.label');
  requireExact(case2Shape.positionCode, case2Scope.positionCode, 'benchmark.case2.selectedShape.positionCode');
  requireExact(case3Shape.label, case3Scope.teacherShape, 'benchmark.case3.selectedShape.label');
  requireExact(case3Shape.positionCode, case3Scope.positionCode, 'benchmark.case3.selectedShape.positionCode');

  for (const [index, benchmarkCase] of benchmark.cases.entries()) {
    requireExact(benchmarkCase.preferredArrangementId, null, `benchmark.cases[${index}].preferredArrangementId`);
  }

  return Object.freeze({
    documentType: 'TeacherArrangementBenchmarkV11AdmissionEvidence',
    contractVersion: TEACHER_ARRANGEMENT_BENCHMARK_V11_CONTRACT_VERSION,
    benchmarkId: benchmark.benchmarkId,
    benchmarkVersion: benchmark.benchmarkVersion,
    benchmarkGitBlobSha: actualBenchmarkBlobSha,
    approvalGitBlobSha: actualApprovalBlobSha,
    effectiveReviewStatus: 'teacher-approved',
    authority: 'evaluation-only',
  });
}

module.exports = {
  EXPECTED_APPROVAL_GIT_BLOB_SHA,
  EXPECTED_BENCHMARK_GIT_BLOB_SHA,
  TEACHER_ARRANGEMENT_BENCHMARK_V11_CONTRACT_VERSION,
  TEACHER_ARRANGEMENT_BENCHMARK_V11_VERSION,
  TeacherArrangementBenchmarkV11AdmissionError,
  assertExactTeacherApprovedV11BenchmarkAdmission,
};
