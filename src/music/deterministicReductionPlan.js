'use strict';

const { EngineError } = require('../errors/engineError');
const { createGuitarArrangementRegister } = require('../guitar/guitarArrangementRegister');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  GUITAR_ARRANGEMENT_PLAN_VERSION,
  GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
  createGuitarArrangementPlan,
} = require('./guitarArrangementPlan');
const {
  DETERMINISTIC_VOICE_ANALYSIS_VERSION,
  DETERMINISTIC_VOICE_ANALYSIS_DOCUMENT_TYPE,
  DETERMINISTIC_VOICE_ANALYSIS_BASIS,
  createDeterministicVoiceAnalysis,
} = require('./deterministicVoiceAnalysis');

const DETERMINISTIC_REDUCTION_PLAN_VERSION = '1.0.0';
const DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE = 'DeterministicReductionPlan';
const DETERMINISTIC_REDUCTION_POLICY = 'STANDARD_GUITAR_REGISTER_20_FRET_1.0';
const DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK = 'DOWNWARD_TIE_BREAK_1.0';


class DeterministicReductionPlanError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_DETERMINISTIC_REDUCTION_PLAN',
      details,
      'DeterministicReductionPlanError',
    );
  }
}

function invalid(message, details = {}) {
  return new DeterministicReductionPlanError(message, details);
}

function checkpoint(runtime, phase, details) {
  if (runtime) {
    runtime.checkpoint(phase, details);
  }
}

function inRegister(midi, registerEnvelope) {
  return midi >= registerEnvelope.minimumMidi && midi <= registerEnvelope.maximumMidi;
}

function buildSourceNoteIndex(source, runtime) {
  const orderedNotes = [];
  const notesById = new Map();

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    const measure = source.measures[measureIndex];
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'deterministic-reduction-plan:source-event', {
        measureIndex,
        eventIndex,
      });
      const event = measure.events[eventIndex];
      if (event.type !== 'note') {
        continue;
      }
      orderedNotes.push(event);
      notesById.set(event.sourceEventId, event);
    }
  }

  return { orderedNotes, notesById };
}

function buildDecisionIndex(arrangement, runtime) {
  const decisionsByEventId = new Map();
  for (let decisionIndex = 0; decisionIndex < arrangement.decisions.length; decisionIndex += 1) {
    checkpoint(runtime, 'deterministic-reduction-plan:decision', { decisionIndex });
    const decision = arrangement.decisions[decisionIndex];
    for (let memberIndex = 0; memberIndex < decision.sourceEventIds.length; memberIndex += 1) {
      checkpoint(runtime, 'deterministic-reduction-plan:decision-member', {
        decisionIndex,
        memberIndex,
      });
      decisionsByEventId.set(decision.sourceEventIds[memberIndex], decision);
    }
  }
  return decisionsByEventId;
}

function buildAnalysisIndex(analysis, runtime) {
  const analysisByEventId = new Map();
  for (let analysisIndex = 0; analysisIndex < analysis.eventAnalyses.length; analysisIndex += 1) {
    checkpoint(runtime, 'deterministic-reduction-plan:analysis-event', { analysisIndex });
    const entry = analysis.eventAnalyses[analysisIndex];
    analysisByEventId.set(entry.sourceEventId, entry);
  }
  return analysisByEventId;
}

function selectOctaveTarget(sourceMidi, runtime, details, registerEnvelope) {
  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;

  for (let targetMidi = registerEnvelope.minimumMidi; targetMidi <= registerEnvelope.maximumMidi; targetMidi += 1) {
    checkpoint(runtime, 'deterministic-reduction-plan:octave-candidate', {
      ...details,
      targetMidi,
    });
    if (targetMidi === sourceMidi || ((targetMidi - sourceMidi) % 12) !== 0) {
      continue;
    }

    const distance = Math.abs(targetMidi - sourceMidi);
    if (
      distance < selectedDistance
      || (distance === selectedDistance && (selected === null || targetMidi < selected))
    ) {
      selected = targetMidi;
      selectedDistance = distance;
    }
  }

  if (selected === null) {
    throw invalid('No non-zero pitch-class-equivalent octave target exists inside the PA-6 register envelope.', {
      ...details,
      sourceMidi,
      minimumMidi: registerEnvelope.minimumMidi,
      maximumMidi: registerEnvelope.maximumMidi,
    });
  }

  return selected;
}

function instructionForSingleNote(event, decision, analysisEntry, runtime, registerEnvelope) {
  checkpoint(runtime, 'deterministic-reduction-plan:execute-single', {
    sourceEventId: event.sourceEventId,
    decisionId: decision.decisionId,
    decisionType: decision.decisionType,
  });

  if (decision.decisionType === 'PRESERVED') {
    if (!inRegister(event.pitch.midi, registerEnvelope)) {
      throw invalid('PRESERVED source pitch lies outside the configured PA-6 register envelope.', {
        sourceEventId: event.sourceEventId,
        sourceMidi: event.pitch.midi,
      });
    }
    return {
      disposition: 'KEEP',
      targetMidi: event.pitch.midi,
      octaveShiftSemitones: 0,
      ruleId: 'PRESERVE_IN_REGISTER',
    };
  }

  if (decision.decisionType === 'OMITTED') {
    return {
      disposition: 'OMIT',
      targetMidi: null,
      octaveShiftSemitones: null,
      ruleId: 'OMIT_EXPLICIT',
    };
  }

  if (decision.decisionType === 'OCTAVE_DISPLACED') {
    const targetMidi = selectOctaveTarget(event.pitch.midi, runtime, {
      sourceEventId: event.sourceEventId,
      decisionId: decision.decisionId,
    }, registerEnvelope);
    const octaveShiftSemitones = targetMidi - event.pitch.midi;
    if (
      octaveShiftSemitones === 0
      || (octaveShiftSemitones % 12) !== 0
      || !inRegister(targetMidi, registerEnvelope)
    ) {
      throw invalid('OCTAVE_DISPLACED did not produce a valid non-zero octave shift.', {
        sourceEventId: event.sourceEventId,
        sourceMidi: event.pitch.midi,
        targetMidi,
      });
    }
    return {
      disposition: 'KEEP',
      targetMidi,
      octaveShiftSemitones,
      ruleId: 'OCTAVE_NEAREST_IN_REGISTER',
    };
  }

  if (decision.decisionType === 'VOICE_REDISTRIBUTED') {
    throw invalid('VOICE_REDISTRIBUTED execution is deferred beyond PA-6 v1.', {
      sourceEventId: event.sourceEventId,
      decisionId: decision.decisionId,
    });
  }

  throw invalid('Single-note arrangement decision is not executable in PA-6 v1.', {
    sourceEventId: event.sourceEventId,
    decisionId: decision.decisionId,
    decisionType: decision.decisionType,
    sourceRole: analysisEntry.role,
  });
}

function buildChordReductionOutcomes(decision, notesById, analysisByEventId, runtime, registerEnvelope) {
  const entries = [];
  let melodyCount = 0;
  let bassCount = 0;
  let innerCount = 0;
  let ambiguousCount = 0;

  for (let memberIndex = 0; memberIndex < decision.sourceEventIds.length; memberIndex += 1) {
    checkpoint(runtime, 'deterministic-reduction-plan:chord-member', {
      decisionId: decision.decisionId,
      memberIndex,
    });
    const sourceEventId = decision.sourceEventIds[memberIndex];
    const event = notesById.get(sourceEventId);
    const analysisEntry = analysisByEventId.get(sourceEventId);
    if (!event || !analysisEntry || analysisEntry.sourceGroupId !== decision.sourceGroupId) {
      throw invalid('CHORD_REDUCED provenance does not match internally recomputed PA-5/PA-3 data.', {
        decisionId: decision.decisionId,
        sourceEventId,
        sourceGroupId: decision.sourceGroupId,
      });
    }

    switch (analysisEntry.role) {
      case 'MELODY_CANDIDATE':
        melodyCount += 1;
        break;
      case 'BASS_CANDIDATE':
        bassCount += 1;
        break;
      case 'INNER_VOICE_CANDIDATE':
        innerCount += 1;
        break;
      case 'OUTER_VOICE_AMBIGUOUS':
        ambiguousCount += 1;
        break;
      default:
        throw invalid('CHORD_REDUCED requires multi-note PA-5 register roles.', {
          decisionId: decision.decisionId,
          sourceEventId,
          sourceRole: analysisEntry.role,
        });
    }
    entries.push({ event, analysisEntry });
  }

  if (melodyCount !== 1 || bassCount !== 1 || innerCount < 1 || ambiguousCount !== 0) {
    throw invalid('CHORD_REDUCED requires one unique melody candidate, one unique bass candidate, at least one inner candidate, and no ambiguous outer candidates.', {
      decisionId: decision.decisionId,
      melodyCount,
      bassCount,
      innerCount,
      ambiguousCount,
    });
  }

  const outcomes = new Map();
  for (let memberIndex = 0; memberIndex < entries.length; memberIndex += 1) {
    checkpoint(runtime, 'deterministic-reduction-plan:chord-outcome', {
      decisionId: decision.decisionId,
      memberIndex,
    });
    const { event, analysisEntry } = entries[memberIndex];
    if (
      analysisEntry.role === 'MELODY_CANDIDATE'
      || analysisEntry.role === 'BASS_CANDIDATE'
    ) {
      if (!inRegister(event.pitch.midi, registerEnvelope)) {
        throw invalid('CHORD_REDUCED outer survivor lies outside the configured PA-6 register envelope.', {
          decisionId: decision.decisionId,
          sourceEventId: event.sourceEventId,
          sourceMidi: event.pitch.midi,
        });
      }
      outcomes.set(event.sourceEventId, {
        disposition: 'KEEP',
        targetMidi: event.pitch.midi,
        octaveShiftSemitones: 0,
        ruleId: 'CHORD_REDUCTION_KEEP_OUTER',
      });
    } else {
      outcomes.set(event.sourceEventId, {
        disposition: 'OMIT',
        targetMidi: null,
        octaveShiftSemitones: null,
        ruleId: 'CHORD_REDUCTION_OMIT_INNER',
      });
    }
  }

  return outcomes;
}

function createDeterministicReductionPlan(sourceModel, arrangementDecisions, runtime = null, guitarOptions = {}) {
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const arrangement = createGuitarArrangementPlan(source, arrangementDecisions, runtime);
  const analysis = createDeterministicVoiceAnalysis(source, runtime);
  const registerEnvelope = createGuitarArrangementRegister(guitarOptions);

  const { orderedNotes, notesById } = buildSourceNoteIndex(source, runtime);
  const decisionsByEventId = buildDecisionIndex(arrangement, runtime);
  const analysisByEventId = buildAnalysisIndex(analysis, runtime);
  const groupOutcomesByDecisionId = new Map();
  const instructions = new Array(orderedNotes.length);

  for (let noteIndex = 0; noteIndex < orderedNotes.length; noteIndex += 1) {
    checkpoint(runtime, 'deterministic-reduction-plan:instruction', { noteIndex });
    const event = orderedNotes[noteIndex];
    const decision = decisionsByEventId.get(event.sourceEventId);
    const analysisEntry = analysisByEventId.get(event.sourceEventId);
    if (!decision || !analysisEntry) {
      throw invalid('PA-6 could not resolve internally recomputed decision/analysis provenance.', {
        sourceEventId: event.sourceEventId,
      });
    }

    let outcome;
    if (decision.decisionType === 'CHORD_REDUCED') {
      let groupOutcomes = groupOutcomesByDecisionId.get(decision.decisionId);
      if (!groupOutcomes) {
        groupOutcomes = buildChordReductionOutcomes(
          decision,
          notesById,
          analysisByEventId,
          runtime,
          registerEnvelope,
        );
        groupOutcomesByDecisionId.set(decision.decisionId, groupOutcomes);
      }
      outcome = groupOutcomes.get(event.sourceEventId);
    } else if (
      decision.decisionType === 'REVOICED'
      || decision.decisionType === 'ARPEGGIATED'
    ) {
      throw invalid(`${decision.decisionType} execution is deferred beyond PA-6 v1.`, {
        decisionId: decision.decisionId,
        sourceGroupId: decision.sourceGroupId,
      });
    } else {
      outcome = instructionForSingleNote(event, decision, analysisEntry, runtime, registerEnvelope);
    }

    if (!outcome) {
      throw invalid('PA-6 did not produce exactly one instruction outcome for a source note.', {
        sourceEventId: event.sourceEventId,
        decisionId: decision.decisionId,
      });
    }

    instructions[noteIndex] = Object.freeze({
      sourceEventId: event.sourceEventId,
      decisionId: decision.decisionId,
      decisionType: decision.decisionType,
      sourceGroupId: decision.sourceGroupId,
      sourceRole: analysisEntry.role,
      disposition: outcome.disposition,
      targetMidi: outcome.targetMidi,
      octaveShiftSemitones: outcome.octaveShiftSemitones,
      ruleId: outcome.ruleId,
    });
  }

  checkpoint(runtime, 'deterministic-reduction-plan:complete', {
    instructionCount: instructions.length,
  });

  return Object.freeze({
    documentType: DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
    contractVersion: DETERMINISTIC_REDUCTION_PLAN_VERSION,
    policy: DETERMINISTIC_REDUCTION_POLICY,
    octaveTieBreak: DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    arrangement: Object.freeze({
      documentType: GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
      contractVersion: GUITAR_ARRANGEMENT_PLAN_VERSION,
    }),
    analysis: Object.freeze({
      documentType: DETERMINISTIC_VOICE_ANALYSIS_DOCUMENT_TYPE,
      contractVersion: DETERMINISTIC_VOICE_ANALYSIS_VERSION,
      analysisBasis: DETERMINISTIC_VOICE_ANALYSIS_BASIS,
    }),
    registerEnvelope: Object.freeze({
      minimumMidi: registerEnvelope.minimumMidi,
      maximumMidi: registerEnvelope.maximumMidi,
    }),
    instructionCount: instructions.length,
    instructions: Object.freeze(instructions),
  });
}

module.exports = {
  DETERMINISTIC_REDUCTION_PLAN_VERSION,
  DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
  DETERMINISTIC_REDUCTION_POLICY,
  DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK,
  DeterministicReductionPlanError,
  createDeterministicReductionPlan,
};