'use strict';

const { EngineError } = require('../errors/engineError');
const {
  GUITAR_CONFIGURATION_VERSION,
  GUITAR_STRING_COUNT,
  DEFAULT_FRET_RANGE,
  createGuitarConfiguration,
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
  createSimultaneousEventModel,
} = require('./simultaneousEventModel');
const {
  DETERMINISTIC_REDUCTION_PLAN_VERSION,
  DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
  DETERMINISTIC_REDUCTION_POLICY,
  createDeterministicReductionPlan,
} = require('./deterministicReductionPlan');

const GUITAR_VOICING_CANDIDATE_MODEL_VERSION = '1.0.0';
const GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE = 'GuitarVoicingCandidateModel';
const GUITAR_VOICING_CANDIDATE_POLICY = 'STANDARD_SIX_STRING_DISTINCT_STRING_1.0';
const MAX_GUITAR_VOICING_CANDIDATES = 10_000;
const authenticGuitarVoicingCandidateModelSnapshots = new WeakSet();

class GuitarVoicingCandidateModelError extends EngineError {
  constructor(message, code = 'INVALID_GUITAR_VOICING_CANDIDATE_MODEL', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'GuitarVoicingCandidateModelError',
    );
  }
}

function invalid(message, details = {}) {
  return new GuitarVoicingCandidateModelError(message, 'INVALID_GUITAR_VOICING_CANDIDATE_MODEL', details);
}

function candidateLimitExceeded(observed, details = {}) {
  return new GuitarVoicingCandidateModelError(
    'PA-7 aggregate guitar voicing candidate count exceeds the fixed model limit.',
    'GUITAR_VOICING_CANDIDATE_LIMIT_EXCEEDED',
    {
      limit: MAX_GUITAR_VOICING_CANDIDATES,
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

function isAuthenticGuitarVoicingCandidateModelSnapshot(value) {
  return Boolean(value && typeof value === 'object'
    && authenticGuitarVoicingCandidateModelSnapshots.has(value));
}

function buildInstructionIndex(reduction, runtime) {
  const bySourceEventId = new Map();

  for (let instructionIndex = 0; instructionIndex < reduction.instructions.length; instructionIndex += 1) {
    checkpoint(runtime, 'guitar-voicing-candidate-model:instruction', { instructionIndex });
    const instruction = reduction.instructions[instructionIndex];
    if (bySourceEventId.has(instruction.sourceEventId)) {
      throw invalid('PA-7 encountered duplicate PA-6 instruction provenance.', {
        sourceEventId: instruction.sourceEventId,
      });
    }
    bySourceEventId.set(instruction.sourceEventId, instruction);
  }

  return bySourceEventId;
}

function validatePosition(position, targetMidi, sourceEventId, sourceGroupId, configuration) {
  const absoluteFret = Number.isInteger(position?.fret)
    ? configuration.capoFret + position.fret
    : null;
  if (
    !position
    || !Number.isInteger(position.string)
    || position.string < 1
    || position.string > GUITAR_STRING_COUNT
    || !Number.isInteger(position.fret)
    || position.fret < 0
    || absoluteFret < configuration.minimumFret
    || absoluteFret > configuration.maximumFret
  ) {
    throw invalid('Existing fretboard candidate logic returned an invalid six-string guitar position.', {
      sourceGroupId,
      sourceEventId,
      targetMidi,
    });
  }

  let observedMidi;
  try {
    observedMidi = positionToMidi(position, configuration);
  } catch {
    throw invalid('PA-7 could not round-trip a generated guitar position.', {
      sourceGroupId,
      sourceEventId,
      targetMidi,
      string: position.string,
      fret: position.fret,
    });
  }

  if (observedMidi !== targetMidi) {
    throw invalid('PA-7 generated position does not round-trip to the exact PA-6 target MIDI.', {
      sourceGroupId,
      sourceEventId,
      targetMidi,
      observedMidi,
      string: position.string,
      fret: position.fret,
    });
  }
}

function buildPositionLayers(group, activeEntries, runtime, configuration) {
  if (activeEntries.length > GUITAR_STRING_COUNT) return [];

  const positionLayers = new Array(activeEntries.length);
  for (let memberIndex = 0; memberIndex < activeEntries.length; memberIndex += 1) {
    checkpoint(runtime, 'guitar-voicing-candidate-model:position-layer', {
      sourceGroupId: group.groupId,
      memberIndex,
    });
    const entry = activeEntries[memberIndex];
    const positions = getPositionCandidates(entry.targetMidi, configuration);
    const normalized = new Array(positions.length);

    for (let positionIndex = 0; positionIndex < positions.length; positionIndex += 1) {
      checkpoint(runtime, 'guitar-voicing-candidate-model:position', {
        sourceGroupId: group.groupId,
        memberIndex,
        positionIndex,
      });
      const position = positions[positionIndex];
      validatePosition(position, entry.targetMidi, entry.sourceEventId, group.groupId, configuration);
      normalized[positionIndex] = Object.freeze({
        sourceEventId: entry.sourceEventId,
        targetMidi: entry.targetMidi,
        string: position.string,
        fret: position.fret,
      });
    }

    positionLayers[memberIndex] = normalized;
  }
  return positionLayers;
}

function countPreparedCandidates(group, activeEntries, positionLayers, runtime, maximum) {
  if (activeEntries.length > GUITAR_STRING_COUNT) return 0;
  let states = new Map([[0, 1]]);
  const cap = maximum + 1;

  for (let memberIndex = 0; memberIndex < positionLayers.length; memberIndex += 1) {
    checkpoint(runtime, 'guitar-voicing-candidate-model:precount-layer', {
      sourceGroupId: group.groupId,
      memberIndex,
      stateCount: states.size,
    });
    const next = new Map();
    const layer = positionLayers[memberIndex];

    for (const [usedMask, ways] of states) {
      for (let positionIndex = 0; positionIndex < layer.length; positionIndex += 1) {
        checkpoint(runtime, 'guitar-voicing-candidate-model:precount-position', {
          sourceGroupId: group.groupId,
          memberIndex,
          positionIndex,
        });
        const position = layer[positionIndex];
        const bit = 1 << (position.string - 1);
        if ((usedMask & bit) !== 0) continue;
        const nextMask = usedMask | bit;
        const observed = (next.get(nextMask) || 0) + ways;
        next.set(nextMask, Math.min(cap, observed));
      }
    }

    states = next;
    if (states.size === 0) return 0;
  }

  let total = 0;
  for (const ways of states.values()) {
    total = Math.min(cap, total + ways);
    if (total >= cap) return cap;
  }
  return total;
}

function enumeratePreparedGroupCandidates(group, activeEntries, positionLayers, runtime) {
  if (activeEntries.length > GUITAR_STRING_COUNT) {
    return Object.freeze([]);
  }

  const candidates = [];
  const working = new Array(activeEntries.length);
  const usedStrings = new Set();

  function visit(memberIndex) {
    checkpoint(runtime, 'guitar-voicing-candidate-model:assignment', {
      sourceGroupId: group.groupId,
      memberIndex,
      candidateCount: candidates.length,
    });

    if (memberIndex === activeEntries.length) {
      const candidateIndex = candidates.length;
      const positions = Object.freeze(working.map((position) => position));
      candidates.push(Object.freeze({
        candidateId: `${group.groupId}:voicing:${candidateIndex}`,
        positionCount: positions.length,
        positions,
      }));
      return;
    }

    const layer = positionLayers[memberIndex];
    for (let positionIndex = 0; positionIndex < layer.length; positionIndex += 1) {
      checkpoint(runtime, 'guitar-voicing-candidate-model:assignment-position', {
        sourceGroupId: group.groupId,
        memberIndex,
        positionIndex,
      });
      const position = layer[positionIndex];
      if (usedStrings.has(position.string)) continue;

      usedStrings.add(position.string);
      working[memberIndex] = position;
      visit(memberIndex + 1);
      usedStrings.delete(position.string);
    }
  }

  visit(0);
  return Object.freeze(candidates);
}

function createGuitarVoicingCandidateModel(
  sourceModel,
  arrangementDecisions,
  runtime = null,
  guitarOptions = {},
) {
  checkpoint(runtime, 'guitar-voicing-candidate-model:start');

  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const configuration = createGuitarConfiguration(guitarOptions);
  const grouping = createSimultaneousEventModel(source, runtime);
  const reduction = createDeterministicReductionPlan(source, arrangementDecisions, runtime, guitarOptions);
  const instructionsBySourceEventId = buildInstructionIndex(reduction, runtime);

  const groups = [];
  const pendingGroups = [];
  let candidateCount = 0;

  for (let measureIndex = 0; measureIndex < grouping.measures.length; measureIndex += 1) {
    const measure = grouping.measures[measureIndex];
    for (let groupIndex = 0; groupIndex < measure.groups.length; groupIndex += 1) {
      checkpoint(runtime, 'guitar-voicing-candidate-model:group', {
        measureIndex,
        groupIndex,
      });

      const group = measure.groups[groupIndex];
      const activeEntries = [];
      const activeSourceEventIds = [];
      const omittedSourceEventIds = [];
      const targetMidis = [];

      for (let memberIndex = 0; memberIndex < group.sourceEventIds.length; memberIndex += 1) {
        checkpoint(runtime, 'guitar-voicing-candidate-model:group-member', {
          measureIndex,
          groupIndex,
          memberIndex,
        });

        const sourceEventId = group.sourceEventIds[memberIndex];
        const instruction = instructionsBySourceEventId.get(sourceEventId);
        if (!instruction) {
          throw invalid('PA-7 could not join a PA-3 group member to exact PA-6 instruction provenance.', {
            sourceGroupId: group.groupId,
            sourceEventId,
          });
        }

        if (instruction.disposition === 'KEEP') {
          if (!Number.isInteger(instruction.targetMidi) || instruction.targetMidi < 0 || instruction.targetMidi > 127) {
            throw invalid('PA-7 KEEP instruction must contain an integer MIDI target.', {
              sourceGroupId: group.groupId,
              sourceEventId,
              targetMidi: instruction.targetMidi,
            });
          }
          activeEntries.push({
            sourceEventId,
            targetMidi: instruction.targetMidi,
          });
          activeSourceEventIds.push(sourceEventId);
          targetMidis.push(instruction.targetMidi);
          continue;
        }

        if (instruction.disposition === 'OMIT') {
          omittedSourceEventIds.push(sourceEventId);
          continue;
        }

        throw invalid('PA-7 encountered an unsupported PA-6 instruction disposition.', {
          sourceGroupId: group.groupId,
          sourceEventId,
          disposition: instruction.disposition,
        });
      }

      if (activeEntries.length < 2) {
        continue;
      }

      const positionLayers = buildPositionLayers(
        group,
        activeEntries,
        runtime,
        configuration,
      );
      const remaining = MAX_GUITAR_VOICING_CANDIDATES - candidateCount;
      const groupCandidateCount = countPreparedCandidates(
        group,
        activeEntries,
        positionLayers,
        runtime,
        remaining,
      );
      if (groupCandidateCount > remaining) {
        throw candidateLimitExceeded(MAX_GUITAR_VOICING_CANDIDATES + 1, {
          sourceGroupId: group.groupId,
        });
      }
      candidateCount += groupCandidateCount;
      pendingGroups.push({
        group,
        activeEntries,
        activeSourceEventIds,
        omittedSourceEventIds,
        targetMidis,
        positionLayers,
        candidateCount: groupCandidateCount,
      });
    }
  }

  for (let pendingIndex = 0; pendingIndex < pendingGroups.length; pendingIndex += 1) {
    const pending = pendingGroups[pendingIndex];
    checkpoint(runtime, 'guitar-voicing-candidate-model:materialize-group', {
      pendingIndex,
      sourceGroupId: pending.group.groupId,
      candidateCount: pending.candidateCount,
    });
    const candidates = enumeratePreparedGroupCandidates(
      pending.group,
      pending.activeEntries,
      pending.positionLayers,
      runtime,
    );
    if (candidates.length !== pending.candidateCount) {
      throw invalid('PA-7 candidate pre-count disagrees with deterministic materialization.', {
        sourceGroupId: pending.group.groupId,
        expectedCandidateCount: pending.candidateCount,
        observedCandidateCount: candidates.length,
      });
    }
    groups.push(Object.freeze({
      sourceGroupId: pending.group.groupId,
      onsetDivisions: pending.group.onsetDivisions,
      sourceEventIds: Object.freeze([...pending.group.sourceEventIds]),
      activeSourceEventIds: Object.freeze(pending.activeSourceEventIds),
      omittedSourceEventIds: Object.freeze(pending.omittedSourceEventIds),
      targetMidis: Object.freeze(pending.targetMidis),
      candidateCount: candidates.length,
      candidates,
    }));
  }

  checkpoint(runtime, 'guitar-voicing-candidate-model:complete', {
    groupCount: groups.length,
    candidateCount,
  });

  const snapshot = Object.freeze({
    documentType: GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
    contractVersion: GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
    policy: GUITAR_VOICING_CANDIDATE_POLICY,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    reduction: Object.freeze({
      documentType: DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
      contractVersion: DETERMINISTIC_REDUCTION_PLAN_VERSION,
      policy: DETERMINISTIC_REDUCTION_POLICY,
    }),
    configuration: Object.freeze({
      contractVersion: GUITAR_CONFIGURATION_VERSION,
      stringCount: GUITAR_STRING_COUNT,
      minimumFret: configuration.minimumFret,
      maximumFret: configuration.maximumFret,
    }),
    groupCount: groups.length,
    candidateCount,
    groups: Object.freeze(groups),
  });
  authenticGuitarVoicingCandidateModelSnapshots.add(snapshot);
  return snapshot;
}

module.exports = {
  GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
  GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
  GUITAR_VOICING_CANDIDATE_POLICY,
  MAX_GUITAR_VOICING_CANDIDATES,
  GuitarVoicingCandidateModelError,
  createGuitarVoicingCandidateModel,
  isAuthenticGuitarVoicingCandidateModelSnapshot,
};
