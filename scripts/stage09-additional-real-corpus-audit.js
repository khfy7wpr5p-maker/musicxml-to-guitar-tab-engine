'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  MUSICXML_ROUTE_REQUIREMENT,
  routeRequirementFromParsedMusicXml,
} = require('../src/app/musicXmlRouteClassifier');
const manifestDefault = require('../verification/stage09-additional-real-musicxml-corpus.json');

const SHA1 = /^[a-f0-9]{40}$/;
const AUDIT_CONTRACT_VERSION = '1.1.0';
const USABLE_OUTPUT_GATE_CONTRACT_VERSION = '1.0.0';
const USABLE_OUTPUT_GATE_STATUS = Object.freeze({
  PASS: 'PASS_USABLE_OUTPUT_GATE',
  FAIL: 'FAIL_USABLE_OUTPUT_GATE',
});

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

function basisPoints(numerator, denominator) {
  if (!Number.isSafeInteger(denominator) || denominator <= 0) return null;
  return Math.floor((numerator * 10_000) / denominator);
}

function actualRendererMusicXml(result) {
  const sourceArtifactMusicXml = result?.sourceArtifact?.rendererMusicXml;
  if (typeof sourceArtifactMusicXml === 'string' && sourceArtifactMusicXml.length > 0) {
    return sourceArtifactMusicXml;
  }
  return typeof result?.musicXml === 'string' && result.musicXml.length > 0
    ? result.musicXml
    : null;
}

function tabDispositionCounts(result) {
  const dispositions = Array.isArray(result?.arrangementArtifact?.noteDispositions)
    ? result.arrangementArtifact.noteDispositions
    : Array.isArray(result?.canonicalTabResult?.noteDispositions)
      ? result.canonicalTabResult.noteDispositions
      : null;

  if (dispositions) {
    const assigned = dispositions.filter((entry) => (
      entry?.selectedPosition
      && (entry.disposition === 'KEEP' || entry.disposition === 'KEPT')
    )).length;
    const unassigned = dispositions.filter((entry) => entry?.disposition === 'UNASSIGNED').length;
    return {
      source: dispositions.length,
      assigned,
      unassigned,
      coverageBasisPoints: basisPoints(assigned, dispositions.length),
    };
  }

  const canonicalNoteCount = result?.canonicalTabResult?.noteCount;
  if (Number.isSafeInteger(canonicalNoteCount) && canonicalNoteCount >= 0) {
    return {
      source: canonicalNoteCount,
      assigned: canonicalNoteCount,
      unassigned: 0,
      coverageBasisPoints: 10_000,
    };
  }

  return {
    source: null,
    assigned: null,
    unassigned: null,
    coverageBasisPoints: null,
  };
}

function reviewEditorCapabilityAvailable(session) {
  if (
    session?.documentType !== REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE
    || session?.contractVersion !== REVIEW_EDITOR_BACKEND_CONTRACT_VERSION
    || session?.phase !== SESSION_PHASE.EDITING
    || session?.review_revision?.review_evidence?.status !== 'REVIEW_REQUIRED'
    || session?.review_revision?.review_evidence?.canOpenForReview !== true
  ) return false;

  const adapterCapabilities = session?.adapter_manifest?.capabilities;
  if (!adapterCapabilities || typeof adapterCapabilities !== 'object') return false;
  return Object.values(adapterCapabilities).some((status) => (
    status === CAPABILITY_STATUS.AVAILABLE || status === CAPABILITY_STATUS.BOUNDED
  ));
}

function buildUsableOutputRecord(result, {
  sourceParseable,
  blocker,
  reviewEditorSession = null,
}) {
  const usableOutputEligible = sourceParseable === true && blocker?.category !== 'safety';
  const capabilities = result?.capabilities || {};
  const sourceRenderable = Boolean(
    usableOutputEligible
    && capabilities.renderScore === true
    && actualRendererMusicXml(result),
  );
  const tabArtifact = result?.arrangementArtifact || result?.canonicalTabResult || null;
  const tabArtifactAvailable = Boolean(
    usableOutputEligible
    && capabilities.generateTab === true
    && tabArtifact,
  );
  const canonicalAvailable = Boolean(
    tabArtifactAvailable
    && result?.status === 'PASS'
    && result?.canonicalTabResult
    && capabilities.export === true
    && result?.artifacts?.canonicalTabAvailable === true,
  );
  const directEditCapabilityAvailable = result?.status === 'PASS' && [
    'editPitch',
    'editRhythm',
    'editVoice',
    'editStructure',
    'editTab',
    'editFingering',
  ].some((name) => capabilities[name] === true);
  const bridgedEditCapabilityAvailable = result?.status === 'REVIEW_REQUIRED'
    && reviewEditorCapabilityAvailable(reviewEditorSession);
  const teacherEditable = Boolean(
    sourceRenderable
    && tabArtifactAvailable
    && (directEditCapabilityAvailable || bridgedEditCapabilityAvailable),
  );
  const counts = tabArtifactAvailable
    ? tabDispositionCounts(result)
    : { source: null, assigned: null, unassigned: null, coverageBasisPoints: null };

  return Object.freeze({
    sourceParseable: sourceParseable === true,
    usableOutputEligible,
    sourceRenderable,
    tabArtifactAvailable,
    canonicalAvailable,
    teacherEditable,
    tabSourceNoteCount: counts.source,
    tabAssignedNoteCount: counts.assigned,
    tabUnassignedNoteCount: counts.unassigned,
    tabCoverageBasisPoints: counts.coverageBasisPoints,
    hardBlockReason: result?.status === 'BLOCKED' ? blocker : null,
  });
}

function hardBlockReasonSummary(records) {
  const counts = new Map();
  for (const record of records) {
    if (!record.hardBlockReason) continue;
    const reason = record.hardBlockReason;
    const key = JSON.stringify([reason.code, reason.category, reason.feature]);
    const current = counts.get(key) || { ...reason, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((left, right) => (
    String(left.code).localeCompare(String(right.code))
    || String(left.feature).localeCompare(String(right.feature))
  ));
}

function evaluateUsableOutputGate(records) {
  const eligible = records.filter((record) => record.usableOutputEligible);
  const sourceRenderableFiles = eligible.filter((record) => record.sourceRenderable).length;
  const tabArtifactFiles = eligible.filter((record) => record.tabArtifactAvailable).length;
  const canonicalFiles = eligible.filter((record) => record.canonicalAvailable).length;
  const teacherEditableFiles = eligible.filter((record) => record.teacherEditable).length;
  const knownCoverage = eligible.filter((record) => Number.isSafeInteger(record.tabSourceNoteCount));
  const knownSourceNotes = knownCoverage.reduce((sum, record) => sum + record.tabSourceNoteCount, 0);
  const assignedTabNotes = knownCoverage.reduce((sum, record) => sum + record.tabAssignedNoteCount, 0);
  const unassignedNotes = knownCoverage.reduce((sum, record) => sum + record.tabUnassignedNoteCount, 0);
  const gaps = [];

  if (eligible.length === 0) gaps.push('ELIGIBLE_FILES_0');
  if (sourceRenderableFiles !== eligible.length) {
    gaps.push(`SOURCE_RENDERABLE_FILES_${sourceRenderableFiles}_OF_${eligible.length}`);
  }
  if (tabArtifactFiles !== eligible.length) {
    gaps.push(`TAB_ARTIFACT_FILES_${tabArtifactFiles}_OF_${eligible.length}`);
  }
  if (teacherEditableFiles !== eligible.length) {
    gaps.push(`TEACHER_EDITABLE_FILES_${teacherEditableFiles}_OF_${eligible.length}`);
  }

  return Object.freeze({
    documentType: 'Stage09UsableOutputProductGate',
    contractVersion: USABLE_OUTPUT_GATE_CONTRACT_VERSION,
    status: gaps.length === 0 ? USABLE_OUTPUT_GATE_STATUS.PASS : USABLE_OUTPUT_GATE_STATUS.FAIL,
    summary: Object.freeze({
      eligibleFiles: eligible.length,
      sourceRenderableFiles,
      sourceRenderableRateBasisPoints: basisPoints(sourceRenderableFiles, eligible.length),
      tabArtifactFiles,
      tabArtifactRateBasisPoints: basisPoints(tabArtifactFiles, eligible.length),
      canonicalFiles,
      teacherEditableFiles,
      teacherEditableRateBasisPoints: basisPoints(teacherEditableFiles, eligible.length),
      knownTabSourceNotes: knownSourceNotes,
      assignedTabNotes,
      unassignedNotes,
      aggregateTabCoverageBasisPoints: knownCoverage.length > 0
        ? (knownSourceNotes === 0 ? 10_000 : basisPoints(assignedTabNotes, knownSourceNotes))
        : null,
      hardBlockedFiles: records.filter((record) => record.status === 'BLOCKED').length,
      hardBlockReasons: Object.freeze(hardBlockReasonSummary(records).map(Object.freeze)),
    }),
    gaps: Object.freeze(gaps),
  });
}

function usableOutputSummaryMarkdown(report) {
  const gate = report.usableOutputGate;
  const summary = gate.summary;
  const rate = (value) => value === null ? 'n/a' : `${(value / 100).toFixed(2)}%`;
  return [
    '## Stage 09 usable-output product gate',
    '',
    `**${gate.status}**`,
    '',
    '| Metric | Result |',
    '|---|---:|',
    `| Eligible safe/parseable files | ${summary.eligibleFiles} |`,
    `| Source renderable | ${summary.sourceRenderableFiles} (${rate(summary.sourceRenderableRateBasisPoints)}) |`,
    `| TAB artifact available | ${summary.tabArtifactFiles} (${rate(summary.tabArtifactRateBasisPoints)}) |`,
    `| Canonical available | ${summary.canonicalFiles} |`,
    `| Teacher editable | ${summary.teacherEditableFiles} (${rate(summary.teacherEditableRateBasisPoints)}) |`,
    `| Aggregate TAB coverage | ${rate(summary.aggregateTabCoverageBasisPoints)} |`,
    `| Explicit unassigned notes | ${summary.unassignedNotes} |`,
    `| Hard blocked files | ${summary.hardBlockedFiles} |`,
    '',
    `Gaps: ${gate.gaps.length === 0 ? 'none' : gate.gaps.join(', ')}`,
    '',
    'This product result is independent from the deterministic/source-safety audit status.',
    '',
  ].join('\n');
}

function runAudit({
  sourceDirectory,
  manifest = manifestDefault,
  processUpload = processMusicXmlUpload,
  reviewEditorSessionFactory = null,
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
    const blocker = blockerSnapshot(firstResult);
    let reviewEditorSession = null;
    if (firstResult?.status === 'REVIEW_REQUIRED' && typeof reviewEditorSessionFactory === 'function') {
      try {
        reviewEditorSession = reviewEditorSessionFactory(Object.freeze({
          uploadResult: firstResult,
          sourceBytes: Buffer.from(original),
          path: entry.path,
        }));
      } catch {
        reviewEditorSession = null;
      }
    }
    const usableOutput = buildUsableOutputRecord(firstResult, {
      sourceParseable: requirement !== 'UNRESOLVED',
      blocker,
      reviewEditorSession,
    });

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
      blocker,
      noPolyToMonoDowngrade,
      validOutputSemantics,
      ...usableOutput,
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
    contractVersion: AUDIT_CONTRACT_VERSION,
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
    usableOutputGate: evaluateUsableOutputGate(records),
    records,
  });
}

if (require.main === module) {
  const sourceDirectory = process.argv[2] || process.env.STAGE09_ADDITIONAL_CORPUS_DIR || null;
  const outputPath = process.argv[3] || null;
  const report = runAudit({ sourceDirectory });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) fs.writeFileSync(outputPath, json, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, usableOutputSummaryMarkdown(report), 'utf8');
  }
  process.stdout.write(json);
  process.exitCode = report.status === 'PASS_VERIFIED' ? 0 : 1;
}

module.exports = {
  AUDIT_CONTRACT_VERSION,
  USABLE_OUTPUT_GATE_CONTRACT_VERSION,
  USABLE_OUTPUT_GATE_STATUS,
  buildUsableOutputRecord,
  evaluateUsableOutputGate,
  gitBlobSha,
  outputSemanticsValid,
  runAudit,
  sha256,
  usableOutputSummaryMarkdown,
  validateManifest,
};
