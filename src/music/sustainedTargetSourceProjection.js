'use strict';

const { EngineError } = require('../errors/engineError');
const {
  createPolyphonicSourceModel,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');

const SUSTAINED_TARGET_SOURCE_PROJECTION_VERSION = '1.0.0';
const SUSTAINED_TARGET_SOURCE_PROJECTION_AUTHORITY = 'PA6_TARGET_PITCH_SOLVER_VIEW_ONLY';

class SustainedTargetSourceProjectionError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'UNSUPPORTED_SUSTAINED_TARGET_SOURCE_PROJECTION',
      Object.freeze({ ...details }),
      'SustainedTargetSourceProjectionError',
    );
  }
}

function unsupported(message, reason, details = {}) {
  throw new SustainedTargetSourceProjectionError(message, { reason, ...details });
}

function writtenPitch(step, alter, octave) {
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[String(alter)];
  if (accidental === undefined) unsupported('Target projection received unsupported pitch spelling.', 'UNSUPPORTED_SOURCE_PITCH_SPELLING', { step, alter, octave });
  return `${step}${accidental}${octave}`;
}

function clonePitchAtTarget(pitch, instruction) {
  if (instruction.disposition !== 'KEEP') {
    unsupported('Sustained target source projection requires every source note to be retained.', 'OMITTED_SOURCE_NOTE_NOT_SUPPORTED', { sourceEventId: instruction.sourceEventId, disposition: instruction.disposition });
  }
  const shift = instruction.octaveShiftSemitones;
  if (
    !Number.isSafeInteger(instruction.sourceMidi)
    || !Number.isSafeInteger(instruction.targetMidi)
    || !Number.isSafeInteger(shift)
    || shift % 12 !== 0
    || instruction.sourceMidi !== pitch.midi
    || instruction.targetMidi !== instruction.sourceMidi + shift
  ) {
    unsupported('Sustained target source projection requires an exact whole-octave PA-6 target.', 'INVALID_TARGET_PITCH_PROJECTION', {
      sourceEventId: instruction.sourceEventId,
      sourceMidi: instruction.sourceMidi,
      targetMidi: instruction.targetMidi,
      octaveShiftSemitones: shift,
      observedSourceMidi: pitch.midi,
    });
  }
  const octave = pitch.octave + (shift / 12);
  return {
    step: pitch.step,
    alter: pitch.alter,
    octave,
    midi: instruction.targetMidi,
    written: writtenPitch(pitch.step, pitch.alter, octave),
  };
}

function cloneSourceLocation(source) {
  return {
    partId: source.partId,
    measureIndex: source.measureIndex,
    measureNumber: source.measureNumber,
    noteIndex: source.noteIndex,
    chordWithPrevious: source.chordWithPrevious,
  };
}

function cloneEvent(event, instructionById) {
  const cloned = {
    sourceEventId: event.sourceEventId,
    sourceOrder: event.sourceOrder,
    type: event.type,
    voice: event.voice,
    staff: event.staff,
    onsetDivisions: event.onsetDivisions,
    durationDivisions: event.durationDivisions,
    tieStart: event.tieStart,
    tieStop: event.tieStop,
    source: cloneSourceLocation(event.source),
  };
  if (event.type === 'note') {
    const instruction = instructionById.get(event.sourceEventId);
    if (!instruction) unsupported('Sustained target source projection lost PA-6 instruction provenance.', 'MISSING_TARGET_INSTRUCTION', { sourceEventId: event.sourceEventId });
    cloned.pitch = clonePitchAtTarget(event.pitch, instruction);
  }
  return cloned;
}

function createSustainedTargetSourceProjection(sourceModel, bridgeProjection, runtime = null) {
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  if (!bridgeProjection || !Array.isArray(bridgeProjection.instructions)) {
    unsupported('Sustained target source projection requires bridge instructions.', 'INVALID_BRIDGE_PROJECTION');
  }
  const instructionById = new Map(bridgeProjection.instructions.map((instruction) => [instruction.sourceEventId, instruction]));
  const input = {
    documentType: source.documentType,
    contractVersion: source.contractVersion,
    source: {
      format: source.source.format,
      musicXmlVersion: source.source.musicXmlVersion,
      partId: source.source.partId,
    },
    measureCount: source.measureCount,
    eventCount: source.eventCount,
    measures: source.measures.map((measure) => ({
      measureId: measure.measureId,
      index: measure.index,
      number: measure.number,
      implicit: measure.implicit,
      divisions: measure.divisions,
      timeSignature: { beats: measure.timeSignature.beats, beatType: measure.timeSignature.beatType },
      expectedDurationDivisions: measure.expectedDurationDivisions,
      events: measure.events.map((event) => cloneEvent(event, instructionById)),
    })),
  };
  const projectedSourceModel = createPolyphonicSourceModel(input, runtime);
  return Object.freeze({
    contractVersion: SUSTAINED_TARGET_SOURCE_PROJECTION_VERSION,
    authority: SUSTAINED_TARGET_SOURCE_PROJECTION_AUTHORITY,
    projectedSourceModel,
  });
}

module.exports = {
  SUSTAINED_TARGET_SOURCE_PROJECTION_VERSION,
  SUSTAINED_TARGET_SOURCE_PROJECTION_AUTHORITY,
  SustainedTargetSourceProjectionError,
  createSustainedTargetSourceProjection,
};
