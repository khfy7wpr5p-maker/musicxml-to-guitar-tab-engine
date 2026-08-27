'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_FERMATA_NOTATION_NORMALIZER_VERSION,
  POLYPHONIC_FERMATA_NOTATION_NORMALIZER_AUTHORITY,
  normalizePolyphonicFermataNotation,
  projectParsedMusicXmlWithFermataCompatibility,
} = require('../src/parser/polyphonicFermataNotationNormalizer');

function score(fermataXml, { extraNotation = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time symbol="common"><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff><notations>${fermataXml}${extraNotation}</notations></note>
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

test('PS-6B4A records normal upright fermata without rewriting score time or pitch', () => {
  const source = parsed(score('<fermata type="upright" default-y="9.42" relative-y="10.00"/>'));
  const result = projectParsedMusicXmlWithFermataCompatibility(source);

  assert.equal(POLYPHONIC_FERMATA_NOTATION_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_FERMATA_NOTATION_NORMALIZER_AUTHORITY,
    'NORMAL_FERMATA_NOTATION_NO_SCORE_TIME_REWRITE',
  );
  assert.equal(result.sourceModel.measures[0].events[0].pitch.written, 'C4');
  assert.equal(result.sourceModel.measures[0].events[0].pitch.midi, 60);
  assert.equal(result.sourceModel.measures[0].events[0].durationDivisions, 16);
  assert.deepEqual(
    result.fermataMarkers.map((marker) => [marker.shape, marker.type, marker.defaultY, marker.relativeY]),
    [['normal', 'upright', 9.42, 10]],
  );
  assert.ok(result.ignoredFeatures.includes('notation:fermata-normal-context'));
});

test('PS-6B4A accepts inverted and implicit-upright empty normal fermatas', () => {
  for (const [xml, expectedType] of [
    ['<fermata type="inverted" relative-y="-10.00"/>', 'inverted'],
    ['<fermata/>', 'upright'],
  ]) {
    const normalized = normalizePolyphonicFermataNotation(parsed(score(xml)));
    assert.equal(normalized.fermataMarkers.length, 1);
    assert.equal(normalized.fermataMarkers[0].type, expectedType);
    assert.equal(normalized.fermataMarkers[0].shape, 'normal');
  }
});

test('PS-6B4A fails closed on non-normal fermata shapes and unsupported attributes', () => {
  const fixtures = [
    '<fermata type="upright">angled</fermata>',
    '<fermata type="sideways"/>',
    '<fermata type="upright" color="#000000"/>',
    '<fermata type="upright" default-y="NaN"/>',
    '<fermata type="upright" relative-y="1000001"/>',
  ];
  for (const fermata of fixtures) {
    assert.equal(
      errorCode(() => normalizePolyphonicFermataNotation(parsed(score(fermata)))),
      'UNSUPPORTED_POLYPHONIC_FERMATA_NOTATION',
    );
  }
});

test('PS-6B4A removes only fermata and leaves other notation semantics fail-closed', () => {
  const source = parsed(score(
    '<fermata/>',
    { extraNotation: '<slur type="start" number="1"/>' },
  ));
  assert.throws(
    () => projectParsedMusicXmlWithFermataCompatibility(source),
    (error) => (
      error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
      && error.details.feature === 'notation:slur'
    ),
  );
});

test('PS-6B4A leaves source unchanged and freezes provenance', () => {
  const source = parsed(score('<fermata type="upright" relative-y="10.00"/>'));
  const part = source.root.children.find((child) => child.name === 'part');
  const note = part.children[0].children.find((child) => child.name === 'note');
  const notations = note.children.find((child) => child.name === 'notations');
  assert.equal(notations.children.some((child) => child.name === 'fermata'), true);

  const normalized = normalizePolyphonicFermataNotation(source);
  assert.equal(notations.children.some((child) => child.name === 'fermata'), true);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.fermataMarkers), true);
  assert.equal(Object.isFrozen(normalized.fermataMarkers[0]), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B4A remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicFermataNotation, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithFermataCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_FERMATA_NOTATION_NORMALIZER_VERSION, undefined);
});
