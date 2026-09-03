'use strict';

const { types: { isProxy } } = require('node:util');

const TEACHER_CORRECTION_REVISION_CONTRACT_VERSION = '1.0.0';
const TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE = 'TeacherCorrectionRevision';
const ORIGINAL_SOURCE_DOCUMENT_TYPE = 'TeacherCorrectionOriginalSource';

const REVISION_STATE = Object.freeze({
  ORIGINAL_SOURCE: 'ORIGINAL_SOURCE',
  REVIEW_REVISION: 'REVIEW_REVISION',
  TEACHER_CORRECTED_REVISION: 'TEACHER_CORRECTED_REVISION',
  REVALIDATED_REVISION: 'REVALIDATED_REVISION',
  APPROVED_CANONICAL_SCORE: 'APPROVED_CANONICAL_SCORE',
});

const VALIDATION_STATE = Object.freeze({
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  PENDING_REVALIDATION: 'PENDING_REVALIDATION',
  VALID: 'VALID',
  INVALID: 'INVALID',
  APPROVED: 'APPROVED',
});

const EDIT_CLASS = Object.freeze({
  PITCH_UPDATE: 'PITCH_UPDATE',
  DURATION_UPDATE: 'DURATION_UPDATE',
  ONSET_TIMELINE_CORRECTION: 'ONSET_TIMELINE_CORRECTION',
  VOICE_REASSIGNMENT: 'VOICE_REASSIGNMENT',
  STAFF_REASSIGNMENT: 'STAFF_REASSIGNMENT',
  NOTE_ADD: 'NOTE_ADD',
  NOTE_DELETE: 'NOTE_DELETE',
  REST_ADD: 'REST_ADD',
  REST_DELETE: 'REST_DELETE',
  TIE_CORRECTION: 'TIE_CORRECTION',
  CHORD_GROUPING_CORRECTION: 'CHORD_GROUPING_CORRECTION',
});

const EDIT_CLASS_SET = new Set(Object.values(EDIT_CLASS));
const REVERSAL_EDIT_CLASS = Object.freeze({
  [EDIT_CLASS.PITCH_UPDATE]: EDIT_CLASS.PITCH_UPDATE,
  [EDIT_CLASS.DURATION_UPDATE]: EDIT_CLASS.DURATION_UPDATE,
  [EDIT_CLASS.ONSET_TIMELINE_CORRECTION]: EDIT_CLASS.ONSET_TIMELINE_CORRECTION,
  [EDIT_CLASS.VOICE_REASSIGNMENT]: EDIT_CLASS.VOICE_REASSIGNMENT,
  [EDIT_CLASS.STAFF_REASSIGNMENT]: EDIT_CLASS.STAFF_REASSIGNMENT,
  [EDIT_CLASS.NOTE_ADD]: EDIT_CLASS.NOTE_DELETE,
  [EDIT_CLASS.NOTE_DELETE]: EDIT_CLASS.NOTE_ADD,
  [EDIT_CLASS.REST_ADD]: EDIT_CLASS.REST_DELETE,
  [EDIT_CLASS.REST_DELETE]: EDIT_CLASS.REST_ADD,
  [EDIT_CLASS.TIE_CORRECTION]: EDIT_CLASS.TIE_CORRECTION,
  [EDIT_CLASS.CHORD_GROUPING_CORRECTION]: EDIT_CLASS.CHORD_GROUPING_CORRECTION,
});

const MAX_TEXT_LENGTH = 4096;
const MAX_ID_LENGTH = 160;
const MAX_PATCHES = 256;
const MAX_DATA_DEPTH = 8;
const MAX_DATA_NODES = 2048;
const MAX_ARRAY_ITEMS = 256;
const MAX_OBJECT_KEYS = 128;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataDescriptors(value, field) {
  if (!isPlainObject(value)) throw new TypeError(`${field} must be a non-proxy plain object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new TypeError(`${field} must not contain symbol keys.`);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${field}.${key} must be an enumerable data property.`);
    }
  }
  return descriptors;
}

function exactFields(value, fields, label) {
  const descriptors = dataDescriptors(value, label);
  const observed = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (
    observed.length !== expected.length
    || observed.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} must contain exactly the required fields.`);
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
    throw new TypeError(`${field} must be a bounded stable identifier.`);
  }
  return value;
}

function normalizeText(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_TEXT_LENGTH
    || value !== value.trim()
  ) {
    throw new TypeError(`${field} must be a non-empty bounded string.`);
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string') throw new TypeError('timestamp must be an ISO-8601 UTC string.');
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new TypeError('timestamp must be a canonical ISO-8601 UTC string.');
  }
  return value;
}

function normalizeJsonValue(value, field, state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) throw new TypeError(`${field} exceeds the data node limit.`);
  if (depth > MAX_DATA_DEPTH) throw new TypeError(`${field} exceeds the data depth limit.`);

  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_LENGTH) throw new TypeError(`${field} contains an oversized string.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${field} numbers must be finite.`);
    return value;
  }
  if (typeof value !== 'object' || isProxy(value)) {
    throw new TypeError(`${field} must contain only bounded JSON-like data.`);
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new TypeError(`${field} exceeds the array item limit.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const normalized = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`${field}[${index}] must be an enumerable data property.`);
      }
      normalized.push(normalizeJsonValue(descriptor.value, `${field}[${index}]`, state, depth + 1));
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length' || (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key))) continue;
      throw new TypeError(`${field} arrays must not contain custom properties.`);
    }
    return Object.freeze(normalized);
  }

  const descriptors = dataDescriptors(value, field);
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_OBJECT_KEYS) throw new TypeError(`${field} exceeds the object key limit.`);
  const normalized = {};
  for (const key of keys.sort()) {
    normalized[key] = normalizeJsonValue(
      descriptors[key].value,
      `${field}.${key}`,
      state,
      depth + 1,
    );
  }
  return Object.freeze(normalized);
}

function normalizeNonEmptyEvidence(value, field) {
  if (typeof value === 'string') return normalizeText(value, field);
  const normalized = normalizeJsonValue(value, field);
  if (!isPlainObject(normalized) || Object.keys(normalized).length === 0) {
    throw new TypeError(`${field} must be a non-empty string or plain object.`);
  }
  return normalized;
}

function normalizeTargetEvent(value) {
  if (typeof value === 'string') return normalizeId(value, 'target_event');
  const normalized = normalizeJsonValue(value, 'target_event');
  if (!isPlainObject(normalized) || Object.keys(normalized).length === 0) {
    throw new TypeError('target_event must be a stable event id or non-empty location object.');
  }
  return normalized;
}

function normalizeOriginalSource(input) {
  const descriptors = exactFields(
    input,
    ['source_id', 'byte_length', 'sha256', 'media_type', 'provenance'],
    'original source',
  );
  const byteLength = descriptors.byte_length.value;
  const sha256 = descriptors.sha256.value;
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new TypeError('byte_length must be a non-negative safe integer.');
  }
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new TypeError('sha256 must be a lowercase SHA-256 hex digest.');
  }

  return Object.freeze({
    documentType: ORIGINAL_SOURCE_DOCUMENT_TYPE,
    contractVersion: TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
    state: REVISION_STATE.ORIGINAL_SOURCE,
    source_id: normalizeId(descriptors.source_id.value, 'source_id'),
    byte_length: byteLength,
    sha256,
    media_type: normalizeText(descriptors.media_type.value, 'media_type'),
    provenance: normalizeNonEmptyEvidence(descriptors.provenance.value, 'provenance'),
  });
}

function assertOriginalSource(value) {
  if (
    !value
    || value.documentType !== ORIGINAL_SOURCE_DOCUMENT_TYPE
    || value.contractVersion !== TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    || value.state !== REVISION_STATE.ORIGINAL_SOURCE
    || typeof value.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.sha256)
    || !Number.isSafeInteger(value.byte_length)
    || value.byte_length < 0
  ) {
    throw new TypeError('original source snapshot is invalid.');
  }
}

function normalizeRevisionMetadata(metadata, extraFields = []) {
  const fields = ['revision_id', 'actor', 'timestamp', 'reason', 'provenance', ...extraFields];
  const descriptors = exactFields(metadata, fields, 'revision metadata');
  return {
    descriptors,
    revision_id: normalizeId(descriptors.revision_id.value, 'revision_id'),
    actor: normalizeNonEmptyEvidence(descriptors.actor.value, 'actor'),
    timestamp: normalizeTimestamp(descriptors.timestamp.value),
    reason: normalizeText(descriptors.reason.value, 'reason'),
    provenance: normalizeNonEmptyEvidence(descriptors.provenance.value, 'provenance'),
  };
}

function assertChronology(previous, timestamp) {
  if (Date.parse(timestamp) < Date.parse(previous.timestamp)) {
    throw new TypeError('revision timestamp must not precede its parent revision.');
  }
}

function baseRevision(previous, state, metadata, validationState) {
  return {
    documentType: TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
    contractVersion: TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
    state,
    revision_id: metadata.revision_id,
    parent_revision_id: previous ? previous.revision_id : null,
    original_source: previous ? previous.original_source : null,
    actor: metadata.actor,
    timestamp: metadata.timestamp,
    reason: metadata.reason,
    validation_state: validationState,
    provenance: metadata.provenance,
  };
}

function createOriginalSourceSnapshot(input) {
  return normalizeOriginalSource(input);
}

function createReviewRevision(originalSource, metadata) {
  assertOriginalSource(originalSource);
  const normalized = normalizeRevisionMetadata(metadata, ['review_evidence']);
  const reviewEvidence = normalizeJsonValue(
    normalized.descriptors.review_evidence.value,
    'review_evidence',
  );
  if (
    !isPlainObject(reviewEvidence)
    || reviewEvidence.status !== 'REVIEW_REQUIRED'
    || reviewEvidence.canOpenForReview !== true
  ) {
    throw new TypeError('review_evidence must prove REVIEW_REQUIRED and canOpenForReview=true.');
  }

  return Object.freeze({
    ...baseRevision(null, REVISION_STATE.REVIEW_REVISION, normalized, VALIDATION_STATE.REVIEW_REQUIRED),
    original_source: originalSource,
    review_evidence: reviewEvidence,
    patches: Object.freeze([]),
    validation_evidence: null,
  });
}

function normalizePatch(input) {
  const descriptors = exactFields(
    input,
    ['patch_id', 'edit_class', 'target_event', 'before', 'after'],
    'correction patch',
  );
  const editClass = descriptors.edit_class.value;
  if (typeof editClass !== 'string' || !EDIT_CLASS_SET.has(editClass)) {
    throw new TypeError('edit_class is not supported by the Stage 05 revision contract.');
  }
  const before = normalizeJsonValue(descriptors.before.value, 'before');
  const after = normalizeJsonValue(descriptors.after.value, 'after');

  if (editClass === EDIT_CLASS.NOTE_ADD || editClass === EDIT_CLASS.REST_ADD) {
    if (before !== null || after === null) {
      throw new TypeError(`${editClass} requires before=null and an explicit after value.`);
    }
  } else if (editClass === EDIT_CLASS.NOTE_DELETE || editClass === EDIT_CLASS.REST_DELETE) {
    if (before === null || after !== null) {
      throw new TypeError(`${editClass} requires an explicit before value and after=null.`);
    }
  } else if (before === null || after === null) {
    throw new TypeError(`${editClass} requires explicit before and after values.`);
  }

  if (JSON.stringify(before) === JSON.stringify(after)) {
    throw new TypeError('correction patch must change the explicit value.');
  }

  const patchId = normalizeId(descriptors.patch_id.value, 'patch_id');
  const targetEvent = normalizeTargetEvent(descriptors.target_event.value);
  const inverse = Object.freeze({
    edit_class: REVERSAL_EDIT_CLASS[editClass],
    target_event: targetEvent,
    before: after,
    after: before,
  });

  return Object.freeze({
    patch_id: patchId,
    edit_class: editClass,
    target_event: targetEvent,
    before,
    after,
    inverse_patch: inverse,
  });
}

function assertRevision(value, expectedState) {
  if (
    !value
    || value.documentType !== TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    || value.contractVersion !== TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    || value.state !== expectedState
    || typeof value.revision_id !== 'string'
    || !value.original_source
  ) {
    throw new TypeError(`parent revision must be ${expectedState}.`);
  }
  assertOriginalSource(value.original_source);
}

function createTeacherCorrectedRevision(reviewRevision, metadata) {
  assertRevision(reviewRevision, REVISION_STATE.REVIEW_REVISION);
  const normalized = normalizeRevisionMetadata(metadata, ['patches']);
  assertChronology(reviewRevision, normalized.timestamp);
  const rawPatches = normalized.descriptors.patches.value;
  if (!Array.isArray(rawPatches) || isProxy(rawPatches) || rawPatches.length === 0 || rawPatches.length > MAX_PATCHES) {
    throw new TypeError('patches must be a bounded non-empty array.');
  }
  const patches = Object.freeze(rawPatches.map(normalizePatch));
  const ids = new Set();
  for (const patch of patches) {
    if (ids.has(patch.patch_id)) throw new TypeError('patch_id values must be unique within a revision.');
    ids.add(patch.patch_id);
  }

  return Object.freeze({
    ...baseRevision(
      reviewRevision,
      REVISION_STATE.TEACHER_CORRECTED_REVISION,
      normalized,
      VALIDATION_STATE.PENDING_REVALIDATION,
    ),
    original_source: reviewRevision.original_source,
    review_evidence: reviewRevision.review_evidence,
    patches,
    validation_evidence: null,
  });
}

function createRevalidatedRevision(correctedRevision, metadata) {
  assertRevision(correctedRevision, REVISION_STATE.TEACHER_CORRECTED_REVISION);
  const normalized = normalizeRevisionMetadata(
    metadata,
    ['validation_state', 'validation_evidence'],
  );
  assertChronology(correctedRevision, normalized.timestamp);
  const validationState = normalized.descriptors.validation_state.value;
  if (![VALIDATION_STATE.VALID, VALIDATION_STATE.INVALID].includes(validationState)) {
    throw new TypeError('revalidation must resolve to VALID or INVALID.');
  }
  const validationEvidence = normalizeJsonValue(
    normalized.descriptors.validation_evidence.value,
    'validation_evidence',
  );
  if (validationEvidence === null) {
    throw new TypeError('revalidation requires explicit validation_evidence.');
  }

  return Object.freeze({
    ...baseRevision(
      correctedRevision,
      REVISION_STATE.REVALIDATED_REVISION,
      normalized,
      validationState,
    ),
    original_source: correctedRevision.original_source,
    review_evidence: correctedRevision.review_evidence,
    patches: correctedRevision.patches,
    validation_evidence: validationEvidence,
  });
}

function createApprovedCanonicalRevision(revalidatedRevision, metadata) {
  assertRevision(revalidatedRevision, REVISION_STATE.REVALIDATED_REVISION);
  if (revalidatedRevision.validation_state !== VALIDATION_STATE.VALID) {
    throw new TypeError('only a VALID revalidated revision may become an approved canonical score.');
  }
  const normalized = normalizeRevisionMetadata(metadata);
  assertChronology(revalidatedRevision, normalized.timestamp);

  return Object.freeze({
    ...baseRevision(
      revalidatedRevision,
      REVISION_STATE.APPROVED_CANONICAL_SCORE,
      normalized,
      VALIDATION_STATE.APPROVED,
    ),
    original_source: revalidatedRevision.original_source,
    review_evidence: revalidatedRevision.review_evidence,
    patches: revalidatedRevision.patches,
    validation_evidence: revalidatedRevision.validation_evidence,
  });
}

module.exports = {
  EDIT_CLASS,
  MAX_PATCHES,
  ORIGINAL_SOURCE_DOCUMENT_TYPE,
  REVISION_STATE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
  TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
  VALIDATION_STATE,
  createApprovedCanonicalRevision,
  createOriginalSourceSnapshot,
  createRevalidatedRevision,
  createReviewRevision,
  createTeacherCorrectedRevision,
  normalizePatch,
};
