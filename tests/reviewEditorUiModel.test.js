'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('..');
const { EDIT_CLASS } = require('../src/app/teacherCorrectionRevision');
const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  REVIEW_EDITOR_UI_CONTRACT_VERSION,
  REVIEW_EDITOR_UI_DOCUMENT_TYPE,
  UI_DOCUMENT_STATUS,
  createReviewEditorUiModel,
} = require('../src/app/reviewEditorUiModel');

function capabilities(overrides = {}) {
  return Object.fromEntries(Object.values(EDIT_CLASS).map((editClass) => [
    editClass,
    overrides[editClass] || CAPABILITY_STATUS.AVAILABLE,
  ]));
}

function issue(id = 'issue-1') {
  return {
    severity: 'error',
    category: 'content',
    code: 'OMR_SUSPECTED_PITCH',
    message: null,
    location: {
      measure: 4,
      measureIndex: 3,
      eventIndex: 2,
      sourceEventId: 'event-4-3',
    },
    reviewEvidence: {
      issue_id: id,
      code: 'OMR_SUSPECTED_PITCH',
      suggested_review_action: 'Verify the written pitch.',
      measure: 4,
      staff: 1,
      voice: 2,
    },
  };
}

function session({
  phase = SESSION_PHASE.EDITING,
  selectedIssueId = 'issue-1',
  selectedTarget = 'event-4-3',
  pendingPatches = [{ patch_id: 'patch-1' }],
  redoPatches = [],
  capabilityOverrides = {},
  history = { undo: true, redo: true },
  revalidate = true,
  revalidationState = null,
} = {}) {
  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    phase,
    issues: [issue()],
    selected_issue_id: selectedIssueId,
    selected_target: selectedTarget,
    adapter_manifest: {
      capabilities: capabilities(capabilityOverrides),
      history,
      revalidate,
    },
    pending_patches: pendingPatches,
    redo_patches: redoPatches,
    revalidated_revision: revalidationState === null
      ? null
      : { validation_state: revalidationState },
  };
}

test('REVIEW_REQUIRED opens the score, synchronizes issue selection and capability-gates edit controls', () => {
  const model = createReviewEditorUiModel({
    status: UI_DOCUMENT_STATUS.REVIEW_REQUIRED,
    session: session({
      capabilityOverrides: {
        [EDIT_CLASS.VOICE_REASSIGNMENT]: CAPABILITY_STATUS.UNAVAILABLE,
        [EDIT_CLASS.STAFF_REASSIGNMENT]: CAPABILITY_STATUS.UNAVAILABLE,
        [EDIT_CLASS.NOTE_ADD]: CAPABILITY_STATUS.BOUNDED,
      },
    }),
  });

  assert.equal(model.documentType, REVIEW_EDITOR_UI_DOCUMENT_TYPE);
  assert.equal(model.contractVersion, REVIEW_EDITOR_UI_CONTRACT_VERSION);
  assert.equal(model.score.canOpen, true);
  assert.equal(model.score.locked, false);
  assert.equal(model.issues.length, 1);
  assert.equal(model.issues[0].selected, true);
  assert.equal(model.issues[0].issueId, 'issue-1');
  assert.equal(model.issues[0].location.measure, 4);
  assert.equal(model.controls.pitch.enabled, true);
  assert.equal(model.controls.noteAdd.enabled, true);
  assert.equal(model.controls.noteAdd.availability, CAPABILITY_STATUS.BOUNDED);
  assert.equal(model.controls.voice.enabled, false);
  assert.equal(model.controls.staff.enabled, false);
  assert.equal(model.actions.undo, true);
  assert.equal(model.actions.save, true);
  assert.equal(model.actions.revalidate, false);
  assert.equal(model.actions.continueToTab, false);
});

test('edit controls remain disabled until a stable current target is selected', () => {
  const model = createReviewEditorUiModel({
    status: UI_DOCUMENT_STATUS.REVIEW_REQUIRED,
    session: session({ selectedTarget: null }),
  });

  for (const control of Object.values(model.controls)) {
    assert.equal(control.enabled, false);
  }
});

test('SAVED enables revalidation and REVALIDATED VALID marks Stage 08 readiness without claiming PASS', () => {
  const saved = createReviewEditorUiModel({
    status: UI_DOCUMENT_STATUS.REVIEW_REQUIRED,
    session: session({
      phase: SESSION_PHASE.SAVED,
      pendingPatches: [{ patch_id: 'patch-1' }],
    }),
  });
  assert.equal(saved.actions.revalidate, true);
  assert.equal(saved.actions.save, false);
  assert.equal(saved.revision.readyForStage08, false);

  const revalidated = createReviewEditorUiModel({
    status: UI_DOCUMENT_STATUS.REVIEW_REQUIRED,
    session: session({
      phase: SESSION_PHASE.REVALIDATED,
      revalidationState: 'VALID',
    }),
  });
  assert.equal(revalidated.revision.readyForStage08, true);
  assert.equal(revalidated.actions.continueToTab, false);
  assert.equal(revalidated.documentStatus, UI_DOCUMENT_STATUS.REVIEW_REQUIRED);
});

test('BLOCKED never opens the editor and exposes the explicit reason', () => {
  const model = createReviewEditorUiModel({
    status: UI_DOCUMENT_STATUS.BLOCKED,
    blockedReason: 'Unsafe or unparseable source cannot be edited safely.',
    blockedIssues: [{
      code: 'OMR_UNSAFE_XML',
      message: 'Source safety validation failed.',
      location: null,
    }],
  });

  assert.equal(model.score.canOpen, false);
  assert.equal(model.score.locked, true);
  assert.equal(model.blockedReason, 'Unsafe or unparseable source cannot be edited safely.');
  assert.equal(model.issues[0].code, 'OMR_UNSAFE_XML');
  assert.equal(model.actions.save, false);
  assert.equal(model.actions.continueToTab, false);
});

test('PASS is the only Stage 07 state that exposes continuation to the TAB flow', () => {
  const model = createReviewEditorUiModel({ status: UI_DOCUMENT_STATUS.PASS });
  assert.equal(model.score.canOpen, true);
  assert.equal(model.score.locked, true);
  assert.equal(model.actions.continueToTab, true);
  assert.equal(model.revision.readyForStage08, true);
});

test('Stage 07 presentation model remains internal and does not widen package-root API', () => {
  for (const name of [
    'createReviewEditorUiModel',
    'REVIEW_EDITOR_UI_CONTRACT_VERSION',
    'UI_DOCUMENT_STATUS',
  ]) {
    assert.equal(publicApi[name], undefined);
  }
});
