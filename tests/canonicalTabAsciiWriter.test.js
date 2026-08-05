'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateCanonicalTabResult,
} = require('../src/contracts/canonicalTabResultContract');
const {
  parseCanonicalTabResult,
} = require('../src/parser/parseCanonicalTabResult');
const {
  CanonicalTabAsciiWriterError,
  serializeCanonicalTabResultToAscii,
} = require('../src/writers/canonicalTabAsciiWriter');
const {
  createCanonicalTabCompatibilityFixture,
} = require('./fixtures/compatibility/canonicalTabCompatibilityFixture');

const EXPECTED_COMPATIBILITY_ASCII = [
  '1|-0-|---|----2--3--5-|----------0----|-10--10----|',
  '2|---|---|------------|-0-----3-------|-----------|',
  '3|---|-5-|------------|----3--------2-|-----------|',
  '4|---|---|------------|---------------|-----------|',
  '5|---|---|------------|---------------|-----------|',
  '6|---|---|------------|---------------|-----------|',
].join('\n');

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

function emptyThenNoteResult() {
  return parseCanonicalTabResult(score(`
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
}

function expectWriterError(fn, {
  code,
  contractCode,
  path: expectedPath,
  rule,
}) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabAsciiWriterError);
    assert.equal(error.code, code);
    if (contractCode !== undefined) {
      assert.equal(error.details.contractCode, contractCode);
    }
    if (expectedPath !== undefined) {
      assert.equal(error.details.path, expectedPath);
    }
    if (rule !== undefined) {
      assert.equal(error.details.rule, rule);
    }
    return true;
  });
}

test('renders the reviewed compatibility fixture byte-for-byte with aligned six-string TAB', () => {
  const fixture = createCanonicalTabCompatibilityFixture();

  assert.strictEqual(validateCanonicalTabResult(fixture), fixture);
  assert.equal(
    serializeCanonicalTabResultToAscii(fixture),
    EXPECTED_COMPATIBILITY_ASCII,
  );

  const lines = EXPECTED_COMPATIBILITY_ASCII.split('\n');
  assert.equal(new Set(lines.map((line) => line.length)).size, 1);
  assert.ok(lines[0].includes('-10--10-'));
  assert.equal(lines[0].split('|').length, 7);
});

test('preserves measure boundaries and gives an empty measure one visible aligned cell', () => {
  const fixture = emptyThenNoteResult();

  assert.strictEqual(validateCanonicalTabResult(fixture), fixture);
  assert.deepEqual(
    serializeCanonicalTabResultToAscii(fixture).split('\n'),
    [
      '1|---|---|',
      '2|---|-1-|',
      '3|---|---|',
      '4|---|---|',
      '5|---|---|',
      '6|---|---|',
    ],
  );
});

test('is deterministic, supports one optional trailing newline and does not mutate input', () => {
  const fixture = createCanonicalTabCompatibilityFixture();
  const before = structuredClone(fixture);

  const first = serializeCanonicalTabResultToAscii(fixture);
  const second = serializeCanonicalTabResultToAscii(fixture);
  const withNewline = serializeCanonicalTabResultToAscii(
    fixture,
    { trailingNewline: true },
  );

  assert.equal(first, second);
  assert.equal(withNewline, `${first}\n`);
  assert.deepEqual(fixture, before);
});

test('uses only selectedPosition and ignores valid alternative-position changes', () => {
  const baseline = createCanonicalTabCompatibilityFixture();
  const changedAlternatives = structuredClone(baseline);

  changedAlternatives.measures[0].events[0].alternativePositions = [
    { string: 2, fret: 5 },
  ];
  changedAlternatives.measures[4].events[0].alternativePositions = [];
  changedAlternatives.measures[4].events[1].alternativePositions = [];

  assert.strictEqual(
    validateCanonicalTabResult(changedAlternatives),
    changedAlternatives,
  );
  assert.equal(
    serializeCanonicalTabResultToAscii(changedAlternatives),
    serializeCanonicalTabResultToAscii(baseline),
  );
});

test('adapts shared contract schema, path and rule details to stable ASCII errors', () => {
  const unsupported = structuredClone(createCanonicalTabCompatibilityFixture());
  unsupported.schemaVersion = '2.0.0';
  expectWriterError(
    () => serializeCanonicalTabResultToAscii(unsupported),
    {
      code: 'UNSUPPORTED_CANONICAL_TAB_ASCII_SCHEMA',
      contractCode: 'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
      path: 'canonicalTabResult.schemaVersion',
      rule: 'UNSUPPORTED_SCHEMA_VERSION',
    },
  );

  const invalidPosition = structuredClone(createCanonicalTabCompatibilityFixture());
  invalidPosition.measures[0].events[0].selectedPosition.string = 7;
  expectWriterError(
    () => serializeCanonicalTabResultToAscii(invalidPosition),
    {
      code: 'INVALID_CANONICAL_TAB_ASCII_RESULT',
      contractCode: 'INVALID_CANONICAL_TAB_RESULT',
      path: 'canonicalTabResult.measures[0].events[0].selectedPosition.string',
      rule: 'SAFE_INTEGER_RANGE',
    },
  );
});

test('rejects invalid or unknown ASCII writer options before contract validation', () => {
  const fixture = createCanonicalTabCompatibilityFixture();

  expectWriterError(
    () => serializeCanonicalTabResultToAscii(fixture, null),
    { code: 'INVALID_CANONICAL_TAB_ASCII_OPTIONS' },
  );
  expectWriterError(
    () => serializeCanonicalTabResultToAscii(fixture, { width: 4 }),
    { code: 'INVALID_CANONICAL_TAB_ASCII_OPTIONS' },
  );
  expectWriterError(
    () => serializeCanonicalTabResultToAscii(
      fixture,
      { trailingNewline: 'yes' },
    ),
    { code: 'INVALID_CANONICAL_TAB_ASCII_OPTIONS' },
  );
  expectWriterError(
    () => serializeCanonicalTabResultToAscii(null, { width: 4 }),
    { code: 'INVALID_CANONICAL_TAB_ASCII_OPTIONS' },
  );
});

test('loading the ASCII writer does not load candidate generation or optimization modules', () => {
  const repositoryRoot = path.resolve(__dirname, '..');
  const script = `
    require('./src/writers/canonicalTabAsciiWriter');
    const forbidden = Object.keys(require.cache)
      .map((filename) => filename.replace(/\\\\/g, '/'))
      .filter((filename) => (
        filename.endsWith('/src/fingering/candidateLayerBuilder.js')
        || filename.endsWith('/src/fingering/fingeringOptimizer.js')
      ));
    if (forbidden.length > 0) {
      console.error(forbidden.join('\\n'));
      process.exit(1);
    }
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
