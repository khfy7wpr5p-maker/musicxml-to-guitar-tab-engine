'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EDIT_CLASS } = require('./teacherCorrectionRevision');
const {
  STAGE08_MATERIALIZER_CONTRACT_VERSION,
  STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
} = require('./stage08RevalidationTabContinuation');
const {
  materializeStage09WorkbenchPitchCorrections,
} = require('./stage09WorkbenchSourceCorrectionMaterializer');

const ADAPTER_ID = 'edtab-04-pitch-materializer-v1';
const MEDIA_TYPE = 'application/vnd.recordare.musicxml+xml';
const EVENT_ID = /^(.+):measure:(0|[1-9]\d*):note:(0|[1-9]\d*)$/;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function exactPitch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'alter,octave,step') return null;
  if (!/^[A-G]$/.test(value.step)
    || !Number.isSafeInteger(value.alter) || value.alter < -2 || value.alter > 2
    || !Number.isSafeInteger(value.octave) || value.octave < -1 || value.octave > 9) return null;
  return { step: value.step, alter: value.alter, octave: value.octave };
}

function exactAppliedEdit(patch) {
  if (!patch || patch.edit_class !== EDIT_CLASS.PITCH_UPDATE
    || typeof patch.target_event !== 'string') {
    throw new TypeError('EDTAB-04 pitch materialization requires an exact PITCH_UPDATE source event.');
  }
  const match = EVENT_ID.exec(patch.target_event);
  const beforePitch = exactPitch(patch.before);
  const afterPitch = exactPitch(patch.after);
  if (!match || !beforePitch || !afterPitch) {
    throw new TypeError('EDTAB-04 pitch patch must identify a source note and exact before/after pitch.');
  }
  const measureIndex = Number(match[2]);
  const sourceOrder = Number(match[3]);
  if (!Number.isSafeInteger(measureIndex) || !Number.isSafeInteger(sourceOrder)) {
    throw new TypeError('EDTAB-04 source event indices must be safe integers.');
  }
  return {
    commandType: 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH',
    affectedEventCount: 1,
    sourceEventId: patch.target_event,
    measureIndex,
    sourceOrder,
    beforePitch,
    afterPitch,
    selectedPosition: null,
    assignmentMode: null,
  };
}

function createEdtab04PitchMaterializer() {
  return {
    manifest: {
      contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
      adapterId: ADAPTER_ID,
      mediaType: MEDIA_TYPE,
    },
    materialize({ originalSourceBytes, source, savedRevision, revalidatedRevision }) {
      const patches = revalidatedRevision?.patches;
      if (!Array.isArray(patches) || isProxy(patches) || patches.length === 0 || patches.length > 256
        || JSON.stringify(patches) !== JSON.stringify(savedRevision?.patches)) {
        throw new TypeError('EDTAB-04 requires the exact bounded saved and revalidated patch ledger.');
      }
      const appliedEdits = patches.map(exactAppliedEdit);
      const { correctedBytes } = materializeStage09WorkbenchPitchCorrections(
        originalSourceBytes,
        appliedEdits,
      );
      return {
        correctedBytes,
        evidence: {
          documentType: STAGE08_MATERIALIZATION_EVIDENCE_DOCUMENT_TYPE,
          contractVersion: STAGE08_MATERIALIZER_CONTRACT_VERSION,
          adapterId: ADAPTER_ID,
          sourceId: source.source_id,
          correctedRevisionId: revalidatedRevision.revision_id,
          parentRevisionId: savedRevision.revision_id,
          originalSha256: source.sha256,
          correctedSha256: sha256(correctedBytes),
          correctedByteLength: correctedBytes.byteLength,
          patchIds: patches.map((patch) => patch.patch_id),
          mediaType: MEDIA_TYPE,
        },
      };
    },
  };
}

module.exports = { createEdtab04PitchMaterializer };
