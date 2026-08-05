'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PREFLIGHT_STATUS,
  preflightMusicXml,
} = require('../src/validation/musicxmlPreflight');

function score(events = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
      </attributes>
      ${events}
    </measure>
  </part>
</score-partwise>`;
}

const wholeNote = `
<note>
  <pitch>
    <step>E</step>
    <octave>4</octave>
  </pitch>
  <duration>16</duration>
  <voice>1</voice>
  <type>whole</type>
  <staff>1</staff>
</note>`;

test('returns PASS for supported monophonic MusicXML', () => {
  const result = preflightMusicXml(score(wholeNote));

  assert.equal(result.status, PREFLIGHT_STATUS.PASS);
  assert.equal(result.canProcess, true);
  assert.equal(result.summary.measureCount, 1);
  assert.deepEqual(result.issues, []);
  assert.equal(Object.isFrozen(result), true);
});

test('returns WARNING for an empty but processable measure', () => {
  const result = preflightMusicXml(score());

  assert.equal(result.status, PREFLIGHT_STATUS.WARNING);
  assert.equal(result.canProcess, true);
  assert.equal(result.issues[0].code, 'EMPTY_MEASURE');
  assert.equal(result.issues[0].severity, 'warning');
  assert.equal(result.issues[0].category, 'quality');
});

test('returns BLOCKED for chord or polyphonic input', () => {
  const chordNote = wholeNote.replace(
    '<pitch>',
    '<chord/><pitch>',
  );

  const result = preflightMusicXml(score(chordNote));

  assert.equal(result.status, PREFLIGHT_STATUS.BLOCKED);
  assert.equal(result.canProcess, false);
  assert.equal(result.issues[0].code, 'UNSUPPORTED_POLYPHONY');
  assert.equal(result.issues[0].category, 'capability');
});

test('classifies unsupported score formats as capability blockers', () => {
  const result = preflightMusicXml(
    '<score-timewise version="4.0"></score-timewise>',
  );

  assert.equal(result.status, PREFLIGHT_STATUS.BLOCKED);
  assert.equal(result.canProcess, false);
  assert.equal(result.issues[0].code, 'UNSUPPORTED_SCORE_FORMAT');
  assert.equal(result.issues[0].category, 'capability');
});

test('returns BLOCKED for malformed XML', () => {
  const result = preflightMusicXml('<score-partwise>');

  assert.equal(result.status, PREFLIGHT_STATUS.BLOCKED);
  assert.equal(result.canProcess, false);
  assert.equal(result.issues[0].code, 'INVALID_XML');
});

test('returns BLOCKED for unsafe XML declarations', () => {
  const result = preflightMusicXml(
    '<!DOCTYPE score-partwise [<!ENTITY x "unsafe">]>'
    + score(wholeNote),
  );

  assert.equal(result.status, PREFLIGHT_STATUS.BLOCKED);
  assert.equal(result.canProcess, false);
  assert.equal(result.issues[0].code, 'UNSAFE_XML_DECLARATION');
  assert.equal(result.issues[0].category, 'safety');
});
