'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseCanonicalTabResult } = require('../../src/parser/parseCanonicalTabResult');
const {
  CanonicalTabContractError,
  validateCanonicalTabResult,
} = require('../../src/contracts/canonicalTabResultContract');

function readFixture(name, encoding = null) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), encoding || undefined);
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

function multiMeasureScore(firstMeasureXml, secondMeasureXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      ${firstMeasureXml}
    </measure>
    <measure number="2">
      <attributes><divisions>4</divisions><time><beats>2</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      ${secondMeasureXml}
    </measure>
  </part>
</score-partwise>`;
}

function note({
  step = 'C', octave = 4, duration = 4, type = 'quarter', rest = false,
} = {}) {
  const pitch = rest ? '<rest/>' : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
  return `<note>${pitch}<duration>${duration}</duration><voice>1</voice><type>${type}</type><staff>1</staff></note>`;
}

function fullResult() {
  return parseCanonicalTabResult(readFixture('parser-single-voice.musicxml'));
}

function emptyMeasureResult() {
  return parseCanonicalTabResult(score(''));
}

function expectContractError(fn, {
  code = 'INVALID_CANONICAL_TAB_RESULT', rule, path: expectedPath,
} = {}) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabContractError);
    assert.equal(error.code, code);
    if (rule !== undefined) assert.equal(error.details.rule, rule);
    if (expectedPath !== undefined) assert.equal(error.details.path, expectedPath);
    return true;
  });
}

module.exports = {
  readFixture,
  readJsonFixture,
  cloneJson,
  score,
  multiMeasureScore,
  note,
  fullResult,
  emptyMeasureResult,
  expectContractError,
  parseCanonicalTabResult,
  validateCanonicalTabResult,
};
