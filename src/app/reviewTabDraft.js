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
    renderMeasure.events.push({
      sourceEventId: source.sourceEventId,
      onsetDivisions: source.knownOnsetOrNull,
      displayToken: '?',
      string: null,
      fret: null,
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

  const dispositions = sourceReviewIndex.entries
    .filter((entry) => entry.eventKind !== 'REST')
    .map((entry) => ({
      measureId: entry.measureId,
      sourceEventId: entry.sourceEventId,
      disposition: draftDisposition(entry),
      knownPitchOrNull: entry.knownPitchOrNull,
      knownOnsetOrNull: entry.knownOnsetOrNull,
      knownDurationOrNull: entry.knownDurationOrNull,
      selectedPosition: null,
      uncertaintyReasonCodes: entry.uncertaintyReasonCodes,
    }));

  if (dispositions.length === 0) return null;

  return freezeObjectGraph({
    documentType: REVIEW_TAB_DRAFT_DOCUMENT_TYPE,
    contractVersion: REVIEW_TAB_DRAFT_VERSION,
    authority: REVIEW_TAB_DRAFT_AUTHORITY,
    sourceUploadSha256: sourceReviewIndex.sourceUploadSha256,
    selectedPartId: sourceReviewIndex.selectedPartId,
    revisionId: `review:${sourceReviewIndex.sourceUploadSha256}:0`,
    guitarConfiguration: guitar,
    sourceScoreArtifact,
    perNoteDisposition: dispositions,
    issues: [...issues],
    renderModel: buildRenderModel(sourceReviewIndex, dispositions, guitar),
    capabilities: {
      draftVisible: true,
      selectSourceEvent: true,
      assignStringFret: false,
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
