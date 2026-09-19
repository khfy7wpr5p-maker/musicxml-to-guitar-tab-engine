(function attachStage09WorkbenchEvidence(global) {
  'use strict';

  const DOCUMENT_TYPE = 'Stage09WorkbenchCorrectionEvidence';
  const CONTRACT_VERSION = '1.0.0';
  const SHA256 = /^[a-f0-9]{64}$/;
  const ALLOWED_COMMAND_TYPES = new Set([
    'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH',
    'SET_POLYPHONIC_SOURCE_EVENT_DURATION',
    'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH_AND_DURATION',
  ]);

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function plainFileName(value) {
    return typeof value === 'string'
      && value.length > 0
      && value.length <= 255
      && !/[\\/\u0000-\u001f\u007f]/.test(value)
      && /\.(?:xml|musicxml)$/i.test(value);
  }

  function allowedEdit(edit) {
    return Boolean(
      edit
      && typeof edit === 'object'
      && ALLOWED_COMMAND_TYPES.has(edit.commandType)
      && Number.isSafeInteger(edit.revisionIndex)
      && edit.revisionIndex >= 0
      && typeof edit.sourceEventId === 'string'
      && edit.sourceEventId.length > 0
      && edit.changed === true
      && !edit.selectedPosition
      && !edit.assignmentMode
      && edit.affectedEventCount === 1
      && Array.isArray(edit.sourceTieEventIds)
      && edit.sourceTieEventIds.length === 1
      && edit.sourceTieEventIds[0] === edit.sourceEventId
    );
  }

  function isStage09WorkbenchEvidenceEligible(runtimeResult) {
    if (!runtimeResult || typeof runtimeResult !== 'object') return false;
    if (runtimeResult.route !== 'POLY_V2') return false;
    if (runtimeResult.status !== 'PASS' && runtimeResult.status !== 'REVIEW_REQUIRED') return false;
    if (!SHA256.test(runtimeResult.input?.sha256 || '')) return false;
    if (typeof runtimeResult.musicXml !== 'string' || runtimeResult.musicXml.length === 0) return false;
    const edits = runtimeResult.revision?.appliedEdits;
    if (!Array.isArray(edits) || edits.length === 0) return false;
    if (!Number.isSafeInteger(runtimeResult.revision?.revisionNumber)) return false;
    if (runtimeResult.revision.revisionNumber !== edits.length) return false;
    return edits.every(allowedEdit);
  }

  function createStage09WorkbenchEvidenceExport({ sourceFileName, runtimeResult }) {
    if (!plainFileName(sourceFileName)) {
      throw new Error('Stage 09 evidence export requires a plain .xml or .musicxml source file name.');
    }
    if (!isStage09WorkbenchEvidenceEligible(runtimeResult)) {
      throw new Error('Current Workbench revision is not eligible for Stage 09 evidence export.');
    }
    return Object.freeze({
      documentType: DOCUMENT_TYPE,
      contractVersion: CONTRACT_VERSION,
      sourceFileName,
      sourceSha256: runtimeResult.input.sha256,
      status: runtimeResult.status,
      route: runtimeResult.route,
      revisionNumber: runtimeResult.revision.revisionNumber,
      appliedEdits: Object.freeze(cloneJson(runtimeResult.revision.appliedEdits)),
      correctedMusicXml: runtimeResult.musicXml,
    });
  }

  global.Stage09WorkbenchEvidence = Object.freeze({
    DOCUMENT_TYPE,
    CONTRACT_VERSION,
    createStage09WorkbenchEvidenceExport,
    isStage09WorkbenchEvidenceEligible,
  });
}(typeof window === 'undefined' ? globalThis : window));
