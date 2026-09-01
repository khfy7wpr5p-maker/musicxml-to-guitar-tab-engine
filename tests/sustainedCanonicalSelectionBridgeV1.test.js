'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_VERSION,
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_DOCUMENT_TYPE,
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_AUTHORITY,
  SUSTAINED_CANONICAL_SELECTION_BRIDGE_TARGET_POLICY,
  createSustainedCanonicalSelectionBridgeProjection,
} = require('../src/music/sustainedCanonicalSelectionBridgeV1');
const {
  createSustainedCanonicalFinalSelection,
} = require('../src/music/sustainedCanonicalFinalSelector');
const {
  SUSTAINED_POSITION_POINT_STATUS,
  createSustainedGuitarPositionStateModel,
} = require('../src/music/sustainedGuitarPositionStateModel');
const {
  createCanonicalTabResultV2,
} = require('../src/tab/canonicalTabResultV2');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>E1 bridge</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, duration = 16, voice = '1' } = {}) {
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>whole</type><staff>1</staff></note>`;
}

function tiedScore() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>E1 bridge tie</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>16</duration>
        <tie type="start"/><voice>1</voice><type>whole</type><staff>1</staff>
        <notations><tied type="start"/></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>16</duration>
        <tie type="stop"/><voice>1</voice><type>whole</type><staff>1</staff>
        <notations><tied type="stop"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(xml, {}, runtime),
    runtime,
  );
}

function eventId(measureIndex = 0, noteIndex = 0) {
  return `P1:measure:${measureIndex}:note:${noteIndex}`;
}

function singleDecision(decisionType, measureIndex = 0, noteIndex = 0) {
  return {
    decisionType,
    sourceEventIds: [eventId(measureIndex, noteIndex)],
    sourceGroupId: null,
  };
}

test('E1 bridge exposes a versioned internal reduction-to-sustained projection contract', () => {
  const projection = createSustainedCanonicalSelectionBridgeProjection(
    sourceModel(score(note('C'))),
    [singleDecision('PRESERVED')],
  );

  assert.equal(SUSTAINED_CANONICAL_SELECTION_BRIDGE_VERSION, '1.0.0');
  assert.equal(
    SUSTAINED_CANONICAL_SELECTION_BRIDGE_DOCUMENT_TYPE,
    'SustainedCanonicalSelectionBridgeProjection',
  );
  assert.equal(
    SUSTAINED_CANONICAL_SELECTION_BRIDGE_AUTHORITY,
    'REDUCTION_PROJECTION_FACTS_ONLY',
  );
  assert.equal(
    SUSTAINED_CANONICAL_SELECTION_BRIDGE_TARGET_POLICY,
    'PA6_TARGET_MIDI_AS_SUSTAINED_SELECTION_INPUT_1.0',
  );
  assert.equal(projection.authority, SUSTAINED_CANONICAL_SELECTION_BRIDGE_AUTHORITY);
  assert.deepEqual(projection.retainedSourceEventIds, [eventId()]);
  assert.deepEqual(projection.omittedSourceEventIds, []);
  assert.deepEqual(projection.instructions[0], {
    sourceEventId: eventId(),
    decisionId: 'P1:arrangement-decision:0',
    decisionType: 'PRESERVED',
    sourceGroupId: null,
    sourceMidi: 60,
    disposition: 'KEEP',
    targetMidi: 60,
    octaveShiftSemitones: 0,
    ruleId: 'PRESERVE_IN_REGISTER',
    sustainChainId: null,
  });
});

test('E1 bridge excludes OMIT instructions from the sustained-selection eligibility set', () => {
  const projection = createSustainedCanonicalSelectionBridgeProjection(
    sourceModel(score(note('C'))),
    [singleDecision('OMITTED')],
  );

  assert.deepEqual(projection.retainedSourceEventIds, []);
  assert.deepEqual(projection.omittedSourceEventIds, [eventId()]);
  assert.equal(projection.instructions[0].disposition, 'OMIT');
  assert.equal(projection.instructions[0].targetMidi, null);
  assert.equal(projection.instructions[0].octaveShiftSemitones, null);
});

test('E1 bridge preserves PA-6 octave displacement target MIDI without recomputing it', () => {
  const projection = createSustainedCanonicalSelectionBridgeProjection(
    sourceModel(score(note('C', { octave: 7 }))),
    [singleDecision('OCTAVE_DISPLACED')],
  );

  assert.equal(projection.instructions[0].sourceMidi, 96);
  assert.equal(projection.instructions[0].targetMidi, 84);
  assert.equal(projection.instructions[0].octaveShiftSemitones, -12);
  assert.equal(projection.instructions[0].ruleId, 'OCTAVE_NEAREST_IN_REGISTER');
});

test('E1 bridge keeps tied reduction facts chain-consistent and fails closed on mixed dispositions', () => {
  const source = sourceModel(tiedScore());
  const preserved = createSustainedCanonicalSelectionBridgeProjection(source, [
    singleDecision('PRESERVED', 0, 0),
    singleDecision('PRESERVED', 1, 0),
  ]);

  assert.equal(preserved.instructions.length, 2);
  assert.ok(preserved.instructions[0].sustainChainId);
  assert.equal(
    preserved.instructions[0].sustainChainId,
    preserved.instructions[1].sustainChainId,
  );
  assert.equal(preserved.instructions[0].targetMidi, preserved.instructions[1].targetMidi);

  assert.throws(
    () => createSustainedCanonicalSelectionBridgeProjection(source, [
      singleDecision('PRESERVED', 0, 0),
      singleDecision('OMITTED', 1, 0),
    ]),
    (error) => error
      && error.code === 'UNSUPPORTED_SUSTAINED_CANONICAL_SELECTION_BRIDGE'
      && error.details.reason === 'INCONSISTENT_TIE_REDUCTION',
  );
});

test('sustained final selector threads one capo configuration across a retained tie chain', () => {
  const source = sourceModel(tiedScore());
  const decisions = [
    singleDecision('PRESERVED', 0, 0),
    singleDecision('PRESERVED', 1, 0),
  ];
  const baseline = createSustainedCanonicalFinalSelection(source, decisions);
  const capo = createSustainedCanonicalFinalSelection(
    source,
    decisions,
    null,
    { capoFret: 2 },
  );

  assert.deepEqual(
    baseline.noteSelections.map(({ string, fret }) => ({ string, fret })),
    [{ string: 2, fret: 1 }, { string: 2, fret: 1 }],
  );
  assert.deepEqual(
    capo.noteSelections.map(({ string, fret }) => ({ string, fret })),
    [{ string: 3, fret: 3 }, { string: 3, fret: 3 }],
  );
});

test('canonical 2.1 producer preserves capo through the sustained tie fallback', () => {
  const source = sourceModel(tiedScore());
  const result = createCanonicalTabResultV2(
    source,
    [
      singleDecision('PRESERVED', 0, 0),
      singleDecision('PRESERVED', 1, 0),
    ],
    null,
    { capoFret: 2 },
  );

  assert.equal(result.schemaVersion, '2.1.0');
  assert.equal(result.guitar.capoFret, 2);
  assert.deepEqual(
    result.noteDispositions.map(({ selectedPosition }) => selectedPosition),
    [{ string: 3, fret: 3 }, { string: 3, fret: 3 }],
  );
});

test('E1 bridge projection is deterministic, deeply immutable and remains internal', () => {
  const source = sourceModel(score(note('G', { octave: 3 })));
  const decisions = [singleDecision('PRESERVED')];
  const first = createSustainedCanonicalSelectionBridgeProjection(source, decisions);
  const second = createSustainedCanonicalSelectionBridgeProjection(source, decisions);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.instructions), true);
  assert.equal(Object.isFrozen(first.instructions[0]), true);
  assert.equal(Object.isFrozen(first.retainedSourceEventIds), true);
  assert.equal(Object.isFrozen(first.omittedSourceEventIds), true);
  assert.equal(publicApi.createSustainedCanonicalSelectionBridgeProjection, undefined);
  assert.equal(publicApi.SUSTAINED_CANONICAL_SELECTION_BRIDGE_VERSION, undefined);
});

test('sustained final selector solves retained tied octave displacement at the PA-6 target pitch', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Low tied target</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      <note><pitch><step>G</step><octave>1</octave></pitch><duration>16</duration><tie type="start"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>1</octave></pitch><duration>16</duration><tie type="stop"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
  const source = sourceModel(xml);
  const decisions = [
    singleDecision('OCTAVE_DISPLACED', 0, 0),
    singleDecision('OCTAVE_DISPLACED', 1, 0),
  ];
  const projection = createSustainedCanonicalSelectionBridgeProjection(source, decisions);
  assert.deepEqual(projection.instructions.map(({ sourceMidi, targetMidi, octaveShiftSemitones }) => ({ sourceMidi, targetMidi, octaveShiftSemitones })), [
    { sourceMidi: 31, targetMidi: 43, octaveShiftSemitones: 12 },
    { sourceMidi: 31, targetMidi: 43, octaveShiftSemitones: 12 },
  ]);

  const selection = createSustainedCanonicalFinalSelection(source, decisions);
  assert.deepEqual(selection.noteSelections.map(({ string, fret }) => ({ string, fret })), [
    { string: 6, fret: 3 },
    { string: 6, fret: 3 },
  ]);

  const canonical = createCanonicalTabResultV2(source, decisions);
  assert.deepEqual(canonical.noteDispositions.map(({ targetPitch, selectedPosition }) => ({ targetPitch, selectedPosition })), [
    { targetPitch: { step: 'G', alter: 0, octave: 2, midi: 43, written: 'G2' }, selectedPosition: { string: 6, fret: 3 } },
    { targetPitch: { step: 'G', alter: 0, octave: 2, midi: 43, written: 'G2' }, selectedPosition: { string: 6, fret: 3 } },
  ]);
});

test('sustained target projection remains fail-closed when any source note is omitted', () => {
  const source = sourceModel(score(note('C')));
  assert.throws(
    () => createSustainedCanonicalFinalSelection(source, [singleDecision('OMITTED')]),
    (error) => error
      && error.code === 'UNSUPPORTED_SUSTAINED_CANONICAL_FINAL_SELECTION'
      && error.details.reason === 'OMITTED_SOURCE_NOTE_NOT_SUPPORTED',
  );
});


test('target MIDI injection preserves distinct source tie identities when octave targets collide', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Target unison ties</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      <note><pitch><step>B</step><octave>1</octave></pitch><duration>16</duration><tie type="start"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="start"/></notations></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>B</step><octave>2</octave></pitch><duration>16</duration><tie type="start"/><voice>2</voice><type>whole</type><staff>1</staff><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>B</step><octave>1</octave></pitch><duration>16</duration><tie type="stop"/><voice>1</voice><type>whole</type><staff>1</staff><notations><tied type="stop"/></notations></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>B</step><octave>2</octave></pitch><duration>16</duration><tie type="stop"/><voice>2</voice><type>whole</type><staff>1</staff><notations><tied type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
  const source = sourceModel(xml);
  const targets = Object.create(null);
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') {
        Object.defineProperty(targets, event.sourceEventId, {
          value: 47,
          enumerable: true,
          writable: false,
          configurable: false,
        });
      }
    }
  }
  Object.freeze(targets);

  const model = createSustainedGuitarPositionStateModel(source, null, {}, targets);
  assert.equal(model.measures[0].points[0].status, SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE);
  assert.equal(model.measures[1].points[0].status, SUSTAINED_POSITION_POINT_STATUS.CANDIDATES_AVAILABLE);
  assert.ok(model.measures[0].points[0].candidates.length > 0);
  assert.ok(model.measures[1].points[0].candidates.length > 0);
  assert.ok(model.measures[0].points[0].candidates.every((candidate) => (
    candidate.positions.length === 2
    && candidate.positions.every((position) => position.targetMidi === 47)
  )));
});
