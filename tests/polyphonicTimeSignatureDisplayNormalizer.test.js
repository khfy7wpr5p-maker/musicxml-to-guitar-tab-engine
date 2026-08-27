'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_VERSION,
  POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_AUTHORITY,
  normalizePolyphonicTimeSignatureDisplay,
  projectParsedMusicXmlWithTimeSignatureDisplayCompatibility,
} = require('../src/parser/polyphonicTimeSignatureDisplayNormalizer');

function score(timeXml, noteXml = '<note><pitch><step>E</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff></note>') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions>${timeXml}<staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    ${noteXml}
  </measure></part>
</score-partwise>`;
}

function parsed(xml) {
  return parseParsedMusicXmlDocument(xml);
}

function errorCode(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  assert.fail('Expected an error.');
}

test('PS-6B3B strips only symbol="common" from exact 4/4 while preserving timing and pitch', () => {
  const source = parsed(score('<time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>'));
  const result = projectParsedMusicXmlWithTimeSignatureDisplayCompatibility(source);

  assert.equal(POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_AUTHORITY,
    'COMMON_TIME_DISPLAY_NO_TIMING_REWRITE',
  );
  assert.deepEqual(result.sourceModel.measures[0].timeSignature, { beats: 4, beatType: 4 });
  assert.equal(result.sourceModel.measures[0].events[0].pitch.written, 'E4');
  assert.equal(result.sourceModel.measures[0].events[0].pitch.midi, 64);
  assert.deepEqual(
    result.timeSignatureDisplayMarkers.map((marker) => [marker.symbol, marker.beats, marker.beatType]),
    [['common', 4, 4]],
  );
  assert.ok(result.ignoredFeatures.includes('time-attribute:symbol-display'));
});

test('PS-6B3B leaves ordinary 4/4 without a symbol untouched', () => {
  const result = projectParsedMusicXmlWithTimeSignatureDisplayCompatibility(
    parsed(score('<time><beats>4</beats><beat-type>4</beat-type></time>')),
  );
  assert.equal(result.timeSignatureDisplayMarkers.length, 0);
  assert.deepEqual(result.sourceModel.measures[0].timeSignature, { beats: 4, beatType: 4 });
  assert.equal(result.ignoredFeatures.includes('time-attribute:symbol-display'), false);
});

test('PS-6B3B fails closed when common symbol does not match exact 4/4', () => {
  for (const timeXml of [
    '<time symbol="common"><beats>3</beats><beat-type>4</beat-type></time>',
    '<time symbol="common"><beats>2</beats><beat-type>2</beat-type></time>',
  ]) {
    assert.equal(
      errorCode(() => normalizePolyphonicTimeSignatureDisplay(parsed(score(timeXml)))),
      'UNSUPPORTED_POLYPHONIC_TIME_SIGNATURE_DISPLAY',
    );
  }
});

test('PS-6B3B fails closed on other time symbols', () => {
  for (const symbol of ['cut', 'single-number', 'normal']) {
    assert.equal(
      errorCode(() => normalizePolyphonicTimeSignatureDisplay(parsed(score(
        `<time symbol="${symbol}"><beats>4</beats><beat-type>4</beat-type></time>`,
      )))),
      'UNSUPPORTED_POLYPHONIC_TIME_SIGNATURE_DISPLAY',
    );
  }
});

test('PS-6B3B fails closed when symbol is mixed with other time attributes', () => {
  const xml = score('<time symbol="common" print-object="no"><beats>4</beats><beat-type>4</beat-type></time>');
  assert.equal(
    errorCode(() => normalizePolyphonicTimeSignatureDisplay(parsed(xml))),
    'UNSUPPORTED_POLYPHONIC_TIME_SIGNATURE_DISPLAY',
  );
});

test('PS-6B3B source remains unchanged and provenance is immutable', () => {
  const source = parsed(score('<time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>'));
  const part = source.root.children.find((child) => child.name === 'part');
  const attributes = part.children[0].children.find((child) => child.name === 'attributes');
  const sourceTime = attributes.children.find((child) => child.name === 'time');
  const sourceSymbol = sourceTime.attributes.find((attribute) => attribute.name === 'symbol');
  assert.equal(sourceSymbol.value, 'common');

  const normalized = normalizePolyphonicTimeSignatureDisplay(source);
  assert.equal(sourceTime.attributes.find((attribute) => attribute.name === 'symbol').value, 'common');
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.timeSignatureDisplayMarkers), true);
  assert.equal(Object.isFrozen(normalized.timeSignatureDisplayMarkers[0]), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B3B remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicTimeSignatureDisplay, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithTimeSignatureDisplayCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_TIME_SIGNATURE_DISPLAY_NORMALIZER_VERSION, undefined);
});
