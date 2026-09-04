'use strict';

const { EngineError } = require('../errors/engineError');
const {
  extractPolyphonicGraceOrnaments,
} = require('../parser/polyphonicGraceOrnamentExtractor');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  normalizePolyphonicPerformanceMetadataPolicy,
} = require('../parser/polyphonicPerformanceMetadataPolicy');
const {
  normalizeDeferredPolyphonicPerformanceDirections,
} = require('../parser/polyphonicPerformanceDirectionNormalizer');
const {
  normalizePolyphonicRepeatBarlines,
} = require('../parser/polyphonicRepeatBarlineNormalizer');
const {
  normalizePolyphonicFingeringProvenance,
  bindPolyphonicFingeringProvenance,
} = require('../parser/polyphonicFingeringProvenance');
const {
  normalizeVerifiedGuitarTechniqueProvenance,
} = require('./guitarTechniqueCompatibilityNormalizer');
const {
  recordPerformanceMetadataRuntimeIssues,
} = require('./polyPerformanceMetadataRuntimeDiagnostics');
const {
  recordFingeringRuntimeIssues,
} = require('./polyFingeringRuntimeDiagnostics');
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

function excludedPerformanceMetadataDirectionRecords(performanceMetadata) {
  return performanceMetadata.performanceMetadataRecords.filter((record) => (
    record.kind === 'WORDS'
    || (record.kind === 'METRONOME' && record.conflictingTempo === true)
    || (record.kind === 'DYNAMICS' && record.invalidNegativeDynamics !== null)
  ));
}

function performanceMetadataDirectionFeatureCounts(performanceMetadata) {
  const counts = new Map();
  const add = (feature) => counts.set(feature, (counts.get(feature) || 0) + 1);
  for (const record of excludedPerformanceMetadataDirectionRecords(performanceMetadata)) {
    if (record.kind === 'WORDS') {
      add('direction:words');
    } else if (record.kind === 'METRONOME') {
      add('direction:metronome');
      if (record.rawSoundTempo !== null) add('direction:sound:tempo');
    } else if (record.kind === 'DYNAMICS') {
      add('direction:dynamics');
      add('direction:sound:dynamics');
    }
  }
  return Object.freeze(Object.fromEntries(
    [...counts].sort((left, right) => left[0].localeCompare(right[0])),
  ));
}

function projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
  parsedDocument,
  runtime = null,
  sourceConfigurationProvenance = null,
) {
  runtime?.checkpoint('poly-production-compatibility:start');

  // Fingering must be classified before the generic guitar-technique provenance
  // layer strips technical wrappers. Generic/piano annotations are evidence only;
  // only later binding can promote a proven guitar-group annotation to an exact
  // pre-existing PA-8 finger constraint.
  const fingeringNormalization = normalizePolyphonicFingeringProvenance(
    parsedDocument,
    sourceConfigurationProvenance,
    runtime,
  );
  recordFingeringRuntimeIssues(fingeringNormalization.issues);

  // Unknown or non-fingering technical children are deliberately left in the
  // document so the existing verified technique profile remains fail-closed.
  const techniqueNormalization = normalizeVerifiedGuitarTechniqueProvenance(
    fingeringNormalization.parsedDocument,
  );
  const performanceMetadata = normalizePolyphonicPerformanceMetadataPolicy(
    techniqueNormalization.parsedDocument,
    runtime,
  );
  recordPerformanceMetadataRuntimeIssues(performanceMetadata.issues);
  const performanceNormalization = normalizeDeferredPolyphonicPerformanceDirections(
    performanceMetadata.parsedDocument,
    runtime,
  );
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
  const semanticNormalization = extractPolyphonicGraceOrnaments(
    graceAccidentalNormalization.parsedDocument,
    runtime,
  );
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(
    semanticNormalization.parsedMainDocument,
    runtime,
  );
  const fingeringProvenance = bindPolyphonicFingeringProvenance(
    fingeringNormalization,
    semanticNormalization.graceOrnamentGroups,
    sourceModel,
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
    ...fingeringNormalization.ignoredFeatures,
    ...performanceMetadata.ignoredFeatures,
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
  const policyExcludedDirections = excludedPerformanceMetadataDirectionRecords(performanceMetadata);
  const ignoredDirectionCount = policyExcludedDirections.length
    + performanceNormalization.ignoredDirectionCount
    + semanticNormalization.ignoredDirectionCount;
  const ignoredDirectionFeatureCounts = mergeDirectionFeatureCounts(
    performanceMetadataDirectionFeatureCounts(performanceMetadata),
    performanceNormalization.ignoredDirectionFeatureCounts,
    semanticNormalization.ignoredDirectionFeatureCounts,
  );

  runtime?.checkpoint('poly-production-compatibility:complete', {
    eventCount: sourceModel.eventCount,
    extractedGraceEventCount: semanticNormalization.extractedGraceEventCount,
    ignoredFeatureCount: ignoredFeatures.length,
    ignoredDirectionCount,
    performanceMetadataRecordCount: performanceMetadata.performanceMetadataRecords.length,
    performanceMetadataIssueCount: performanceMetadata.issues.length,
    fingeringRecordCount: fingeringProvenance.recordCount,
    exactGuitarFingeringConstraintCount: fingeringProvenance.exactConstraints.constraintCount,
    fingeringIssueCount: fingeringProvenance.issues.length,
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
    fingeringProvenance,
    exactGuitarFingeringConstraints: fingeringProvenance.exactConstraints,
    performanceMetadataRecords: performanceMetadata.performanceMetadataRecords,
    performanceMetadataIssues: performanceMetadata.issues,
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