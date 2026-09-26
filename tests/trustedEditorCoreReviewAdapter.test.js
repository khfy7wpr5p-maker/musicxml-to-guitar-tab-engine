'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  changeReviewDuration,
  changeReviewPitch,
  redoReviewEditor,
  revalidateReviewEditorRevision,
  saveReviewEditorRevision,
  selectReviewEditorIssue,
  undoReviewEditor,
} = require('../src/app/reviewEditorBackend');
const { createReviewEditorCapabilitySession } = require('../src/app/reviewEditorCapabilityBridge');
const {
  EDIT_CLASS,
  VALIDATION_STATE,
} = require('../src/app/teacherCorrectionRevision');
const {
  EDITOR_CORE_SOURCE_REVISION,
  SESLITAB_EDITOR_HOST_VERSION,
  TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST,
  createTrustedEditorCoreReviewAdapter,
  createTrustedEditorCoreReviewAdapterState,
} = require('../src/app/trustedEditorCoreReviewAdapter');

function createBridge() {
  const documentId = 'editor-core-document-1';
  const revisions = ['editor-core-rev-1'];
  let index = 0;
  let selectedTarget = 'event-7';
  let valid = true;

  const profile = Object.freeze({
    productionAuthority: false,
    networkAuthority: false,
    persistenceAuthority: false,
    serverRevisionAuthority: false,
  });

  return {
    sourceRevision: EDITOR_CORE_SOURCE_REVISION,
    hostVersion: SESLITAB_EDITOR_HOST_VERSION,
    profile,
    snapshot() {
      return {
        documentId,
        revisionId: revisions[index],
        historyPastLength: index,
        historyFutureLength: revisions.length - index - 1,
      };
    },
    matchesSelection(target) {
      return JSON.stringify(target) === JSON.stringify(selectedTarget);
    },
    commitScoreIntent({ intent, identity, selectedTarget: target }) {
      if (!this.matchesSelection(target)) return { ok: false, evidence: {} };
      if (intent.type !== 'SET_PITCH' && intent.type !== 'SET_DURATION') return { ok: false, evidence: {} };
      revisions.splice(index + 1);
      revisions.push(identity.nextRevisionId);
      index += 1;
      return {
        ok: true,
        evidence: {
          intentType: intent.type,
          transactionId: identity.transactionId,
          commandId: identity.commandId,
        },
      };
    },
    navigateHistory(action) {
      if (action === 'UNDO' && index > 0) index -= 1;
      else if (action === 'REDO' && index < revisions.length - 1) index += 1;
      else return { ok: false, evidence: {} };
      return { ok: true, evidence: { action } };
    },
    validateCanonicalSession({ documentId: requestedDocumentId, revisionId }) {
      assert.equal(requestedDocumentId, documentId);
      assert.equal(revisionId, revisions[index]);
      return {
        validationState: valid ? VALIDATION_STATE.VALID : VALIDATION_STATE.INVALID,
        evidence: { validator: 'fake-exact-pin-editor-core' },
      };
    },
    setSelectedTarget(target) {
      selectedTarget = target;
    },
    setValid(value) {
      valid = value;
    },
  };
}

function uploadResult(bytes) {
  return {
    documentType: 'MusicXmlUploadRuntimeResult',
    contractVersion: '1.0.0',
    resultSchemaVersion: '1.1.0',
    capabilityContractVersion: '1.0.0',
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    input: {
      fileName: 'teacher-score.musicxml',
      byteLength: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    },
    scoreAvailable: true,
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    capabilities: {
      renderScore: true,
      generateTab: true,
      editPitch: false,
      editRhythm: false,
      editVoice: false,
      editStructure: false,
      playback: 'APPROXIMATE',
      export: false,
    },
    artifacts: { provisionalTabAvailable: true, canonicalTabAvailable: false },
    issues: [{
      issueId: 'issue_pitch_7',
      severity: 'error',
      category: 'semantic',
      code: 'OMR_SUSPECTED_PITCH',
      message: 'Pitch requires teacher review.',
      teacherActionRequired: true,
      allowedActions: ['ACCEPT_AS_IS', 'EDIT_MANUALLY'],
      location: { measure: 4, measureIndex: 3, eventIndex: 2, sourceEventId: 'event-7' },
      reviewEvidence: {
        staff: 1,
        voice: 2,
        suggested_review_action: 'Confirm the written pitch.',
      },
    }],
  };
}

function session(bytes, bridge) {
  return createReviewEditorCapabilitySession({
    sessionId: 'review-editor-core-adapter-session',
    uploadResult: uploadResult(bytes),
    sourceBytes: bytes,
    reviewMetadata: {
      revision_id: 'review-editor-core-adapter-revision',
      actor: { kind: 'TEACHER', id: 'teacher-local' },
      timestamp: '2026-09-08T18:30:00.000Z',
      reason: 'Open exact-pin Editor Core review session.',
      provenance: { source: 'GUITAR_TAB_WORKBENCH' },
    },
    adapterManifest: TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST,
    adapterState: createTrustedEditorCoreReviewAdapterState(bridge),
  });
}

function saveMetadata() {
  return {
    revision_id: 'teacher-corrected-editor-core-adapter',
    actor: { kind: 'TEACHER', id: 'teacher-local' },
    timestamp: '2026-09-08T18:31:00.000Z',
    reason: 'Save exact-pin Editor Core correction.',
    provenance: { source: 'TRUSTED_EDITOR_CORE_REVIEW_ADAPTER' },
  };
}

function revalidationMetadata() {
  return {
    revision_id: 'revalidated-editor-core-adapter',
    actor: { kind: 'SYSTEM', id: 'editor-core-validator' },
    timestamp: '2026-09-08T18:32:00.000Z',
    reason: 'Validate exact-pin Editor Core canonical session.',
    provenance: { source: 'TRUSTED_EDITOR_CORE_REVIEW_ADAPTER' },
  };
}

test('exact-pin manifest exposes only evidenced pitch/duration mutation capabilities', () => {
  assert.equal(TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST.contractVersion, REVIEW_EDITOR_BACKEND_CONTRACT_VERSION);
  assert.equal(TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST.capabilities[EDIT_CLASS.PITCH_UPDATE], CAPABILITY_STATUS.AVAILABLE);
  assert.equal(TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST.capabilities[EDIT_CLASS.DURATION_UPDATE], CAPABILITY_STATUS.BOUNDED);
  for (const editClass of Object.values(EDIT_CLASS)) {
    if ([EDIT_CLASS.PITCH_UPDATE, EDIT_CLASS.DURATION_UPDATE].includes(editClass)) continue;
    assert.equal(TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST.capabilities[editClass], CAPABILITY_STATUS.UNAVAILABLE);
  }
  assert.deepEqual(TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST.history, { undo: true, redo: true });
  assert.equal(TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST.revalidate, true);
});

test('Stage 06 pitch correction uses exact Editor Core intent transition, unified history and non-mutating validation', () => {
  const bytes = Buffer.from('<score-partwise version="4.0"><part-list/></score-partwise>', 'utf8');
  const bridge = createBridge();
  const adapter = createTrustedEditorCoreReviewAdapter({ bridge });
  let current = selectReviewEditorIssue(session(bytes, bridge), 'issue_pitch_7');

  current = changeReviewPitch(current, {
    patch_id: 'patch-pitch-exact-core',
    target_event: 'event-7',
    before: { step: 'C', alter: 0, octave: 4 },
    after: { step: 'D', alter: 0, octave: 4 },
  }, adapter);
  assert.equal(current.pending_patches.length, 1);
  assert.equal(current.adapter_state.historyPastLength, 1);
  assert.equal(current.adapter_state.historyFutureLength, 0);
  assert.match(current.adapter_state.revisionId, /^rr-rev-[0-9a-f]{32}$/);
  assert.equal(current.operation_log.at(-1).evidence.intentType, 'SET_PITCH');

  current = undoReviewEditor(current, adapter);
  assert.equal(current.adapter_state.historyPastLength, 0);
  assert.equal(current.adapter_state.historyFutureLength, 1);
  current = redoReviewEditor(current, adapter);
  assert.equal(current.adapter_state.historyPastLength, 1);
  assert.equal(current.adapter_state.historyFutureLength, 0);

  current = saveReviewEditorRevision(current, saveMetadata());
  const beforeValidation = { ...current.adapter_state };
  current = revalidateReviewEditorRevision(current, revalidationMetadata(), adapter);
  assert.equal(current.revalidated_revision.validation_state, VALIDATION_STATE.VALID);
  assert.deepEqual(current.adapter_state, beforeValidation);
  assert.equal(
    current.revalidated_revision.validation_evidence.kind,
    'ST_SCORE_EDITOR_CORE_CANONICAL_SESSION_VALIDATION',
  );
});

test('duration correction maps only a reduced rational into SET_DURATION', () => {
  const bytes = Buffer.from('<score-partwise/>', 'utf8');
  const bridge = createBridge();
  const adapter = createTrustedEditorCoreReviewAdapter({ bridge });
  let current = selectReviewEditorIssue(session(bytes, bridge), 'issue_pitch_7');

  current = changeReviewDuration(current, {
    patch_id: 'patch-duration-exact-core',
    target_event: 'event-7',
    before: { numerator: 1, denominator: 4 },
    after: { numerator: 3, denominator: 8 },
  }, adapter);
  assert.equal(current.operation_log.at(-1).evidence.intentType, 'SET_DURATION');

  const staleBridge = createBridge();
  const staleAdapter = createTrustedEditorCoreReviewAdapter({ bridge: staleBridge });
  let staleSession = selectReviewEditorIssue(session(bytes, staleBridge), 'issue_pitch_7');
  assert.throws(
    () => changeReviewDuration(staleSession, {
      patch_id: 'patch-duration-invalid',
      target_event: 'event-7',
      before: { numerator: 1, denominator: 4 },
      after: { numerator: 2, denominator: 8 },
    }, staleAdapter),
    /trusted editor adapter rejected|duration must be reduced/,
  );
});

test('adapter fails closed on selection drift and authority/pin widening', () => {
  const bytes = Buffer.from('<score-partwise/>', 'utf8');
  const bridge = createBridge();
  const adapter = createTrustedEditorCoreReviewAdapter({ bridge });
  let current = selectReviewEditorIssue(session(bytes, bridge), 'issue_pitch_7');
  bridge.setSelectedTarget('different-event');
  assert.throws(
    () => changeReviewPitch(current, {
      patch_id: 'patch-selection-drift',
      target_event: 'event-7',
      before: { step: 'C', alter: 0, octave: 4 },
      after: { step: 'D', alter: 0, octave: 4 },
    }, adapter),
    /canonical selection does not match/,
  );

  assert.throws(
    () => createTrustedEditorCoreReviewAdapter({
      bridge: { ...createBridge(), sourceRevision: 'new-unreviewed-editor-core' },
    }),
    /source revision mismatch/,
  );
  const widened = createBridge();
  widened.profile = { ...widened.profile, productionAuthority: true };
  assert.throws(
    () => createTrustedEditorCoreReviewAdapter({ bridge: widened }),
    /non-production authority profile/,
  );
});
