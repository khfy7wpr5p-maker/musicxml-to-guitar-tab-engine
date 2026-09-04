'use strict';

const {
  STAGE08_STATUS,
  continueRevalidatedRevisionToTab,
} = require('./stage08RevalidationTabContinuation');
const {
  createStage08ApprovedCanonicalRevision,
} = require('./stage08ApprovedCanonicalRevision');
const {
  applyStage08ReentryReviewEvidence,
} = require('./stage08ReentryReviewGate');

const STAGE08_PRODUCTION_CONTINUATION_VERSION = '1.0.0';
const STAGE08_PRODUCTION_CONTINUATION_DOCUMENT_TYPE = 'Stage08ProductionContinuationResult';

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRequest(request) {
  if (!isPlainObject(request)) throw new TypeError('Stage 08 production request must be a plain object.');
  if (!request.session?.revalidated_revision) {
    throw new TypeError('Stage 08 production request requires the exact current revalidated revision.');
  }
  if (!isPlainObject(request.approvalMetadata)) {
    throw new TypeError('Stage 08 production request requires approvalMetadata.');
  }
}

function normalizeApprovalEvidence(execution) {
  const evidence = execution.approvalEvidence;
  if (!isPlainObject(evidence)) throw new TypeError('Stage 08 PASS execution must expose approvalEvidence.');
  const canonicalVersion = evidence.canonical_contract_version
    ?? execution.canonicalTabResult?.contractVersion
    ?? execution.canonicalTabResult?.schemaVersion;
  return Object.freeze({
    ...evidence,
    canonical_contract_version: canonicalVersion,
  });
}

function freezeResult(result) {
  return Object.freeze(result);
}

function continueStage08ProductionToCanonicalTab(request, options = {}, runtime = null) {
  assertRequest(request);
  const execution = continueRevalidatedRevisionToTab(request, options, runtime);
  if (execution.status !== STAGE08_STATUS.PASS) {
    const classified = applyStage08ReentryReviewEvidence(
      execution,
      request.session.revalidated_revision,
      request.reentryReviewEvidence ?? null,
    );
    return freezeResult({
      ...classified,
      productionDocumentType: STAGE08_PRODUCTION_CONTINUATION_DOCUMENT_TYPE,
      productionContractVersion: STAGE08_PRODUCTION_CONTINUATION_VERSION,
    });
  }
  if (request.reentryReviewEvidence !== null && request.reentryReviewEvidence !== undefined) {
    throw new TypeError('Stage 08 review evidence is not applicable to a PASS re-entry.');
  }

  const approvalEvidence = normalizeApprovalEvidence(execution);
  const approvedRevision = createStage08ApprovedCanonicalRevision(
    request.session.revalidated_revision,
    approvalEvidence,
    request.approvalMetadata,
  );

  return freezeResult({
    ...execution,
    productionDocumentType: STAGE08_PRODUCTION_CONTINUATION_DOCUMENT_TYPE,
    productionContractVersion: STAGE08_PRODUCTION_CONTINUATION_VERSION,
    approvalEvidence,
    approvedRevision,
  });
}

module.exports = {
  STAGE08_PRODUCTION_CONTINUATION_DOCUMENT_TYPE,
  STAGE08_PRODUCTION_CONTINUATION_VERSION,
  continueStage08ProductionToCanonicalTab,
};
