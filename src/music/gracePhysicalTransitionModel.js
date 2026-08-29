'use strict';

const { EngineError } = require('../errors/engineError');
const { getPositionCandidates, positionToMidi } = require('../guitar/fretboard');
const {
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  createSustainedPolyphonicPathSelection,
} = require('./sustainedPolyphonicPathSolver');
const {
  validateCanonicalTabResultV2,
} = require('../contracts/canonicalTabResultV2Contract');

const GRACE_PHYSICAL_TRANSITION_MODEL_VERSION = '1.0.0';
const GRACE_PHYSICAL_TRANSITION_MODEL_DOCUMENT_TYPE = 'GracePhysicalTransitionModel';
const GRACE_PHYSICAL_TRANSITION_MODEL_AUTHORITY = 'ORDER_ONLY_EXACT_GRACE_PHYSICAL_TRANSITIONS';
const GRACE_PHYSICAL_TRANSITION_POLICY = 'HELD_STRINGS_RESERVED_THEN_LEXICOGRAPHIC_POSITION_PATH_1.0';
const MAX_GRACE_PHYSICAL_GROUPS = 128;
const MAX_GRACE_PHYSICAL_EVENTS = 256;
const MAX_GRACE_POSITION_CANDIDATES = 6;

class GracePhysicalTransitionModelError extends EngineError {
  constructor(message, code = 'INVALID_GRACE_PHYSICAL_TRANSITION_MODEL', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'GracePhysicalTransitionModelError');
  }
}

function invalid(message, details = {}) {
  return new GracePhysicalTransitionModelError(
    message,
    'INVALID_GRACE_PHYSICAL_TRANSITION_MODEL',
    details,
  );
}

function unplayable(message, details = {}) {
  return new GracePhysicalTransitionModelError(
    message,
    'UNPLAYABLE_GRACE_PHYSICAL_TRANSITION',
    details,
  );
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function compareNumberArrays(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] === undefined ? Number.POSITIVE_INFINITY : left[index];
    const b = right[index] === undefined ? Number.POSITIVE_INFINITY : right[index];
    if (a !== b) return a - b;
  }
  return 0;
}

function sourceNoteIndex(source) {
  const byId = new Map();
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') byId.set(event.sourceEventId, event);
    }
  }
  return byId;
}

function dispositionIndex(canonicalTabResult) {
  return new Map(
    canonicalTabResult.noteDispositions.map((entry) => [entry.sourceEventId, entry]),
  );
}

function assertGraceGroups(value) {
  if (!Array.isArray(value) || value.length > MAX_GRACE_PHYSICAL_GROUPS) {
    throw invalid('graceOrnamentGroups must be a bounded array.', {
      maximumGraceGroups: MAX_GRACE_PHYSICAL_GROUPS,
    });
  }
  let eventCount = 0;
  for (let index = 0; index < value.length; index += 1) {
    const group = value[index];
    if (
      !group
      || typeof group !== 'object'
      || typeof group.graceGroupId !== 'string'
      || !Number.isInteger(group.measureIndex)
      || group.measureIndex < 0
      || typeof group.voice !== 'string'
      || !Number.isInteger(group.staff)
      || !group.anchor
      || typeof group.anchor.projectedSourceEventId !== 'string'
      || !Array.isArray(group.notes)
      || group.notes.length < 1
      || group.notes.length > 2
    ) {
      throw invalid('Grace group does not match the bounded PS-6B6A sidecar contract.', {
        graceGroupIndex: index,
      });
    }
    eventCount += group.notes.length;
    if (eventCount > MAX_GRACE_PHYSICAL_EVENTS) {
      throw invalid('Grace event count exceeds the fixed physical-integration boundary.', {
        maximumGraceEvents: MAX_GRACE_PHYSICAL_EVENTS,
      });
    }
  }
  return eventCount;
}

function exactGracePositionCandidates(note, reservedStrings, location) {
  const candidates = getPositionCandidates(note.pitch.midi)
    .filter((position) => !reservedStrings.has(position.string))
    .map((position) => {
      if (positionToMidi(position) !== note.pitch.midi) {
        throw invalid('Fretboard candidate failed exact grace-pitch round trip.', {
          ...location,
          graceEventId: note.graceEventId,
          string: position.string,
          fret: position.fret,
          targetMidi: note.pitch.midi,
        });
      }
      return Object.freeze({
        string: position.string,
        fret: position.fret,
      });
    });
  if (candidates.length > MAX_GRACE_POSITION_CANDIDATES) {
    throw invalid('Grace fretboard candidate count exceeds the six-string boundary.', {
      ...location,
      graceEventId: note.graceEventId,
      observed: candidates.length,
      limit: MAX_GRACE_POSITION_CANDIDATES,
    });
  }
  return Object.freeze(candidates);
}

function transitionCost(positions, anchorPosition) {
  let stringChanges = 0;
  let fretDistance = 0;
  let maximumFret = anchorPosition.fret;
  let fretSum = anchorPosition.fret;
  let stringSum = anchorPosition.string;

  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    maximumFret = Math.max(maximumFret, position.fret);
    fretSum += position.fret;
    stringSum += position.string;
    const next = index + 1 < positions.length ? positions[index + 1] : anchorPosition;
    if (position.string !== next.string) stringChanges += 1;
    fretDistance += Math.abs(position.fret - next.fret);
  }

  return Object.freeze([
    stringChanges,
    fretDistance,
    maximumFret,
    fretSum,
    stringSum,
  ]);
}

function pathSignature(positions) {
  return positions.map((position) => `${position.string}:${position.fret}`).join(';');
}

function chooseGracePath(group, reservedStrings, anchorPosition, runtime) {
  const layers = group.notes.map((note, noteIndex) => {
    checkpoint(runtime, 'grace-physical-transition:grace-event', {
      graceGroupId: group.graceGroupId,
      noteIndex,
    });
    const candidates = exactGracePositionCandidates(note, reservedStrings, {
      graceGroupId: group.graceGroupId,
      measureIndex: group.measureIndex,
      noteIndex,
    });
    if (candidates.length === 0) {
      throw unplayable('Grace pitch has no exact guitar position outside held-string occupancy.', {
        graceGroupId: group.graceGroupId,
        measureIndex: group.measureIndex,
        graceEventId: note.graceEventId,
        targetMidi: note.pitch.midi,
        reservedHeldStrings: Object.freeze([...reservedStrings].sort((a, b) => a - b)),
        reason: 'NO_EXACT_GRACE_POSITION',
      });
    }
    return candidates;
  });

  const paths = [];
  const working = new Array(layers.length);
  function visit(noteIndex) {
    checkpoint(runtime, 'grace-physical-transition:path-candidate', {
      graceGroupId: group.graceGroupId,
      noteIndex,
      observedPathCount: paths.length,
    });
    if (noteIndex === layers.length) {
      const positions = Object.freeze(working.map((position) => position));
      paths.push(Object.freeze({
        positions,
        cost: transitionCost(positions, anchorPosition),
        signature: pathSignature(positions),
      }));
      return;
    }
    for (const candidate of layers[noteIndex]) {
      working[noteIndex] = candidate;
      visit(noteIndex + 1);
    }
  }
  visit(0);

  paths.sort((left, right) => {
    const numeric = compareNumberArrays(left.cost, right.cost);
    return numeric !== 0 ? numeric : left.signature.localeCompare(right.signature);
  });
  if (paths.length === 0) {
    throw unplayable('Grace chain has no deterministic exact physical transition.', {
      graceGroupId: group.graceGroupId,
      measureIndex: group.measureIndex,
      reason: 'NO_GRACE_PATH',
    });
  }
  return paths[0];
}

function createGracePhysicalTransitionModel(
  sourceModel,
  canonicalTabResult,
  graceOrnamentGroups,
  runtime = null,
) {
  checkpoint(runtime, 'grace-physical-transition:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  validateCanonicalTabResultV2(canonicalTabResult);
  const graceEventCount = assertGraceGroups(graceOrnamentGroups);

  if (graceOrnamentGroups.length === 0) {
    return Object.freeze({
      documentType: GRACE_PHYSICAL_TRANSITION_MODEL_DOCUMENT_TYPE,
      contractVersion: GRACE_PHYSICAL_TRANSITION_MODEL_VERSION,
      authority: GRACE_PHYSICAL_TRANSITION_MODEL_AUTHORITY,
      policy: GRACE_PHYSICAL_TRANSITION_POLICY,
      graceGroupCount: 0,
      graceEventCount: 0,
      groups: Object.freeze([]),
    });
  }

  const path = createSustainedPolyphonicPathSelection(source, runtime);
  const notesById = sourceNoteIndex(source);
  const dispositions = dispositionIndex(canonicalTabResult);
  const groups = [];

  for (let groupIndex = 0; groupIndex < graceOrnamentGroups.length; groupIndex += 1) {
    checkpoint(runtime, 'grace-physical-transition:group', { groupIndex });
    const group = graceOrnamentGroups[groupIndex];
    const anchorSourceEventId = group.anchor.projectedSourceEventId;
    const anchorEvent = notesById.get(anchorSourceEventId);
    const anchorDisposition = dispositions.get(anchorSourceEventId);
    if (
      !anchorEvent
      || anchorEvent.source.measureIndex !== group.measureIndex
      || anchorEvent.voice !== group.voice
      || anchorEvent.staff !== group.staff
    ) {
      throw invalid('Grace anchor identity does not resolve to the exact projected source note.', {
        graceGroupId: group.graceGroupId,
        anchorSourceEventId,
      });
    }
    if (
      !anchorDisposition
      || anchorDisposition.disposition !== 'KEEP'
      || anchorDisposition.octaveShiftSemitones !== 0
      || !anchorDisposition.targetPitch
      || anchorDisposition.targetPitch.midi !== anchorEvent.pitch.midi
      || !anchorDisposition.selectedPosition
      || positionToMidi(anchorDisposition.selectedPosition) !== anchorEvent.pitch.midi
    ) {
      throw unplayable('Grace anchor is not available as an exact retained guitar position.', {
        graceGroupId: group.graceGroupId,
        anchorSourceEventId,
        reason: 'ANCHOR_NOT_EXACTLY_REALIZED',
      });
    }

    const point = path.selectedPointStates.find((entry) => (
      entry.measureIndex === group.measureIndex
      && entry.timeDivisions === anchorEvent.onsetDivisions
    ));
    if (!point) {
      throw invalid('Grace anchor onset has no sustained physical sonority point.', {
        graceGroupId: group.graceGroupId,
        anchorSourceEventId,
        measureIndex: group.measureIndex,
        onsetDivisions: anchorEvent.onsetDivisions,
      });
    }

    const heldPositions = point.positions.filter((position) => position.disposition === 'HOLD');
    const reservedStrings = new Set(heldPositions.map((position) => position.string));
    if (reservedStrings.has(anchorDisposition.selectedPosition.string)) {
      throw unplayable('Grace anchor conflicts with an already-held string at the anchor onset.', {
        graceGroupId: group.graceGroupId,
        anchorSourceEventId,
        string: anchorDisposition.selectedPosition.string,
        reason: 'ANCHOR_OCCUPIES_HELD_STRING',
      });
    }

    const anchorPosition = Object.freeze({
      targetMidi: anchorEvent.pitch.midi,
      string: anchorDisposition.selectedPosition.string,
      fret: anchorDisposition.selectedPosition.fret,
    });
    const selected = chooseGracePath(group, reservedStrings, anchorPosition, runtime);
    const notes = group.notes.map((note, noteIndex) => Object.freeze({
      graceEventId: note.graceEventId,
      orderIndex: note.orderIndex,
      pitch: note.pitch,
      nominalType: note.nominalType,
      slash: note.slash,
      stem: note.stem,
      beam: note.beam,
      string: selected.positions[noteIndex].string,
      fret: selected.positions[noteIndex].fret,
    }));

    groups.push(Object.freeze({
      graceGroupId: group.graceGroupId,
      measureIndex: group.measureIndex,
      voice: group.voice,
      staff: group.staff,
      anchorSourceEventId,
      anchorPosition,
      reservedHeldStrings: Object.freeze([...reservedStrings].sort((a, b) => a - b)),
      notes: Object.freeze(notes),
      transitionCost: Object.freeze({
        stringChanges: selected.cost[0],
        fretDistance: selected.cost[1],
        maximumFret: selected.cost[2],
        fretSum: selected.cost[3],
        stringSum: selected.cost[4],
      }),
    }));
  }

  checkpoint(runtime, 'grace-physical-transition:complete', {
    graceGroupCount: groups.length,
    graceEventCount,
  });
  return Object.freeze({
    documentType: GRACE_PHYSICAL_TRANSITION_MODEL_DOCUMENT_TYPE,
    contractVersion: GRACE_PHYSICAL_TRANSITION_MODEL_VERSION,
    authority: GRACE_PHYSICAL_TRANSITION_MODEL_AUTHORITY,
    policy: GRACE_PHYSICAL_TRANSITION_POLICY,
    graceGroupCount: groups.length,
    graceEventCount,
    groups: Object.freeze(groups),
  });
}

module.exports = {
  GRACE_PHYSICAL_TRANSITION_MODEL_VERSION,
  GRACE_PHYSICAL_TRANSITION_MODEL_DOCUMENT_TYPE,
  GRACE_PHYSICAL_TRANSITION_MODEL_AUTHORITY,
  GRACE_PHYSICAL_TRANSITION_POLICY,
  MAX_GRACE_PHYSICAL_GROUPS,
  MAX_GRACE_PHYSICAL_EVENTS,
  GracePhysicalTransitionModelError,
  createGracePhysicalTransitionModel,
};
