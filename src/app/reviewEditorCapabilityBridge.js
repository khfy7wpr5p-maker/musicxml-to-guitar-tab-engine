'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
  normalizeCapabilityManifest,
} = require('./reviewEditorBackend');
const {
  createOriginalSourceSnapshot,
  createReviewRevision,
} = require('./teacherCorrectionRevision');
const {
  buildReviewEditorCapabilityState,
} = require('./reviewEditorCapabilityState');

const REVIEW_EDITOR_CAPABILITY_BRIDGE_VERSION = '1.0.0';
const MAX_DATA_DEPTH = 10;
const MAX_DATA_NODES = 4096;
const MAX_ARRAY_ITEMS = 512;
const MAX_OBJECT_KEYS = 256;
const MAX_TEXT = 4096;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeJsonValue(value, field, state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) throw new TypeError(`${field} exceeds the data node limit.`);
  if (depth > MAX_DATA_DEPTH) throw new TypeError(`${field} exceeds the data depth limit.`);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT) throw new TypeError(`${field} contains an oversized string.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${field} numbers must be finite.`);
    return value;
  }
  if (typeof value !== 'object' || isProxy(value)) {
    throw new TypeError(`${field} must contain bounded JSON-like data.`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ARRAY_ITEMS) {
      throw new TypeError(`${field} must be a bounded ordinary array.`);
    }
    return Object.freeze(value.map((entry, index) => normalizeJsonValue(
      entry,
      `${field}[${index}]`,
      state,
      depth + 1,
    )));
  }
  if (!isPlainObject(value)) throw new TypeError(`${field} must contain plain data objects.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_OBJECT_KEYS || keys.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${field} exceeds the plain-object boundary.`);
  }
  const output = {};
  for (const key of keys.sort()) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${field}.${key} must be an enumerable data property.`);
    }
    output[key] = normalizeJsonValue(descriptor.value, `${field}.${key}`, state, depth + 1);
  }
  return Object.freeze(output);
}

function ownedBytes(value) {
  if (value && typeof value === 'object' && isProxy(value)) {
    throw new TypeError('sourceBytes must not be a Proxy.');
  }
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError('sourceBytes must be a Buffer or Uint8Array.');
  }
  return Buffer.from(value);
}

function mediaTypeFor(fileName) {
  if (typeof fileName !== 'string') throw new TypeError('upload result fileName is required.');
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mxl')) return 'application/vnd.recordare.musicxml';
  if (lower.endsWith('.musicxml') || lower.endsWith('.xml')) return 'application/vnd.recordare.musicxml+xml';
  throw new TypeError('review editor bridge supports only MusicXML upload extensions.');
}

function originalSourceFromUpload(uploadResult, sourceBytes) {
  const bytes = ownedBytes(sourceBytes);
  const input = uploadResult?.input;
  if (!isPlainObject(input)) throw new TypeError('uploadResult.input identity is required.');
  if (typeof input.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.sha256)) {
    throw new TypeError('uploadResult.input.sha256 must be a lowercase SHA-256 digest.');
  }
  const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== input.sha256) {
    throw new TypeError('sourceBytes do not match the authoritative upload SHA-256.');
  }
  if (Number.isSafeInteger(input.byteLength) && input.byteLength !== bytes.length) {
    throw new TypeError('sourceBytes do not match the authoritative upload byte length.');
  }
  const fileName = input.fileName;
  return createOriginalSourceSnapshot({
    source_id: `workbench:${actualSha256.slice(0, 32)}`,
    byte_length: bytes.length,
    sha256: actualSha256,
    media_type: mediaTypeFor(fileName),
    provenance: {
      kind: 'GUITAR_TAB_WORKBENCH_UPLOAD',
      fileName,
      capabilityBridgeVersion: REVIEW_EDITOR_CAPABILITY_BRIDGE_VERSION,
    },
  });
}

function createReviewMetadata(reviewMetadata, reviewState) {
  if (!isPlainObject(reviewMetadata)) throw new TypeError('reviewMetadata must be a plain object.');
  return {
    ...reviewMetadata,
    review_evidence: reviewState,
  };
}

function createReviewEditorCapabilitySession({
  sessionId,
  uploadResult,
  sourceBytes,
  reviewMetadata,
  adapterManifest,
  adapterState,
}) {
  const reviewState = buildReviewEditorCapabilityState(uploadResult);
  const originalSource = originalSourceFromUpload(uploadResult, sourceBytes);
  const reviewRevision = createReviewRevision(
    originalSource,
    createReviewMetadata(reviewMetadata, reviewState),
  );
  const manifest = normalizeCapabilityManifest(adapterManifest);
  const normalizedAdapterState = normalizeJsonValue(adapterState, 'adapterState');
  if (
    typeof sessionId !== 'string'
    || sessionId.length === 0
    || sessionId.length > 160
    || sessionId !== sessionId.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(sessionId)
  ) {
    throw new TypeError('sessionId must be a bounded stable identifier.');
  }

  return Object.freeze({
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    session_id: sessionId,
    phase: SESSION_PHASE.EDITING,
    review_revision: reviewRevision,
    issues: reviewState.issues,
    selected_issue_id: null,
    selected_target: null,
    adapter_manifest: manifest,
    adapter_state: normalizedAdapterState,
    pending_patches: Object.freeze([]),
    redo_patches: Object.freeze([]),
    operation_log: Object.freeze([]),
    saved_revision: null,
    revalidated_revision: null,
  });
}

module.exports = {
  REVIEW_EDITOR_CAPABILITY_BRIDGE_VERSION,
  createReviewEditorCapabilitySession,
  originalSourceFromUpload,
};
