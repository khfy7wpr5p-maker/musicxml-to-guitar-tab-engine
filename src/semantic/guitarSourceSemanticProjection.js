'use strict';

const {
  validatePolyphonicSourceModel,
} = require('../music/polyphonicSourceModel');

const GUITAR_SOURCE_SEMANTIC_PROJECTION_VERSION = 'st-guitar-source-semantic-projection-v1';

function freezeResult(status, diagnostics, projection) {
  return Object.freeze({
    status,
    diagnostics: Object.freeze([...diagnostics]),
    projection,
  });
}

function compareNotes(left, right) {
  return left.measureIndex - right.measureIndex
    || left.onsetDivisions - right.onsetDivisions
    || left.voice.localeCompare(right.voice)
    || left.staff - right.staff
    || left.pitchMidi - right.pitchMidi
    || left.durationDivisions - right.durationDivisions
    || Number(left.tieStop) - Number(right.tieStop)
    || Number(left.tieStart) - Number(right.tieStart)
    || left.sourceOrder - right.sourceOrder;
}

function structuralKey(note) {
  return [
    note.measureIndex,
    note.onsetDivisions,
    note.durationDivisions,
    note.voice,
    note.staff,
    note.pitchMidi,
    note.tieStart ? 1 : 0,
    note.tieStop ? 1 : 0,
  ].join(':');
}

function projectGuitarSourceSemantics(sourceModel) {
  const validated = validatePolyphonicSourceModel(sourceModel);
  const notes = [];
  const meters = [];

  for (const measure of validated.measures) {
    meters.push(Object.freeze({
      measureIndex: measure.index,
      divisions: measure.divisions,
      beats: measure.timeSignature.beats,
      beatType: measure.timeSignature.beatType,
    }));

    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      notes.push({
        measureIndex: measure.index,
        sourceOrder: event.sourceOrder,
        pitchMidi: event.pitch.midi,
        onsetDivisions: event.onsetDivisions,
        durationDivisions: event.durationDivisions,
        voice: event.voice,
        staff: event.staff,
        tieStart: event.tieStart,
        tieStop: event.tieStop,
      });
    }
  }

  notes.sort(compareNotes);

  const seen = new Set();
  for (const note of notes) {
    const key = structuralKey(note);
    if (seen.has(key)) {
      return freezeResult('UNSUPPORTED', ['AMBIGUOUS_DUPLICATE_UNISON'], null);
    }
    seen.add(key);
  }

  const projection = Object.freeze({
    schemaVersion: GUITAR_SOURCE_SEMANTIC_PROJECTION_VERSION,
    partId: validated.source.partId,
    measureCount: validated.measureCount,
    meters: Object.freeze(meters),
    notes: Object.freeze(notes.map((note) => Object.freeze(note))),
    contextSupport: Object.freeze({
      keySignatures: false,
      clefs: false,
    }),
  });

  return freezeResult('PASS', [], projection);
}

module.exports = {
  GUITAR_SOURCE_SEMANTIC_PROJECTION_VERSION,
  projectGuitarSourceSemantics,
};
