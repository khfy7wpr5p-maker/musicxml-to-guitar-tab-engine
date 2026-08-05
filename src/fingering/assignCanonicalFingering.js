'use strict';

const {
  createFingeringCostProfile,
} = require('./costModel');
const { optimizeFingering } = require('./fingeringOptimizer');
const { buildCandidateLayers } = require('./candidateLayerBuilder');

const CANONICAL_FINGERING_RESULT_VERSION = '1.0.0';

class CanonicalFingeringPipelineError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CanonicalFingeringPipelineError';
    this.code = code;
    this.details = details;
  }
}

function invalidPipelineOptions(message, details = {}) {
  return new CanonicalFingeringPipelineError(
    message,
    'INVALID_FINGERING_PIPELINE_OPTIONS',
    details,
  );
}

function inconsistentFretRange(details = {}) {
  return new CanonicalFingeringPipelineError(
    'The guitar and fingering cost profiles must use the same maximum fret.',
    'INCONSISTENT_FRET_RANGE',
    details,
  );
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function clonePlainData(value) {
  if (Array.isArray(value)) {
    return Array.from(value, clonePlainData);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, clonePlainData(nested)]),
    );
  }
  return value;
}

function normalizePipelineOptions(options) {
  if (!isObject(options)) {
    throw invalidPipelineOptions('options must be an object.');
  }
  const allowedFields = new Set(['guitar', 'costProfile']);
  for (const field of Object.keys(options)) {
    if (!allowedFields.has(field)) {
      throw invalidPipelineOptions('options contains an unknown field.', { field });
    }
  }
  if (Object.hasOwn(options, 'guitar') && !isObject(options.guitar)) {
    throw invalidPipelineOptions('options.guitar must be an object.');
  }
  if (Object.hasOwn(options, 'costProfile') && !isObject(options.costProfile)) {
    throw invalidPipelineOptions('options.costProfile must be an object.');
  }
  return {
    guitar: options.guitar || {},
    costProfile: options.costProfile || {},
  };
}

function createCompatibleCostProfile(costProfile, maximumFret) {
  if (
    Object.hasOwn(costProfile, 'maximumFret')
    && costProfile.maximumFret !== maximumFret
  ) {
    throw inconsistentFretRange({
      guitarMaximumFret: maximumFret,
      costProfileMaximumFret: costProfile.maximumFret,
    });
  }
  return createFingeringCostProfile({
    ...costProfile,
    maximumFret,
  });
}

function createAssignment(note, position, cost) {
  return {
    eventId: note.eventId,
    eventIndex: note.eventIndex,
    measureKey: note.measureKey,
    measureIndex: note.measureIndex,
    visibleMeasureNumber: note.visibleMeasureNumber,
    voice: note.voice,
    staff: note.staff,
    midi: note.midi,
    writtenPitch: note.writtenPitch,
    start: clonePlainData(note.start),
    rhythm: clonePlainData(note.rhythm),
    sourceLocation: clonePlainData(note.sourceLocation),
    selectedPosition: {
      string: position.string,
      fret: position.fret,
    },
    fingeringCost: clonePlainData(cost),
  };
}

function assignCanonicalFingering(canonicalDocument, options = {}) {
  const normalizedOptions = normalizePipelineOptions(options);
  const candidates = buildCandidateLayers(canonicalDocument, normalizedOptions.guitar);
  const costProfile = createCompatibleCostProfile(
    normalizedOptions.costProfile,
    candidates.guitarConfiguration.maximumFret,
  );

  let optimized;
  if (candidates.noteCount === 0) {
    optimized = {
      totalCost: 0,
      positions: [],
      costs: [],
    };
  } else {
    optimized = optimizeFingering(candidates.candidateLayers, { costProfile });
  }

  const assignments = candidates.notes.map((note, index) => createAssignment(
    note,
    optimized.positions[index],
    optimized.costs[index],
  ));

  return deepFreeze({
    documentType: 'CanonicalFingeringResult',
    contractVersion: CANONICAL_FINGERING_RESULT_VERSION,
    sourceDocument: canonicalDocument,
    sourceDocumentType: canonicalDocument.documentType,
    sourceContractVersion: canonicalDocument.contractVersion,
    partId: canonicalDocument.partId,
    measureCount: canonicalDocument.measureCount,
    noteCount: candidates.noteCount,
    guitarConfiguration: clonePlainData(candidates.guitarConfiguration),
    costProfile: clonePlainData(costProfile),
    totalCost: optimized.totalCost,
    assignments,
  });
}

module.exports = {
  CANONICAL_FINGERING_RESULT_VERSION,
  CanonicalFingeringPipelineError,
  assignCanonicalFingering,
};
