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
  createCanonicalTabResultV2,
} = require('../src/tab/canonicalTabResultV2');

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function scoreWithLetRing() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>A3 let-ring migration</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations><tied type="let-ring"/></notations>
      </note>
      <forward><duration>12</duration></forward>
    </measure>
  </part>
</score-partwise>`;
}

// Red-first contract: let-ring is notation evidence, never sustain-tie continuity.
test('A3 production migration preserves let-ring as non-continuity notation evidence', () => {
  const projected = project(scoreWithLetRing());
  const event = projected.measures[0].events[0];

  assert.equal(event.tieStart, false);
  assert.equal(event.tieStop, false);
  assert.equal(event.letRing, true);
});

test('A3 canonical TAB result preserves let-ring source evidence without inventing tie continuity', () => {
  const projected = project(scoreWithLetRing());
  const sourceEventId = projected.measures[0].events[0].sourceEventId;
  const canonical = createCanonicalTabResultV2(projected, [{
    decisionType: 'PRESERVED',
    sourceEventIds: [sourceEventId],
    sourceGroupId: null,
  }]);
  const event = canonical.measures[0].events[0];

  assert.equal(event.tieStart, false);
  assert.equal(event.tieStop, false);
  assert.equal(event.letRing, true);
});
