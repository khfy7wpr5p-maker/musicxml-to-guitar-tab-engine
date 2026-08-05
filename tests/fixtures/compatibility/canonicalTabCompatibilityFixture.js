'use strict';

const {
  calculatePositionCost,
  calculateTransitionCost,
} = require('../../../src/fingering/costModel');

const STANDARD_TUNING = Object.freeze([
  Object.freeze({ number: 1, pitch: 'E4', midi: 64 }),
  Object.freeze({ number: 2, pitch: 'B3', midi: 59 }),
  Object.freeze({ number: 3, pitch: 'G3', midi: 55 }),
  Object.freeze({ number: 4, pitch: 'D3', midi: 50 }),
  Object.freeze({ number: 5, pitch: 'A2', midi: 45 }),
  Object.freeze({ number: 6, pitch: 'E2', midi: 40 }),
]);

const DEFAULT_FINGERING_PROFILE = Object.freeze({
  maximumFret: 20,
  fretMovementWeight: 1,
  stringMovementWeight: 1,
  largeShiftThreshold: 4,
  largeShiftWeight: 0,
  highFretThreshold: 12,
  highFretWeight: 0,
  openStringPreferenceWeight: 0,
  samePositionPreferenceWeight: 0,
  maximumFretMovement: null,
  maximumStringMovement: null,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function position(string, fret) {
  return { string, fret };
}

function rhythm(durationDivisions, type, {
  dots = 0,
  tieStart = false,
  tieStop = false,
  beam = [],
} = {}) {
  return {
    durationDivisions,
    type,
    dots,
    timeModification: null,
    tieStart,
    tieStop,
    beam,
  };
}

function pitch(step, alter, octave, midi, written) {
  return { step, alter, octave, midi, written };
}

function noteEvent({
  measureIndex,
  eventIndex,
  measureNumber,
  startDivisions,
  divisions,
  eventPitch,
  eventRhythm,
  selectedPosition,
  alternativePositions = [],
}) {
  return {
    eventId: `m${measureIndex + 1}-e${eventIndex}`,
    eventIndex,
    measureKey: `P1:measure:${measureIndex}`,
    type: 'note',
    voice: 1,
    staff: 1,
    start: {
      divisions: startDivisions,
      beats: startDivisions / divisions,
    },
    rhythm: eventRhythm,
    warnings: [],
    sourceLocation: {
      partId: 'P1',
      measure: measureNumber,
      noteIndex: eventIndex,
    },
    pitch: eventPitch,
    selectedPosition,
    alternativePositions,
    fingeringCost: null,
  };
}

function restEvent({
  measureIndex,
  eventIndex,
  measureNumber,
  startDivisions,
  divisions,
  eventRhythm,
}) {
  return {
    eventId: `m${measureIndex + 1}-e${eventIndex}`,
    eventIndex,
    measureKey: `P1:measure:${measureIndex}`,
    type: 'rest',
    voice: 1,
    staff: 1,
    start: {
      divisions: startDivisions,
      beats: startDivisions / divisions,
    },
    rhythm: eventRhythm,
    warnings: [],
    sourceLocation: {
      partId: 'P1',
      measure: measureNumber,
      noteIndex: eventIndex,
    },
    selectedPosition: null,
    alternativePositions: [],
    fingeringCost: null,
  };
}

function measure({
  measureIndex,
  visibleMeasureNumber,
  implicit = false,
  divisions = 4,
  beats = 4,
  beatType = 4,
  actualDurationDivisions,
  events,
}) {
  return {
    measureKey: `P1:measure:${measureIndex}`,
    measureIndex,
    visibleMeasureNumber,
    implicit,
    timeSignature: { beats, beatType },
    divisions,
    expectedDurationDivisions: (divisions * beats * 4) / beatType,
    actualDurationDivisions,
    events,
    warnings: [],
  };
}

function applyFingeringCosts(measures) {
  let previousPosition = null;
  let totalFingeringCost = 0;

  for (const measureValue of measures) {
    for (const event of measureValue.events) {
      if (event.type === 'rest') {
        continue;
      }

      event.fingeringCost = previousPosition === null
        ? calculatePositionCost(event.selectedPosition, DEFAULT_FINGERING_PROFILE)
        : calculateTransitionCost(
          previousPosition,
          event.selectedPosition,
          DEFAULT_FINGERING_PROFILE,
        );
      totalFingeringCost += event.fingeringCost.total;
      previousPosition = event.selectedPosition;
    }
  }

  return totalFingeringCost;
}

function createCanonicalTabCompatibilityFixture() {
  const divisions = 4;
  const measures = [
    measure({
      measureIndex: 0,
      visibleMeasureNumber: '0',
      implicit: true,
      divisions,
      actualDurationDivisions: 4,
      events: [
        noteEvent({
          measureIndex: 0,
          eventIndex: 0,
          measureNumber: '0',
          startDivisions: 0,
          divisions,
          eventPitch: pitch('E', 0, 4, 64, 'E4'),
          eventRhythm: rhythm(4, 'quarter'),
          selectedPosition: position(1, 0),
          alternativePositions: [position(2, 5), position(3, 9)],
        }),
      ],
    }),
    measure({
      measureIndex: 1,
      visibleMeasureNumber: '1A',
      divisions,
      actualDurationDivisions: 16,
      events: [
        noteEvent({
          measureIndex: 1,
          eventIndex: 0,
          measureNumber: '1A',
          startDivisions: 0,
          divisions,
          eventPitch: pitch('C', 0, 4, 60, 'C4'),
          eventRhythm: rhythm(16, 'whole'),
          selectedPosition: position(3, 5),
          alternativePositions: [position(2, 1), position(4, 10), position(5, 15), position(6, 20)],
        }),
      ],
    }),
    measure({
      measureIndex: 2,
      visibleMeasureNumber: '2',
      divisions,
      actualDurationDivisions: 16,
      events: [
        restEvent({
          measureIndex: 2,
          eventIndex: 0,
          measureNumber: '2',
          startDivisions: 0,
          divisions,
          eventRhythm: rhythm(8, 'half'),
        }),
        noteEvent({
          measureIndex: 2,
          eventIndex: 1,
          measureNumber: '2',
          startDivisions: 8,
          divisions,
          eventPitch: pitch('F', 1, 4, 66, 'F#4'),
          eventRhythm: rhythm(4, 'quarter'),
          selectedPosition: position(1, 2),
          alternativePositions: [position(2, 7), position(3, 11)],
        }),
        noteEvent({
          measureIndex: 2,
          eventIndex: 2,
          measureNumber: '2',
          startDivisions: 12,
          divisions,
          eventPitch: pitch('G', 0, 4, 67, 'G4'),
          eventRhythm: rhythm(2, 'eighth', {
            beam: [{ level: 1, value: 'begin' }],
          }),
          selectedPosition: position(1, 3),
          alternativePositions: [position(2, 8), position(3, 12)],
        }),
        noteEvent({
          measureIndex: 2,
          eventIndex: 3,
          measureNumber: '2',
          startDivisions: 14,
          divisions,
          eventPitch: pitch('A', 0, 4, 69, 'A4'),
          eventRhythm: rhythm(2, 'eighth', {
            beam: [{ level: 1, value: 'end' }],
          }),
          selectedPosition: position(1, 5),
          alternativePositions: [position(2, 10), position(3, 14)],
        }),
      ],
    }),
    measure({
      measureIndex: 3,
      visibleMeasureNumber: '3',
      divisions,
      actualDurationDivisions: 16,
      events: [
        noteEvent({
          measureIndex: 3,
          eventIndex: 0,
          measureNumber: '3',
          startDivisions: 0,
          divisions,
          eventPitch: pitch('B', 0, 3, 59, 'B3'),
          eventRhythm: rhythm(1, '16th', {
            beam: [
              { level: 1, value: 'begin' },
              { level: 2, value: 'begin' },
            ],
          }),
          selectedPosition: position(2, 0),
          alternativePositions: [position(3, 4), position(4, 9)],
        }),
        noteEvent({
          measureIndex: 3,
          eventIndex: 1,
          measureNumber: '3',
          startDivisions: 1,
          divisions,
          eventPitch: pitch('B', -1, 3, 58, 'Bb3'),
          eventRhythm: rhythm(1, '16th', {
            beam: [
              { level: 1, value: 'continue' },
              { level: 2, value: 'continue' },
            ],
          }),
          selectedPosition: position(3, 3),
          alternativePositions: [position(4, 8), position(5, 13), position(6, 18)],
        }),
        noteEvent({
          measureIndex: 3,
          eventIndex: 2,
          measureNumber: '3',
          startDivisions: 2,
          divisions,
          eventPitch: pitch('D', 0, 4, 62, 'D4'),
          eventRhythm: rhythm(1, '16th', {
            beam: [
              { level: 1, value: 'continue' },
              { level: 2, value: 'continue' },
            ],
          }),
          selectedPosition: position(2, 3),
          alternativePositions: [position(3, 7), position(4, 12), position(5, 17)],
        }),
        noteEvent({
          measureIndex: 3,
          eventIndex: 3,
          measureNumber: '3',
          startDivisions: 3,
          divisions,
          eventPitch: pitch('E', 0, 4, 64, 'E4'),
          eventRhythm: rhythm(1, '16th', {
            beam: [
              { level: 1, value: 'end' },
              { level: 2, value: 'end' },
            ],
          }),
          selectedPosition: position(1, 0),
          alternativePositions: [position(2, 5), position(3, 9)],
        }),
        noteEvent({
          measureIndex: 3,
          eventIndex: 4,
          measureNumber: '3',
          startDivisions: 4,
          divisions,
          eventPitch: pitch('A', 0, 3, 57, 'A3'),
          eventRhythm: rhythm(12, 'half', { dots: 1 }),
          selectedPosition: position(3, 2),
          alternativePositions: [position(4, 7), position(5, 12), position(6, 17)],
        }),
      ],
    }),
    measure({
      measureIndex: 4,
      visibleMeasureNumber: '4',
      divisions,
      actualDurationDivisions: 16,
      events: [
        noteEvent({
          measureIndex: 4,
          eventIndex: 0,
          measureNumber: '4',
          startDivisions: 0,
          divisions,
          eventPitch: pitch('D', 0, 5, 74, 'D5'),
          eventRhythm: rhythm(4, 'quarter', { tieStart: true }),
          selectedPosition: position(1, 10),
          alternativePositions: [position(2, 15), position(3, 19)],
        }),
        noteEvent({
          measureIndex: 4,
          eventIndex: 1,
          measureNumber: '4',
          startDivisions: 4,
          divisions,
          eventPitch: pitch('D', 0, 5, 74, 'D5'),
          eventRhythm: rhythm(4, 'quarter', { tieStop: true }),
          selectedPosition: position(1, 10),
          alternativePositions: [position(2, 15), position(3, 19)],
        }),
        restEvent({
          measureIndex: 4,
          eventIndex: 2,
          measureNumber: '4',
          startDivisions: 8,
          divisions,
          eventRhythm: rhythm(8, 'half'),
        }),
      ],
    }),
  ];
  const totalFingeringCost = applyFingeringCosts(measures);

  return deepFreeze({
    documentType: 'CanonicalTabResult',
    schemaVersion: '1.0.0',
    engine: {
      name: 'musicxml-to-guitar-tab-engine',
      version: '0.1.0',
    },
    source: {
      documentType: 'CanonicalMusicDocument',
      contractVersion: '1.0.0',
      format: 'score-partwise',
      version: '4.0',
      partId: 'P1',
    },
    requiresTeacherReview: true,
    guitar: {
      tuning: STANDARD_TUNING,
      minimumFret: 0,
      maximumFret: 20,
    },
    fingeringProfile: DEFAULT_FINGERING_PROFILE,
    totalFingeringCost,
    measureCount: measures.length,
    voiceCount: 1,
    noteCount: 12,
    restCount: 2,
    measures,
    warnings: [],
  });
}

module.exports = {
  createCanonicalTabCompatibilityFixture,
};
