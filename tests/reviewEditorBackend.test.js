'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const publicApi = require('..');
const {
  SOURCE_REVIEW_AVAILABILITY,
  SCORE_ROUTE,
} = require('../src/app/reviewableScoreState');
const {
  buildOmrReviewScoreState,
} = require('../src/app/omrReviewEvidence');
const {
  EDIT_CLASS,
  REVISION_STATE,
  VALIDATION_STATE,
  createOriginalSourceSnapshot,
  createReviewRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  ReviewEditorBackendError,
  SESSION_PHASE,
  addReviewNote,
  applyReviewCorrectionPatch,
  changeReviewPitch,
  changeReviewVoice,
  createReviewEditorSession,
  getReviewEditorCapabilities,
  listReviewEditorIssues,
  normalizeCapabilityManifest,
  redoReviewEditor,
  revalidateReviewEditorRevision,
  saveReviewEditorRevision,
  selectReviewEditorEvent,
  selectReviewEditorIssue,
  undoReviewEditor,
} = require('../src/app/reviewEditorBackend');

function issuePayload(overrides = {}) {
  return {
    issue_id: 'issue-1',
    category: 'semantic',
    code: 'OMR_SUSPECTED_PITCH',
    severity: 'error',
    measure: '12',
    staff: 1,
    voice: 2,
    event_id_or_location: 'event-1',
    observed_value: { pitch: 'F#4' },
    confidence_or_evidence_if_available: { confidence: 0.62 },
    suggested_review_action: 'VERIFY_PITCH',
    source_provenance: { engine: 'test-omr', source: 'fixture.musicxml' },
    ...overrides,
  };
}

function reviewState(payloads = [issuePayload()]) {
  return buildOmrReviewScoreState({
    route: SCORE_ROUTE.POLY_V2,
    sourceReviewAvailability: SOURCE_REVIEW_AVAILABILITY.SAFE_TO_OPEN,
    issuePayloads: payloads,
  });
}

function reviewRevision(state = reviewState()) {
  const source = createOriginalSourceSnapshot({
    source_id: 'source-1',
    byte_length: 321,
    sha256: 'b'.repeat(64),
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: { fixture: true },
  });
  return createReviewRevision(source, {
    revision_id: 'review-1',
    actor: { type: 'SYSTEM', id: 'omr-review' },
    timestamp: '2026-09-03T21:00:00.000Z',
    reason: 'Open reviewable OMR evidence.',
    review_evidence: state,
    provenance: { stage: 'STAGE_04_OMR_REVIEW_MODEL' },
  });
}

function manifest(overrides = {}) {
  const capabilities = Object.fromEntries(
    Object.values(EDIT_CLASS).map((editClass) => [editClass, CAPABILITY_STATUS.BOUNDED]),
  );
  capabilities[EDIT_CLASS.PITCH_UPDATE] = CAPABILITY_STATUS.AVAILABLE;
  capabilities[EDIT_CLASS.VOICE_REASSIGNMENT] = CAPABILITY_STATUS.UNAVAILABLE;
  capabilities[EDIT_CLASS.STAFF_REASSIGNMENT] = CAPABILITY_STATUS.UNAVAILABLE;
  return {
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    adapterId: 'fake-editor-core-adapter',
    capabilities,
    history: { undo: true, redo: true },
    revalidate: true,
    ...overrides,
  };
}

function adapter(adapterManifest = manifest()) {
  return {
    manifest: adapterManifest,
    applyPatch({ adapterState, patch }) {
      const entry = {
        patchId: patch.patch_id,
        before: adapterState.current,
        after: patch.after,
      };
      return {
        adapterState: {
          current: patch.after,
          history: [...adapterState.history, entry],
          redo: [],
        },
        evidence: { operation: 'apply', patchId: patch.patch_id },
      };
    },
    undo({ adapterState, expectedPatch }) {
      const entry = adapterState.history.at(-1);
      if (!entry || entry.patchId !== expectedPatch.patch_id) throw new Error('history mismatch');
      return {
        adapterState: {
          current: entry.before,
          history: adapterState.history.slice(0, -1),
          redo: [...adapterState.redo, entry],
        },
        evidence: { operation: 'undo', patchId: entry.patchId },
      };
    },
    redo({ adapterState, expectedPatch }) {
      const entry = adapterState.redo.at(-1);
      if (!entry || entry.patchId !== expectedPatch.patch_id) throw new Error('redo mismatch');
      return {
        adapterState: {
          current: entry.after,
          history: [...adapterState.history, entry],
          redo: adapterState.redo.slice(0, -1),
        },
        evidence: { operation: 'redo', patchId: entry.patchId },
      };
    },
    revalidate({ adapterState }) {
      return {
        adapterState,
        validationState: VALIDATION_STATE.VALID,
        validationEvidence: {
          score: 'VALID',
          musicXml: 'VALID',
          timing: 'VALID',
          adapter: 'fake-editor-core-adapter',
        },
      };
    },
  };
}

function session(options = {}) {
  const state = options.reviewState || reviewState();
  return createReviewEditorSession({
    sessionId: options.sessionId || 'session-1',
    reviewState: state,
    reviewRevision: options.reviewRevision || reviewRevision(state),
    adapterManifest: options.adapterManifest || manifest(),
    adapterState: options.adapterState || { current: { pitch: 'F#4' }, history: [], redo: [] },
  });
}

function selectedSession(options = {}) {
  return selectReviewEditorIssue(session(options), 'issue-1');
}

function pitchChange(overrides = {}) {
  return {
    patch_id: 'patch-pitch-1',
    target_event: 'event-1',
    before: { pitch: 'F#4' },
    after: { pitch: 'G4' },
    ...overrides,
  };
}

test('loads only an explicit Stage 04 REVIEW_REQUIRED score and exposes stable issue selection', () => {
  let current = session();
  assert.equal(current.phase, SESSION_PHASE.EDITING);
  assert.equal(listReviewEditorIssues(current).length, 1);
  assert.equal(current.selected_issue_id, null);

  current = selectReviewEditorIssue(current, 'issue-1');
  assert.equal(current.selected_issue_id, 'issue-1');
  assert.equal(current.selected_target, 'event-1');
  assert.equal(Object.isFrozen(current), true);
  assert.equal(Object.isFrozen(current.adapter_state), true);
});

test('duplicate Stage 04 issue ids fail closed instead of making issue selection ambiguous', () => {
  const state = reviewState([
    issuePayload(),
    issuePayload({ code: 'OMR_SUSPECTED_DURATION', suggested_review_action: 'VERIFY_DURATION' }),
  ]);
  assert.throws(
    () => createReviewEditorSession({
      sessionId: 'duplicate-issues',
      reviewState: state,
      reviewRevision: reviewRevision(state),
      adapterManifest: manifest(),
      adapterState: { current: null, history: [], redo: [] },
    }),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'DUPLICATE_ISSUE_ID',
  );
});

test('adapter capability manifest is explicit for every Stage 05 edit class', () => {
  const normalized = normalizeCapabilityManifest(manifest());
  assert.deepEqual(Object.keys(normalized.capabilities).sort(), Object.values(EDIT_CLASS).sort());
  assert.equal(normalized.capabilities[EDIT_CLASS.PITCH_UPDATE], CAPABILITY_STATUS.AVAILABLE);
  assert.equal(normalized.capabilities[EDIT_CLASS.VOICE_REASSIGNMENT], CAPABILITY_STATUS.UNAVAILABLE);
  assert.equal(getReviewEditorCapabilities(session()).adapterId, 'fake-editor-core-adapter');

  const missing = manifest();
  delete missing.capabilities[EDIT_CLASS.VOICE_REASSIGNMENT];
  assert.throws(
    () => normalizeCapabilityManifest(missing),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'INVALID_ADAPTER_MANIFEST',
  );
});

test('pitch correction delegates musical mutation to trusted adapter and records Stage 05 patch only', () => {
  const editor = adapter();
  const before = selectedSession();
  const current = changeReviewPitch(before, pitchChange(), editor);

  assert.equal(current.pending_patches.length, 1);
  assert.equal(current.pending_patches[0].edit_class, EDIT_CLASS.PITCH_UPDATE);
  assert.deepEqual(current.pending_patches[0].inverse_patch.before, { pitch: 'G4' });
  assert.deepEqual(current.adapter_state.current, { pitch: 'G4' });
  assert.equal(current.operation_log.at(-1).operation, 'APPLY_PATCH');
  assert.deepEqual(before.adapter_state.current, { pitch: 'F#4' });
});

test('generic patch path rejects target drift between selection and requested correction', () => {
  const current = selectedSession();
  assert.throws(
    () => applyReviewCorrectionPatch(current, {
      patch_id: 'wrong-target',
      edit_class: EDIT_CLASS.PITCH_UPDATE,
      target_event: 'event-2',
      before: { pitch: 'F#4' },
      after: { pitch: 'G4' },
    }, adapter()),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'TARGET_MISMATCH',
  );
});

test('canonical voice reassignment remains unavailable when adapter audit does not expose a primitive', () => {
  const current = selectedSession();
  let called = false;
  const editor = adapter();
  editor.applyPatch = () => { called = true; throw new Error('must not call'); };

  assert.throws(
    () => changeReviewVoice(current, {
      patch_id: 'voice-1',
      target_event: 'event-1',
      before: { voice: 1 },
      after: { voice: 2 },
    }, editor),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'CAPABILITY_UNAVAILABLE',
  );
  assert.equal(called, false);
});

test('bounded note add is adapter-gated and never invents pitch or duration', () => {
  let current = selectReviewEditorEvent(session(), { measureId: 'm1', voiceId: 'v1', onset: '1/4' });
  current = addReviewNote(current, {
    patch_id: 'note-add-1',
    target_event: { measureId: 'm1', voiceId: 'v1', onset: '1/4' },
    before: null,
    after: { noteId: 'note-new', pitch: 'C4', duration: '1/4' },
  }, adapter());
  assert.equal(current.pending_patches[0].edit_class, EDIT_CLASS.NOTE_ADD);

  const fresh = selectReviewEditorEvent(session(), { measureId: 'm1', voiceId: 'v1', onset: '1/4' });
  assert.throws(
    () => addReviewNote(fresh, {
      patch_id: 'note-add-guess',
      target_event: { measureId: 'm1', voiceId: 'v1', onset: '1/4' },
      before: null,
      after: null,
    }, adapter()),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'INVALID_CORRECTION_PATCH',
  );
});

test('undo and redo are delegated to adapter history while Stage 06 tracks current patch ledger', () => {
  const editor = adapter();
  let current = changeReviewPitch(selectedSession(), pitchChange(), editor);
  assert.deepEqual(current.adapter_state.current, { pitch: 'G4' });

  current = undoReviewEditor(current, editor);
  assert.equal(current.pending_patches.length, 0);
  assert.equal(current.redo_patches.length, 1);
  assert.deepEqual(current.adapter_state.current, { pitch: 'F#4' });
  assert.equal(current.operation_log.at(-1).operation, 'UNDO');

  current = redoReviewEditor(current, editor);
  assert.equal(current.pending_patches.length, 1);
  assert.equal(current.redo_patches.length, 0);
  assert.deepEqual(current.adapter_state.current, { pitch: 'G4' });
  assert.equal(current.operation_log.at(-1).operation, 'REDO');
});

test('a new edit after undo clears redo without executing stale redo authority', () => {
  const editor = adapter();
  let current = changeReviewPitch(selectedSession(), pitchChange(), editor);
  current = undoReviewEditor(current, editor);
  current = changeReviewPitch(current, pitchChange({
    patch_id: 'patch-pitch-2',
    before: { pitch: 'F#4' },
    after: { pitch: 'A4' },
  }), editor);
  assert.equal(current.redo_patches.length, 0);
  assert.equal(current.pending_patches.length, 1);
  assert.equal(current.pending_patches[0].patch_id, 'patch-pitch-2');
});

test('save creates a Stage 05 TEACHER_CORRECTED_REVISION and locks further editor mutation', () => {
  const editor = adapter();
  let current = changeReviewPitch(selectedSession(), pitchChange(), editor);
  current = saveReviewEditorRevision(current, {
    revision_id: 'teacher-1',
    actor: { type: 'TEACHER', id: 'teacher-1' },
    timestamp: '2026-09-03T21:05:00.000Z',
    reason: 'Teacher verified pitch.',
    provenance: { ui: 'review-editor' },
  });

  assert.equal(current.phase, SESSION_PHASE.SAVED);
  assert.equal(current.saved_revision.state, REVISION_STATE.TEACHER_CORRECTED_REVISION);
  assert.equal(current.saved_revision.validation_state, VALIDATION_STATE.PENDING_REVALIDATION);
  assert.equal(current.saved_revision.patches.length, 1);
  assert.throws(
    () => undoReviewEditor(current, editor),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'INVALID_PHASE',
  );
});

test('revalidate delegates validation to trusted adapter then records Stage 05 REVALIDATED_REVISION', () => {
  const editor = adapter();
  let current = changeReviewPitch(selectedSession(), pitchChange(), editor);
  current = saveReviewEditorRevision(current, {
    revision_id: 'teacher-1',
    actor: 'teacher',
    timestamp: '2026-09-03T21:05:00.000Z',
    reason: 'Teacher verified pitch.',
    provenance: { ui: 'review-editor' },
  });
  current = revalidateReviewEditorRevision(current, {
    revision_id: 'revalidated-1',
    actor: 'validator',
    timestamp: '2026-09-03T21:06:00.000Z',
    reason: 'Validate corrected revision.',
    provenance: { gate: 'stage-06' },
  }, editor);

  assert.equal(current.phase, SESSION_PHASE.REVALIDATED);
  assert.equal(current.revalidated_revision.state, REVISION_STATE.REVALIDATED_REVISION);
  assert.equal(current.revalidated_revision.validation_state, VALIDATION_STATE.VALID);
  assert.deepEqual(current.revalidated_revision.validation_evidence, {
    adapter: 'fake-editor-core-adapter',
    musicXml: 'VALID',
    score: 'VALID',
    timing: 'VALID',
  });
});

test('revalidation and history stay fail-closed when manifest does not authorize them', () => {
  const noHistoryManifest = manifest({ history: { undo: false, redo: false }, revalidate: false });
  const editor = adapter(noHistoryManifest);
  let current = selectedSession({ adapterManifest: noHistoryManifest });
  current = changeReviewPitch(current, pitchChange(), editor);
  assert.throws(
    () => undoReviewEditor(current, editor),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'HISTORY_UNAVAILABLE',
  );
  current = saveReviewEditorRevision(current, {
    revision_id: 'teacher-no-revalidate',
    actor: 'teacher',
    timestamp: '2026-09-03T21:05:00.000Z',
    reason: 'Save bounded correction.',
    provenance: { test: true },
  });
  assert.throws(
    () => revalidateReviewEditorRevision(current, {
      revision_id: 'revalidate-not-authorized',
      actor: 'validator',
      timestamp: '2026-09-03T21:06:00.000Z',
      reason: 'Should not run.',
      provenance: { test: true },
    }, editor),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'REVALIDATION_UNAVAILABLE',
  );
});

test('trusted adapter identity is revision-session bound and mismatches fail before handler execution', () => {
  const current = selectedSession();
  let called = false;
  const wrong = adapter({ ...manifest(), adapterId: 'different-adapter' });
  wrong.applyPatch = () => { called = true; return { adapterState: {}, evidence: {} }; };
  assert.throws(
    () => changeReviewPitch(current, pitchChange(), wrong),
    (error) => error instanceof ReviewEditorBackendError && error.code === 'ADAPTER_MISMATCH',
  );
  assert.equal(called, false);
});

test('Stage 06 review editor backend remains internal and does not widen package-root API', () => {
  for (const name of [
    'createReviewEditorSession',
    'applyReviewCorrectionPatch',
    'saveReviewEditorRevision',
    'revalidateReviewEditorRevision',
    'REVIEW_EDITOR_BACKEND_CONTRACT_VERSION',
  ]) {
    assert.equal(publicApi[name], undefined);
  }
});
