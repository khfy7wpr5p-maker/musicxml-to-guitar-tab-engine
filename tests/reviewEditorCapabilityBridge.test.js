'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
  REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE,
  SESSION_PHASE,
  selectReviewEditorIssue,
} = require('../src/app/reviewEditorBackend');
const {
  EDIT_CLASS,
  REVISION_STATE,
  VALIDATION_STATE,
} = require('../src/app/teacherCorrectionRevision');
const {
  buildReviewEditorCapabilityState,
} = require('../src/app/reviewEditorCapabilityState');
const {
  REVIEW_EDITOR_CAPABILITY_BRIDGE_VERSION,
  createReviewEditorCapabilitySession,
} = require('../src/app/reviewEditorCapabilityBridge');
const {
  createReviewEditorUiModel,
} = require('../src/app/reviewEditorUiModel');

function manifest() {
  return {
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    adapterId: 'editor-core-capability-test',
    capabilities: Object.fromEntries(
      Object.values(EDIT_CLASS).map((editClass) => [
        editClass,
        editClass === EDIT_CLASS.PITCH_UPDATE
          ? CAPABILITY_STATUS.AVAILABLE
          : CAPABILITY_STATUS.UNAVAILABLE,
      ]),
    ),
    history: { undo: true, redo: true },
    revalidate: true,
  };
}

function reviewResult(bytes, overrides = {}) {
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  return {
    documentType: 'MusicXmlUploadRuntimeResult',
    contractVersion: '1.0.0',
    resultSchemaVersion: '1.2.0',
    capabilityContractVersion: '1.0.0',
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    input: {
      fileName: 'teacher-score.musicxml',
      byteLength: bytes.length,
      sha256,
    },
    scoreAvailable: true,
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    capabilities: {
      renderScore: true,
      generateTab: true,
      editPitch: false,
      editRhythm: false,
      editVoice: false,
      editStructure: false,
      playback: 'APPROXIMATE',
      export: false,
    },
    artifacts: {
      provisionalTabAvailable: true,
      canonicalTabAvailable: false,
    },
    issues: [{
      issueId: 'issue_pitch_7',
      severity: 'error',
      category: 'semantic',
      code: 'OMR_SUSPECTED_PITCH',
      message: 'Pitch requires teacher review.',
      teacherActionRequired: true,
      allowedActions: ['ACCEPT_AS_IS', 'EDIT_MANUALLY'],
      location: {
        measure: 4,
        measureIndex: 3,
        eventIndex: 2,
        sourceEventId: 'event-7',
      },
      reviewEvidence: {
        staff: 1,
        voice: 2,
        suggested_review_action: 'Confirm the written pitch.',
      },
    }],
    ...overrides,
  };
}

function metadata() {
  return {
    revision_id: 'review-revision-1',
    actor: { kind: 'TEACHER', id: 'teacher-local' },
    timestamp: '2026-09-08T17:30:00.000Z',
    reason: 'Open capability-driven teacher review session.',
    provenance: { source: 'GUITAR_TAB_WORKBENCH' },
  };
}

test('capability REVIEW_REQUIRED result becomes a Stage 06-compatible teacher editor session without OMR-only document typing', () => {
  const bytes = Buffer.from('<score-partwise version="4.0"><part-list/></score-partwise>', 'utf8');
  const result = reviewResult(bytes);
  const session = createReviewEditorCapabilitySession({
    sessionId: 'review-session-1',
    uploadResult: result,
    sourceBytes: bytes,
    reviewMetadata: metadata(),
    adapterManifest: manifest(),
    adapterState: { documentId: 'editor-document-1', revisionId: 'editor-revision-1' },
  });

  assert.equal(session.documentType, REVIEW_EDITOR_BACKEND_DOCUMENT_TYPE);
  assert.equal(session.contractVersion, REVIEW_EDITOR_BACKEND_CONTRACT_VERSION);
  assert.equal(session.phase, SESSION_PHASE.EDITING);
  assert.equal(session.review_revision.state, REVISION_STATE.REVIEW_REVISION);
  assert.equal(session.review_revision.validation_state, VALIDATION_STATE.REVIEW_REQUIRED);
  assert.equal(session.review_revision.review_evidence.documentType, 'ReviewEditorCapabilityScoreState');
  assert.equal(session.review_revision.review_evidence.status, 'REVIEW_REQUIRED');
  assert.equal(session.review_revision.original_source.sha256, result.input.sha256);
  assert.equal(session.review_revision.original_source.byte_length, bytes.length);
  assert.equal(session.review_revision.original_source.provenance.capabilityBridgeVersion, REVIEW_EDITOR_CAPABILITY_BRIDGE_VERSION);

  const selected = selectReviewEditorIssue(session, 'issue_pitch_7');
  assert.equal(selected.selected_issue_id, 'issue_pitch_7');
  assert.equal(selected.selected_target, 'event-7');

  const model = createReviewEditorUiModel({ status: 'REVIEW_REQUIRED', session: selected });
  assert.equal(model.documentStatus, 'REVIEW_REQUIRED');
  assert.equal(model.score.canOpen, true);
  assert.equal(model.score.locked, false);
  assert.equal(model.issues[0].issueId, 'issue_pitch_7');
  assert.equal(model.controls.pitch.enabled, true);
  assert.equal(model.actions.continueToTab, false);
});

test('capability editor state is deterministic and carries only manual teacher-review issues', () => {
  const bytes = Buffer.from('<score-partwise/>', 'utf8');
  const warning = {
    issueId: 'warning-layout',
    severity: 'warning',
    category: 'representation',
    code: 'DISPLAY_WARNING',
    message: 'Display-only warning.',
    teacherActionRequired: false,
    allowedActions: [],
    location: { measure: 1, measureIndex: 0, eventIndex: null, sourceEventId: null },
  };
  const input = reviewResult(bytes, { issues: [...reviewResult(bytes).issues, warning] });
  const first = buildReviewEditorCapabilityState(input);
  const second = buildReviewEditorCapabilityState(input);

  assert.deepEqual(first, second);
  assert.equal(first.issues.length, 1);
  assert.equal(first.issues[0].reviewEvidence.issue_id, 'issue_pitch_7');
  assert.equal(first.issues[0].reviewDisposition, 'REVIEW_REQUIRED');
});

test('capability editor bridge refuses review authority that the backend did not grant', () => {
  const bytes = Buffer.from('<score-partwise/>', 'utf8');
  const result = reviewResult(bytes);

  assert.throws(
    () => buildReviewEditorCapabilityState({
      ...result,
      capabilities: { ...result.capabilities, renderScore: false },
    }),
    /backend-authorized score rendering/,
  );

  assert.throws(
    () => buildReviewEditorCapabilityState({
      ...result,
      issues: [{ ...result.issues[0], allowedActions: ['ACCEPT_AS_IS'] }],
    }),
    /EDIT_MANUALLY/,
  );

  assert.throws(
    () => createReviewEditorCapabilitySession({
      sessionId: 'review-session-2',
      uploadResult: result,
      sourceBytes: Buffer.from('different bytes', 'utf8'),
      reviewMetadata: metadata(),
      adapterManifest: manifest(),
      adapterState: {},
    }),
    /authoritative upload SHA-256/,
  );
});
