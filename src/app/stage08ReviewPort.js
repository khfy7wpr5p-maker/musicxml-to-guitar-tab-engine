'use strict';

const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('./reviewEditorBackend');
const {
  REVISION_STATE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
  TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
  VALIDATION_STATE,
} = require('./teacherCorrectionRevision');
const {
  continueRevalidatedRevisionToTab,
} = require('./stage08RevalidationTabContinuation');

const STAGE08_REVIEW_PORT_CONTRACT_VERSION = '1.0.0';
const STAGE08_REVIEW_PORT_DOCUMENT_TYPE = 'Stage08ReviewPort';

const REQUIRED_REVIEW_PORT_METHODS = Object.freeze([
  'snapshot',
  'selectIssue',
  'selectTarget',
  'resolvePresentationAddress',
  'command',
  'undo',
  'redo',
  'save',
  'revalidate',
]);

class Stage08ReviewPortError extends Error {
  constructor(message, code = 'INVALID_STAGE08_REVIEW_PORT', details = {}) {
    super(message);
    this.name = 'Stage08ReviewPortError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

function fail(message, code, details = {}) {
  throw new Stage08ReviewPortError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableKey(value) {
  return JSON.stringify(value);
}

function requireReviewPort(reviewPort) {
  if (!isPlainObject(reviewPort)) fail('Stage 06 review port is required.', 'REVIEW_PORT_MISMATCH');
  for (const method of REQUIRED_REVIEW_PORT_METHODS) {
    if (typeof reviewPort[method] !== 'function') {
      fail(`Stage 06 review port must expose ${method}().`, 'REVIEW_PORT_MISMATCH', { method });
    }
  }
  return reviewPort;
}

function eligibleSession(session) {
  const saved = session?.saved_revision;
  const revalidated = session?.revalidated_revision;
  const savedSource = saved?.original_source;
  const revalidatedSource = revalidated?.original_source;
  return Boolean(
    session
    && session.documentType === REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE
    && session.contractVersion === REVIEW_EDITOR_BACKEND_CONTRACT_VERSION
    && session.phase === SESSION_PHASE.REVALIDATED
    && saved
    && saved.documentType === TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    && saved.contractVersion === TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    && saved.state === REVISION_STATE.TEACHER_CORRECTED_REVISION
    && saved.validation_state === VALIDATION_STATE.PENDING_REVALIDATION
    && revalidated
    && revalidated.documentType === TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    && revalidated.contractVersion === TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    && revalidated.state === REVISION_STATE.REVALIDATED_REVISION
    && revalidated.validation_state === VALIDATION_STATE.VALID
    && revalidated.parent_revision_id === saved.revision_id
    && savedSource
    && revalidatedSource
    && revalidatedSource.source_id === savedSource.source_id
    && revalidatedSource.sha256 === savedSource.sha256
    && revalidatedSource.byte_length === savedSource.byte_length
    && Array.isArray(saved.patches)
    && saved.patches.length > 0
    && Array.isArray(revalidated.patches)
    && stableKey(revalidated.patches) === stableKey(saved.patches)
  );
}

function sessionIdentity(session) {
  if (!eligibleSession(session)) return null;
  return Object.freeze({
    sessionId: session.session_id ?? null,
    sourceId: session.revalidated_revision.original_source.source_id,
    originalSha256: session.revalidated_revision.original_source.sha256,
    originalByteLength: session.revalidated_revision.original_source.byte_length,
    savedRevisionId: session.saved_revision.revision_id,
    revalidatedRevisionId: session.revalidated_revision.revision_id,
    patchLedger: stableKey(session.revalidated_revision.patches),
  });
}

function sameIdentity(left, right) {
  return Boolean(
    left
    && right
    && left.sessionId === right.sessionId
    && left.sourceId === right.sourceId
    && left.originalSha256 === right.originalSha256
    && left.originalByteLength === right.originalByteLength
    && left.savedRevisionId === right.savedRevisionId
    && left.revalidatedRevisionId === right.revalidatedRevisionId
    && left.patchLedger === right.patchLedger
  );
}

function enableContinuationInUiModel(model, connected) {
  if (!connected || !isPlainObject(model) || !isPlainObject(model.actions)) return model;
  if (model.revision?.readyForStage08 !== true) return model;
  return Object.freeze({
    ...model,
    actions: Object.freeze({
      ...model.actions,
      continueToTab: true,
    }),
  });
}

function decorateSnapshot(value, connected) {
  if (!connected || !isPlainObject(value)) return value;
  if (isPlainObject(value.uiModel)) {
    const uiModel = enableContinuationInUiModel(value.uiModel, true);
    return uiModel === value.uiModel ? value : Object.freeze({ ...value, uiModel });
  }
  return enableContinuationInUiModel(value, true);
}

function createStage08ReviewPort({
  reviewPort,
  getCurrentSession,
  buildContinuationRequest,
  continuation = continueRevalidatedRevisionToTab,
  options = {},
  runtime = null,
}) {
  const delegate = requireReviewPort(reviewPort);
  if (typeof getCurrentSession !== 'function') {
    fail('getCurrentSession must be a trusted function.', 'REVIEW_PORT_MISMATCH');
  }
  if (typeof buildContinuationRequest !== 'function') {
    fail('buildContinuationRequest must be a trusted function.', 'REVIEW_PORT_MISMATCH');
  }
  if (typeof continuation !== 'function') {
    fail('continuation must be a trusted Stage 08 function.', 'REVIEW_PORT_MISMATCH');
  }
  if (!isPlainObject(options)) fail('options must be a plain object.', 'REVIEW_PORT_MISMATCH');

  async function snapshot() {
    const value = await delegate.snapshot();
    const session = getCurrentSession();
    return decorateSnapshot(value, eligibleSession(session));
  }

  async function continueToTab() {
    const beforeSession = getCurrentSession();
    const beforeIdentity = sessionIdentity(beforeSession);
    if (!beforeIdentity) {
      fail(
        'Stage 08 continuation requires the exact current REVALIDATED/VALID revision.',
        'STAGE08_CONTINUATION_NOT_READY',
      );
    }

    const built = await buildContinuationRequest(beforeSession);
    if (!isPlainObject(built)) {
      fail('buildContinuationRequest must return a plain object.', 'CONTINUATION_REQUEST_INVALID');
    }

    const currentSession = getCurrentSession();
    const currentIdentity = sessionIdentity(currentSession);
    if (!sameIdentity(beforeIdentity, currentIdentity)) {
      fail('Stage 08 continuation became stale before execution.', 'STALE_STAGE08_CONTINUATION');
    }

    const result = await continuation(
      Object.freeze({ ...built, session: currentSession }),
      options,
      runtime,
    );

    const afterIdentity = sessionIdentity(getCurrentSession());
    if (!sameIdentity(beforeIdentity, afterIdentity)) {
      fail('Stage 08 continuation completed against a stale editor session.', 'STALE_STAGE08_CONTINUATION');
    }
    return result;
  }

  return Object.freeze({
    documentType: STAGE08_REVIEW_PORT_DOCUMENT_TYPE,
    contractVersion: STAGE08_REVIEW_PORT_CONTRACT_VERSION,
    snapshot,
    selectIssue: (...args) => delegate.selectIssue(...args),
    selectTarget: (...args) => delegate.selectTarget(...args),
    resolvePresentationAddress: (...args) => delegate.resolvePresentationAddress(...args),
    command: (...args) => delegate.command(...args),
    undo: (...args) => delegate.undo(...args),
    redo: (...args) => delegate.redo(...args),
    save: (...args) => delegate.save(...args),
    revalidate: (...args) => delegate.revalidate(...args),
    continueToTab,
  });
}

module.exports = {
  STAGE08_REVIEW_PORT_CONTRACT_VERSION,
  STAGE08_REVIEW_PORT_DOCUMENT_TYPE,
  Stage08ReviewPortError,
  createStage08ReviewPort,
};
