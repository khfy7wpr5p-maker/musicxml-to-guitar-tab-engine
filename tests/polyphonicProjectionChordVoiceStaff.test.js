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
const {
  fixtures,
} = require('./fixtures/polyphonicProjectionValidFixtures');

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function score(measureBody, { staves = 1 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.5</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>${staves}</staves>
      </attributes>
      ${measureBody}
    </measure>
  </part>
</score-partwise>`;
}

function note(step, {
  chord = false,
  duration = 4,
  voice = '1',
  staff = 1,
  rest = false,
} = {}) {
  return `<note>${chord ? '<chord/>' : ''}${rest ? '<rest/>' : `<pitch><step>${step}</step><octave>4</octave></pitch>`}<duration>${duration}</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
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

for (const fixture of fixtures) {
  test(`PA-2.5 projects the existing valid polyphonic vector exactly: ${fixture.name}`, () => {
    const projected = project(fixture.xml);
    assert.deepEqual(projected, fixture.expectedModel);
  });
}

test('PA-2.5 preserves bounded non-numeric voice identifiers as strings', () => {
  const projected = project(score([
    note('C', { voice: 'lead' }),
    '<backup><duration>4</duration></backup>',
    note('E', { voice: 'alto' }),
  ].join('')));

  assert.deepEqual(
    projected.measures[0].events.map((event) => event.voice),
    ['lead', 'alto'],
  );
});

test('PA-2.5 trims voice text and defaults a missing voice to string 1', () => {
  const withWhitespace = project(score(note('C', { voice: '  lead  ' })));
  const withoutVoice = project(score(note('C').replace('<voice>1</voice>', '')));

  assert.equal(withWhitespace.measures[0].events[0].voice, 'lead');
  assert.equal(withoutVoice.measures[0].events[0].voice, '1');
});

test('PA-2.5 voice identifiers fail closed when empty, over-limit or duplicated', () => {
  assertInvalid(score(note('C', { voice: '   ' })));
  assertInvalid(score(note('C', { voice: 'v'.repeat(65) })));
  assertInvalid(score(note('C').replace(
    '<voice>1</voice>',
    '<voice>1</voice><voice>2</voice>',
  )));
});

test('PA-2.5 chord note preserves source marker, onset, own duration and does not advance cursor', () => {
  const projected = project(score([
    note('C'),
    note('E', { chord: true, duration: 2 }),
    note('G'),
  ].join('')));

  assert.deepEqual(
    projected.measures[0].events.map((event) => ({
      onset: event.onsetDivisions,
      duration: event.durationDivisions,
      chordWithPrevious: event.source.chordWithPrevious,
    })),
    [
      { onset: 0, duration: 4, chordWithPrevious: false },
      { onset: 0, duration: 2, chordWithPrevious: true },
      { onset: 4, duration: 4, chordWithPrevious: false },
    ],
  );
});

test('PA-2.5 chord marker fails closed when there is no valid immediately preceding source note', () => {
  assertInvalid(score(note('E', { chord: true })));
  assertInvalid(score([
    note('C'),
    '<backup><duration>4</duration></backup>',
    note('E', { chord: true }),
  ].join('')));
});

test('PA-2.5 chord marker fails closed after a rest or on a rest', () => {
  assertInvalid(score([
    note('C', { rest: true }),
    note('E', { chord: true }),
  ].join('')));
  assertInvalid(score([
    note('C'),
    note('E', { chord: true, rest: true }),
  ].join('')));
});

test('PA-2.5 chord marker requires matching voice and staff', () => {
  assertInvalid(score([
    note('C'),
    note('E', { chord: true, voice: '2' }),
  ].join('')));
  assertInvalid(score([
    note('C', { staff: 1 }),
    note('E', { chord: true, staff: 2 }),
  ].join(''), { staves: 2 }));
});

test('PA-2.5 rejects duplicate chord markers and staff values outside the two-staff contract', () => {
  assertInvalid(score([
    note('C'),
    '<note><chord/><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>',
  ].join('')));
  assertInvalid(score(note('C', { staff: 2 })));
  assertInvalid(score(note('C', { staff: 3 }), { staves: 3 }));
});

test('PA-2.5 staff identifiers fail closed when zero or duplicated', () => {
  assertInvalid(score(note('C', { staff: 0 })));
  assertInvalid(score(note('C').replace(
    '<staff>1</staff>',
    '<staff>1</staff><staff>1</staff>',
  )));
});

test('PA-2.5 malformed chord marker text fails closed instead of being silently discarded', () => {
  assertInvalid(score([
    note('C'),
    note('E', { chord: true }).replace('<chord/>', '<chord>unexpected</chord>'),
  ].join('')));
});
