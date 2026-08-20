'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACT_PATH = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'benchmark.proposed.v0.2.0.json');
const APPROVAL_PATH = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'approvals', 'teacher-approval-v0.2.0-2026-08-20.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

test('PA-11.2T binds teacher approval to the exact immutable 0.2.0 artifact bytes', () => {
  const bytes = fs.readFileSync(ARTIFACT_PATH);
  const artifact = JSON.parse(bytes.toString('utf8'));
  const approval = readJson(APPROVAL_PATH);

  assert.equal(approval.documentType, 'TeacherArrangementBenchmarkApproval');
  assert.equal(approval.contractVersion, '1.1.0');
  assert.equal(approval.approvalStatus, 'TEACHER_APPROVED_EXACT_ARTIFACT');
  assert.equal(approval.effectiveReviewStatus, 'teacher-approved');
  assert.equal(approval.approvalAppliesOnlyToExactGitBlob, true);

  assert.equal(artifact.reviewStatus, 'proposed');
  assert.equal(approval.approvedArtifact.path, 'benchmarks/teacher-arrangement-v1/benchmark.proposed.v0.2.0.json');
  assert.equal(approval.approvedArtifact.documentType, artifact.documentType);
  assert.equal(approval.approvedArtifact.contractVersion, artifact.contractVersion);
  assert.equal(approval.approvedArtifact.benchmarkId, artifact.benchmarkId);
  assert.equal(approval.approvedArtifact.benchmarkVersion, artifact.benchmarkVersion);
  assert.equal(approval.approvedArtifact.gitBlobSha, gitBlobSha(bytes));
  assert.equal(approval.approvedArtifact.gitBlobSha, '21a02c053a8bdfee781846a6c7f35b0c66600513');
});

test('PA-11.2T approval scope exactly matches the reviewed open C and Cmaj7 voicings', () => {
  const artifact = readJson(ARTIFACT_PATH);
  const approval = readJson(APPROVAL_PATH);

  const case2 = artifact.cases.find((entry) => entry.caseId === approval.explicitTeacherScope.case2.caseId);
  const case3 = artifact.cases.find((entry) => entry.caseId === approval.explicitTeacherScope.case3.caseId);
  assert.ok(case2);
  assert.ok(case3);

  const case2Shape = case2.acceptedArrangements[0].selectedShape;
  const case3Shape = case3.acceptedArrangements[0].selectedShape;
  assert.equal(case2Shape.label, approval.explicitTeacherScope.case2.teacherShape);
  assert.equal(case2Shape.positionCode, approval.explicitTeacherScope.case2.positionCode);
  assert.equal(case2Shape.label, 'C');
  assert.equal(case2Shape.positionCode, 'x32010');
  assert.equal(case3Shape.label, approval.explicitTeacherScope.case3.teacherShape);
  assert.equal(case3Shape.positionCode, approval.explicitTeacherScope.case3.positionCode);
  assert.equal(case3Shape.label, 'Cmaj7');
  assert.equal(case3Shape.positionCode, 'x32000');
});

test('PA-11.2T grants evaluation approval only and never infers a preferred arrangement', () => {
  const approval = readJson(APPROVAL_PATH);
  const artifact = readJson(ARTIFACT_PATH);

  assert.equal(approval.authority, 'evaluation-only');
  assert.equal(approval.trainingAuthority, false);
  assert.equal(approval.productionAuthority, false);
  assert.equal(approval.preferredArrangementInference, false);
  for (const benchmarkCase of artifact.cases) {
    assert.equal(benchmarkCase.preferredArrangementId, null);
  }
});

test('PA-11.2T byte tampering invalidates the exact approval binding', () => {
  const bytes = fs.readFileSync(ARTIFACT_PATH);
  const approval = readJson(APPROVAL_PATH);
  const tampered = Buffer.concat([bytes, Buffer.from(' ')]);

  assert.notEqual(gitBlobSha(tampered), approval.approvedArtifact.gitBlobSha);
});
