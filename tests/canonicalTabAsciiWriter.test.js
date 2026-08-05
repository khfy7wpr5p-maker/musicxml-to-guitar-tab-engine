'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const packageApi = require('..');
const {
  parseCanonicalTabResult,
} = require('../src/parser/parseCanonicalTabResult');
const {
  CanonicalTabAsciiWriterError,
  serializeCanonicalTabResultToAscii,
} = require('../src/writers/canonicalTabAsciiWriter');

function score(measuresXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">${measuresXml}</part>
</score-partwise>`;
}

function note({
  step = 'C',
  octave = 4,
  duration = 1,
  type = 'quarter',
  rest = false,
} = {}) {
  const pitch = rest
    ? '<rest/>'
    : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
  return `<note>${pitch}<duration>${duration}</duration><voice>1</voice><type>${type}</type><staff>1</staff></note>`;
}

function threeEventResult() {
  const canonicalTabResult = parseCanonicalTabResult(score(`
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${note({ step: 'E', octave: 4 })}
      ${note({ rest: true })}
      ${note({ step: 'D', octave: 3 })}
    </measure>`));
  const mutable = JSON.parse(JSON.stringify(canonicalTabResult));
  mutable.measures[0].events[0].selectedPosition = { string: 1, fret: 0 };
  mutable.measures[0].events[2].selectedPosition = { string: 6, fret: 10 };
  return mutable;
}

function emptyThenNoteResult() {
  const canonicalTabResult = parseCanonicalTabResult(score(`
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
    </measure>
    <measure number="2">
      ${note({ step: 'C', octave: 4 })}
    </measure>`));
  const mutable = JSON.parse(JSON.stringify(canonicalTabResult));
  mutable.measures[1].events[0].selectedPosition = { string: 2, fret: 1 };
  return mutable;
}

function expectWriterCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabAsciiWriterError);
    assert.equal(error.code, code);
    return true;
  });
}

test('renders strings 1 through 6 with selected frets, rests and aligned double-digit cells', () => {
  const ascii = serializeCanonicalTabResultToAscii(threeEventResult());
  const lines = ascii.split('\n');

  assert.deepEqual(lines, [
    '1|-0--------|',
    '2|----------|',
    '3|----------|',
    '4|----------|',
    '5|----------|',
    '6|-------10-|',
  ]);
  assert.equal(new Set(lines.map((line) => line.length)).size, 1);
  for (const line of lines) {
    assert.equal(line.slice(5, 8), '---');
  }
});

test('preserves measure boundaries and gives empty measures a visible aligned cell', () => {
  const lines = serializeCanonicalTabResultToAscii(emptyThenNoteResult()).split('\n');

  assert.deepEqual(lines, [
    '1|---|---|',
    '2|---|-1-|',
    '3|---|---|',
    '4|---|---|',
    '5|---|---|',
    '6|---|---|',
  ]);
  for (const line of lines) {
    assert.equal((line.match(/\|/g) || []).length, 3);
  }
});

test('is deterministic, supports one optional trailing newline and does not mutate input', () => {
  const canonicalTabResult = threeEventResult();
  const before = structuredClone(canonicalTabResult);

  const first = serializeCanonicalTabResultToAscii(canonicalTabResult);
  const second = serializeCanonicalTabResultToAscii(canonicalTabResult);
  const withNewline = serializeCanonicalTabResultToAscii(
    canonicalTabResult,
    { trailingNewline: true },
  );

  assert.equal(first, second);
  assert.equal(withNewline, `${first}\n`);
  assert.deepEqual(canonicalTabResult, before);
});

test('uses only selectedPosition and ignores alternativePositions for visible TAB', () => {
  const baseline = threeEventResult();
  const changedAlternatives = structuredClone(baseline);
  changedAlternatives.measures[0].events[0].alternativePositions = [
    { string: 6, fret: 20 },
    { string: 2, fret: 5 },
  ];
  changedAlternatives.measures[0].events[2].alternativePositions = [];

  assert.equal(
    serializeCanonicalTabResultToAscii(changedAlternatives),
    serializeCanonicalTabResultToAscii(baseline),
  );
});

test('rejects invalid Canonical TAB results with structured error codes', () => {
  expectWriterCode(
    () => serializeCanonicalTabResultToAscii(null),
    'INVALID_CANONICAL_TAB_ASCII_RESULT',
  );

  const unsupported = threeEventResult();
  unsupported.schemaVersion = '2.0.0';
  expectWriterCode(
    () => serializeCanonicalTabResultToAscii(unsupported),
    'UNSUPPORTED_CANONICAL_TAB_ASCII_SCHEMA',
  );

  const invalidPosition = threeEventResult();
  invalidPosition.measures[0].events[0].selectedPosition = { string: 7, fret: 0 };
  expectWriterCode(
    () => serializeCanonicalTabResultToAscii(invalidPosition),
    'INVALID_CANONICAL_TAB_ASCII_RESULT',
  );
});

test('rejects invalid or unknown ASCII writer options before rendering', () => {
  const canonicalTabResult = threeEventResult();

  expectWriterCode(
    () => serializeCanonicalTabResultToAscii(canonicalTabResult, null),
    'INVALID_CANONICAL_TAB_ASCII_OPTIONS',
  );
  expectWriterCode(
    () => serializeCanonicalTabResultToAscii(canonicalTabResult, { width: 4 }),
    'INVALID_CANONICAL_TAB_ASCII_OPTIONS',
  );
  expectWriterCode(
    () => serializeCanonicalTabResultToAscii(
      canonicalTabResult,
      { trailingNewline: 'yes' },
    ),
    'INVALID_CANONICAL_TAB_ASCII_OPTIONS',
  );
});

test('exposes the ASCII writer through the package root API', () => {
  assert.equal(
    packageApi.serializeCanonicalTabResultToAscii,
    serializeCanonicalTabResultToAscii,
  );
});
