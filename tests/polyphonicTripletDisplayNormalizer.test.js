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

function chopinElevenInSixScore() {
  const timeModification =
    '<time-modification><actual-notes>11</actual-notes><normal-notes>6</normal-notes></time-modification>';
  const notes = Array.from({ length: 11 }, (_, index) => {
    const tuplet = index === 0
      ? '<notations><tuplet type="start" bracket="no"/></notations>'
      : index === 10
        ? '<notations><tuplet type="stop"/></notations>'
        : '';
    return `<note><pitch><step>C</step><octave>5</octave></pitch><duration>130</duration><voice>1</voice><type>eighth</type>${timeModification}<staff>1</staff>${tuplet}</note>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="3">
    <attributes><divisions>480</divisions><time><beats>6</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>D</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    <note><pitch><step>B</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    ${notes}
    <forward><duration>10</duration></forward>
  </measure></part>
</score-partwise>`;
}

function chopinTwentyTwoInTwelveScore() {
  const timeModification =
    '<time-modification><actual-notes>22</actual-notes><normal-notes>12</normal-notes></time-modification>';
  const notes = Array.from({ length: 22 }, (_, index) => {
    const tuplet = index === 0
      ? '<notations><tuplet type="start" bracket="no"/></notations>'
      : index === 21
        ? '<notations><tuplet type="stop"/></notations>'
        : '';
    const forward = index % 2 === 1 && index < 21
      ? '<forward><duration>1</duration></forward>'
      : '';
    return `<note><pitch><step>C</step><octave>5</octave></pitch><duration>130</duration><voice>1</voice><type>eighth</type>${timeModification}<staff>1</staff>${tuplet}</note>${forward}`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="4">
    <attributes><divisions>480</divisions><time><beats>6</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    ${notes}
    <forward><duration>10</duration></forward>
  </measure></part>
</score-partwise>`;
}

function chopinSevenInSixScore() {
  const timeModification =
    '<time-modification><actual-notes>7</actual-notes><normal-notes>6</normal-notes></time-modification>';
  const notes = Array.from({ length: 7 }, (_, index) => {
    const tuplet = index === 0
      ? '<notations><tuplet type="start" bracket="no"/></notations>'
      : index === 6
        ? '<notations><tuplet type="stop"/></notations>'
        : '';
    return `<note><pitch><step>C</step><octave>5</octave></pitch><duration>205</duration><voice>1</voice><type>eighth</type>${timeModification}<staff>1</staff>${tuplet}</note>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="15">
    <attributes><divisions>480</divisions><time><beats>3</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    ${notes}
    <forward><duration>5</duration></forward>
  </measure></part>
</score-partwise>`;
}

function chopinTwentyInSixScore() {
  const timeModification =
    '<time-modification><actual-notes>20</actual-notes><normal-notes>6</normal-notes></time-modification>';
  const notes = Array.from({ length: 20 }, (_, index) => {
    const tuplet = index === 0
      ? '<notations><tuplet type="start" bracket="no"/></notations>'
      : index === 19
        ? '<notations><tuplet type="stop"/></notations>'
        : '';
    return `<note><pitch><step>C</step><octave>5</octave></pitch><duration>72</duration><voice>1</voice><type>eighth</type>${timeModification}<staff>1</staff>${tuplet}</note>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="74">
    <attributes><divisions>480</divisions><time><beats>3</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    ${notes}
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

test('records a bounded bracketed tuplet whose ratio is backed by time-modification', () => {
  const sextuplet = '<time-modification><actual-notes>6</actual-notes><normal-notes>4</normal-notes></time-modification>';
  const result = normalizePolyphonicTripletDisplay(parsed(score({
    firstTuplet: '<tuplet type="start" bracket="yes"/>',
    firstTimeModification: sextuplet,
    secondTimeModification: sextuplet,
    thirdTimeModification: sextuplet,
  })));

  assert.deepEqual(result.tripletDisplayMarkers.map((marker) => ({
    type: marker.type,
    bracket: marker.bracket,
  })), [
    { type: 'start', bracket: true },
    { type: 'stop', bracket: null },
  ]);
});

test('accepts the pinned Chopin 11:6 tuplet profile without rescaling authoritative MusicXML duration', () => {
  const source = parsed(chopinElevenInSixScore());
  const sourcePart = source.root.children.find((child) => child.name === 'part');
  const sourceMeasure = sourcePart.children.find((child) => child.name === 'measure');
  const sourceNotes = sourceMeasure.children.filter((child) => child.name === 'note');
  const firstTupletSourceNote = sourceNotes[2];

  const result = projectParsedMusicXmlWithTripletDisplayCompatibility(source);
  const events = result.sourceModel.measures[0].events;

  assert.equal(result.durationPolicy, 'MUSICXML_DURATION_AUTHORITATIVE_NO_RATIO_RESCALING');
  assert.deepEqual(
    events.map((event) => event.durationDivisions),
    [960, 480, ...new Array(11).fill(130)],
  );
  assert.deepEqual(
    events.slice(2).map((event) => event.onsetDivisions),
    [1440, 1570, 1700, 1830, 1960, 2090, 2220, 2350, 2480, 2610, 2740],
  );
  assert.equal(result.tripletTimeModificationMarkers.length, 11);
  assert.deepEqual(result.tripletTimeModificationMarkers[0], {
    kind: 'eleven-in-six-time-modification',
    actualNotes: 11,
    normalNotes: 6,
    measureIndex: 0,
    measureNumber: '3',
    sourceOrder: 2,
    noteChildIndex: 4,
  });
  assert.deepEqual(
    result.tripletDisplayMarkers.map((marker) => ({
      type: marker.type,
      bracket: marker.bracket,
      sourceOrder: marker.sourceOrder,
    })),
    [
      { type: 'start', bracket: false, sourceOrder: 2 },
      { type: 'stop', bracket: null, sourceOrder: 12 },
    ],
  );

  assert.equal(
    firstTupletSourceNote.children.some((child) => child.name === 'time-modification'),
    true,
  );
  const sourceNotations = firstTupletSourceNote.children.find((child) => child.name === 'notations');
  assert.equal(sourceNotations.children.some((child) => child.name === 'tuplet'), true);
});

test('accepts the pinned Chopin 22:12 tuplet profile while preserving producer forward timing', () => {
  const result = projectParsedMusicXmlWithTripletDisplayCompatibility(
    parsed(chopinTwentyTwoInTwelveScore()),
  );
  const events = result.sourceModel.measures[0].events;

  assert.equal(result.durationPolicy, 'MUSICXML_DURATION_AUTHORITATIVE_NO_RATIO_RESCALING');
  assert.deepEqual(
    events.map((event) => event.durationDivisions),
    new Array(22).fill(130),
  );
  assert.deepEqual(
    events.map((event) => event.onsetDivisions),
    Array.from({ length: 22 }, (_, index) => (130 * index) + Math.floor(index / 2)),
  );
  assert.equal(result.tripletTimeModificationMarkers.length, 22);
  assert.deepEqual(result.tripletTimeModificationMarkers[0], {
    kind: 'twenty-two-in-twelve-time-modification',
    actualNotes: 22,
    normalNotes: 12,
    measureIndex: 0,
    measureNumber: '4',
    sourceOrder: 0,
    noteChildIndex: 4,
  });
  assert.deepEqual(
    result.tripletDisplayMarkers.map((marker) => ({
      type: marker.type,
      bracket: marker.bracket,
      sourceOrder: marker.sourceOrder,
    })),
    [
      { type: 'start', bracket: false, sourceOrder: 0 },
      { type: 'stop', bracket: null, sourceOrder: 21 },
    ],
  );
});

test('accepts the pinned Chopin 7:6 tuplet profile without rescaling producer timing', () => {
  const result = projectParsedMusicXmlWithTripletDisplayCompatibility(
    parsed(chopinSevenInSixScore()),
  );
  const events = result.sourceModel.measures[0].events;

  assert.equal(result.durationPolicy, 'MUSICXML_DURATION_AUTHORITATIVE_NO_RATIO_RESCALING');
  assert.deepEqual(events.map((event) => event.durationDivisions), new Array(7).fill(205));
  assert.deepEqual(
    events.map((event) => event.onsetDivisions),
    [0, 205, 410, 615, 820, 1025, 1230],
  );
  assert.equal(result.tripletTimeModificationMarkers.length, 7);
  assert.deepEqual(result.tripletTimeModificationMarkers[0], {
    kind: 'seven-in-six-time-modification',
    actualNotes: 7,
    normalNotes: 6,
    measureIndex: 0,
    measureNumber: '15',
    sourceOrder: 0,
    noteChildIndex: 4,
  });
  assert.deepEqual(
    result.tripletDisplayMarkers.map((marker) => ({
      type: marker.type,
      bracket: marker.bracket,
      sourceOrder: marker.sourceOrder,
    })),
    [
      { type: 'start', bracket: false, sourceOrder: 0 },
      { type: 'stop', bracket: null, sourceOrder: 6 },
    ],
  );
});

test('accepts the pinned Chopin 20:6 tuplet profile with exact authoritative duration closure', () => {
  const result = projectParsedMusicXmlWithTripletDisplayCompatibility(
    parsed(chopinTwentyInSixScore()),
  );
  const events = result.sourceModel.measures[0].events;

  assert.equal(result.durationPolicy, 'MUSICXML_DURATION_AUTHORITATIVE_NO_RATIO_RESCALING');
  assert.deepEqual(events.map((event) => event.durationDivisions), new Array(20).fill(72));
  assert.deepEqual(
    events.map((event) => event.onsetDivisions),
    Array.from({ length: 20 }, (_, index) => 72 * index),
  );
  assert.equal(result.tripletTimeModificationMarkers.length, 20);
  assert.deepEqual(result.tripletTimeModificationMarkers[0], {
    kind: 'twenty-in-six-time-modification',
    actualNotes: 20,
    normalNotes: 6,
    measureIndex: 0,
    measureNumber: '74',
    sourceOrder: 0,
    noteChildIndex: 4,
  });
  assert.deepEqual(
    result.tripletDisplayMarkers.map((marker) => ({
      type: marker.type,
      bracket: marker.bracket,
      sourceOrder: marker.sourceOrder,
    })),
    [
      { type: 'start', bracket: false, sourceOrder: 0 },
      { type: 'stop', bracket: null, sourceOrder: 19 },
    ],
  );
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
