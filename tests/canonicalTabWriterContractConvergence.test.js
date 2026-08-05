'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCanonicalTabResult } = require('../src/parser/parseCanonicalTabResult');
const {
  CanonicalTabJsonWriterError,
  serializeCanonicalTabResult,
} = require('../src/writers/canonicalTabJsonWriter');
const {
  CanonicalTabMusicXmlWriterError,
  serializeCanonicalTabResultToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriter');

function readFixture(name, encoding = null) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), encoding || undefined);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function fullResult() {
  return parseCanonicalTabResult(readFixture('parser-single-voice.musicxml'));
}

function singleNoteResult() {
  return parseCanonicalTabResult(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`);
}

function captureError(fn, ErrorClass) {
  let captured;
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ErrorClass);
    captured = error;
    return true;
  });
  return captured;
}

test('both writers preserve reviewed golden output after shared contract convergence', () => {
  const jsonResult = parseCanonicalTabResult(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time><staves>1</staves></attributes><note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part>
</score-partwise>`);
  assert.equal(
    serializeCanonicalTabResult(jsonResult),
    readFixture('canonical-tab-rest-only.golden.json', 'utf8'),
  );
  assert.equal(
    serializeCanonicalTabResultToMusicXml(singleNoteResult(), {
      pretty: true,
      trailingNewline: true,
    }),
    readFixture('canonical-tab-single-note.golden.musicxml', 'utf8'),
  );
});

test('both writers adapt the same contract path and rule for invalid canonical data', () => {
  const invalid = cloneJson(fullResult());
  invalid.noteCount += 1;

  const jsonError = captureError(
    () => serializeCanonicalTabResult(invalid),
    CanonicalTabJsonWriterError,
  );
  const musicXmlError = captureError(
    () => serializeCanonicalTabResultToMusicXml(invalid),
    CanonicalTabMusicXmlWriterError,
  );

  assert.equal(jsonError.code, 'INVALID_CANONICAL_TAB_RESULT');
  assert.equal(musicXmlError.code, 'INVALID_CANONICAL_TAB_MUSICXML_RESULT');
  assert.equal(jsonError.details.path, 'canonicalTabResult.noteCount');
  assert.equal(musicXmlError.details.path, jsonError.details.path);
  assert.equal(jsonError.details.rule, 'NOTE_COUNT_MISMATCH');
  assert.equal(musicXmlError.details.rule, jsonError.details.rule);
  assert.equal(jsonError.details.contractCode, 'INVALID_CANONICAL_TAB_RESULT');
  assert.equal(musicXmlError.details.contractCode, 'INVALID_CANONICAL_TAB_RESULT');
});

test('unsupported schema errors retain writer-specific public codes with shared details', () => {
  const unsupported = cloneJson(singleNoteResult());
  unsupported.schemaVersion = '2.0.0';

  const jsonError = captureError(
    () => serializeCanonicalTabResult(unsupported),
    CanonicalTabJsonWriterError,
  );
  const musicXmlError = captureError(
    () => serializeCanonicalTabResultToMusicXml(unsupported),
    CanonicalTabMusicXmlWriterError,
  );

  assert.equal(jsonError.code, 'UNSUPPORTED_CANONICAL_TAB_SCHEMA');
  assert.equal(musicXmlError.code, 'UNSUPPORTED_CANONICAL_TAB_MUSICXML_SCHEMA');
  assert.equal(jsonError.details.rule, 'UNSUPPORTED_SCHEMA_VERSION');
  assert.equal(musicXmlError.details.rule, jsonError.details.rule);
  assert.equal(jsonError.details.path, 'canonicalTabResult.schemaVersion');
  assert.equal(musicXmlError.details.path, jsonError.details.path);
});

test('JSON-unsafe and cyclic graphs are rejected through the shared boundary', () => {
  const unsafe = cloneJson(singleNoteResult());
  unsafe.totalFingeringCost = Number.NaN;
  const jsonUnsafe = captureError(
    () => serializeCanonicalTabResult(unsafe),
    CanonicalTabJsonWriterError,
  );
  const musicXmlUnsafe = captureError(
    () => serializeCanonicalTabResultToMusicXml(unsafe),
    CanonicalTabMusicXmlWriterError,
  );
  assert.equal(jsonUnsafe.code, 'UNSAFE_CANONICAL_TAB_JSON_VALUE');
  assert.equal(musicXmlUnsafe.code, 'INVALID_CANONICAL_TAB_MUSICXML_RESULT');
  assert.equal(jsonUnsafe.details.rule, 'JSON_UNSAFE_NUMBER');
  assert.equal(musicXmlUnsafe.details.rule, jsonUnsafe.details.rule);

  const cyclic = cloneJson(singleNoteResult());
  cyclic.self = cyclic;
  const jsonCyclic = captureError(
    () => serializeCanonicalTabResult(cyclic),
    CanonicalTabJsonWriterError,
  );
  const musicXmlCyclic = captureError(
    () => serializeCanonicalTabResultToMusicXml(cyclic),
    CanonicalTabMusicXmlWriterError,
  );
  assert.equal(jsonCyclic.code, 'CYCLIC_CANONICAL_TAB_RESULT');
  assert.equal(musicXmlCyclic.code, 'INVALID_CANONICAL_TAB_MUSICXML_RESULT');
  assert.equal(jsonCyclic.details.rule, 'CYCLIC_REFERENCE');
  assert.equal(musicXmlCyclic.details.rule, jsonCyclic.details.rule);
});

test('MusicXML keeps only output-specific checks after the shared validator', () => {
  const missingTuningPitch = cloneJson(singleNoteResult());
  missingTuningPitch.guitar.tuning[0].pitch = null;
  assert.doesNotThrow(() => serializeCanonicalTabResult(missingTuningPitch));
  const tuningError = captureError(
    () => serializeCanonicalTabResultToMusicXml(missingTuningPitch),
    CanonicalTabMusicXmlWriterError,
  );
  assert.equal(tuningError.code, 'INVALID_CANONICAL_TAB_MUSICXML_RESULT');
  assert.equal(tuningError.details.path, 'canonicalTabResult.guitar.tuning[0].pitch');

  const highBeam = cloneJson(fullResult());
  highBeam.measures[0].events[1].rhythm.beam[0].level = 9;
  assert.doesNotThrow(() => serializeCanonicalTabResult(highBeam));
  const beamError = captureError(
    () => serializeCanonicalTabResultToMusicXml(highBeam),
    CanonicalTabMusicXmlWriterError,
  );
  assert.equal(beamError.code, 'INVALID_CANONICAL_TAB_MUSICXML_RESULT');
  assert.equal(
    beamError.details.path,
    'canonicalTabResult.measures[0].events[1].rhythm.beam[0].level',
  );
});
