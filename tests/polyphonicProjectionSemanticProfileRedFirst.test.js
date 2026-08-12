'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');

const NONSTANDARD_NAMESPACED_COMPAT = 'http://www.musicxml.org/ns/musicxml';

function score({
  rootAttributes = '',
  rootExtra = '',
  partExtra = '',
  measureExtra = '',
  attributesExtra = '',
  timeExtra = '',
  noteAttributes = '',
  noteKind = 'pitch',
  pitchExtra = '',
  duration = 4,
  voice = '1',
  staff = '1',
  staves = '1',
  noteType = '<type>quarter</type>',
  noteDecorations = '',
  noteExtra = '',
  tie = '',
  notations = '',
} = {}) {
  const sourceKind = noteKind === 'rest'
    ? '<rest/>'
    : `<pitch><step>C</step>${pitchExtra}<octave>4</octave></pitch>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"${rootAttributes}>
  ${rootExtra}
  <part-list><score-part id="P1"><part-name>PA-2.3S-1</part-name></score-part></part-list>
  <part id="P1">
    ${partExtra}
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type>${timeExtra}</time>
        <staves>${staves}</staves>
        ${attributesExtra}
      </attributes>
      <note${noteAttributes}>
        ${sourceKind}
        <duration>${duration}</duration>
        ${tie}
        <voice>${voice}</voice>
        ${noteType}
        ${noteDecorations}
        <staff>${staff}</staff>
        ${noteExtra}
        ${notations}
      </note>
      ${measureExtra}
    </measure>
  </part>
</score-partwise>`;
}

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function assertProfileRejects(xml) {
  assert.throws(
    () => project(xml),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
      return true;
    },
  );
}

test('PA-2.3S-1 SUPPORTED: standard MusicXML 4.0 remains unnamespaced and projects basic source facts', () => {
  const projected = project(score());
  assert.equal(projected.source.format, 'score-partwise');
  assert.equal(projected.eventCount, 1);
  assert.equal(projected.measures[0].events[0].pitch.written, 'C4');
});

test('PA-2.3S-1 NONSTANDARD_NAMESPACED_COMPAT remains separately accepted as compatibility debt', () => {
  const standard = project(score());
  const compatibility = project(score({
    rootAttributes: ` xmlns="${NONSTANDARD_NAMESPACED_COMPAT}"`,
  }));
  assert.deepEqual(compatibility, standard);
});

const safeIgnoreNoteDecorations = [
  ['type', ''],
  ['dot', '<dot/>'],
  ['stem', '<stem>up</stem>'],
  ['beam', '<beam number="1">begin</beam>'],
  ['notehead', '<notehead>normal</notehead>'],
  ['notehead-text', '<notehead-text><display-text>x</display-text></notehead-text>'],
  ['accidental', '<accidental>natural</accidental>'],
  ['footnote-level', '<footnote>editorial</footnote><level>1</level>'],
];

for (const [name, noteDecorations] of safeIgnoreNoteDecorations) {
  test(`PA-2.3S-1 SAFE_IGNORE note decoration: ${name}`, () => {
    const baseline = project(score());
    const candidate = project(score({ noteDecorations }));
    assert.deepEqual(candidate, baseline);
  });
}

test('PA-2.3S-1 SAFE_IGNORE: dotted rest keeps duration as source timing authority', () => {
  const projected = project(score({
    noteKind: 'rest',
    duration: 6,
    noteType: '<type>quarter</type>',
    noteDecorations: '<dot/>',
  }));
  const event = projected.measures[0].events[0];
  assert.equal(event.type, 'rest');
  assert.equal(event.durationDivisions, 6);
});

test('PA-2.3S-1 SAFE_IGNORE: selected presentation-only note attributes do not alter source facts', () => {
  const baseline = project(score());
  const candidate = project(score({
    noteAttributes: ' color="#112233" default-x="12" relative-y="-3"',
  }));
  assert.deepEqual(candidate, baseline);
});

test('PA-2.3S-1 SAFE_IGNORE: profiled notation attributes and notehead text remain presentation-only', () => {
  const baseline = project(score());
  const candidate = project(score({
    noteType: '<type size="full">quarter</type>',
    noteDecorations: [
      '<dot placement="above" color="#112233"/>',
      '<stem default-y="1">up</stem>',
      '<beam number="1" color="#112233" id="beam-1">begin</beam>',
      '<notehead filled="yes" parentheses="no">normal</notehead>',
      '<notehead-text><display-text font-style="italic">x</display-text><accidental-text smufl="accidentalSharp">sharp</accidental-text></notehead-text>',
      '<accidental cautionary="yes" editorial="yes" smufl="accidentalNatural">natural</accidental>',
      '<footnote font-weight="bold">editorial</footnote>',
      '<level reference="yes" type="single">1</level>',
    ].join(''),
  }));
  assert.deepEqual(candidate, baseline);
});

test('PA-2.3S-1 SAFE_IGNORE: profiled part-name presentation metadata does not alter source facts', () => {
  const baseline = project(score());
  const candidate = project(score().replace(
    '<part-name>',
    '<part-name color="#112233" font-style="italic" print-object="yes">',
  ));
  assert.deepEqual(candidate, baseline);
});

const rejectSafeIgnoreAttributeCases = [
  ['type', { noteType: '<type profile-unknown="yes">quarter</type>' }],
  ['dot', { noteDecorations: '<dot profile-unknown="yes"/>' }],
  ['stem', { noteDecorations: '<stem profile-unknown="yes">up</stem>' }],
  ['beam', { noteDecorations: '<beam profile-unknown="yes">begin</beam>' }],
  ['notehead', { noteDecorations: '<notehead profile-unknown="yes">normal</notehead>' }],
  ['notehead-text', { noteDecorations: '<notehead-text profile-unknown="yes"><display-text>x</display-text></notehead-text>' }],
  ['accidental', { noteDecorations: '<accidental profile-unknown="yes">natural</accidental>' }],
  ['footnote', { noteDecorations: '<footnote profile-unknown="yes">editorial</footnote>' }],
  ['level', { noteDecorations: '<level profile-unknown="yes">1</level>' }],
];

for (const [name, options] of rejectSafeIgnoreAttributeCases) {
  test(`PA-2.3S-1 REJECT unknown SAFE_IGNORE attribute: ${name}`, () => {
    assertProfileRejects(score(options));
  });
}

test('PA-2.3S-1 REJECT unknown SAFE_IGNORE attribute: part-name', () => {
  assertProfileRejects(score().replace(
    '<part-name>',
    '<part-name profile-unknown="yes">',
  ));
});

const rejectSafeIgnoreChildCases = [
  ['type', { noteType: '<type><profile-unknown/>quarter</type>' }],
  ['dot', { noteDecorations: '<dot><profile-unknown/></dot>' }],
  ['stem', { noteDecorations: '<stem><profile-unknown/>up</stem>' }],
  ['beam', { noteDecorations: '<beam><profile-unknown/>begin</beam>' }],
  ['notehead', { noteDecorations: '<notehead><profile-unknown/>normal</notehead>' }],
  ['notehead-text', { noteDecorations: '<notehead-text><profile-unknown/></notehead-text>' }],
  ['accidental', { noteDecorations: '<accidental><profile-unknown/>natural</accidental>' }],
  ['footnote', { noteDecorations: '<footnote><profile-unknown/>editorial</footnote>' }],
  ['level', { noteDecorations: '<level><profile-unknown/>1</level>' }],
];

for (const [name, options] of rejectSafeIgnoreChildCases) {
  test(`PA-2.3S-1 REJECT unknown SAFE_IGNORE child: ${name}`, () => {
    assertProfileRejects(score(options));
  });
}

test('PA-2.3S-1 REJECT unknown SAFE_IGNORE child: part-name', () => {
  assertProfileRejects(score().replace(
    'PA-2.3S-1</part-name>',
    '<profile-unknown/>PA-2.3S-1</part-name>',
  ));
});

const rejectPlaybackBearingSafeIgnoreCases = [
  ['beam repeater', '<beam number="1" repeater="yes">begin</beam>'],
  ['beam fan', '<beam number="1" fan="accel">begin</beam>'],
  ['semantic notehead SMuFL refinement', '<notehead smufl="noteheadDiamondBlack">diamond</notehead>'],
];

for (const [name, noteDecorations] of rejectPlaybackBearingSafeIgnoreCases) {
  test(`PA-2.3S-1 REJECT playback-bearing SAFE_IGNORE metadata: ${name}`, () => {
    assertProfileRejects(score({ noteDecorations }));
  });
}

test('PA-2.3S-1 FOREIGN_NAMESPACE: a foreign note lookalike creates no source event', () => {
  const projected = project(score({
    rootAttributes: ' xmlns:x="urn:pa-2-3s-foreign"',
    measureExtra: '<x:note><x:rest/><x:duration>4</x:duration><x:voice>1</x:voice><x:staff>1</x:staff></x:note>',
  }));
  assert.equal(projected.eventCount, 1);
  assert.equal(projected.measures[0].events.length, 1);
  assert.equal(projected.measures[0].events[0].pitch.written, 'C4');
});

test('PA-2.3S-1 compatibility debt: direct tie type="continue" stays explicit and separate from MusicXML 4.0 standard tie semantics', () => {
  const projected = project(score({ tie: '<tie type="continue"/>' }));
  const event = projected.measures[0].events[0];
  assert.equal(event.tieStart, true);
  assert.equal(event.tieStop, true);
});

const rejectNoteChildCases = [
  ['play', '<play><mute>on</mute></play>'],
  ['listen', '<listen/>'],
  ['lyric', '<lyric><text>la</text></lyric>'],
  ['unknown same-profile note child', '<profile-unknown/>'],
];

for (const [name, noteExtra] of rejectNoteChildCases) {
  test(`PA-2.3S-1 REJECT note child: ${name}`, () => {
    assertProfileRejects(score({ noteExtra }));
  });
}

const rejectNoteAttributeCases = [
  ['pizzicato', ' pizzicato="yes"'],
  ['dynamics', ' dynamics="80"'],
  ['end-dynamics', ' end-dynamics="70"'],
  ['unknown same-profile semantic attribute', ' profile-unknown="yes"'],
];

for (const [name, noteAttributes] of rejectNoteAttributeCases) {
  test(`PA-2.3S-1 REJECT note attribute: ${name}`, () => {
    assertProfileRejects(score({ noteAttributes }));
  });
}

const rejectAttributesChildCases = [
  [
    'staff-details/staff-tuning',
    '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning></staff-details>',
  ],
  ['key', '<key><fifths>0</fifths></key>'],
  ['clef', '<clef><sign>G</sign><line>2</line></clef>'],
  ['instruments', '<instruments>1</instruments>'],
  ['unknown same-profile attributes child', '<profile-unknown/>'],
];

for (const [name, attributesExtra] of rejectAttributesChildCases) {
  test(`PA-2.3S-1 REJECT attributes child: ${name}`, () => {
    assertProfileRejects(score({ attributesExtra }));
  });
}

test('PA-2.3S-1 REJECT unknown same-profile time child', () => {
  assertProfileRejects(score({ timeExtra: '<profile-unknown/>' }));
});

test('PA-2.3S-1 REJECT unknown same-profile pitch child', () => {
  assertProfileRejects(score({ pitchExtra: '<profile-unknown/>' }));
});

const supportedScalarLeafCases = [
  [
    'note duration child',
    score().replace('<duration>4</duration>', '<duration><profile-unknown/>4</duration>'),
  ],
  [
    'note voice attribute',
    score().replace('<voice>1</voice>', '<voice profile-unknown="yes">1</voice>'),
  ],
  [
    'note staff child',
    score().replace('<staff>1</staff>', '<staff><profile-unknown/>1</staff>'),
  ],
  [
    'pitch step attribute',
    score().replace('<step>C</step>', '<step profile-unknown="yes">C</step>'),
  ],
  [
    'pitch alter child',
    score({ pitchExtra: '<alter>0</alter>' })
      .replace('<alter>0</alter>', '<alter><profile-unknown/>0</alter>'),
  ],
  [
    'pitch octave attribute',
    score().replace('<octave>4</octave>', '<octave profile-unknown="yes">4</octave>'),
  ],
  [
    'divisions child',
    score().replace('<divisions>4</divisions>', '<divisions><profile-unknown/>4</divisions>'),
  ],
  [
    'time beats attribute',
    score().replace('<beats>4</beats>', '<beats profile-unknown="yes">4</beats>'),
  ],
  [
    'time beat-type child',
    score().replace('<beat-type>4</beat-type>', '<beat-type><profile-unknown/>4</beat-type>'),
  ],
  [
    'staves attribute',
    score().replace('<staves>1</staves>', '<staves profile-unknown="yes">1</staves>'),
  ],
];

for (const [name, xml] of supportedScalarLeafCases) {
  test(`PA-2.3S-1 REJECT supported scalar content: ${name}`, () => {
    assertProfileRejects(xml);
  });
}

test('PA-2.3S-1 REJECT unknown same-profile root child', () => {
  assertProfileRejects(score({ rootExtra: '<profile-unknown/>' }));
});

test('PA-2.3S-1 REJECT unknown same-profile selected-part child', () => {
  assertProfileRejects(score({ partExtra: '<profile-unknown/>' }));
});

const existingRejectCases = [
  ['attributes/transpose', { attributesExtra: '<transpose><chromatic>-2</chromatic></transpose>' }],
  ['attributes/measure-style', { attributesExtra: '<measure-style><multiple-rest>2</multiple-rest></measure-style>' }],
  ['measure/direction', { measureExtra: '<direction><direction-type><words>rit.</words></direction-type></direction>' }],
  ['measure/sound', { measureExtra: '<sound tempo="120"/>' }],
  ['unknown same-profile measure child', { measureExtra: '<profile-unknown/>' }],
  ['notations/ornaments', { notations: '<notations><ornaments><trill-mark/></ornaments></notations>' }],
  ['note attack', { noteAttributes: ' attack="1"' }],
  ['note release', { noteAttributes: ' release="-1"' }],
  ['note time-only', { noteAttributes: ' time-only="2"' }],
  ['conditional tie time-only', { tie: '<tie type="start" time-only="2"/>' }],
  ['later gate backup', { measureExtra: '<backup><duration>4</duration></backup>' }],
  ['later gate forward', { measureExtra: '<forward><duration>4</duration></forward>' }],
  ['later gate chord marker', { noteExtra: '<chord/>' }],
  ['later gate voice 2', { voice: '2' }],
  ['later gate staff 2', { staves: '2', staff: '2' }],
  ['later gate grace note', { noteExtra: '<grace/>' }],
  ['later gate time-modification', { noteExtra: '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' }],
];

for (const [name, options] of existingRejectCases) {
  test(`PA-2.3S-1 existing fail-closed regression: ${name}`, () => {
    assertProfileRejects(score(options));
  });
}
