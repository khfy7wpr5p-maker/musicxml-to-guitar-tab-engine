'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_STACCATO_NOTATION_NORMALIZER_VERSION,
  POLYPHONIC_STACCATO_NOTATION_NORMALIZER_AUTHORITY,
  POLYPHONIC_STACCATO_TIMING_POLICY,
  normalizePolyphonicStaccatoNotation,
  projectParsedMusicXmlWithStaccatoCompatibility,
} = require('../src/parser/polyphonicStaccatoNotationNormalizer');

function score(articulationsXml, { extraNotation = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time symbol="common"><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff><notations>${articulationsXml}${extraNotation}</notations></note>
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

test('PS-6B4B preserves nominal score duration while recording exact staccato notation', () => {
  const result = projectParsedMusicXmlWithStaccatoCompatibility(
    parsed(score('<articulations><staccato/></articulations>')),
  );

  assert.equal(POLYPHONIC_STACCATO_NOTATION_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_STACCATO_NOTATION_NORMALIZER_AUTHORITY,
    'STACCATO_NOTATION_PRESERVED_NOMINAL_SCORE_TIME',
  );
  assert.equal(
    POLYPHONIC_STACCATO_TIMING_POLICY,
    'NO_INTERPRETIVE_RELEASE_SHORTENING_WITHOUT_EXPLICIT_NOTE_RELEASE',
  );
  assert.equal(result.sourceModel.measures[0].events[0].durationDivisions, 16);
  assert.equal(result.sourceModel.measures[0].events[0].pitch.written, 'C4');
  assert.equal(result.staccatoMarkers.length, 1);
  assert.deepEqual(result.staccatoMarkers[0], {
    kind: 'staccato',
    measureIndex: 0,
    measureNumber: '1',
    sourceOrder: 0,
    notationChildIndex: 0,
  });
  assert.deepEqual(
    result.performanceTimingCaveats,
    ['STACCATO_HAS_NO_NUMERIC_RELEASE_SHORTENING_IN_THIS_SOURCE_STAGE'],
  );
  assert.ok(result.ignoredFeatures.includes('notation:staccato-context'));
});

test('PS-6B4B does not invent a shorter duration from symbolic staccato', () => {
  const result = projectParsedMusicXmlWithStaccatoCompatibility(
    parsed(score('<articulations><staccato/></articulations>')),
  );
  assert.equal(result.sourceModel.measures[0].events[0].onsetDivisions, 0);
  assert.equal(result.sourceModel.measures[0].events[0].durationDivisions, 16);
});

test('PS-6B4B fails closed on non-staccato, mixed or decorated articulation shapes', () => {
  const fixtures = [
    '<articulations><accent/></articulations>',
    '<articulations><staccato/><accent/></articulations>',
    '<articulations id="a1"><staccato/></articulations>',
    '<articulations><staccato placement="above"/></articulations>',
  ];
  for (const articulations of fixtures) {
    assert.equal(
      errorCode(() => normalizePolyphonicStaccatoNotation(parsed(score(articulations)))),
      'UNSUPPORTED_POLYPHONIC_STACCATO_NOTATION',
    );
  }
});

test('PS-6B4B removes only exact staccato and leaves slur semantics fail-closed', () => {
  const source = parsed(score(
    '<articulations><staccato/></articulations>',
    { extraNotation: '<slur type="start" number="1" placement="above"/>' },
  ));
  assert.throws(
    () => projectParsedMusicXmlWithStaccatoCompatibility(source),
    (error) => (
      error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
      && error.details.feature === 'notation:slur'
    ),
  );
});

test('PS-6B4B leaves source unchanged and freezes provenance/caveats', () => {
  const source = parsed(score('<articulations><staccato/></articulations>'));
  const part = source.root.children.find((child) => child.name === 'part');
  const note = part.children[0].children.find((child) => child.name === 'note');
  const notations = note.children.find((child) => child.name === 'notations');
  assert.equal(notations.children.some((child) => child.name === 'articulations'), true);

  const normalized = normalizePolyphonicStaccatoNotation(source);
  assert.equal(notations.children.some((child) => child.name === 'articulations'), true);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.staccatoMarkers), true);
  assert.equal(Object.isFrozen(normalized.staccatoMarkers[0]), true);
  assert.equal(Object.isFrozen(normalized.performanceTimingCaveats), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B4B remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicStaccatoNotation, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithStaccatoCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_STACCATO_TIMING_POLICY, undefined);
});
