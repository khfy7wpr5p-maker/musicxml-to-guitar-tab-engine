'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');

function score(measureBody) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.4</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${measureBody}
    </measure>
  </part>
</score-partwise>`;
}

function note(step = 'C', duration = 4) {
  return `<note>
    <pitch><step>${step}</step><octave>4</octave></pitch>
    <duration>${duration}</duration>
    <voice>1</voice>
    <type>quarter</type>
    <staff>1</staff>
  </note>`;
}

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function assertInvalid(xml) {
  assert.throws(
    () => project(xml),
    (error) => {
      assert.equal(error.code, 'INVALID_MUSICXML');
      return true;
    },
  );
}

test('PA-2.4 backup rewinds the cursor without creating a source event', () => {
  const projected = project(score([
    note('C'),
    '<backup><duration>4</duration></backup>',
    note('D'),
  ].join('')));

  assert.equal(projected.eventCount, 2);
  assert.deepEqual(
    projected.measures[0].events.map((event) => event.onsetDivisions),
    [0, 0],
  );
  assert.deepEqual(
    projected.measures[0].events.map((event) => event.sourceOrder),
    [0, 1],
  );
});

test('PA-2.4 forward advances the cursor without creating a source event', () => {
  const projected = project(score([
    '<forward><duration>4</duration></forward>',
    note('E'),
  ].join('')));

  assert.equal(projected.eventCount, 1);
  assert.equal(projected.measures[0].events[0].onsetDivisions, 4);
  assert.equal(projected.measures[0].events[0].sourceOrder, 0);
});

test('PA-2.4 backup and forward preserve deterministic source-note order', () => {
  const projected = project(score([
    note('C'),
    '<forward><duration>4</duration></forward>',
    note('D'),
    '<backup><duration>8</duration></backup>',
    note('E'),
  ].join('')));

  assert.deepEqual(
    projected.measures[0].events.map((event) => ({
      sourceOrder: event.sourceOrder,
      onsetDivisions: event.onsetDivisions,
      written: event.pitch.written,
    })),
    [
      { sourceOrder: 0, onsetDivisions: 0, written: 'C4' },
      { sourceOrder: 1, onsetDivisions: 8, written: 'D4' },
      { sourceOrder: 2, onsetDivisions: 4, written: 'E4' },
    ],
  );
});

test('PA-2.4 backup fails closed on cursor underflow', () => {
  assertInvalid(score('<backup><duration>1</duration></backup>'));
});

test('PA-2.4 forward fails closed beyond the declared measure duration', () => {
  assertInvalid(score('<forward><duration>17</duration></forward>'));
});

test('PA-2.4 cursor duration must appear exactly once', () => {
  assertInvalid(score('<backup/>'));
  assertInvalid(score('<forward><duration>1</duration><duration>1</duration></forward>'));
});

test('PA-2.4 cursor duration must be a positive safe integer', () => {
  assertInvalid(score('<backup><duration>0</duration></backup>'));
  assertInvalid(score('<forward><duration>-1</duration></forward>'));
  assertInvalid(score('<forward><duration>9007199254740992</duration></forward>'));
});

test('PA-2.4 cursor elements reject unknown same-profile children and attributes', () => {
  assert.throws(() => project(score(
    '<backup profile-unknown="yes"><duration>1</duration></backup>',
  )));
  assert.throws(() => project(score(
    '<forward><duration>1</duration><profile-unknown/></forward>',
  )));
});

test('PA-2.4 timing attributes cannot change after a cursor operation starts measure timing', () => {
  assertInvalid(score([
    '<forward><duration>4</duration></forward>',
    '<attributes><divisions>4</divisions></attributes>',
  ].join('')));
});
