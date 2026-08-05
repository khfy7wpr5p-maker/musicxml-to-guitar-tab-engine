'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PREFLIGHT_STATUS,
  convertMusicXmlToCanonicalTab,
  preflightMusicXml,
} = require('../src');

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

test('exports the controlled preflight pipeline API', () => {
  assert.equal(typeof convertMusicXmlToCanonicalTab, 'function');
  assert.equal(typeof preflightMusicXml, 'function');
  assert.equal(PREFLIGHT_STATUS.PASS, 'PASS');
});

test('continues after PASS and returns a canonical TAB result', () => {
  const result = convertMusicXmlToCanonicalTab(score(wholeNote));

  assert.equal(result.preflight.status, PREFLIGHT_STATUS.PASS);
  assert.equal(result.preflight.canProcess, true);
  assert.equal(result.canonicalTabResult.documentType, 'CanonicalTabResult');
  assert.equal(result.canonicalTabResult.noteCount, 1);
  assert.equal(Object.isFrozen(result), true);
});

test('preserves WARNING issues while continuing conversion', () => {
  const result = convertMusicXmlToCanonicalTab(score());

  assert.equal(result.preflight.status, PREFLIGHT_STATUS.WARNING);
  assert.equal(result.preflight.canProcess, true);
  assert.equal(result.preflight.issues[0].code, 'EMPTY_MEASURE');
  assert.equal(result.canonicalTabResult.measureCount, 1);
  assert.equal(result.canonicalTabResult.warnings[0].warning.code, 'EMPTY_MEASURE');
});

test('stops after BLOCKED and does not create a canonical TAB result', () => {
  const chordNote = wholeNote.replace('<pitch>', '<chord/><pitch>');
  const result = convertMusicXmlToCanonicalTab(score(chordNote));

  assert.equal(result.preflight.status, PREFLIGHT_STATUS.BLOCKED);
  assert.equal(result.preflight.canProcess, false);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONY');
  assert.equal(result.canonicalTabResult, null);
});

test('rejects unknown conversion options before preflight execution', () => {
  assert.throws(
    () => convertMusicXmlToCanonicalTab(score(wholeNote), { unknown: true }),
    (error) => {
      assert.equal(error.code, 'INVALID_CANONICAL_TAB_OPTIONS');
      assert.deepEqual(error.details, { field: 'unknown' });
      return true;
    },
  );
});
