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

const TWO_EVENT_XML = BASIC_XML.replace(
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>',
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note><note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>',
);

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

test('PA-2.3 rejects measure-style semantics that the source model cannot represent', () => {
  const xml = BASIC_XML.replace(
    '<staves>1</staves>',
    '<staves>1</staves><measure-style><multiple-rest>4</multiple-rest></measure-style>',
  );
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);

  assert.throws(
    () => projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
      assert.equal(error.details.feature, 'measure-style');
      return true;
    },
  );
});

test('PA-2.3 rejects note-level attack and release timing offsets', () => {
  for (const attribute of ['attack', 'release']) {
    const xml = BASIC_XML.replace('<note>', `<note ${attribute}="1">`);
    const runtime = createMusicXmlProcessingRuntime();
    const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);

    assert.throws(
      () => projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime),
      (error) => {
        assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
        assert.equal(error.details.feature, 'note-timing-offset');
        assert.equal(error.details.attribute, attribute);
        return true;
      },
    );
  }
});

test('PA-2.3 semantic measure budget ignores foreign-namespace measure extensions', () => {
  const xml = BASIC_XML
    .replace(
      '<score-partwise version="4.0">',
      '<score-partwise version="4.0" xmlns="http://www.musicxml.org/ns/musicxml" xmlns:x="urn:pa-2-3-foreign">',
    )
    .replace(
      '    </measure>\n  </part>',
      '    </measure>\n    <x:measure number="foreign"/>\n  </part>',
    );
  const runtime = createMusicXmlProcessingRuntime({ maxMeasures: 1 });
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  const projected = projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);

  assert.equal(projected.measureCount, 1);
  assert.equal(projected.measures.length, 1);
});

test('PA-2.3 observes the deadline during PolyphonicSourceModel event validation', () => {
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    {
      clock: (phase) => phase === 'polyphonic-source-model:event' ? 11 : 0,
    },
  );
  const parsed = parseParsedMusicXmlDocument(BASIC_XML, {}, runtime);

  assert.throws(
    () => projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_DEADLINE_EXCEEDED');
      assert.equal(error.details.phase, 'polyphonic-source-model:event');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.eventIndex, 0);
      return true;
    },
  );
});

test('PA-2.3 observes cancellation between PolyphonicSourceModel event validations', () => {
  const controller = new AbortController();
  let cancellationInjected = false;
  const runtime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    {
      clock: (phase) => {
        if (phase === 'polyphonic-source-model:event' && !cancellationInjected) {
          cancellationInjected = true;
          controller.abort();
        }
        return 0;
      },
    },
  );
  const parsed = parseParsedMusicXmlDocument(TWO_EVENT_XML, {}, runtime);

  assert.throws(
    () => projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.equal(error.details.phase, 'polyphonic-source-model:event');
      assert.equal(error.details.measureIndex, 0);
      assert.equal(error.details.eventIndex, 1);
      return true;
    },
  );
});
