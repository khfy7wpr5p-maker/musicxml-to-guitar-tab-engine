'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  CanonicalTabMusicXmlWriterV2Error,
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../src/writers/canonicalTabMusicXmlWriterV2');
const {
  createCanonicalTabV2CompatibilityFixture,
} = require('./fixtures/compatibility/canonicalTabV2CompatibilityFixture');
const {
  createCanonicalTabCompatibilityFixture,
} = require('./fixtures/compatibility/canonicalTabCompatibilityFixture');

function count(xml, expression) {
  return (xml.match(expression) || []).length;
}

function expectWriterCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CanonicalTabMusicXmlWriterV2Error);
    assert.equal(error.code, code);
    return true;
  });
}

test('v2 writer emits deterministic parseable two-staff MusicXML from selected canonical truth only', () => {
  const result = createCanonicalTabV2CompatibilityFixture();
  const first = serializeCanonicalTabResultV2ToMusicXml(result);
  const second = serializeCanonicalTabResultV2ToMusicXml(result);

  assert.equal(first, second);
  const parsed = parseParsedMusicXmlDocument(first);
  assert.equal(parsed.documentType, 'ParsedMusicXmlDocument');
  assert.equal(parsed.root.name, 'score-partwise');
  assert.equal(count(first, /<note>/g), 10);
  assert.equal(count(first, /<rest\/>/g), 2);
  assert.equal(count(first, /<chord\/>/g), 2);
  assert.equal(count(first, /<staff>1<\/staff>/g), 5);
  assert.equal(count(first, /<staff>2<\/staff>/g), 5);
  assert.equal(count(first, /<technical>/g), 4);
  assert.equal(count(first, /<string>/g), 4);
  assert.equal(count(first, /<fret>/g), 4);

  const selected = result.noteDispositions.filter((entry) => entry.disposition === 'KEEP');
  for (const disposition of selected) {
    assert.match(
      first,
      new RegExp(`<string>${disposition.selectedPosition.string}<\\/string><fret>${disposition.selectedPosition.fret}<\\/fret>`),
    );
  }
});

test('v2 writer preserves a valid octave-displaced target pitch and selected position', () => {
  const mutable = JSON.parse(JSON.stringify(createCanonicalTabV2CompatibilityFixture()));
  const target = mutable.noteDispositions.find((entry) => entry.sourceEventId.endsWith(':note:4'));
  target.targetPitch = { step: 'A', alter: 0, octave: 3, midi: 57, written: 'A3' };
  target.octaveShiftSemitones = -12;
  target.ruleId = 'OCTAVE_NEAREST_IN_REGISTER';
  target.selectedPosition = { string: 3, fret: 2 };
  const sourceDecision = mutable.arrangementDecisions.find((entry) => entry.sourceEventIds.includes(target.sourceEventId));
  sourceDecision.decisionType = 'OCTAVE_DISPLACED';

  const xml = serializeCanonicalTabResultV2ToMusicXml(mutable);
  assert.equal(count(xml, /<step>A<\/step>/g), 2);
  assert.match(xml, /<string>3<\/string><fret>2<\/fret>/);
  assert.equal(count(xml, /<octave>4<\/octave>/g) >= 1, true);
  assert.equal(count(xml, /<octave>3<\/octave>/g) >= 1, true);
});

test('v2 writer supports pretty/trailing-newline options without mutating the canonical result', () => {
  const result = createCanonicalTabV2CompatibilityFixture();
  const before = JSON.stringify(result);
  const xml = serializeCanonicalTabResultV2ToMusicXml(result, {
    pretty: true,
    trailingNewline: true,
  });
  assert.equal(xml.endsWith('\n'), true);
  assert.match(xml, /\n  <identification>/);
  assert.equal(JSON.stringify(result), before);
  assert.equal(Object.isFrozen(result), true);
});

test('v2 writer preserves bounded runtime key-signature context without widening canonical authority', () => {
  const result = createCanonicalTabV2CompatibilityFixture();
  const xml = serializeCanonicalTabResultV2ToMusicXml(result, {
    notationContext: {
      keySignatures: [{ measureIndex: 0, fifths: -2, mode: 'minor' }],
    },
  });
  assert.match(xml, /<key><fifths>-2<\/fifths><mode>minor<\/mode><\/key>/);
  expectWriterCode(
    () => serializeCanonicalTabResultV2ToMusicXml(result, {
      notationContext: { keySignatures: [{ measureIndex: 0, fifths: 8, mode: null }] },
    }),
    'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
  );
});

test('v2 writer rejects v1 artifacts and semantically mutated v2 values fail closed', () => {
  expectWriterCode(
    () => serializeCanonicalTabResultV2ToMusicXml(createCanonicalTabCompatibilityFixture()),
    'INVALID_CANONICAL_TAB_MUSICXML_V2_RESULT',
  );

  const result = JSON.parse(JSON.stringify(createCanonicalTabV2CompatibilityFixture()));
  result.noteDispositions[0].selectedPosition.fret += 1;
  expectWriterCode(
    () => serializeCanonicalTabResultV2ToMusicXml(result),
    'INVALID_CANONICAL_TAB_MUSICXML_V2_RESULT',
  );
});

test('v2 writer remains internal and package-root public API does not drift', () => {
  const publicApi = require('../src');
  assert.equal(Object.hasOwn(publicApi, 'serializeCanonicalTabResultV2ToMusicXml'), false);
  assert.equal(Object.hasOwn(publicApi, 'createCanonicalTabResultV2'), false);
});
