'use strict';

const crypto = require('node:crypto');
const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
} = require('./reviewEditorBackend');
const {
  EDIT_CLASS,
  VALIDATION_STATE,
} = require('./teacherCorrectionRevision');

const EDITOR_CORE_SOURCE_REVISION = '9429116bd5c92d4db4c4edbb21b307c6c74c2391';
const SESLITAB_EDITOR_HOST_VERSION = '1.0.0';
const EDITOR_SCORE_INTENT_VERSION = '1.0.0';
const TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_VERSION = '1.0.0';
const TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_ID = `st-score-editor-core:${EDITOR_CORE_SOURCE_REVISION}:seslitab-editor-host/${SESLITAB_EDITOR_HOST_VERSION}`;

class TrustedEditorCoreReviewAdapterError extends Error {
  constructor(message, code = 'TRUSTED_EDITOR_CORE_ADAPTER_ERROR', details = {}) {
    super(message);
    this.name = 'TrustedEditorCoreReviewAdapterError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

function fail(message, code, details = {}) {
  throw new TrustedEditorCoreReviewAdapterError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, field) {
  if (!isPlainObject(value)) fail(`${field} must be a plain object.`, 'BRIDGE_CONTRACT_MISMATCH');
  const observed = Object.keys(value).sort();
  const required = [...expected].sort();
  if (observed.length !== required.length || observed.some((key, index) => key !== required[index])) {
    fail(`${field} must contain exactly the required fields.`, 'BRIDGE_CONTRACT_MISMATCH', { observed, required });
  }
}

const EDIT_CLASSES = Object.freeze(Object.values(EDIT_CLASS));
const capabilities = Object.freeze(Object.fromEntries(EDIT_CLASSES.map((editClass) => [
  editClass,
  editClass === EDIT_CLASS.PITCH_UPDATE
    ? CAPABILITY_STATUS.AVAILABLE
    : editClass === EDIT_CLASS.DURATION_UPDATE
      ? CAPABILITY_STATUS.BOUNDED
      : CAPABILITY_STATUS.UNAVAILABLE,
])));

const TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST = Object.freeze({
  contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  adapterId: TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_ID,
  capabilities,
  history: Object.freeze({ undo: true, redo: true }),
  revalidate: true,
});

function assertBridge(bridge) {
  if (!isPlainObject(bridge)) fail('Editor Core bridge must be a plain object.', 'BRIDGE_CONTRACT_MISMATCH');
  if (bridge.sourceRevision !== EDITOR_CORE_SOURCE_REVISION) {
    fail('Editor Core source revision mismatch.', 'EDITOR_CORE_PIN_MISMATCH', {
      expected: EDITOR_CORE_SOURCE_REVISION,
      observed: bridge.sourceRevision ?? null,
    });
  }
  if (bridge.hostVersion !== SESLITAB_EDITOR_HOST_VERSION) {
    fail('SesliTab Editor Host version mismatch.', 'EDITOR_CORE_PIN_MISMATCH', {
      expected: SESLITAB_EDITOR_HOST_VERSION,
      observed: bridge.hostVersion ?? null,
    });
  }
  if (
    bridge.profile?.productionAuthority !== false
    || bridge.profile?.networkAuthority !== false
    || bridge.profile?.persistenceAuthority !== false
    || bridge.profile?.serverRevisionAuthority !== false
  ) {
    fail('Editor Core bridge must preserve the reviewed non-production authority profile.', 'EDITOR_CORE_AUTHORITY_MISMATCH');
  }
  for (const method of ['snapshot', 'matchesSelection', 'commitScoreIntent', 'navigateHistory', 'validateCanonicalSession']) {
    if (typeof bridge[method] !== 'function') {
      fail(`Editor Core bridge must expose ${method}().`, 'BRIDGE_CONTRACT_MISMATCH', { method });
    }
  }
}

function stableId(prefix, seed) {
  const digest = crypto.createHash('sha256').update(seed).digest('hex');
  return `${prefix}-${digest.slice(0, 32)}`;
}

function normalizeSnapshot(raw, field = 'bridge snapshot') {
  exactKeys(raw, ['documentId', 'revisionId', 'historyPastLength', 'historyFutureLength'], field);
  if (typeof raw.documentId !== 'string' || raw.documentId.length === 0 || raw.documentId.length > 160) {
    fail(`${field}.documentId is invalid.`, 'BRIDGE_STATE_INVALID');
  }
  if (typeof raw.revisionId !== 'string' || raw.revisionId.length === 0 || raw.revisionId.length > 160) {
    fail(`${field}.revisionId is invalid.`, 'BRIDGE_STATE_INVALID');
  }
  if (!Number.isSafeInteger(raw.historyPastLength) || raw.historyPastLength < 0) {
    fail(`${field}.historyPastLength is invalid.`, 'BRIDGE_STATE_INVALID');
  }
  if (!Number.isSafeInteger(raw.historyFutureLength) || raw.historyFutureLength < 0) {
    fail(`${field}.historyFutureLength is invalid.`, 'BRIDGE_STATE_INVALID');
  }
  return Object.freeze({
    sourceRevision: EDITOR_CORE_SOURCE_REVISION,
    hostVersion: SESLITAB_EDITOR_HOST_VERSION,
    documentId: raw.documentId,
    revisionId: raw.revisionId,
    historyPastLength: raw.historyPastLength,
    historyFutureLength: raw.historyFutureLength,
  });
}

function assertAdapterStateMatchesBridge(adapterState, bridgeState) {
  if (!isPlainObject(adapterState)) fail('adapterState must be a plain object.', 'ADAPTER_STATE_MISMATCH');
  for (const field of ['sourceRevision', 'hostVersion', 'documentId', 'revisionId', 'historyPastLength', 'historyFutureLength']) {
    if (adapterState[field] !== bridgeState[field]) {
      fail('Stage 06 adapter state is stale relative to Editor Core.', 'ADAPTER_STATE_MISMATCH', {
        field,
        expected: adapterState[field] ?? null,
        observed: bridgeState[field] ?? null,
      });
    }
  }
}

function validatePitch(value) {
  exactKeys(value, ['step', 'alter', 'octave'], 'pitch');
  if (!['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(value.step)) fail('pitch.step is invalid.', 'PATCH_VALUE_INVALID');
  if (!Number.isInteger(value.alter) || value.alter < -2 || value.alter > 2) fail('pitch.alter is invalid.', 'PATCH_VALUE_INVALID');
  if (!Number.isInteger(value.octave) || value.octave < -1 || value.octave > 9) fail('pitch.octave is invalid.', 'PATCH_VALUE_INVALID');
  return Object.freeze({ step: value.step, alter: value.alter, octave: value.octave });
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

function validateDuration(value) {
  exactKeys(value, ['numerator', 'denominator'], 'duration');
  if (!Number.isSafeInteger(value.numerator) || value.numerator <= 0) fail('duration.numerator is invalid.', 'PATCH_VALUE_INVALID');
  if (!Number.isSafeInteger(value.denominator) || value.denominator <= 0) fail('duration.denominator is invalid.', 'PATCH_VALUE_INVALID');
  if (gcd(value.numerator, value.denominator) !== 1) fail('duration must be reduced.', 'PATCH_VALUE_INVALID');
  return Object.freeze({ numerator: value.numerator, denominator: value.denominator });
}

function intentForPatch(patch) {
  if (patch.edit_class === EDIT_CLASS.PITCH_UPDATE) {
    return Object.freeze({
      version: EDITOR_SCORE_INTENT_VERSION,
      type: 'SET_PITCH',
      pitch: validatePitch(patch.after),
    });
  }
  if (patch.edit_class === EDIT_CLASS.DURATION_UPDATE) {
    return Object.freeze({
      version: EDITOR_SCORE_INTENT_VERSION,
      type: 'SET_DURATION',
      duration: validateDuration(patch.after),
    });
  }
  fail('This exact Editor Core adapter does not expose the requested edit class.', 'CAPABILITY_NOT_IMPLEMENTED', {
    editClass: patch.edit_class,
  });
}

function normalizeBridgeOperationResult(raw, operation) {
  exactKeys(raw, ['ok', 'evidence'], `${operation} result`);
  if (raw.ok !== true) fail(`Editor Core rejected ${operation}.`, 'EDITOR_CORE_OPERATION_REJECTED');
  if (!isPlainObject(raw.evidence)) fail(`${operation} evidence must be a plain object.`, 'BRIDGE_CONTRACT_MISMATCH');
  return raw.evidence;
}

function createTrustedEditorCoreReviewAdapterState(bridge) {
  assertBridge(bridge);
  return normalizeSnapshot(bridge.snapshot());
}

function createTrustedEditorCoreReviewAdapter({ bridge }) {
  assertBridge(bridge);

  function currentState(adapterState) {
    const state = normalizeSnapshot(bridge.snapshot());
    assertAdapterStateMatchesBridge(adapterState, state);
    return state;
  }

  function applyPatch(payload) {
    if (!isPlainObject(payload) || !isPlainObject(payload.patch)) fail('Stage 06 applyPatch payload is invalid.', 'ADAPTER_PAYLOAD_INVALID');
    const before = currentState(payload.adapterState);
    if (![EDIT_CLASS.PITCH_UPDATE, EDIT_CLASS.DURATION_UPDATE].includes(payload.patch.edit_class)) {
      fail('Edit class is unavailable on the exact pinned Editor Core adapter.', 'CAPABILITY_NOT_IMPLEMENTED', { editClass: payload.patch.edit_class });
    }
    if (bridge.matchesSelection(payload.selectedTarget) !== true) {
      fail('Editor Core canonical selection does not match the Stage 06 selected target.', 'SELECTION_MISMATCH');
    }
    const intent = intentForPatch(payload.patch);
    const seed = `${payload.sessionId}:${payload.patch.patch_id}:${before.documentId}:${before.revisionId}`;
    const identity = Object.freeze({
      transactionId: stableId('rr-tx', seed),
      commandId: stableId('rr-cmd', seed),
      nextRevisionId: stableId('rr-rev', seed),
    });
    const evidence = normalizeBridgeOperationResult(
      bridge.commitScoreIntent(Object.freeze({ intent, identity, selectedTarget: payload.selectedTarget })),
      'commitScoreIntent',
    );
    const after = normalizeSnapshot(bridge.snapshot(), 'post-commit bridge snapshot');
    if (
      after.documentId !== before.documentId
      || after.revisionId !== identity.nextRevisionId
      || after.historyPastLength !== before.historyPastLength + 1
      || after.historyFutureLength !== 0
    ) {
      fail('Editor Core commit did not produce the expected single-session revision transition.', 'EDITOR_CORE_TRANSITION_MISMATCH');
    }
    return Object.freeze({
      adapterState: after,
      evidence: Object.freeze({
        kind: 'ST_SCORE_EDITOR_CORE_SCORE_INTENT',
        sourceRevision: EDITOR_CORE_SOURCE_REVISION,
        hostVersion: SESLITAB_EDITOR_HOST_VERSION,
        editClass: payload.patch.edit_class,
        intentType: intent.type,
        revisionId: after.revisionId,
        bridge: evidence,
      }),
    });
  }

  function navigate(payload, action) {
    if (!isPlainObject(payload)) fail('Stage 06 history payload is invalid.', 'ADAPTER_PAYLOAD_INVALID');
    const before = currentState(payload.adapterState);
    const evidence = normalizeBridgeOperationResult(
      bridge.navigateHistory(action),
      `navigateHistory:${action}`,
    );
    const after = normalizeSnapshot(bridge.snapshot(), `post-${action.toLowerCase()} bridge snapshot`);
    const undo = action === 'UNDO';
    if (
      after.documentId !== before.documentId
      || after.historyPastLength !== before.historyPastLength + (undo ? -1 : 1)
      || after.historyFutureLength !== before.historyFutureLength + (undo ? 1 : -1)
    ) {
      fail('Editor Core history transition does not match the expected unified history movement.', 'EDITOR_CORE_TRANSITION_MISMATCH');
    }
    return Object.freeze({
      adapterState: after,
      evidence: Object.freeze({
        kind: `ST_SCORE_EDITOR_CORE_${action}`,
        sourceRevision: EDITOR_CORE_SOURCE_REVISION,
        hostVersion: SESLITAB_EDITOR_HOST_VERSION,
        revisionId: after.revisionId,
        bridge: evidence,
      }),
    });
  }

  function revalidate(payload) {
    if (!isPlainObject(payload) || !isPlainObject(payload.savedRevision)) {
      fail('Stage 06 revalidation payload is invalid.', 'ADAPTER_PAYLOAD_INVALID');
    }
    const state = currentState(payload.adapterState);
    const raw = bridge.validateCanonicalSession(Object.freeze({
      savedRevision: payload.savedRevision,
      documentId: state.documentId,
      revisionId: state.revisionId,
    }));
    exactKeys(raw, ['validationState', 'evidence'], 'validateCanonicalSession result');
    if (![VALIDATION_STATE.VALID, VALIDATION_STATE.INVALID].includes(raw.validationState)) {
      fail('Editor Core canonical validation returned an unsupported state.', 'BRIDGE_CONTRACT_MISMATCH');
    }
    if (!isPlainObject(raw.evidence)) fail('Editor Core canonical validation requires evidence.', 'BRIDGE_CONTRACT_MISMATCH');
    const after = normalizeSnapshot(bridge.snapshot(), 'post-revalidation bridge snapshot');
    if (
      after.documentId !== state.documentId
      || after.revisionId !== state.revisionId
      || after.historyPastLength !== state.historyPastLength
      || after.historyFutureLength !== state.historyFutureLength
    ) {
      fail('Editor Core canonical validation must be non-mutating.', 'EDITOR_CORE_TRANSITION_MISMATCH');
    }
    return Object.freeze({
      adapterState: after,
      validationState: raw.validationState,
      validationEvidence: Object.freeze({
        kind: 'ST_SCORE_EDITOR_CORE_CANONICAL_SESSION_VALIDATION',
        sourceRevision: EDITOR_CORE_SOURCE_REVISION,
        hostVersion: SESLITAB_EDITOR_HOST_VERSION,
        documentId: after.documentId,
        revisionId: after.revisionId,
        editorEvidence: raw.evidence,
      }),
    });
  }

  return Object.freeze({
    manifest: TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST,
    applyPatch,
    undo: (payload) => navigate(payload, 'UNDO'),
    redo: (payload) => navigate(payload, 'REDO'),
    revalidate,
  });
}

module.exports = {
  EDITOR_CORE_SOURCE_REVISION,
  EDITOR_SCORE_INTENT_VERSION,
  SESLITAB_EDITOR_HOST_VERSION,
  TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_ID,
  TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_MANIFEST,
  TRUSTED_EDITOR_CORE_REVIEW_ADAPTER_VERSION,
  TrustedEditorCoreReviewAdapterError,
  createTrustedEditorCoreReviewAdapter,
  createTrustedEditorCoreReviewAdapterState,
};
