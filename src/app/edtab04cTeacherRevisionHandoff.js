'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { bindReviewTabDraftToStage08 } = require('./reviewTabDraftStage08Binding');
const { processReviewTabDraftEdit } = require('./reviewTabDraftEditRuntime');
const { createEdtab04PitchMaterializer } = require('./edtab04PitchMaterializer');
const { continueRevalidatedRevisionToTab } = require('./stage08RevalidationTabContinuation');
const { verifyEdtab04PositionParity } = require('./edtab04cPositionParity');

const DOCUMENT_TYPE = 'Edtab04TeacherRevisionHandoff';
const CONTRACT_VERSION = '1.0.0';

function abstain(code) {
  return Object.freeze({ documentType: DOCUMENT_TYPE, contractVersion: CONTRACT_VERSION,
    status: 'ABSTAIN', code, canonicalAuthority: false, export: false });
}

// Trusted server-side assessment only. Caller supplies a backend-owned Stage 06
// session, never browser-submitted revision objects. No canonical artifact or
// approval revision crosses this handoff, even when positions match.
function assessEdtab04TeacherRevision(request) {
  if (!request || typeof request !== 'object' || isProxy(request)
    || isProxy(request.originalSourceBytes)
    || (!Buffer.isBuffer(request.originalSourceBytes)
      && !(request.originalSourceBytes instanceof Uint8Array))) {
    return abstain('INVALID_REQUEST');
  }
  const source = Buffer.from(request.originalSourceBytes);
  const originalSha = crypto.createHash('sha256').update(source).digest('hex');
  if (originalSha !== request.expectedInputSha256) return abstain('SOURCE_IDENTITY_MISMATCH');

  const boundRequest = {
    fileName: request.fileName, originalSourceBytes: source,
    expectedInputSha256: originalSha, baseRevisionId: request.baseRevisionId,
    commands: request.commands, session: request.session,
  };
  const binding = bindReviewTabDraftToStage08(boundRequest);
  if (binding.status !== 'BOUND_FOR_REVALIDATION') return abstain(binding.code);

  let draft;
  let reentry;
  try {
    draft = processReviewTabDraftEdit({
      fileName: request.fileName, bytes: source,
      expectedInputSha256: originalSha, baseRevisionId: request.baseRevisionId,
      commands: request.commands,
    });
    reentry = continueRevalidatedRevisionToTab({
      session: request.session,
      sourceFileName: request.fileName,
      originalSourceBytes: source,
      materializer: createEdtab04PitchMaterializer(),
      approvalMetadata: request.approvalMetadata,
    });
  } catch (error) {
    return abstain(typeof error?.code === 'string' ? error.code : 'REVALIDATION_FAILED');
  }

  if (crypto.createHash('sha256').update(source).digest('hex') !== originalSha) {
    return abstain('SOURCE_MUTATION_DETECTED');
  }
  const parity = verifyEdtab04PositionParity({
    binding, draft, session: request.session, stage08Result: reentry,
  });
  if (parity.status !== 'MATCHED_FOR_REVIEW') return abstain(parity.code);
  return Object.freeze({
    documentType: DOCUMENT_TYPE, contractVersion: CONTRACT_VERSION,
    status: 'MATCHED_FOR_REVIEW', sourceSha256: parity.sourceSha256,
    draftRevisionId: parity.draftRevisionId,
    correctedRevisionId: parity.correctedRevisionId,
    correctedSha256: parity.correctedSha256,
    matchedCount: parity.matchedCount,
    canonicalAuthority: false, export: false,
  });
}

module.exports = { assessEdtab04TeacherRevision };
