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

const BASIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-2.3 final remediation</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('PA-2.3 rejects conditional tie semantics that cannot be represented by boolean flags', () => {
  const xml = BASIC_XML.replace(
    '<tie type="start"/>',
    '<tie type="start" time-only="2"/>',
  );
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);

  assert.throws(
    () => projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
      assert.equal(error.details.feature, 'conditional-tie');
      return true;
    },
  );
});

test('PA-2.3 semantic event budget ignores foreign-namespace note extensions', () => {
  const xml = BASIC_XML
    .replace(
      '<score-partwise version="4.0">',
      '<score-partwise version="4.0" xmlns="http://www.musicxml.org/ns/musicxml" xmlns:x="urn:pa-2-3-foreign">',
    )
    .replace(
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>',
      '<x:note/><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>',
    );
  const runtime = createMusicXmlProcessingRuntime({ maxEvents: 1 });
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  const projected = projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);

  assert.equal(projected.eventCount, 1);
  assert.equal(projected.measures[0].events.length, 1);
});

test('PA-2.3 observes pre-aborted cancellation before structural tree scans', () => {
  const parseRuntime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(BASIC_XML, {}, parseRuntime);
  let rootChildrenReads = 0;
  const root = new Proxy(parsed.root, {
    get(target, property, receiver) {
      if (property === 'children') {
        rootChildrenReads += 1;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const guardedParsed = Object.freeze({ ...parsed, root });
  const controller = new AbortController();
  controller.abort();
  const runtime = createMusicXmlProcessingRuntime({ signal: controller.signal });

  assert.throws(
    () => projectParsedMusicXmlToPolyphonicSourceModel(guardedParsed, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.equal(error.details.phase, 'polyphonic-projector:start');
      return true;
    },
  );
  assert.equal(rootChildrenReads, 0);
});
