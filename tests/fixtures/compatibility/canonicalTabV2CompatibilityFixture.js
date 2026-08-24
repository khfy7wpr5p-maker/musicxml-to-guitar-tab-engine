'use strict';

const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../../../src/music/polyphonicSourceModel');
const {
  createCanonicalTabResultV2,
} = require('../../../src/tab/canonicalTabResultV2');

function pitch(step, octave, midi) {
  return { step, alter: 0, octave, midi, written: `${step}${octave}` };
}

function sourceNote(index, onsetDivisions, pitchValue, chordWithPrevious = false) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'note',
    voice: '1',
    staff: 1,
    onsetDivisions,
    durationDivisions: 4,
    pitch: pitchValue,
    tieStart: false,
    tieStop: false,
    source: {
      partId: 'P1',
      measureIndex: 0,
      measureNumber: '1',
      noteIndex: index,
      chordWithPrevious,
    },
  };
}

function sourceRest(index, onsetDivisions) {
  return {
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'rest',
    voice: '1',
    staff: 1,
    onsetDivisions,
    durationDivisions: 4,
    tieStart: false,
    tieStop: false,
    source: {
      partId: 'P1',
      measureIndex: 0,
      measureNumber: '1',
      noteIndex: index,
      chordWithPrevious: false,
    },
  };
}

function createCanonicalTabV2CompatibilityFixture() {
  const events = [
    sourceNote(0, 0, pitch('C', 4, 60)),
    sourceNote(1, 0, pitch('E', 4, 64), true),
    sourceNote(2, 4, pitch('G', 4, 67)),
    sourceRest(3, 8),
    sourceNote(4, 12, pitch('A', 4, 69)),
  ];
  const source = createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
    measureCount: 1,
    eventCount: events.length,
    measures: [{
      measureId: createMeasureId('P1', 0),
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events,
    }],
  });
  const decisions = [0, 1, 2, 4].map((index) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [createSourceEventId('P1', 0, index)],
    sourceGroupId: null,
  }));
  return createCanonicalTabResultV2(source, decisions);
}

module.exports = {
  createCanonicalTabV2CompatibilityFixture,
};