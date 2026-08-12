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

const MUSICXML_NAMESPACE = 'http://www.musicxml.org/ns/musicxml';

function basicXml({ namespace = '', attributesExtra = '' } = {}) {
  const namespaceAttribute = namespace ? ` xmlns="${namespace}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise${namespaceAttribute} version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.3 semantic boundaries</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
        ${attributesExtra}
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
}

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

test('PA-2.3 rejects transpose declarations instead of discarding sounding-pitch semantics', () => {
  const xml = basicXml({
    attributesExtra: '<transpose><chromatic>-2</chromatic></transpose>',
  });

  assert.throws(
    () => project(xml),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
      assert.equal(error.details.feature, 'transpose');
      return true;
    },
  );
});

test('PA-2.3 rejects wholly foreign root namespaces that only mimic MusicXML local names', () => {
  const xml = basicXml({ namespace: 'urn:pa-2-3-not-musicxml' });

  assert.throws(
    () => project(xml),
    (error) => {
      assert.equal(error.code, 'INVALID_MUSICXML');
      assert.equal(error.details.field, 'rootNamespace');
      return true;
    },
  );
});

test('PA-2.3 continues to accept the official default MusicXML namespace', () => {
  const projected = project(basicXml({ namespace: MUSICXML_NAMESPACE }));

  assert.equal(projected.source.format, 'score-partwise');
  assert.equal(projected.source.partId, 'P1');
  assert.equal(projected.eventCount, 1);
  assert.equal(projected.measures[0].events[0].pitch.midi, 60);
});
