'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_VERSION,
  POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_AUTHORITY,
  normalizePolyphonicTripletDisplay,
  projectParsedMusicXmlWithTripletDisplayCompatibility,
} = require('../src/parser/polyphonicTripletDisplayNormalizer');

const TRIPLET = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';

function score({
  firstTuplet = '<tuplet type="start" bracket="no"/>',
  secondTuplet = '',
  thirdTuplet = '<tuplet type="stop"/>',
  firstTimeModification = TRIPLET,
  secondTimeModification = TRIPLET,
  thirdTimeModification = TRIPLET,
  firstVoice = '1',
  secondVoice = '1',
  thirdVoice = '1',
  firstStaff = '1',
  secondStaff = '1',
  thirdStaff = '1',
  firstExtraNotation = '',
} = {}) {
  const notation = (tuplet, extra = '') => (
    tuplet || extra ? `<notations>${tuplet}${extra}</notations>` : ''
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>3</divisions><time symbol="common"><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>${firstVoice}</voice><staff>${firstStaff}</staff>${firstTimeModification}${notation(firstTuplet, firstExtraNotation)}</note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>${secondVoice}</voice><staff>${secondStaff}</staff>${secondTimeModification}${notation(secondTuplet)}</note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>${thirdVoice}</voice><staff>${thirdStaff}</staff>${thirdTimeModification}${notation(thirdTuplet)}</note>
    <note><rest/><duration>6</duration><voice>1</voice><staff>1</staff></note>
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

test('PS-6B5B preserves score timing while recording paired triplet display provenance', () => {
  const result = projectParsedMusicXmlWithTripletDisplayCompatibility(parsed(score()));

  assert.equal(POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_AUTHORITY,
    'TRIPLET_DISPLAY_PROVENANCE_ONLY',
  );
  assert.equal(result.durationPolicy, 'MUSICXML_DURATION_AUTHORITATIVE_NO_RATIO_RESCALING');
  assert.deepEqual(
    result.sourceModel.measures[0].events.map((event) => event.durationDivisions),
    [2, 2, 2, 6],
  );
  assert.deepEqual(
    result.sourceModel.measures[0].events.map((event) => event.onsetDivisions),
    [0, 2, 4, 6],
  );
  assert.deepEqual(
    result.sourceModel.measures[0].events.slice(0, 3).map((event) => event.pitch.written),
    ['C4', 'D4', 'E4'],
  );
  assert.equal(result.tripletTimeModificationMarkers.length, 3);
  assert.deepEqual(result.tripletDisplayMarkers, [
    {
      kind: 'triplet-display',
      type: 'start',
      bracket: false,
      voice: '1',
      staff: '1',
      measureIndex: 0,
      measureNumber: '1',
      sourceOrder: 0,
      notationChildIndex: 0,
    },
    {
      kind: 'triplet-display',
      type: 'stop',
      bracket: null,
      voice: '1',
      staff: '1',
      measureIndex: 0,
      measureNumber: '1',
      sourceOrder: 2,
      notationChildIndex: 0,
    },
  ]);
  assert.ok(result.ignoredFeatures.includes('notation:triplet-display-context'));
});

test('PS-6B5B fails closed on unsupported tuplet display shapes', () => {
  const fixtures = [
    { firstTuplet: '<tuplet type="start" bracket="yes"/>' },
    { firstTuplet: '<tuplet type="start"/>' },
    { firstTuplet: '<tuplet type="start" bracket="no" number="1"/>' },
    { thirdTuplet: '<tuplet type="stop" number="1"/>' },
    { firstTuplet: '<tuplet type="start" bracket="no"><tuplet-actual/></tuplet>' },
  ];
  for (const fixture of fixtures) {
    assert.equal(
      errorCode(() => normalizePolyphonicTripletDisplay(parsed(score(fixture)))),
      'UNSUPPORTED_POLYPHONIC_TRIPLET_DISPLAY',
    );
  }
});

test('PS-6B5B requires same-note validated 3:2 time-modification provenance', () => {
  assert.equal(
    errorCode(() => normalizePolyphonicTripletDisplay(parsed(score({ firstTimeModification: '' })))),
    'INVALID_POLYPHONIC_TRIPLET_DISPLAY',
  );
});

test('PS-6B5B rejects unmatched, overlapping and cross-lane tuplet display chains', () => {
  const fixtures = [
    { firstTuplet: '', thirdTuplet: '<tuplet type="stop"/>' },
    { firstTuplet: '<tuplet type="start" bracket="no"/>', thirdTuplet: '' },
    {
      firstTuplet: '<tuplet type="start" bracket="no"/>',
      secondTuplet: '<tuplet type="start" bracket="no"/>',
      thirdTuplet: '<tuplet type="stop"/>',
    },
    {
      firstTuplet: '<tuplet type="start" bracket="no"/>',
      thirdTuplet: '<tuplet type="stop"/>',
      thirdVoice: '2',
    },
  ];
  for (const fixture of fixtures) {
    assert.equal(
      errorCode(() => normalizePolyphonicTripletDisplay(parsed(score(fixture)))),
      'INVALID_POLYPHONIC_TRIPLET_DISPLAY',
    );
  }
});

test('PS-6B5B requires exactly one MusicXML part before provenance-key matching', () => {
  const xml = score().replace(
    '</part-list>',
    '<score-part id="P2"><part-name>Other</part-name></score-part></part-list>',
  ).replace(
    '</score-partwise>',
    '<part id="P2"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><rest/><duration>4</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>',
  );
  assert.equal(
    errorCode(() => normalizePolyphonicTripletDisplay(parsed(xml))),
    'UNSUPPORTED_POLYPHONIC_TRIPLET_DISPLAY',
  );
});

test('PS-6B5B removes only tuplet display and leaves slur semantics fail-closed', () => {
  assert.throws(
    () => projectParsedMusicXmlWithTripletDisplayCompatibility(parsed(score({
      firstExtraNotation: '<slur type="start" placement="above" number="1"/>',
    }))),
    (error) => (
      error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
      && error.details.feature === 'notation:slur'
    ),
  );
});

test('PS-6B5B leaves source unchanged and freezes display provenance', () => {
  const source = parsed(score());
  const part = source.root.children.find((child) => child.name === 'part');
  const firstNote = part.children[0].children.find((child) => child.name === 'note');
  const notations = firstNote.children.find((child) => child.name === 'notations');
  assert.equal(notations.children.some((child) => child.name === 'tuplet'), true);

  const normalized = normalizePolyphonicTripletDisplay(source);
  assert.equal(notations.children.some((child) => child.name === 'tuplet'), true);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.tripletDisplayMarkers), true);
  assert.equal(Object.isFrozen(normalized.tripletDisplayMarkers[0]), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B5B remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicTripletDisplay, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithTripletDisplayCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_TRIPLET_DISPLAY_NORMALIZER_VERSION, undefined);
});
