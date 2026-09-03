'use strict';

const { types: { isProxy } } = require('node:util');
const {
  REVIEW_DISPOSITION,
  buildScoreState,
} = require('./reviewableScoreState');

const OMR_REVIEW_EVIDENCE_CONTRACT_VERSION = '1.0.0';
const OMR_REVIEW_STATE_DOCUMENT_TYPE = 'OmrReviewScoreState';

const REVIEWABLE_OMR_CODES = Object.freeze([
  'OMR_SUSPECTED_PITCH',
  'OMR_MISSING_NOTE',
  'OMR_SUSPECTED_DURATION',
  'OMR_MISSING_OR_UNCERTAIN_DURATION',
  'OMR_VOICE_CONFLICT',
  'OMR_MEASURE_DURATION_MISMATCH',
  'OMR_AMBIGUOUS_TIE',
  'OMR_AMBIGUOUS_CHORD_GROUPING',
  'OMR_MISSING_REST',
  'OMR_STAFF_ASSIGNMENT_CONFLICT',
]);

const HARD_BLOCK_OMR_CODES = Object.freeze([
  'OMR_UNSAFE_XML',
  'OMR_UNPARSEABLE_DOCUMENT',
  'OMR_RESOURCE_SAFETY_VIOLATION',
  'OMR_CORRUPTED_STRUCTURE_WITHOUT_STABLE_LOCATION',
  'OMR_EXECUTION_CANNOT_CONTINUE_SAFELY',
]);

const REVIEWABLE_OMR_CODE_SET = new Set(REVIEWABLE_OMR_CODES);
const HARD_BLOCK_OMR_CODE_SET = new Set(HARD_BLOCK_OMR_CODES);
const REVIEWABLE_CATEGORIES = new Set(['content', 'semantic', 'quality']);
const HARD_BLOCK_CATEGORIES = new Set(['safety', 'parse', 'structure', 'transport']);

const REQUIRED_PAYLOAD_FIELDS = Object.freeze([
  'issue_id',
  'category',
  'code',
  'severity',
  'measure',
  'staff',
  'voice',
  'event_id_or_location',
  'observed_value',
  'confidence_or_evidence_if_available',
  'suggested_review_action',
  'source_provenance',
]);

const MAX_TEXT_LENGTH = 4096;
const MAX_EVIDENCE_DEPTH = 6;
const MAX_EVIDENCE_NODES = 512;
const MAX_ARRAY_ITEMS = 128;
const MAX_OBJECT_KEYS = 64;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainDataObject(value, field) {
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

function normalizeText(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`${field} must be a non-empty bounded string.`);
  }
  return value;
}

function normalizeLocationScalar(value, field) {
  if (value === null) return null;
  if (typeof value === 'string') {
    if (value.length === 0 || value.length > 256) {
      throw new TypeError(`${field} must be null or a bounded non-empty string/number.`);
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new TypeError(`${field} must be null or a bounded non-empty string/number.`);
}

function normalizeEvidenceValue(value, field, state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_EVIDENCE_NODES) throw new TypeError(`${field} exceeds the evidence node limit.`);
  if (depth > MAX_EVIDENCE_DEPTH) throw new TypeError(`${field} exceeds the evidence depth limit.`);

  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_LENGTH) throw new TypeError(`${field} contains an oversized string.`);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${field} numbers must be finite.`);
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new TypeError(`${field} exceeds the array item limit.`);
    return Object.freeze(value.map((item, index) => (
      normalizeEvidenceValue(item, `${field}[${index}]`, state, depth + 1)
    )));
  }

  if (isPlainObject(value)) {
    const descriptors = assertPlainDataObject(value, field);
    const keys = Object.keys(descriptors);
    if (keys.length > MAX_OBJECT_KEYS) throw new TypeError(`${field} exceeds the object key limit.`);
    const normalized = {};
    for (const key of keys.sort()) {
      normalized[key] = normalizeEvidenceValue(
        descriptors[key].value,
        `${field}.${key}`,
        state,
        depth + 1,
      );
    }
    return Object.freeze(normalized);
  }

  throw new TypeError(`${field} must contain only JSON-like evidence values.`);
}

function normalizeSourceProvenance(value) {
  if (typeof value === 'string') return normalizeText(value, 'source_provenance');
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) throw new TypeError('source_provenance must not be empty.');
    return normalizeEvidenceValue(value, 'source_provenance');
  }
  throw new TypeError('source_provenance must be a non-empty string or plain object.');
}

function normalizePayload(payload) {
  const descriptors = assertPlainDataObject(payload, 'payload');
  const keys = Object.keys(descriptors).sort();
  const expected = [...REQUIRED_PAYLOAD_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError('payload must contain exactly the Stage 04 required evidence fields.');
  }

  const normalized = {
    issue_id: normalizeText(descriptors.issue_id.value, 'issue_id'),
    category: normalizeText(descriptors.category.value, 'category'),
    code: normalizeText(descriptors.code.value, 'code'),
    severity: normalizeText(descriptors.severity.value, 'severity'),
    measure: normalizeLocationScalar(descriptors.measure.value, 'measure'),
    staff: normalizeLocationScalar(descriptors.staff.value, 'staff'),
    voice: normalizeLocationScalar(descriptors.voice.value, 'voice'),
    event_id_or_location: normalizeEvidenceValue(
      descriptors.event_id_or_location.value,
      'event_id_or_location',
    ),
    observed_value: normalizeEvidenceValue(descriptors.observed_value.value, 'observed_value'),
    confidence_or_evidence_if_available: normalizeEvidenceValue(
      descriptors.confidence_or_evidence_if_available.value,
      'confidence_or_evidence_if_available',
    ),
    suggested_review_action: normalizeText(
      descriptors.suggested_review_action.value,
      'suggested_review_action',
    ),
    source_provenance: normalizeSourceProvenance(descriptors.source_provenance.value),
  };

  if (normalized.severity !== 'error') {
    throw new TypeError('Stage 04 review/hard-block OMR evidence must use severity=error.');
  }

  const isReviewable = REVIEWABLE_OMR_CODE_SET.has(normalized.code);
  const isHardBlock = HARD_BLOCK_OMR_CODE_SET.has(normalized.code);
  if (!isReviewable && !isHardBlock) {
    throw new TypeError('OMR evidence code is not allow-listed by the Stage 04 contract.');
  }

  if (isReviewable && !REVIEWABLE_CATEGORIES.has(normalized.category)) {
    throw new TypeError('Reviewable OMR evidence must use a reviewable Stage 01 category.');
  }
  if (isHardBlock && !HARD_BLOCK_CATEGORIES.has(normalized.category)) {
    throw new TypeError('Hard-block OMR evidence must use a hard-block Stage 01 category.');
  }

  if (
    isReviewable
    && normalized.measure === null
    && normalized.event_id_or_location === null
  ) {
    throw new TypeError('Reviewable OMR evidence requires a stable measure or event/location reference.');
  }

  return Object.freeze(normalized);
}

function sourceEventIdFrom(payload) {
  if (typeof payload.event_id_or_location === 'string' && payload.event_id_or_location.length > 0) {
    return payload.event_id_or_location;
  }
  if (isPlainObject(payload.event_id_or_location)) {
    const candidate = payload.event_id_or_location.sourceEventId
      ?? payload.event_id_or_location.source_event_id
      ?? null;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
  }
  return null;
}

function integerLocationFrom(payload, camelKey, snakeKey) {
  if (!isPlainObject(payload.event_id_or_location)) return null;
  const candidate = payload.event_id_or_location[camelKey]
    ?? payload.event_id_or_location[snakeKey]
    ?? null;
  return Number.isInteger(candidate) && candidate >= 0 ? candidate : null;
}

function createOmrEvidenceIssue(payload) {
  const evidence = normalizePayload(payload);
  const isReviewable = REVIEWABLE_OMR_CODE_SET.has(evidence.code);

  return Object.freeze({
    severity: evidence.severity,
    category: evidence.category,
    code: evidence.code,
    message: null,
    reviewDisposition: isReviewable ? REVIEW_DISPOSITION : null,
    location: Object.freeze({
      measure: evidence.measure,
      measureIndex: integerLocationFrom(evidence, 'measureIndex', 'measure_index'),
      eventIndex: integerLocationFrom(evidence, 'eventIndex', 'event_index'),
      sourceEventId: sourceEventIdFrom(evidence),
    }),
    reviewEvidence: evidence,
  });
}

function buildOmrReviewScoreState({
  route,
  issuePayloads = [],
  sourceReviewAvailability,
}) {
  if (!Array.isArray(issuePayloads)) throw new TypeError('issuePayloads must be an array.');
  const issues = Object.freeze(issuePayloads.map(createOmrEvidenceIssue));
  const scoreState = buildScoreState({ route, issues, sourceReviewAvailability });

  return Object.freeze({
    documentType: OMR_REVIEW_STATE_DOCUMENT_TYPE,
    contractVersion: OMR_REVIEW_EVIDENCE_CONTRACT_VERSION,
    status: scoreState.status,
    route: scoreState.route,
    canProcess: scoreState.canProcess,
    canOpenForReview: scoreState.canOpenForReview,
    sourceReviewAvailability: scoreState.sourceReviewAvailability,
    issues,
  });
}

module.exports = {
  HARD_BLOCK_OMR_CODES,
  OMR_REVIEW_EVIDENCE_CONTRACT_VERSION,
  OMR_REVIEW_STATE_DOCUMENT_TYPE,
  REQUIRED_PAYLOAD_FIELDS,
  REVIEWABLE_OMR_CODES,
  buildOmrReviewScoreState,
  createOmrEvidenceIssue,
};
