'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('..');
const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  REVISION_STATE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
  TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
  VALIDATION_STATE,
} = require('../src/app/teacherCorrectionRevision');
const {
  STAGE08_REVIEW_PORT_CONTRACT_VERSION,
  STAGE08_REVIEW_PORT_DOCUMENT_TYPE,
  Stage08ReviewPortError,
  createStage08ReviewPort,
} = require('../src/app/stage08ReviewPort');

function eligibleSession(overrides = {}) {
  const originalSource = {
    source_id: 'source-1',
    sha256: 'a'.repeat(64),
    byte_length: 1234,
  };
  const patches = [{ patch_id: 'patch-1', before: { pitch: 'C4' }, after: { pitch: 'D4' } }];
  const saved = {
    documentType: TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
    contractVersion: TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
    state: REVISION_STATE.TEACHER_CORRECTED_REVISION,
    validation_state: VALIDATION_STATE.PENDING_REVALIDATION,
    revision_id: 'saved-1',
    original_source: originalSource,
    patches,
  };
  const revalidated = {
    documentType: TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
    contractVersion: TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
    state: REVISION_STATE.REVALIDATED_REVISION,
    validation_state: VALIDATION_STATE.VALID,
    revision_id: 'revalidated-1',
    parent_revision_id: saved.revision_id,
    original_source: originalSource,
    patches,
  };
  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    session_id: 'session-1',
    phase: SESSION_PHASE.REVALIDATED,
    saved_revision: saved,
    revalidated_revision: revalidated,
    ...overrides,
  };
}

function reviewPort(snapshotValue) {
  return {
    snapshot: async () => snapshotValue,
    selectIssue: (...args) => ['selectIssue', ...args],
    selectTarget: (...args) => ['selectTarget', ...args],
    resolvePresentationAddress: (...args) => ['resolvePresentationAddress', ...args],
    command: (...args) => ['command', ...args],
    undo: (...args) => ['undo', ...args],
    redo: (...args) => ['redo', ...args],
    save: (...args) => ['save', ...args],
    revalidate: (...args) => ['revalidate', ...args],
  };
}

function uiSnapshot() {
  return Object.freeze({
    uiModel: Object.freeze({
      documentStatus: 'REVIEW_REQUIRED',
      actions: Object.freeze({ continueToTab: false, save: false, revalidate: false }),
      revision: Object.freeze({ readyForStage08: true, revalidationState: 'VALID' }),
    }),
  });
}

test('Stage 08 review port exposes continuation only when an exact current revalidated VALID session is connected', async () => {
  let session = eligibleSession();
  const port = createStage08ReviewPort({
    reviewPort: reviewPort(uiSnapshot()),
    getCurrentSession: () => session,
    buildContinuationRequest: () => ({ sourceFileName: 'corrected.musicxml' }),
    continuation: async (request) => ({ status: 'PASS', revisionId: request.session.revalidated_revision.revision_id }),
  });

  assert.equal(port.documentType, STAGE08_REVIEW_PORT_DOCUMENT_TYPE);
  assert.equal(port.contractVersion, STAGE08_REVIEW_PORT_CONTRACT_VERSION);
  const snapshot = await port.snapshot();
  assert.equal(snapshot.uiModel.documentStatus, 'REVIEW_REQUIRED');
  assert.equal(snapshot.uiModel.actions.continueToTab, true);

  const result = await port.continueToTab();
  assert.deepEqual(result, { status: 'PASS', revisionId: 'revalidated-1' });

  session = { ...session, phase: SESSION_PHASE.SAVED };
  const notReady = await port.snapshot();
  assert.equal(notReady.uiModel.actions.continueToTab, false);
  await assert.rejects(
    () => port.continueToTab(),
    (error) => {
      assert.ok(error instanceof Stage08ReviewPortError);
      assert.equal(error.code, 'STAGE08_CONTINUATION_NOT_READY');
      return true;
    },
  );
});

test('source hash, byte length and patch-ledger mismatch keep UI continuation disabled', async () => {
  for (const mutate of [
    (session) => ({
      ...session,
      revalidated_revision: {
        ...session.revalidated_revision,
        original_source: { ...session.revalidated_revision.original_source, sha256: 'b'.repeat(64) },
      },
    }),
    (session) => ({
      ...session,
      revalidated_revision: {
        ...session.revalidated_revision,
        original_source: { ...session.revalidated_revision.original_source, byte_length: 999 },
      },
    }),
    (session) => ({
      ...session,
      revalidated_revision: {
        ...session.revalidated_revision,
        patches: [{ patch_id: 'patch-2', before: { pitch: 'C4' }, after: { pitch: 'E4' } }],
      },
    }),
  ]) {
    const session = mutate(eligibleSession());
    const port = createStage08ReviewPort({
      reviewPort: reviewPort(uiSnapshot()),
      getCurrentSession: () => session,
      buildContinuationRequest: () => ({ sourceFileName: 'corrected.musicxml' }),
      continuation: async () => ({ status: 'PASS' }),
    });
    const snapshot = await port.snapshot();
    assert.equal(snapshot.uiModel.actions.continueToTab, false);
    await assert.rejects(() => port.continueToTab(), /REVALIDATED\/VALID/);
  }
});

test('Stage 08 review port refuses stale revision/source/session identity before execution', async () => {
  let session = eligibleSession();
  let continuationCalled = false;
  const port = createStage08ReviewPort({
    reviewPort: reviewPort(uiSnapshot()),
    getCurrentSession: () => session,
    buildContinuationRequest: async () => {
      session = {
        ...session,
        revalidated_revision: {
          ...session.revalidated_revision,
          revision_id: 'revalidated-newer',
        },
      };
      return { sourceFileName: 'corrected.musicxml' };
    },
    continuation: async () => {
      continuationCalled = true;
      return { status: 'PASS' };
    },
  });

  await assert.rejects(
    () => port.continueToTab(),
    (error) => {
      assert.ok(error instanceof Stage08ReviewPortError);
      assert.equal(error.code, 'STALE_STAGE08_CONTINUATION');
      return true;
    },
  );
  assert.equal(continuationCalled, false);
});

test('Stage 08 review port refuses a session that becomes stale while conversion is running', async () => {
  let session = eligibleSession();
  const port = createStage08ReviewPort({
    reviewPort: reviewPort(uiSnapshot()),
    getCurrentSession: () => session,
    buildContinuationRequest: () => ({ sourceFileName: 'corrected.musicxml' }),
    continuation: async () => {
      session = {
        ...session,
        revalidated_revision: {
          ...session.revalidated_revision,
          revision_id: 'revalidated-newer',
        },
      };
      return { status: 'PASS' };
    },
  });

  await assert.rejects(
    () => port.continueToTab(),
    (error) => {
      assert.ok(error instanceof Stage08ReviewPortError);
      assert.equal(error.code, 'STALE_STAGE08_CONTINUATION');
      return true;
    },
  );
});

test('Stage 07 browser event alone cannot activate Stage 08 continuation through the trusted review port', async () => {
  const session = eligibleSession({ phase: SESSION_PHASE.SAVED });
  let continuationCalled = false;
  const port = createStage08ReviewPort({
    reviewPort: reviewPort(uiSnapshot()),
    getCurrentSession: () => session,
    buildContinuationRequest: () => ({ fromBrowserEvent: true }),
    continuation: async () => {
      continuationCalled = true;
      return { status: 'PASS' };
    },
  });

  await assert.rejects(() => port.continueToTab(), /REVALIDATED\/VALID/);
  assert.equal(continuationCalled, false);
});

test('ordinary Stage 06 review-port methods are delegated without gaining semantic authority', async () => {
  const port = createStage08ReviewPort({
    reviewPort: reviewPort(uiSnapshot()),
    getCurrentSession: eligibleSession,
    buildContinuationRequest: () => ({ sourceFileName: 'corrected.musicxml' }),
    continuation: async () => ({ status: 'PASS' }),
  });

  assert.deepEqual(port.selectIssue('issue-1'), ['selectIssue', 'issue-1']);
  assert.deepEqual(port.selectTarget('event-1'), ['selectTarget', 'event-1']);
  assert.deepEqual(port.command({ command: 'pitch', value: 'D4' }), ['command', { command: 'pitch', value: 'D4' }]);
});

test('Stage 08 review port remains internal and does not widen package-root API', () => {
  for (const name of [
    'createStage08ReviewPort',
    'STAGE08_REVIEW_PORT_CONTRACT_VERSION',
  ]) {
    assert.equal(publicApi[name], undefined);
  }
});
