'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_MAX_XML_BYTES,
  XmlSafetyError,
  normalizeXmlInput,
} = require('../src/validation/xmlSafety');

const fixturePath = (name) => path.join(__dirname, 'fixtures', name);

const TRUSTED_MUSICXML_PARTWISE_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0.3 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof XmlSafetyError);
    assert.equal(error.code, code);
    return true;
  });
}

test('accepts UTF-8 strings and buffers without altering the XML', () => {
  const xml = '<score-partwise/>';
  assert.equal(normalizeXmlInput(xml), xml);
  assert.equal(normalizeXmlInput(Buffer.from(xml, 'utf8')), xml);
});

test('accepts and strips the trusted MusicXML 4.0.3 partwise DOCTYPE', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${TRUSTED_MUSICXML_PARTWISE_DOCTYPE}
<score-partwise version="4.0.3"/>`;

  const normalized = normalizeXmlInput(xml);

  assert.doesNotMatch(normalized, /<!DOCTYPE/i);
  assert.match(normalized, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(normalized, /<score-partwise version="4\.0\.3"\/>/);
  assert.equal(normalizeXmlInput(Buffer.from(xml, 'utf8')), normalized);
});

test('uses a five-megabyte default size limit', () => {
  assert.equal(DEFAULT_MAX_XML_BYTES, 5 * 1024 * 1024);
});

test('rejects empty input', () => {
  expectCode(() => normalizeXmlInput(' \n\t'), 'EMPTY_INPUT');
});

test('rejects inputs larger than the configured limit before parsing', () => {
  expectCode(() => normalizeXmlInput('<root/>', { maxBytes: 6 }), 'FILE_TOO_LARGE');
});

test('rejects invalid UTF-8, encoding declarations and null bytes', () => {
  expectCode(() => normalizeXmlInput(Buffer.from([0xc3, 0x28])), 'INVALID_ENCODING');
  expectCode(() => normalizeXmlInput('<root>\u0000</root>'), 'INVALID_ENCODING');
  expectCode(
    () => normalizeXmlInput('<?xml version="1.0" encoding="UTF-16"?><root/>'),
    'INVALID_ENCODING',
  );
});

test('rejects entity declarations and untrusted DOCTYPE declarations', () => {
  const unsafe = fs.readFileSync(fixturePath('invalid-doctype.musicxml'));
  expectCode(() => normalizeXmlInput(unsafe), 'UNSAFE_XML_DECLARATION');
  expectCode(() => normalizeXmlInput('<!ENTITY sample "value"><root/>'), 'UNSAFE_XML_DECLARATION');
  expectCode(
    () => normalizeXmlInput(
      '<!DOCTYPE score-partwise SYSTEM "file:///etc/passwd"><score-partwise/>',
    ),
    'UNSAFE_XML_DECLARATION',
  );
});

test('rejects internal subsets, duplicate declarations and mismatched roots', () => {
  expectCode(
    () => normalizeXmlInput(
      `${TRUSTED_MUSICXML_PARTWISE_DOCTYPE.slice(0, -1)} [<!ELEMENT sample ANY>]>
<score-partwise/>`,
    ),
    'UNSAFE_XML_DECLARATION',
  );

  expectCode(
    () => normalizeXmlInput(
      `${TRUSTED_MUSICXML_PARTWISE_DOCTYPE}
${TRUSTED_MUSICXML_PARTWISE_DOCTYPE}
<score-partwise/>`,
    ),
    'UNSAFE_XML_DECLARATION',
  );

  expectCode(
    () => normalizeXmlInput(
      `${TRUSTED_MUSICXML_PARTWISE_DOCTYPE}
<score-timewise/>`,
    ),
    'UNSAFE_XML_DECLARATION',
  );
});

test('rejects unsupported input types and invalid limits', () => {
  expectCode(() => normalizeXmlInput({ xml: '<root/>' }), 'INVALID_ENCODING');
  expectCode(() => normalizeXmlInput('<root/>', { maxBytes: 0 }), 'INVALID_CONFIGURATION');
});
