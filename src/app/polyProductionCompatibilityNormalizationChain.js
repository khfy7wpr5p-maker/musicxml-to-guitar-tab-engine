'use strict';

const { EngineError } = require('../errors/engineError');
const {
  extractPolyphonicGraceOrnaments,
} = require('../parser/polyphonicGraceOrnamentExtractor');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  normalizePolyphonicPerformanceDirections,
} = require('../parser/polyphonicPerformanceDirectionNormalizer');
const {
  normalizeVerifiedGuitarTechniqueProvenance,
} = require('./guitarTechniqueCompatibilityNormalizer');
const {
  tryNormalizeRuntimeGuitarNotation,
} = require('./runtimeGuitarNotationNormalizer');
const {
  normalizeGraceDisplayAccidental,
} = require('./graceDisplayAccidentalNormalizer');

const POLY_PRODUCTION_COMPATIBILITY_NORMALIZATION_CHAIN_VERSION = '1.0.0';

class PolyProductionCompatibilityNormalizationChainError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_POLY_PRODUCTION_COMPATIBILITY_NORMALIZATION',
      Object.freeze({ ...details }),
      'PolyProductionCompatibilityNormalizationChainError',
    );
  }
}

function notationContextFromMarkers(markers, runtimeNotationContext) {
  const markerKeySignatures = markers
    .filter((marker) => marker.kind === 'key')
    .map((marker) => Object.freeze({
      measureIndex: marker.measureIndex,
      fifths: marker.fifths,
      mode: null,
    }));
  return Object.freeze({
    keySignatures: Object.freeze([
      ...markerKeySignatures,
      ...runtimeNotationContext.keySignatures,
    ]),
  });
}

function mergeDirectionFeatureCounts(...records) {
  const merged = new Map();
  for (const record of records) {
    for (const [feature, count] of Object.entries(record || {})) {
      merged.set(feature, (merged.get(feature) || 0) + count);
    }
  }
  return Object.freeze(Object.fromEntries(
    [...merged].sort((left, right) => left[0].localeCompare(right[0])),
  ));
}

function projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
  parsedDocument,
  runtime = null,
) {
  runtime?.checkpoint('poly-production-compatibility:start');

  const techniqueNormalization = normalizeVerifiedGuitarTechniqueProvenance(
    parsedDocument,
  );
  // Performance-only directions must be normalized before the bounded runtime
  // guitar representation pass. Otherwise that earlier representation layer
  // can accidentally block directions that the semantic chain already knows
  // how to classify safely. Unknown, structural, and pitch-affecting directions
  // remain in the document and therefore continue to fail closed downstream.
  const performanceNormalization = normalizePolyphonicPerformanceDirections(
    techniqueNormalization.parsedDocument,
    runtime,
  );
  const runtimeNormalization = tryNormalizeRuntimeGuitarNotation(
    performanceNormalization.parsedDocument,
  );
  const representationDocument = runtimeNormalization
    ? runtimeNormalization.parsedDocument
    : performanceNormalization.parsedDocument;
  const graceAccidentalNormalization = normalizeGraceDisplayAccidental(
    representationDocument,
  );
  // This extractor is the existing composite semantic chain: presentation and
  // directions -> notation context -> staccato -> exact 3:2 triplets -> grace.
  const semanticNormalization = extractPolyphonicGraceOrnaments(
    graceAccidentalNormalization.parsedDocument,
    runtime,
  );
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    semanticNormalization.parsedMainDocument,
    runtime,
  );
  const reconciledNoteElementCount = sourceModel.eventCount
    + semanticNormalization.extractedGraceEventCount;
  if (reconciledNoteElementCount !== semanticNormalization.originalNoteElementCount) {
    throw new PolyProductionCompatibilityNormalizationChainError(
      'Compatibility normalization failed musical-material accounting reconciliation.',
      {
        originalNoteElementCount: semanticNormalization.originalNoteElementCount,
        mainProjectedEventCount: sourceModel.eventCount,
        extractedGraceEventCount: semanticNormalization.extractedGraceEventCount,
        reconciledNoteElementCount,
      },
    );
  }

  const ignoredFeatures = Object.freeze([...new Set([
    ...performanceNormalization.ignoredFeatures,
    ...semanticNormalization.ignoredFeatures,
    ...(semanticNormalization.staccatoMarkers.length > 0
      ? ['notation:articulation:staccato']
      : []),
    ...techniqueNormalization.ignoredFeatures,
    ...(runtimeNormalization?.ignoredFeatures || []),
    ...graceAccidentalNormalization.ignoredFeatures,
  ])].sort());
  const pitchOctaveShift = runtimeNormalization?.pitchOctaveShift || 0;
  const runtimeNotationContext = runtimeNormalization?.notationContext
    || Object.freeze({ keySignatures: Object.freeze([]) });
  const notationContext = notationContextFromMarkers(
    semanticNormalization.notationContextMarkers,
    runtimeNotationContext,
  );
  const ignoredDirectionCount = performanceNormalization.ignoredDirectionCount
    + semanticNormalization.ignoredDirectionCount;
  const ignoredDirectionFeatureCounts = mergeDirectionFeatureCounts(
    performanceNormalization.ignoredDirectionFeatureCounts,
    semanticNormalization.ignoredDirectionFeatureCounts,
  );

  runtime?.checkpoint('poly-production-compatibility:complete', {
    eventCount: sourceModel.eventCount,
    extractedGraceEventCount: semanticNormalization.extractedGraceEventCount,
    ignoredFeatureCount: ignoredFeatures.length,
    ignoredDirectionCount,
    guitarTechniqueProvenanceRecordCount: techniqueNormalization.guitarTechniqueProvenance.recordCount,
  });

  return Object.freeze({
    contractVersion: POLY_PRODUCTION_COMPATIBILITY_NORMALIZATION_CHAIN_VERSION,
    sourceModel,
    mainSourceModel: sourceModel,
    parsedMainDocument: semanticNormalization.parsedMainDocument,
    guitarTechniqueProvenance: techniqueNormalization.guitarTechniqueProvenance,
    graceOrnamentGroups: semanticNormalization.graceOrnamentGroups,
    extractedFeatures: semanticNormalization.extractedFeatures,
    musicalMaterialAccounting: Object.freeze({
      originalNoteElementCount: semanticNormalization.originalNoteElementCount,
      mainProjectedEventCount: sourceModel.eventCount,
      extractedGraceEventCount: semanticNormalization.extractedGraceEventCount,
      reconciledNoteElementCount,
      reconciled: true,
    }),
    ignoredFeatures,
    pitchOctaveShift,
    notationContext,
    performanceTimingCaveats: semanticNormalization.performanceTimingCaveats,
    ignoredDirectionCount,
    ignoredDirectionFeatureCounts,
    octaveShiftMarkers: semanticNormalization.octaveShiftMarkers,
    notationContextMarkers: semanticNormalization.notationContextMarkers,
    timeSignatureDisplayMarkers: semanticNormalization.timeSignatureDisplayMarkers,
    fermataMarkers: semanticNormalization.fermataMarkers,
    staccatoMarkers: semanticNormalization.staccatoMarkers,
    tripletTimeModificationMarkers: semanticNormalization.tripletTimeModificationMarkers,
    tripletDisplayMarkers: semanticNormalization.tripletDisplayMarkers,
  });
}

module.exports = {
  POLY_PRODUCTION_COMPATIBILITY_NORMALIZATION_CHAIN_VERSION,
  PolyProductionCompatibilityNormalizationChainError,
  projectParsedMusicXmlThroughPolyProductionCompatibilityChain,
};
