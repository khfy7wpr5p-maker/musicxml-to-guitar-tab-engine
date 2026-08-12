'use strict';

function note({
  sourceEventId,
  sourceOrder,
  voice,
  staff,
  onsetDivisions,
  durationDivisions,
  step,
  alter = 0,
  octave,
  midi,
  written,
  measureIndex = 0,
  measureNumber = '1',
  chordWithPrevious = false,
  tieStart = false,
  tieStop = false,
}) {
  return {
    sourceEventId,
    sourceOrder,
    type: 'note',
    voice,
    staff,
    onsetDivisions,
    durationDivisions,
    pitch: { step, alter, octave, midi, written },
    tieStart,
    tieStop,
    source: {
      partId: 'P1',
      measureIndex,
      measureNumber,
      noteIndex: sourceOrder,
      chordWithPrevious,
    },
  };
}

function rest({
  sourceEventId,
  sourceOrder,
  voice,
  staff,
  onsetDivisions,
  durationDivisions,
  measureIndex,
  measureNumber,
}) {
  return {
    sourceEventId,
    sourceOrder,
    type: 'rest',
    voice,
    staff,
    onsetDivisions,
    durationDivisions,
    tieStart: false,
    tieStop: false,
    source: {
      partId: 'P1',
      measureIndex,
      measureNumber,
      noteIndex: sourceOrder,
      chordWithPrevious: false,
    },
  };
}

const fixtures = Object.freeze([
  Object.freeze({
    name: 'two voices with backup and forward cursor movement',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.2</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>1</staff></note>
      <forward><duration>4</duration></forward>
      <note><pitch><step>F</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`,
    monophonicErrorCode: 'UNSUPPORTED_POLYPHONY',
    expectedModel: {
      documentType: 'PolyphonicSourceModel',
      contractVersion: '1.0.0',
      source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
      measureCount: 1,
      eventCount: 4,
      measures: [{
        measureId: 'P1:measure:0',
        index: 0,
        number: '1',
        implicit: false,
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
        expectedDurationDivisions: 16,
        events: [
          note({ sourceEventId: 'P1:measure:0:note:0', sourceOrder: 0, voice: '1', staff: 1, onsetDivisions: 0, durationDivisions: 4, step: 'C', octave: 4, midi: 60, written: 'C4' }),
          note({ sourceEventId: 'P1:measure:0:note:1', sourceOrder: 1, voice: '1', staff: 1, onsetDivisions: 4, durationDivisions: 4, step: 'D', octave: 4, midi: 62, written: 'D4' }),
          note({ sourceEventId: 'P1:measure:0:note:2', sourceOrder: 2, voice: '2', staff: 1, onsetDivisions: 0, durationDivisions: 8, step: 'E', octave: 3, midi: 52, written: 'E3' }),
          note({ sourceEventId: 'P1:measure:0:note:3', sourceOrder: 3, voice: '2', staff: 1, onsetDivisions: 12, durationDivisions: 4, step: 'F', octave: 3, midi: 53, written: 'F3' }),
        ],
      }],
    },
  }),
  Object.freeze({
    name: 'source chord marker plus second staff and normalized continue tie',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.2</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><tie type="continue"/><voice>1</voice><type>quarter</type><staff>1</staff>
        <notations><tied type="continue"/></notations>
      </note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>
      <forward><duration>8</duration></forward>
    </measure>
  </part>
</score-partwise>`,
    monophonicErrorCode: 'UNSUPPORTED_POLYPHONY',
    expectedModel: {
      documentType: 'PolyphonicSourceModel',
      contractVersion: '1.0.0',
      source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
      measureCount: 1,
      eventCount: 3,
      measures: [{
        measureId: 'P1:measure:0',
        index: 0,
        number: '1',
        implicit: false,
        divisions: 4,
        timeSignature: { beats: 4, beatType: 4 },
        expectedDurationDivisions: 16,
        events: [
          note({ sourceEventId: 'P1:measure:0:note:0', sourceOrder: 0, voice: '1', staff: 1, onsetDivisions: 0, durationDivisions: 4, step: 'C', octave: 5, midi: 72, written: 'C5', tieStart: true, tieStop: true }),
          note({ sourceEventId: 'P1:measure:0:note:1', sourceOrder: 1, voice: '1', staff: 1, onsetDivisions: 0, durationDivisions: 4, step: 'E', octave: 5, midi: 76, written: 'E5', chordWithPrevious: true }),
          note({ sourceEventId: 'P1:measure:0:note:2', sourceOrder: 2, voice: '2', staff: 2, onsetDivisions: 0, durationDivisions: 8, step: 'C', octave: 3, midi: 48, written: 'C3' }),
        ],
      }],
    },
  }),
  Object.freeze({
    name: 'inherited timing and staff count across an implicit second measure',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.2</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>2</duration></backup>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>2</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
      <forward><duration>4</duration></forward>
    </measure>
    <measure number="2" implicit="yes">
      <note><rest/><duration>6</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`,
    monophonicErrorCode: 'UNSUPPORTED_POLYPHONY',
    expectedModel: {
      documentType: 'PolyphonicSourceModel',
      contractVersion: '1.0.0',
      source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
      measureCount: 2,
      eventCount: 3,
      measures: [
        {
          measureId: 'P1:measure:0',
          index: 0,
          number: '1',
          implicit: false,
          divisions: 2,
          timeSignature: { beats: 3, beatType: 4 },
          expectedDurationDivisions: 6,
          events: [
            note({ sourceEventId: 'P1:measure:0:note:0', sourceOrder: 0, voice: '1', staff: 1, onsetDivisions: 0, durationDivisions: 2, step: 'G', octave: 4, midi: 67, written: 'G4' }),
            note({ sourceEventId: 'P1:measure:0:note:1', sourceOrder: 1, voice: '2', staff: 2, onsetDivisions: 0, durationDivisions: 2, step: 'E', octave: 3, midi: 52, written: 'E3' }),
          ],
        },
        {
          measureId: 'P1:measure:1',
          index: 1,
          number: '2',
          implicit: true,
          divisions: 2,
          timeSignature: { beats: 3, beatType: 4 },
          expectedDurationDivisions: 6,
          events: [
            rest({ sourceEventId: 'P1:measure:1:note:0', sourceOrder: 0, voice: '1', staff: 2, onsetDivisions: 0, durationDivisions: 6, measureIndex: 1, measureNumber: '2' }),
          ],
        },
      ],
    },
  }),
]);

module.exports = { fixtures };
