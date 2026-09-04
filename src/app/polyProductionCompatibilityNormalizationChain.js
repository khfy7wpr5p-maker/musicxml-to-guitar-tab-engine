'use strict';

const { EngineError } = require('../errors/engineError');
const {
  extractPolyphonicGraceOrnaments,
} = require('../parser/polyphonicGraceOrnamentExtractor');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  normalizeDeferredPolyphonicPerformanceDirections,
} = require('../parser/polyphonicPerformanceDirectionNormalizer');
const {
  normalizePolyphonicRepeatBarlines,
} = require('../parser/polyphonicRepeatBarlineNormalizer');
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

function notationContextFromMarkers(markers, runtimeNotationContext, repeatNormalization) {
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
    measureOccurrencePlan: repeatNormalization.measureOccurrencePlan,
    repeatBarlines: repeatNormalization.repeatBarlines,
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
  // Only exact performance directions that the runtime profile cannot handle
  // are deferred before the bounded runtime guitar representation pass.
  // Runtime-owned metronome/dynamics validation, offsets, unknown, structural,
  // and pitch-affecting directions remain in place and continue to fail closed.
  const performanceNormalization = normalizeDeferredPolyphonicPerformanceDirections(
    techniqueNormalization.parsedDocument,
    runtime,
  );
  // Repeat playback order is authoritative, while bar-style is presentation.
  // The repeat normalizer records a bounded source-identity occurrence plan and
  // removes only the repeat child before the existing representation pass.
  const repeatNormalization = normalizePolyphonicRepeatBarlines(
    performanceNormalization.parsedDocument,
    runtime,
  );
  const runtimeNormalization = tryNormalizeRuntimeGuitarNotation(
    repeatNormalization.parsedDocument,
  );
  const representationDocument = runtimeNormalization
    ? runtimeNormalization.parsedDocument
    : repeatNormalization.parsedDocument;
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
    ...repeatNormalization.ignoredFeatures,
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
    repeatNormalization,
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
    repeatBarlineCount: repeatNormalization.repeatBarlines.length,
    playbackOccurrenceCount: repeatNormalization.measureOccurrencePlan.length,
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
    measureOccurrencePlan: repeatNormalization.measureOccurrencePlan,
    repeatBarlines: repeatNormalization.repeatBarlines,
    repeatRegions: repeatNormalization.repeatRegions,
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
