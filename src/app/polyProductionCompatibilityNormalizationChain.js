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
  bindPolyphonicFingeringProvenance,
} = require('../parser/polyphonicFingeringProvenance');
const {
  normalizePolyphonicSlurProvenance,
  bindPolyphonicSlurProvenance,
} = require('../parser/polyphonicSlurProvenance');
const {
  normalizeInstrumentAwareFingeringProvenance,
} = require('./fingeringCompatibilityNormalizer');
const {
  normalizeVerifiedGuitarTechniqueProvenance,
} = require('./guitarTechniqueCompatibilityNormalizer');
const {
  recordPerformanceMetadataRuntimeIssues,
} = require('./polyPerformanceMetadataRuntimeDiagnostics');
const {
  recordFingeringRuntimeIssues,
  recordExactGuitarFingeringConstraints,
} = require('./polyFingeringRuntimeDiagnostics');
const {
  recordSlurRuntimeIssues,
} = require('./polySlurRuntimeDiagnostics');
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

function bindFingeringIssuesToSourceEvents(issues, records) {
  if (!Array.isArray(issues) || issues.length === 0) return Object.freeze([]);
  const sourceEventIdByLocation = new Map();
  for (const record of records) {
    const key = `${record.measureIndex}:${record.provenance.noteIndex}`;
    if (!sourceEventIdByLocation.has(key)) sourceEventIdByLocation.set(key, record.sourceEventId);
  }
  return Object.freeze(issues.map((issue) => {
    const key = `${issue.location?.measureIndex}:${issue.location?.eventIndex}`;
    const sourceEventId = sourceEventIdByLocation.get(key) || issue.location?.sourceEventId || null;
    return Object.freeze({
      ...issue,
      location: Object.freeze({
        ...issue.location,
        sourceEventId,
      }),
    });
  }));
}

function projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
  parsedDocument,
  runtime = null,
) {
  runtime?.checkpoint('poly-production-compatibility:start');

  // Slur semantics are captured before generic notation normalization removes
  // presentation-only notation. The resulting provenance has no duration,
  // tie, guitar-technique or solver authority.
  const slurNormalization = normalizePolyphonicSlurProvenance(
    parsedDocument,
    runtime,
  );

  // Fingering is classified before the generic technique provenance pass can
  // remove technical wrappers. Only explicit six-string source-configuration
  // evidence may promote it beyond SOURCE_ANNOTATION_ONLY.
  const fingeringNormalization = normalizeInstrumentAwareFingeringProvenance(
    slurNormalization.parsedDocument,
    runtime,
  );

  // Unknown/non-fingering technical children remain in place so the existing
  // verified technique profile preserves its fail-closed authority boundary.
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
  const slurProvenance = bindPolyphonicSlurProvenance(
    slurNormalization,
    semanticNormalization.graceOrnamentGroups,
    sourceModel,
    runtime,
  );
  recordSlurRuntimeIssues(slurProvenance.issues);
  const boundFingering = bindPolyphonicFingeringProvenance(
    fingeringNormalization,
    semanticNormalization.graceOrnamentGroups,
    sourceModel,
    runtime,
  );
  const fingeringIssues = bindFingeringIssuesToSourceEvents(
    boundFingering.issues,
    boundFingering.records,
  );
  const fingeringProvenance = Object.freeze({
    ...boundFingering,
    issues: fingeringIssues,
  });
  recordFingeringRuntimeIssues(fingeringIssues);
  recordExactGuitarFingeringConstraints(fingeringProvenance.exactConstraints);

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
    ...slurNormalization.ignoredFeatures,
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
    slurRecordCount: slurProvenance.recordCount,
    slurSpanCount: slurProvenance.spanCount,
    slurIssueCount: slurProvenance.issues.length,
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
    slurProvenance,
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
