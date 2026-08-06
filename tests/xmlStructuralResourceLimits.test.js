'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  preflightMusicXml,
} = require('../src/validation/musicxmlPreflight');
const {
  XmlSafetyError,
} = require('../src/validation/xmlSafety');

function expectSafetyLimit(input, options, code, details) {
  assert.throws(
    () => parseParsedMusicXmlDocument(input, options),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, code);
      assert.deepEqual(error.details, details);
      assert.equal(Object.isFrozen(error.details), true);
      return true;
    },
  );
}

const validScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1"/></part>
</score-partwise>`;

test('accepts XML exactly at the configured depth boundary', () => {
  const document = parseParsedMusicXmlDocument(
    '<root><middle><leaf/></middle></root>',
    { maxDepth: 3 },
  );

  assert.equal(document.root.children[0].children[0].name, 'leaf');
});

test('rejects XML when nesting depth exceeds the configured limit', () => {
  expectSafetyLimit(
    '<root><middle><leaf/></middle></root>',
    { maxDepth: 2 },
    'XML_DEPTH_LIMIT_EXCEEDED',
    { field: 'maxDepth', limit: 2, observed: 3 },
  );
});

test('accepts XML exactly at the configured element boundary', () => {
  const document = parseParsedMusicXmlDocument(
    '<root><first/><second/></root>',
    { maxElements: 3 },
  );

  assert.equal(document.root.children.length, 2);
});

test('rejects XML when the cumulative element count exceeds the configured limit', () => {
  expectSafetyLimit(
    '<root><first/><second/></root>',
    { maxElements: 2 },
    'XML_ELEMENT_LIMIT_EXCEEDED',
    { field: 'maxElements', limit: 2, observed: 3 },
  );
});

test('accepts XML exactly at the cumulative attribute boundary', () => {
  const document = parseParsedMusicXmlDocument(
    '<root first="1" second="2"><child third="3"/></root>',
    { maxAttributes: 3 },
  );

  assert.equal(document.root.attributes.length, 2);
  assert.equal(document.root.children[0].attributes.length, 1);
});

test('rejects XML when the cumulative attribute count exceeds the configured limit', () => {
  expectSafetyLimit(
    '<root first="1" second="2"><child third="3"/></root>',
    { maxAttributes: 2 },
    'XML_ATTRIBUTE_LIMIT_EXCEEDED',
    { field: 'maxAttributes', limit: 2, observed: 3 },
  );
});

test('counts text and CDATA using their UTF-8 byte length', () => {
  const xml = '<root>é<![CDATA[🙂]]></root>';
  const document = parseParsedMusicXmlDocument(xml, { maxTextBytes: 6 });

  assert.equal(document.root.text, 'é🙂');

  expectSafetyLimit(
    xml,
    { maxTextBytes: 5 },
    'XML_TEXT_LIMIT_EXCEEDED',
    { field: 'maxTextBytes', limit: 5, observed: 6 },
  );
});

test('maps invalid processing-budget options to the existing XML configuration boundary', () => {
  assert.throws(
    () => parseParsedMusicXmlDocument('<root/>', { maxDepth: 0 }),
    (error) => {
      assert.ok(error instanceof XmlSafetyError);
      assert.equal(error.code, 'INVALID_CONFIGURATION');
      assert.deepEqual(error.details, { field: 'maxDepth', value: 0 });
      return true;
    },
  );
});

test('preflight classifies structural XML limit failures as blocked safety issues', () => {
  const report = preflightMusicXml(validScore, { maxDepth: 2 });

  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.canProcess, false);
  assert.equal(report.summary, null);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].category, 'safety');
  assert.equal(report.issues[0].code, 'XML_DEPTH_LIMIT_EXCEEDED');
  assert.deepEqual(report.issues[0].details, {
    field: 'maxDepth',
    limit: 2,
    observed: 3,
  });
});
