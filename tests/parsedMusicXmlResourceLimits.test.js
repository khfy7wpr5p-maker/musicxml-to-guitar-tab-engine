'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ParsedMusicXmlDocumentError,
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');

function expectResourceLimit(xml, options, expectedDetails) {
  assert.throws(
    () => parseParsedMusicXmlDocument(xml, options),
    (error) => {
      assert.ok(error instanceof ParsedMusicXmlDocumentError);
      assert.equal(error.code, 'XML_RESOURCE_LIMIT_EXCEEDED');
      assert.deepEqual(error.details, expectedDetails);
      assert.equal(Object.isFrozen(error.details), true);
      return true;
    },
  );
}

test('accepts XML at the configured depth boundary', () => {
  const parsed = parseParsedMusicXmlDocument('<a><b><c/></b></a>', { maxDepth: 3 });
  assert.equal(parsed.root.name, 'a');
});

test('rejects XML beyond the configured depth boundary', () => {
  expectResourceLimit(
    '<a><b><c/></b></a>',
    { maxDepth: 2 },
    { limit: 'maxDepth', maximum: 2, actual: 3 },
  );
});

test('counts every opened element and rejects the first excess element', () => {
  expectResourceLimit(
    '<a><b/><c/></a>',
    { maxElements: 2 },
    { limit: 'maxElements', maximum: 2, actual: 3 },
  );
});

test('counts attributes cumulatively across elements', () => {
  expectResourceLimit(
    '<a x="1"><b y="2" z="3"/></a>',
    { maxAttributes: 2 },
    { limit: 'maxAttributes', maximum: 2, actual: 3 },
  );
});

test('accepts text at the configured UTF-8 byte boundary', () => {
  const parsed = parseParsedMusicXmlDocument('<a>é</a>', { maxTextBytes: 2 });
  assert.equal(parsed.root.text, 'é');
});

test('rejects text beyond the configured UTF-8 byte boundary', () => {
  expectResourceLimit(
    '<a>éa</a>',
    { maxTextBytes: 2 },
    { limit: 'maxTextBytes', maximum: 2, actual: 3 },
  );
});

test('shares one text budget across text and CDATA events', () => {
  expectResourceLimit(
    '<a>x<![CDATA[é]]></a>',
    { maxTextBytes: 2 },
    { limit: 'maxTextBytes', maximum: 2, actual: 3 },
  );
});
