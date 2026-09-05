'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  VALIDATION_STATE,
  createOriginalSourceSnapshot,
  createReviewRevision,
  createTeacherCorrectedRevision,
  createRevalidatedRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
  STAGE08_MATERIALIZER_CONTRACT_VERSION,
} = require('../src/app/stage08RevalidationTabContinuation');
const {
  continueStage08ProductionToCanonicalTab,
} = require('../src/app/stage08ProductionContinuation');
const {
  evaluateStage09ProductGate,
} = require('./stage09-real-corpus-product-gate');

const SHA256 = /^[a-f0-9]{64}$/;
const PACKET_TYPE = 'Stage09TeacherCorrectionPreparedCase';
const EVIDENCE_CLASS = 'REAL_TEACHER_CORRECTION';
const RUNNER_VERSION = '1.0.0';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  return JSON.stringify(value);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function verifyPacket(packet, evidenceDir) {
  assertPlainObject(packet, 'packet');
  if (packet.documentType !== PACKET_TYPE) throw new TypeError('Unsupported correction packet type.');
  if (packet.evidenceClass !== 'REAL_TEACHER_CORRECTION_PREPARED') {
    throw new TypeError('Correction packet must remain prepared real teacher evidence.');
  }
  if (typeof packet.caseId !== 'string' || !packet.caseId) throw new TypeError('caseId is required.');
  if (typeof packet.sourceId !== 'string' || !packet.sourceId) throw new TypeError('sourceId is required.');
  if (!Array.isArray(packet.stage05Patches) || packet.stage05Patches.length === 0) {
    throw new TypeError(`${packet.caseId} requires a non-empty Stage05 patch ledger.`);
  }
  if (!Array.isArray(packet.coverageTags) || packet.coverageTags.length === 0) {
    throw new TypeError(`${packet.caseId} requires coverageTags.`);
  }

  const original = path.join(evidenceDir, packet.original?.fileName || '');
  const corrected = path.join(evidenceDir, packet.corrected?.fileName || '');
  if (!fs.existsSync(original) || !fs.existsSync(corrected)) {
    throw new TypeError(`${packet.caseId} source files are missing from the private evidence directory.`);
  }

  const originalBytes = fs.readFileSync(original);
  const correctedBytes = fs.readFileSync(corrected);
  const originalSha256 = sha256(originalBytes);
  const correctedSha256 = sha256(correctedBytes);
  if (!SHA256.test(packet.original?.sha256 || '') || packet.original.sha256 !== originalSha256) {
    throw new TypeError(`${packet.caseId} original SHA-256 mismatch.`);
  }
  if (!SHA256.test(packet.corrected?.sha256 || '') || packet.corrected.sha256 !== correctedSha256) {
    throw new TypeError(`${packet.caseId} corrected SHA-256 mismatch.`);
  }
  if (originalSha256 === correctedSha256) throw new TypeError(`${packet.caseId} contains no material correction.`);
  if (packet.original.byteLength !== originalBytes.byteLength) throw new TypeError(`${packet.caseId} original byte length mismatch.`);
  if (packet.corrected.byteLength !== correctedBytes.byteLength) throw new TypeError(`${packet.caseId} corrected byte length mismatch.`);

  return { packet, original, corrected, originalBytes, correctedBytes, originalSha256, correctedSha256 };
}

function revisionBundle(verified, ordinal) {
  const { packet, originalBytes, originalSha256, correctedSha256 } = verified;
  const baseMinute = ordinal * 10;
  const timestamp = (offset) => new Date(Date.UTC(2026, 8, 5, 8, baseMinute + offset, 0)).toISOString();

  const source = createOriginalSourceSnapshot({
    source_id: packet.sourceId,
    byte_length: originalBytes.byteLength,
    sha256: originalSha256,
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: {
      evidenceClass: EVIDENCE_CLASS,
      caseId: packet.caseId,
      sourceSoftware: packet.sourceSoftware || [],
      referenceSha256: packet.reference?.sha256 || null,
    },
  });
  const review = createReviewRevision(source, {
    revision_id: `${packet.caseId}-review`,
    actor: 'teacher',
    timestamp: timestamp(0),
    reason: 'Real OMR source reviewed against source notation.',
    provenance: { stage: 'STAGE_04_REVIEW', caseId: packet.caseId },
    review_evidence: { status: 'REVIEW_REQUIRED', canOpenForReview: true },
  });
  const saved = createTeacherCorrectedRevision(review, {
    revision_id: `${packet.caseId}-saved`,
    actor: 'teacher',
    timestamp: timestamp(1),
    reason: 'Teacher-approved correction materialized from source notation.',
    provenance: { stage: 'STAGE_06_CORRECTION', caseId: packet.caseId },
    patches: packet.stage05Patches,
  });
  const revalidated = createRevalidatedRevision(saved, {
    revision_id: `${packet.caseId}-revalidated`,
    actor: 'validator',
    timestamp: timestamp(2),
    reason: 'Exact corrected bytes prepared for independent Stage 08 re-entry.',
    provenance: {
      stage: 'STAGE_06_REVALIDATION',
      caseId: packet.caseId,
      correctedSha256,
      sourceImmutable: true,
    },
    validation_state: VALIDATION_STATE.VALID,
    validation_evidence: {
      status: 'VALID',
      correctedSha256,
      patchCount: packet.stage05Patches.length,
      sourceImmutable: true,
    },
  });

  return {
    source,
    saved,
    revalidated,
    session: {
      documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
      contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
      session_id: `${packet.caseId}-session`,
      phase: SESSION_PHASE.REVALIDATED,
      saved_revision: saved,
      revalidated_revision: revalidated,
    },
  };
}

function requestFor(verified, revisions) {
  const { packet, originalBytes, correctedBytes, correctedSha256 } = verified;
  return {
    session: revisions.session,
    sourceFileName: path.basename(verified.original).replace(/[^A-Za-z0-9._,-]/g, '_'),
    originalSourceBytes: Buffer.from(originalBytes),
    materializer: {
      manifest: {
        contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
        adapterId: 'stage09-private-tierb-materializer',
        mediaType: 'application/vnd.recordare.musicxml+xml',
      },
      materialize({ source, savedRevision, revalidatedRevision }) {
        return {
          correctedBytes: Buffer.from(correctedBytes),
          evidence: {
            documentType: STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
            contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
            adapterId: 'stage09-private-tierb-materializer',
            sourceId: source.source_id,
            correctedRevisionId: revalidatedRevision.revision_id,
            parentRevisionId: savedRevision.revision_id,
            originalSha256: source.sha256,
            correctedSha256,
            correctedByteLength: correctedBytes.byteLength,
            patchIds: revalidatedRevision.patches.map((entry) => entry.patch_id),
            mediaType: 'application/vnd.recordare.musicxml+xml',
          },
        };
      },
    },
    approvalMetadata: {
      revision_id: `${packet.caseId}-approved`,
      actor: 'stage08-engine',
      timestamp: '2026-09-05T09:00:00.000Z',
      reason: 'Stage 08 private Tier B corpus re-entry.',
      provenance: { stage: 'STAGE_08_REVALIDATION_AND_TAB', caseId: packet.caseId },
    },
  };
}

function executionFingerprint(result) {
  return {
    status: result.status,
    route: result.route ?? null,
    correctedSha256: result.materializationEvidence?.correctedSha256 ?? null,
    reentryStatus: result.reentry?.status ?? null,
    canonicalDocumentType: result.canonicalTabResult?.documentType ?? null,
    outputSha256: result.approvalEvidence?.output_sha256 ?? null,
    approvedRevisionId: result.approvedRevision?.revision_id ?? null,
  };
}

function runCase(verified, ordinal) {
  const revisions = revisionBundle(verified, ordinal);
  const request = requestFor(verified, revisions);
  const beforeSha = sha256(request.originalSourceBytes);
  const first = continueStage08ProductionToCanonicalTab(request);
  const midSha = sha256(request.originalSourceBytes);
  const second = continueStage08ProductionToCanonicalTab(request);
  const afterSha = sha256(request.originalSourceBytes);
  const firstFingerprint = executionFingerprint(first);
  const secondFingerprint = executionFingerprint(second);
  const deterministic = stable(firstFingerprint) === stable(secondFingerprint);
  const sourceByteImmutable = beforeSha === midSha && midSha === afterSha && afterSha === verified.originalSha256;
  const pass = first.status === 'PASS';

  return {
    caseId: verified.packet.caseId,
    sourceId: verified.packet.sourceId,
    evidenceClass: EVIDENCE_CLASS,
    originalSha256: verified.originalSha256,
    correctedSha256: verified.correctedSha256,
    savedRevisionId: revisions.saved.revision_id,
    revalidatedRevisionId: revisions.revalidated.revision_id,
    validationState: 'VALID',
    patchIds: revisions.revalidated.patches.map((entry) => entry.patch_id),
    coverageTags: [...verified.packet.coverageTags],
    stage08Audit: {
      identityVerified: first.materializationEvidence?.originalSha256 === verified.originalSha256
        && first.materializationEvidence?.correctedSha256 === verified.correctedSha256,
      deterministic,
      sourceByteImmutable,
      status: first.status,
      route: first.route ?? null,
      approvedCanonicalEvidenceVerified: pass
        ? first.approvedRevision?.stage08_evidence?.corrected_sha256 === verified.correctedSha256
          && first.approvalEvidence?.corrected_sha256 === verified.correctedSha256
        : false,
      writerOutputSha256: pass ? first.approvalEvidence?.output_sha256 ?? null : null,
    },
    runFingerprints: [firstFingerprint, secondFingerprint],
  };
}

function discoverPackets(evidenceDir) {
  return fs.readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.correction-packet.json'))
    .sort()
    .map((name) => ({ fileName: name, packet: readJson(path.join(evidenceDir, name)) }));
}

function buildCorpus(cases) {
  return {
    documentType: 'Stage09RealTeacherCorrectionCorpus',
    contractVersion: '1.0.0',
    evidenceClass: EVIDENCE_CLASS,
    sourceFilesCommitted: false,
    requiredRunCount: 2,
    candidateInventory: 'verification/stage09-teacher-correction-evidence-candidates.json',
    auditedCandidateCount: cases.length,
    eligibleCandidateCount: cases.length,
    cases,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const evidenceDir = path.resolve(args.shift() || 'local-evidence/stage09-tierb-private');
  let out = path.resolve('local-evidence/stage09-tierb-private-audit.json');
  let promote = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--out') out = path.resolve(args.shift());
    else if (arg === '--promote') promote = true;
    else throw new TypeError(`Unknown argument: ${arg}`);
  }
  return { evidenceDir, out, promote };
}

function runPrivateTierBAudit({ evidenceDir, out, promote = false }) {
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    throw new TypeError(`Private evidence directory not found: ${evidenceDir}`);
  }
  const discovered = discoverPackets(evidenceDir);
  if (discovered.length !== 3) throw new TypeError(`Expected exactly 3 private correction packets, found ${discovered.length}.`);
  const verified = discovered.map(({ packet }) => verifyPacket(packet, evidenceDir));
  const cases = verified.map((entry, index) => runCase(entry, index));
  const corpus = buildCorpus(cases);
  const gate = evaluateStage09ProductGate({ correctionCorpus: corpus });
  const report = {
    documentType: 'Stage09PrivateTierBRevalidationAudit',
    contractVersion: RUNNER_VERSION,
    sourceFilesCommitted: false,
    caseCount: cases.length,
    corpus,
    gate,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  if (promote) {
    if (gate.status !== 'PASS_PRODUCT_GATE' || gate.stage09Complete !== true) {
      throw new Error(`Refusing promotion: Stage 09 gate is ${gate.status}.`);
    }
    fs.writeFileSync(
      path.resolve('verification/stage09-real-teacher-correction-corpus.json'),
      `${JSON.stringify(corpus, null, 2)}\n`,
    );
  }
  return report;
}

if (require.main === module) {
  try {
    const report = runPrivateTierBAudit(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.gate.status === 'PASS_PRODUCT_GATE' ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildCorpus,
  discoverPackets,
  executionFingerprint,
  parseArgs,
  runPrivateTierBAudit,
  verifyPacket,
};
