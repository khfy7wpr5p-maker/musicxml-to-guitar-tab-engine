'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createLeftHandShapeModel } = require('../src/music/leftHandShapeModel');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-8 hardening</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, {
  octave = 4,
  chord = false,
  voice = '1',
  staff = 1,
  alter = null,
  duration = 4,
  type = 'quarter',
} = {}) {
  const alterXml = alter === null ? '' : `<alter>${alter}</alter>`;
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`;
}

function multiMeasureScore(measureCount, firstNote, chordNote) {
  const measures = [];
  for (let index = 0; index < measureCount; index += 1) {
    measures.push(`<measure number="${index + 1}">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
      ${firstNote}
      ${chordNote}
    </measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-8 limit</part-name></score-part></part-list>
  <part id="P1">${measures.join('')}</part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function preserveAllSourceNotes(source) {
  const decisions = [];
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') {
        continue;
      }
      decisions.push({
        decisionType: 'PRESERVED',
        sourceEventIds: [event.sourceEventId],
        sourceGroupId: null,
      });
    }
  }
  return decisions;
}

function positionKey(position) {
  return `${position.string}:${position.fret}`;
}

function findVoicing(model, expectedPositions) {
  const expected = expectedPositions.map(positionKey).join('|');
  for (const group of model.groups) {
    for (const voicing of group.voicingCandidates) {
      if (voicing.positions.map(positionKey).join('|') === expected) {
        return voicing;
      }
    }
  }
  return null;
}

test('PA-8 revalidates hostile upstream source and decisions fail closed without getter execution', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));
  const decisions = preserveAllSourceNotes(source);

  assert.throws(
    () => createLeftHandShapeModel(new Proxy(source, {}), decisions),
    (error) => error && error.code === 'INVALID_POLYPHONIC_SOURCE_MODEL',
  );

  let getterCalls = 0;
  const hostileDecision = {};
  Object.defineProperty(hostileDecision, 'decisionType', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'PRESERVED';
    },
  });
  Object.defineProperty(hostileDecision, 'sourceEventIds', {
    enumerable: true,
    value: [source.measures[0].events[0].sourceEventId],
  });
  Object.defineProperty(hostileDecision, 'sourceGroupId', {
    enumerable: true,
    value: null,
  });

  assert.throws(
    () => createLeftHandShapeModel(source, [hostileDecision, decisions[1]]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
  assert.equal(getterCalls, 0);
});

test('PA-8 emits zero shapes rather than mutating or dropping a five-distinct-fret voicing', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('C', { octave: 3, chord: true }),
    note('G', { octave: 3, chord: true }),
    note('D', { octave: 4, chord: true }),
    note('G', { octave: 4, alter: 1, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAllSourceNotes(source));
  const voicing = findVoicing(model, [
    { string: 6, fret: 1 },
    { string: 5, fret: 3 },
    { string: 4, fret: 5 },
    { string: 3, fret: 7 },
    { string: 2, fret: 9 },
  ]);

  assert.ok(voicing);
  assert.equal(voicing.shapeCandidateCount, 0);
  assert.deepEqual(voicing.positions.map((position) => position.fret), [1, 3, 5, 7, 9]);
});

test('PA-8 fails closed at the aggregate complete-assignment attempt ceiling', () => {
  const source = sourceModel(score([
    note('C', { octave: 4 }),
    note('D', { octave: 4, chord: true }),
    note('E', { octave: 4, chord: true }),
    note('F', { octave: 4, chord: true }),
    note('G', { octave: 4, chord: true }),
    note('A', { octave: 4, chord: true }),
  ].join('')));

  assert.throws(
    () => createLeftHandShapeModel(source, preserveAllSourceNotes(source)),
    (error) => (
      error
      && error.code === 'LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED'
      && error.details.limit === 100_000
      && error.details.observed === 100_001
    ),
  );
});

test('PA-8 fails closed at the aggregate shape-candidate ceiling before assignment attempts are exhausted', () => {
  const xml = multiMeasureScore(
    121,
    note('C', { octave: 4, duration: 16, type: 'whole' }),
    note('F', { octave: 4, chord: true, duration: 16, type: 'whole' }),
  );
  const source = sourceModel(xml);

  assert.throws(
    () => createLeftHandShapeModel(source, preserveAllSourceNotes(source)),
    (error) => (
      error
      && error.code === 'LEFT_HAND_SHAPE_CANDIDATE_LIMIT_EXCEEDED'
      && error.details.limit === 20_000
      && error.details.observed === 20_001
    ),
  );
});

test('PA-8 remains deadline-bounded and cancellation-aware through the recomputed pipeline', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));
  const decisions = preserveAllSourceNotes(source);

  let now = 0;
  const deadlineRuntime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 1 },
    { clock: () => { now += 1; return now; } },
  );
  assert.throws(
    () => createLeftHandShapeModel(source, decisions, deadlineRuntime),
    (error) => error && error.code === 'PROCESSING_DEADLINE_EXCEEDED',
  );

  const controller = new AbortController();
  controller.abort();
  const cancelledRuntime = createMusicXmlProcessingRuntime({ signal: controller.signal });
  assert.throws(
    () => createLeftHandShapeModel(source, decisions, cancelledRuntime),
    (error) => error && error.code === 'PROCESSING_ABORTED',
  );
});

test('PA-8 shape records do not acquire PA-9 ergonomic/playability or final-selection authority', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('C', { octave: 3, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAllSourceNotes(source));
  const voicing = findVoicing(model, [{ string: 6, fret: 1 }, { string: 5, fret: 3 }]);
  assert.ok(voicing);
  assert.ok(voicing.shapeCandidateCount > 0);

  for (const forbidden of [
    'selected', 'rank', 'score', 'cost', 'preference', 'playable', 'approved',
    'ergonomic', 'difficulty', 'handPosition', 'transitionCost', 'wristPosition',
    'reach', 'comfort', 'physicalPlayability',
  ]) {
    assert.equal(forbidden in voicing, false);
    for (const shape of voicing.shapeCandidates) {
      assert.equal(forbidden in shape, false);
      for (const assignment of shape.fingerAssignments) {
        assert.equal(forbidden in assignment, false);
      }
      for (const barre of shape.barres) {
        assert.equal(forbidden in barre, false);
      }
    }
  }
});
