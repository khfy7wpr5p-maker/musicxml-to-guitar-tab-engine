'use strict';

const { EDIT_CLASS } = require('./teacherCorrectionRevision');
const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('./reviewEditorBackend');

const REVIEW_EDITOR_UI_CONTRACT_VERSION = '1.0.0';
const REVIEW_EDITOR_UI_DOCUMENT_TYPE = 'ReviewEditorUiModel';

const UI_DOCUMENT_STATUS = Object.freeze({
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
  PASS: 'PASS',
});

const CONTROL_BY_EDIT_CLASS = Object.freeze({
  [EDIT_CLASS.PITCH_UPDATE]: 'pitch',
  [EDIT_CLASS.DURATION_UPDATE]: 'duration',
  [EDIT_CLASS.ONSET_TIMELINE_CORRECTION]: 'onset',
  [EDIT_CLASS.VOICE_REASSIGNMENT]: 'voice',
  [EDIT_CLASS.STAFF_REASSIGNMENT]: 'staff',
  [EDIT_CLASS.NOTE_ADD]: 'noteAdd',
  [EDIT_CLASS.NOTE_DELETE]: 'noteDelete',
  [EDIT_CLASS.REST_ADD]: 'restAdd',
  [EDIT_CLASS.REST_DELETE]: 'restDelete',
  [EDIT_CLASS.TIE_CORRECTION]: 'tie',
  [EDIT_CLASS.CHORD_GROUPING_CORRECTION]: 'chord',
});

const EDIT_CLASSES = Object.freeze(Object.values(EDIT_CLASS));
const UI_STATUS_SET = new Set(Object.values(UI_DOCUMENT_STATUS));

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function normalizeText(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || value !== value.trim()) {
    throw new TypeError(`${field} must be a bounded non-empty string.`);
  }
  return value;
}

function assertSession(session) {
  if (
    !session
    || session.documentType !== REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE
    || session.contractVersion !== REVIEW_EDITOR_BACKEND_CONTRACT_VERSION
    || !Object.values(SESSION_PHASE).includes(session.phase)
    || !Array.isArray(session.issues)
    || !isPlainObject(session.adapter_manifest)
    || !isPlainObject(session.adapter_manifest.capabilities)
    || !isPlainObject(session.adapter_manifest.history)
  ) {
    throw new TypeError('Stage 07 requires a valid Stage 06 review editor session.');
  }

  for (const editClass of EDIT_CLASSES) {
    const capability = session.adapter_manifest.capabilities[editClass];
    if (!Object.values(CAPABILITY_STATUS).includes(capability)) {
      throw new TypeError(`Stage 06 capability ${editClass} is missing or invalid.`);
    }
  }
}

function issueView(issue, index) {
  if (!isPlainObject(issue)) throw new TypeError(`issues[${index}] must be a plain object.`);
  const evidence = isPlainObject(issue.reviewEvidence) ? issue.reviewEvidence : {};
  const issueId = normalizeText(evidence.issue_id, `issues[${index}].reviewEvidence.issue_id`);
  const code = normalizeText(
    typeof issue.code === 'string' && issue.code.length > 0 ? issue.code : evidence.code,
    `issues[${index}].code`,
  );
  const suggestedReviewAction = typeof evidence.suggested_review_action === 'string'
    && evidence.suggested_review_action.length > 0
    ? normalizeText(evidence.suggested_review_action, `issues[${index}].suggested_review_action`)
    : null;
  const message = typeof issue.message === 'string' && issue.message.length > 0
    ? normalizeText(issue.message, `issues[${index}].message`)
    : suggestedReviewAction || 'Teacher review required.';
  const location = isPlainObject(issue.location)
    ? deepFreeze({ ...issue.location })
    : deepFreeze({
      measure: evidence.measure ?? null,
      staff: evidence.staff ?? null,
      voice: evidence.voice ?? null,
    });

  return deepFreeze({
    issueId,
    code,
    message,
    location,
    suggestedReviewAction,
    selected: false,
  });
}

function blockedIssueView(issue, index) {
  if (!isPlainObject(issue)) throw new TypeError(`blockedIssues[${index}] must be a plain object.`);
  const code = normalizeText(issue.code, `blockedIssues[${index}].code`);
  const message = normalizeText(issue.message, `blockedIssues[${index}].message`);
  return deepFreeze({
    issueId: null,
    code,
    message,
    location: isPlainObject(issue.location) ? deepFreeze({ ...issue.location }) : null,
    suggestedReviewAction: null,
    selected: false,
  });
}

function buildControls(session) {
  const editing = session.phase === SESSION_PHASE.EDITING;
  const hasTarget = session.selected_target !== null && session.selected_target !== undefined;
  const controls = {};

  for (const editClass of EDIT_CLASSES) {
    const controlId = CONTROL_BY_EDIT_CLASS[editClass];
    const availability = session.adapter_manifest.capabilities[editClass];
    controls[controlId] = Object.freeze({
      editClass,
      availability,
      enabled: Boolean(
        editing
        && hasTarget
        && availability !== CAPABILITY_STATUS.UNAVAILABLE
      ),
    });
  }

  return Object.freeze(controls);
}

function reviewModel(session) {
  assertSession(session);
  const issues = session.issues.map(issueView).map((issue) => Object.freeze({
    ...issue,
    selected: issue.issueId === session.selected_issue_id,
  }));
  const editing = session.phase === SESSION_PHASE.EDITING;
  const saved = session.phase === SESSION_PHASE.SAVED;
  const revalidated = session.phase === SESSION_PHASE.REVALIDATED;
  const revalidationState = session.revalidated_revision?.validation_state ?? null;

  return deepFreeze({
    documentType: REVIEW_EDITOR_UI_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_UI_CONTRACT_VERSION,
    documentStatus: UI_DOCUMENT_STATUS.REVIEW_REQUIRED,
    score: {
      canOpen: true,
      locked: false,
      selectedTarget: session.selected_target ?? null,
      selectedIssueId: session.selected_issue_id ?? null,
    },
    blockedReason: null,
    issues,
    controls: buildControls(session),
    actions: {
      undo: Boolean(editing && session.adapter_manifest.history.undo && session.pending_patches.length > 0),
      redo: Boolean(editing && session.adapter_manifest.history.redo && session.redo_patches.length > 0),
      save: Boolean(editing && session.pending_patches.length > 0),
      revalidate: Boolean(saved && session.adapter_manifest.revalidate),
      continueToTab: false,
    },
    revision: {
      phase: session.phase,
      pendingPatchCount: session.pending_patches.length,
      redoPatchCount: session.redo_patches.length,
      revalidationState,
      readyForStage08: Boolean(revalidated && revalidationState === 'VALID'),
    },
  });
}

function blockedModel(blockedReason, blockedIssues) {
  const reason = normalizeText(blockedReason, 'blockedReason');
  if (!Array.isArray(blockedIssues)) throw new TypeError('blockedIssues must be an array.');

  return deepFreeze({
    documentType: REVIEW_EDITOR_UI_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_UI_CONTRACT_VERSION,
    documentStatus: UI_DOCUMENT_STATUS.BLOCKED,
    score: {
      canOpen: false,
      locked: true,
      selectedTarget: null,
      selectedIssueId: null,
    },
    blockedReason: reason,
    issues: blockedIssues.map(blockedIssueView),
    controls: Object.freeze({}),
    actions: {
      undo: false,
      redo: false,
      save: false,
      revalidate: false,
      continueToTab: false,
    },
    revision: {
      phase: null,
      pendingPatchCount: 0,
      redoPatchCount: 0,
      revalidationState: null,
      readyForStage08: false,
    },
  });
}

function passModel() {
  return deepFreeze({
    documentType: REVIEW_EDITOR_UI_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_UI_CONTRACT_VERSION,
    documentStatus: UI_DOCUMENT_STATUS.PASS,
    score: {
      canOpen: true,
      locked: true,
      selectedTarget: null,
      selectedIssueId: null,
    },
    blockedReason: null,
    issues: Object.freeze([]),
    controls: Object.freeze({}),
    actions: {
      undo: false,
      redo: false,
      save: false,
      revalidate: false,
      continueToTab: true,
    },
    revision: {
      phase: null,
      pendingPatchCount: 0,
      redoPatchCount: 0,
      revalidationState: 'VALID',
      readyForStage08: true,
    },
  });
}

function createReviewEditorUiModel({
  status,
  session = null,
  blockedReason = null,
  blockedIssues = [],
}) {
  if (!UI_STATUS_SET.has(status)) throw new TypeError('Stage 07 document status is unsupported.');
  if (status === UI_DOCUMENT_STATUS.REVIEW_REQUIRED) return reviewModel(session);
  if (status === UI_DOCUMENT_STATUS.BLOCKED) return blockedModel(blockedReason, blockedIssues);
  return passModel();
}

module.exports = {
  CONTROL_BY_EDIT_CLASS,
  REVIEW_EDITOR_UI_CONTRACT_VERSION,
  REVIEW_EDITOR_UI_DOCUMENT_TYPE,
  UI_DOCUMENT_STATUS,
  createReviewEditorUiModel,
};
