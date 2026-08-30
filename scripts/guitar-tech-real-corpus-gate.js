'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const {
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const DEFAULT_MANIFEST = require('../verification/guitar-tech-real-corpus-manifest.json');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resultSnapshot(result) {
  const issues = Array.isArray(result?.preflight?.issues) ? result.preflight.issues : [];
  const blocker = issues.find((issue) => issue?.severity === 'error') || null;
  return Object.freeze({
    status: typeof result?.status === 'string' ? result.status : null,
    route: typeof result?.route === 'string' ? result.route : null,
    blocker: blocker ? Object.freeze({
      code: typeof blocker.code === 'string' ? blocker.code : null,
      category: typeof blocker.category === 'string' ? blocker.category : null,
      feature: typeof blocker?.details?.feature === 'string' ? blocker.details.feature : null,
    }) : null,
    resultSha256: sha256(Buffer.from(JSON.stringify(result))),
    canonicalTabResultSha256: result?.canonicalTabResult
      ? sha256(Buffer.from(JSON.stringify(result.canonicalTabResult)))
      : null,
  });
}

function sameAsHistoricalBaseline(entry, snapshot) {
  const baseline = entry.baseline;
  return Boolean(
    baseline
    && snapshot.status === baseline.status
    && snapshot.route === baseline.route
    && (snapshot.blocker?.code || null) === (baseline.code || null)
    && (snapshot.blocker?.feature || null) === (baseline.feature || null)
  );
}

function validateManifest(manifest) {
  if (
    !manifest
    || manifest.documentType !== 'GuitarTechniqueRealCorpusManifest'
    || manifest.contractVersion !== '1.0.0'
    || manifest.entrypoint !== 'processMusicXmlUpload()'
    || manifest.requiredRunCount !== 2
    || !Array.isArray(manifest.files)
    || manifest.files.length !== 9
  ) {
    throw new Error('Invalid GuitarTechniqueRealCorpusManifest.');
  }
  const names = new Set();
  const hashes = new Set();
  for (const entry of manifest.files) {
    if (
      !entry
      || typeof entry.fileName !== 'string'
      || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')
      || names.has(entry.fileName)
      || hashes.has(entry.sha256)
    ) {
      throw new Error('Corpus manifest contains an invalid or duplicate identity.');
    }
    names.add(entry.fileName);
    hashes.add(entry.sha256);
  }
  return manifest;
}

function baseReport(engineCommit) {
  return {
    documentType: 'GuitarTechniqueRealCorpusGateReport',
    contractVersion: '1.0.0',
    engineCommit: engineCommit || null,
    entrypoint: 'processMusicXmlUpload()',
    requiredRunCount: 2,
    sourceFilesCommitted: false,
    status: null,
    summary: null,
    records: [],
  };
}

function xmlFileNames(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:xml|musicxml)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function runGate({
  corpusDirectory,
  manifest = DEFAULT_MANIFEST,
  processUpload = processMusicXmlUpload,
  engineCommit = null,
} = {}) {
  validateManifest(manifest);
  const report = baseReport(engineCommit);

  if (!corpusDirectory || !fs.existsSync(corpusDirectory) || !fs.statSync(corpusDirectory).isDirectory()) {
    report.status = 'HOLD_MISSING_CORPUS';
    report.summary = { requiredFiles: manifest.files.length, presentFiles: 0 };
    return Object.freeze(report);
  }

  const requiredNames = manifest.files.map((entry) => entry.fileName).sort();
  const presentNames = xmlFileNames(corpusDirectory);
  const missingFiles = requiredNames.filter((name) => !presentNames.includes(name));
  const unexpectedFiles = presentNames.filter((name) => !requiredNames.includes(name));
  if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
    report.status = 'FAIL_CORPUS_IDENTITY';
    report.summary = {
      requiredFiles: requiredNames.length,
      presentFiles: presentNames.length,
      missingFiles,
      unexpectedFiles,
    };
    return Object.freeze(report);
  }

  let identityVerified = true;
  let deterministicFiles = 0;
  let sourceImmutableFiles = 0;
  let xmlSafetyAccepted = 0;
  let polyRouteReached = 0;
  let polyV2Pass = 0;
  let blocked = 0;
  let baselineChanges = 0;

  for (const entry of manifest.files) {
    const filePath = path.join(corpusDirectory, entry.fileName);
    const sourceBytes = fs.readFileSync(filePath);
    const actualSha256 = sha256(sourceBytes);
    if (actualSha256 !== entry.sha256) identityVerified = false;

    if (actualSha256 !== entry.sha256) {
      report.records.push(Object.freeze({
        fileName: entry.fileName,
        expectedSha256: entry.sha256,
        actualSha256,
        identityVerified: false,
        deterministic: false,
        sourceByteImmutable: true,
        historicalBaseline: entry.baseline,
        current: null,
        baselineChanged: null,
      }));
      continue;
    }

    const firstBytes = Buffer.from(sourceBytes);
    const secondBytes = Buffer.from(sourceBytes);
    const firstBefore = sha256(firstBytes);
    const firstResult = processUpload({ fileName: entry.fileName, bytes: firstBytes });
    const firstAfter = sha256(firstBytes);
    const secondBefore = sha256(secondBytes);
    const secondResult = processUpload({ fileName: entry.fileName, bytes: secondBytes });
    const secondAfter = sha256(secondBytes);

    const deterministic = isDeepStrictEqual(firstResult, secondResult);
    const sourceByteImmutable = (
      firstBefore === entry.sha256
      && firstAfter === entry.sha256
      && secondBefore === entry.sha256
      && secondAfter === entry.sha256
    );
    const current = resultSnapshot(firstResult);
    const baselineChanged = !sameAsHistoricalBaseline(entry, current);

    if (deterministic) deterministicFiles += 1;
    if (sourceByteImmutable) sourceImmutableFiles += 1;
    if (!(current.status === 'BLOCKED' && current.blocker?.category === 'safety')) xmlSafetyAccepted += 1;
    if (current.route === 'POLY_V2') polyRouteReached += 1;
    if (current.status === 'PASS' && current.route === 'POLY_V2') polyV2Pass += 1;
    if (current.status === 'BLOCKED') blocked += 1;
    if (baselineChanged) baselineChanges += 1;

    report.records.push(Object.freeze({
      fileName: entry.fileName,
      expectedSha256: entry.sha256,
      actualSha256,
      identityVerified: true,
      deterministic,
      sourceByteImmutable,
      historicalBaseline: entry.baseline,
      current,
      baselineChanged,
    }));
  }

  report.summary = {
    requiredFiles: manifest.files.length,
    identityVerifiedFiles: report.records.filter((record) => record.identityVerified).length,
    deterministicFiles,
    sourceImmutableFiles,
    xmlSafetyAccepted,
    polyRouteReached,
    polyV2Pass,
    blocked,
    baselineChanges,
    projectorReached: 'NOT_OBSERVABLE_WITH_PUBLIC_ENTRYPOINT',
    solverReached: 'NOT_OBSERVABLE_WITH_PUBLIC_ENTRYPOINT',
  };

  if (!identityVerified) report.status = 'FAIL_CORPUS_IDENTITY';
  else if (deterministicFiles !== manifest.files.length) report.status = 'FAIL_NONDETERMINISTIC';
  else if (sourceImmutableFiles !== manifest.files.length) report.status = 'FAIL_SOURCE_BYTE_MUTATION';
  else if (baselineChanges > 0) report.status = 'HOLD_BLOCKER_DIFF_REVIEW_REQUIRED';
  else report.status = 'PASS_NO_UNREVIEWED_DRIFT';

  return Object.freeze(report);
}

function parseArgs(argv) {
  const positional = [];
  let engineCommit = process.env.GUITAR_TECH_ENGINE_COMMIT || null;
  for (const value of argv) {
    if (value.startsWith('--engine-commit=')) engineCommit = value.slice('--engine-commit='.length) || null;
    else positional.push(value);
  }
  return {
    corpusDirectory: positional[0] || process.env.GUITAR_TECH_CORPUS_DIR || null,
    outputPath: positional[1] || null,
    engineCommit,
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const report = runGate(args);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) fs.writeFileSync(args.outputPath, json, 'utf8');
  process.stdout.write(json);
  process.exitCode = report.status === 'PASS_NO_UNREVIEWED_DRIFT' ? 0 : 1;
}

module.exports = {
  runGate,
  resultSnapshot,
  sameAsHistoricalBaseline,
  sha256,
  validateManifest,
};
