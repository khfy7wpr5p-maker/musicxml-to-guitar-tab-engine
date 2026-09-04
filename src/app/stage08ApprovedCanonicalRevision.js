'use strict';

const { types: { isProxy } } = require('node:util');
const {
  REVISION_STATE,
  TEACHER_CORRECTION_REVISION_CONTRACT_VERSION,
  TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE,
  VALIDATION_STATE,
  createApprovedCanonicalRevision,
} = require('./teacherCorrectionRevision');

const STAGE08_APPROVED_REVISION_GATE_VERSION = '1.0.0';
const STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE = 'Stage08RevalidationTabEvidence';
const STAGE08_APPROVAL_EVIDENCE_CONTRACT_VERSION = '1.0.0';
const ALLOWED_ROUTES = new Set(['MONO_V1', 'POLY_V2']);
const MAX_ID_LENGTH = 160;
const MAX_TEXT_LENGTH = 4096;

class Stage08ApprovedCanonicalRevisionError extends Error {
  constructor(message, code = 'INVALID_STAGE08_APPROVAL', details = {}) {
    super(message);
    this.name = 'Stage08ApprovedCanonicalRevisionError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

function fail(message, code, details = {}) {
  throw new Stage08ApprovedCanonicalRevisionError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactFields(value, fields, label) {
  if (!isPlainObject(value)) fail(`${label} must be a non-proxy plain object.`, 'INVALID_STAGE08_APPROVAL_EVIDENCE');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail(`${label} must not contain symbol keys.`, 'INVALID_STAGE08_APPROVAL_EVIDENCE');
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(`${label}.${key} must be an enumerable data property.`, 'INVALID_STAGE08_APPROVAL_EVIDENCE');
    }
  }
  const observed = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) {
    fail(`${label} must contain exactly the required fields.`, 'INVALID_STAGE08_APPROVAL_EVIDENCE', {
      observed,
      expected,
    });
  }
  return descriptors;
}

function id(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ID_LENGTH
    || value !== value.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)
  ) {
    fail(`${field} must be a bounded stable identifier.`, 'INVALID_STAGE08_APPROVAL_EVIDENCE', { field });
  }
  return value;
}

function text(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT_LENGTH || value !== value.trim()) {
    fail(`${field} must be a bounded non-empty string.`, 'INVALID_STAGE08_APPROVAL_EVIDENCE', { field });
  }
  return value;
}

function hash(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${field} must be a lowercase SHA-256 digest.`, 'INVALID_STAGE08_APPROVAL_EVIDENCE', { field });
  }
  return value;
}

function assertRevalidatedRevision(revision) {
  if (
    !revision
    || revision.documentType !== TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    || revision.contractVersion !== TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    || revision.state !== REVISION_STATE.REVALIDATED_REVISION
    || revision.validation_state !== VALIDATION_STATE.VALID
    || typeof revision.revision_id !== 'string'
    || !revision.original_source
  ) {
    fail(
      'Stage 08 approval requires the exact VALID REVALIDATED_REVISION.',
      'INVALID_REVALIDATED_REVISION',
    );
  }
}

function normalizeStage08Evidence(value, revision) {
  const descriptors = exactFields(
    value,
    [
      'documentType',
      'contractVersion',
      'source_id',
      'revalidated_revision_id',
      'materializer_id',
      'corrected_sha256',
      'route',
      'reentry_status',
      'canonical_document_type',
      'canonical_contract_version',
      'output_sha256',
      'output_byte_length',
    ],
    'stage08Evidence',
  );

  if (
    descriptors.documentType.value !== STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE
    || descriptors.contractVersion.value !== STAGE08_APPROVAL_EVIDENCE_CONTRACT_VERSION
  ) {
    fail('Stage 08 approval evidence contract is unsupported.', 'INVALID_STAGE08_APPROVAL_EVIDENCE');
  }
  const sourceId = id(descriptors.source_id.value, 'stage08Evidence.source_id');
  const revalidatedRevisionId = id(
    descriptors.revalidated_revision_id.value,
    'stage08Evidence.revalidated_revision_id',
  );
  const materializerId = id(descriptors.materializer_id.value, 'stage08Evidence.materializer_id');
  const correctedSha256 = hash(descriptors.corrected_sha256.value, 'stage08Evidence.corrected_sha256');
  const route = descriptors.route.value;
  if (!ALLOWED_ROUTES.has(route)) {
    fail('Stage 08 approval evidence route is unsupported.', 'INVALID_STAGE08_APPROVAL_EVIDENCE', { route });
  }
  if (descriptors.reentry_status.value !== 'PASS') {
    fail('Stage 08 approval evidence must prove PASS re-entry.', 'STAGE08_REENTRY_NOT_PASS');
  }
  if (descriptors.canonical_document_type.value !== 'CanonicalTabResult') {
    fail('Stage 08 approval evidence must prove canonical TAB authority.', 'CANONICAL_EVIDENCE_MISSING');
  }
  const canonicalContractVersion = text(
    descriptors.canonical_contract_version.value,
    'stage08Evidence.canonical_contract_version',
  );
  const outputSha256 = hash(descriptors.output_sha256.value, 'stage08Evidence.output_sha256');
  const outputByteLength = descriptors.output_byte_length.value;
  if (!Number.isSafeInteger(outputByteLength) || outputByteLength <= 0) {
    fail(
      'Stage 08 approval evidence must prove a non-empty bounded writer output.',
      'WRITER_EVIDENCE_MISSING',
      { outputByteLength },
    );
  }

  if (
    sourceId !== revision.original_source.source_id
    || revalidatedRevisionId !== revision.revision_id
  ) {
    fail(
      'Stage 08 approval evidence does not match the exact source/revalidated revision.',
      'STAGE08_APPROVAL_IDENTITY_MISMATCH',
      {
        expectedSourceId: revision.original_source.source_id,
        observedSourceId: sourceId,
        expectedRevisionId: revision.revision_id,
        observedRevisionId: revalidatedRevisionId,
      },
    );
  }

  return Object.freeze({
    documentType: STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE,
    contractVersion: STAGE08_APPROVAL_EVIDENCE_CONTRACT_VERSION,
    source_id: sourceId,
    revalidated_revision_id: revalidatedRevisionId,
    materializer_id: materializerId,
    corrected_sha256: correctedSha256,
    route,
    reentry_status: 'PASS',
    canonical_document_type: 'CanonicalTabResult',
    canonical_contract_version: canonicalContractVersion,
    output_sha256: outputSha256,
    output_byte_length: outputByteLength,
  });
}

function createStage08ApprovedCanonicalRevision(revalidatedRevision, stage08Evidence, metadata) {
  assertRevalidatedRevision(revalidatedRevision);
  const evidence = normalizeStage08Evidence(stage08Evidence, revalidatedRevision);
  const approved = createApprovedCanonicalRevision(revalidatedRevision, metadata);
  return Object.freeze({
    ...approved,
    stage08_evidence: evidence,
  });
}

module.exports = {
  STAGE08_APPROVED_REVISION_GATE_VERSION,
  STAGE08_APPROVAL_EVIDENCE_CONTRACT_VERSION,
  STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE,
  Stage08ApprovedCanonicalRevisionError,
  createStage08ApprovedCanonicalRevision,
};
