'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CanonicalFingeringPipelineError,
  assignCanonicalFingering,
} = require('../src/fingering/assignCanonicalFingering');
const { validatePosition } = require('../src/guitar/playability');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function createRestOnlyMusicXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note>
        <rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

test('assigns optimized positions back to canonical event and measure identities', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );

  const result = assignCanonicalFingering(canonicalDocument);

  assert.equal(result.documentType, 'CanonicalFingeringResult');
  assert.strictEqual(result.sourceDocument, canonicalDocument);
  assert.equal(result.measureCount, 2);
  assert.equal(result.noteCount, 5);
  assert.equal(result.assignments.length, 5);
  assert.deepEqual(
    result.assignments.map((assignment) => assignment.eventId),
    ['m1-e0', 'm1-e1', 'm1-e2', 'm2-e0', 'm2-e1'],
  );
  assert.deepEqual(
    result.assignments.map((assignment) => assignment.measureKey),
    [
      'P1:measure:0',
      'P1:measure:0',
      'P1:measure:0',
      'P1:measure:1',
      'P1:measure:1',
    ],
  );
  assert.equal(result.assignments[0].rhythm.type, 'quarter');
  assert.equal(result.assignments[4].rhythm.type, 'half');
  assert.equal(result.assignments[4].rhythm.dots, 1);
  assert.deepEqual(result.assignments[0].sourceLocation, {
    partId: 'P1',
    measure: '1',
    noteIndex: 0,
  });
  assert.ok(canonicalDocument.measures[0].events.some((event) => event.type === 'rest'));

  for (const assignment of result.assignments) {
    assert.equal(
      validatePosition(
        assignment.selectedPosition,
        assignment.midi,
        result.guitarConfiguration,
      ),
      true,
    );
  }
});

test('returns deterministic deeply frozen output without mutating canonical input', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const before = structuredClone(canonicalDocument);

  const first = assignCanonicalFingering(canonicalDocument);
  const second = assignCanonicalFingering(canonicalDocument);

  assert.deepEqual(first, second);
  assert.deepEqual(canonicalDocument, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.assignments));
  assert.ok(Object.isFrozen(first.assignments[0]));
  assert.ok(Object.isFrozen(first.assignments[0].selectedPosition));
  assert.ok(Object.isFrozen(first.assignments[0].fingeringCost));
  assert.ok(Object.isFrozen(first.assignments[0].rhythm));
  assert.ok(Object.isFrozen(first.guitarConfiguration));
  assert.ok(Object.isFrozen(first.costProfile));
});

test('preserves an all-rest canonical document without invoking the optimizer', () => {
  const canonicalDocument = parseCanonicalMusicDocument(createRestOnlyMusicXml());

  const result = assignCanonicalFingering(canonicalDocument);

  assert.strictEqual(result.sourceDocument, canonicalDocument);
  assert.equal(result.measureCount, 1);
  assert.equal(result.noteCount, 0);
  assert.equal(result.totalCost, 0);
  assert.deepEqual(result.assignments, []);
  assert.equal(result.sourceDocument.measures[0].events[0].type, 'rest');
});

test('supports a shorter guitar range when the cost profile is compatible', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );

  const result = assignCanonicalFingering(canonicalDocument, {
    guitar: { maximumFret: 5 },
    costProfile: { highFretThreshold: 5 },
  });

  assert.equal(result.guitarConfiguration.maximumFret, 5);
  assert.equal(result.costProfile.maximumFret, 5);
  assert.ok(result.assignments.every(
    (assignment) => assignment.selectedPosition.fret <= 5,
  ));
});

test('rejects inconsistent guitar and cost-profile maximum frets', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );

  assert.throws(
    () => assignCanonicalFingering(canonicalDocument, {
      guitar: { maximumFret: 5 },
      costProfile: { maximumFret: 20, highFretThreshold: 5 },
    }),
    (error) => {
      assert.ok(error instanceof CanonicalFingeringPipelineError);
      assert.equal(error.code, 'INCONSISTENT_FRET_RANGE');
      assert.equal(error.details.guitarMaximumFret, 5);
      assert.equal(error.details.costProfileMaximumFret, 20);
      return true;
    },
  );
});

test('rejects invalid and unknown pipeline options with a stable error code', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const invalidOptions = [
    null,
    [],
    { unknown: true },
    { guitar: null },
    { costProfile: false },
  ];

  for (const options of invalidOptions) {
    assert.throws(
      () => assignCanonicalFingering(canonicalDocument, options),
      (error) => {
        assert.ok(error instanceof CanonicalFingeringPipelineError);
        assert.equal(error.code, 'INVALID_FINGERING_PIPELINE_OPTIONS');
        return true;
      },
    );
  }
});
