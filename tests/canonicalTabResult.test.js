'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { version: packageVersion } = require('../package.json');
const {
  CANONICAL_TAB_RESULT_VERSION,
  CanonicalTabResultError,
  createCanonicalTabResult,
} = require('../src/tab/canonicalTabResult');
const {
  parseCanonicalTabResult,
} = require('../src/parser/parseCanonicalTabResult');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');
const { validatePosition } = require('../src/guitar/playability');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
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
  voice = 1,
  staff = 1,
  rest = false,
  extra = '',
} = {}) {
  const pitch = rest
    ? '<rest/>'
    : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
  return `<note>${extra}${pitch}<duration>${duration}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`;
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    return true;
  });
}

test('creates a versioned canonical TAB result preserving measures and original event order', () => {
  const result = parseCanonicalTabResult(
    readFixture('parser-single-voice.musicxml'),
  );

  assert.equal(result.documentType, 'CanonicalTabResult');
  assert.equal(result.schemaVersion, CANONICAL_TAB_RESULT_VERSION);
  assert.deepEqual(result.engine, {
    name: 'musicxml-to-guitar-tab-engine',
    version: packageVersion,
  });
  assert.equal(result.requiresTeacherReview, true);
  assert.equal(result.measureCount, 2);
  assert.equal(result.noteCount, 5);
  assert.equal(result.restCount, 1);
  assert.deepEqual(
    result.measures.map((measure) => measure.visibleMeasureNumber),
    ['1', '2'],
  );
  assert.deepEqual(
    result.measures[0].events.map((event) => event.type),
    ['note', 'note', 'note', 'rest'],
  );
  assert.deepEqual(
    result.measures[1].events.map((event) => event.type),
    ['note', 'note'],
  );
});

test('preserves rhythm, ties, beams, warnings and source locations', () => {
  const result = parseCanonicalTabResult(
    readFixture('parser-single-voice.musicxml'),
  );
  const [firstMeasure, secondMeasure] = result.measures;

  assert.equal(firstMeasure.events[0].rhythm.tieStart, true);
  assert.deepEqual(firstMeasure.events[1].rhythm.beam, [
    { level: 1, value: 'begin' },
  ]);
  assert.deepEqual(secondMeasure.events[1].rhythm, {
    durationDivisions: 12,
    type: 'half',
    dots: 1,
    timeModification: null,
    tieStart: false,
    tieStop: false,
    beam: [],
  });
  assert.deepEqual(firstMeasure.events[0].sourceLocation, {
    partId: 'P1',
    measure: '1',
    noteIndex: 0,
  });
  assert.deepEqual(firstMeasure.events[0].warnings, []);
});

test('stores selected and alternative positions without recomputing fingering downstream', () => {
  const result = parseCanonicalTabResult(
    readFixture('parser-single-voice.musicxml'),
  );
  const firstNote = result.measures[0].events[0];

  assert.deepEqual(firstNote.selectedPosition, { string: 3, fret: 5 });
  assert.deepEqual(firstNote.alternativePositions, [
    { string: 2, fret: 1 },
    { string: 4, fret: 10 },
    { string: 5, fret: 15 },
    { string: 6, fret: 20 },
  ]);
  assert.ok(firstNote.fingeringCost);

  for (const measure of result.measures) {
    for (const event of measure.events) {
      if (event.type === 'rest') {
        assert.equal(event.selectedPosition, null);
        assert.deepEqual(event.alternativePositions, []);
        assert.equal(event.fingeringCost, null);
        continue;
      }

      assert.equal(
        validatePosition(event.selectedPosition, event.pitch.midi, result.guitar),
        true,
      );
      for (const alternative of event.alternativePositions) {
        assert.equal(
          validatePosition(alternative, event.pitch.midi, result.guitar),
          true,
        );
        assert.notDeepEqual(alternative, event.selectedPosition);
      }
    }
  }
});

test('preserves an all-rest score with null selected positions and zero fingering cost', () => {
  const input = score(
    note({ rest: true, duration: 1, type: 'quarter' }),
    { beats: 1, divisions: 1 },
  );

  const result = parseCanonicalTabResult(input);
  const rest = result.measures[0].events[0];

  assert.equal(result.noteCount, 0);
  assert.equal(result.restCount, 1);
  assert.equal(result.totalFingeringCost, 0);
  assert.equal(rest.type, 'rest');
  assert.equal(rest.selectedPosition, null);
  assert.deepEqual(rest.alternativePositions, []);
  assert.equal(rest.fingeringCost, null);
});

test('preserves measure warnings and creates a deterministic top-level warning index', () => {
  const result = parseCanonicalTabResult(score(''));

  assert.equal(result.noteCount, 0);
  assert.equal(result.restCount, 0);
  assert.equal(result.totalFingeringCost, 0);
  assert.equal(result.measures[0].events.length, 0);
  assert.deepEqual(result.measures[0].warnings, [{
    code: 'EMPTY_MEASURE',
    message: 'Measure contains no note or rest events.',
    severity: 'warning',
    location: { measure: '1' },
    details: {},
  }]);
  assert.deepEqual(result.warnings, [{
    scope: 'measure',
    measureKey: 'P1:measure:0',
    eventId: null,
    warning: result.measures[0].warnings[0],
  }]);
});

test('returns identical deeply frozen output without mutating the canonical document', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const before = structuredClone(canonicalDocument);

  const first = createCanonicalTabResult(canonicalDocument);
  const second = createCanonicalTabResult(canonicalDocument);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(canonicalDocument, before);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.engine));
  assert.ok(Object.isFrozen(first.guitar));
  assert.ok(Object.isFrozen(first.fingeringProfile));
  assert.ok(Object.isFrozen(first.measures));
  assert.ok(Object.isFrozen(first.measures[0]));
  assert.ok(Object.isFrozen(first.measures[0].events));
  assert.ok(Object.isFrozen(first.measures[0].events[0]));
  assert.ok(Object.isFrozen(first.measures[0].events[0].selectedPosition));
  assert.ok(Object.isFrozen(first.measures[0].events[0].alternativePositions));
});

test('preserves custom tuning, maximum fret and the exact fingering profile', () => {
  const dropD = [
    { number: 6, pitch: 'D2', midi: 38 },
    { number: 5, pitch: 'A2', midi: 45 },
    { number: 4, pitch: 'D3', midi: 50 },
    { number: 3, pitch: 'G3', midi: 55 },
    { number: 2, pitch: 'B3', midi: 59 },
    { number: 1, pitch: 'E4', midi: 64 },
  ];
  const input = score(
    note({ step: 'D', octave: 2, duration: 1, type: 'quarter' }),
    { beats: 1, divisions: 1 },
  );

  const result = parseCanonicalTabResult(input, {
    guitar: { tuning: dropD, maximumFret: 12 },
    costProfile: {
      maximumFret: 12,
      highFretThreshold: 12,
      openStringPreferenceWeight: 2,
    },
  });

  assert.deepEqual(result.guitar.tuning, [
    { number: 1, pitch: 'E4', midi: 64 },
    { number: 2, pitch: 'B3', midi: 59 },
    { number: 3, pitch: 'G3', midi: 55 },
    { number: 4, pitch: 'D3', midi: 50 },
    { number: 5, pitch: 'A2', midi: 45 },
    { number: 6, pitch: 'D2', midi: 38 },
  ]);
  assert.equal(result.guitar.maximumFret, 12);
  assert.equal(result.fingeringProfile.maximumFret, 12);
  assert.equal(result.fingeringProfile.openStringPreferenceWeight, 2);
  assert.deepEqual(
    result.measures[0].events[0].selectedPosition,
    { string: 6, fret: 0 },
  );
});

test('rejects inconsistent or unknown canonical TAB options with stable codes', () => {
  const canonicalDocument = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );

  for (const options of [null, [], { unknown: true }, { guitar: null }]) {
    assert.throws(
      () => createCanonicalTabResult(canonicalDocument, options),
      (error) => {
        assert.ok(error instanceof CanonicalTabResultError);
        assert.equal(error.code, 'INVALID_CANONICAL_TAB_OPTIONS');
        return true;
      },
    );
  }

  assert.throws(
    () => parseCanonicalTabResult(
      readFixture('parser-single-voice.musicxml'),
      { parser: null },
    ),
    (error) => {
      assert.ok(error instanceof CanonicalTabResultError);
      assert.equal(error.code, 'INVALID_CANONICAL_TAB_OPTIONS');
      return true;
    },
  );

  assert.throws(
    () => createCanonicalTabResult(canonicalDocument, {
      guitar: { maximumFret: 5 },
      costProfile: { maximumFret: 20, highFretThreshold: 5 },
    }),
    (error) => {
      assert.ok(error instanceof CanonicalTabResultError);
      assert.equal(error.code, 'INCONSISTENT_FRET_RANGE');
      return true;
    },
  );
});

test('does not invent a position for notes outside the configured guitar range', () => {
  const input = score(
    note({ step: 'C', octave: 7, duration: 1, type: 'quarter' }),
    { beats: 1, divisions: 1 },
  );

  assert.throws(
    () => parseCanonicalTabResult(input),
    (error) => {
      assert.equal(error.code, 'UNPLAYABLE_NOTE');
      assert.equal(error.details.midi, 96);
      assert.equal(error.details.eventId, 'm1-e0');
      return true;
    },
  );
});

test('preserves the secure XML validation boundary', () => {
  expectCode(
    () => parseCanonicalTabResult(
      '<!DOCTYPE score-partwise SYSTEM "file:///etc/passwd"><score-partwise/>',
    ),
    'UNSAFE_XML_DECLARATION',
  );
});

test('rejects chord and multiple-voice content through the public TAB entry point', () => {
  expectCode(
    () => parseCanonicalTabResult(score(
      note({ extra: '<chord/>', duration: 16, type: 'whole' }),
    )),
    'UNSUPPORTED_POLYPHONY',
  );
  expectCode(
    () => parseCanonicalTabResult(score(
      `${note({ duration: 4, type: 'quarter', voice: 1 })}${note({ step: 'D', duration: 4, type: 'quarter', voice: 2 })}`,
      { beats: 2 },
    )),
    'UNSUPPORTED_POLYPHONY',
  );
});

test('rejects multiple staves through the public TAB entry point', () => {
  expectCode(
    () => parseCanonicalTabResult(score(
      note({ duration: 16, type: 'whole', staff: 2 }),
    )),
    'UNSUPPORTED_MULTISTAFF',
  );
});

test('rejects unsupported and invalid rhythms through the public TAB entry point', () => {
  expectCode(
    () => parseCanonicalTabResult(score(
      note({ duration: 1, type: '32nd' }),
    )),
    'UNSUPPORTED_RHYTHM',
  );
  expectCode(
    () => parseCanonicalTabResult(score(
      note({ duration: 2, type: 'quarter' }),
    )),
    'INVALID_RHYTHM_DURATION',
  );
});
