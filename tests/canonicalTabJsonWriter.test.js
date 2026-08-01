'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCanonicalTabResult,
} = require('../src/parser/parseCanonicalTabResult');
const {
  CanonicalTabJsonWriterError,
  serializeCanonicalTabResult,
} = require('../src/writers/canonicalTabJsonWriter');

function readFixture(name, encoding = null) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), encoding || undefined);
}

function score(measureXml, {
  beats = 4,
  beatType = 4,
  divisions = 4,
  number = '1',
  implicit = false,
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="${number}"${implicit ? ' implicit="yes"' : ''}>
      <attributes>
        <divisions>${divisions}</divisions>
        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${measureXml}
    </measure>
  </part>
</score-partwise>`;
}

function note({
  step = 'C',
  octave = 4,
  duration = 4,
  type = 'quarter',
  rest = false,
} = {}) {
  const pitch = rest
    ? '<rest/>'
    : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
  return `<note>${pitch}<duration>${duration}</duration><voice>1</voice><type>${type}</type><staff>1</staff></note>`;
}

function restOnlyResult() {
  return parseCanonicalTabResult(score(
    note({ rest: true, duration: 1, type: 'quarter' }),
    { beats: 1, divisions: 1 },
  ));
}

function fullResult() {
  return parseCanonicalTabResult(readFixture('parser-single-voice.musicxml'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectWriterCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabJsonWriterError);
    assert.equal(error.code, code);
    return true;
  });
}

test('serializes a CanonicalTabResult to compact JSON that round-trips deeply', () => {
  const canonicalTabResult = fullResult();
  const jsonText = serializeCanonicalTabResult(canonicalTabResult);

  assert.equal(typeof jsonText, 'string');
  assert.equal(jsonText.includes('\n'), false);
  assert.deepEqual(JSON.parse(jsonText), canonicalTabResult);
});

test('returns byte-identical output repeatedly without mutating frozen input', () => {
  const canonicalTabResult = fullResult();
  const before = structuredClone(canonicalTabResult);

  const first = serializeCanonicalTabResult(canonicalTabResult);
  const second = serializeCanonicalTabResult(canonicalTabResult);

  assert.equal(first, second);
  assert.deepEqual(canonicalTabResult, before);
  assert.ok(Object.isFrozen(canonicalTabResult));
  assert.ok(Object.isFrozen(canonicalTabResult.measures));
  assert.ok(Object.isFrozen(canonicalTabResult.measures[0].events[0]));
});

test('preserves the approved selected and alternative positions exactly', () => {
  const parsed = JSON.parse(serializeCanonicalTabResult(fullResult()));
  const firstNote = parsed.measures[0].events[0];

  assert.deepEqual(firstNote.selectedPosition, { string: 3, fret: 5 });
  assert.ok(firstNote.alternativePositions.some(
    (position) => position.string === 2 && position.fret === 1,
  ));
  assert.deepEqual(firstNote.alternativePositions, [
    { string: 2, fret: 1 },
    { string: 4, fret: 10 },
    { string: 5, fret: 15 },
    { string: 6, fret: 20 },
  ]);
});

test('preserves rests, rhythm, ties, beams, warnings and source locations', () => {
  const parsed = JSON.parse(serializeCanonicalTabResult(fullResult()));
  const firstMeasure = parsed.measures[0];
  const secondMeasure = parsed.measures[1];
  const rest = firstMeasure.events[3];

  assert.equal(firstMeasure.events[0].rhythm.tieStart, true);
  assert.deepEqual(firstMeasure.events[1].rhythm.beam, [
    { level: 1, value: 'begin' },
  ]);
  assert.equal(secondMeasure.events[0].rhythm.tieStop, true);
  assert.deepEqual(secondMeasure.events[1].rhythm, {
    durationDivisions: 12,
    type: 'half',
    dots: 1,
    timeModification: null,
    tieStart: false,
    tieStop: false,
    beam: [],
  });
  assert.equal(rest.type, 'rest');
  assert.equal(rest.selectedPosition, null);
  assert.deepEqual(rest.alternativePositions, []);
  assert.equal(rest.fingeringCost, null);
  assert.deepEqual(firstMeasure.events[0].warnings, []);
  assert.deepEqual(firstMeasure.events[0].sourceLocation, {
    partId: 'P1',
    measure: '1',
    noteIndex: 0,
  });
});

test('matches the reviewed single-rest golden JSON fixture exactly', () => {
  const canonicalTabResult = restOnlyResult();
  const goldenText = readFixture('canonical-tab-rest-only.golden.json', 'utf8');
  const jsonText = serializeCanonicalTabResult(canonicalTabResult);
  const golden = JSON.parse(goldenText);

  assert.equal(jsonText, goldenText);
  assert.deepEqual(JSON.parse(jsonText), golden);
  assert.equal(golden.documentType, 'CanonicalTabResult');
  assert.equal(golden.schemaVersion, '1.0.0');
  assert.equal(golden.requiresTeacherReview, true);
  assert.equal(golden.measureCount, 1);
  assert.equal(golden.noteCount, 0);
  assert.equal(golden.restCount, 1);
  assert.equal(golden.measures[0].events[0].selectedPosition, null);
  assert.deepEqual(golden.measures[0].events[0].alternativePositions, []);
  assert.equal(golden.measures[0].events[0].fingeringCost, null);
});

test('writes empty-measure and all-rest results without adding data', () => {
  const emptyMeasure = parseCanonicalTabResult(score(''));
  const parsedEmpty = JSON.parse(serializeCanonicalTabResult(emptyMeasure));
  const parsedRest = JSON.parse(serializeCanonicalTabResult(restOnlyResult()));

  assert.equal(parsedEmpty.measures[0].events.length, 0);
  assert.deepEqual(parsedEmpty.warnings, emptyMeasure.warnings);
  assert.deepEqual(parsedEmpty.measures[0].warnings, emptyMeasure.measures[0].warnings);
  assert.equal(parsedRest.noteCount, 0);
  assert.equal(parsedRest.restCount, 1);
  assert.deepEqual(parsedRest, restOnlyResult());
});

test('supports pretty JSON and an optional trailing newline without semantic changes', () => {
  const canonicalTabResult = restOnlyResult();
  const compact = serializeCanonicalTabResult(canonicalTabResult);
  const pretty = serializeCanonicalTabResult(canonicalTabResult, { pretty: true });
  const prettyWithNewline = serializeCanonicalTabResult(canonicalTabResult, {
    pretty: true,
    trailingNewline: true,
  });

  assert.equal(compact.endsWith('\n'), false);
  assert.match(pretty, /\n  "schemaVersion": "1\.0\.0"/);
  assert.equal(pretty.endsWith('\n'), false);
  assert.equal(prettyWithNewline, `${pretty}\n`);
  assert.deepEqual(JSON.parse(compact), JSON.parse(pretty));
  assert.deepEqual(JSON.parse(prettyWithNewline), JSON.parse(compact));
});

test('rejects invalid result identities and unsupported schema versions', () => {
  expectWriterCode(
    () => serializeCanonicalTabResult(null),
    'INVALID_CANONICAL_TAB_RESULT',
  );
  expectWriterCode(
    () => serializeCanonicalTabResult({}),
    'INVALID_CANONICAL_TAB_RESULT',
  );

  const unsupported = cloneJson(restOnlyResult());
  unsupported.schemaVersion = '2.0.0';
  expectWriterCode(
    () => serializeCanonicalTabResult(unsupported),
    'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
  );
});

test('rejects unknown or invalid writer options', () => {
  const canonicalTabResult = restOnlyResult();
  const invalidOptions = [
    null,
    [],
    { unknown: true },
    { pretty: 2 },
    { trailingNewline: 'yes' },
  ];

  for (const options of invalidOptions) {
    expectWriterCode(
      () => serializeCanonicalTabResult(canonicalTabResult, options),
      'INVALID_CANONICAL_TAB_JSON_OPTIONS',
    );
  }
});

test('rejects JSON-unsafe values instead of silently dropping or changing them', () => {
  const scenarios = [
    { name: 'undefined', apply: (value) => { value.unsafe = undefined; } },
    { name: 'NaN', apply: (value) => { value.unsafe = Number.NaN; } },
    { name: 'Infinity', apply: (value) => { value.unsafe = Number.POSITIVE_INFINITY; } },
    { name: 'negative zero', apply: (value) => { value.unsafe = -0; } },
    { name: 'function', apply: (value) => { value.unsafe = () => {}; } },
    { name: 'symbol value', apply: (value) => { value.unsafe = Symbol('unsafe'); } },
    { name: 'bigint', apply: (value) => { value.unsafe = 1n; } },
    {
      name: 'sparse array',
      apply: (value) => {
        value.measures = new Array(value.measureCount);
      },
    },
    {
      name: 'non-enumerable property',
      apply: (value) => {
        Object.defineProperty(value, 'unsafe', { value: true, enumerable: false });
      },
    },
    {
      name: 'accessor property',
      apply: (value) => {
        Object.defineProperty(value, 'unsafe', { get: () => true, enumerable: true });
      },
    },
    {
      name: 'symbol key',
      apply: (value) => {
        value[Symbol('unsafe')] = true;
      },
    },
  ];

  for (const scenario of scenarios) {
    const unsafeResult = cloneJson(restOnlyResult());
    scenario.apply(unsafeResult);
    assert.throws(
      () => serializeCanonicalTabResult(unsafeResult),
      (error) => {
        assert.ok(error instanceof CanonicalTabJsonWriterError, scenario.name);
        assert.equal(error.code, 'UNSAFE_CANONICAL_TAB_JSON_VALUE', scenario.name);
        return true;
      },
    );
  }

  const cyclic = cloneJson(restOnlyResult());
  cyclic.self = cyclic;
  expectWriterCode(
    () => serializeCanonicalTabResult(cyclic),
    'CYCLIC_CANONICAL_TAB_RESULT',
  );
});
