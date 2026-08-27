'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_VERSION,
  POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_AUTHORITY,
  POLYPHONIC_TRIPLET_DURATION_POLICY,
  normalizePolyphonicTripletTimeModification,
  projectParsedMusicXmlWithTripletTimeModificationCompatibility,
} = require('../src/parser/polyphonicTripletTimeModificationNormalizer');

function tripletNode(inner = '<actual-notes>3</actual-notes><normal-notes>2</normal-notes>', attributes = '') {
  return `<time-modification${attributes}>${inner}</time-modification>`;
}

function score({
  firstTimeModification = tripletNode(),
  secondTimeModification = tripletNode(),
  thirdTimeModification = tripletNode(),
  firstNotations = '',
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>3</divisions><time symbol="common"><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff>${firstTimeModification}${firstNotations ? `<notations>${firstNotations}</notations>` : ''}</note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff>${secondTimeModification}</note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff>${thirdTimeModification}</note>
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

test('PS-6B5A records exact 3:2 triplet relations without rescaling MusicXML duration', () => {
  const result = projectParsedMusicXmlWithTripletTimeModificationCompatibility(parsed(score()));

  assert.equal(POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_TRIPLET_TIME_MODIFICATION_NORMALIZER_AUTHORITY,
    'TRIPLET_RELATION_PRESERVED_DURATION_ALREADY_ENCODED',
  );
  assert.equal(
    POLYPHONIC_TRIPLET_DURATION_POLICY,
    'MUSICXML_DURATION_AUTHORITATIVE_NO_RATIO_RESCALING',
  );
  assert.deepEqual(
    result.sourceModel.measures[0].events.map((event) => event.durationDivisions),
    [2, 2, 2, 6],
  );
  assert.deepEqual(
    result.sourceModel.measures[0].events.map((event) => event.onsetDivisions),
    [0, 2, 4, 6],
  );
  assert.equal(result.tripletTimeModificationMarkers.length, 3);
  assert.deepEqual(result.tripletTimeModificationMarkers[0], {
    kind: 'triplet-time-modification',
    actualNotes: 3,
    normalNotes: 2,
    measureIndex: 0,
    measureNumber: '1',
    sourceOrder: 0,
    noteChildIndex: 4,
  });
  assert.ok(result.ignoredFeatures.includes('note:triplet-time-modification-context'));
});

test('PS-6B5A fails closed on other ratios, normal-type and decorated time-modification shapes', () => {
  const fixtures = [
    tripletNode('<actual-notes>5</actual-notes><normal-notes>4</normal-notes>'),
    tripletNode('<actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>eighth</normal-type>'),
    tripletNode('<normal-notes>2</normal-notes><actual-notes>3</actual-notes>'),
    tripletNode('<actual-notes>3</actual-notes><normal-notes>2</normal-notes>', ' id="tm1"'),
    tripletNode('<actual-notes value="3">3</actual-notes><normal-notes>2</normal-notes>'),
  ];
  for (const firstTimeModification of fixtures) {
    assert.equal(
      errorCode(() => normalizePolyphonicTripletTimeModification(parsed(score({ firstTimeModification })))),
      'UNSUPPORTED_POLYPHONIC_TRIPLET_TIME_MODIFICATION',
    );
  }
});

test('PS-6B5A rejects duplicate time-modification elements on one note', () => {
  const duplicate = `${tripletNode()}${tripletNode()}`;
  assert.equal(
    errorCode(() => normalizePolyphonicTripletTimeModification(parsed(score({ firstTimeModification: duplicate })))),
    'INVALID_POLYPHONIC_TRIPLET_TIME_MODIFICATION',
  );
});

test('PS-6B5A removes only time-modification and leaves tuplet display semantics fail-closed', () => {
  assert.throws(
    () => projectParsedMusicXmlWithTripletTimeModificationCompatibility(parsed(score({
      firstNotations: '<tuplet type="start" bracket="no"/>',
    }))),
    (error) => (
      error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
      && error.details.feature === 'notation:tuplet'
    ),
  );
});

test('PS-6B5A leaves source unchanged and freezes triplet provenance', () => {
  const source = parsed(score());
  const part = source.root.children.find((child) => child.name === 'part');
  const firstNote = part.children[0].children.find((child) => child.name === 'note');
  assert.equal(firstNote.children.some((child) => child.name === 'time-modification'), true);

  const normalized = normalizePolyphonicTripletTimeModification(source);
  assert.equal(firstNote.children.some((child) => child.name === 'time-modification'), true);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.tripletTimeModificationMarkers), true);
  assert.equal(Object.isFrozen(normalized.tripletTimeModificationMarkers[0]), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B5A remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicTripletTimeModification, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithTripletTimeModificationCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_TRIPLET_DURATION_POLICY, undefined);
});
