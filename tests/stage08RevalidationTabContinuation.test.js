'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('..');
const {
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
} = require('../src/app/reviewEditorBackend');
const {
  EDIT_CLASS,
  VALIDATION_STATE,
  createOriginalSourceSnapshot,
  createReviewRevision,
  createTeacherCorrectedRevision,
  createRevalidatedRevision,
} = require('../src/app/teacherCorrectionRevision');
const {
  STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
  STAGE08_MATERIALIZER_CONTRACT_VERSION,
  STAGE08_REVALIDATION_TAB_CONTRACT_VERSION,
  STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE,
  STAGE08_STATUS,
  Stage08RevalidationTabError,
  continueRevalidatedRevisionToTab,
} = require('../src/app/stage08RevalidationTabContinuation');

const ORIGINAL = fs.readFileSync(path.join(__dirname, 'fixtures', 'pa12-polyphonic-e2e.musicxml'));

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function correctedPitch(step = 'D', octave = 4) {
  const source = ORIGINAL.toString('utf8');
  const corrected = source.replace(
    '<pitch><step>C</step><octave>4</octave></pitch>',
    `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`,
  );
  assert.notEqual(corrected, source);
  return Buffer.from(corrected, 'utf8');
}

function buildSession({ validationState = VALIDATION_STATE.VALID } = {}) {
  const source = createOriginalSourceSnapshot({
    source_id: 'stage08-source-1',
    byte_length: ORIGINAL.byteLength,
    sha256: sha256(ORIGINAL),
    media_type: 'application/vnd.recordare.musicxml+xml',
    provenance: { producer: 'stage08-test' },
  });
  const review = createReviewRevision(source, {
    revision_id: 'stage08-review-1',
    actor: { id: 'teacher-1' },
    timestamp: '2026-09-04T18:00:00.000Z',
    reason: 'Review OMR pitch evidence.',
    provenance: { stage: 'STAGE_05' },
    review_evidence: {
      status: 'REVIEW_REQUIRED',
      canOpenForReview: true,
      issue_id: 'issue-1',
    },
  });
  const saved = createTeacherCorrectedRevision(review, {
    revision_id: 'stage08-corrected-1',
    actor: { id: 'teacher-1' },
    timestamp: '2026-09-04T18:01:00.000Z',
    reason: 'Correct first written pitch.',
    provenance: { stage: 'STAGE_06' },
    patches: [{
      patch_id: 'patch-pitch-1',
      edit_class: EDIT_CLASS.PITCH_UPDATE,
      target_event: 'event-1-1',
      before: { pitch: 'C4' },
      after: { pitch: 'D4' },
    }],
  });
  const revalidated = createRevalidatedRevision(saved, {
    revision_id: 'stage08-revalidated-1',
    actor: { id: 'validator-1' },
    timestamp: '2026-09-04T18:02:00.000Z',
    reason: 'Trusted editor adapter revalidation.',
    provenance: { stage: 'STAGE_06' },
    validation_state: validationState,
    validation_evidence: { result: validationState },
  });

  return {
    documentType: REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    phase: SESSION_PHASE.REVALIDATED,
    saved_revision: saved,
    revalidated_revision: revalidated,
  };
}

function materializerFor(correctedBytes = correctedPitch()) {
  return {
    manifest: {
      contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
      adapterId: 'trusted-stage08-materializer',
      mediaType: 'application/vnd.recordare.musicxml+xml',
    },
    materialize({ source, savedRevision, revalidatedRevision }) {
      return {
        correctedBytes,
        evidence: {
          documentType: STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
          contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
          adapterId: 'trusted-stage08-materializer',
          sourceId: source.source_id,
          correctedRevisionId: revalidatedRevision.revision_id,
          parentRevisionId: savedRevision.revision_id,
          originalSha256: source.sha256,
          correctedSha256: sha256(correctedBytes),
          correctedByteLength: correctedBytes.byteLength,
          patchIds: revalidatedRevision.patches.map((patch) => patch.patch_id),
          mediaType: 'application/vnd.recordare.musicxml+xml',
        },
      };
    },
  };
}

function approvalMetadata() {
  return {
    revision_id: 'stage08-approved-1',
    actor: { id: 'stage08-engine' },
    timestamp: '2026-09-04T18:03:00.000Z',
    reason: 'Full Stage 08 production chain passed.',
    provenance: { stage: 'STAGE_08_REVALIDATION_AND_TAB' },
  };
}

function request(overrides = {}) {
  return {
    session: buildSession(),
    sourceFileName: 'teacher-corrected.musicxml',
    originalSourceBytes: Buffer.from(ORIGINAL),
    materializer: materializerFor(),
    approvalMetadata: approvalMetadata(),
    ...overrides,
  };
}

test('Stage 08 materializes the exact revalidated revision, re-enters POLY_V2 and approves only after canonical writer success', () => {
  const originalBefore = Buffer.from(ORIGINAL);
  const result = continueRevalidatedRevisionToTab(request());

  assert.equal(result.documentType, STAGE08_REVALIDATION_TAB_DOCUMENT_TYPE);
  assert.equal(result.contractVersion, STAGE08_REVALIDATION_TAB_CONTRACT_VERSION);
  assert.equal(result.status, STAGE08_STATUS.PASS);
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.reentry.status, 'PASS');
  assert.equal(result.reentry.route, 'POLY_V2');
  assert.ok(result.canonicalTabResult);
  assert.ok(['2.0.0', '2.1.0'].includes(result.canonicalTabResult.schemaVersion));
  assert.match(result.musicXml, /<score-partwise\b/);
  assert.equal(result.approvedRevision.state, 'APPROVED_CANONICAL_SCORE');
  assert.equal(result.approvedRevision.parent_revision_id, 'stage08-revalidated-1');
  assert.equal(result.approvalEvidence.reentry_status, 'PASS');
  assert.equal(result.approvalEvidence.route, 'POLY_V2');
  assert.equal(result.approvalEvidence.corrected_sha256, sha256(correctedPitch()));
  assert.deepEqual(ORIGINAL, originalBefore);
  assert.equal(Object.isFrozen(result), true);
});

test('Stage 08 is deterministic for identical source, revision and materialization evidence', () => {
  const first = continueRevalidatedRevisionToTab(request());
  const second = continueRevalidatedRevisionToTab(request());

  assert.equal(first.route, second.route);
  assert.deepEqual(first.canonicalTabResult, second.canonicalTabResult);
  assert.equal(first.musicXml, second.musicXml);
  assert.deepEqual(first.approvalEvidence, second.approvalEvidence);
});

test('non-REVALIDATED sessions cannot continue to TAB', () => {
  const session = buildSession();
  const stalePhase = { ...session, phase: SESSION_PHASE.SAVED };

  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ session: stalePhase })),
    (error) => {
      assert.ok(error instanceof Stage08RevalidationTabError);
      assert.equal(error.code, 'INVALID_SESSION_PHASE');
      return true;
    },
  );
});

test('INVALID revalidation cannot continue to TAB', () => {
  const session = buildSession({ validationState: VALIDATION_STATE.INVALID });

  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ session })),
    (error) => {
      assert.ok(error instanceof Stage08RevalidationTabError);
      assert.equal(error.code, 'INVALID_REVISION_STATE');
      return true;
    },
  );
});

test('stale parent revision identity fails closed', () => {
  const session = buildSession();
  const stale = {
    ...session,
    revalidated_revision: {
      ...session.revalidated_revision,
      parent_revision_id: 'different-saved-revision',
    },
  };

  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ session: stale })),
    (error) => {
      assert.ok(error instanceof Stage08RevalidationTabError);
      assert.equal(error.code, 'STALE_REVISION_IDENTITY');
      return true;
    },
  );
});

test('original source hash or byte mismatch fails closed before materialization', () => {
  const mutated = Buffer.from(ORIGINAL);
  mutated[mutated.length - 1] ^= 1;

  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ originalSourceBytes: mutated })),
    (error) => {
      assert.ok(error instanceof Stage08RevalidationTabError);
      assert.equal(error.code, 'SOURCE_IDENTITY_MISMATCH');
      return true;
    },
  );
});

test('materializer cannot mutate the original-source snapshot supplied by Stage 08', () => {
  const bad = materializerFor();
  const goodMaterialize = bad.materialize;
  bad.materialize = (payload) => {
    payload.originalSourceBytes.fill(0);
    return goodMaterialize(payload);
  };

  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ materializer: bad })),
    (error) => {
      assert.ok(error instanceof Stage08RevalidationTabError);
      assert.equal(error.code, 'SOURCE_MUTATION_DETECTED');
      return true;
    },
  );
});

test('materialization evidence must bind the exact source, revision and patch ledger', () => {
  const bad = materializerFor();
  const goodMaterialize = bad.materialize;
  bad.materialize = (payload) => {
    const result = goodMaterialize(payload);
    return {
      ...result,
      evidence: {
        ...result.evidence,
        patchIds: ['different-patch'],
      },
    };
  };

  assert.throws(
    () => continueRevalidatedRevisionToTab(request({ materializer: bad })),
    (error) => {
      assert.ok(error instanceof Stage08RevalidationTabError);
      assert.equal(error.code, 'PATCH_LEDGER_MISMATCH');
      return true;
    },
  );
});

test('polyphonic corrected score remains on POLY_V2 and cannot silently degrade to MONO_V1', () => {
  const result = continueRevalidatedRevisionToTab(request());
  assert.equal(result.status, STAGE08_STATUS.PASS);
  assert.equal(result.route, 'POLY_V2');
  assert.notEqual(result.route, 'MONO_V1');
});

test('physical or semantic failure after corrected-score re-entry cannot produce canonical TAB or approval', () => {
  const impossible = correctedPitch('C', 9);
  const result = continueRevalidatedRevisionToTab(request({
    materializer: materializerFor(impossible),
  }));

  assert.equal(result.status, STAGE08_STATUS.BLOCKED);
  assert.equal(result.route, 'POLY_V2');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.approvedRevision, null);
});

test('VALID Stage 05/06 state alone is insufficient without a trusted Stage 08 materializer and production re-entry', () => {
  const req = request();
  delete req.materializer;

  assert.throws(
    () => continueRevalidatedRevisionToTab(req),
    (error) => {
      assert.ok(error instanceof Stage08RevalidationTabError);
      assert.equal(error.code, 'MATERIALIZER_MISMATCH');
      return true;
    },
  );
});

test('Stage 08 remains internal and does not widen the package-root API', () => {
  for (const name of [
    'continueRevalidatedRevisionToTab',
    'STAGE08_REVALIDATION_TAB_CONTRACT_VERSION',
    'STAGE08_STATUS',
  ]) {
    assert.equal(publicApi[name], undefined);
  }
});
