'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_VERSION,
  POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_AUTHORITY,
  normalizePolyphonicNotationContext,
  projectParsedMusicXmlWithNotationContextCompatibility,
} = require('../src/parser/polyphonicNotationContextNormalizer');

function score(body, { staves = 2 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>4</divisions>
      <key><fifths>-1</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <staves>${staves}</staves>
      <clef number="1"><sign>G</sign><line>2</line></clef>
      ${staves === 2 ? '<clef number="2"><sign>F</sign><line>4</line></clef>' : ''}
    </attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, octave, { duration = 16, voice = 1, staff = 1 } = {}) {
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`;
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

test('PS-6B3A preserves explicit pitch while recording standard key and G/F clef context', () => {
  const source = parsed(score(`
    ${note('C', 5, { staff: 1 })}
    <backup><duration>16</duration></backup>
    ${note('D', 3, { voice: 2, staff: 2 })}
  `));
  const result = projectParsedMusicXmlWithNotationContextCompatibility(source);

  assert.equal(POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_AUTHORITY,
    'STANDARD_KEY_CLEF_CONTEXT_NO_PITCH_REWRITE',
  );
  assert.deepEqual(
    result.sourceModel.measures[0].events.map((event) => [event.pitch.written, event.pitch.midi]),
    [['C5', 72], ['D3', 50]],
  );
  assert.deepEqual(
    result.notationContextMarkers.map((marker) => {
      if (marker.kind === 'key') return ['key', marker.fifths];
      return ['clef', marker.number, marker.sign, marker.line];
    }),
    [['key', -1], ['clef', 1, 'G', 2], ['clef', 2, 'F', 4]],
  );
  assert.ok(result.ignoredFeatures.includes('attributes:key-signature-context'));
  assert.ok(result.ignoredFeatures.includes('attributes:clef-display-context'));
});

test('PS-6B3A accepts a standard clef change after timing starts without changing note pitch', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    ${note('E', 4, { duration: 8 })}
    <attributes><clef><sign>F</sign><line>4</line></clef></attributes>
    ${note('F', 4, { duration: 8 })}
  </measure></part>
</score-partwise>`;
  const result = projectParsedMusicXmlWithNotationContextCompatibility(parsed(xml));
  assert.deepEqual(result.sourceModel.measures[0].events.map((event) => event.pitch.written), ['E4', 'F4']);
  assert.deepEqual(
    result.notationContextMarkers.filter((marker) => marker.kind === 'clef')
      .map((marker) => [marker.number, marker.sign, marker.line, marker.measureChildIndex]),
    [[1, 'G', 2, 0], [1, 'F', 4, 2]],
  );
});

test('PS-6B3A fails closed on custom, modal or out-of-range key signatures', () => {
  const fixtures = [
    '<key><fifths>-1</fifths><mode>minor</mode></key>',
    '<key><key-step>F</key-step><key-alter>1</key-alter></key>',
    '<key><fifths>8</fifths></key>',
  ];
  for (const key of fixtures) {
    const xml = score(note('C', 4), { staves: 1 }).replace('<key><fifths>-1</fifths></key>', key);
    assert.equal(
      errorCode(() => normalizePolyphonicNotationContext(parsed(xml))),
      'UNSUPPORTED_POLYPHONIC_NOTATION_CONTEXT',
    );
  }
});

test('PS-6B3A fails closed on transposing, C-clef and unsupported clef attributes', () => {
  const fixtures = [
    '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>',
    '<clef><sign>C</sign><line>3</line></clef>',
    '<clef print-object="no"><sign>G</sign><line>2</line></clef>',
  ];
  for (const clef of fixtures) {
    const xml = score(note('C', 4), { staves: 1 })
      .replace('<clef number="1"><sign>G</sign><line>2</line></clef>', clef);
    assert.equal(
      errorCode(() => normalizePolyphonicNotationContext(parsed(xml))),
      'UNSUPPORTED_POLYPHONIC_NOTATION_CONTEXT',
    );
  }
});

test('PS-6B3A rejects duplicate clef staff numbers inside one attributes node', () => {
  const xml = score(note('C', 4), { staves: 1 }).replace(
    '<clef number="1"><sign>G</sign><line>2</line></clef>',
    '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="1"><sign>F</sign><line>4</line></clef>',
  );
  assert.equal(
    errorCode(() => normalizePolyphonicNotationContext(parsed(xml))),
    'INVALID_POLYPHONIC_NOTATION_CONTEXT',
  );
});

test('PS-6B3A does not absorb unrelated attributes semantics', () => {
  const xml = score(note('C', 4), { staves: 1 }).replace(
    '</attributes>',
    '<staff-details/><\/attributes>',
  );
  assert.throws(
    () => projectParsedMusicXmlWithNotationContextCompatibility(parsed(xml)),
    (error) => (
      error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
      && error.details.feature === 'attributes-child:staff-details'
    ),
  );
});

test('PS-6B3A leaves the source document unchanged and freezes provenance', () => {
  const source = parsed(score(note('C', 4), { staves: 1 }));
  const sourceAttributes = source.root.children.find((child) => child.name === 'part')
    .children[0].children.find((child) => child.name === 'attributes');
  const sourceChildNames = sourceAttributes.children.map((child) => child.name);
  const normalized = normalizePolyphonicNotationContext(source);

  assert.deepEqual(sourceAttributes.children.map((child) => child.name), sourceChildNames);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.notationContextMarkers), true);
  assert.equal(Object.isFrozen(normalized.notationContextMarkers[0]), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B3A remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicNotationContext, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithNotationContextCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_NOTATION_CONTEXT_NORMALIZER_VERSION, undefined);
});
