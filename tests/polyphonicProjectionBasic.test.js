'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');

const BASIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.3</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
      <note><rest/><duration>4</duration><voice>1</voice><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><tie type="start"/><voice>1</voice><staff>1</staff><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2" implicit="yes">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note>
      <note><rest/><duration>8</duration><voice>1</voice><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function expectedBasicModel() {
  return {
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
    measureCount: 2,
    eventCount: 5,
    measures: [
      {
        measureId: 'P1:measure:0',
        index: 0,
        number: '1',
        implicit: false,
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
        expectedDurationDivisions: 16,
        events: [
          {
            sourceEventId: 'P1:measure:0:note:0',
            sourceOrder: 0,
            type: 'note',
            voice: '1',
            staff: 1,
            onsetDivisions: 0,
            durationDivisions: 4,
            pitch: { step: 'C', alter: 0, octave: 4, midi: 60, written: 'C4' },
            tieStart: false,
            tieStop: false,
            source: { partId: 'P1', measureIndex: 0, measureNumber: '1', noteIndex: 0, chordWithPrevious: false },
          },
          {
            sourceEventId: 'P1:measure:0:note:1',
            sourceOrder: 1,
            type: 'rest',
            voice: '1',
            staff: 1,
            onsetDivisions: 4,
            durationDivisions: 4,
            tieStart: false,
            tieStop: false,
            source: { partId: 'P1', measureIndex: 0, measureNumber: '1', noteIndex: 1, chordWithPrevious: false },
          },
          {
            sourceEventId: 'P1:measure:0:note:2',
            sourceOrder: 2,
            type: 'note',
            voice: '1',
            staff: 1,
            onsetDivisions: 8,
            durationDivisions: 8,
            pitch: { step: 'D', alter: 0, octave: 4, midi: 62, written: 'D4' },
            tieStart: true,
            tieStop: false,
            source: { partId: 'P1', measureIndex: 0, measureNumber: '1', noteIndex: 2, chordWithPrevious: false },
          },
        ],
      },
      {
        measureId: 'P1:measure:1',
        index: 1,
        number: '2',
        implicit: true,
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
        expectedDurationDivisions: 16,
        events: [
          {
            sourceEventId: 'P1:measure:1:note:0',
            sourceOrder: 0,
            type: 'note',
            voice: '1',
            staff: 1,
            onsetDivisions: 0,
            durationDivisions: 8,
            pitch: { step: 'D', alter: 0, octave: 4, midi: 62, written: 'D4' },
            tieStart: false,
            tieStop: true,
            source: { partId: 'P1', measureIndex: 1, measureNumber: '2', noteIndex: 0, chordWithPrevious: false },
          },
          {
            sourceEventId: 'P1:measure:1:note:1',
            sourceOrder: 1,
            type: 'rest',
            voice: '1',
            staff: 1,
            onsetDivisions: 8,
            durationDivisions: 8,
            tieStart: false,
            tieStop: false,
            source: { partId: 'P1', measureIndex: 1, measureNumber: '2', noteIndex: 1, chordWithPrevious: false },
          },
        ],
      },
    ],
  };
}

test('PA-2.3 projects basic note/rest source facts into an immutable PA-1 model', () => {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(BASIC_XML, {}, runtime);
  const before = JSON.stringify(parsed);

  const projected = projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
  const expected = createPolyphonicSourceModel(expectedBasicModel());

  assert.deepEqual(projected, expected);
  assert.ok(Object.isFrozen(projected));
  assert.ok(Object.isFrozen(projected.measures));
  assert.ok(Object.isFrozen(projected.measures[0].events));
  assert.equal(JSON.stringify(parsed), before);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.root));
});

test('PA-2.3 keeps PA-2.4 and PA-2.5 constructs fail-closed', () => {
  const cases = [
    BASIC_XML.replace(
      '<note><rest/><duration>4</duration><voice>1</voice><staff>1</staff></note>',
      '<forward><duration>4</duration></forward><note><rest/><duration>4</duration><voice>1</voice><staff>1</staff></note>',
    ),
    BASIC_XML.replace(
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>',
    ),
    BASIC_XML.replace('<staves>1</staves>', '<staves>2</staves>').replaceAll('<staff>1</staff>', '<staff>2</staff>'),
    BASIC_XML.replace('<voice>1</voice><staff>1</staff>', '<voice>2</voice><staff>1</staff>'),
  ];

  for (const xml of cases) {
    const runtime = createMusicXmlProcessingRuntime();
    const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
    assert.throws(() => projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime));
  }
});

test('PA-2.3 projector remains internal and does not expand package-root API', () => {
  const polyphonicPublicNames = Object.keys(publicApi)
    .filter((name) => name.toLowerCase().includes('polyphonic'));
  assert.deepEqual(polyphonicPublicNames, []);
});
