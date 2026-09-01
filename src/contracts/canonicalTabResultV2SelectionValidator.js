'use strict';

const {
  GUITAR_STRING_COUNT,
  DEFAULT_FRET_RANGE,
} = require('../guitar/tuning');
const { positionToMidi } = require('../guitar/fretboard');
const { PLAYABILITY_STATUS } = require('../music/physicalPlayabilityValidatorV2');
const {
  fail,
  exact,
  array,
  string,
  integer,
  equal,
  validatePitch,
} = require('./canonicalTabResultV2ValidationSupport');

function validateTargetPitchRelation(targetPitch, sourcePitch, shift, path) {
  validatePitch(targetPitch, path);
  equal(targetPitch.step, sourcePitch.step, `${path}.step`, 'TARGET_PITCH_CLASS_SPELLING_MISMATCH');
  equal(targetPitch.alter, sourcePitch.alter, `${path}.alter`, 'TARGET_PITCH_CLASS_SPELLING_MISMATCH');
  equal(targetPitch.midi, sourcePitch.midi + shift, `${path}.midi`, 'TARGET_PITCH_SHIFT_MISMATCH');
  equal(targetPitch.octave, sourcePitch.octave + (shift / 12), `${path}.octave`, 'TARGET_OCTAVE_SHIFT_MISMATCH');
}

function validateDispositions(result, source, decisions, groups, guitarConfiguration) {
  const dispositions = array(result.noteDispositions, 'canonicalTabResult.noteDispositions');
  equal(dispositions.length, source.notes.length, 'canonicalTabResult.noteDispositions', 'DISPOSITION_COUNT_MISMATCH');
  const bySourceId = new Map();

  dispositions.forEach((entry, index) => {
    const path = `canonicalTabResult.noteDispositions[${index}]`;
    exact(entry, [
      'sourceEventId', 'decisionId', 'disposition', 'targetPitch',
      'octaveShiftSemitones', 'ruleId', 'selectedPosition', 'selectedShapeId',
    ], path);
    const sourceNote = source.notes[index];
    equal(entry.sourceEventId, sourceNote.event.sourceEventId, `${path}.sourceEventId`, 'DISPOSITION_ORDER_MISMATCH');
    const decision = decisions.byId.get(entry.decisionId);
    if (!decision || !decision.sourceEventIds.includes(entry.sourceEventId)) {
      fail(`${path}.decisionId`, 'DISPOSITION_DECISION_LINK');
    }
    if (entry.disposition !== 'KEEP' && entry.disposition !== 'OMIT') {
      fail(`${path}.disposition`, 'DISPOSITION_VALUE');
    }
    string(entry.ruleId, `${path}.ruleId`);

    if (entry.disposition === 'OMIT') {
      equal(entry.targetPitch, null, `${path}.targetPitch`, 'OMIT_TARGET_MUST_BE_NULL');
      equal(entry.octaveShiftSemitones, null, `${path}.octaveShiftSemitones`, 'OMIT_SHIFT_MUST_BE_NULL');
      equal(entry.selectedPosition, null, `${path}.selectedPosition`, 'OMIT_POSITION_MUST_BE_NULL');
      equal(entry.selectedShapeId, null, `${path}.selectedShapeId`, 'OMIT_SHAPE_MUST_BE_NULL');
      if (decision.decisionType === 'OMITTED') {
        equal(entry.ruleId, 'OMIT_EXPLICIT', `${path}.ruleId`, 'OMIT_RULE_MISMATCH');
      } else if (decision.decisionType === 'CHORD_REDUCED') {
        equal(entry.ruleId, 'CHORD_REDUCTION_OMIT_INNER', `${path}.ruleId`, 'CHORD_REDUCTION_RULE_MISMATCH');
      } else {
        fail(path, 'DECISION_DISPOSITION_MISMATCH');
      }
    } else {
      integer(entry.octaveShiftSemitones, `${path}.octaveShiftSemitones`);
      if (entry.octaveShiftSemitones % 12 !== 0) {
        fail(`${path}.octaveShiftSemitones`, 'OCTAVE_SHIFT_MULTIPLE_REQUIRED');
      }
      validateTargetPitchRelation(
        entry.targetPitch,
        sourceNote.event.pitch,
        entry.octaveShiftSemitones,
        `${path}.targetPitch`,
      );
      exact(entry.selectedPosition, ['string', 'fret'], `${path}.selectedPosition`);
      integer(entry.selectedPosition.string, `${path}.selectedPosition.string`, 1, GUITAR_STRING_COUNT);
      integer(
        entry.selectedPosition.fret,
        `${path}.selectedPosition.fret`,
        DEFAULT_FRET_RANGE.minimumFret,
        DEFAULT_FRET_RANGE.maximumFret,
      );
      let observedMidi;
      try {
        observedMidi = positionToMidi(entry.selectedPosition, guitarConfiguration);
      } catch {
        fail(`${path}.selectedPosition`, 'INVALID_GUITAR_POSITION');
      }
      equal(observedMidi, entry.targetPitch.midi, `${path}.selectedPosition`, 'POSITION_TARGET_MIDI_MISMATCH');
      if (entry.selectedShapeId !== null) string(entry.selectedShapeId, `${path}.selectedShapeId`);

      if (decision.decisionType === 'PRESERVED') {
        equal(entry.octaveShiftSemitones, 0, `${path}.octaveShiftSemitones`, 'PRESERVED_SHIFT_MISMATCH');
        equal(entry.ruleId, 'PRESERVE_IN_REGISTER', `${path}.ruleId`, 'PRESERVED_RULE_MISMATCH');
      } else if (decision.decisionType === 'OCTAVE_DISPLACED') {
        if (entry.octaveShiftSemitones === 0) {
          fail(`${path}.octaveShiftSemitones`, 'NON_ZERO_OCTAVE_SHIFT_REQUIRED');
        }
        equal(entry.ruleId, 'OCTAVE_NEAREST_IN_REGISTER', `${path}.ruleId`, 'OCTAVE_RULE_MISMATCH');
      } else if (decision.decisionType === 'CHORD_REDUCED') {
        equal(entry.octaveShiftSemitones, 0, `${path}.octaveShiftSemitones`, 'CHORD_REDUCTION_SHIFT_MISMATCH');
        equal(entry.ruleId, 'CHORD_REDUCTION_KEEP_OUTER', `${path}.ruleId`, 'CHORD_REDUCTION_RULE_MISMATCH');
      } else {
        fail(path, 'DECISION_DISPOSITION_MISMATCH');
      }
    }
    bySourceId.set(entry.sourceEventId, entry);
  });

  for (const group of groups.groupsById.values()) {
    const retained = group.sourceEventIds
      .map((id) => bySourceId.get(id))
      .filter((entry) => entry.disposition === 'KEEP');
    const strings = new Set();
    for (const entry of retained) {
      if (strings.has(entry.selectedPosition.string)) {
        fail('canonicalTabResult.noteDispositions', 'DUPLICATE_SIMULTANEOUS_STRING', {
          groupId: group.groupId,
          string: entry.selectedPosition.string,
        });
      }
      strings.add(entry.selectedPosition.string);
    }
  }
  return { bySourceId };
}

function validateBarre(barre, path, positionById, fingerById) {
  exact(barre, ['finger', 'fret', 'startString', 'endString', 'stringSpan', 'kind'], path);
  integer(barre.finger, `${path}.finger`, 1, 4);
  integer(barre.fret, `${path}.fret`, 1, DEFAULT_FRET_RANGE.maximumFret);
  integer(barre.startString, `${path}.startString`, 1, GUITAR_STRING_COUNT);
  integer(barre.endString, `${path}.endString`, 1, GUITAR_STRING_COUNT);
  if (barre.startString > barre.endString) fail(path, 'BARRE_STRING_ORDER');
  equal(
    barre.stringSpan,
    barre.endString - barre.startString + 1,
    `${path}.stringSpan`,
    'BARRE_SPAN_MISMATCH',
  );
  const expectedKind = barre.startString === 1 && barre.endString === GUITAR_STRING_COUNT
    ? 'FULL_BARRE'
    : 'PARTIAL_BARRE';
  equal(barre.kind, expectedKind, `${path}.kind`, 'BARRE_KIND_MISMATCH');

  let matching = 0;
  for (const [sourceEventId, position] of positionById) {
    if (position.string < barre.startString || position.string > barre.endString) continue;
    if (position.fret < barre.fret) {
      fail(path, 'BARRE_BLOCKED_BY_LOWER_FRET', { sourceEventId });
    }
    if (position.fret === barre.fret) {
      if (fingerById.get(sourceEventId) !== barre.finger) {
        fail(path, 'BARRE_FINGER_MISMATCH', { sourceEventId });
      }
      matching += 1;
    }
  }
  if (matching < 2) fail(path, 'BARRE_REQUIRES_MULTIPLE_ASSIGNMENTS');
}

function validateSelectedShapes(result, groups, dispositions) {
  const shapes = array(result.selectedShapes, 'canonicalTabResult.selectedShapes');
  const expectedGroups = [];
  for (const group of groups.groupsById.values()) {
    const retainedIds = group.sourceEventIds.filter(
      (id) => dispositions.bySourceId.get(id).disposition === 'KEEP',
    );
    if (retainedIds.length >= 2) {
      expectedGroups.push({ group, retainedIds });
    } else {
      for (const id of retainedIds) {
        equal(
          dispositions.bySourceId.get(id).selectedShapeId,
          null,
          'canonicalTabResult.noteDispositions',
          'SINGLETON_SHAPE_MUST_BE_NULL',
        );
      }
    }
  }
  equal(shapes.length, expectedGroups.length, 'canonicalTabResult.selectedShapes', 'SELECTED_SHAPE_COUNT_MISMATCH');

  shapes.forEach((shape, index) => {
    const path = `canonicalTabResult.selectedShapes[${index}]`;
    exact(shape, [
      'selectedShapeId', 'sourceGroupId', 'sourceEventIds', 'voicingCandidateId',
      'shapeCandidateId', 'fingerAssignments', 'barres', 'physicalValidation',
    ], path);
    const expected = expectedGroups[index];
    equal(shape.sourceGroupId, expected.group.groupId, `${path}.sourceGroupId`, 'SELECTED_SHAPE_GROUP_ORDER');
    equal(
      shape.selectedShapeId,
      `${shape.sourceGroupId}:selected-shape`,
      `${path}.selectedShapeId`,
      'SELECTED_SHAPE_ID_MISMATCH',
    );
    string(shape.voicingCandidateId, `${path}.voicingCandidateId`);
    string(shape.shapeCandidateId, `${path}.shapeCandidateId`);
    const ids = array(shape.sourceEventIds, `${path}.sourceEventIds`);
    equal(ids.length, expected.retainedIds.length, `${path}.sourceEventIds`, 'SELECTED_SHAPE_MEMBERSHIP');
    ids.forEach((id, memberIndex) => {
      equal(
        id,
        expected.retainedIds[memberIndex],
        `${path}.sourceEventIds[${memberIndex}]`,
        'SELECTED_SHAPE_MEMBERSHIP',
      );
      equal(
        dispositions.bySourceId.get(id).selectedShapeId,
        shape.selectedShapeId,
        'canonicalTabResult.noteDispositions',
        'SELECTED_SHAPE_LINK_MISMATCH',
      );
    });

    const positionById = new Map(ids.map(
      (id) => [id, dispositions.bySourceId.get(id).selectedPosition],
    ));
    const fingerById = new Map();
    const assignments = array(shape.fingerAssignments, `${path}.fingerAssignments`);
    equal(assignments.length, ids.length, `${path}.fingerAssignments`, 'FINGER_ASSIGNMENT_COUNT_MISMATCH');
    assignments.forEach((assignment, assignmentIndex) => {
      const assignmentPath = `${path}.fingerAssignments[${assignmentIndex}]`;
      exact(assignment, ['sourceEventId', 'finger'], assignmentPath);
      equal(
        assignment.sourceEventId,
        ids[assignmentIndex],
        `${assignmentPath}.sourceEventId`,
        'FINGER_ASSIGNMENT_ORDER',
      );
      const position = positionById.get(assignment.sourceEventId);
      const finger = integer(assignment.finger, `${assignmentPath}.finger`, 0, 4);
      if (position.fret === 0) {
        equal(finger, 0, `${assignmentPath}.finger`, 'OPEN_STRING_FINGER_MUST_BE_ZERO');
      } else if (finger === 0) {
        fail(`${assignmentPath}.finger`, 'FRETTED_NOTE_REQUIRES_FINGER');
      }
      fingerById.set(assignment.sourceEventId, finger);
    });

    array(shape.barres, `${path}.barres`).forEach((barre, barreIndex) => {
      validateBarre(
        barre,
        `${path}.barres[${barreIndex}]`,
        positionById,
        fingerById,
      );
    });
    exact(shape.physicalValidation, ['status'], `${path}.physicalValidation`);
    equal(
      shape.physicalValidation.status,
      PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY,
      `${path}.physicalValidation.status`,
      'SELECTED_SHAPE_MUST_BE_PLAYABLE',
    );
  });
}

module.exports = {
  validateDispositions,
  validateSelectedShapes,
};
