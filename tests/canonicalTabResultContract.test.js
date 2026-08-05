'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_TAB_RESULT_VERSION,
} = require('../src/tab/canonicalTabResult');
const {
  parseCanonicalTabResult,
} = require('../src/parser/parseCanonicalTabResult');
const {
  CanonicalTabContractError,
  validateCanonicalTabResult,
} = require('../src/contracts/canonicalTabResultContract');

function readFixture(name, encoding = null) {
  return fs.readFileSync(
    path.join(__dirname, 'fixtures', name),
    encoding || undefined,
  );
}

function readJsonFixture(name) {
  return JSON.parse(readFixture(name, 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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

function fullResult() {
  return parseCanonicalTabResult(
    readFixture('parser-single-voice.musicxml'),
  );
}

function emptyMeasureResult() {
  return parseCanonicalTabResult(score(''));
}

function expectContractError(fn, {
  code = 'INVALID_CANONICAL_TAB_RESULT',
  rule,
  path: expectedPath,
} = {}) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabContractError);
    assert.equal(error.code, code);
    if (rule !== undefined) {
      assert.equal(error.details.rule, rule);
    }
    if (expectedPath !== undefined) {
      assert.equal(error.details.path, expectedPath);
    }
    return true;
  });
}

test('declares a Draft 2020-12 schema aligned with CanonicalTabResult 1.0.0', () => {
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', 'schemas', 'canonical-tab-result.v1.schema.json'),
      'utf8',
    ),
  );

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.title, 'CanonicalTabResult 1.0.0');
  assert.equal(schema.properties.documentType.const, 'CanonicalTabResult');
  assert.equal(schema.properties.schemaVersion.const, CANONICAL_TAB_RESULT_VERSION);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.noteEvent.additionalProperties, false);
  assert.equal(schema.$defs.restEvent.additionalProperties, false);
  assert.equal(schema.$defs.measure.additionalProperties, false);
});

test('accepts the reviewed v1 fixture and current generated result without mutation', () => {
  const fixture = readJsonFixture('canonical-tab-result-v1.valid.json');
  const generated = fullResult();
  const fixtureBefore = structuredClone(fixture);
  const generatedBefore = structuredClone(generated);

  assert.strictEqual(validateCanonicalTabResult(fixture), fixture);
  assert.strictEqual(validateCanonicalTabResult(generated), generated);
  assert.deepEqual(fixture, fixtureBefore);
  assert.deepEqual(generated, generatedBefore);
  assert.ok(Object.isFrozen(generated));
});

test('rejects unsupported schema versions with a stable public code and details', () => {
  const invalidSchema = readJsonFixture(
    'canonical-tab-result-v1.invalid-schema.json',
  );

  expectContractError(
    () => validateCanonicalTabResult(invalidSchema),
    {
      code: 'UNSUPPORTED_CANONICAL_TAB_SCHEMA',
      rule: 'UNSUPPORTED_SCHEMA_VERSION',
      path: 'canonicalTabResult.schemaVersion',
    },
  );
});

test('rejects missing, unknown and mistyped contract fields deterministically', () => {
  const missing = readJsonFixture('canonical-tab-result-v1.valid.json');
  delete missing.engine;
  expectContractError(
    () => validateCanonicalTabResult(missing),
    {
      rule: 'MISSING_FIELD',
      path: 'canonicalTabResult.engine',
    },
  );

  const unknown = readJsonFixture('canonical-tab-result-v1.valid.json');
  unknown.modelVersion = 'future';
  expectContractError(
    () => validateCanonicalTabResult(unknown),
    {
      rule: 'UNKNOWN_FIELD',
      path: 'canonicalTabResult.modelVersion',
    },
  );

  const wrongType = readJsonFixture('canonical-tab-result-v1.valid.json');
  wrongType.measureCount = '1';
  expectContractError(
    () => validateCanonicalTabResult(wrongType),
    {
      rule: 'SAFE_INTEGER_RANGE',
      path: 'canonicalTabResult.measureCount',
    },
  );

  const repeated = readJsonFixture('canonical-tab-result-v1.valid.json');
  repeated.noteCount = 1;
  let first;
  let second;
  try {
    validateCanonicalTabResult(repeated);
  } catch (error) {
    first = error;
  }
  try {
    validateCanonicalTabResult(repeated);
  } catch (error) {
    second = error;
  }
  assert.deepEqual(first.details, second.details);
});

test('rejects cyclic and JSON-unsafe graphs before structural validation', () => {
  const scenarios = [
    {
      code: 'UNSAFE_CANONICAL_TAB_VALUE',
      rule: 'JSON_UNSAFE_NUMBER',
      path: 'canonicalTabResult.totalFingeringCost',
      apply: (value) => { value.totalFingeringCost = Number.NaN; },
    },
    {
      code: 'UNSAFE_CANONICAL_TAB_VALUE',
      rule: 'JSON_UNSAFE_NUMBER',
      path: 'canonicalTabResult.totalFingeringCost',
      apply: (value) => { value.totalFingeringCost = -0; },
    },
    {
      code: 'UNSAFE_CANONICAL_TAB_VALUE',
      rule: 'SPARSE_ARRAY',
      path: 'canonicalTabResult.measures[0]',
      apply: (value) => { value.measures = new Array(value.measureCount); },
    },
    {
      code: 'UNSAFE_CANONICAL_TAB_VALUE',
      rule: 'ACCESSOR_PROPERTY',
      path: 'canonicalTabResult.engine',
      apply: (value) => {
        const engine = value.engine;
        Object.defineProperty(value, 'engine', {
          enumerable: true,
          get: () => engine,
        });
      },
    },
    {
      code: 'UNSAFE_CANONICAL_TAB_VALUE',
      rule: 'SYMBOL_KEY',
      path: 'canonicalTabResult',
      apply: (value) => { value[Symbol('future')] = true; },
    },
  ];

  for (const scenario of scenarios) {
    const value = readJsonFixture('canonical-tab-result-v1.valid.json');
    scenario.apply(value);
    expectContractError(
      () => validateCanonicalTabResult(value),
      scenario,
    );
  }

  const cyclic = readJsonFixture('canonical-tab-result-v1.valid.json');
  cyclic.self = cyclic;
  expectContractError(
    () => validateCanonicalTabResult(cyclic),
    {
      code: 'CYCLIC_CANONICAL_TAB_RESULT',
      rule: 'CYCLIC_REFERENCE',
      path: 'canonicalTabResult.self',
    },
  );
});


test('preserves one positive MusicXML voice number without requiring voice 1', () => {
  const value = cloneJson(fullResult());
  for (const measure of value.measures) {
    for (const event of measure.events) {
      event.voice = 2;
    }
  }

  assert.strictEqual(validateCanonicalTabResult(value), value);
});

test('enforces counts, deterministic indexes, event sequencing and durations', () => {
  const countMismatch = cloneJson(fullResult());
  countMismatch.noteCount += 1;
  expectContractError(
    () => validateCanonicalTabResult(countMismatch),
    {
      rule: 'NOTE_COUNT_MISMATCH',
      path: 'canonicalTabResult.noteCount',
    },
  );

  const measureIndexMismatch = cloneJson(fullResult());
  measureIndexMismatch.measures[0].measureIndex = 2;
  expectContractError(
    () => validateCanonicalTabResult(measureIndexMismatch),
    {
      rule: 'MEASURE_INDEX_MISMATCH',
      path: 'canonicalTabResult.measures[0].measureIndex',
    },
  );

  const eventIndexMismatch = cloneJson(fullResult());
  eventIndexMismatch.measures[0].events[0].eventIndex = 3;
  expectContractError(
    () => validateCanonicalTabResult(eventIndexMismatch),
    {
      rule: 'EVENT_INDEX_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[0].eventIndex',
    },
  );

  const startMismatch = cloneJson(fullResult());
  startMismatch.measures[0].events[1].start.divisions += 1;
  expectContractError(
    () => validateCanonicalTabResult(startMismatch),
    {
      rule: 'EVENT_START_SEQUENCE_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[1].start.divisions',
    },
  );

  const rhythmMismatch = cloneJson(fullResult());
  rhythmMismatch.measures[0].events[0].rhythm.durationDivisions = 1;
  expectContractError(
    () => validateCanonicalTabResult(rhythmMismatch),
    {
      rule: 'RHYTHM_DURATION_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[0].rhythm.durationDivisions',
    },
  );
});

test('enforces written pitch, tuning MIDI and physical string/fret validity', () => {
  const pitchMismatch = cloneJson(fullResult());
  pitchMismatch.measures[0].events[0].pitch.midi += 1;
  expectContractError(
    () => validateCanonicalTabResult(pitchMismatch),
    {
      rule: 'PITCH_MIDI_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[0].pitch.midi',
    },
  );

  const writtenMismatch = cloneJson(fullResult());
  writtenMismatch.measures[0].events[0].pitch.written = 'D4';
  expectContractError(
    () => validateCanonicalTabResult(writtenMismatch),
    {
      rule: 'WRITTEN_PITCH_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[0].pitch.written',
    },
  );

  const tuningMismatch = cloneJson(fullResult());
  tuningMismatch.guitar.tuning[0].midi -= 1;
  expectContractError(
    () => validateCanonicalTabResult(tuningMismatch),
    {
      rule: 'TUNING_PITCH_MIDI_MISMATCH',
      path: 'canonicalTabResult.guitar.tuning[0].midi',
    },
  );

  const positionMismatch = cloneJson(fullResult());
  positionMismatch.measures[0].events[0].selectedPosition.fret += 1;
  expectContractError(
    () => validateCanonicalTabResult(positionMismatch),
    {
      rule: 'POSITION_PITCH_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[0].selectedPosition',
    },
  );
});

test('rejects duplicated alternatives and invalid rest-specific fields', () => {
  const duplicateAlternative = cloneJson(fullResult());
  duplicateAlternative.measures[0].events[0].alternativePositions.unshift(
    cloneJson(duplicateAlternative.measures[0].events[0].selectedPosition),
  );
  expectContractError(
    () => validateCanonicalTabResult(duplicateAlternative),
    {
      rule: 'DUPLICATE_TAB_POSITION',
      path: 'canonicalTabResult.measures[0].events[0].alternativePositions[0]',
    },
  );

  const rest = readJsonFixture('canonical-tab-result-v1.valid.json');
  rest.measures[0].events[0].selectedPosition = { string: 1, fret: 0 };
  expectContractError(
    () => validateCanonicalTabResult(rest),
    {
      rule: 'REST_SELECTED_POSITION_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[0].selectedPosition',
    },
  );
});

test('recomputes deterministic fingering costs and the top-level cost total', () => {
  const eventCost = cloneJson(fullResult());
  eventCost.measures[0].events[0].fingeringCost.total += 1;
  expectContractError(
    () => validateCanonicalTabResult(eventCost),
    {
      rule: 'POSITION_COST_TOTAL_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[0].fingeringCost.total',
    },
  );

  const transitionCost = cloneJson(fullResult());
  transitionCost.measures[0].events[1]
    .fingeringCost.breakdown.fretMovement += 1;
  expectContractError(
    () => validateCanonicalTabResult(transitionCost),
    {
      rule: 'TRANSITION_COST_BREAKDOWN_MISMATCH',
      path: 'canonicalTabResult.measures[0].events[1].fingeringCost.breakdown.fretMovement',
    },
  );

  const totalCost = cloneJson(fullResult());
  totalCost.totalFingeringCost += 1;
  expectContractError(
    () => validateCanonicalTabResult(totalCost),
    {
      rule: 'TOTAL_FINGERING_COST_MISMATCH',
      path: 'canonicalTabResult.totalFingeringCost',
    },
  );
});

test('requires the deterministic flattened warning index', () => {
  const value = cloneJson(emptyMeasureResult());
  assert.ok(value.measures[0].warnings.length > 0);
  assert.ok(value.warnings.length > 0);
  value.warnings = [];

  expectContractError(
    () => validateCanonicalTabResult(value),
    {
      rule: 'WARNING_INDEX_MISMATCH',
      path: 'canonicalTabResult.warnings',
    },
  );
});
