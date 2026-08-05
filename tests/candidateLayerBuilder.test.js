'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CandidateLayerBuilderError,
  buildCandidateLayers,
} = require('../src/fingering/candidateLayerBuilder');
const { PlayabilityError } = require('../src/guitar/playability');
const { STANDARD_TUNING } = require('../src/guitar/tuning');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function createLowDMusicXml() {
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
        <pitch><step>D</step><octave>2</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

function deepFreezeGraph(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) {
    deepFreezeGraph(nested, seen);
  }
  return Object.freeze(value);
}

function createUnplayableMusicXml() {
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
        <pitch><step>C</step><octave>7</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

test('builds deterministic candidate layers from canonical note events and skips rests', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );

  const result = buildCandidateLayers(canonicalDocument);

  assert.equal(result.documentType, 'CanonicalFingeringCandidates');
  assert.equal(result.partId, 'P1');
  assert.equal(result.noteCount, 5);
  assert.equal(result.candidateLayers.length, 5);
  assert.deepEqual(
    result.notes.map((note) => note.eventId),
    ['m1-e0', 'm1-e1', 'm1-e2', 'm2-e0', 'm2-e1'],
  );
  assert.deepEqual(result.candidateLayers[0], [
    { string: 2, fret: 1 },
    { string: 3, fret: 5 },
    { string: 4, fret: 10 },
    { string: 5, fret: 15 },
    { string: 6, fret: 20 },
  ]);
  assert.equal(result.notes[0].measureKey, 'P1:measure:0');
  assert.equal(result.notes[3].measureKey, 'P1:measure:1');
  assert.equal(result.notes[0].rhythm.type, 'quarter');
  assert.deepEqual(result.notes[0].sourceLocation, {
    partId: 'P1',
    measure: '1',
    noteIndex: 0,
  });
});

test('honors a configured fret range while preserving deterministic candidate order', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );

  const result = buildCandidateLayers(canonicalDocument, { maximumFret: 5 });

  assert.equal(result.guitarConfiguration.maximumFret, 5);
  assert.deepEqual(result.candidateLayers[0], [
    { string: 2, fret: 1 },
    { string: 3, fret: 5 },
  ]);
});

test('supports custom tuning when it makes a note playable', () => {
  const canonicalDocument = parseCanonicalMusicDocument(createLowDMusicXml());
  const dropDTuning = STANDARD_TUNING.map((entry) => (
    entry.number === 6
      ? { number: 6, pitch: 'D2', midi: 38 }
      : { ...entry }
  ));

  assert.throws(
    () => buildCandidateLayers(canonicalDocument),
    (error) => error.code === 'UNPLAYABLE_NOTE',
  );

  const result = buildCandidateLayers(canonicalDocument, { tuning: dropDTuning });

  assert.deepEqual(result.candidateLayers, [[{ string: 6, fret: 0 }]]);
  assert.equal(result.guitarConfiguration.tuning[5].midi, 38);
});

test('rejects notes outside the configured guitar range with event location details', () => {
  const canonicalDocument = parseCanonicalMusicDocument(createUnplayableMusicXml());

  assert.throws(
    () => buildCandidateLayers(canonicalDocument),
    (error) => {
      assert.ok(error instanceof PlayabilityError);
      assert.equal(error.code, 'UNPLAYABLE_NOTE');
      assert.equal(error.details.midi, 96);
      assert.equal(error.details.eventId, 'm1-e0');
      assert.equal(error.details.measureKey, 'P1:measure:0');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.eventIndex, 0);
      return true;
    },
  );
});

test('accepts only deeply frozen canonical boundary output', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const copiedDocument = structuredClone(canonicalDocument);

  assert.throws(
    () => buildCandidateLayers(copiedDocument),
    (error) => {
      assert.ok(error instanceof CandidateLayerBuilderError);
      assert.equal(error.code, 'INVALID_CANONICAL_MUSIC_DOCUMENT');
      return true;
    },
  );
  assert.throws(
    () => buildCandidateLayers({}),
    (error) => error.code === 'INVALID_CANONICAL_MUSIC_DOCUMENT',
  );
});

test('rejects cyclic frozen lookalikes instead of recursing during metadata cloning', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const forgedDocument = structuredClone(canonicalDocument);
  const rhythm = forgedDocument.measures[0].events[0].rhythm;
  rhythm.cycle = rhythm;
  deepFreezeGraph(forgedDocument);

  assert.throws(
    () => buildCandidateLayers(forgedDocument),
    (error) => {
      assert.ok(error instanceof CandidateLayerBuilderError);
      assert.equal(error.code, 'INVALID_CANONICAL_MUSIC_DOCUMENT');
      return true;
    },
  );
});

test('rejects unknown builder options with a stable error code', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );

  assert.throws(
    () => buildCandidateLayers(canonicalDocument, { unknown: true }),
    (error) => {
      assert.ok(error instanceof CandidateLayerBuilderError);
      assert.equal(error.code, 'INVALID_CANDIDATE_BUILDER_OPTIONS');
      assert.equal(error.details.field, 'unknown');
      return true;
    },
  );
});

test('does not mutate canonical input and deeply freezes candidate output', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const before = structuredClone(canonicalDocument);

  const result = buildCandidateLayers(canonicalDocument);

  assert.deepEqual(canonicalDocument, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.notes));
  assert.ok(Object.isFrozen(result.notes[0]));
  assert.ok(Object.isFrozen(result.notes[0].rhythm));
  assert.ok(Object.isFrozen(result.candidateLayers));
  assert.ok(Object.isFrozen(result.candidateLayers[0]));
  assert.ok(Object.isFrozen(result.candidateLayers[0][0]));
  assert.ok(Object.isFrozen(result.guitarConfiguration));
  assert.ok(Object.isFrozen(result.guitarConfiguration.tuning));
});
