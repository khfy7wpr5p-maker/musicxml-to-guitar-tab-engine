'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
} = require('./reviewEditorBackend');
const { EDIT_CLASS, VALIDATION_STATE } = require('./teacherCorrectionRevision');
const { materializeStage09WorkbenchPitchCorrections } =
  require('./stage09WorkbenchSourceCorrectionMaterializer');
const { processMusicXmlUpload } = require('./musicXmlUploadRuntime');
const { DEFAULT_MAX_XML_BYTES } = require('../validation/xmlSafety');

const EVENT_ID = /^(.+):measure:(0|[1-9]\d*):note:(0|[1-9]\d*)$/;
const MAX_PATCHES = 256;

function exactPitch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)
    || Object.keys(value).sort((left, right) => left.localeCompare(right)).join(',') !== 'alter,octave,step'
    || !/^[A-G]$/.test(value.step)
    || !Number.isSafeInteger(value.alter) || value.alter < -2 || value.alter > 2
    || !Number.isSafeInteger(value.octave) || value.octave < -1 || value.octave > 9) {
    throw new TypeError('Only exact written MusicXML pitch values are supported.');
  }
  return { step: value.step, alter: value.alter, octave: value.octave };
}

function toEdit(patch) {
  if (!patch || patch.edit_class !== EDIT_CLASS.PITCH_UPDATE
    || typeof patch.target_event !== 'string') {
    throw new TypeError('Only source-bound PITCH_UPDATE is supported.');
  }
  const match = EVENT_ID.exec(patch.target_event);
  if (!match || !Number.isSafeInteger(Number(match[2]))
    || !Number.isSafeInteger(Number(match[3]))) {
    throw new TypeError('A stable source note identity is required.');
  }
  return {
    commandType: 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH',
    affectedEventCount: 1,
    sourceEventId: patch.target_event,
    measureIndex: Number(match[2]),
    sourceOrder: Number(match[3]),
    beforePitch: exactPitch(patch.before),
    afterPitch: exactPitch(patch.after),
    selectedPosition: null,
    assignmentMode: null,
  };
}

function ledger(state) {
  if (!state || typeof state !== 'object' || isProxy(state)
    || !Array.isArray(state.patches) || isProxy(state.patches)
    || state.patches.length > MAX_PATCHES) {
    throw new TypeError('Trusted editor state is invalid.');
  }
  return state.patches;
}

function patchIdentity(patch) {
  return JSON.stringify({
    patch_id: patch.patch_id,
    edit_class: patch.edit_class,
    target_event: patch.target_event,
    before: exactPitch(patch.before),
    after: exactPitch(patch.after),
  });
}

function createEdtab04dTrustedPitchAdapter({ fileName, sourceBytes }) {
  if (typeof fileName !== 'string' || !fileName.toLowerCase().endsWith('.musicxml')
    || (!Buffer.isBuffer(sourceBytes) && !(sourceBytes instanceof Uint8Array))
    || isProxy(sourceBytes) || sourceBytes.byteLength > DEFAULT_MAX_XML_BYTES) {
    throw new TypeError('A bounded MusicXML source must be retained by the server.');
  }
  const source = Buffer.from(sourceBytes);
  const originalSha256 = crypto.createHash('sha256').update(source).digest('hex');
  const manifest = Object.freeze({
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    adapterId: 'edtab-04d-trusted-pitch-v1',
    capabilities: Object.freeze(Object.fromEntries(Object.values(EDIT_CLASS).map((editClass) => [
      editClass,
      editClass === EDIT_CLASS.PITCH_UPDATE
        ? CAPABILITY_STATUS.BOUNDED : CAPABILITY_STATUS.UNAVAILABLE,
    ]))),
    history: Object.freeze({ undo: false, redo: false }),
    revalidate: true,
  });

  function materialize(patches) {
    const ids = new Set();
    const targets = new Set();
    const edits = patches.map((patch) => {
      if (ids.has(patch.patch_id) || targets.has(patch.target_event)) {
        throw new TypeError('Duplicate patch or source note in correction ledger.');
      }
      ids.add(patch.patch_id);
      targets.add(patch.target_event);
      return toEdit(patch);
    });
    return materializeStage09WorkbenchPitchCorrections(source, edits).correctedBytes;
  }

  return Object.freeze({
    manifest,
    initialState: Object.freeze({ originalSha256, patches: Object.freeze([]) }),
    applyPatch({ adapterState, patch, selectedTarget }) {
      const previous = ledger(adapterState);
      if (adapterState.originalSha256 !== originalSha256 || previous.length >= MAX_PATCHES
        || selectedTarget !== patch.target_event) {
        throw new TypeError('Teacher correction source or selection drifted.');
      }
      const next = [...previous, patch];
      const correctedBytes = materialize(next);
      return {
        adapterState: { originalSha256, patches: next },
        evidence: {
          originalSha256,
          correctedSha256: crypto.createHash('sha256').update(correctedBytes).digest('hex'),
          patchId: patch.patch_id,
        },
      };
    },
    revalidate({ adapterState, savedRevision }) {
      const patches = ledger(adapterState);
      if (adapterState.originalSha256 !== originalSha256 || patches.length === 0
        || !Array.isArray(savedRevision?.patches)
        || savedRevision.patches.length !== patches.length
        || savedRevision.patches.some((patch, index) =>
          patchIdentity(patch) !== patchIdentity(patches[index]))) {
        throw new TypeError('Saved revision and trusted editor ledger disagree.');
      }
      const correctedBytes = materialize(patches);
      const result = processMusicXmlUpload({ fileName, bytes: correctedBytes });
      const validationState = result.status === 'PASS'
        ? VALIDATION_STATE.VALID : VALIDATION_STATE.INVALID;
      return {
        adapterState,
        validationState,
        validationEvidence: {
          originalSha256,
          correctedSha256: crypto.createHash('sha256').update(correctedBytes).digest('hex'),
          uploadStatus: result.status,
          patchIds: patches.map((patch) => patch.patch_id),
        },
      };
    },
  });
}

module.exports = { createEdtab04dTrustedPitchAdapter };
