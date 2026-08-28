'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  createSustainedCanonicalSelectionBridgeProjection,
} = require('../src/music/sustainedCanonicalSelectionBridgeV1');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>runtime validation</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;

function sourceModel() {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(XML, {}, runtime),
    runtime,
  );
}

test('E1 bridge validates an optional runtime before invoking its first checkpoint', () => {
  assert.throws(
    () => createSustainedCanonicalSelectionBridgeProjection(
      sourceModel(),
      [{
        decisionType: 'PRESERVED',
        sourceEventIds: ['P1:measure:0:note:0'],
        sourceGroupId: null,
      }],
      {},
    ),
    (error) => error
      && error.code === 'INVALID_POLYPHONIC_SOURCE_MODEL'
      && error.details.field === 'runtime',
  );
});
