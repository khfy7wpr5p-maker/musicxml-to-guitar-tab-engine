'use strict';

const { createGuitarConfiguration } = require('../guitar/tuning');
const { freezeObjectGraph } = require('./freezeObjectGraph');

const REVIEW_TAB_DRAFT_VERSION = '1.0.0';
const REVIEW_TAB_DRAFT_DOCUMENT_TYPE = 'ReviewTabDraft';
const REVIEW_TAB_DRAFT_RENDER_MODEL_VERSION = '1.0.0';
const REVIEW_TAB_DRAFT_RENDER_MODEL_DOCUMENT_TYPE = 'ReviewTabDraftRenderModel';
const REVIEW_TAB_DRAFT_AUTHORITY = 'PROVISIONAL_TEACHER_REVIEW_ONLY';

function normalizedGuitarConfiguration(value) {
  if (!value) return createGuitarConfiguration();
  return createGuitarConfiguration({
    tuning: value.tuning,
    minimumFret: value.minimumFret,
    maximumFret: value.maximumFret,
    capoFret: value.capoFret,
  });
}

function draftDisposition(entry) {
  const fullyKnown = entry.eventKind === 'PITCHED_NOTE'
    && entry.knownPitchOrNull !== null
    && entry.knownOnsetOrNull !== null
    && entry.knownDurationOrNull !== null;
  return fullyKnown ? 'UNASSIGNED' : 'SOURCE_UNKNOWN';
}

function assignmentMap(positionAssignments) {
  if (!Array.isArray(positionAssignments)) return null;
  const result = new Map();
  for (const assignment of positionAssignments) {
    if (
      !assignment
      || typeof assignment.sourceEventId !== 'string'
      || assignment.sourceEventId.length === 0
      || !assignment.selectedPosition
      || !Number.isSafeInteger(assignment.selectedPosition.string)
      || !Number.isSafeInteger(assignment.selectedPosition.fret)
      || result.has(assignment.sourceEventId)
    ) return null;
    result.set(assignment.sourceEventId, Object.freeze({
      string: assignment.selectedPosition.string,
      fret: assignment.selectedPosition.fret,
    }));
  }
  return result;
}

function buildRenderModel(index, dispositions, guitarConfiguration) {
  const sourceById = new Map(index.entries.map((entry) => [entry.sourceEventId, entry]));
  const measureMap = new Map();
  for (const disposition of dispositions) {
    const source = sourceById.get(disposition.sourceEventId);
    if (!source || source.knownOnsetOrNull === null) continue;
    let renderMeasure = measureMap.get(source.measureId);
    if (!renderMeasure) {
      renderMeasure = {
        measureId: source.measureId,
        measure: source.evidenceLocation.measure,
        measureIndex: source.evidenceLocation.measureIndex,
        events: [],
      };
      measureMap.set(source.measureId, renderMeasure);
    }
    const position = disposition.selectedPosition;
    renderMeasure.events.push({
      sourceEventId: source.sourceEventId,
      sourceOrder: source.evidenceLocation.sourceOrder,
      onsetDivisions: source.knownOnsetOrNull,
      durationDivisions: source.knownDurationOrNull,
      pitch: source.knownPitchOrNull,
      voice: source.evidenceLocation.voice,
      staff: source.evidenceLocation.staff,
      displayToken: position ? String(position.fret) : '?',
      string: position?.string ?? null,
      fret: position?.fret ?? null,
    });
  }

  return {
    documentType: REVIEW_TAB_DRAFT_RENDER_MODEL_DOCUMENT_TYPE,
    contractVersion: REVIEW_TAB_DRAFT_RENDER_MODEL_VERSION,
    stringCount: guitarConfiguration.tuning.length,
    strings: guitarConfiguration.tuning.map(({ number, pitch, midi }) => ({ number, pitch, midi })),
    measures: [...measureMap.values()],
  };
}

function createReviewTabDraft({
  sourceReviewIndex,
  sourceScoreArtifact,
  guitarConfiguration = null,
  issues = [],
  positionAssignments = [],
  revisionId = null,
}) {
  if (
    !sourceReviewIndex
    || sourceReviewIndex.documentType !== 'SourceReviewIndex'
    || sourceReviewIndex.contractVersion !== '1.0.0'
    || !sourceScoreArtifact
    || sourceScoreArtifact.sourceUploadSha256 !== sourceReviewIndex.sourceUploadSha256
  ) return null;

  const guitar = normalizedGuitarConfiguration(guitarConfiguration);
  if (!Array.isArray(guitar.tuning) || guitar.tuning.length !== 6) return null;
  const assignments = assignmentMap(positionAssignments);
  if (!assignments) return null;
  const sourceIds = new Set(sourceReviewIndex.entries.map((entry) => entry.sourceEventId));
  if ([...assignments.keys()].some((sourceEventId) => !sourceIds.has(sourceEventId))) return null;

  const dispositions = sourceReviewIndex.entries
    .filter((entry) => entry.eventKind !== 'REST')
    .map((entry) => {
      const baseDisposition = draftDisposition(entry);
      const selectedPosition = assignments.get(entry.sourceEventId) || null;
      if (selectedPosition && baseDisposition !== 'UNASSIGNED') return null;
      return {
        measureId: entry.measureId,
        sourceEventId: entry.sourceEventId,
        disposition: selectedPosition ? 'ASSIGNED' : baseDisposition,
        knownPitchOrNull: entry.knownPitchOrNull,
        knownOnsetOrNull: entry.knownOnsetOrNull,
        knownDurationOrNull: entry.knownDurationOrNull,
        selectedPosition,
        uncertaintyReasonCodes: entry.uncertaintyReasonCodes,
      };
    });
  if (dispositions.some((entry) => entry === null)) return null;

  if (dispositions.length === 0) return null;

  return freezeObjectGraph({
    documentType: REVIEW_TAB_DRAFT_DOCUMENT_TYPE,
    contractVersion: REVIEW_TAB_DRAFT_VERSION,
    authority: REVIEW_TAB_DRAFT_AUTHORITY,
    sourceUploadSha256: sourceReviewIndex.sourceUploadSha256,
    selectedPartId: sourceReviewIndex.selectedPartId,
    revisionId: revisionId || `review:${sourceReviewIndex.sourceUploadSha256}:0`,
    guitarConfiguration: guitar,
    sourceScoreArtifact,
    perNoteDisposition: dispositions,
    issues: [...issues],
    renderModel: buildRenderModel(sourceReviewIndex, dispositions, guitar),
    capabilities: {
      draftVisible: true,
      selectSourceEvent: true,
      assignStringFret: dispositions.some((entry) => entry.disposition === 'UNASSIGNED' || entry.disposition === 'ASSIGNED'),
      export: false,
    },
  });
}

module.exports = {
  REVIEW_TAB_DRAFT_VERSION,
  REVIEW_TAB_DRAFT_DOCUMENT_TYPE,
  REVIEW_TAB_DRAFT_AUTHORITY,
  createReviewTabDraft,
};
