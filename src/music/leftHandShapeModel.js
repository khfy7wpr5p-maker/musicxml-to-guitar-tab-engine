'use strict';

const { EngineError } = require('../errors/engineError');
const {
  GUITAR_STRING_COUNT,
  DEFAULT_FRET_RANGE,
} = require('../guitar/tuning');
const {
  GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
  GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
  GUITAR_VOICING_CANDIDATE_POLICY,
  createGuitarVoicingCandidateModel,
  isAuthenticGuitarVoicingCandidateModelSnapshot,
} = require('./guitarVoicingCandidateModel');

const LEFT_HAND_SHAPE_MODEL_VERSION = '1.0.0';
const LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE = 'LeftHandShapeModel';
const LEFT_HAND_SHAPE_POLICY = 'ORDERED_FRET_FINGER_BARRE_1.0';
const MAX_LEFT_HAND_SHAPE_CANDIDATES = 20_000;
const MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS = 100_000;
const OPEN_STRING_FINGER = 0;
const MIN_FRETTING_FINGER = 1;
const MAX_FRETTING_FINGER = 4;
const authenticLeftHandShapeModelSnapshots = new WeakSet();

class LeftHandShapeModelError extends EngineError {
  constructor(message, code = 'INVALID_LEFT_HAND_SHAPE_MODEL', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'LeftHandShapeModelError',
    );
  }
}

function invalid(message, details = {}) {
  return new LeftHandShapeModelError(message, 'INVALID_LEFT_HAND_SHAPE_MODEL', details);
}

function shapeLimitExceeded(observed, details = {}) {
  return new LeftHandShapeModelError(
    'PA-8 left-hand shape candidate count exceeds the fixed per-group model limit.',
    'LEFT_HAND_SHAPE_CANDIDATE_LIMIT_EXCEEDED',
    {
      limit: MAX_LEFT_HAND_SHAPE_CANDIDATES,
      observed,
      ...details,
    },
  );
}

function assignmentAttemptLimitExceeded(observed, details = {}) {
  return new LeftHandShapeModelError(
    'PA-8 complete finger-assignment attempt count exceeds the fixed per-group limit.',
    'LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED',
    {
      limit: MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS,
      observed,
      ...details,
    },
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) {
    runtime.checkpoint(phase, details);
  }
}

function isDeeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  for (const nested of Object.values(value)) {
    if (!isDeeplyFrozen(nested, seen)) return false;
  }
  return true;
}

function isAuthenticLeftHandShapeModelSnapshot(value) {
  return Boolean(value && typeof value === 'object'
    && authenticLeftHandShapeModelSnapshots.has(value));
}

function validateVoicingModel(voicing) {
  if (
    !voicing
    || voicing.documentType !== GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE
    || voicing.contractVersion !== GUITAR_VOICING_CANDIDATE_MODEL_VERSION
    || voicing.policy !== GUITAR_VOICING_CANDIDATE_POLICY
    || !Array.isArray(voicing.groups)
    || !isAuthenticGuitarVoicingCandidateModelSnapshot(voicing)
    || !isDeeplyFrozen(voicing)
  ) {
    throw invalid('PA-8 requires an authentic, deeply immutable PA-7 voicing candidate snapshot.');
  }
}

function normalizePositions(candidate, sourceGroupId) {
  if (!candidate || typeof candidate.candidateId !== 'string' || candidate.candidateId.length === 0) {
    throw invalid('PA-8 requires a non-empty PA-7 candidate identity.', { sourceGroupId });
  }
  if (!Array.isArray(candidate.positions)) {
    throw invalid('PA-8 requires PA-7 candidate positions.', {
      sourceGroupId,
      voicingCandidateId: candidate.candidateId,
    });
  }

  const positions = new Array(candidate.positions.length);
  const usedStrings = new Set();

  for (let index = 0; index < candidate.positions.length; index += 1) {
    const position = candidate.positions[index];
    if (
      !position
      || typeof position.sourceEventId !== 'string'
      || position.sourceEventId.length === 0
      || !Number.isInteger(position.targetMidi)
      || position.targetMidi < 0
      || position.targetMidi > 127
      || !Number.isInteger(position.string)
      || position.string < 1
      || position.string > GUITAR_STRING_COUNT
      || !Number.isInteger(position.fret)
      || position.fret < DEFAULT_FRET_RANGE.minimumFret
      || position.fret > DEFAULT_FRET_RANGE.maximumFret
    ) {
      throw invalid('PA-8 encountered invalid PA-7 snapshot position facts.', {
        sourceGroupId,
        voicingCandidateId: candidate.candidateId,
        positionIndex: index,
      });
    }
    if (usedStrings.has(position.string)) {
      throw invalid('PA-8 requires distinct strings inside a PA-7 voicing candidate.', {
        sourceGroupId,
        voicingCandidateId: candidate.candidateId,
        string: position.string,
      });
    }
    usedStrings.add(position.string);
    positions[index] = Object.freeze({
      sourceEventId: position.sourceEventId,
      targetMidi: position.targetMidi,
      string: position.string,
      fret: position.fret,
    });
  }

  return Object.freeze(positions);
}

function validateOrderedFingerPolicy(positions, fingers) {
  const fingerToFret = new Map();
  const fretToFingers = new Map();

  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    const finger = fingers[index];
    if (position.fret === 0) {
      if (finger !== OPEN_STRING_FINGER) return false;
      continue;
    }
    if (!Number.isInteger(finger) || finger < MIN_FRETTING_FINGER || finger > MAX_FRETTING_FINGER) {
      return false;
    }

    const priorFret = fingerToFret.get(finger);
    if (priorFret !== undefined && priorFret !== position.fret) return false;
    fingerToFret.set(finger, position.fret);

    let fretFingers = fretToFingers.get(position.fret);
    if (!fretFingers) {
      fretFingers = new Set();
      fretToFingers.set(position.fret, fretFingers);
    }
    fretFingers.add(finger);
  }

  const frets = [...fretToFingers.keys()].sort((a, b) => a - b);
  for (let fretIndex = 1; fretIndex < frets.length; fretIndex += 1) {
    const lowerFingers = [...fretToFingers.get(frets[fretIndex - 1])];
    const higherFingers = [...fretToFingers.get(frets[fretIndex])];
    if (Math.max(...lowerFingers) >= Math.min(...higherFingers)) return false;
  }
  return true;
}

function buildBarres(positions, fingers) {
  const byFinger = new Map();
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    const finger = fingers[index];
    if (finger === OPEN_STRING_FINGER) continue;
    let entries = byFinger.get(finger);
    if (!entries) {
      entries = [];
      byFinger.set(finger, entries);
    }
    entries.push({ position, index });
  }

  const barres = [];
  for (const [finger, entries] of byFinger) {
    if (entries.length < 2) continue;
    const fret = entries[0].position.fret;
    let startString = GUITAR_STRING_COUNT;
    let endString = 1;
    for (const entry of entries) {
      if (entry.position.fret !== fret) return null;
      startString = Math.min(startString, entry.position.string);
      endString = Math.max(endString, entry.position.string);
    }
    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index];
      if (position.string < startString || position.string > endString) continue;
      if (position.fret < fret) return null;
      if (position.fret === fret && fingers[index] !== finger) return null;
    }
    barres.push(Object.freeze({
      finger,
      fret,
      startString,
      endString,
      stringSpan: endString - startString + 1,
      kind: startString === 1 && endString === GUITAR_STRING_COUNT ? 'FULL_BARRE' : 'PARTIAL_BARRE',
    }));
  }
  barres.sort((left, right) => (
    left.fret - right.fret
    || left.finger - right.finger
    || left.startString - right.startString
    || left.endString - right.endString
  ));
  return Object.freeze(barres);
}

function buildShapeCandidate(candidateId, positions, fingers, shapeIndex) {
  if (!validateOrderedFingerPolicy(positions, fingers)) return null;
  const barres = buildBarres(positions, fingers);
  if (barres === null) return null;

  const fingerAssignments = new Array(positions.length);
  const usedFingers = new Set();
  const frettedFrets = [];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    const finger = fingers[index];
    fingerAssignments[index] = Object.freeze({
      sourceEventId: position.sourceEventId,
      targetMidi: position.targetMidi,
      string: position.string,
      fret: position.fret,
      finger,
    });
    if (finger !== OPEN_STRING_FINGER) {
      usedFingers.add(finger);
      frettedFrets.push(position.fret);
    }
  }
  const minimumFrettedFret = frettedFrets.length === 0 ? null : Math.min(...frettedFrets);
  const maximumFrettedFret = frettedFrets.length === 0 ? null : Math.max(...frettedFrets);
  return Object.freeze({
    shapeCandidateId: `${candidateId}:left-hand:${shapeIndex}`,
    assignmentCount: positions.length,
    fingerAssignments: Object.freeze(fingerAssignments),
    usedFingerCount: usedFingers.size,
    minimumFrettedFret,
    maximumFrettedFret,
    fretSpan: frettedFrets.length === 0 ? 0 : maximumFrettedFret - minimumFrettedFret,
    barreCount: barres.length,
    barres,
  });
}

function enumerateShapeCandidates(candidateId, positions, runtime, counters, sourceGroupId) {
  const shapeCandidates = [];
  if (!Number.isSafeInteger(counters.groupShapeCandidates)) counters.groupShapeCandidates = 0;
  if (!Number.isSafeInteger(counters.groupAssignmentAttempts)) {
    counters.groupAssignmentAttempts = 0;
  }
  const fingers = new Array(positions.length).fill(OPEN_STRING_FINGER);
  const frettedIndexes = [];
  for (let index = 0; index < positions.length; index += 1) {
    if (positions[index].fret > 0) frettedIndexes.push(index);
  }

  function visit(frettedIndex) {
    checkpoint(runtime, 'left-hand-shape-model:assignment', {
      sourceGroupId,
      voicingCandidateId: candidateId,
      frettedIndex,
      assignmentAttemptCount: counters.assignmentAttempts,
      shapeCandidateCount: counters.shapeCandidates,
    });
    if (frettedIndex === frettedIndexes.length) {
      const observedAttempts = counters.groupAssignmentAttempts + 1;
      if (observedAttempts > MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS) {
        throw assignmentAttemptLimitExceeded(observedAttempts, { sourceGroupId, voicingCandidateId: candidateId });
      }
      counters.groupAssignmentAttempts = observedAttempts;
      counters.assignmentAttempts += 1;
      const shape = buildShapeCandidate(candidateId, positions, fingers, shapeCandidates.length);
      if (!shape) return;
      const observedShapes = counters.groupShapeCandidates + 1;
      if (observedShapes > MAX_LEFT_HAND_SHAPE_CANDIDATES) {
        throw shapeLimitExceeded(observedShapes, { sourceGroupId, voicingCandidateId: candidateId });
      }
      counters.groupShapeCandidates = observedShapes;
      counters.shapeCandidates += 1;
      shapeCandidates.push(shape);
      return;
    }
    const positionIndex = frettedIndexes[frettedIndex];
    for (let finger = MIN_FRETTING_FINGER; finger <= MAX_FRETTING_FINGER; finger += 1) {
      fingers[positionIndex] = finger;
      visit(frettedIndex + 1);
    }
    fingers[positionIndex] = OPEN_STRING_FINGER;
  }

  visit(0);
  return Object.freeze(shapeCandidates);
}

function createLeftHandShapeModelFromVoicingCandidateSnapshot(voicing, runtime = null) {
  checkpoint(runtime, 'left-hand-shape-model:start');
  validateVoicingModel(voicing);

  const counters = { voicingCandidates: 0, shapeCandidates: 0, assignmentAttempts: 0 };
  const groups = new Array(voicing.groups.length);

  for (let groupIndex = 0; groupIndex < voicing.groups.length; groupIndex += 1) {
    checkpoint(runtime, 'left-hand-shape-model:group', { groupIndex });
    const group = voicing.groups[groupIndex];
    if (!group || typeof group.sourceGroupId !== 'string' || !Array.isArray(group.candidates)) {
      throw invalid('PA-8 encountered an invalid PA-7 snapshot group.', { groupIndex });
    }

    counters.groupShapeCandidates = 0;
    counters.groupAssignmentAttempts = 0;

    const voicingCandidates = new Array(group.candidates.length);
    for (let candidateIndex = 0; candidateIndex < group.candidates.length; candidateIndex += 1) {
      checkpoint(runtime, 'left-hand-shape-model:voicing-candidate', { groupIndex, candidateIndex });
      const candidate = group.candidates[candidateIndex];
      const positions = normalizePositions(candidate, group.sourceGroupId);
      const shapeCandidates = enumerateShapeCandidates(
        candidate.candidateId,
        positions,
        runtime,
        counters,
        group.sourceGroupId,
      );
      counters.voicingCandidates += 1;
      voicingCandidates[candidateIndex] = Object.freeze({
        voicingCandidateId: candidate.candidateId,
        positions,
        shapeCandidateCount: shapeCandidates.length,
        shapeCandidates,
      });
    }

    groups[groupIndex] = Object.freeze({
      sourceGroupId: group.sourceGroupId,
      voicingCandidateCount: voicingCandidates.length,
      voicingCandidates: Object.freeze(voicingCandidates),
    });
  }

  checkpoint(runtime, 'left-hand-shape-model:complete', {
    groupCount: groups.length,
    voicingCandidateCount: counters.voicingCandidates,
    shapeCandidateCount: counters.shapeCandidates,
    assignmentAttemptCount: counters.assignmentAttempts,
  });

  const snapshot = Object.freeze({
    documentType: LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
    contractVersion: LEFT_HAND_SHAPE_MODEL_VERSION,
    policy: LEFT_HAND_SHAPE_POLICY,
    voicing: Object.freeze({
      documentType: GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
      contractVersion: GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
      policy: GUITAR_VOICING_CANDIDATE_POLICY,
    }),
    configuration: Object.freeze({
      frettingFingerMinimum: MIN_FRETTING_FINGER,
      frettingFingerMaximum: MAX_FRETTING_FINGER,
      openStringFinger: OPEN_STRING_FINGER,
    }),
    groupCount: groups.length,
    voicingCandidateCount: counters.voicingCandidates,
    shapeCandidateCount: counters.shapeCandidates,
    groups: Object.freeze(groups),
  });
  authenticLeftHandShapeModelSnapshots.add(snapshot);
  return snapshot;
}

function createLeftHandShapeModel(
  sourceModel,
  arrangementDecisions,
  runtime = null,
  guitarOptions = {},
) {
  const voicing = createGuitarVoicingCandidateModel(
    sourceModel,
    arrangementDecisions,
    runtime,
    guitarOptions,
  );
  return createLeftHandShapeModelFromVoicingCandidateSnapshot(voicing, runtime);
}

module.exports = {
  LEFT_HAND_SHAPE_MODEL_VERSION,
  LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
  LEFT_HAND_SHAPE_POLICY,
  MAX_LEFT_HAND_SHAPE_CANDIDATES,
  MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS,
  LeftHandShapeModelError,
  createLeftHandShapeModel,
  createLeftHandShapeModelFromVoicingCandidateSnapshot,
  isAuthenticLeftHandShapeModelSnapshot,
  enumerateStaticLeftHandShapeCandidatesFromPositions: enumerateShapeCandidates,
};
