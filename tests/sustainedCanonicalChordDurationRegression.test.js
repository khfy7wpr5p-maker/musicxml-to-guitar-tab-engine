'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  convertMusicXmlToInternalPolyphonicTabV2,
} = require('../src/core/internalPolyphonicConversionPipelineV2');

function preservedDecisions(sourceEventIds) {
  return sourceEventIds.map((sourceEventId) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [sourceEventId],
    sourceGroupId: null,
  }));
}

test('PA-12 tracks the longest same-voice chord member before a later independent attack', () => {
  const input = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Unequal chord duration</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    <forward><duration>8</duration></forward>
  </measure></part>
</score-partwise>`;

  assert.throws(
    () => convertMusicXmlToInternalPolyphonicTabV2(
      input,
      preservedDecisions([
        'P1:measure:0:note:0',
        'P1:measure:0:note:1',
        'P1:measure:0:note:2',
      ]),
    ),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION');
      assert.equal(error.details.reason, 'OVERLAPPING_NOTES_WITHIN_ONE_VOICE');
      assert.equal(error.details.sourceEventId, 'P1:measure:0:note:2');
      assert.equal(error.details.onsetDivisions, 4);
      assert.equal(error.details.cursor, 8);
      return true;
    },
  );
});
