'use strict';

const { EngineError } = require('../errors/engineError');
const {
  GUITAR_CONFIGURATION_VERSION,
  GUITAR_STRING_COUNT,
  DEFAULT_FRET_RANGE,
} = require('../guitar/tuning');
const {
  getPositionCandidates,
  positionToMidi,
} = require('../guitar/fretboard');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  ACTIVE_SONORITY_MODEL_VERSION,
  ACTIVE_SONORITY_MODEL_DOCUMENT_TYPE,
  createActiveSonorityModel,
} = require('./activeSonorityModel');

const SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION = '1.0.0';
const SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE = 'SustainedGuitarPositionStateModel';
const SUSTAINED_GUITAR_POSITION_STATE_MODEL_AUTHORITY = 'EXACT_POSITION_CANDIDATES_ONLY';
const MAX_SUSTAINED_POSITION_STATES_PER_POINT = 10_000;
const MAX_SUSTAINED_POSITION_STATES_TOTAL = 400_000;

const SUSTAINED_POSITION_POINT_STATUS = Object.freeze({
  CANDIDATES_AVAILABLE: 'CANDIDATES_AVAILABLE',
  EMPTY_SONORITY: 'EMPTY_SONORITY',
  UNPLAYABLE_EXACT: 'UNPLAYABLE_EXACT',
});

class SustainedGuitarPositionStateModelError extends EngineError {
  constructor(message, code = 'INVALID_SUSTAINED_GUITAR_POSITION_STATE_MODEL', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'SustainedGuitarPositionStateModelError');
  }
}

function invalid(message, details = {}) {
  return new SustainedGuitarPositionStateModelError(
    message,
    'INVALID_SUSTAINED_GUITAR_POSITION_STATE_MODEL',
    details,
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function validateGeneratedPosition(position, targetMidi, logicalNoteId) {
  if (
    !position
    || !Number.isInteger(position.string)
    || position.string < 1
    || position.string > GUITAR_STRING_COUNT
    || !Number.isInteger(position.fret)
    || position.fret < DEFAULT_FRET_RANGE.minimumFret
    || position.fret > DEFAULT_FRET_RANGE.maximumFret
  ) {
    throw invalid('Fretboard candidate logic returned an invalid standard-guitar position.', {
      logicalNoteId,
      targetMidi,
    });
  }

  let observedMidi;
  try {
    observedMidi = positionToMidi(position);
  } catch {
    throw invalid('PS-4A could not round-trip a generated guitar position.', {
      logicalNoteId,
      targetMidi,
      string: position.string,
      fret: position.fret,
    });
  }
  if (observedMidi !== targetMidi) {
    throw invalid('PS-4A generated position does not round-trip to the exact active pitch.', {
      logicalNoteId,
      targetMidi,
      observedMidi,
      string: position.string,
      fret: position.fret,
    });
  }
}

function noteDisposition(point, logicalNoteId) {
  if (point.attackNotes.some((fact) => fact.logicalNoteId === logicalNoteId)) return 'ATTACK';
  if (point.holdNotes.some((fact) => fact.logicalNoteId === logicalNoteId)) return 'HOLD';
  throw invalid('Active sonority note is neither ATTACK nor HOLD.', {
    sonorityPointId: point.sonorityPointId,
    logicalNoteId,
  });
}

function buildPositionLayers(point, runtime, location) {
  const layers = new Array(point.activeNotes.length);
  for (let noteIndex = 0; noteIndex < point.activeNotes.length; noteIndex += 1) {
    checkpoint(runtime, 'sustained-guitar-position-state:note', {
      ...location,
      noteIndex,
    });
    const fact = point.activeNotes[noteIndex];
    const targetMidi = fact.pitch.midi;
    const positions = getPositionCandidates(targetMidi);
    const normalized = new Array(positions.length);
    for (let positionIndex = 0; positionIndex < positions.length; positionIndex += 1) {
      checkpoint(runtime, 'sustained-guitar-position-state:position', {
        ...location,
        noteIndex,
        positionIndex,
      });
      const position = positions[positionIndex];
      validateGeneratedPosition(position, targetMidi, fact.logicalNoteId);
      normalized[positionIndex] = Object.freeze({
        logicalNoteId: fact.logicalNoteId,
        sourceEventId: fact.sourceEventId,
        sustainChainId: fact.sustainChainId,
        voice: fact.voice,
        staff: fact.staff,
        disposition: noteDisposition(point, fact.logicalNoteId),
        targetMidi,
        string: position.string,
        fret: position.fret,
      });
    }
    layers[noteIndex] = Object.freeze(normalized);
  }
  return Object.freeze(layers);
}

function stateSignature(positions) {
  return positions.map((position) => (
    `${position.logicalNoteId}:${position.string}:${position.fret}`
  )).join(';');
}

function enumerateStates(point, runtime, location, aggregateCounter) {
  if (point.activeNotes.length === 0) {
    return Object.freeze({
      status: SUSTAINED_POSITION_POINT_STATUS.EMPTY_SONORITY,
      reason: null,
      candidates: Object.freeze([]),
    });
  }
  if (point.activeNotes.length > GUITAR_STRING_COUNT) {
    return Object.freeze({
      status: SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT,
      reason: 'ACTIVE_NOTE_COUNT_EXCEEDS_STRING_COUNT',
      candidates: Object.freeze([]),
    });
  }

  const layers = buildPositionLayers(point, runtime, location);
  if (layers.some((layer) => layer.length === 0)) {
    return Object.freeze({
      status: SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT,
      reason: 'ACTIVE_PITCH_OUTSIDE_STANDARD_GUITAR_RANGE',
      candidates: Object.freeze([]),
    });
  }

  const candidates = [];
  const working = new Array(layers.length);
  const usedStrings = new Set();

  function visit(noteIndex) {
    checkpoint(runtime, 'sustained-guitar-position-state:assignment', {
      ...location,
      noteIndex,
      pointCandidateCount: candidates.length,
      aggregateCandidateCount: aggregateCounter.count,
    });
    if (noteIndex === layers.length) {
      const pointObserved = candidates.length + 1;
      if (pointObserved > MAX_SUSTAINED_POSITION_STATES_PER_POINT) {
        throw new SustainedGuitarPositionStateModelError(
          'PS-4A position-state count exceeds the fixed per-point boundary.',
          'SUSTAINED_POSITION_STATE_POINT_LIMIT_EXCEEDED',
          {
            ...location,
            limit: MAX_SUSTAINED_POSITION_STATES_PER_POINT,
            observed: pointObserved,
          },
        );
      }
      const aggregateObserved = aggregateCounter.count + 1;
      if (aggregateObserved > MAX_SUSTAINED_POSITION_STATES_TOTAL) {
        throw new SustainedGuitarPositionStateModelError(
          'PS-4A aggregate position-state count exceeds the fixed model boundary.',
          'SUSTAINED_POSITION_STATE_TOTAL_LIMIT_EXCEEDED',
          {
            limit: MAX_SUSTAINED_POSITION_STATES_TOTAL,
            observed: aggregateObserved,
          },
        );
      }
      const positions = Object.freeze(working.map((position) => position));
      const signature = stateSignature(positions);
      candidates.push(Object.freeze({
        stateCandidateId: `${point.sonorityPointId}:position-state:${candidates.length}`,
        positionCount: positions.length,
        positions,
        signature,
      }));
      aggregateCounter.count = aggregateObserved;
      return;
    }

    for (let positionIndex = 0; positionIndex < layers[noteIndex].length; positionIndex += 1) {
      const position = layers[noteIndex][positionIndex];
      if (usedStrings.has(position.string)) continue;
      usedStrings.add(position.string);
      working[noteIndex] = position;
      visit(noteIndex + 1);
      usedStrings.delete(position.string);
    }
  }

  visit(0);
  if (candidates.length === 0) {
    return Object.freeze({
      status: SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT,
      reason: 'NO_DISTINCT_STRING_ASSIGNMENT',
      candidates: Object.freeze([]),
    });
  }
  candidates.sort((left, right) => left.signature.localeCompare(right.signature));
  return Object.freeze({
    status: SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE,
    reason: null,
    candidates: Object.freeze(candidates),
  });
}

function createSustainedGuitarPositionStateModel(sourceModel, runtime = null) {
  checkpoint(runtime, 'sustained-guitar-position-state:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const sonority = createActiveSonorityModel(source, runtime);
  const measures = [];
  const aggregateCounter = { count: 0 };
  let pointCount = 0;
  let unplayablePointCount = 0;

  for (let measureIndex = 0; measureIndex < sonority.measures.length; measureIndex += 1) {
    checkpoint(runtime, 'sustained-guitar-position-state:measure', { measureIndex });
    const measure = sonority.measures[measureIndex];
    const points = [];
    for (let pointIndex = 0; pointIndex < measure.sonorityPoints.length; pointIndex += 1) {
      checkpoint(runtime, 'sustained-guitar-position-state:point', { measureIndex, pointIndex });
      const sonorityPoint = measure.sonorityPoints[pointIndex];
      const enumerated = enumerateStates(
        sonorityPoint,
        runtime,
        { measureIndex, pointIndex, sonorityPointId: sonorityPoint.sonorityPointId },
        aggregateCounter,
      );
      if (enumerated.status === SUSTAINED_POSITION_POINT_STATUS.UNPLAYABLE_EXACT) {
        unplayablePointCount += 1;
      }
      points.push(Object.freeze({
        sonorityPointId: sonorityPoint.sonorityPointId,
        pointIndex: sonorityPoint.pointIndex,
        timeDivisions: sonorityPoint.timeDivisions,
        activeNoteCount: sonorityPoint.activeNotes.length,
        attackLogicalNoteIds: Object.freeze(sonorityPoint.attackNotes.map((fact) => fact.logicalNoteId)),
        holdLogicalNoteIds: Object.freeze(sonorityPoint.holdNotes.map((fact) => fact.logicalNoteId)),
        releaseLogicalNoteIds: Object.freeze(sonorityPoint.releaseNotes.map((fact) => fact.logicalNoteId)),
        status: enumerated.status,
        reason: enumerated.reason,
        candidateCount: enumerated.candidates.length,
        candidates: enumerated.candidates,
      }));
      pointCount += 1;
    }
    measures.push(Object.freeze({
      measureId: measure.measureId,
      index: measure.index,
      pointCount: points.length,
      points: Object.freeze(points),
    }));
  }

  const result = Object.freeze({
    documentType: SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE,
    contractVersion: SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION,
    authority: SUSTAINED_GUITAR_POSITION_STATE_MODEL_AUTHORITY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    sonority: Object.freeze({
      documentType: ACTIVE_SONORITY_MODEL_DOCUMENT_TYPE,
      contractVersion: ACTIVE_SONORITY_MODEL_VERSION,
    }),
    guitar: Object.freeze({
      contractVersion: GUITAR_CONFIGURATION_VERSION,
      stringCount: GUITAR_STRING_COUNT,
      minimumFret: DEFAULT_FRET_RANGE.minimumFret,
      maximumFret: DEFAULT_FRET_RANGE.maximumFret,
    }),
    pointCount,
    candidateCount: aggregateCounter.count,
    unplayablePointCount,
    measures: Object.freeze(measures),
  });
  checkpoint(runtime, 'sustained-guitar-position-state:complete', {
    pointCount,
    candidateCount: aggregateCounter.count,
    unplayablePointCount,
  });
  return result;
}

module.exports = {
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_VERSION,
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_DOCUMENT_TYPE,
  SUSTAINED_GUITAR_POSITION_STATE_MODEL_AUTHORITY,
  SUSTAINED_POSITION_POINT_STATUS,
  MAX_SUSTAINED_POSITION_STATES_PER_POINT,
  MAX_SUSTAINED_POSITION_STATES_TOTAL,
  SustainedGuitarPositionStateModelError,
  createSustainedGuitarPositionStateModel,
};
