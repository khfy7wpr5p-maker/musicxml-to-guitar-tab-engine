'use strict';

const {
  GUITAR_CONFIGURATION_VERSION,
  createGuitarConfiguration,
} = require('../guitar/tuning');
const {
  GUITAR_ARRANGEMENT_PLAN_VERSION,
  GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
} = require('../music/guitarArrangementPlan');
const {
  DETERMINISTIC_REDUCTION_PLAN_VERSION,
  DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
  DETERMINISTIC_REDUCTION_POLICY,
  DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK,
} = require('../music/deterministicReductionPlan');
const {
  GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
  GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
  GUITAR_VOICING_CANDIDATE_POLICY,
} = require('../music/guitarVoicingCandidateModel');
const {
  LEFT_HAND_SHAPE_MODEL_VERSION,
  LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
  LEFT_HAND_SHAPE_POLICY,
} = require('../music/leftHandShapeModel');
const {
  PHYSICAL_PLAYABILITY_VALIDATION_VERSION,
  PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE,
  PHYSICAL_PLAYABILITY_POLICY,
  MAXIMUM_STATIC_FRET_SPAN,
  MAXIMUM_EXTRA_FRET_REACH,
} = require('../music/physicalPlayabilityValidatorV2');
const {
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY,
} = require('../music/deterministicPolyphonicFinalSelector');

function clonePitch(pitch, octaveShiftSemitones = 0, targetMidi = pitch.midi) {
  const octave = pitch.octave + (octaveShiftSemitones / 12);
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[pitch.alter];
  return {
    step: pitch.step,
    alter: pitch.alter,
    octave,
    midi: targetMidi,
    written: `${pitch.step}${accidental}${octave}`,
  };
}

function cloneEvent(event) {
  const base = {
    sourceEventId: event.sourceEventId,
    sourceOrder: event.sourceOrder,
    type: event.type,
    voice: event.voice,
    staff: event.staff,
    onsetDivisions: event.onsetDivisions,
    durationDivisions: event.durationDivisions,
    tieStart: event.tieStart,
    tieStop: event.tieStop,
    source: {
      partId: event.source.partId,
      measureIndex: event.source.measureIndex,
      measureNumber: event.source.measureNumber,
      noteIndex: event.source.noteIndex,
      chordWithPrevious: event.source.chordWithPrevious,
    },
  };
  if (event.type === 'note') base.pitch = clonePitch(event.pitch);
  return base;
}

function createGuitarFacts() {
  const guitar = createGuitarConfiguration();
  return {
    contractVersion: GUITAR_CONFIGURATION_VERSION,
    tuning: guitar.tuning.map((entry) => ({
      number: entry.number,
      pitch: entry.pitch,
      midi: entry.midi,
    })),
    minimumFret: guitar.minimumFret,
    maximumFret: guitar.maximumFret,
  };
}

function createPolicyProvenance() {
  return {
    arrangement: {
      documentType: GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
      contractVersion: GUITAR_ARRANGEMENT_PLAN_VERSION,
    },
    reduction: {
      documentType: DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
      contractVersion: DETERMINISTIC_REDUCTION_PLAN_VERSION,
      policy: DETERMINISTIC_REDUCTION_POLICY,
      octaveTieBreak: DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK,
    },
    voicing: {
      documentType: GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
      contractVersion: GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
      policy: GUITAR_VOICING_CANDIDATE_POLICY,
    },
    leftHand: {
      documentType: LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
      contractVersion: LEFT_HAND_SHAPE_MODEL_VERSION,
      policy: LEFT_HAND_SHAPE_POLICY,
    },
    physicalValidation: {
      documentType: PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE,
      contractVersion: PHYSICAL_PLAYABILITY_VALIDATION_VERSION,
      policy: PHYSICAL_PLAYABILITY_POLICY,
      configuration: {
        maximumStaticFretSpan: MAXIMUM_STATIC_FRET_SPAN,
        maximumExtraFretReach: MAXIMUM_EXTRA_FRET_REACH,
      },
    },
    finalSelection: {
      policyId: DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY,
      policyVersion: DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION,
    },
  };
}

function createMeasureFacts(source) {
  return source.measures.map((measure) => ({
    measureId: measure.measureId,
    index: measure.index,
    number: measure.number,
    implicit: measure.implicit,
    divisions: measure.divisions,
    timeSignature: {
      beats: measure.timeSignature.beats,
      beatType: measure.timeSignature.beatType,
    },
    expectedDurationDivisions: measure.expectedDurationDivisions,
    events: measure.events.map(cloneEvent),
  }));
}

function createGroupFacts(grouping) {
  return grouping.measures.flatMap((measure) => (
    measure.groups.map((group) => ({
      groupId: group.groupId,
      measureId: measure.measureId,
      onsetDivisions: group.onsetDivisions,
      sourceEventIds: [...group.sourceEventIds],
    }))
  ));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

module.exports = {
  clonePitch,
  createGuitarFacts,
  createPolicyProvenance,
  createMeasureFacts,
  createGroupFacts,
  deepFreeze,
};