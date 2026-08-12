'use strict';

const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');

const SIMULTANEOUS_EVENT_MODEL_VERSION = '1.0.0';
const SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE = 'SimultaneousEventModel';

function createGroupId(measureId, onsetDivisions) {
  return `${measureId}:simultaneous:${onsetDivisions}`;
}

function createSimultaneousEventModel(sourceModel, runtime = null) {
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const measures = [];
  let groupCount = 0;

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    if (runtime) {
      runtime.checkpoint('simultaneous-event-model:measure', { measureIndex });
    }

    const measure = source.measures[measureIndex];
    const notesByOnset = new Map();

    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      if (runtime) {
        runtime.checkpoint('simultaneous-event-model:event', {
          measureIndex,
          eventIndex,
        });
      }

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

    const groups = [];
    const sortedOnsets = [...notesByOnset.keys()].sort((left, right) => left - right);
    for (let onsetIndex = 0; onsetIndex < sortedOnsets.length; onsetIndex += 1) {
      if (runtime) {
        runtime.checkpoint('simultaneous-event-model:onset', {
          measureIndex,
          onsetIndex,
        });
      }

      const onsetDivisions = sortedOnsets[onsetIndex];
      const members = notesByOnset.get(onsetDivisions);
      if (members.length < 2) {
        continue;
      }

      const voices = new Set();
      const staves = new Set();
      let hasSourceChordMarker = false;
      const sourceEventIds = new Array(members.length);

      for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
        if (runtime) {
          runtime.checkpoint('simultaneous-event-model:member', {
            measureIndex,
            onsetIndex,
            memberIndex,
          });
        }

        const member = members[memberIndex];
        sourceEventIds[memberIndex] = member.sourceEventId;
        voices.add(member.voice);
        staves.add(member.staff);
        hasSourceChordMarker ||= member.source.chordWithPrevious;
      }

      groups.push(Object.freeze({
        groupId: createGroupId(measure.measureId, onsetDivisions),
        onsetDivisions,
        memberCount: members.length,
        sourceEventIds: Object.freeze(sourceEventIds),
        hasSourceChordMarker,
        spansVoices: voices.size > 1,
        spansStaves: staves.size > 1,
      }));
      groupCount += 1;
    }

    measures.push(Object.freeze({
      measureId: measure.measureId,
      index: measure.index,
      groups: Object.freeze(groups),
    }));
  }

  return Object.freeze({
    documentType: SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE,
    contractVersion: SIMULTANEOUS_EVENT_MODEL_VERSION,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    measureCount: source.measureCount,
    groupCount,
    measures: Object.freeze(measures),
  });
}

module.exports = {
  SIMULTANEOUS_EVENT_MODEL_VERSION,
  SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE,
  createGroupId,
  createSimultaneousEventModel,
};
