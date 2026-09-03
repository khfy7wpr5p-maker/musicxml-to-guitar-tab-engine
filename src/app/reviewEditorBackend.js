'use strict';

const { types: { isProxy } } = require('node:util');
const {
  EDIT_CLASS,
  REVISION_STATE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
  TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
  VALIDATION_STATE,
  createRevalidatedRevision,
  createTeacherCorrectedRevision,
  normalizePatch,
} = require('./teacherCorrectionRevision');
const {
  OMR_REVIEW_EVIDENCE_CONTRACT_VERSION,
  OMR_REVIEW_STATE_DOCUMENT_TYPE,
} = require('./omrReviewEvidence');

const REVIEW_EDITOR_BACKEND_CONTRACT_VERSION = '1.0.0';
const REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE = 'ReviewEditorBackendSession';

const SESSION_PHASE = Object.freeze({
  EDITING: 'EDITING',
  SAVED: 'SAVED',
  REVALIDATED: 'REVALIDATED',
});

const CAPABILITY_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  BOUNDED: 'BOUNDED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const CAPABILITY_STATUS_SET = new Set(Object.values(CAPABILITY_STATUS));
const EDIT_CLASSES = Object.freeze(Object.values(EDIT_CLASS));
const EDIT_CLASS_SET = new Set(EDIT_CLASSES);
const MAX_SESSION_PATCHES = 256;
const MAX_OPERATION_LOG = 768;
const MAX_TEXT_LENGTH = 4096;
const MAX_ID_LENGTH = 160;
const MAX_DATA_DEPTH = 10;
const MAX_DATA_NODES = 4096;
const MAX_ARRAY_ITEMS = 512;
const MAX_OBJECT_KEYS = 256;

class ReviewEditorBackendError extends Error {
  constructor(message, code = 'INVALID_REVIEW_EDITOR_REQUEST', details = {}) {
    super(message);
    this.name = 'ReviewEditorBackendError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

function fail(message, code, details = {}) {
  throw new ReviewEditorBackendError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataDescriptors(value, field, code = 'INVALID_REVIEW_EDITOR_REQUEST') {
  if (!isPlainObject(value)) fail(`${field} must be a non-proxy plain object.`, code, { field });
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail(`${field} must not contain symbol keys.`, code, { field });
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(`${field}.${key} must be an enumerable data property.`, code, { field: `${field}.${key}` });
    }
  }
  return descriptors;
}

function exactFields(value, fields, field, code = 'INVALID_REVIEW_EDITOR_REQUEST') {
  const descriptors = dataDescriptors(value, field, code);
  const observed = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) {
    fail(`${field} must contain exactly the required fields.`, code, { field, observed, expected });
  }
  return descriptors;
}

function normalizeId(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ID_LENGTH
    || value !== value.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)
  ) {
    fail(`${field} must be a bounded stable identifier.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
  }
  return value;
}

function normalizeJsonValue(value, field, state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) fail(`${field} exceeds the data node limit.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
  if (depth > MAX_DATA_DEPTH) fail(`${field} exceeds the data depth limit.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });

  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_LENGTH) fail(`${field} contains an oversized string.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${field} numbers must be finite.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
    return value;
  }
  if (typeof value !== 'object' || isProxy(value)) {
    fail(`${field} must contain only bounded JSON-like data.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ARRAY_ITEMS) {
      fail(`${field} must be a bounded ordinary array.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const normalized = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(`${field}[${index}] must be an enumerable data property.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field: `${field}[${index}]` });
      }
      normalized.push(normalizeJsonValue(descriptor.value, `${field}[${index}]`, state, depth + 1));
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length' || (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length)) continue;
      fail(`${field} arrays must not contain custom properties.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
    }
    return Object.freeze(normalized);
  }

  const descriptors = dataDescriptors(value, field);
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_OBJECT_KEYS) fail(`${field} exceeds the object key limit.`, 'INVALID_REVIEW_EDITOR_REQUEST', { field });
  const normalized = {};
  for (const key of keys.sort()) {
    normalized[key] = normalizeJsonValue(descriptors[key].value, `${field}.${key}`, state, depth + 1);
  }
  return Object.freeze(normalized);
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

function normalizeTarget(value, field = 'target') {
  if (typeof value === 'string') return normalizeId(value, field);
  const target = normalizeJsonValue(value, field);
  if (!isPlainObject(target) || Object.keys(target).length === 0) {
    fail(`${field} must be a stable event id or a non-empty location object.`, 'INVALID_TARGET', { field });
  }
  return target;
}

function stableKey(value) {
  return JSON.stringify(value);
}

function normalizeCapabilityManifest(input) {
  const descriptors = exactFields(
    input,
    ['contractVersion', 'adapterId', 'capabilities', 'history', 'revalidate'],
    'adapter manifest',
  );
  if (descriptors.contractVersion.value !== REVIEW_EDITOR_BACKEND_CONTRACT_VERSION) {
    fail('adapter manifest contractVersion is unsupported.', 'INVALID_ADAPTER_MANIFEST');
  }
  const adapterId = normalizeId(descriptors.adapterId.value, 'adapterId');
  const capabilityDescriptors = exactFields(
    descriptors.capabilities.value,
    EDIT_CLASSES,
    'adapter manifest capabilities',
    'INVALID_ADAPTER_MANIFEST',
  );
  const capabilities = {};
  for (const editClass of EDIT_CLASSES) {
    const status = capabilityDescriptors[editClass].value;
    if (!CAPABILITY_STATUS_SET.has(status)) {
      fail('adapter capability status is unsupported.', 'INVALID_ADAPTER_MANIFEST', { editClass, status });
    }
    capabilities[editClass] = status;
  }
  const historyDescriptors = exactFields(
    descriptors.history.value,
    ['undo', 'redo'],
    'adapter manifest history',
    'INVALID_ADAPTER_MANIFEST',
  );
  if (typeof historyDescriptors.undo.value !== 'boolean' || typeof historyDescriptors.redo.value !== 'boolean') {
    fail('adapter history capabilities must be boolean.', 'INVALID_ADAPTER_MANIFEST');
  }
  if (typeof descriptors.revalidate.value !== 'boolean') {
    fail('adapter revalidate capability must be boolean.', 'INVALID_ADAPTER_MANIFEST');
  }

  return deepFreeze({
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    adapterId,
    capabilities,
    history: {
      undo: historyDescriptors.undo.value,
      redo: historyDescriptors.redo.value,
    },
    revalidate: descriptors.revalidate.value,
  });
}

function issueId(issue, index) {
  const id = issue?.reviewEvidence?.issue_id;
  if (typeof id !== 'string' || id.length === 0) {
    fail('review issue is missing its Stage 04 issue_id.', 'INVALID_REVIEW_STATE', { index });
  }
  return normalizeId(id, `issues[${index}].reviewEvidence.issue_id`);
}

function normalizeReviewState(reviewState) {
  if (
    !reviewState
    || reviewState.documentType !== OMR_REVIEW_STATE_DOCUMENT_TYPE
    || reviewState.contractVersion !== OMR_REVIEW_EVIDENCE_CONTRACT_VERSION
    || reviewState.status !== 'REVIEW_REQUIRED'
    || reviewState.canOpenForReview !== true
    || !Array.isArray(reviewState.issues)
  ) {
    fail('Stage 06 requires a Stage 04 REVIEW_REQUIRED score that is safe to open.', 'NOT_REVIEWABLE');
  }
  const issues = normalizeJsonValue(reviewState.issues, 'reviewState.issues');
  const ids = new Set();
  for (let index = 0; index < issues.length; index += 1) {
    const id = issueId(issues[index], index);
    if (ids.has(id)) fail('Stage 04 issue_id values must be unique for editor selection.', 'DUPLICATE_ISSUE_ID', { issueId: id });
    ids.add(id);
  }
  return Object.freeze({ issues, issueIds: Object.freeze([...ids]) });
}

function assertReviewRevision(reviewRevision) {
  if (
    !reviewRevision
    || reviewRevision.documentType !== TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    || reviewRevision.contractVersion !== TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    || reviewRevision.state !== REVISION_STATE.REVIEW_REVISION
    || reviewRevision.validation_state !== VALIDATION_STATE.REVIEW_REQUIRED
    || reviewRevision.review_evidence?.status !== 'REVIEW_REQUIRED'
    || reviewRevision.review_evidence?.canOpenForReview !== true
  ) {
    fail('Stage 06 requires a valid Stage 05 REVIEW_REVISION.', 'INVALID_REVIEW_REVISION');
  }
}

function createReviewEditorSession({
  sessionId,
  reviewState,
  reviewRevision,
  adapterManifest,
  adapterState,
}) {
  const normalizedReview = normalizeReviewState(reviewState);
  assertReviewRevision(reviewRevision);
  const manifest = normalizeCapabilityManifest(adapterManifest);
  const normalizedAdapterState = normalizeJsonValue(adapterState, 'adapterState');

  return deepFreeze({
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    session_id: normalizeId(sessionId, 'sessionId'),
    phase: SESSION_PHASE.EDITING,
    review_revision: reviewRevision,
    issues: normalizedReview.issues,
    selected_issue_id: null,
    selected_target: null,
    adapter_manifest: manifest,
    adapter_state: normalizedAdapterState,
    pending_patches: [],
    redo_patches: [],
    operation_log: [],
    saved_revision: null,
    revalidated_revision: null,
  });
}

function assertSession(session) {
  if (
    !session
    || session.documentType !== REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE
    || session.contractVersion !== REVIEW_EDITOR_BACKEND_CONTRACT_VERSION
    || !Object.values(SESSION_PHASE).includes(session.phase)
    || !Array.isArray(session.issues)
    || !session.adapter_manifest
  ) {
    fail('review editor session is invalid.', 'INVALID_SESSION');
  }
}

function assertEditing(session) {
  assertSession(session);
  if (session.phase !== SESSION_PHASE.EDITING) {
    fail('editor mutations are allowed only while the session is EDITING.', 'INVALID_PHASE', { phase: session.phase });
  }
}

function cloneSession(session, changes) {
  return deepFreeze({ ...session, ...changes });
}

function listReviewEditorIssues(session) {
  assertSession(session);
  return session.issues;
}

function targetFromIssue(issue) {
  const evidence = issue.reviewEvidence;
  if (evidence.event_id_or_location !== null) return normalizeTarget(evidence.event_id_or_location, 'issue target');
  if (evidence.measure !== null) {
    return normalizeTarget({
      measure: evidence.measure,
      staff: evidence.staff,
      voice: evidence.voice,
    }, 'issue target');
  }
  return null;
}

function selectReviewEditorIssue(session, selectedIssueId) {
  assertEditing(session);
  const id = normalizeId(selectedIssueId, 'issueId');
  const issue = session.issues.find((entry) => entry.reviewEvidence.issue_id === id);
  if (!issue) fail('review issue was not found in the current session.', 'ISSUE_NOT_FOUND', { issueId: id });
  return cloneSession(session, {
    selected_issue_id: id,
    selected_target: targetFromIssue(issue),
  });
}

function selectReviewEditorEvent(session, target) {
  assertEditing(session);
  return cloneSession(session, { selected_target: normalizeTarget(target, 'target') });
}

function getReviewEditorCapabilities(session) {
  assertSession(session);
  return session.adapter_manifest;
}

function assertAdapter(session, adapter, requiredHandler) {
  if (!isPlainObject(adapter)) fail('trusted editor adapter must be a plain object.', 'ADAPTER_MISMATCH');
  const manifest = normalizeCapabilityManifest(adapter.manifest);
  if (stableKey(manifest) !== stableKey(session.adapter_manifest)) {
    fail('trusted editor adapter manifest does not match the loaded session.', 'ADAPTER_MISMATCH');
  }
  if (typeof adapter[requiredHandler] !== 'function') {
    fail(`trusted editor adapter is missing ${requiredHandler}().`, 'ADAPTER_MISMATCH', { handler: requiredHandler });
  }
}

function selectedIssue(session) {
  if (session.selected_issue_id === null) return null;
  return session.issues.find((issue) => issue.reviewEvidence.issue_id === session.selected_issue_id) || null;
}

function normalizeAdapterMutationResult(result, operation) {
  const descriptors = exactFields(
    result,
    ['adapterState', 'evidence'],
    `${operation} adapter result`,
    'ADAPTER_FAILURE',
  );
  return Object.freeze({
    adapterState: normalizeJsonValue(descriptors.adapterState.value, `${operation}.adapterState`),
    evidence: normalizeJsonValue(descriptors.evidence.value, `${operation}.evidence`),
  });
}

function callAdapter(handler, payload, operation) {
  try {
    return normalizeAdapterMutationResult(handler(payload), operation);
  } catch (error) {
    if (error instanceof ReviewEditorBackendError) throw error;
    fail('trusted editor adapter rejected the operation.', 'ADAPTER_FAILURE', {
      operation,
      cause: error instanceof Error ? error.message : String(error),
      causeCode: typeof error?.code === 'string' ? error.code : null,
    });
  }
}

function appendLog(session, entry) {
  const next = [...session.operation_log, normalizeJsonValue(entry, 'operation log entry')];
  if (next.length > MAX_OPERATION_LOG) next.splice(0, next.length - MAX_OPERATION_LOG);
  return Object.freeze(next);
}

function applyReviewCorrectionPatch(session, rawPatch, adapter) {
  assertEditing(session);
  if (session.selected_target === null) {
    fail('a current issue/event target must be selected before applying a correction.', 'SELECTION_REQUIRED');
  }
  if (session.pending_patches.length >= MAX_SESSION_PATCHES) {
    fail('review editor patch limit reached.', 'SESSION_PATCH_LIMIT', { max: MAX_SESSION_PATCHES });
  }

  let patch;
  try {
    patch = normalizePatch(rawPatch);
  } catch (error) {
    fail('correction patch violates the Stage 05 patch contract.', 'INVALID_CORRECTION_PATCH', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!EDIT_CLASS_SET.has(patch.edit_class)) {
    fail('correction edit class is unsupported.', 'INVALID_CORRECTION_PATCH', { editClass: patch.edit_class });
  }
  if (stableKey(patch.target_event) !== stableKey(session.selected_target)) {
    fail('correction patch target does not match the current editor selection.', 'TARGET_MISMATCH', {
      patchTarget: patch.target_event,
      selectedTarget: session.selected_target,
    });
  }
  if (
    session.pending_patches.some((entry) => entry.patch_id === patch.patch_id)
    || session.redo_patches.some((entry) => entry.patch_id === patch.patch_id)
  ) {
    fail('patch_id already exists in this editor session.', 'DUPLICATE_PATCH_ID', { patchId: patch.patch_id });
  }

  const capability = session.adapter_manifest.capabilities[patch.edit_class];
  if (capability === CAPABILITY_STATUS.UNAVAILABLE) {
    fail('the selected trusted editor adapter does not expose this correction capability.', 'CAPABILITY_UNAVAILABLE', {
      editClass: patch.edit_class,
      adapterId: session.adapter_manifest.adapterId,
    });
  }
  assertAdapter(session, adapter, 'applyPatch');
  const result = callAdapter(
    adapter.applyPatch,
    Object.freeze({
      contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
      sessionId: session.session_id,
      adapterState: session.adapter_state,
      patch,
      capability,
      selectedIssue: selectedIssue(session),
      selectedTarget: session.selected_target,
    }),
    'applyPatch',
  );

  return cloneSession(session, {
    adapter_state: result.adapterState,
    pending_patches: Object.freeze([...session.pending_patches, patch]),
    redo_patches: Object.freeze([]),
    operation_log: appendLog(session, {
      operation: 'APPLY_PATCH',
      patch_id: patch.patch_id,
      edit_class: patch.edit_class,
      capability,
      evidence: result.evidence,
    }),
  });
}

function applyClassPatch(session, editClass, change, adapter) {
  const descriptors = exactFields(
    change,
    ['patch_id', 'target_event', 'before', 'after'],
    'editor change',
  );
  return applyReviewCorrectionPatch(session, {
    patch_id: descriptors.patch_id.value,
    edit_class: editClass,
    target_event: descriptors.target_event.value,
    before: descriptors.before.value,
    after: descriptors.after.value,
  }, adapter);
}

const changeReviewPitch = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.PITCH_UPDATE, change, adapter);
const changeReviewDuration = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.DURATION_UPDATE, change, adapter);
const changeReviewOnset = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.ONSET_TIMELINE_CORRECTION, change, adapter);
const changeReviewVoice = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.VOICE_REASSIGNMENT, change, adapter);
const changeReviewStaff = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.STAFF_REASSIGNMENT, change, adapter);
const addReviewNote = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.NOTE_ADD, change, adapter);
const deleteReviewNote = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.NOTE_DELETE, change, adapter);
const addReviewRest = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.REST_ADD, change, adapter);
const deleteReviewRest = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.REST_DELETE, change, adapter);
const changeReviewTie = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.TIE_CORRECTION, change, adapter);
const changeReviewChordGrouping = (session, change, adapter) => applyClassPatch(session, EDIT_CLASS.CHORD_GROUPING_CORRECTION, change, adapter);

function undoReviewEditor(session, adapter) {
  assertEditing(session);
  if (session.pending_patches.length === 0) fail('there is no applied correction to undo.', 'HISTORY_BOUNDARY');
  if (!session.adapter_manifest.history.undo) fail('trusted editor adapter does not expose undo.', 'HISTORY_UNAVAILABLE');
  assertAdapter(session, adapter, 'undo');
  const patch = session.pending_patches[session.pending_patches.length - 1];
  const result = callAdapter(
    adapter.undo,
    Object.freeze({
      contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
      sessionId: session.session_id,
      adapterState: session.adapter_state,
      expectedPatch: patch,
      expectedInversePatch: patch.inverse_patch,
    }),
    'undo',
  );
  return cloneSession(session, {
    adapter_state: result.adapterState,
    pending_patches: Object.freeze(session.pending_patches.slice(0, -1)),
    redo_patches: Object.freeze([...session.redo_patches, patch]),
    operation_log: appendLog(session, {
      operation: 'UNDO',
      patch_id: patch.patch_id,
      evidence: result.evidence,
    }),
  });
}

function redoReviewEditor(session, adapter) {
  assertEditing(session);
  if (session.redo_patches.length === 0) fail('there is no correction to redo.', 'HISTORY_BOUNDARY');
  if (!session.adapter_manifest.history.redo) fail('trusted editor adapter does not expose redo.', 'HISTORY_UNAVAILABLE');
  assertAdapter(session, adapter, 'redo');
  const patch = session.redo_patches[session.redo_patches.length - 1];
  const result = callAdapter(
    adapter.redo,
    Object.freeze({
      contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
      sessionId: session.session_id,
      adapterState: session.adapter_state,
      expectedPatch: patch,
    }),
    'redo',
  );
  return cloneSession(session, {
    adapter_state: result.adapterState,
    pending_patches: Object.freeze([...session.pending_patches, patch]),
    redo_patches: Object.freeze(session.redo_patches.slice(0, -1)),
    operation_log: appendLog(session, {
      operation: 'REDO',
      patch_id: patch.patch_id,
      evidence: result.evidence,
    }),
  });
}

function normalizeTransitionMetadata(metadata, label) {
  const descriptors = exactFields(
    metadata,
    ['revision_id', 'actor', 'timestamp', 'reason', 'provenance'],
    label,
  );
  return {
    revision_id: descriptors.revision_id.value,
    actor: descriptors.actor.value,
    timestamp: descriptors.timestamp.value,
    reason: descriptors.reason.value,
    provenance: descriptors.provenance.value,
  };
}

function saveReviewEditorRevision(session, metadata) {
  assertEditing(session);
  if (session.pending_patches.length === 0) fail('at least one applied correction is required before save.', 'NOTHING_TO_SAVE');
  const transition = normalizeTransitionMetadata(metadata, 'save metadata');
  let savedRevision;
  try {
    savedRevision = createTeacherCorrectedRevision(session.review_revision, {
      ...transition,
      patches: session.pending_patches,
    });
  } catch (error) {
    fail('Stage 05 rejected the teacher-corrected revision.', 'SAVE_REVISION_FAILED', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return cloneSession(session, {
    phase: SESSION_PHASE.SAVED,
    saved_revision: savedRevision,
    operation_log: appendLog(session, {
      operation: 'SAVE_REVISION',
      revision_id: savedRevision.revision_id,
      patch_ids: savedRevision.patches.map((patch) => patch.patch_id),
    }),
  });
}

function normalizeAdapterRevalidationResult(result) {
  const descriptors = exactFields(
    result,
    ['adapterState', 'validationState', 'validationEvidence'],
    'revalidate adapter result',
    'ADAPTER_FAILURE',
  );
  const validationState = descriptors.validationState.value;
  if (![VALIDATION_STATE.VALID, VALIDATION_STATE.INVALID].includes(validationState)) {
    fail('trusted editor adapter revalidation returned an invalid state.', 'ADAPTER_FAILURE', { validationState });
  }
  const validationEvidence = normalizeJsonValue(descriptors.validationEvidence.value, 'revalidate.validationEvidence');
  if (validationEvidence === null) fail('trusted editor adapter revalidation must return evidence.', 'ADAPTER_FAILURE');
  return Object.freeze({
    adapterState: normalizeJsonValue(descriptors.adapterState.value, 'revalidate.adapterState'),
    validationState,
    validationEvidence,
  });
}

function revalidateReviewEditorRevision(session, metadata, adapter) {
  assertSession(session);
  if (session.phase !== SESSION_PHASE.SAVED || !session.saved_revision) {
    fail('revalidation requires a saved teacher-corrected revision.', 'INVALID_PHASE', { phase: session.phase });
  }
  if (!session.adapter_manifest.revalidate) {
    fail('trusted editor adapter does not expose revalidation.', 'REVALIDATION_UNAVAILABLE');
  }
  assertAdapter(session, adapter, 'revalidate');
  let result;
  try {
    result = normalizeAdapterRevalidationResult(adapter.revalidate(Object.freeze({
      contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
      sessionId: session.session_id,
      adapterState: session.adapter_state,
      savedRevision: session.saved_revision,
    })));
  } catch (error) {
    if (error instanceof ReviewEditorBackendError) throw error;
    fail('trusted editor adapter rejected revalidation.', 'ADAPTER_FAILURE', {
      operation: 'revalidate',
      cause: error instanceof Error ? error.message : String(error),
      causeCode: typeof error?.code === 'string' ? error.code : null,
    });
  }

  const transition = normalizeTransitionMetadata(metadata, 'revalidation metadata');
  let revalidatedRevision;
  try {
    revalidatedRevision = createRevalidatedRevision(session.saved_revision, {
      ...transition,
      validation_state: result.validationState,
      validation_evidence: result.validationEvidence,
    });
  } catch (error) {
    fail('Stage 05 rejected the revalidated revision.', 'REVALIDATION_RECORD_FAILED', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  return cloneSession(session, {
    phase: SESSION_PHASE.REVALIDATED,
    adapter_state: result.adapterState,
    revalidated_revision: revalidatedRevision,
    operation_log: appendLog(session, {
      operation: 'REVALIDATE',
      revision_id: revalidatedRevision.revision_id,
      validation_state: revalidatedRevision.validation_state,
      evidence: result.validationEvidence,
    }),
  });
}

module.exports = {
  CAPABILITY_STATUS,
  MAX_SESSION_PATCHES,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  ReviewEditorBackendError,
  SESSION_PHASE,
  addReviewNote,
  addReviewRest,
  applyReviewCorrectionPatch,
  changeReviewChordGrouping,
  changeReviewDuration,
  changeReviewOnset,
  changeReviewPitch,
  changeReviewStaff,
  changeReviewTie,
  changeReviewVoice,
  createReviewEditorSession,
  deleteReviewNote,
  deleteReviewRest,
  getReviewEditorCapabilities,
  listReviewEditorIssues,
  normalizeCapabilityManifest,
  redoReviewEditor,
  revalidateReviewEditorRevision,
  saveReviewEditorRevision,
  selectReviewEditorEvent,
  selectReviewEditorIssue,
  undoReviewEditor,
};
