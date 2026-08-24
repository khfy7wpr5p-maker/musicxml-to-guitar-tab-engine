'use strict';

const {
  createMeasureId,
  createSourceEventId,
} = require('../music/polyphonicSourceModel');
const { createGroupId } = require('../music/simultaneousEventModel');
const {
  fail,
  exact,
  array,
  string,
  integer,
  boolean,
  equal,
  validatePitch,
} = require('./canonicalTabResultV2ValidationSupport');

const INITIAL_DECISION_TYPES = new Set([
  'PRESERVED',
  'OMITTED',
  'OCTAVE_DISPLACED',
  'CHORD_REDUCED',
]);

function validateSourceLocation(value, path, context) {
  exact(value, ['partId', 'measureIndex', 'measureNumber', 'noteIndex', 'chordWithPrevious'], path);
  equal(value.partId, context.partId, `${path}.partId`, 'SOURCE_PART_MISMATCH');
  equal(value.measureIndex, context.measureIndex, `${path}.measureIndex`, 'SOURCE_MEASURE_INDEX_MISMATCH');
  equal(value.measureNumber, context.measureNumber, `${path}.measureNumber`, 'SOURCE_MEASURE_NUMBER_MISMATCH');
  equal(value.noteIndex, context.sourceOrder, `${path}.noteIndex`, 'SOURCE_NOTE_INDEX_MISMATCH');
  boolean(value.chordWithPrevious, `${path}.chordWithPrevious`);
}

function validateMeasures(result) {
  const notes = [];
  const notesById = new Map();
  const eventsById = new Map();

  array(result.measures, 'canonicalTabResult.measures').forEach((measure, measureIndex) => {
    const path = `canonicalTabResult.measures[${measureIndex}]`;
    exact(measure, [
      'measureId', 'index', 'number', 'implicit', 'divisions', 'timeSignature',
      'expectedDurationDivisions', 'events',
    ], path);
    equal(measure.index, measureIndex, `${path}.index`, 'MEASURE_INDEX_MISMATCH');
    equal(
      measure.measureId,
      createMeasureId(result.source.partId, measureIndex),
      `${path}.measureId`,
      'MEASURE_ID_MISMATCH',
    );
    string(measure.number, `${path}.number`);
    boolean(measure.implicit, `${path}.implicit`);
    integer(measure.divisions, `${path}.divisions`, 1);
    exact(measure.timeSignature, ['beats', 'beatType'], `${path}.timeSignature`);
    const beats = integer(measure.timeSignature.beats, `${path}.timeSignature.beats`, 1);
    const beatType = integer(measure.timeSignature.beatType, `${path}.timeSignature.beatType`, 1);
    const numerator = measure.divisions * beats * 4;
    if (!Number.isSafeInteger(numerator) || numerator % beatType !== 0) {
      fail(`${path}.expectedDurationDivisions`, 'INVALID_EXPECTED_MEASURE_DURATION');
    }
    equal(
      measure.expectedDurationDivisions,
      numerator / beatType,
      `${path}.expectedDurationDivisions`,
      'EXPECTED_MEASURE_DURATION_MISMATCH',
    );

    let previousEvent = null;
    array(measure.events, `${path}.events`).forEach((event, eventIndex) => {
      const eventPath = `${path}.events[${eventIndex}]`;
      if (!event || (event.type !== 'note' && event.type !== 'rest')) fail(`${eventPath}.type`, 'EVENT_TYPE');
      exact(event, event.type === 'note'
        ? ['sourceEventId', 'sourceOrder', 'type', 'voice', 'staff', 'onsetDivisions', 'durationDivisions', 'pitch', 'tieStart', 'tieStop', 'source']
        : ['sourceEventId', 'sourceOrder', 'type', 'voice', 'staff', 'onsetDivisions', 'durationDivisions', 'tieStart', 'tieStop', 'source'], eventPath);
      equal(event.sourceOrder, eventIndex, `${eventPath}.sourceOrder`, 'SOURCE_ORDER_MISMATCH');
      equal(
        event.sourceEventId,
        createSourceEventId(result.source.partId, measureIndex, eventIndex),
        `${eventPath}.sourceEventId`,
        'SOURCE_EVENT_ID_MISMATCH',
      );
      string(event.voice, `${eventPath}.voice`);
      integer(event.staff, `${eventPath}.staff`, 1, 2);
      integer(event.onsetDivisions, `${eventPath}.onsetDivisions`, 0, measure.expectedDurationDivisions);
      integer(event.durationDivisions, `${eventPath}.durationDivisions`, 1, measure.expectedDurationDivisions);
      if (event.onsetDivisions + event.durationDivisions > measure.expectedDurationDivisions) {
        fail(eventPath, 'EVENT_EXCEEDS_MEASURE');
      }
      boolean(event.tieStart, `${eventPath}.tieStart`);
      boolean(event.tieStop, `${eventPath}.tieStop`);
      if (event.type === 'rest' && (event.tieStart || event.tieStop)) fail(eventPath, 'REST_TIE_NOT_ALLOWED');
      validateSourceLocation(event.source, `${eventPath}.source`, {
        partId: result.source.partId,
        measureIndex,
        measureNumber: measure.number,
        sourceOrder: eventIndex,
      });
      if (event.type === 'note') validatePitch(event.pitch, `${eventPath}.pitch`);
      if (event.source.chordWithPrevious) {
        if (
          event.type !== 'note'
          || !previousEvent
          || previousEvent.type !== 'note'
          || previousEvent.voice !== event.voice
          || previousEvent.staff !== event.staff
          || previousEvent.onsetDivisions !== event.onsetDivisions
        ) fail(`${eventPath}.source.chordWithPrevious`, 'CHORD_SOURCE_ORDER_MISMATCH');
      }
      if (eventsById.has(event.sourceEventId)) fail(`${eventPath}.sourceEventId`, 'DUPLICATE_SOURCE_EVENT_ID');
      eventsById.set(event.sourceEventId, event);
      if (event.type === 'note') {
        const note = Object.freeze({ event, measure, globalNoteOrder: notes.length });
        notes.push(note);
        notesById.set(event.sourceEventId, note);
      }
      previousEvent = event;
    });
  });

  return { notes, notesById, eventsById };
}

function validateSimultaneousGroups(result) {
  const expected = [];
  for (const measure of result.measures) {
    const byOnset = new Map();
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const members = byOnset.get(event.onsetDivisions) || [];
      members.push(event.sourceEventId);
      byOnset.set(event.onsetDivisions, members);
    }
    for (const onset of [...byOnset.keys()].sort((left, right) => left - right)) {
      const sourceEventIds = byOnset.get(onset);
      if (sourceEventIds.length < 2) continue;
      expected.push({
        groupId: createGroupId(measure.measureId, onset),
        measureId: measure.measureId,
        onsetDivisions: onset,
        sourceEventIds,
      });
    }
  }

  const groupsById = new Map();
  const groupIdByNoteId = new Map();
  const actual = array(result.simultaneousGroups, 'canonicalTabResult.simultaneousGroups');
  equal(actual.length, expected.length, 'canonicalTabResult.simultaneousGroups', 'GROUP_COUNT_MISMATCH');
  actual.forEach((group, index) => {
    const path = `canonicalTabResult.simultaneousGroups[${index}]`;
    exact(group, ['groupId', 'measureId', 'onsetDivisions', 'sourceEventIds'], path);
    const expectedGroup = expected[index];
    equal(group.groupId, expectedGroup.groupId, `${path}.groupId`, 'GROUP_ID_OR_ORDER_MISMATCH');
    equal(group.measureId, expectedGroup.measureId, `${path}.measureId`, 'GROUP_MEASURE_MISMATCH');
    equal(group.onsetDivisions, expectedGroup.onsetDivisions, `${path}.onsetDivisions`, 'GROUP_ONSET_MISMATCH');
    const ids = array(group.sourceEventIds, `${path}.sourceEventIds`);
    equal(ids.length, expectedGroup.sourceEventIds.length, `${path}.sourceEventIds`, 'GROUP_MEMBERSHIP_MISMATCH');
    ids.forEach((id, memberIndex) => {
      equal(id, expectedGroup.sourceEventIds[memberIndex], `${path}.sourceEventIds[${memberIndex}]`, 'GROUP_MEMBERSHIP_MISMATCH');
      groupIdByNoteId.set(id, group.groupId);
    });
    groupsById.set(group.groupId, group);
  });
  return { groupsById, groupIdByNoteId };
}

function validateArrangementDecisions(result, source, groups) {
  const decisions = array(result.arrangementDecisions, 'canonicalTabResult.arrangementDecisions');
  const byId = new Map();
  const covered = new Set();
  let previousFirstOrder = -1;

  decisions.forEach((decision, index) => {
    const path = `canonicalTabResult.arrangementDecisions[${index}]`;
    exact(decision, ['decisionId', 'decisionType', 'sourceEventIds', 'sourceGroupId'], path);
    equal(decision.decisionId, `${result.source.partId}:arrangement-decision:${index}`, `${path}.decisionId`, 'DECISION_ID_MISMATCH');
    if (!INITIAL_DECISION_TYPES.has(decision.decisionType)) fail(`${path}.decisionType`, 'UNSUPPORTED_INITIAL_V2_DECISION_TYPE');
    const ids = array(decision.sourceEventIds, `${path}.sourceEventIds`);
    if (ids.length === 0) fail(`${path}.sourceEventIds`, 'EMPTY_DECISION_MEMBERSHIP');
    let firstOrder = null;
    ids.forEach((id, memberIndex) => {
      const note = source.notesById.get(id);
      if (!note) fail(`${path}.sourceEventIds[${memberIndex}]`, 'UNKNOWN_DECISION_SOURCE_NOTE');
      if (covered.has(id)) fail(`${path}.sourceEventIds[${memberIndex}]`, 'DUPLICATE_DECISION_COVERAGE');
      if (memberIndex > 0) {
        const previous = source.notesById.get(ids[memberIndex - 1]);
        if (previous.globalNoteOrder >= note.globalNoteOrder) fail(`${path}.sourceEventIds`, 'DECISION_MEMBER_ORDER');
      }
      if (firstOrder === null) firstOrder = note.globalNoteOrder;
      covered.add(id);
    });
    if (firstOrder <= previousFirstOrder) fail(path, 'DECISION_ORDER');
    previousFirstOrder = firstOrder;

    if (decision.decisionType === 'CHORD_REDUCED') {
      string(decision.sourceGroupId, `${path}.sourceGroupId`);
      const group = groups.groupsById.get(decision.sourceGroupId);
      if (!group) fail(`${path}.sourceGroupId`, 'UNKNOWN_DECISION_GROUP');
      equal(ids.length, group.sourceEventIds.length, `${path}.sourceEventIds`, 'GROUP_DECISION_MEMBERSHIP');
      ids.forEach((id, memberIndex) => {
        equal(id, group.sourceEventIds[memberIndex], `${path}.sourceEventIds[${memberIndex}]`, 'GROUP_DECISION_MEMBERSHIP');
      });
    } else {
      equal(decision.sourceGroupId, null, `${path}.sourceGroupId`, 'SINGLE_DECISION_GROUP_MUST_BE_NULL');
      equal(ids.length, 1, `${path}.sourceEventIds`, 'SINGLE_DECISION_ONE_NOTE_REQUIRED');
    }
    byId.set(decision.decisionId, decision);
  });

  equal(covered.size, source.notes.length, 'canonicalTabResult.arrangementDecisions', 'DECISION_COVERAGE_MISMATCH');
  return { byId };
}

module.exports = {
  validateMeasures,
  validateSimultaneousGroups,
  validateArrangementDecisions,
};