'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  MUSICXML_ROUTE_REQUIREMENT,
  routeRequirementFromParsedMusicXml,
} = require('../src/app/musicXmlRouteClassifier');
const manifestDefault = require('../verification/stage09-additional-real-musicxml-corpus.json');

const SHA1 = /^[a-f0-9]{40}$/;

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
    || manifest.documentType !== 'Stage09AdditionalRealMusicXmlCorpusManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.evidenceClass !== 'REAL_EXTERNAL_PINNED_MUSICXML'
    || !SHA1.test(manifest.sourceCommit || '')
    || manifest.requiredRunCount !== 2
    || !Array.isArray(manifest.files)
    || manifest.files.length !== 11
  ) throw new Error('Invalid Stage09AdditionalRealMusicXmlCorpusManifest.');

  const paths = new Set();
  const blobs = new Set();
  for (const entry of manifest.files) {
    if (
      !entry
      || typeof entry.path !== 'string'
      || !/\.xml$/i.test(entry.path)
      || entry.path.includes('/')
      || !SHA1.test(entry.gitBlobSha || '')
      || !Number.isSafeInteger(entry.byteLength)
      || entry.byteLength <= 0
      || paths.has(entry.path)
      || blobs.has(entry.gitBlobSha)
    ) throw new Error('Additional real corpus contains invalid or duplicate identity.');
    paths.add(entry.path);
    blobs.add(entry.gitBlobSha);
  }
  return manifest;
}

function blockerSnapshot(result) {
  const issues = Array.isArray(result?.preflight?.issues) ? result.preflight.issues : [];
  const blocker = issues.find((issue) => issue?.severity === 'error') || null;
  return blocker ? {
    code: blocker.code || null,
    category: blocker.category || null,
    feature: blocker?.details?.feature || null,
  } : null;
}

function routeRequirement(bytes) {
  try {
    const parsed = parseParsedMusicXmlDocument(bytes);
    return routeRequirementFromParsedMusicXml(parsed);
  } catch {
    return 'UNRESOLVED';
  }
}

function outputSemanticsValid(result) {
  if (result?.status === 'PASS') {
    return Boolean(
      result.canonicalTabResult
      && typeof result.musicXml === 'string'
      && result.musicXml.length > 0
    );
  }
  return !result?.canonicalTabResult && !result?.musicXml;
}

function runAudit({
  sourceDirectory,
  manifest = manifestDefault,
  processUpload = processMusicXmlUpload,
  engineCommit = process.env.GITHUB_SHA || null,
} = {}) {
  validateManifest(manifest);
  if (!sourceDirectory || !fs.existsSync(sourceDirectory) || !fs.statSync(sourceDirectory).isDirectory()) {
    throw new Error('Stage 09 additional real corpus directory is unavailable.');
  }

  const records = [];
  for (const entry of manifest.files) {
    const sourcePath = path.join(sourceDirectory, entry.path);
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing pinned corpus file: ${entry.path}`);
    const original = fs.readFileSync(sourcePath);
    const observedBlobSha = gitBlobSha(original);
    const observedSha256 = sha256(original);
    const identityVerified = observedBlobSha === entry.gitBlobSha && original.byteLength === entry.byteLength;

    const requirement = routeRequirement(original);
    const first = Buffer.from(original);
    const second = Buffer.from(original);
    const beforeFirst = sha256(first);
    const firstResult = processUpload({ fileName: entry.path, bytes: first });
    const afterFirst = sha256(first);
    const beforeSecond = sha256(second);
    const secondResult = processUpload({ fileName: entry.path, bytes: second });
    const afterSecond = sha256(second);

    const deterministic = isDeepStrictEqual(firstResult, secondResult);
    const sourceByteImmutable = (
      beforeFirst === observedSha256
      && afterFirst === observedSha256
      && beforeSecond === observedSha256
      && afterSecond === observedSha256
    );
    const noPolyToMonoDowngrade = (
      requirement !== MUSICXML_ROUTE_REQUIREMENT.POLY_V2
      || firstResult?.route !== MUSICXML_ROUTE_REQUIREMENT.MONO_V1
    );
    const validOutputSemantics = outputSemanticsValid(firstResult);

    records.push({
      path: entry.path,
      expectedGitBlobSha: entry.gitBlobSha,
      observedGitBlobSha: observedBlobSha,
      observedSha256,
      byteLength: original.byteLength,
      identityVerified,
      deterministic,
      sourceByteImmutable,
      routeRequirement: requirement,
      status: firstResult?.status || null,
      route: firstResult?.route || null,
      blocker: blockerSnapshot(firstResult),
      noPolyToMonoDowngrade,
      validOutputSemantics,
      canonicalTabResultSha256: firstResult?.canonicalTabResult
        ? sha256(Buffer.from(JSON.stringify(firstResult.canonicalTabResult)))
        : null,
      writerOutputSha256: typeof firstResult?.musicXml === 'string'
        ? sha256(Buffer.from(firstResult.musicXml, 'utf8'))
        : null,
      resultSha256: sha256(Buffer.from(JSON.stringify(firstResult))),
    });
  }

  const all = (field) => records.every((record) => record[field] === true);
  const pass = (
    records.length === manifest.files.length
    && all('identityVerified')
    && all('deterministic')
    && all('sourceByteImmutable')
    && all('noPolyToMonoDowngrade')
    && all('validOutputSemantics')
  );

  return Object.freeze({
    documentType: 'Stage09AdditionalRealMusicXmlCorpusAudit',
    contractVersion: '1.0.0',
    evidenceClass: 'REAL_EXTERNAL_PINNED_MUSICXML',
    sourceRepository: manifest.sourceRepository,
    sourceCommit: manifest.sourceCommit,
    engineCommit,
    requiredRunCount: 2,
    status: pass ? 'PASS_VERIFIED' : 'FAIL_AUDIT',
    summary: {
      requiredFiles: manifest.files.length,
      identityVerifiedFiles: records.filter((record) => record.identityVerified).length,
      deterministicFiles: records.filter((record) => record.deterministic).length,
      sourceImmutableFiles: records.filter((record) => record.sourceByteImmutable).length,
      polyRequiredFiles: records.filter((record) => record.routeRequirement === 'POLY_V2').length,
      polyToMonoDowngrades: records.filter((record) => !record.noPolyToMonoDowngrade).length,
      pass: records.filter((record) => record.status === 'PASS').length,
      reviewRequired: records.filter((record) => record.status === 'REVIEW_REQUIRED').length,
      blocked: records.filter((record) => record.status === 'BLOCKED').length,
      outputSemanticsValidFiles: records.filter((record) => record.validOutputSemantics).length,
    },
    records,
  });
}

if (require.main === module) {
  const sourceDirectory = process.argv[2] || process.env.STAGE09_ADDITIONAL_CORPUS_DIR || null;
  const outputPath = process.argv[3] || null;
  const report = runAudit({ sourceDirectory });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json, 'utf8');
  process.stdout.write(json);
  process.exitCode = report.status === 'PASS_VERIFIED' ? 0 : 1;
}

module.exports = {
  gitBlobSha,
  outputSemanticsValid,
  runAudit,
  sha256,
  validateManifest,
};
