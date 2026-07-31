'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseMusicXmlNotes } = require('../src/parser/musicxmlNoteParser');
const { parseCanonicalMusicDocument } = require('../src/parser/parseCanonicalMusicDocument');
const {
  CANONICAL_MUSIC_DOCUMENT_VERSION,
  CanonicalMusicDocumentError,
  createCanonicalMusicDocument,
} = require('../src/music/canonicalMusicDocument');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectInvalidParserOutput(parsedDocument, mutate) {
  const invalid = clone(parsedDocument);
  mutate(invalid);

  assert.throws(() => createCanonicalMusicDocument(invalid), (error) => {
    assert.ok(error instanceof CanonicalMusicDocumentError);
    assert.equal(error.code, 'INVALID_PARSER_OUTPUT');
    return true;
  });
}

function repeatedVisibleMeasureNumberScore() {
  const wholeNote = (step) => `<note>
    <pitch><step>${step}</step><octave>4</octave></pitch>
    <duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff>
  </note>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      ${wholeNote('C')}
    </measure>
    <measure number="1">
      ${wholeNote('D')}
    </measure>
  </part>
</score-partwise>`;
}

test('creates an immutable CanonicalMusicDocument with an explicit event allowlist', () => {
  const parsed = parseMusicXmlNotes(fixture('parser-single-voice.musicxml'));
  const canonical = createCanonicalMusicDocument(parsed);

  assert.equal(canonical.documentType, 'CanonicalMusicDocument');
  assert.equal(canonical.contractVersion, CANONICAL_MUSIC_DOCUMENT_VERSION);
  assert.equal(canonical.sourceFormat, 'score-partwise');
  assert.equal(canonical.sourceVersion, '4.0');
  assert.equal(canonical.partId, 'P1');
  assert.equal(canonical.measureCount, 2);
  assert.equal(canonical.voiceCount, 1);

  const [firstMeasure] = canonical.measures;
  const [firstEvent] = firstMeasure.events;
  assert.equal(firstMeasure.measureKey, 'P1:measure:0');
  assert.equal(firstMeasure.measureIndex, 0);
  assert.equal(firstMeasure.visibleMeasureNumber, '1');
  assert.equal(Object.hasOwn(firstMeasure, 'number'), false);
  assert.equal(Object.hasOwn(firstMeasure, 'index'), false);
  assert.equal(firstEvent.measureKey, firstMeasure.measureKey);
  assert.deepEqual(firstEvent.pitch, {
    step: 'C', alter: 0, octave: 4, written: 'C4', midi: 60,
  });
  assert.equal(Object.hasOwn(firstEvent, 'selectedPosition'), false);
  assert.equal(Object.hasOwn(firstEvent, 'alternativePositions'), false);
  assert.equal(Object.hasOwn(firstEvent, 'confidence'), false);
  assert.equal(Object.hasOwn(firstEvent, 'requiresTeacherReview'), false);

  assert.notStrictEqual(firstMeasure, parsed.measures[0]);
  assert.notStrictEqual(firstEvent, parsed.measures[0].events[0]);
  assert.ok(Object.isFrozen(canonical));
  assert.ok(Object.isFrozen(firstMeasure));
  assert.ok(Object.isFrozen(firstEvent));
});

test('accepts valid musical parser output without parser-specific workflow placeholders', () => {
  const parsed = clone(parseMusicXmlNotes(fixture('parser-single-voice.musicxml')));

  for (const measure of parsed.measures) {
    for (const event of measure.events) {
      delete event.selectedPosition;
      delete event.alternativePositions;
      delete event.confidence;
      delete event.requiresTeacherReview;
    }
  }

  const canonical = createCanonicalMusicDocument(parsed);
  assert.equal(canonical.measureCount, 2);
  assert.equal(canonical.measures[0].events[0].pitch.midi, 60);
});

test('rejects actual guitar-position decisions when optional parser fields are present', () => {
  const parsed = parseMusicXmlNotes(fixture('parser-single-voice.musicxml'));

  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].events[0].selectedPosition = {
      stringNumber: 2,
      fretNumber: 1,
    };
  });

  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].events[0].alternativePositions = [
      { stringNumber: 3, fretNumber: 5 },
    ];
  });
});

test('keeps duplicate visible measure numbers while generating unique stable measure keys', () => {
  const canonical = parseCanonicalMusicDocument(repeatedVisibleMeasureNumberScore());

  assert.deepEqual(
    canonical.measures.map((measure) => measure.visibleMeasureNumber),
    ['1', '1'],
  );
  assert.deepEqual(
    canonical.measures.map((measure) => measure.measureKey),
    ['P1:measure:0', 'P1:measure:1'],
  );
  assert.equal(new Set(canonical.measures.map((measure) => measure.measureKey)).size, 2);
});

test('parseCanonicalMusicDocument composes secure parsing and canonical validation deterministically', () => {
  const input = fixture('parser-pickup.musicxml');
  const direct = createCanonicalMusicDocument(parseMusicXmlNotes(input));
  const composed = parseCanonicalMusicDocument(input);

  assert.deepEqual(composed, direct);
  assert.equal(composed.measures[0].implicit, true);
  assert.equal(composed.measures[0].visibleMeasureNumber, '0');
  assert.equal(composed.measures[0].actualDurationDivisions, 2);
});

test('rejects structurally inconsistent parser output before creating canonical data', () => {
  const parsed = parseMusicXmlNotes(fixture('parser-single-voice.musicxml'));

  expectInvalidParserOutput(parsed, (document) => {
    document.measureCount += 1;
  });
  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].index = 4;
  });
  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].events[1].start.divisions += 1;
  });
  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].events[0].pitch.midi += 1;
  });
  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].actualDurationDivisions -= 1;
  });
});

test('independently validates rhythm types, note durations and measure durations', () => {
  const parsed = parseMusicXmlNotes(fixture('parser-single-voice.musicxml'));

  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].events[0].rhythm.type = '32nd';
  });

  expectInvalidParserOutput(parsed, (document) => {
    const measure = document.measures[0];
    measure.timeSignature.beats = 5;
    measure.expectedDurationDivisions = 20;
    measure.actualDurationDivisions = 20;
    measure.events[0].rhythm.durationDivisions = 8;
    measure.events[1].start = { divisions: 8, beats: 2 };
    measure.events[2].start = { divisions: 10, beats: 2.5 };
    measure.events[3].start = { divisions: 12, beats: 3 };
  });

  expectInvalidParserOutput(parsed, (document) => {
    document.measures[0].timeSignature.beats = 3;
  });
});

test('rejects an empty parsed document at the canonical boundary', () => {
  const parsed = parseMusicXmlNotes(fixture('parser-single-voice.musicxml'));

  expectInvalidParserOutput(parsed, (document) => {
    document.measures = [];
    document.measureCount = 0;
    document.voiceCount = 0;
  });
});

test('does not weaken parser validation when using the canonical entry point', () => {
  const invalid = repeatedVisibleMeasureNumberScore().replace(
    '<pitch><step>C</step><octave>4</octave></pitch>',
    '<rest/><pitch><step>C</step><octave>4</octave></pitch>',
  );

  assert.throws(() => parseCanonicalMusicDocument(invalid), (error) => {
    assert.equal(error.code, 'INVALID_MUSICXML');
    return true;
  });
});