'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  createReviewEditorCapabilitySession,
} = require('../src/app/reviewEditorCapabilityBridge');
const {
  EDIT_CLASS,
  VALIDATION_STATE,
} = require('../src/app/teacherCorrectionRevision');
const {
  createReviewEditorApplicationPort,
} = require('../src/app/reviewEditorApplicationPort');
const {
  createStage08ReviewPort,
} = require('../src/app/stage08ReviewPort');

function manifest() {
  return {
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    adapterId: 'trusted-editor-core-test',
    capabilities: Object.fromEntries(Object.values(EDIT_CLASS).map((editClass) => [
      editClass,
      editClass === EDIT_CLASS.PITCH_UPDATE ? CAPABILITY_STATUS.AVAILABLE : CAPABILITY_STATUS.UNAVAILABLE,
    ])),
    history: { undo: true, redo: true },
    revalidate: true,
  };
}

function adapter() {
  const adapterManifest = manifest();
  return {
    manifest: adapterManifest,
    applyPatch({ adapterState, patch }) {
      return {
        adapterState: {
          ...adapterState,
          currentPitch: patch.after,
          history: [...adapterState.history, patch.patch_id],
          redo: [],
        },
        evidence: { operation: 'applyPatch', patchId: patch.patch_id },
      };
    },
    undo({ adapterState, expectedPatch }) {
      return {
        adapterState: {
          ...adapterState,
          currentPitch: expectedPatch.before,
          history: adapterState.history.slice(0, -1),
          redo: [...adapterState.redo, expectedPatch.patch_id],
        },
        evidence: { operation: 'undo', patchId: expectedPatch.patch_id },
      };
    },
    redo({ adapterState, expectedPatch }) {
      return {
        adapterState: {
          ...adapterState,
          currentPitch: expectedPatch.after,
          history: [...adapterState.history, expectedPatch.patch_id],
          redo: adapterState.redo.slice(0, -1),
        },
        evidence: { operation: 'redo', patchId: expectedPatch.patch_id },
      };
    },
    revalidate({ adapterState, savedRevision }) {
      return {
        adapterState,
        validationState: VALIDATION_STATE.VALID,
        validationEvidence: {
          kind: 'TRUSTED_EDITOR_CORE_REVALIDATION',
          savedRevisionId: savedRevision.revision_id,
        },
      };
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

function initialSession(bytes, trustedAdapter) {
  return createReviewEditorCapabilitySession({
    sessionId: 'review-session-app-port-1',
    uploadResult: uploadResult(bytes),
    sourceBytes: bytes,
    reviewMetadata: {
      revision_id: 'review-revision-app-port-1',
      actor: { kind: 'TEACHER', id: 'teacher-local' },
      timestamp: '2026-09-08T18:00:00.000Z',
      reason: 'Open teacher review.',
      provenance: { source: 'GUITAR_TAB_WORKBENCH' },
    },
    adapterManifest: trustedAdapter.manifest,
    adapterState: {
      currentPitch: { step: 'C', alter: 0, octave: 4 },
      history: [],
      redo: [],
    },
  });
}

function createPort(bytes) {
  const trustedAdapter = adapter();
  const port = createReviewEditorApplicationPort({
    initialSession: initialSession(bytes, trustedAdapter),
    adapter: trustedAdapter,
    resolveCommandChange: ({ session, command, value }) => {
      assert.equal(command, EDIT_CLASS.PITCH_UPDATE);
      return {
        patch_id: 'patch-pitch-1',
        target_event: session.selected_target,
        before: session.adapter_state.currentPitch,
        after: value,
      };
    },
    resolvePresentationAddress: ({ session, selectedTarget, selectedIssueId }) => ({
      contractVersion: '3.0.0',
      kind: 'note',
      documentId: 'score-doc-1',
      revisionId: session.adapter_state.history.length === 0 ? 'score-rev-1' : 'score-rev-2',
      partId: 'part-1',
      staffId: 'staff-1',
      measureId: 'measure-4',
      voiceId: 'voice-2',
      eventId: typeof selectedTarget === 'string' ? selectedTarget : 'event-7',
      noteId: selectedIssueId === 'issue_pitch_7' ? 'note-7' : 'note-selected',
    }),
    createSaveMetadata: () => ({
      revision_id: 'teacher-corrected-app-port-1',
      actor: { kind: 'TEACHER', id: 'teacher-local' },
      timestamp: '2026-09-08T18:01:00.000Z',
      reason: 'Save teacher correction.',
      provenance: { source: 'REVIEW_EDITOR_APPLICATION_PORT' },
    }),
    createRevalidationMetadata: () => ({
      revision_id: 'revalidated-app-port-1',
      actor: { kind: 'SYSTEM', id: 'revalidator' },
      timestamp: '2026-09-08T18:02:00.000Z',
      reason: 'Revalidate teacher correction.',
      provenance: { source: 'REVIEW_EDITOR_APPLICATION_PORT' },
    }),
  });
  return port;
}

test('application port connects capability review session to Stage 07 protocol and Stage 08 eligibility', async () => {
  const bytes = Buffer.from('<score-partwise version="4.0"><part-list/></score-partwise>', 'utf8');
  const port = createPort(bytes);

  let snapshot = await port.snapshot();
  assert.equal(snapshot.uiModel.documentStatus, 'REVIEW_REQUIRED');
  assert.equal(snapshot.uiModel.score.canOpen, true);
  assert.equal(snapshot.uiModel.actions.continueToTab, false);

  snapshot = await port.selectIssue('issue_pitch_7');
  assert.equal(snapshot.uiModel.score.selectedIssueId, 'issue_pitch_7');
  assert.equal(snapshot.uiModel.score.selectedTarget, 'event-7');
  assert.equal(snapshot.uiModel.controls.pitch.enabled, true);

  const address = await port.resolvePresentationAddress({
    selectedTarget: 'event-7',
    selectedIssueId: 'issue_pitch_7',
  });
  assert.equal(address.contractVersion, '3.0.0');
  assert.equal(address.kind, 'note');
  assert.equal(address.eventId, 'event-7');

  snapshot = await port.command({
    command: EDIT_CLASS.PITCH_UPDATE,
    value: { step: 'D', alter: 0, octave: 4 },
  });
  assert.equal(snapshot.uiModel.revision.pendingPatchCount, 1);
  assert.deepEqual(port.getCurrentSession().adapter_state.currentPitch, { step: 'D', alter: 0, octave: 4 });

  await port.undo();
  assert.deepEqual(port.getCurrentSession().adapter_state.currentPitch, { step: 'C', alter: 0, octave: 4 });
  await port.redo();
  assert.deepEqual(port.getCurrentSession().adapter_state.currentPitch, { step: 'D', alter: 0, octave: 4 });

  snapshot = await port.save();
  assert.equal(port.getCurrentSession().phase, SESSION_PHASE.SAVED);
  assert.equal(snapshot.uiModel.actions.revalidate, true);

  snapshot = await port.revalidate();
  assert.equal(port.getCurrentSession().phase, SESSION_PHASE.REVALIDATED);
  assert.equal(port.getCurrentSession().revalidated_revision.validation_state, VALIDATION_STATE.VALID);
  assert.equal(snapshot.uiModel.revision.readyForStage08, true);
  assert.equal(snapshot.uiModel.actions.continueToTab, false);

  const stage08Port = createStage08ReviewPort({
    reviewPort: port,
    getCurrentSession: () => port.getCurrentSession(),
    buildContinuationRequest: () => ({ sourceBytes: bytes }),
    continuation: ({ session }) => ({
      status: 'PASS',
      revalidatedRevisionId: session.revalidated_revision.revision_id,
    }),
  });
  const stage08Snapshot = await stage08Port.snapshot();
  assert.equal(stage08Snapshot.uiModel.actions.continueToTab, true);
  const continued = await stage08Port.continueToTab();
  assert.equal(continued.status, 'PASS');
  assert.equal(continued.revalidatedRevisionId, 'revalidated-app-port-1');
});

test('application port refuses UI-authored target/before authority and unsupported commands', async () => {
  const bytes = Buffer.from('<score-partwise/>', 'utf8');
  const port = createPort(bytes);
  await port.selectIssue('issue_pitch_7');

  await assert.rejects(
    () => port.command({ command: 'UNKNOWN_EDIT', value: null }),
    /supported Stage 05 edit class/,
  );

  await assert.rejects(
    () => port.command({
      command: EDIT_CLASS.PITCH_UPDATE,
      value: { target_event: 'evil-target', before: 'invented', after: 'invented' },
    }),
    /correction patch violates|must be|no-op|after/,
  );
});

test('application port rejects a trusted resolver that changes the current Stage 06 target', async () => {
  const bytes = Buffer.from('<score-partwise/>', 'utf8');
  const trustedAdapter = adapter();
  const port = createReviewEditorApplicationPort({
    initialSession: initialSession(bytes, trustedAdapter),
    adapter: trustedAdapter,
    resolveCommandChange: ({ value }) => ({
      patch_id: 'patch-bad-target',
      target_event: 'different-event',
      before: { step: 'C', alter: 0, octave: 4 },
      after: value,
    }),
    resolvePresentationAddress: () => null,
    createSaveMetadata: () => ({}),
    createRevalidationMetadata: () => ({}),
  });
  await port.selectIssue('issue_pitch_7');

  await assert.rejects(
    () => port.command({ command: EDIT_CLASS.PITCH_UPDATE, value: { step: 'D', alter: 0, octave: 4 } }),
    /target does not match the current Stage 06 selection/,
  );
});
