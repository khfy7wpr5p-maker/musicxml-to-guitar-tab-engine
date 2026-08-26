'use strict';

const { version: ENGINE_VERSION } = require('../../package.json');
const { EngineError } = require('../errors/engineError');
const {
  ENGINE_NAME,
  CANONICAL_TAB_RESULT_VERSION,
} = require('../contracts/canonicalTabContractMetadata');
const { createFingeringCostProfile } = require('../fingering/costModel');
const { optimizeFingering } = require('../fingering/fingeringOptimizer');
const { buildCandidateLayers } = require('../fingering/candidateLayerBuilder');

class CanonicalTabResultError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'CanonicalTabResultError');
  }
}

function invalidOptions(message, details = {}) {
  return new CanonicalTabResultError(
    message,
    'INVALID_CANONICAL_TAB_OPTIONS',
    details,
  );
}

function invariantViolation(message, details = {}) {
  return new CanonicalTabResultError(
    message,
    'CANONICAL_TAB_INVARIANT_VIOLATION',
    details,
  );
}

function inconsistentFretRange(details = {}) {
  return new CanonicalTabResultError(
    'The guitar and fingering profiles must use the same maximum fret.',
    'INCONSISTENT_FRET_RANGE',
    details,
  );
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function normalizeOptions(options) {
  if (!isObject(options)) {
    throw invalidOptions('options must be an object.');
  }

  const allowedFields = new Set(['guitar', 'costProfile']);
  for (const field of Object.keys(options)) {
    if (!allowedFields.has(field)) {
      throw invalidOptions('options contains an unknown field.', { field });
    }
  }

  if (Object.hasOwn(options, 'guitar') && !isObject(options.guitar)) {
    throw invalidOptions('options.guitar must be an object.');
  }
  if (Object.hasOwn(options, 'costProfile') && !isObject(options.costProfile)) {
    throw invalidOptions('options.costProfile must be an object.');
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

function optimizeCandidateLayers(candidateLayers, costProfile, runtime = null) {
  if (candidateLayers.length === 0) {
    return {
      totalCost: 0,
      positions: [],
      costs: [],
    };
  }
  return optimizeFingering(candidateLayers, { costProfile }, runtime);
}

function samePosition(left, right) {
  return left.string === right.string && left.fret === right.fret;
}

function writtenPitch(step, alter, octave) {
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter];
  return `${step}${accidental}${octave}`;
}

function targetPitchForCandidate(sourcePitch, candidateNote) {
  const semitoneDelta = candidateNote.midi - sourcePitch.midi;
  if (!Number.isSafeInteger(semitoneDelta) || (semitoneDelta % 12) !== 0) {
    throw invariantViolation('Candidate target pitch must preserve pitch class by an exact octave.', {
      sourceMidi: sourcePitch.midi,
      targetMidi: candidateNote.midi,
    });
  }
  const octaveDelta = semitoneDelta / 12;
  const octave = sourcePitch.octave + octaveDelta;
  const target = {
    step: sourcePitch.step,
    alter: sourcePitch.alter,
    octave,
    written: writtenPitch(sourcePitch.step, sourcePitch.alter, octave),
    midi: candidateNote.midi,
  };
  if (target.written !== candidateNote.writtenPitch) {
    throw invariantViolation('Candidate written pitch does not match its target MIDI octave.', {
      sourceWrittenPitch: sourcePitch.written,
      candidateWrittenPitch: candidateNote.writtenPitch,
      targetWrittenPitch: target.written,
      targetMidi: target.midi,
    });
  }
  return target;
}

function createResultEvent(event, measure, candidateState) {
  const base = {
    eventId: event.eventId,
    eventIndex: event.eventIndex,
    measureKey: measure.measureKey,
    type: event.type,
    voice: event.voice,
    staff: event.staff,
    start: clonePlainData(event.start),
    rhythm: clonePlainData(event.rhythm),
    warnings: clonePlainData(event.warnings),
    sourceLocation: clonePlainData(event.sourceLocation),
  };

  if (event.type === 'rest') {
    return {
      ...base,
      selectedPosition: null,
      alternativePositions: [],
      fingeringCost: null,
    };
  }

  const {
    candidateNote,
    candidateLayer,
    selectedPosition,
    fingeringCost,
  } = candidateState;

  if (
    !candidateNote
    || !Array.isArray(candidateLayer)
    || !isObject(selectedPosition)
    || !isObject(fingeringCost)
    || candidateNote.eventId !== event.eventId
    || candidateNote.measureKey !== measure.measureKey
  ) {
    throw invariantViolation('Candidate and optimizer data no longer match canonical event order.', {
      eventId: event.eventId,
      measureKey: measure.measureKey,
      candidateEventId: candidateNote && candidateNote.eventId,
      candidateMeasureKey: candidateNote && candidateNote.measureKey,
    });
  }

  if (!candidateLayer.some((position) => samePosition(position, selectedPosition))) {
    throw invariantViolation('Optimizer selected a position outside the candidate layer.', {
      eventId: event.eventId,
      measureKey: measure.measureKey,
      selectedPosition: clonePlainData(selectedPosition),
    });
  }

  return {
    ...base,
    pitch: targetPitchForCandidate(event.pitch, candidateNote),
    selectedPosition: clonePlainData(selectedPosition),
    alternativePositions: candidateLayer
      .filter((position) => !samePosition(position, selectedPosition))
      .map(clonePlainData),
    fingeringCost: clonePlainData(fingeringCost),
  };
}

function createWarningIndex(measures) {
  const warnings = [];

  for (const measure of measures) {
    for (const warning of measure.warnings) {
      warnings.push({
        scope: 'measure',
        measureKey: measure.measureKey,
        eventId: null,
        warning: clonePlainData(warning),
      });
    }
    for (const event of measure.events) {
      for (const warning of event.warnings) {
        warnings.push({
          scope: 'event',
          measureKey: measure.measureKey,
          eventId: event.eventId,
          warning: clonePlainData(warning),
        });
      }
    }
  }

  return warnings;
}

function createCanonicalTabResult(canonicalDocument, options = {}, runtime = null) {
  const normalizedOptions = normalizeOptions(options);
  const candidates = buildCandidateLayers(
    canonicalDocument,
    normalizedOptions.guitar,
    runtime,
  );
  const fingeringProfile = createCompatibleCostProfile(
    normalizedOptions.costProfile,
    candidates.guitarConfiguration.maximumFret,
  );
  const optimized = optimizeCandidateLayers(
    candidates.candidateLayers,
    fingeringProfile,
    runtime,
  );

  if (
    optimized.positions.length !== candidates.noteCount
    || optimized.costs.length !== candidates.noteCount
  ) {
    throw invariantViolation('Optimizer output length does not match note count.', {
      noteCount: candidates.noteCount,
      positionCount: optimized.positions.length,
      costCount: optimized.costs.length,
    });
  }

  let noteCursor = 0;
  let restCount = 0;
  const measures = canonicalDocument.measures.map((measure) => ({
    measureKey: measure.measureKey,
    measureIndex: measure.measureIndex,
    visibleMeasureNumber: measure.visibleMeasureNumber,
    implicit: measure.implicit,
    timeSignature: clonePlainData(measure.timeSignature),
    divisions: measure.divisions,
    expectedDurationDivisions: measure.expectedDurationDivisions,
    actualDurationDivisions: measure.actualDurationDivisions,
    events: measure.events.map((event) => {
      if (event.type === 'rest') {
        restCount += 1;
        return createResultEvent(event, measure, null);
      }

      const resultEvent = createResultEvent(event, measure, {
        candidateNote: candidates.notes[noteCursor],
        candidateLayer: candidates.candidateLayers[noteCursor],
        selectedPosition: optimized.positions[noteCursor],
        fingeringCost: optimized.costs[noteCursor],
      });
      noteCursor += 1;
      return resultEvent;
    }),
    warnings: clonePlainData(measure.warnings),
  }));

  if (noteCursor !== candidates.noteCount) {
    throw invariantViolation('Canonical event traversal did not consume every note candidate.', {
      noteCount: candidates.noteCount,
      consumedNoteCount: noteCursor,
    });
  }

  const guitarConfiguration = clonePlainData(candidates.guitarConfiguration);
  const result = {
    documentType: 'CanonicalTabResult',
    schemaVersion: CANONICAL_TAB_RESULT_VERSION,
    engine: {
      name: ENGINE_NAME,
      version: ENGINE_VERSION,
    },
    source: {
      documentType: canonicalDocument.documentType,
      contractVersion: canonicalDocument.contractVersion,
      format: canonicalDocument.sourceFormat,
      version: canonicalDocument.sourceVersion,
      partId: canonicalDocument.partId,
    },
    requiresTeacherReview: true,
    guitar: guitarConfiguration,
    fingeringProfile: clonePlainData(fingeringProfile),
    totalFingeringCost: optimized.totalCost,
    measureCount: canonicalDocument.measureCount,
    voiceCount: canonicalDocument.voiceCount,
    noteCount: candidates.noteCount,
    restCount,
    measures,
    warnings: createWarningIndex(measures),
  };

  return deepFreeze(result);
}

module.exports = {
  ENGINE_NAME,
  ENGINE_VERSION,
  CANONICAL_TAB_RESULT_VERSION,
  CanonicalTabResultError,
  createCanonicalTabResult,
};