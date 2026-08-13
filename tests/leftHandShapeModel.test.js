'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  LEFT_HAND_SHAPE_MODEL_VERSION,
  LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
  LEFT_HAND_SHAPE_POLICY,
  MAX_LEFT_HAND_SHAPE_CANDIDATES,
  MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS,
  createLeftHandShapeModel,
} = require('../src/music/leftHandShapeModel');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-8</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, chord = false, voice = '1', staff = 1, alter = null } = {}) {
  const alterXml = alter === null ? '' : `<alter>${alter}</alter>`;
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function eventId(index) {
  return `P1:measure:0:note:${index}`;
}

function preserveDecision(index) {
  return {
    decisionType: 'PRESERVED',
    sourceEventIds: [eventId(index)],
    sourceGroupId: null,
  };
}

function preserveAll(count) {
  return Array.from({ length: count }, (_, index) => preserveDecision(index));
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

test('PA-8 fixes the internal left-hand shape contract and open-string finger semantics', () => {
  const source = sourceModel(score([
    note('E', { octave: 2 }),
    note('A', { octave: 2, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAll(2));

  assert.equal(LEFT_HAND_SHAPE_MODEL_VERSION, '1.0.0');
  assert.equal(LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE, 'LeftHandShapeModel');
  assert.equal(LEFT_HAND_SHAPE_POLICY, 'ORDERED_FRET_FINGER_BARRE_1.0');
  assert.equal(MAX_LEFT_HAND_SHAPE_CANDIDATES, 20_000);
  assert.equal(MAX_LEFT_HAND_ASSIGNMENT_ATTEMPTS, 100_000);
  assert.deepEqual(model.configuration, {
    frettingFingerMinimum: 1,
    frettingFingerMaximum: 4,
    openStringFinger: 0,
  });

  const voicing = findVoicing(model, [{ string: 6, fret: 0 }, { string: 5, fret: 0 }]);
  assert.ok(voicing);
  assert.equal(voicing.shapeCandidateCount, 1);
  assert.deepEqual(voicing.shapeCandidates[0].fingerAssignments.map((entry) => entry.finger), [0, 0]);
  assert.equal(voicing.shapeCandidates[0].usedFingerCount, 0);
  assert.equal(voicing.shapeCandidates[0].barreCount, 0);
  assert.equal(voicing.shapeCandidates[0].minimumFrettedFret, null);
  assert.equal(voicing.shapeCandidates[0].maximumFrettedFret, null);
  assert.equal(voicing.shapeCandidates[0].fretSpan, 0);
});

test('PA-8 deterministically enforces strictly ordered fingers across different frets', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('C', { octave: 3, chord: true }),
  ].join('')));
  const first = createLeftHandShapeModel(source, preserveAll(2));
  const second = createLeftHandShapeModel(source, preserveAll(2));
  assert.deepEqual(first, second);

  const voicing = findVoicing(first, [{ string: 6, fret: 1 }, { string: 5, fret: 3 }]);
  assert.ok(voicing);
  assert.ok(voicing.shapeCandidateCount > 0);
  for (const shape of voicing.shapeCandidates) {
    const [lowFret, highFret] = shape.fingerAssignments;
    assert.ok(lowFret.finger < highFret.finger);
  }
});

test('PA-8 records a partial barre when one finger covers multiple strings at the same fret', () => {
  const source = sourceModel(score([
    note('A', { octave: 2, alter: 1 }),
    note('D', { octave: 3, alter: 1, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAll(2));
  const voicing = findVoicing(model, [{ string: 5, fret: 1 }, { string: 4, fret: 1 }]);
  assert.ok(voicing);

  const shape = voicing.shapeCandidates.find((candidate) => candidate.barres.some((barre) => (
    barre.kind === 'PARTIAL_BARRE'
      && barre.fret === 1
      && barre.startString === 4
      && barre.endString === 5
  )));
  assert.ok(shape);
});

test('PA-8 records a full barre when one finger spans string 1 through string 6', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('F', { octave: 4, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAll(2));
  const voicing = findVoicing(model, [{ string: 6, fret: 1 }, { string: 1, fret: 1 }]);
  assert.ok(voicing);

  const shape = voicing.shapeCandidates.find((candidate) => candidate.barres.some((barre) => (
    barre.kind === 'FULL_BARRE'
      && barre.fret === 1
      && barre.startString === 1
      && barre.endString === 6
      && barre.stringSpan === 6
  )));
  assert.ok(shape);
});

test('PA-8 rejects barre assignments that would fret an active open string inside the span', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('A', { octave: 2, chord: true }),
    note('D', { octave: 3, alter: 1, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAll(3));
  const voicing = findVoicing(model, [
    { string: 6, fret: 1 },
    { string: 5, fret: 0 },
    { string: 4, fret: 1 },
  ]);
  assert.ok(voicing);
  assert.ok(voicing.shapeCandidateCount > 0);
  for (const shape of voicing.shapeCandidates) {
    assert.equal(shape.barres.some((barre) => barre.fret === 1 && barre.startString <= 5 && barre.endString >= 5), false);
  }
});

test('PA-8 preserves exact PA-7 position facts and source provenance', () => {
  const source = sourceModel(score([
    note('C', { octave: 4 }),
    note('E', { octave: 4, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAll(2));
  const voicing = findVoicing(model, [{ string: 2, fret: 1 }, { string: 1, fret: 0 }]);
  assert.ok(voicing);
  assert.deepEqual(voicing.positions, [
    { sourceEventId: eventId(0), targetMidi: 60, string: 2, fret: 1 },
    { sourceEventId: eventId(1), targetMidi: 64, string: 1, fret: 0 },
  ]);
  for (const shape of voicing.shapeCandidates) {
    assert.deepEqual(
      shape.fingerAssignments.map(({ sourceEventId, targetMidi, string, fret }) => ({ sourceEventId, targetMidi, string, fret })),
      voicing.positions,
    );
  }
});

test('PA-8 output is deeply immutable', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('C', { octave: 3, chord: true }),
  ].join('')));
  const model = createLeftHandShapeModel(source, preserveAll(2));
  const voicing = findVoicing(model, [{ string: 6, fret: 1 }, { string: 5, fret: 3 }]);
  assert.ok(voicing);
  const shape = voicing.shapeCandidates[0];

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.groups), true);
  assert.equal(Object.isFrozen(voicing), true);
  assert.equal(Object.isFrozen(voicing.positions), true);
  assert.equal(Object.isFrozen(voicing.shapeCandidates), true);
  assert.equal(Object.isFrozen(shape), true);
  assert.equal(Object.isFrozen(shape.fingerAssignments), true);
  assert.equal(Object.isFrozen(shape.fingerAssignments[0]), true);
  assert.equal(Object.isFrozen(shape.barres), true);
  assert.throws(() => {
    shape.fingerAssignments[0].finger = 4;
  }, TypeError);
});

test('PA-8 remains internal and does not expand the package-root public API', () => {
  const publicApi = require('../src');
  assert.equal('createLeftHandShapeModel' in publicApi, false);
  assert.equal('LEFT_HAND_SHAPE_MODEL_VERSION' in publicApi, false);
});
