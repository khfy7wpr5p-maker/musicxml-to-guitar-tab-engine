'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const manifestDefault = require('../verification/a3-real-piano-corpus-manifest.json');

const SHA1 = /^[a-f0-9]{40}$/;
const AUDIT_DOCUMENT_TYPE = 'A3ProductionRealPianoCorpusAudit';
const AUDIT_CONTRACT_VERSION = '1.0.0';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function validateManifest(manifest) {
  if (
    !manifest
    || manifest.documentType !== 'A3ProductionRealPianoCorpusManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.evidenceClass !== 'REAL_EXTERNAL_PINNED_PIANO_MXL'
    || manifest.sourceRepository !== 'musetrainer/library'
    || !SHA1.test(manifest.sourceCommit || '')
    || manifest.sourceRoot !== 'scores'
    || manifest.requiredRunCount !== 2
    || manifest.requiredSupportedCount !== 5
    || !Array.isArray(manifest.files)
    || manifest.files.length !== 5
  ) {
    throw new Error('Invalid A3ProductionRealPianoCorpusManifest.');
  }

  const caseIds = new Set();
  const paths = new Set();
  const blobs = new Set();
  for (const entry of manifest.files) {
    if (
      !entry
      || typeof entry.caseId !== 'string'
      || entry.caseId.length === 0
      || caseIds.has(entry.caseId)
      || typeof entry.path !== 'string'
      || !entry.path.startsWith('scores/')
      || !/\.mxl$/i.test(entry.path)
      || paths.has(entry.path)
      || !SHA1.test(entry.gitBlobSha || '')
      || blobs.has(entry.gitBlobSha)
      || !Number.isSafeInteger(entry.byteLength)
      || entry.byteLength <= 0
      || !['REAL_PIANO', 'REAL_PIANO_STRESS'].includes(entry.role)
    ) {
      throw new Error('A3 real piano corpus contains invalid or duplicate identity.');
    }
    caseIds.add(entry.caseId);
    paths.add(entry.path);
    blobs.add(entry.gitBlobSha);
  }
  return manifest;
}

function blockerSnapshot(result) {
  const issues = Array.isArray(result?.preflight?.issues) ? result.preflight.issues : [];
  const blocker = issues.find((issue) => issue?.severity === 'error') || issues[0] || null;
  return blocker ? Object.freeze({
    code: blocker.code || null,
    category: blocker.category || null,
    feature: blocker?.details?.feature || null,
    reason: blocker?.details?.reason || null,
    details: blocker?.details && typeof blocker.details === 'object'
      ? JSON.parse(JSON.stringify(blocker.details))
      : null,
  }) : null;
}

function outputSemantics(result) {
  const statusSupported = result?.status === 'PASS' || result?.status === 'REVIEW_REQUIRED';
  const musicXmlAvailable = typeof result?.musicXml === 'string' && result.musicXml.length > 0;
  const renderable = result?.capabilities?.renderScore === true;
  const tabAuthorityAvailable = result?.status === 'PASS'
    ? result?.artifacts?.canonicalTabAvailable === true
    : result?.status === 'REVIEW_REQUIRED'
      ? result?.artifacts?.provisionalTabAvailable === true
      : false;
  const tabAvailable = result?.capabilities?.generateTab === true
    && tabAuthorityAvailable
    && Boolean(result?.canonicalTabResult || result?.arrangementArtifact)
    && musicXmlAvailable;
  const teacherEditable = Boolean(
    result?.capabilities?.editPitch === true
    || result?.capabilities?.editRhythm === true
    || result?.capabilities?.assignTabPosition === true
  );
  const reviewAuthoritySafe = result?.status !== 'REVIEW_REQUIRED' || Boolean(
    result?.capabilities?.export === false
    && result?.artifacts?.canonicalTabAvailable === false
    && result?.artifacts?.provisionalTabAvailable === true
  );
  const passAuthoritySafe = result?.status !== 'PASS' || Boolean(
    result?.canonicalTabResult
    && result?.capabilities?.export === true
    && result?.artifacts?.canonicalTabAvailable === true
  );

  return Object.freeze({
    statusSupported,
    renderable,
    tabAvailable,
    teacherEditable,
    reviewAuthoritySafe,
    passAuthoritySafe,
    supported: statusSupported
      && renderable
      && tabAvailable
      && teacherEditable
      && reviewAuthoritySafe
      && passAuthoritySafe,
  });
}

function runAudit({
  sourceDirectory,
  manifest = manifestDefault,
  processUpload = processMusicXmlUpload,
  engineCommit = process.env.GITHUB_SHA || null,
} = {}) {
  validateManifest(manifest);
  if (
    typeof sourceDirectory !== 'string'
    || sourceDirectory.length === 0
    || !fs.existsSync(sourceDirectory)
    || !fs.statSync(sourceDirectory).isDirectory()
  ) {
    throw new Error('A3 real piano corpus source directory is unavailable.');
  }

  const records = [];
  for (const entry of manifest.files) {
    const sourcePath = path.join(sourceDirectory, entry.path);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing pinned A3 corpus file: ${entry.path}`);
    }

    const original = fs.readFileSync(sourcePath);
    const observedBlobSha = gitBlobSha(original);
    const observedSha256 = sha256(original);
    const identityVerified = (
      observedBlobSha === entry.gitBlobSha
      && original.byteLength === entry.byteLength
    );

    const firstBytes = Buffer.from(original);
    const secondBytes = Buffer.from(original);
    const firstBefore = sha256(firstBytes);
    const firstResult = processUpload({
      fileName: path.basename(entry.path),
      bytes: firstBytes,
    });
    const firstAfter = sha256(firstBytes);
    const secondBefore = sha256(secondBytes);
    const secondResult = processUpload({
      fileName: path.basename(entry.path),
      bytes: secondBytes,
    });
    const secondAfter = sha256(secondBytes);

    const sourceByteImmutable = (
      firstBefore === observedSha256
      && firstAfter === observedSha256
      && secondBefore === observedSha256
      && secondAfter === observedSha256
    );
    const deterministic = isDeepStrictEqual(firstResult, secondResult);
    const semantics = outputSemantics(firstResult);
    const blocker = firstResult?.status === 'BLOCKED' ? blockerSnapshot(firstResult) : null;
    const issues = Array.isArray(firstResult?.preflight?.issues)
      ? firstResult.preflight.issues
      : [];
    const artifact = firstResult?.arrangementArtifact || null;
    const sourceNoteCoverage = artifact && Number.isSafeInteger(artifact.sourceNoteCount)
      ? Object.freeze({
        sourceNoteCount: artifact.sourceNoteCount,
        assignedNoteCount: Number.isSafeInteger(artifact.assignedNoteCount)
          ? artifact.assignedNoteCount
          : null,
        unassignedNoteCount: Number.isSafeInteger(artifact.unassignedNoteCount)
          ? artifact.unassignedNoteCount
          : null,
        omittedNoteCount: Number.isSafeInteger(artifact.omittedNoteCount)
          ? artifact.omittedNoteCount
          : null,
        coverageBasisPoints: Number.isSafeInteger(artifact.coverageBasisPoints)
          ? artifact.coverageBasisPoints
          : null,
      })
      : null;
    const arrangementArtifact = artifact
      ? Object.freeze({
        documentType: artifact.documentType || null,
        contractVersion: artifact.contractVersion || null,
        authority: artifact.authority || null,
        policy: artifact.policy || null,
        transform: artifact.recovery?.transform || null,
      })
      : null;

    records.push(Object.freeze({
      caseId: entry.caseId,
      role: entry.role,
      path: entry.path,
      expectedGitBlobSha: entry.gitBlobSha,
      observedGitBlobSha: observedBlobSha,
      observedSha256,
      byteLength: original.byteLength,
      identityVerified,
      deterministic,
      sourceByteImmutable,
      status: firstResult?.status || null,
      route: firstResult?.route || null,
      arrangementArtifactType: artifact?.documentType || null,
      arrangementArtifact,
      sourceNoteCoverage,
      generateTab: firstResult?.capabilities?.generateTab === true,
      provisionalTabAvailable: firstResult?.artifacts?.provisionalTabAvailable === true,
      canonicalTabAvailable: firstResult?.artifacts?.canonicalTabAvailable === true,
      playback: firstResult?.capabilities?.playback || null,
      export: firstResult?.capabilities?.export === true,
      issueEvidence: Object.freeze(issues.map((issue) => Object.freeze({
        severity: issue?.severity || null,
        category: issue?.category || null,
        code: issue?.code || null,
        message: typeof issue?.message === 'string' ? issue.message : null,
        details: issue?.details && typeof issue.details === 'object'
          ? JSON.parse(JSON.stringify(issue.details))
          : null,
      }))),
      issueCodes: Object.freeze(
        issues.map((issue) => issue?.code).filter((code) => typeof code === 'string'),
      ),
      errorCodes: Object.freeze(
        issues
          .filter((issue) => issue?.severity === 'error')
          .map((issue) => issue?.code)
          .filter((code) => typeof code === 'string'),
      ),
      blocker,
      ...semantics,
      resultSha256: sha256(Buffer.from(JSON.stringify(firstResult))),
      writerOutputSha256: typeof firstResult?.musicXml === 'string'
        ? sha256(Buffer.from(firstResult.musicXml, 'utf8'))
        : null,
    }));
  }

  const count = (field) => records.filter((record) => record[field] === true).length;
  const supportedCount = count('supported');
  const pass = (
    records.length === manifest.files.length
    && count('identityVerified') === manifest.files.length
    && count('deterministic') === manifest.files.length
    && count('sourceByteImmutable') === manifest.files.length
    && supportedCount >= manifest.requiredSupportedCount
  );

  return Object.freeze({
    documentType: AUDIT_DOCUMENT_TYPE,
    contractVersion: AUDIT_CONTRACT_VERSION,
    evidenceClass: manifest.evidenceClass,
    sourceRepository: manifest.sourceRepository,
    sourceCommit: manifest.sourceCommit,
    engineCommit,
    requiredRunCount: manifest.requiredRunCount,
    requiredSupportedCount: manifest.requiredSupportedCount,
    status: pass ? 'PASS_VERIFIED' : 'FAIL_AUDIT',
    summary: Object.freeze({
      requiredFiles: manifest.files.length,
      identityVerifiedFiles: count('identityVerified'),
      deterministicFiles: count('deterministic'),
      sourceImmutableFiles: count('sourceByteImmutable'),
      supportedFiles: supportedCount,
      passFiles: records.filter((record) => record.status === 'PASS').length,
      reviewRequiredFiles: records.filter((record) => record.status === 'REVIEW_REQUIRED').length,
      blockedFiles: records.filter((record) => record.status === 'BLOCKED').length,
      tabAvailableFiles: count('tabAvailable'),
      teacherEditableFiles: count('teacherEditable'),
    }),
    records: Object.freeze(records),
  });
}

function summaryMarkdown(report) {
  const summary = report.summary;
  const blocked = report.records
    .filter((record) => record.status === 'BLOCKED')
    .map((record) => `${record.caseId}: ${record.blocker?.code || 'UNKNOWN'}`);
  return [
    '## A3 production real piano corpus',
    '',
    `**${report.status}**`,
    '',
    '| Gate | Result |',
    '|---|---:|',
    `| Identity verified | ${summary.identityVerifiedFiles}/${summary.requiredFiles} |`,
    `| Deterministic | ${summary.deterministicFiles}/${summary.requiredFiles} |`,
    `| Source immutable | ${summary.sourceImmutableFiles}/${summary.requiredFiles} |`,
    `| Supported with TAB | ${summary.supportedFiles}/${summary.requiredFiles} |`,
    `| Teacher editable | ${summary.teacherEditableFiles}/${summary.requiredFiles} |`,
    `| BLOCKED | ${summary.blockedFiles} |`,
    '',
    `Blocked cases: ${blocked.length === 0 ? 'none' : blocked.join('; ')}`,
    '',
  ].join('\n');
}

if (require.main === module) {
  const sourceDirectory = process.argv[2] || process.env.A3_REAL_PIANO_CORPUS_DIR || null;
  const outputPath = process.argv[3] || null;
  const report = runAudit({ sourceDirectory });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(report), 'utf8');
  }
  process.stdout.write(json);
  process.exitCode = report.status === 'PASS_VERIFIED' ? 0 : 1;
}

module.exports = {
  AUDIT_CONTRACT_VERSION,
  AUDIT_DOCUMENT_TYPE,
  gitBlobSha,
  outputSemantics,
  runAudit,
  sha256,
  summaryMarkdown,
  validateManifest,
};
