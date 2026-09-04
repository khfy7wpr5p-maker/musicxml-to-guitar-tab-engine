'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
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
  createApprovedCanonicalRevision,
} = require('./teacherCorrectionRevision');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('./musicXmlUploadRuntime');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');
const {
  MUSICXML_ROUTE_REQUIREMENT,
  routeRequirementFromParsedMusicXml,
} = require('./musicXmlRouteClassifier');
const { resolveProcessingRuntime } = require('../core/processingRuntime');

const STAGE08_REVALIDATION_TAB_CONTRACT_VERSION = '1.0.0';
const STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE = 'Stage08RevalidationTabResult';
const STAGE08_MATERIALIZER_CONTRACT_VERSION = '1.0.0';
const STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE = 'Stage08CorrectedScoreMaterializationEvidence';
const STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE = 'Stage08RevalidationTabEvidence';

const STAGE08_STATUS = Object.freeze({
  PASS: 'PASS',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
});

const MAX_ID_LENGTH = 160;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_PATCHES = 256;

class Stage08RevalidationTabError extends Error {
  constructor(message, code = 'INVALID_STAGE08_CONTINUATION', details = {}) {
    super(message);
    this.name = 'Stage08RevalidationTabError';
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.freeze(this);
  }
}

function fail(message, code, details = {}) {
  throw new Stage08RevalidationTabError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataDescriptors(value, field, code = 'INVALID_STAGE08_CONTINUATION') {
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

function exactFields(value, fields, field, code = 'INVALID_STAGE08_CONTINUATION') {
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
    fail(`${field} must be a bounded stable identifier.`, 'INVALID_STAGE08_CONTINUATION', { field });
  }
  return value;
}

function normalizeFileName(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_FILE_NAME_LENGTH
    || /[\\/\u0000-\u001f\u007f]/.test(value)
    || !/\.(?:xml|musicxml)$/i.test(value)
  ) {
    fail(
      'sourceFileName must be a bounded .xml or .musicxml plain file name.',
      'INVALID_STAGE08_CONTINUATION',
      { field: 'sourceFileName' },
    );
  }
  return value;
}

function cloneBytes(value, field) {
  if (value && typeof value === 'object' && isProxy(value)) {
    fail(`${field} must not be a Proxy.`, 'INVALID_STAGE08_CONTINUATION', { field });
  }
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    fail(`${field} must be a Buffer or Uint8Array.`, 'INVALID_STAGE08_CONTINUATION', { field });
  }
  try {
    return Buffer.from(value);
  } catch {
    fail(`${field} must be an attached byte sequence.`, 'INVALID_STAGE08_CONTINUATION', { field });
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function stableKey(value) {
  return JSON.stringify(value);
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

function assertRevision(value, state, validationState, field) {
  if (
    !value
    || value.documentType !== TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    || value.contractVersion !== TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    || value.state !== state
    || value.validation_state !== validationState
    || typeof value.revision_id !== 'string'
    || !value.original_source
  ) {
    fail(`${field} is not the required Stage 05 revision.`, 'INVALID_REVISION_STATE', {
      field,
      expectedState: state,
      expectedValidationState: validationState,
    });
  }
}

function assertEligibleSession(session) {
  if (
    !session
    || session.documentType !== REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE
    || session.contractVersion !== REVIEW_EDITOR_BACKEND_CONTRACT_VERSION
    || session.phase !== SESSION_PHASE.REVALIDATED
  ) {
    fail(
      'Stage 08 requires the exact current REVALIDATED Stage 06 session.',
      'INVALID_SESSION_PHASE',
      { phase: session?.phase ?? null },
    );
  }

  assertRevision(
    session.saved_revision,
    REVISION_STATE.TEACHER_CORRECTED_REVISION,
    VALIDATION_STATE.PENDING_REVALIDATION,
    'session.saved_revision',
  );
  assertRevision(
    session.revalidated_revision,
    REVISION_STATE.REVALIDATED_REVISION,
    VALIDATION_STATE.VALID,
    'session.revalidated_revision',
  );

  const saved = session.saved_revision;
  const revalidated = session.revalidated_revision;
  if (revalidated.parent_revision_id !== saved.revision_id) {
    fail(
      'revalidated revision does not descend from the current saved teacher revision.',
      'STALE_REVISION_IDENTITY',
      { expectedParentRevisionId: saved.revision_id, observedParentRevisionId: revalidated.parent_revision_id },
    );
  }
  if (
    revalidated.original_source?.source_id !== saved.original_source?.source_id
    || revalidated.original_source?.sha256 !== saved.original_source?.sha256
    || revalidated.original_source?.byte_length !== saved.original_source?.byte_length
  ) {
    fail('saved and revalidated revision source identity differs.', 'SOURCE_IDENTITY_MISMATCH');
  }
  if (stableKey(revalidated.patches) !== stableKey(saved.patches)) {
    fail('revalidated revision patch ledger differs from the saved teacher revision.', 'PATCH_LEDGER_MISMATCH');
  }
  if (!Array.isArray(revalidated.patches) || revalidated.patches.length === 0 || revalidated.patches.length > MAX_PATCHES) {
    fail('Stage 08 requires a bounded non-empty teacher patch ledger.', 'PATCH_LEDGER_MISMATCH');
  }

  return session;
}

function normalizeMaterializer(materializer) {
  if (!isPlainObject(materializer)) {
    fail('trusted materializer must be a non-proxy plain object.', 'MATERIALIZER_MISMATCH');
  }
  const descriptors = exactFields(
    materializer,
    ['manifest', 'materialize'],
    'trusted materializer',
    'MATERIALIZER_MISMATCH',
  );
  if (typeof descriptors.materialize.value !== 'function') {
    fail('trusted materializer must expose materialize().', 'MATERIALIZER_MISMATCH');
  }
  const manifestDescriptors = exactFields(
    descriptors.manifest.value,
    ['contractVersion', 'adapterId', 'mediaType'],
    'trusted materializer manifest',
    'MATERIALIZER_MISMATCH',
  );
  if (manifestDescriptors.contractVersion.value !== STAGE08_MATERIALIZER_CONTRACT_VERSION) {
    fail('trusted materializer contractVersion is unsupported.', 'MATERIALIZER_MISMATCH');
  }
  const mediaType = manifestDescriptors.mediaType.value;
  if (typeof mediaType !== 'string' || mediaType.length === 0 || mediaType.length > 160) {
    fail('trusted materializer mediaType is invalid.', 'MATERIALIZER_MISMATCH');
  }
  return Object.freeze({
    adapterId: normalizeId(manifestDescriptors.adapterId.value, 'materializer.adapterId'),
    mediaType,
    materialize: descriptors.materialize.value,
  });
}

function normalizePatchIds(value) {
  if (!Array.isArray(value) || isProxy(value) || value.length === 0 || value.length > MAX_PATCHES) {
    fail('materialization evidence patchIds must be a bounded non-empty array.', 'INVALID_MATERIALIZATION_EVIDENCE');
  }
  return Object.freeze(value.map((entry, index) => normalizeId(entry, `materializationEvidence.patchIds[${index}]`)));
}

function normalizeMaterializationResult(result, context) {
  const descriptors = exactFields(
    result,
    ['correctedBytes', 'evidence'],
    'materializer result',
    'INVALID_MATERIALIZATION_EVIDENCE',
  );
  const correctedBytes = cloneBytes(descriptors.correctedBytes.value, 'materializer result.correctedBytes');
  const evidenceDescriptors = exactFields(
    descriptors.evidence.value,
    [
      'documentType',
      'contractVersion',
      'adapterId',
      'sourceId',
      'correctedRevisionId',
      'parentRevisionId',
      'originalSha256',
      'correctedSha256',
      'correctedByteLength',
      'patchIds',
      'mediaType',
    ],
    'materialization evidence',
    'INVALID_MATERIALIZATION_EVIDENCE',
  );

  if (
    evidenceDescriptors.documentType.value !== STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE
    || evidenceDescriptors.contractVersion.value !== STAGE08_MATERIALIZER_CONTRACT_VERSION
  ) {
    fail('materialization evidence contract is unsupported.', 'INVALID_MATERIALIZATION_EVIDENCE');
  }

  const evidence = Object.freeze({
    documentType: STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
    contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
    adapterId: normalizeId(evidenceDescriptors.adapterId.value, 'materializationEvidence.adapterId'),
    sourceId: normalizeId(evidenceDescriptors.sourceId.value, 'materializationEvidence.sourceId'),
    correctedRevisionId: normalizeId(
      evidenceDescriptors.correctedRevisionId.value,
      'materializationEvidence.correctedRevisionId',
    ),
    parentRevisionId: normalizeId(
      evidenceDescriptors.parentRevisionId.value,
      'materializationEvidence.parentRevisionId',
    ),
    originalSha256: evidenceDescriptors.originalSha256.value,
    correctedSha256: evidenceDescriptors.correctedSha256.value,
    correctedByteLength: evidenceDescriptors.correctedByteLength.value,
    patchIds: normalizePatchIds(evidenceDescriptors.patchIds.value),
    mediaType: evidenceDescriptors.mediaType.value,
  });

  if (
    evidence.adapterId !== context.materializer.adapterId
    || evidence.mediaType !== context.materializer.mediaType
    || evidence.sourceId !== context.source.source_id
    || evidence.correctedRevisionId !== context.revalidated.revision_id
    || evidence.parentRevisionId !== context.saved.revision_id
    || evidence.originalSha256 !== context.source.sha256
  ) {
    fail('materialization evidence does not match the exact Stage 08 continuation identity.', 'MATERIALIZATION_IDENTITY_MISMATCH');
  }
  if (
    typeof evidence.originalSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(evidence.originalSha256)
    || typeof evidence.correctedSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(evidence.correctedSha256)
    || !Number.isSafeInteger(evidence.correctedByteLength)
    || evidence.correctedByteLength < 0
  ) {
    fail('materialization evidence hashes or byte length are invalid.', 'INVALID_MATERIALIZATION_EVIDENCE');
  }
  const expectedPatchIds = context.revalidated.patches.map((patch) => patch.patch_id);
  if (stableKey(evidence.patchIds) !== stableKey(expectedPatchIds)) {
    fail('materialization evidence patch ledger does not match the exact revalidated revision.', 'PATCH_LEDGER_MISMATCH');
  }

  const correctedHash = sha256(correctedBytes);
  if (correctedHash !== evidence.correctedSha256 || correctedBytes.byteLength !== evidence.correctedByteLength) {
    fail('corrected score bytes do not match materialization evidence.', 'CORRECTED_SOURCE_IDENTITY_MISMATCH');
  }

  return Object.freeze({ correctedBytes, evidence });
}

function approvalEvidence({ source, revalidated, materializationEvidence, reentry }) {
  const musicXmlBytes = Buffer.from(reentry.musicXml, 'utf8');
  return deepFreeze({
    documentType: STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE,
    contractVersion: STAGE08_REVALIDATION_TAB_CONTRACT_VERSION,
    source_id: source.source_id,
    revalidated_revision_id: revalidated.revision_id,
    materializer_id: materializationEvidence.adapterId,
    corrected_sha256: materializationEvidence.correctedSha256,
    route: reentry.route,
    reentry_status: reentry.status,
    canonical_document_type: reentry.canonicalTabResult.documentType,
    canonical_contract_version: reentry.canonicalTabResult.contractVersion,
    output_sha256: sha256(musicXmlBytes),
    output_byte_length: musicXmlBytes.byteLength,
  });
}

function boundedFailure(status, route, sourceIdentity, materializationEvidence, reentry) {
  return deepFreeze({
    documentType: STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE,
    contractVersion: STAGE08_REVALIDATION_TAB_CONTRACT_VERSION,
    status,
    route,
    sourceIdentity,
    materializationEvidence,
    reentry: reentry
      ? {
        status: reentry.status,
        route: reentry.route,
        preflight: reentry.preflight,
      }
      : null,
    canonicalTabResult: null,
    musicXml: null,
    approvedRevision: null,
  });
}

function continueRevalidatedRevisionToTab({
  session,
  sourceFileName,
  originalSourceBytes,
  materializer,
  approvalMetadata,
}, options = {}, runtime = null) {
  assertEligibleSession(session);
  const fileName = normalizeFileName(sourceFileName);
  const sourceBytes = cloneBytes(originalSourceBytes, 'originalSourceBytes');
  const source = session.revalidated_revision.original_source;
  const sourceInputHash = sha256(sourceBytes);

  if (sourceBytes.byteLength !== source.byte_length || sourceInputHash !== source.sha256) {
    fail(
      'original source bytes do not match the immutable Stage 05 source snapshot.',
      'SOURCE_IDENTITY_MISMATCH',
      {
        expectedByteLength: source.byte_length,
        observedByteLength: sourceBytes.byteLength,
        expectedSha256: source.sha256,
        observedSha256: sourceInputHash,
      },
    );
  }

  const trustedMaterializer = normalizeMaterializer(materializer);
  const materializerSourceBytes = Buffer.from(sourceBytes);
  const materializerInputHash = sha256(materializerSourceBytes);
  let rawMaterialization;
  try {
    rawMaterialization = trustedMaterializer.materialize(Object.freeze({
      contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
      sourceFileName: fileName,
      originalSourceBytes: materializerSourceBytes,
      source: session.revalidated_revision.original_source,
      savedRevision: session.saved_revision,
      revalidatedRevision: session.revalidated_revision,
    }));
  } catch (error) {
    fail('trusted materializer rejected corrected-score materialization.', 'MATERIALIZATION_FAILED', {
      cause: error instanceof Error ? error.message : String(error),
      causeCode: typeof error?.code === 'string' ? error.code : null,
    });
  }

  if (sha256(materializerSourceBytes) !== materializerInputHash) {
    fail('trusted materializer mutated the supplied original source bytes.', 'SOURCE_MUTATION_DETECTED');
  }
  if (sha256(sourceBytes) !== sourceInputHash) {
    fail('Stage 08 original source bytes changed during materialization.', 'SOURCE_MUTATION_DETECTED');
  }

  const materialized = normalizeMaterializationResult(rawMaterialization, {
    materializer: trustedMaterializer,
    source,
    saved: session.saved_revision,
    revalidated: session.revalidated_revision,
  });

  const processingOptions = isPlainObject(options) && Object.hasOwn(options, 'processing')
    ? options.processing
    : {};
  if (!isPlainObject(options) || Reflect.ownKeys(options).some((key) => key !== 'processing')) {
    fail('Stage 08 options may contain only processing.', 'INVALID_STAGE08_CONTINUATION');
  }
  if (!isPlainObject(processingOptions)) {
    fail('options.processing must be a non-proxy plain object.', 'INVALID_STAGE08_CONTINUATION');
  }
  const processing = resolveProcessingRuntime(processingOptions, runtime);
  processing.checkpoint('stage08:reentry:start');

  let requiredRoute;
  try {
    requiredRoute = routeRequirementFromParsedMusicXml(
      parseParsedMusicXmlDocument(materialized.correctedBytes, {}, processing),
    );
  } catch (error) {
    return boundedFailure(
      STAGE08_STATUS.BLOCKED,
      MUSICXML_UPLOAD_ROUTE.UNRESOLVED,
      Object.freeze({ sourceId: source.source_id, sha256: source.sha256 }),
      materialized.evidence,
      Object.freeze({
        status: STAGE08_STATUS.BLOCKED,
        route: MUSICXML_UPLOAD_ROUTE.UNRESOLVED,
        preflight: Object.freeze({
          status: 'BLOCKED',
          canProcess: false,
          issues: Object.freeze([Object.freeze({
            category: 'content',
            code: typeof error?.code === 'string' ? error.code : 'STAGE08_REENTRY_PARSE_FAILED',
            message: error instanceof Error ? error.message : 'Corrected score could not be parsed.',
          })]),
        }),
      }),
    );
  }

  const reentry = processMusicXmlUpload(
    Object.freeze({ fileName, bytes: materialized.correctedBytes }),
    Object.freeze({ processing: processingOptions }),
    processing,
  );

  if (reentry.status === STAGE08_STATUS.REVIEW_REQUIRED) {
    return boundedFailure(
      STAGE08_STATUS.REVIEW_REQUIRED,
      reentry.route,
      Object.freeze({ sourceId: source.source_id, sha256: source.sha256 }),
      materialized.evidence,
      reentry,
    );
  }
  if (reentry.status !== MUSICXML_UPLOAD_STATUS.PASS) {
    return boundedFailure(
      STAGE08_STATUS.BLOCKED,
      reentry.route,
      Object.freeze({ sourceId: source.source_id, sha256: source.sha256 }),
      materialized.evidence,
      reentry,
    );
  }

  if (
    requiredRoute === MUSICXML_ROUTE_REQUIREMENT.POLY_V2
    && reentry.route !== MUSICXML_UPLOAD_ROUTE.POLY_V2
  ) {
    fail('polyphonic corrected score attempted to leave the POLY_V2 route.', 'POLY_ROUTE_DOWNGRADE', {
      requiredRoute,
      observedRoute: reentry.route,
    });
  }
  if (!reentry.canonicalTabResult || typeof reentry.musicXml !== 'string' || reentry.musicXml.length === 0) {
    fail('PASS re-entry is missing validated canonical TAB or writer output.', 'INCOMPLETE_CANONICAL_SUCCESS');
  }

  const stage08Evidence = approvalEvidence({
    source,
    revalidated: session.revalidated_revision,
    materializationEvidence: materialized.evidence,
    reentry,
  });

  const approvalDescriptors = exactFields(
    approvalMetadata,
    ['revision_id', 'actor', 'timestamp', 'reason', 'provenance'],
    'approvalMetadata',
  );
  const approvedRevision = createApprovedCanonicalRevision(
    session.revalidated_revision,
    {
      revision_id: approvalDescriptors.revision_id.value,
      actor: approvalDescriptors.actor.value,
      timestamp: approvalDescriptors.timestamp.value,
      reason: approvalDescriptors.reason.value,
      provenance: approvalDescriptors.provenance.value,
    },
  );

  processing.checkpoint('stage08:reentry:complete', {
    route: reentry.route,
    correctedByteLength: materialized.evidence.correctedByteLength,
  });

  return deepFreeze({
    documentType: STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE,
    contractVersion: STAGE08_REVALIDATION_TAB_CONTRACT_VERSION,
    status: STAGE08_STATUS.PASS,
    route: reentry.route,
    sourceIdentity: Object.freeze({
      sourceId: source.source_id,
      sha256: source.sha256,
      correctedSha256: materialized.evidence.correctedSha256,
    }),
    materializationEvidence: materialized.evidence,
    approvalEvidence: stage08Evidence,
    reentry: Object.freeze({
      status: reentry.status,
      route: reentry.route,
      preflight: reentry.preflight,
    }),
    canonicalTabResult: reentry.canonicalTabResult,
    musicXml: reentry.musicXml,
    approvedRevision,
  });
}

module.exports = {
  STAGE08_APPROVAL_EVIDENCE_DOCUMENT_TYPE,
  STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
  STAGE08_MATERIALIZER_CONTRACT_VERSION,
  STAGE08_REVALIDATION_TAB_CONTRACT_VERSION,
  STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE,
  STAGE08_STATUS,
  Stage08RevalidationTabError,
  continueRevalidatedRevisionToTab,
};
