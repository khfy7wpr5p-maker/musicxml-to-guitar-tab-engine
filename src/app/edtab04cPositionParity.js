'use strict';

const DOCUMENT_TYPE = 'Edtab04PositionParityEvidence';
const CONTRACT_VERSION = '1.0.0';

function abstain(code) {
  return Object.freeze({
    documentType: DOCUMENT_TYPE, contractVersion: CONTRACT_VERSION,
    status: 'ABSTAIN', code, canonicalAuthority: false, export: false,
  });
}

function samePitch(left, right) {
  return left && right && left.step === right.step && left.alter === right.alter
    && left.octave === right.octave && left.midi === right.midi;
}

function sameGuitar(left, right) {
  return left && right && left.minimumFret === right.minimumFret
    && left.maximumFret === right.maximumFret
    && (left.capoFret ?? 0) === (right.capoFret ?? 0)
    && Array.isArray(left.tuning) && Array.isArray(right.tuning)
    && left.tuning.length === 6 && right.tuning.length === 6
    && left.tuning.every((string, index) => string.number === right.tuning[index].number
      && string.midi === right.tuning[index].midi && string.pitch === right.tuning[index].pitch);
}

// Evidence only: callers must reproduce the draft and Stage 08 execution from
// immutable bytes. This verifier cannot grant approval or export authority.
function verifyEdtab04PositionParity({ binding, draft, session, stage08Result }) {
  if (binding?.status !== 'BOUND_FOR_REVALIDATION'
    || binding.canonicalAuthority !== false || binding.export !== false
    || draft?.status !== 'REVIEW_REQUIRED'
    || draft.input?.sha256 !== binding.sourceSha256
    || draft.revision?.revisionId !== binding.draftRevisionId
    || draft.revision?.baseRevisionId !== binding.baseRevisionId
    || session?.revalidated_revision?.revision_id !== binding.correctedRevisionId) {
    return abstain('DRAFT_IDENTITY_MISMATCH');
  }

  const edits = draft.revision.appliedEdits;
  const patches = session.revalidated_revision.patches;
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 128
    || !Array.isArray(patches) || patches.length === 0 || patches.length > 256
    || edits.some((edit) => edit.commandType !== 'SET_REVIEW_TAB_DRAFT_POSITION')
    || patches.some((patch) => patch.edit_class !== 'PITCH_UPDATE'
      || edits.some((edit) => edit.sourceEventId === patch.target_event))) {
    return abstain('UNPROVEN_POSITION_SOURCE');
  }

  const evidence = stage08Result?.approvalEvidence;
  const canonical = stage08Result?.canonicalTabResult;
  if (stage08Result?.status !== 'PASS' || stage08Result.route !== 'POLY_V2'
    || stage08Result.reentry?.status !== 'PASS'
    || stage08Result.reentry.route !== 'POLY_V2'
    || stage08Result.sourceIdentity?.sha256 !== binding.sourceSha256
    || stage08Result.sourceIdentity?.correctedSha256 !== evidence?.corrected_sha256
    || evidence?.source_id !== session.revalidated_revision.original_source?.source_id
    || evidence?.revalidated_revision_id !== binding.correctedRevisionId
    || evidence?.reentry_status !== 'PASS' || evidence?.route !== 'POLY_V2'
    || canonical?.documentType !== 'CanonicalTabResult'
    || !String(canonical.schemaVersion).startsWith('2.')
    || !Array.isArray(canonical.measures)
    || !Array.isArray(canonical.noteDispositions)
    || typeof stage08Result.musicXml !== 'string' || stage08Result.musicXml.length === 0) {
    return abstain('STAGE08_PASS_NOT_PROVEN');
  }
  if (!sameGuitar(draft.reviewTabDraft?.guitarConfiguration, canonical.guitar)) {
    return abstain('GUITAR_CONFIGURATION_MISMATCH');
  }

  const sourceEntries = draft.sourceReviewIndex?.entries;
  if (!Array.isArray(sourceEntries) || sourceEntries.length > 50000) {
    return abstain('SOURCE_INDEX_MISSING');
  }
  const sourceIds = new Set();
  for (const edit of edits) {
    const id = edit.sourceEventId;
    if (typeof id !== 'string' || sourceIds.has(id)
      || !Number.isSafeInteger(edit.selectedPosition?.string)
      || !Number.isSafeInteger(edit.selectedPosition?.fret)) {
      return abstain('DUPLICATE_OR_INVALID_POSITION');
    }
    sourceIds.add(id);
    const source = sourceEntries.filter((entry) => entry.sourceEventId === id);
    const notes = canonical.measures.flatMap((measure) => measure.events)
      .filter((event) => event.sourceEventId === id);
    const dispositions = canonical.noteDispositions.filter((entry) => entry.sourceEventId === id);
    if (source.length !== 1 || notes.length !== 1 || dispositions.length !== 1) {
      return abstain('SOURCE_EVENT_IDENTITY_MISMATCH');
    }
    const original = source[0];
    const note = notes[0];
    const disposition = dispositions[0];
    if (original.eventKind !== 'PITCHED_NOTE'
      || original.sourceUploadSha256 !== binding.sourceSha256
      || original.selectedPartId !== canonical.source?.partId
      || note.type !== 'note'
      || note.source?.partId !== original.selectedPartId
      || note.source.measureIndex !== original.evidenceLocation?.measureIndex
      || note.source.noteIndex !== original.evidenceLocation.sourceOrder
      || note.voice !== original.evidenceLocation.voice
      || note.staff !== original.evidenceLocation.staff
      || note.onsetDivisions !== original.knownOnsetOrNull
      || note.durationDivisions !== original.knownDurationOrNull
      || !samePitch(note.pitch, original.knownPitchOrNull)
      || disposition.disposition !== 'KEEP'
      || disposition.octaveShiftSemitones !== 0
      || !samePitch(disposition.targetPitch, original.knownPitchOrNull)
      || disposition.selectedPosition?.string !== edit.selectedPosition.string
      || disposition.selectedPosition?.fret !== edit.selectedPosition.fret) {
      return abstain('TEACHER_POSITION_NOT_IN_CANONICAL');
    }
  }
  return Object.freeze({
    documentType: DOCUMENT_TYPE, contractVersion: CONTRACT_VERSION,
    status: 'MATCHED_FOR_REVIEW', sourceSha256: binding.sourceSha256,
    draftRevisionId: binding.draftRevisionId,
    correctedRevisionId: binding.correctedRevisionId,
    correctedSha256: evidence.corrected_sha256,
    matchedCount: sourceIds.size, canonicalAuthority: false, export: false,
  });
}

module.exports = { verifyEdtab04PositionParity };
