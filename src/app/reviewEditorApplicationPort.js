'use strict';

const {
  changeReviewPitch,
  changeReviewDuration,
  changeReviewOnset,
  changeReviewVoice,
  changeReviewStaff,
  addReviewNote,
  deleteReviewNote,
  addReviewRest,
  deleteReviewRest,
  changeReviewTie,
  changeReviewChordGrouping,
  redoReviewEditor,
  revalidateReviewEditorRevision,
  saveReviewEditorRevision,
  selectReviewEditorEvent,
  selectReviewEditorIssue,
  undoReviewEditor,
} = require('./reviewEditorBackend');
const { createReviewEditorUiModel } = require('./reviewEditorUiModel');
const { EDIT_CLASS } = require('./teacherCorrectionRevision');

const REVIEW_EDITOR_APPLICATION_PORT_CONTRACT_VERSION = '1.0.0';
const REVIEW_EDITOR_APPLICATION_PORT_DOCUMENT_TYPE = 'ReviewEditorApplicationPort';
const REVIEW_EDITOR_APPLICATION_PORT_SNAPSHOT_DOCUMENT_TYPE = 'ReviewEditorApplicationPortSnapshot';
const MAX_COMMAND_VALUE_DEPTH = 8;
const MAX_COMMAND_VALUE_NODES = 2048;
const MAX_TEXT = 4096;

class ReviewEditorApplicationPortError extends Error {
  constructor(message, code = 'INVALID_REVIEW_EDITOR_APPLICATION_PORT', details = {}) {
    super(message);
    this.name = 'ReviewEditorApplicationPortError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

function fail(message, code, details = {}) {
  throw new ReviewEditorApplicationPortError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedJson(value, field, state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_COMMAND_VALUE_NODES) fail(`${field} exceeds the node limit.`, 'INVALID_UI_COMMAND');
  if (depth > MAX_COMMAND_VALUE_DEPTH) fail(`${field} exceeds the depth limit.`, 'INVALID_UI_COMMAND');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${field} numbers must be finite.`, 'INVALID_UI_COMMAND');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT) fail(`${field} contains an oversized string.`, 'INVALID_UI_COMMAND');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 256) fail(`${field} contains too many array items.`, 'INVALID_UI_COMMAND');
    return Object.freeze(value.map((entry, index) => boundedJson(entry, `${field}[${index}]`, state, depth + 1)));
  }
  if (!isPlainObject(value)) fail(`${field} must contain only plain JSON-like data.`, 'INVALID_UI_COMMAND');
  const keys = Object.keys(value);
  if (keys.length > 128) fail(`${field} contains too many object fields.`, 'INVALID_UI_COMMAND');
  const result = {};
  for (const key of keys.sort()) result[key] = boundedJson(value[key], `${field}.${key}`, state, depth + 1);
  return Object.freeze(result);
}

const COMMAND_HANDLER = Object.freeze({
  [EDIT_CLASS.PITCH_UPDATE]: changeReviewPitch,
  [EDIT_CLASS.DURATION_UPDATE]: changeReviewDuration,
  [EDIT_CLASS.ONSET_TIMELINE_CORRECTION]: changeReviewOnset,
  [EDIT_CLASS.VOICE_REASSIGNMENT]: changeReviewVoice,
  [EDIT_CLASS.STAFF_REASSIGNMENT]: changeReviewStaff,
  [EDIT_CLASS.NOTE_ADD]: addReviewNote,
  [EDIT_CLASS.NOTE_DELETE]: deleteReviewNote,
  [EDIT_CLASS.REST_ADD]: addReviewRest,
  [EDIT_CLASS.REST_DELETE]: deleteReviewRest,
  [EDIT_CLASS.TIE_CORRECTION]: changeReviewTie,
  [EDIT_CLASS.CHORD_GROUPING_CORRECTION]: changeReviewChordGrouping,
});
const COMMAND_SET = new Set(Object.keys(COMMAND_HANDLER));

function requireFunction(value, field) {
  if (typeof value !== 'function') fail(`${field} must be a trusted function.`, 'PORT_DEPENDENCY_MISMATCH');
  return value;
}

function exactChange(value, expectedTarget) {
  if (!isPlainObject(value)) fail('trusted command resolver must return a plain change object.', 'COMMAND_RESOLVER_FAILURE');
  const keys = Object.keys(value).sort();
  const expected = ['after', 'before', 'patch_id', 'target_event'].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail('trusted command resolver must return exactly patch_id, target_event, before and after.', 'COMMAND_RESOLVER_FAILURE');
  }
  if (JSON.stringify(value.target_event) !== JSON.stringify(expectedTarget)) {
    fail('trusted command resolver target does not match the current Stage 06 selection.', 'COMMAND_TARGET_MISMATCH');
  }
  return value;
}

function requireSession(session) {
  if (!isPlainObject(session) || session.documentType !== 'ReviewEditorBackendSession') {
    fail('a valid Stage 06 review editor session is required.', 'SESSION_MISMATCH');
  }
  return session;
}

function createReviewEditorApplicationPort({
  initialSession,
  adapter,
  resolveCommandChange,
  resolvePresentationAddress,
  createSaveMetadata,
  createRevalidationMetadata,
}) {
  let session = requireSession(initialSession);
  if (!isPlainObject(adapter)) fail('trusted editor adapter must be a plain object.', 'PORT_DEPENDENCY_MISMATCH');
  const commandResolver = requireFunction(resolveCommandChange, 'resolveCommandChange');
  const presentationResolver = requireFunction(resolvePresentationAddress, 'resolvePresentationAddress');
  const saveMetadataFactory = requireFunction(createSaveMetadata, 'createSaveMetadata');
  const revalidationMetadataFactory = requireFunction(createRevalidationMetadata, 'createRevalidationMetadata');

  const update = (next) => {
    session = requireSession(next);
    return session;
  };

  async function snapshot() {
    return Object.freeze({
      documentType: REVIEW_EDITOR_APPLICATION_PORT_SNAPSHOT_DOCUMENT_TYPE,
      contractVersion: REVIEW_EDITOR_APPLICATION_PORT_CONTRACT_VERSION,
      sessionId: session.session_id,
      uiModel: createReviewEditorUiModel({ status: 'REVIEW_REQUIRED', session }),
    });
  }

  async function selectIssue(issueId) {
    update(selectReviewEditorIssue(session, issueId));
    return snapshot();
  }

  async function selectTarget(target) {
    update(selectReviewEditorEvent(session, boundedJson(target, 'target')));
    return snapshot();
  }

  async function presentationAddress(input) {
    const request = boundedJson(input, 'presentationAddress');
    const value = await presentationResolver(Object.freeze({ session, ...request }));
    if (value === null || value === undefined) return null;
    return boundedJson(value, 'resolvedPresentationAddress');
  }

  async function command(payload) {
    if (!isPlainObject(payload)) fail('command payload must be a plain object.', 'INVALID_UI_COMMAND');
    const commandName = payload.command;
    if (typeof commandName !== 'string' || !COMMAND_SET.has(commandName)) {
      fail('command is not a supported Stage 05 edit class.', 'INVALID_UI_COMMAND', { command: commandName ?? null });
    }
    if (session.selected_target === null || session.selected_target === undefined) {
      fail('a current Stage 06 target is required before resolving an edit.', 'SELECTION_REQUIRED');
    }
    const requestedValue = boundedJson(payload.value ?? null, 'command.value');
    const resolved = await commandResolver(Object.freeze({
      session,
      command: commandName,
      value: requestedValue,
    }));
    const change = exactChange(resolved, session.selected_target);
    update(COMMAND_HANDLER[commandName](session, change, adapter));
    return snapshot();
  }

  async function undo() {
    update(undoReviewEditor(session, adapter));
    return snapshot();
  }

  async function redo() {
    update(redoReviewEditor(session, adapter));
    return snapshot();
  }

  async function save() {
    const metadata = await saveMetadataFactory(Object.freeze({ session }));
    update(saveReviewEditorRevision(session, metadata));
    return snapshot();
  }

  async function revalidate() {
    const metadata = await revalidationMetadataFactory(Object.freeze({ session }));
    update(revalidateReviewEditorRevision(session, metadata, adapter));
    return snapshot();
  }

  return Object.freeze({
    documentType: REVIEW_EDITOR_APPLICATION_PORT_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_APPLICATION_PORT_CONTRACT_VERSION,
    snapshot,
    selectIssue,
    selectTarget,
    resolvePresentationAddress: presentationAddress,
    command,
    undo,
    redo,
    save,
    revalidate,
    getCurrentSession: () => session,
  });
}

module.exports = {
  REVIEW_EDITOR_APPLICATION_PORT_CONTRACT_VERSION,
  REVIEW_EDITOR_APPLICATION_PORT_DOCUMENT_TYPE,
  REVIEW_EDITOR_APPLICATION_PORT_SNAPSHOT_DOCUMENT_TYPE,
  ReviewEditorApplicationPortError,
  createReviewEditorApplicationPort,
};
