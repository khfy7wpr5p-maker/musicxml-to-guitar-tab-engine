'use strict';

const crypto = require('node:crypto');
const { processMusicXmlUpload } = require('./musicXmlUploadRuntime');
const { createReviewEditorCapabilitySession } = require('./reviewEditorCapabilityBridge');
const {
  SESSION_PHASE,
  applyReviewCorrectionPatch,
  revalidateReviewEditorRevision,
  saveReviewEditorRevision,
  selectReviewEditorEvent,
} = require('./reviewEditorBackend');
const { createEdtab04dTrustedPitchAdapter } = require('./edtab04dTrustedPitchAdapter');
const { assessEdtab04TeacherRevision } = require('./edtab04cTeacherRevisionHandoff');
const { createEdtab04PitchMaterializer } = require('./edtab04PitchMaterializer');
const {
  STAGE08_STATUS,
  continueRevalidatedRevisionToTab,
} = require('./stage08RevalidationTabContinuation');

const MAX_SESSIONS = 8;
const SESSION_TTL_MS = 15 * 60 * 1000;

function createEdtab04dSessionStore({ now = Date.now } = {}) {
  const sessions = new Map();

  function prune() {
    const time = now();
    for (const [token, record] of sessions) {
      if (time >= record.expiresAt) sessions.delete(token);
    }
  }

  function get(token) {
    prune();
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)
      || !sessions.has(token)) {
      throw new TypeError('Unknown or expired teacher session.');
    }
    return sessions.get(token);
  }

  function open({ fileName, sourceBytes }) {
    prune();
    if (sessions.size >= MAX_SESSIONS) throw new RangeError('Teacher session capacity reached.');
    const bytes = Buffer.from(sourceBytes);
    const uploadResult = processMusicXmlUpload({ fileName, bytes });
    if (uploadResult.status !== 'REVIEW_REQUIRED') {
      throw new TypeError('Only a safe REVIEW_REQUIRED source may open teacher correction.');
    }
    const adapter = createEdtab04dTrustedPitchAdapter({ fileName, sourceBytes: bytes });
    const token = crypto.randomBytes(32).toString('hex');
    const timestamp = new Date(now()).toISOString();
    const session = createReviewEditorCapabilitySession({
      sessionId: `review-${token}`,
      uploadResult,
      sourceBytes: bytes,
      reviewMetadata: {
        revision_id: `review-${token}`,
        actor: 'local-teacher',
        timestamp,
        reason: 'Open MusicXML teacher correction.',
        provenance: { kind: 'RUNTIME_HOST_SESSION' },
      },
      adapterManifest: adapter.manifest,
      adapterState: adapter.initialState,
    });
    sessions.set(token, {
      sourceBytes: bytes,
      fileName,
      uploadResult,
      adapter,
      session,
      expiresAt: now() + SESSION_TTL_MS,
    });
    return Object.freeze({
      token,
      sourceSha256: uploadResult.input.sha256,
      draftBaseRevisionId: uploadResult.reviewTabDraft.revisionId,
      reviewRevisionId: session.review_revision.revision_id,
      issues: session.issues,
      capabilities: adapter.manifest,
    });
  }

  function apply(token, patch) {
    const record = get(token);
    const selected = selectReviewEditorEvent(record.session, patch.target_event);
    record.session = applyReviewCorrectionPatch(selected, patch, record.adapter);
    return Object.freeze({
      phase: record.session.phase,
      patchIds: record.session.pending_patches.map((entry) => entry.patch_id),
    });
  }

  function saveAndRevalidate(token) {
    const record = get(token);
    const timestamp = new Date(now()).toISOString();
    const id = record.session.session_id;
    record.session = saveReviewEditorRevision(record.session, {
      revision_id: `corrected-${id}`,
      actor: 'local-teacher',
      timestamp,
      reason: 'Save exact teacher corrections.',
      provenance: { kind: 'RUNTIME_HOST_SESSION' },
    });
    record.session = revalidateReviewEditorRevision(record.session, {
      revision_id: `revalidated-${id}`,
      actor: 'runtime-validator',
      timestamp: new Date(now()).toISOString(),
      reason: 'Re-enter corrected MusicXML upload.',
      provenance: { kind: 'RUNTIME_HOST_SESSION' },
    }, record.adapter);
    return Object.freeze({
      phase: record.session.phase,
      validationState: record.session.revalidated_revision.validation_state,
      evidence: record.session.revalidated_revision.validation_evidence,
    });
  }

  function finalize(token, { baseRevisionId, commands } = {}) {
    const record = get(token);
    if (record.session.phase !== SESSION_PHASE.REVALIDATED
      || record.session.revalidated_revision.validation_state !== 'VALID') {
      throw new TypeError('Only a VALID correction session can finalize.');
    }
    const timestamp = new Date(now()).toISOString();
    const approvalMetadata = {
      revision_id: `approved-${record.session.session_id}`,
      actor: 'local-teacher',
      timestamp,
      reason: 'Approve exact teacher correction and TAB position parity.',
      provenance: { kind: 'RUNTIME_HOST_SESSION' },
    };
    const parity = assessEdtab04TeacherRevision({
      fileName: record.fileName,
      originalSourceBytes: record.sourceBytes,
      expectedInputSha256: record.uploadResult.input.sha256,
      baseRevisionId,
      commands,
      session: record.session,
      approvalMetadata,
    });
    if (parity.status !== 'MATCHED_FOR_REVIEW') {
      const error = new TypeError(`Teacher position parity was not proven: ${parity.code}.`);
      error.code = 'EDTAB04_POSITION_PARITY_NOT_PROVEN';
      throw error;
    }

    const execution = continueRevalidatedRevisionToTab({
      session: record.session,
      sourceFileName: record.fileName,
      originalSourceBytes: record.sourceBytes,
      materializer: createEdtab04PitchMaterializer(),
      approvalMetadata,
    });
    if (execution.status !== STAGE08_STATUS.PASS
      || execution.sourceIdentity.sha256 !== parity.sourceSha256
      || execution.sourceIdentity.correctedSha256 !== parity.correctedSha256
      || !execution.canonicalTabResult
      || typeof execution.musicXml !== 'string'
      || execution.musicXml.length === 0
      || !execution.approvedRevision) {
      throw new TypeError('Approved canonical output did not reproduce the proven teacher revision.');
    }

    sessions.delete(token);
    return Object.freeze({
      status: 'APPROVED',
      route: execution.route,
      sourceSha256: parity.sourceSha256,
      correctedSha256: parity.correctedSha256,
      draftRevisionId: parity.draftRevisionId,
      correctedRevisionId: parity.correctedRevisionId,
      matchedCount: parity.matchedCount,
      canonicalTabResult: execution.canonicalTabResult,
      musicXml: execution.musicXml,
      approvedRevision: execution.approvedRevision,
    });
  }

  // Internal continuation only. Never serialize this result into an HTTP response.
  function consumeValidated(token) {
    const record = get(token);
    if (record.session.phase !== SESSION_PHASE.REVALIDATED
      || record.session.revalidated_revision.validation_state !== 'VALID') {
      throw new TypeError('Only a VALID correction session can continue.');
    }
    sessions.delete(token);
    return record;
  }

  return Object.freeze({ open, apply, saveAndRevalidate, finalize, consumeValidated });
}

module.exports = { createEdtab04dSessionStore };
