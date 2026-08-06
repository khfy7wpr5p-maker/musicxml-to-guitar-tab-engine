'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProcessingRuntime,
} = require('../src/core/processingRuntime');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  parseMusicXmlNotes,
} = require('../src/parser/musicxmlNoteParser');
const {
  normalizeXmlInput,
} = require('../src/validation/xmlSafety');

function expectCode(operation, code, details = null) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, code);
    assert.notEqual(error.name, 'RangeError');
    if (details) {
      for (const [field, value] of Object.entries(details)) {
        assert.deepEqual(error.details[field], value);
      }
    }
    return true;
  });
}

function scoreWithMeasures(count) {
  const measures = Array.from(
    { length: count },
    (_, index) => `<measure number="${index + 1}"/>`,
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
}

function scoreWithEvents(count) {
  const notes = Array.from(
    { length: count },
    () => '<note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>',
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>${count}</beats><beat-type>4</beat-type></time></attributes>
      ${notes}
    </measure>
  </part>
</score-partwise>`;
}

test('rejects entity expansion and untrusted external declarations before SAX parsing', () => {
  for (const xml of [
    '<!DOCTYPE score-partwise [<!ENTITY x "boom">]><score-partwise>&x;</score-partwise>',
    '<!DOCTYPE score-partwise SYSTEM "https://example.invalid/evil.dtd"><score-partwise/>',
    '<!ENTITY x "boom"><score-partwise/>',
  ]) {
    expectCode(
      () => normalizeXmlInput(xml),
      'UNSAFE_XML_DECLARATION',
    );
  }
});

test('rejects null bytes, invalid UTF-8 and oversized input deterministically', () => {
  expectCode(() => normalizeXmlInput('<root>\u0000</root>'), 'INVALID_ENCODING');
  expectCode(
    () => normalizeXmlInput(Buffer.from([0xc3, 0x28])),
    'INVALID_ENCODING',
  );
  expectCode(
    () => normalizeXmlInput('<root/>', { maxBytes: 3 }),
    'FILE_TOO_LARGE',
    { maxBytes: 3 },
  );
});

test('accepts exact XML structural boundaries and rejects the first excess unit', () => {
  assert.equal(
    parseParsedMusicXmlDocument('<a><b x="1">é</b></a>', {
      maxDepth: 2,
      maxElements: 2,
      maxAttributes: 1,
      maxTextBytes: 2,
    }).root.name,
    'a',
  );

  const cases = [
    ['<a><b/></a>', { maxDepth: 1 }, 'XML_DEPTH_LIMIT_EXCEEDED', { field: 'maxDepth', limit: 1, observed: 2 }],
    ['<a><b/></a>', { maxElements: 1 }, 'XML_ELEMENT_LIMIT_EXCEEDED', { field: 'maxElements', limit: 1, observed: 2 }],
    ['<a x="1" y="2"/>', { maxAttributes: 1 }, 'XML_ATTRIBUTE_LIMIT_EXCEEDED', { field: 'maxAttributes', limit: 1, observed: 2 }],
    ['<a>é</a>', { maxTextBytes: 1 }, 'XML_TEXT_LIMIT_EXCEEDED', { field: 'maxTextBytes', limit: 1, observed: 2 }],
  ];

  for (const [xml, options, code, details] of cases) {
    expectCode(() => parseParsedMusicXmlDocument(xml, options), code, details);
  }
});

test('blocks deeply nested hostile XML with a structured safety error instead of stack overflow', () => {
  const xml = `${'<x>'.repeat(512)}payload${'</x>'.repeat(512)}`;
  expectCode(
    () => parseParsedMusicXmlDocument(xml, { maxDepth: 64 }),
    'XML_DEPTH_LIMIT_EXCEEDED',
    { field: 'maxDepth', limit: 64, observed: 65 },
  );
});

test('enforces measure and event boundaries before semantic projection continues', () => {
  assert.equal(
    parseMusicXmlNotes(scoreWithMeasures(2), { maxMeasures: 2 }).measureCount,
    2,
  );
  expectCode(
    () => parseMusicXmlNotes(scoreWithMeasures(2), { maxMeasures: 1 }),
    'MUSICXML_MEASURE_LIMIT_EXCEEDED',
    { field: 'maxMeasures', limit: 1, observed: 2 },
  );

  assert.equal(
    parseMusicXmlNotes(scoreWithEvents(2), { maxEvents: 2 }).measures[0].events.length,
    2,
  );
  expectCode(
    () => parseMusicXmlNotes(scoreWithEvents(2), { maxEvents: 1 }),
    'MUSICXML_EVENT_LIMIT_EXCEEDED',
    { field: 'maxEvents', limit: 1, observed: 2, measure: '1', eventIndex: 1 },
  );
});

test('pre-aborted processing stops before work and preserves immutable error details', () => {
  const controller = new AbortController();
  controller.abort();
  const runtime = createProcessingRuntime({ signal: controller.signal });

  assert.throws(
    () => runtime.checkpoint('hostile-corpus:start'),
    (error) => {
      assert.equal(error.code, 'PROCESSING_ABORTED');
      assert.deepEqual(error.details, {
        field: 'signal',
        phase: 'hostile-corpus:start',
      });
      assert.equal(Object.isFrozen(error.details), true);
      return true;
    },
  );
});

test('deadline boundary is inclusive and the first value above it is rejected', () => {
  const observations = [100, 110, 111];
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    { clock: () => observations.shift() },
  );

  assert.equal(runtime.checkpoint('boundary'), 10);
  expectCode(
    () => runtime.checkpoint('overflow'),
    'PROCESSING_DEADLINE_EXCEEDED',
    {
      field: 'maxProcessingMilliseconds',
      limit: 10,
      observed: 11,
      phase: 'overflow',
    },
  );
});

test('non-monotonic and non-finite clocks fail as invalid configuration', () => {
  const backwards = [10, 9];
  const runtime = createProcessingRuntime({}, { clock: () => backwards.shift() });
  expectCode(
    () => runtime.checkpoint('clock:backwards'),
    'INVALID_CONFIGURATION',
    { field: 'clock', phase: 'clock:backwards' },
  );

  expectCode(
    () => createProcessingRuntime({}, { clock: () => Number.NaN }),
    'INVALID_CONFIGURATION',
    { field: 'clock', phase: 'runtime:start' },
  );
});
