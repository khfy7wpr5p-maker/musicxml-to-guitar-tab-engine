'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MusicXmlValidationError,
  validateMusicXml,
} = require('../src/validation/musicxmlValidation');
const { XmlSafetyError } = require('../src/validation/xmlSafety');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

function expectValidationCode(input, code) {
  assert.throws(() => validateMusicXml(input), (error) => {
    assert.ok(error instanceof MusicXmlValidationError || error instanceof XmlSafetyError);
    assert.equal(error.code, code);
    return true;
  });
}

test('accepts minimal single-part score-partwise MusicXML', () => {
  assert.deepEqual(validateMusicXml(fixture('valid-minimal.musicxml')), {
    format: 'score-partwise',
    version: '4.0',
    partId: 'P1',
    measureCount: 1,
  });
});

test('rejects malformed XML with a stable error code', () => {
  expectValidationCode(fixture('invalid-xml.musicxml'), 'INVALID_XML');
});

test('rejects DTD input before the XML parser runs', () => {
  expectValidationCode(fixture('invalid-doctype.musicxml'), 'UNSAFE_XML_DECLARATION');
});

test('rejects score-timewise documents explicitly', () => {
  expectValidationCode(fixture('unsupported-timewise.musicxml'), 'UNSUPPORTED_SCORE_FORMAT');
});

test('rejects multipart scores explicitly', () => {
  expectValidationCode(fixture('unsupported-multipart.musicxml'), 'UNSUPPORTED_MULTIPART_SCORE');
});

test('rejects missing or duplicate direct part-list elements', () => {
  expectValidationCode(
    '<score-partwise><part id="P1"><measure number="1"/></part></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list/><part-list/><part id="P1"><measure number="1"/></part></score-partwise>',
    'INVALID_MUSICXML',
  );
});

test('rejects nested structural lookalikes outside the required direct paths', () => {
  expectValidationCode(
    '<score-partwise><part-list/><container><part-list><score-part id="P1"/></part-list></container><part id="P1"><measure/></part></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list><wrapper><score-part id="P1"/></wrapper></part-list><part id="P1"><measure/></part></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list><score-part id="P1"/></part-list><container><part id="P1"><measure/></part></container></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1"><container><measure/></container></part></score-partwise>',
    'INVALID_MUSICXML',
  );
});

test('rejects missing score parts, missing parts and missing measures', () => {
  expectValidationCode(
    '<score-partwise><part-list/><part id="P1"><measure number="1"/></part></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list><score-part id="P1"/></part-list></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1"/></score-partwise>',
    'INVALID_MUSICXML',
  );
});

test('rejects missing and mismatched part identifiers', () => {
  expectValidationCode(
    '<score-partwise><part-list><score-part/></part-list><part id="P1"><measure/></part></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list><score-part id="P1"/></part-list><part><measure/></part></score-partwise>',
    'INVALID_MUSICXML',
  );

  expectValidationCode(
    '<score-partwise><part-list><score-part id="P1"/></part-list><part id="P2"><measure/></part></score-partwise>',
    'INVALID_MUSICXML',
  );
});

test('accepts a default MusicXML namespace', () => {
  const xml = `<?xml version="1.0"?>
    <score-partwise xmlns="http://www.musicxml.org/ns/musicxml" version="4.0">
      <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
      <part id="P1"><measure number="intro"/></part>
    </score-partwise>`;

  assert.equal(validateMusicXml(xml).measureCount, 1);
});
