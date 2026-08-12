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
const {
  GUITAR_ARRANGEMENT_PLAN_VERSION,
  GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
  ARRANGEMENT_DECISION_TYPES,
  createGuitarArrangementPlan,
} = require('../src/music/guitarArrangementPlan');

function score(measureBody, { staves = 2 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-4</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>${staves}</staves>
      </attributes>
      ${measureBody}
    </measure>
  </part>
</score-partwise>`;
}

function note(step, {
  chord = false,
  duration = 4,
  voice = '1',
  staff = 1,
  rest = false,
} = {}) {
  return `<note>${chord ? '<chord/>' : ''}${rest ? '<rest/>' : `<pitch><step>${step}</step><octave>4</octave></pitch>`}<duration>${duration}</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function eventId(index) {
  return `P1:measure:0:note:${index}`;
}

function plan(xml, decisions, runtime = null) {
  return createGuitarArrangementPlan(sourceModel(xml), decisions, runtime);
}

test('PA-4 exposes a versioned internal GuitarArrangementPlan contract and fixed decision vocabulary', () => {
  const model = plan(score(note('C')), [{
    decisionType: 'PRESERVED',
    sourceEventIds: [eventId(0)],
    sourceGroupId: null,
  }]);

  assert.equal(GUITAR_ARRANGEMENT_PLAN_VERSION, '1.0.0');
  assert.equal(GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE, 'GuitarArrangementPlan');
  assert.deepEqual(ARRANGEMENT_DECISION_TYPES, [
    'PRESERVED',
    'OMITTED',
    'OCTAVE_DISPLACED',
    'VOICE_REDISTRIBUTED',
    'CHORD_REDUCED',
    'REVOICED',
    'ARPEGGIATED',
  ]);
  assert.equal(model.documentType, 'GuitarArrangementPlan');
  assert.equal(model.contractVersion, '1.0.0');
  assert.deepEqual(model.source, {
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    partId: 'P1',
  });
  assert.deepEqual(model.grouping, {
    documentType: 'SimultaneousEventModel',
    contractVersion: '1.0.0',
  });
});

test('PA-4 records single-note decisions with deterministic source-bound provenance', () => {
  const model = plan(score([
    note('C'),
    note('D'),
  ].join('')), [
    { decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null },
    { decisionType: 'OMITTED', sourceEventIds: [eventId(1)], sourceGroupId: null },
  ]);

  assert.deepEqual(model.decisions, [
    {
      decisionId: 'P1:arrangement-decision:0',
      decisionType: 'PRESERVED',
      sourceEventIds: [eventId(0)],
      sourceGroupId: null,
    },
    {
      decisionId: 'P1:arrangement-decision:1',
      decisionType: 'OMITTED',
      sourceEventIds: [eventId(1)],
      sourceGroupId: null,
    },
  ]);
});

test('PA-4 binds a chord-level decision to exact PA-3 simultaneous-group membership', () => {
  const model = plan(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')), [{
    decisionType: 'CHORD_REDUCED',
    sourceEventIds: [eventId(0), eventId(1)],
    sourceGroupId: 'P1:measure:0:simultaneous:0',
  }]);

  assert.equal(model.decisionCount, 1);
  assert.deepEqual(model.decisions[0], {
    decisionId: 'P1:arrangement-decision:0',
    decisionType: 'CHORD_REDUCED',
    sourceEventIds: [eventId(0), eventId(1)],
    sourceGroupId: 'P1:measure:0:simultaneous:0',
  });
});

test('PA-4 accepts all single-note and simultaneous-group decision classes without adding executable transform details', () => {
  const xml = score([
    note('C'),
    note('D'),
    note('E'),
    note('F'),
    '<backup><duration>4</duration></backup>',
    note('A', { voice: '2' }),
    note('B', { voice: '2' }),
    note('C', { voice: '2' }),
  ].join(''));

  const model = plan(xml, [
    { decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null },
    { decisionType: 'OMITTED', sourceEventIds: [eventId(1)], sourceGroupId: null },
    { decisionType: 'OCTAVE_DISPLACED', sourceEventIds: [eventId(2)], sourceGroupId: null },
    { decisionType: 'VOICE_REDISTRIBUTED', sourceEventIds: [eventId(3)], sourceGroupId: null },
    { decisionType: 'CHORD_REDUCED', sourceEventIds: [eventId(4)], sourceGroupId: null },
    { decisionType: 'REVOICED', sourceEventIds: [eventId(5)], sourceGroupId: null },
    { decisionType: 'ARPEGGIATED', sourceEventIds: [eventId(6)], sourceGroupId: null },
  ]);

  assert.equal(model.decisionCount, 7);
  for (const entry of model.decisions) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      ['decisionId', 'decisionType', 'sourceEventIds', 'sourceGroupId'].sort(),
    );
  }
});

test('PA-4 rejects unknown decision types', () => {
  assert.throws(
    () => plan(score(note('C')), [{
      decisionType: 'AUTO_GUITAR_VOICING',
      sourceEventIds: [eventId(0)],
      sourceGroupId: null,
    }]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
});

test('PA-4 rejects incomplete, duplicate, overlapping and unknown source provenance', () => {
  const xml = score([note('C'), note('D')].join(''));

  assert.throws(
    () => plan(xml, [{ decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null }]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );

  assert.throws(
    () => plan(xml, [
      { decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null },
      { decisionType: 'OMITTED', sourceEventIds: [eventId(0)], sourceGroupId: null },
    ]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );

  assert.throws(
    () => plan(xml, [
      { decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null },
      { decisionType: 'OMITTED', sourceEventIds: ['P1:measure:0:note:999'], sourceGroupId: null },
    ]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
});

test('PA-4 rejects rest references and non-canonical decision/member ordering', () => {
  const withRest = score([
    note('C'),
    note('D', { rest: true }),
  ].join(''));
  assert.throws(
    () => plan(withRest, [
      { decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null },
      { decisionType: 'OMITTED', sourceEventIds: [eventId(1)], sourceGroupId: null },
    ]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );

  const twoNotes = score([note('C'), note('D')].join(''));
  assert.throws(
    () => plan(twoNotes, [
      { decisionType: 'OMITTED', sourceEventIds: [eventId(1)], sourceGroupId: null },
      { decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null },
    ]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
});

test('PA-4 requires simultaneous-group decisions to match one exact PA-3 group', () => {
  const simultaneous = score([
    note('C'),
    note('E', { chord: true }),
  ].join(''));

  assert.throws(
    () => plan(simultaneous, [{
      decisionType: 'REVOICED',
      sourceEventIds: [eventId(0), eventId(1)],
      sourceGroupId: 'wrong-group',
    }]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );

  assert.throws(
    () => plan(simultaneous, [
      { decisionType: 'PRESERVED', sourceEventIds: [eventId(0)], sourceGroupId: null },
      { decisionType: 'ARPEGGIATED', sourceEventIds: [eventId(1)], sourceGroupId: null },
    ]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
});

test('PA-4 rejects hostile decision object shapes without invoking accessors', () => {
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, 'decisionType', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'PRESERVED';
    },
  });
  Object.defineProperty(hostile, 'sourceEventIds', {
    enumerable: true,
    value: [eventId(0)],
  });
  Object.defineProperty(hostile, 'sourceGroupId', {
    enumerable: true,
    value: null,
  });

  assert.throws(
    () => plan(score(note('C')), [hostile]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
  assert.equal(getterCalls, 0);
});

test('PA-4 output is deeply immutable and contains no guitar fingering or executable transform authority', () => {
  const model = plan(score(note('C')), [{
    decisionType: 'OCTAVE_DISPLACED',
    sourceEventIds: [eventId(0)],
    sourceGroupId: null,
  }]);

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.source), true);
  assert.equal(Object.isFrozen(model.grouping), true);
  assert.equal(Object.isFrozen(model.decisions), true);
  assert.equal(Object.isFrozen(model.decisions[0]), true);
  assert.equal(Object.isFrozen(model.decisions[0].sourceEventIds), true);
  assert.equal('string' in model.decisions[0], false);
  assert.equal('fret' in model.decisions[0], false);
  assert.equal('finger' in model.decisions[0], false);
  assert.equal('targetPitch' in model.decisions[0], false);
  assert.equal('targetVoice' in model.decisions[0], false);
});
