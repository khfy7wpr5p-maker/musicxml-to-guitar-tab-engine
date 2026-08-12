'use strict';

const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  SIMULTANEOUS_EVENT_MODEL_VERSION,
  SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE,
  createSimultaneousEventModel,
} = require('./simultaneousEventModel');

const DETERMINISTIC_VOICE_ANALYSIS_VERSION = '1.0.0';
const DETERMINISTIC_VOICE_ANALYSIS_DOCUMENT_TYPE = 'DeterministicVoiceAnalysis';
const DETERMINISTIC_VOICE_ANALYSIS_BASIS = 'ONSET_LOCAL_REGISTER_1.0';
const DETERMINISTIC_VOICE_ROLES = Object.freeze([
  'SOLE_NOTE',
  'MELODY_CANDIDATE',
  'BASS_CANDIDATE',
  'INNER_VOICE_CANDIDATE',
  'OUTER_VOICE_AMBIGUOUS',
]);

function checkpoint(runtime, phase, details) {
  if (runtime) {
    runtime.checkpoint(phase, details);
  }
}

function buildSourceGroupIndex(simultaneousModel, runtime) {
  const sourceGroupByEventId = new Map();

  for (let measureIndex = 0; measureIndex < simultaneousModel.measures.length; measureIndex += 1) {
    const measure = simultaneousModel.measures[measureIndex];
    for (let groupIndex = 0; groupIndex < measure.groups.length; groupIndex += 1) {
      const group = measure.groups[groupIndex];
      checkpoint(runtime, 'deterministic-voice-analysis:group', {
        measureIndex,
        groupIndex,
      });

      for (let memberIndex = 0; memberIndex < group.sourceEventIds.length; memberIndex += 1) {
        checkpoint(runtime, 'deterministic-voice-analysis:group-member', {
          measureIndex,
          groupIndex,
          memberIndex,
        });
        sourceGroupByEventId.set(group.sourceEventIds[memberIndex], group.groupId);
      }
    }
  }

  return sourceGroupByEventId;
}

function classifyOnsetMembers(members, runtime, location) {
  if (members.length === 1) {
    return new Map([[members[0].sourceEventId, 'SOLE_NOTE']]);
  }

  let minimumMidi = members[0].pitch.midi;
  let maximumMidi = members[0].pitch.midi;
  let minimumCount = 0;
  let maximumCount = 0;

  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    checkpoint(runtime, 'deterministic-voice-analysis:register-scan', {
      ...location,
      memberIndex,
    });
    const midi = members[memberIndex].pitch.midi;
    if (midi < minimumMidi) {
      minimumMidi = midi;
    }
    if (midi > maximumMidi) {
      maximumMidi = midi;
    }
  }

  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    checkpoint(runtime, 'deterministic-voice-analysis:extrema-count', {
      ...location,
      memberIndex,
    });
    const midi = members[memberIndex].pitch.midi;
    if (midi === minimumMidi) {
      minimumCount += 1;
    }
    if (midi === maximumMidi) {
      maximumCount += 1;
    }
  }

  const roles = new Map();
  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    checkpoint(runtime, 'deterministic-voice-analysis:classify-member', {
      ...location,
      memberIndex,
    });
    const member = members[memberIndex];
    const midi = member.pitch.midi;
    let role;

    if (minimumMidi === maximumMidi) {
      role = 'OUTER_VOICE_AMBIGUOUS';
    } else if (midi === maximumMidi) {
      role = maximumCount === 1 ? 'MELODY_CANDIDATE' : 'OUTER_VOICE_AMBIGUOUS';
    } else if (midi === minimumMidi) {
      role = minimumCount === 1 ? 'BASS_CANDIDATE' : 'OUTER_VOICE_AMBIGUOUS';
    } else {
      role = 'INNER_VOICE_CANDIDATE';
    }

    roles.set(member.sourceEventId, role);
  }

  return roles;
}

function buildRoleIndex(source, runtime) {
  const roleByEventId = new Map();

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    checkpoint(runtime, 'deterministic-voice-analysis:measure', { measureIndex });
    const measure = source.measures[measureIndex];
    const notesByOnset = new Map();

    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'deterministic-voice-analysis:event', {
        measureIndex,
        eventIndex,
      });
      const event = measure.events[eventIndex];
      if (event.type !== 'note') {
        continue;
      }

      let members = notesByOnset.get(event.onsetDivisions);
      if (!members) {
        members = [];
        notesByOnset.set(event.onsetDivisions, members);
      }
      members.push(event);
    }

    const sortedOnsets = [...notesByOnset.keys()].sort((left, right) => left - right);
    for (let onsetIndex = 0; onsetIndex < sortedOnsets.length; onsetIndex += 1) {
      checkpoint(runtime, 'deterministic-voice-analysis:onset', {
        measureIndex,
        onsetIndex,
      });
      const onsetDivisions = sortedOnsets[onsetIndex];
      const roles = classifyOnsetMembers(
        notesByOnset.get(onsetDivisions),
        runtime,
        { measureIndex, onsetIndex, onsetDivisions },
      );
      for (const [sourceEventId, role] of roles) {
        roleByEventId.set(sourceEventId, role);
      }
    }
  }

  return roleByEventId;
}

function createSummaryState(event) {
  return {
    voice: event.voice,
    staff: event.staff,
    noteCount: 0,
    soleNoteCount: 0,
    melodyCandidateCount: 0,
    bassCandidateCount: 0,
    innerVoiceCandidateCount: 0,
    ambiguousOuterCount: 0,
  };
}

function incrementSummary(summary, role) {
  summary.noteCount += 1;
  switch (role) {
    case 'SOLE_NOTE':
      summary.soleNoteCount += 1;
      break;
    case 'MELODY_CANDIDATE':
      summary.melodyCandidateCount += 1;
      break;
    case 'BASS_CANDIDATE':
      summary.bassCandidateCount += 1;
      break;
    case 'INNER_VOICE_CANDIDATE':
      summary.innerVoiceCandidateCount += 1;
      break;
    case 'OUTER_VOICE_AMBIGUOUS':
      summary.ambiguousOuterCount += 1;
      break;
    default:
      throw new Error('Unreachable deterministic voice-analysis role.');
  }
}

function createDeterministicVoiceAnalysis(sourceModel, runtime = null) {
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const simultaneousModel = createSimultaneousEventModel(source, runtime);
  const sourceGroupByEventId = buildSourceGroupIndex(simultaneousModel, runtime);
  const roleByEventId = buildRoleIndex(source, runtime);

  const eventAnalyses = [];
  const summaryStates = [];
  const summariesByStaff = new Map();

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    const measure = source.measures[measureIndex];
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'deterministic-voice-analysis:emit-event', {
        measureIndex,
        eventIndex,
      });
      const event = measure.events[eventIndex];
      if (event.type !== 'note') {
        continue;
      }

      const role = roleByEventId.get(event.sourceEventId);
      const sourceGroupId = sourceGroupByEventId.get(event.sourceEventId) || null;
      eventAnalyses.push(Object.freeze({
        sourceEventId: event.sourceEventId,
        sourceGroupId,
        voice: event.voice,
        staff: event.staff,
        role,
      }));

      let summariesByVoice = summariesByStaff.get(event.staff);
      if (!summariesByVoice) {
        summariesByVoice = new Map();
        summariesByStaff.set(event.staff, summariesByVoice);
      }
      let summary = summariesByVoice.get(event.voice);
      if (!summary) {
        summary = createSummaryState(event);
        summariesByVoice.set(event.voice, summary);
        summaryStates.push(summary);
      }
      incrementSummary(summary, role);
    }
  }

  const voiceSummaries = new Array(summaryStates.length);
  for (let summaryIndex = 0; summaryIndex < summaryStates.length; summaryIndex += 1) {
    checkpoint(runtime, 'deterministic-voice-analysis:summary', { summaryIndex });
    voiceSummaries[summaryIndex] = Object.freeze({ ...summaryStates[summaryIndex] });
  }

  return Object.freeze({
    documentType: DETERMINISTIC_VOICE_ANALYSIS_DOCUMENT_TYPE,
    contractVersion: DETERMINISTIC_VOICE_ANALYSIS_VERSION,
    analysisBasis: DETERMINISTIC_VOICE_ANALYSIS_BASIS,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    grouping: Object.freeze({
      documentType: SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE,
      contractVersion: SIMULTANEOUS_EVENT_MODEL_VERSION,
    }),
    eventAnalysisCount: eventAnalyses.length,
    eventAnalyses: Object.freeze(eventAnalyses),
    voiceSummaryCount: voiceSummaries.length,
    voiceSummaries: Object.freeze(voiceSummaries),
  });
}

module.exports = {
  DETERMINISTIC_VOICE_ANALYSIS_VERSION,
  DETERMINISTIC_VOICE_ANALYSIS_DOCUMENT_TYPE,
  DETERMINISTIC_VOICE_ANALYSIS_BASIS,
  DETERMINISTIC_VOICE_ROLES,
  createDeterministicVoiceAnalysis,
};