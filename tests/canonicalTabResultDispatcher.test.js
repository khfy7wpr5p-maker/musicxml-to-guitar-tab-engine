'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCanonicalTabResult } = require('../src/parser/parseCanonicalTabResult');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const { createCanonicalTabResultV2 } = require('../src/tab/canonicalTabResultV2');
const {
  dispatchCanonicalTabResult,
} = require('../src/contracts/canonicalTabResultDispatcher');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function simpleV2() {
  const sourceEventId = createSourceEventId('P1', 0, 0);
  const source = createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
    measureCount: 1,
    eventCount: 1,
    measures: [{
      measureId: createMeasureId('P1', 0),
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events: [{
        sourceEventId,
        sourceOrder: 0,
        type: 'note',
        voice: '1',
        staff: 1,
        onsetDivisions: 0,
        durationDivisions: 4,
        pitch: { step: 'C', alter: 0, octave: 4, midi: 60, written: 'C4' },
        tieStart: false,
        tieStop: false,
        source: {
          partId: 'P1',
          measureIndex: 0,
          measureNumber: '1',
          noteIndex: 0,
          chordWithPrevious: false,
        },
      }],
    }],
  });
  return createCanonicalTabResultV2(source, [{
    decisionType: 'PRESERVED',
    sourceEventIds: [sourceEventId],
    sourceGroupId: null,
  }]);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('dispatcher routes exact v1 identity only to the existing v1 validator', () => {
  const v1 = parseCanonicalTabResult(readFixture('parser-single-voice.musicxml'));
  assert.equal(dispatchCanonicalTabResult(v1), v1);
});

test('dispatcher routes exact v2 identity only to the v2 validator', () => {
  const v2 = simpleV2();
  assert.equal(dispatchCanonicalTabResult(v2), v2);
});

test('dispatcher fails closed on an unregistered exact version without fallback', () => {
  const value = clone(simpleV2());
  value.schemaVersion = '2.0.1';
  assert.throws(
    () => dispatchCanonicalTabResult(value),
    (error) => error && error.code === 'UNSUPPORTED_CANONICAL_VERSION',
  );
});

test('dispatcher fails closed on wrong document type before version validation', () => {
  const value = clone(simpleV2());
  value.documentType = 'AlmostCanonicalTabResult';
  assert.throws(
    () => dispatchCanonicalTabResult(value),
    (error) => error && error.code === 'INVALID_CANONICAL_IDENTITY',
  );
});

test('dispatcher rejects accessor identity without executing it', () => {
  const value = clone(simpleV2());
  let invoked = false;
  Object.defineProperty(value, 'schemaVersion', {
    enumerable: true,
    get() {
      invoked = true;
      return '2.0.0';
    },
  });
  assert.throws(
    () => dispatchCanonicalTabResult(value),
    (error) => error && error.code === 'UNSAFE_CANONICAL_INPUT',
  );
  assert.equal(invoked, false);
});