'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');
const {
  MUSICXML_ROUTE_REQUIREMENT,
  routeRequirementFromParsedMusicXml,
} = require('./musicXmlRouteClassifier');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('./musicXmlUploadRuntime');
const {
  OMR_REVIEW_STATE_DOCUMENT_TYPE,
  OMR_REVIEW_EVIDENCE_CONTRACT_VERSION,
  buildOmrReviewScoreState,
} = require('./omrReviewEvidence');
const {
  SCORE_STATUS,
  SOURCE_REVIEW_AVAILABILITY,
} = require('./reviewableScoreState');
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

const STAGE08_REVALIDATION_TAB_CONTRACT_VERSION = '1.0.0';
const STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE = 'Stage08RevalidationTabResult';
const STAGE08_MATERIALIZER_CONTRACT_VERSION = '1.0.0';
const STAGE08_REVIEW_ASSESSOR_CONTRACT_VERSION = '1.0.0';
const STAGE08_ID = 'STAGE_08_REVALIDATION_AND_TAB';
const MAX_ID_LENGTH = 160;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_EVIDENCE_DEPTH = 8;
const MAX_EVIDENCE_NODES = 2048;
const MAX_ARRAY_ITEMS = 256;
const MAX_OBJECT_KEYS = 128;

class Stage08RevalidationToTabError extends EngineError {
  constructor(message, code = 'INVALID_STAGE08_CONTINUATION', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'Stage08RevalidationToTabError');
  }
}

function fail(message, code = 'INVALID_STAGE08_CONTINUATION', details = {}) {
  throw new Stage08RevalidationToTabError(message, code, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function descriptorsOf(value, field) {
  if (!isPlainObject(value)) fail(`${field} must be a non-proxy plain object.`, 'INVALID_STAGE08_CONTRACT', { field });
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail(`${field} must not contain symbol keys.`, 'INVALID_STAGE08_CONTRACT', { field });
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(`${field}.${key} must be an enumerable data property.`, 'INVALID_STAGE08_CONTRACT', { field: `${field}.${key}` });
    }
  }
  return descriptors;
}

function exactFields(value, fields, field) {
  const descriptors = descriptorsOf(value, field);
  const observed = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index])) {
    fail(`${field} must contain exactly the required fields.`, 'INVALID_STAGE08_CONTRACT', {
      field,
      observed,
      expected,
    });
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
    fail(`${field} must be a bounded stable identifier.`, 'INVALID_STAGE08_CONTRACT', { field });
  }
  return value;
}

function normalizeFileName(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_FILE_NAME_LENGTH
    || /[\\/\u0000-\u001f\u007f]/.test(value)
    || !(value.toLowerCase().endsWith('.xml') || value.toLowerCase().endsWith('.musicxml'))
  ) {
    fail('fileName must be a bounded .xml or .musicxml plain file name.', 'INVALID_STAGE08_CONTRACT', { field: 'fileName' });
  }
  return value;
}

function normalizeJsonValue(value, field, state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_EVIDENCE_NODES) fail(`${field} exceeds the evidence node limit.`, 'INVALID_STAGE08_CONTRACT', { field });
  if (depth > MAX_EVIDENCE_DEPTH) fail(`${field} exceeds the evidence depth limit.`, 'INVALID_STAGE08_CONTRACT', { field });
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${field} numbers must be finite.`, 'INVALID_STAGE08_CONTRACT', { field });
    return value;
  }
  if (!value || typeof value !== 'object' || isProxy(value)) {
    fail(`${field} must contain only bounded JSON-like values.`, 'INVALID_STAGE08_CONTRACT', { field });
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ARRAY_ITEMS) {
      fail(`${field} must be a bounded ordinary array.`, 'INVALID_STAGE08_CONTRACT', { field });
    }
    return Object.freeze(value.map((item, index) => normalizeJsonValue(item, `${field}[${index}]`, state, depth + 1)));
  }
  const descriptors = descriptorsOf(value, field);
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_OBJECT_KEYS) fail(`${field} exceeds the object key limit.`, 'INVALID_STAGE08_CONTRACT', { field });
  const normalized = {};
  for (const key of keys.sort()) {
    normalized[key] = normalizeJsonValue(descriptors[key].value, `${field}.${key}`, state, depth + 1);
  }
  return Object.freeze(normalized);
}

function exactBytes(value, field) {
  if (value && typeof value === 'object' && isProxy(value)) {
    fail(`${field} must not be a Proxy.`, 'INVALID_STAGE08_BYTES', { field });
  }
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    fail(`${field} must be a Buffer or Uint8Array.`, 'INVALID_STAGE08_BYTES', { field });
  }
  let bytes;
  try {
    bytes = Buffer.from(value);
  } catch {
    fail(`${field} must be an attached byte array.`, 'INVALID_STAGE08_BYTES', { field });
  }
  return bytes;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertRevisionObject(revision, expectedState, field) {
  if (
    !revision
    || revision.documentType !== TEACHER_CORRECTION_REVISION_DOCUMENT_TYPE
    || revision.contractVersion !== TEACHER_CORRECTION_REVISION_CONTRACT_VERSION
    || revision.state !== expectedState
    || typeof revision.revision_id !== 'string'
    || !revision.original_source
  ) {
    fail(`${field} is not a valid ${expectedState}.`, 'INVALID_STAGE08_REVISION', { field });
  }
}

function assertEligibleSession(session, expected) {
  if (
    !session
    || session.documentType !== REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE
    || session.contractVersion !== REVIEW_EDITOR_BACKEND_CONTRACT_VERSION
    || session.phase !== SESSION_PHASE.REVALIDATED
    || typeof session.session_id !== 'string'
  ) {
    fail('Stage 08 requires the exact current REVALIDATED Stage 06 session.', 'STAGE08_NOT_ELIGIBLE');
  }
  if (session.session_id !== expected.sessionId) {
    fail('Stage 08 session identity is stale.', 'STALE_STAGE08_SESSION', {
      expectedSessionId: expected.sessionId,
      observedSessionId: session.session_id,
    });
  }

  const revalidated = session.revalidated_revision;
  const saved = session.saved_revision;
  assertRevisionObject(revalidated, REVISION_STATE.REVALIDATED_REVISION, 'session.revalidated_revision');
  assertRevisionObject(saved, REVISION_STATE.TEACHER_CORRECTED_REVISION, 'session.saved_revision');
  if (revalidated.validation_state !== VALIDATION_STATE.VALID) {
    fail('Stage 08 continuation requires validation_state=VALID.', 'STAGE08_NOT_ELIGIBLE', {
      validationState: revalidated.validation_state,
    });
  }
  if (revalidated.revision_id !== expected.revisionId) {
    fail('Stage 08 revision identity is stale.', 'STALE_STAGE08_REVISION', {
      expectedRevisionId: expected.revisionId,
      observedRevisionId: revalidated.revision_id,
    });
  }
  if (saved.revision_id !== revalidated.parent_revision_id) {
    fail('Revalidated revision does not point to the current saved correction revision.', 'STAGE08_REVISION_CHAIN_MISMATCH');
  }
  if (saved.original_source?.source_id !== revalidated.original_source?.source_id) {
    fail('Saved and revalidated revisions disagree on original source identity.', 'STAGE08_SOURCE_MISMATCH');
  }
  if (revalidated.original_source.source_id !== expected.sourceId) {
    fail('Stage 08 source identity is stale.', 'STALE_STAGE08_SOURCE', {
      expectedSourceId: expected.sourceId,
      observedSourceId: revalidated.original_source.source_id,
    });
  }
  if (!Array.isArray(revalidated.patches) || revalidated.patches.length === 0) {
    fail('Stage 08 requires an explicit non-empty teacher correction ledger.', 'STAGE08_PATCH_LEDGER_MISSING');
  }
  return { revalidated, saved, originalSource: revalidated.original_source };
}

function assertOriginalSourceBytes(originalSource, bytes) {
  const observedHash = sha256(bytes);
  if (bytes.byteLength !== originalSource.byte_length || observedHash !== originalSource.sha256) {
    fail('Original source bytes do not match the immutable Stage 05 source snapshot.', 'ORIGINAL_SOURCE_IDENTITY_MISMATCH', {
      expectedByteLength: originalSource.byte_length,
      observedByteLength: bytes.byteLength,
      expectedSha256: originalSource.sha256,
      observedSha256: observedHash,
    });
  }
  return observedHash;
}

function normalizeMaterializer(materializer) {
  const descriptors = exactFields(
    materializer,
    ['contractVersion', 'materializerId', 'materialize'],
    'materializer',
  );
  if (descriptors.contractVersion.value !== STAGE08_MATERIALIZER_CONTRACT_VERSION) {
    fail('Stage 08 materializer contractVersion is unsupported.', 'INVALID_STAGE08_MATERIALIZER');
  }
  if (typeof descriptors.materialize.value !== 'function') {
    fail('Stage 08 materializer must expose materialize().', 'INVALID_STAGE08_MATERIALIZER');
  }
  return Object.freeze({
    contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
    materializerId: normalizeId(descriptors.materializerId.value, 'materializer.materializerId'),
    materialize: descriptors.materialize.value,
  });
}

function normalizeMaterializationResult(result, expected) {
  const descriptors = exactFields(
    result,
    ['sourceId', 'revisionId', 'bytes', 'evidence'],
    'materializer result',
  );
  const sourceId = normalizeId(descriptors.sourceId.value, 'materializer result.sourceId');
  const revisionId = normalizeId(descriptors.revisionId.value, 'materializer result.revisionId');
  if (sourceId !== expected.sourceId || revisionId !== expected.revisionId) {
    fail('Materialized corrected score identity does not match the exact Stage 08 revision.', 'STAGE08_MATERIALIZED_IDENTITY_MISMATCH', {
      expectedSourceId: expected.sourceId,
      observedSourceId: sourceId,
      expectedRevisionId: expected.revisionId,
      observedRevisionId: revisionId,
    });
  }
  const bytes = exactBytes(descriptors.bytes.value, 'materializer result.bytes');
  if (bytes.byteLength === 0) fail('Materialized corrected score must not be empty.', 'INVALID_STAGE08_MATERIALIZATION');
  const evidence = normalizeJsonValue(descriptors.evidence.value, 'materializer result.evidence');
  if (!isPlainObject(evidence) || Object.keys(evidence).length === 0) {
    fail('Materializer must return non-empty bounded evidence.', 'INVALID_STAGE08_MATERIALIZATION');
  }
  return Object.freeze({ sourceId, revisionId, bytes, evidence });
}

function materializeCorrectedScore(materializer, context) {
  const trusted = normalizeMaterializer(materializer);
  let raw;
  try {
    raw = trusted.materialize(Object.freeze({
      contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
      sessionId: context.sessionId,
      sourceId: context.sourceId,
      revisionId: context.revisionId,
      parentRevisionId: context.parentRevisionId,
      originalSource: context.originalSource,
      originalSourceBytes: Buffer.from(context.originalSourceBytes),
      patches: context.patches,
    }));
  } catch (error) {
    fail('Trusted Stage 08 materializer rejected corrected-score materialization.', 'STAGE08_MATERIALIZATION_FAILED', {
      materializerId: trusted.materializerId,
      cause: error instanceof Error ? error.message : String(error),
      causeCode: typeof error?.code === 'string' ? error.code : null,
    });
  }
  return {
    materializer: trusted,
    result: normalizeMaterializationResult(raw, context),
  };
}

function normalizeReviewAssessor(assessor) {
  if (assessor === null || assessor === undefined) return null;
  const descriptors = exactFields(
    assessor,
    ['contractVersion', 'assessorId', 'assess'],
    'reviewAssessor',
  );
  if (descriptors.contractVersion.value !== STAGE08_REVIEW_ASSESSOR_CONTRACT_VERSION) {
    fail('Stage 08 review assessor contractVersion is unsupported.', 'INVALID_STAGE08_REVIEW_ASSESSOR');
  }
  if (typeof descriptors.assess.value !== 'function') {
    fail('Stage 08 review assessor must expose assess().', 'INVALID_STAGE08_REVIEW_ASSESSOR');
  }
  return Object.freeze({
    contractVersion: STAGE08_REVIEW_ASSESSOR_CONTRACT_VERSION,
    assessorId: normalizeId(descriptors.assessorId.value, 'reviewAssessor.assessorId'),
    assess: descriptors.assess.value,
  });
}

function assessRemainingReview(assessor, context, route) {
  const trusted = normalizeReviewAssessor(assessor);
  if (!trusted) return null;
  let raw;
  try {
    raw = trusted.assess(Object.freeze({
      contractVersion: STAGE08_REVIEW_ASSESSOR_CONTRACT_VERSION,
      sourceId: context.sourceId,
      revisionId: context.revisionId,
      correctedSourceBytes: Buffer.from(context.correctedSourceBytes),
      route,
    }));
  } catch (error) {
    fail('Trusted Stage 08 review assessor rejected corrected-score assessment.', 'STAGE08_REVIEW_ASSESSMENT_FAILED', {
      assessorId: trusted.assessorId,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const descriptors = exactFields(
    raw,
    ['sourceId', 'revisionId', 'issuePayloads', 'sourceReviewAvailability', 'evidence'],
    'review assessor result',
  );
  if (descriptors.sourceId.value !== context.sourceId || descriptors.revisionId.value !== context.revisionId) {
    fail('Review assessment identity does not match the current Stage 08 revision.', 'STAGE08_REVIEW_IDENTITY_MISMATCH');
  }
  if (!Array.isArray(descriptors.issuePayloads.value)) {
    fail('review assessor issuePayloads must be an array.', 'INVALID_STAGE08_REVIEW_ASSESSMENT');
  }
  const availability = descriptors.sourceReviewAvailability.value;
  if (!Object.values(SOURCE_REVIEW_AVAILABILITY).includes(availability)) {
    fail('review assessor sourceReviewAvailability is invalid.', 'INVALID_STAGE08_REVIEW_ASSESSMENT');
  }
  const evidence = normalizeJsonValue(descriptors.evidence.value, 'review assessor result.evidence');
  const reviewState = buildOmrReviewScoreState({
    route,
    issuePayloads: descriptors.issuePayloads.value,
    sourceReviewAvailability: availability,
  });
  if (
    reviewState.documentType !== OMR_REVIEW_STATE_DOCUMENT_TYPE
    || reviewState.contractVersion !== OMR_REVIEW_EVIDENCE_CONTRACT_VERSION
  ) {
    fail('Stage 04 review assessment contract mismatch.', 'INVALID_STAGE08_REVIEW_ASSESSMENT');
  }
  return Object.freeze({ assessorId: trusted.assessorId, evidence, reviewState });
}

function expectedRouteForCorrectedBytes(bytes) {
  let parsed;
  try {
    parsed = parseParsedMusicXmlDocument(bytes);
  } catch (error) {
    return Object.freeze({
      route: null,
      error: Object.freeze({
        code: typeof error?.code === 'string' ? error.code : 'CORRECTED_SCORE_PARSE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }),
    });
  }
  const requirement = routeRequirementFromParsedMusicXml(parsed);
  return Object.freeze({
    route: requirement === MUSICXML_ROUTE_REQUIREMENT.POLY_V2
      ? MUSICXML_UPLOAD_ROUTE.POLY_V2
      : MUSICXML_UPLOAD_ROUTE.MONO_V1,
    error: null,
  });
}

function normalizeApprovalMetadata(metadata) {
  const descriptors = exactFields(
    metadata,
    ['revision_id', 'actor', 'timestamp', 'reason', 'provenance'],
    'approvalMetadata',
  );
  return Object.freeze({
    revision_id: descriptors.revision_id.value,
    actor: descriptors.actor.value,
    timestamp: descriptors.timestamp.value,
    reason: descriptors.reason.value,
    provenance: normalizeJsonValue(descriptors.provenance.value, 'approvalMetadata.provenance'),
  });
}

function stage08ApprovalEvidence({
  route,
  sourceId,
  revisionId,
  materializerId,
  correctedBytes,
  canonicalTabResult,
  musicXml,
}) {
  return Object.freeze({
    stageId: STAGE08_ID,
    status: SCORE_STATUS.PASS,
    route,
    sourceId,
    revalidatedRevisionId: revisionId,
    materializerId,
    correctedSourceSha256: sha256(correctedBytes),
    canonicalDocumentType: canonicalTabResult.documentType,
    canonicalContractVersion: canonicalTabResult.contractVersion,
    outputSha256: sha256(Buffer.from(musicXml, 'utf8')),
  });
}

function approveAfterFullStage08(revalidated, approvalMetadata, evidence) {
  if (
    !evidence
    || evidence.stageId !== STAGE08_ID
    || evidence.status !== SCORE_STATUS.PASS
    || ![MUSICXML_UPLOAD_ROUTE.MONO_V1, MUSICXML_UPLOAD_ROUTE.POLY_V2].includes(evidence.route)
    || evidence.sourceId !== revalidated.original_source.source_id
    || evidence.revalidatedRevisionId !== revalidated.revision_id
    || typeof evidence.canonicalDocumentType !== 'string'
    || typeof evidence.canonicalContractVersion !== 'string'
    || !/^[0-9a-f]{64}$/.test(evidence.correctedSourceSha256)
    || !/^[0-9a-f]{64}$/.test(evidence.outputSha256)
  ) {
    fail('APPROVED_CANONICAL_SCORE requires complete Stage 08 PASS evidence.', 'STAGE08_APPROVAL_EVIDENCE_REQUIRED');
  }
  const metadata = normalizeApprovalMetadata(approvalMetadata);
  return createApprovedCanonicalRevision(revalidated, {
    revision_id: metadata.revision_id,
    actor: metadata.actor,
    timestamp: metadata.timestamp,
    reason: metadata.reason,
    provenance: {
      ...metadata.provenance,
      stage08: evidence,
    },
  });
}

function outcomeBase(context, status, route) {
  return {
    documentType: STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE,
    contractVersion: STAGE08_REVALIDATION_TAB_CONTRACT_VERSION,
    status,
    route,
    session_id: context.sessionId,
    source_id: context.sourceId,
    revision_id: context.revisionId,
  };
}

function continueRevalidatedRevisionToTab(request, ports) {
  const requestDescriptors = exactFields(
    request,
    [
      'session',
      'expectedSessionId',
      'expectedRevisionId',
      'expectedSourceId',
      'originalSourceBytes',
      'fileName',
      'approvalMetadata',
    ],
    'Stage 08 request',
  );
  const portDescriptors = exactFields(
    ports,
    ['materializer', 'reviewAssessor'],
    'Stage 08 ports',
  );
  const expected = Object.freeze({
    sessionId: normalizeId(requestDescriptors.expectedSessionId.value, 'expectedSessionId'),
    revisionId: normalizeId(requestDescriptors.expectedRevisionId.value, 'expectedRevisionId'),
    sourceId: normalizeId(requestDescriptors.expectedSourceId.value, 'expectedSourceId'),
  });
  const session = requestDescriptors.session.value;
  const { revalidated, saved, originalSource } = assertEligibleSession(session, expected);
  const fileName = normalizeFileName(requestDescriptors.fileName.value);
  const originalSourceBytes = exactBytes(requestDescriptors.originalSourceBytes.value, 'originalSourceBytes');
  const originalHash = assertOriginalSourceBytes(originalSource, originalSourceBytes);

  const materialized = materializeCorrectedScore(portDescriptors.materializer.value, {
    ...expected,
    parentRevisionId: saved.revision_id,
    originalSource,
    originalSourceBytes,
    patches: revalidated.patches,
  });
  assertOriginalSourceBytes(originalSource, originalSourceBytes);
  if (sha256(originalSourceBytes) !== originalHash) {
    fail('Original source changed during corrected-score materialization.', 'ORIGINAL_SOURCE_MUTATED');
  }

  const correctedBytes = materialized.result.bytes;
  const correctedSha256 = sha256(correctedBytes);
  const routeCheck = expectedRouteForCorrectedBytes(correctedBytes);
  if (routeCheck.error) {
    return Object.freeze({
      ...outcomeBase(expected, SCORE_STATUS.BLOCKED, 'UNRESOLVED'),
      materialization: Object.freeze({
        materializerId: materialized.materializer.materializerId,
        byteLength: correctedBytes.byteLength,
        sha256: correctedSha256,
        evidence: materialized.result.evidence,
      }),
      review: null,
      production: Object.freeze({ error: routeCheck.error }),
      canonicalTabResult: null,
      musicXml: null,
      approved_revision: null,
    });
  }

  const review = assessRemainingReview(portDescriptors.reviewAssessor.value, {
    sourceId: expected.sourceId,
    revisionId: expected.revisionId,
    correctedSourceBytes: correctedBytes,
  }, routeCheck.route);
  if (review && review.reviewState.status !== SCORE_STATUS.PASS) {
    return Object.freeze({
      ...outcomeBase(expected, review.reviewState.status, routeCheck.route),
      materialization: Object.freeze({
        materializerId: materialized.materializer.materializerId,
        byteLength: correctedBytes.byteLength,
        sha256: correctedSha256,
        evidence: materialized.result.evidence,
      }),
      review,
      production: null,
      canonicalTabResult: null,
      musicXml: null,
      approved_revision: null,
    });
  }

  const production = processMusicXmlUpload({ fileName, bytes: Buffer.from(correctedBytes) });
  assertOriginalSourceBytes(originalSource, originalSourceBytes);
  if (production.status !== MUSICXML_UPLOAD_STATUS.PASS) {
    return Object.freeze({
      ...outcomeBase(expected, SCORE_STATUS.BLOCKED, production.route),
      materialization: Object.freeze({
        materializerId: materialized.materializer.materializerId,
        byteLength: correctedBytes.byteLength,
        sha256: correctedSha256,
        evidence: materialized.result.evidence,
      }),
      review,
      production,
      canonicalTabResult: null,
      musicXml: null,
      approved_revision: null,
    });
  }
  if (production.route !== routeCheck.route) {
    fail('Corrected score production route disagrees with the independent route classifier.', 'STAGE08_ROUTE_MISMATCH', {
      expectedRoute: routeCheck.route,
      productionRoute: production.route,
    });
  }
  if (routeCheck.route === MUSICXML_UPLOAD_ROUTE.POLY_V2 && production.route !== MUSICXML_UPLOAD_ROUTE.POLY_V2) {
    fail('Polyphonic corrected score must not degrade to MONO_V1.', 'STAGE08_POLY_TO_MONO_FORBIDDEN');
  }
  if (!production.canonicalTabResult || typeof production.musicXml !== 'string' || production.musicXml.length === 0) {
    fail('PASS production result must contain canonical TAB and writer output.', 'STAGE08_INCOMPLETE_PASS_RESULT');
  }

  const approvalEvidence = stage08ApprovalEvidence({
    route: production.route,
    sourceId: expected.sourceId,
    revisionId: expected.revisionId,
    materializerId: materialized.materializer.materializerId,
    correctedBytes,
    canonicalTabResult: production.canonicalTabResult,
    musicXml: production.musicXml,
  });
  const approvedRevision = approveAfterFullStage08(
    revalidated,
    requestDescriptors.approvalMetadata.value,
    approvalEvidence,
  );

  return Object.freeze({
    ...outcomeBase(expected, SCORE_STATUS.PASS, production.route),
    materialization: Object.freeze({
      materializerId: materialized.materializer.materializerId,
      byteLength: correctedBytes.byteLength,
      sha256: correctedSha256,
      evidence: materialized.result.evidence,
    }),
    review,
    production,
    approval_evidence: approvalEvidence,
    canonicalTabResult: production.canonicalTabResult,
    musicXml: production.musicXml,
    approved_revision: approvedRevision,
  });
}

module.exports = {
  STAGE08_ID,
  STAGE08_MATERIALIZER_CONTRACT_VERSION,
  STAGE08_REVALIDATION_TAB_CONTRACT_VERSION,
  STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE,
  STAGE08_REVIEW_ASSESSOR_CONTRACT_VERSION,
  Stage08RevalidationToTabError,
  approveAfterFullStage08,
  continueRevalidatedRevisionToTab,
};
