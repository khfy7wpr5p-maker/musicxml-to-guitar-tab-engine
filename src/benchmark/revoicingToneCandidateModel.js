'use strict';

const { EngineError } = require('../errors/engineError');
const { createGuitarConfiguration } = require('../guitar/tuning');
const { getPositionCandidates, positionToMidi } = require('../guitar/fretboard');
const { validatePolyphonicSourceModel } = require('../music/polyphonicSourceModel');
const { createSimultaneousEventModel } = require('../music/simultaneousEventModel');

const REVOICING_TONE_CANDIDATE_MODEL_VERSION = '1.0.0';
const REVOICING_TONE_CANDIDATE_POLICY = 'PITCH_CLASS_COMPLETE_STANDARD_GUITAR_20_FRET_1.0';
const MAX_SOURCE_EVENTS_PER_GROUP = 6;
const MAX_TONE_CANDIDATES_PER_SOURCE = 32;

class RevoicingToneCandidateModelError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_REVOICING_TONE_CANDIDATE_MODEL',
      Object.freeze({ ...details }),
      'RevoicingToneCandidateModelError',
    );
  }
}

function invalid(message, details = {}) {
  return new RevoicingToneCandidateModelError(message, details);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function buildSourceEventIndex(source) {
  const byId = new Map();
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') byId.set(event.sourceEventId, event);
    }
  }
  return byId;
}

function registerEnvelope() {
  const configuration = createGuitarConfiguration();
  let minimumMidi = Number.POSITIVE_INFINITY;
  let maximumMidi = Number.NEGATIVE_INFINITY;
  for (const string of configuration.tuning) {
    minimumMidi = Math.min(minimumMidi, string.midi + configuration.minimumFret);
    maximumMidi = Math.max(maximumMidi, string.midi + configuration.maximumFret);
  }
  return Object.freeze({
    minimumMidi,
    maximumMidi,
    minimumFret: configuration.minimumFret,
    maximumFret: configuration.maximumFret,
  });
}

const REGISTER = registerEnvelope();

function enumerateSourceToneCandidates(event, sourceGroupId) {
  if (!event || event.type !== 'note' || !event.pitch || !Number.isInteger(event.pitch.midi)) {
    throw invalid('Revoicing tone candidates require pitched source note events.', {
      sourceGroupId,
      sourceEventId: event && event.sourceEventId,
    });
  }

  const sourceMidi = event.pitch.midi;
  const pitchClass = positiveModulo(sourceMidi, 12);
  const candidates = [];
  const seenPositions = new Set();

  for (let targetMidi = REGISTER.minimumMidi; targetMidi <= REGISTER.maximumMidi; targetMidi += 1) {
    if (positiveModulo(targetMidi, 12) !== pitchClass) continue;
    const positions = getPositionCandidates(targetMidi);
    for (const position of positions) {
      const positionKey = `${position.string}:${position.fret}`;
      if (seenPositions.has(positionKey)) {
        throw invalid('Fretboard enumeration produced a duplicate string/fret candidate.', {
          sourceGroupId,
          sourceEventId: event.sourceEventId,
          positionKey,
        });
      }
      seenPositions.add(positionKey);
      if (positionToMidi(position) !== targetMidi) {
        throw invalid('Fretboard candidate does not reproduce its enumerated MIDI pitch.', {
          sourceGroupId,
          sourceEventId: event.sourceEventId,
          targetMidi,
          position,
        });
      }
      candidates.push({
        sourceEventId: event.sourceEventId,
        sourceMidi,
        sourcePitchClass: pitchClass,
        targetMidi,
        octaveShiftSemitones: targetMidi - sourceMidi,
        string: position.string,
        fret: position.fret,
      });
      if (candidates.length > MAX_TONE_CANDIDATES_PER_SOURCE) {
        throw invalid('Revoicing tone candidate count exceeds the fixed per-source bound.', {
          sourceGroupId,
          sourceEventId: event.sourceEventId,
          limit: MAX_TONE_CANDIDATES_PER_SOURCE,
        });
      }
    }
  }

  if (candidates.length === 0) {
    throw invalid('Source pitch class has no realization on the configured guitar.', {
      sourceGroupId,
      sourceEventId: event.sourceEventId,
      sourceMidi,
    });
  }

  candidates.sort((left, right) => (
    left.targetMidi - right.targetMidi
    || left.string - right.string
    || left.fret - right.fret
  ));

  return {
    sourceEventId: event.sourceEventId,
    sourceMidi,
    sourcePitchClass: pitchClass,
    candidateCount: candidates.length,
    candidates,
  };
}

function buildGroup(group, sourceEventById) {
  if (group.memberCount < 2 || group.memberCount > MAX_SOURCE_EVENTS_PER_GROUP) {
    throw invalid('Revoicing candidate groups must contain 2 through 6 source notes.', {
      sourceGroupId: group.groupId,
      memberCount: group.memberCount,
    });
  }

  const sourceEvents = group.sourceEventIds.map((sourceEventId) => {
    const event = sourceEventById.get(sourceEventId);
    if (!event) {
      throw invalid('Simultaneous-event provenance cannot be resolved in source truth.', {
        sourceGroupId: group.groupId,
        sourceEventId,
      });
    }
    return event;
  });

  const pitchClassOwner = new Map();
  for (const event of sourceEvents) {
    const pitchClass = positiveModulo(event.pitch.midi, 12);
    const prior = pitchClassOwner.get(pitchClass);
    if (prior) {
      throw invalid('Version 1 revoicing tone enumeration requires unique source pitch classes.', {
        sourceGroupId: group.groupId,
        pitchClass,
        firstSourceEventId: prior,
        duplicateSourceEventId: event.sourceEventId,
      });
    }
    pitchClassOwner.set(pitchClass, event.sourceEventId);
  }

  const sources = sourceEvents.map((event) => enumerateSourceToneCandidates(event, group.groupId));
  const toneCandidateCount = sources.reduce((sum, source) => sum + source.candidateCount, 0);

  return {
    sourceGroupId: group.groupId,
    onsetDivisions: group.onsetDivisions,
    sourceEventCount: sourceEvents.length,
    sourceEventIds: [...group.sourceEventIds],
    toneCandidateCount,
    sources,
  };
}

function createRevoicingToneCandidateModel(sourceModel, runtime = null) {
  validatePolyphonicSourceModel(sourceModel, runtime);
  const source = sourceModel;
  const simultaneous = createSimultaneousEventModel(source, runtime);
  const sourceEventById = buildSourceEventIndex(source);
  const groups = [];

  for (const measure of simultaneous.measures) {
    for (const group of measure.groups) {
      if (runtime) runtime.checkpoint('revoicing-tone-candidates:group', { sourceGroupId: group.groupId });
      groups.push(buildGroup(group, sourceEventById));
    }
  }

  return deepFreeze({
    documentType: 'RevoicingToneCandidateModel',
    contractVersion: REVOICING_TONE_CANDIDATE_MODEL_VERSION,
    policy: REVOICING_TONE_CANDIDATE_POLICY,
    mode: 'evaluation-only',
    authority: 'none',
    source: {
      documentType: source.documentType,
      contractVersion: source.contractVersion,
      partId: source.source.partId,
    },
    registerEnvelope: { ...REGISTER },
    groupCount: groups.length,
    groups,
  });
}

module.exports = {
  REVOICING_TONE_CANDIDATE_MODEL_VERSION,
  REVOICING_TONE_CANDIDATE_POLICY,
  MAX_SOURCE_EVENTS_PER_GROUP,
  MAX_TONE_CANDIDATES_PER_SOURCE,
  RevoicingToneCandidateModelError,
  createRevoicingToneCandidateModel,
};
