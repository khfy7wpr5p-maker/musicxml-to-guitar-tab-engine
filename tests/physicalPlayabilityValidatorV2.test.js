'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createLeftHandShapeModel } = require('../src/music/leftHandShapeModel');
const {
  PHYSICAL_PLAYABILITY_VALIDATION_VERSION,
  PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE,
  PHYSICAL_PLAYABILITY_POLICY,
  PLAYABILITY_STATUS,
  PLAYABILITY_REJECTION_REASONS,
  MAXIMUM_STATIC_FRET_SPAN,
  MAXIMUM_EXTRA_FRET_REACH,
  MAX_PHYSICAL_PLAYABILITY_VALIDATIONS,
  validatePhysicalPlayabilityV2,
} = require('../src/music/physicalPlayabilityValidatorV2');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-9</part-name></score-part></part-list>
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

function preserveAll(count) {
  return Array.from({ length: count }, (_, index) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [eventId(index)],
    sourceGroupId: null,
  }));
}

function positionKey(position) {
  return `${position.string}:${position.fret}`;
}

function findVoicing(model, expectedPositions) {
  const expected = expectedPositions.map(positionKey).join('|');
  for (const group of model.groups) {
    for (const voicing of group.voicingCandidates) {
      if (voicing.positions.map(positionKey).join('|') === expected) {
        return { group, voicing };
      }
    }
  }
  return null;
}

function findShape(voicing, expectedFingers) {
  return voicing.shapeCandidates.find((shape) => (
    shape.fingerAssignments.map((assignment) => assignment.finger).join(',')
      === expectedFingers.join(',')
  ));
}

function findValidationVoicing(validation, sourceGroupId, voicingCandidateId) {
  const group = validation.groups.find((entry) => entry.sourceGroupId === sourceGroupId);
  if (!group) {
    return null;
  }
  return group.voicingCandidates.find((entry) => entry.voicingCandidateId === voicingCandidateId) || null;
}

function findVerdict(validation, sourceGroupId, voicingCandidateId, shapeCandidateId) {
  const voicing = findValidationVoicing(validation, sourceGroupId, voicingCandidateId);
  if (!voicing) {
    return null;
  }
  return voicing.shapeVerdicts.find((entry) => entry.shapeCandidateId === shapeCandidateId) || null;
}

test('PA-9 fixes the internal physical-playability v2 identity and accepts an all-open static shape', () => {
  const source = sourceModel(score([
    note('E', { octave: 2 }),
    note('A', { octave: 2, chord: true }),
  ].join('')));
  const decisions = preserveAll(2);
  const validation = validatePhysicalPlayabilityV2(source, decisions);

  assert.equal(PHYSICAL_PLAYABILITY_VALIDATION_VERSION, '2.0.0');
  assert.equal(PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE, 'PhysicalPlayabilityValidation');
  assert.equal(PHYSICAL_PLAYABILITY_POLICY, 'CONSERVATIVE_STATIC_LEFT_HAND_2.0');
  assert.deepEqual(PLAYABILITY_STATUS, {
    PLAYABLE_WITHIN_POLICY: 'PLAYABLE_WITHIN_POLICY',
    REJECTED: 'REJECTED',
  });
  assert.deepEqual(PLAYABILITY_REJECTION_REASONS, {
    FRET_SPAN_EXCEEDED: 'FRET_SPAN_EXCEEDED',
    FINGER_REACH_EXCEEDED: 'FINGER_REACH_EXCEEDED',
  });
  assert.equal(MAXIMUM_STATIC_FRET_SPAN, 4);
  assert.equal(MAXIMUM_EXTRA_FRET_REACH, 1);
  assert.equal(MAX_PHYSICAL_PLAYABILITY_VALIDATIONS, 20_000);
  assert.deepEqual(validation.configuration, {
    maximumStaticFretSpan: 4,
    maximumExtraFretReach: 1,
  });

  const leftHand = createLeftHandShapeModel(source, decisions);
  const match = findVoicing(leftHand, [{ string: 6, fret: 0 }, { string: 5, fret: 0 }]);
  assert.ok(match);
  assert.equal(match.voicing.shapeCandidateCount, 1);
  const verdict = findVerdict(
    validation,
    match.group.sourceGroupId,
    match.voicing.voicingCandidateId,
    match.voicing.shapeCandidates[0].shapeCandidateId,
  );
  assert.ok(verdict);
  assert.equal(verdict.status, 'PLAYABLE_WITHIN_POLICY');
  assert.deepEqual(verdict.reasonCodes, []);
});

test('PA-9 accepts the exact static fret-span and finger-reach boundary', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('D', { octave: 3, chord: true }),
  ].join('')));
  const decisions = preserveAll(2);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const match = findVoicing(leftHand, [{ string: 6, fret: 1 }, { string: 5, fret: 5 }]);
  assert.ok(match);
  const shape = findShape(match.voicing, [1, 4]);
  assert.ok(shape);
  assert.equal(shape.fretSpan, 4);

  const validation = validatePhysicalPlayabilityV2(source, decisions);
  const verdict = findVerdict(
    validation,
    match.group.sourceGroupId,
    match.voicing.voicingCandidateId,
    shape.shapeCandidateId,
  );
  assert.ok(verdict);
  assert.equal(verdict.status, 'PLAYABLE_WITHIN_POLICY');
  assert.deepEqual(verdict.reasonCodes, []);
});

test('PA-9 rejects an otherwise structural PA-8 shape when pairwise finger reach exceeds policy', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('D', { octave: 3, chord: true }),
  ].join('')));
  const decisions = preserveAll(2);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const match = findVoicing(leftHand, [{ string: 6, fret: 1 }, { string: 5, fret: 5 }]);
  assert.ok(match);
  const shape = findShape(match.voicing, [1, 2]);
  assert.ok(shape);

  const validation = validatePhysicalPlayabilityV2(source, decisions);
  const verdict = findVerdict(
    validation,
    match.group.sourceGroupId,
    match.voicing.voicingCandidateId,
    shape.shapeCandidateId,
  );
  assert.ok(verdict);
  assert.equal(verdict.status, 'REJECTED');
  assert.deepEqual(verdict.reasonCodes, ['FINGER_REACH_EXCEEDED']);
});

test('PA-9 emits deterministic multi-reason rejection ordering for over-span and over-reach shapes', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('D', { octave: 3, alter: 1, chord: true }),
  ].join('')));
  const decisions = preserveAll(2);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const match = findVoicing(leftHand, [{ string: 6, fret: 1 }, { string: 5, fret: 6 }]);
  assert.ok(match);
  const shape = findShape(match.voicing, [1, 4]);
  assert.ok(shape);
  assert.equal(shape.fretSpan, 5);

  const validation = validatePhysicalPlayabilityV2(source, decisions);
  const verdict = findVerdict(
    validation,
    match.group.sourceGroupId,
    match.voicing.voicingCandidateId,
    shape.shapeCandidateId,
  );
  assert.ok(verdict);
  assert.equal(verdict.status, 'REJECTED');
  assert.deepEqual(verdict.reasonCodes, [
    'FRET_SPAN_EXCEEDED',
    'FINGER_REACH_EXCEEDED',
  ]);
});

test('PA-9 preserves exact PA-8 group, voicing and shape candidate order without ranking', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('C', { octave: 3, chord: true }),
  ].join('')));
  const decisions = preserveAll(2);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const validation = validatePhysicalPlayabilityV2(source, decisions);

  assert.deepEqual(
    validation.groups.map((group) => group.sourceGroupId),
    leftHand.groups.map((group) => group.sourceGroupId),
  );
  for (let groupIndex = 0; groupIndex < leftHand.groups.length; groupIndex += 1) {
    const leftGroup = leftHand.groups[groupIndex];
    const validationGroup = validation.groups[groupIndex];
    assert.deepEqual(
      validationGroup.voicingCandidates.map((voicing) => voicing.voicingCandidateId),
      leftGroup.voicingCandidates.map((voicing) => voicing.voicingCandidateId),
    );
    for (let voicingIndex = 0; voicingIndex < leftGroup.voicingCandidates.length; voicingIndex += 1) {
      assert.deepEqual(
        validationGroup.voicingCandidates[voicingIndex].shapeVerdicts.map((verdict) => verdict.shapeCandidateId),
        leftGroup.voicingCandidates[voicingIndex].shapeCandidates.map((shape) => shape.shapeCandidateId),
      );
    }
  }

  const serialized = JSON.stringify(validation);
  assert.equal(serialized.includes('rank'), false);
  assert.equal(serialized.includes('score'), false);
  assert.equal(serialized.includes('selected'), false);
});

test('PA-9 preserves an upstream zero-shape voicing as zero accepted and zero rejected shapes', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('B', { octave: 2, chord: true }),
    note('F', { octave: 3, chord: true }),
    note('B', { octave: 3, chord: true }),
    note('E', { octave: 4, chord: true }),
  ].join('')));
  const decisions = preserveAll(5);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const match = findVoicing(leftHand, [
    { string: 6, fret: 1 },
    { string: 5, fret: 2 },
    { string: 4, fret: 3 },
    { string: 3, fret: 4 },
    { string: 2, fret: 5 },
  ]);
  assert.ok(match);
  assert.equal(match.voicing.shapeCandidateCount, 0);

  const validation = validatePhysicalPlayabilityV2(source, decisions);
  const voicing = findValidationVoicing(
    validation,
    match.group.sourceGroupId,
    match.voicing.voicingCandidateId,
  );
  assert.ok(voicing);
  assert.equal(voicing.shapeCandidateCount, 0);
  assert.equal(voicing.playableShapeCount, 0);
  assert.equal(voicing.rejectedShapeCount, 0);
  assert.deepEqual(voicing.shapeVerdicts, []);
});

test('PA-9 output is deeply immutable', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('C', { octave: 3, chord: true }),
  ].join('')));
  const validation = validatePhysicalPlayabilityV2(source, preserveAll(2));
  const group = validation.groups[0];
  const voicing = group.voicingCandidates[0];
  const verdict = voicing.shapeVerdicts[0];

  assert.equal(Object.isFrozen(validation), true);
  assert.equal(Object.isFrozen(validation.configuration), true);
  assert.equal(Object.isFrozen(validation.groups), true);
  assert.equal(Object.isFrozen(group), true);
  assert.equal(Object.isFrozen(group.voicingCandidates), true);
  assert.equal(Object.isFrozen(voicing), true);
  assert.equal(Object.isFrozen(voicing.shapeVerdicts), true);
  assert.equal(Object.isFrozen(verdict), true);
  assert.equal(Object.isFrozen(verdict.reasonCodes), true);
  assert.throws(() => {
    verdict.status = 'REJECTED';
  }, TypeError);
});

test('PA-9 remains internal and does not expand the package-root public API', () => {
  const publicApi = require('../src');
  assert.equal('validatePhysicalPlayabilityV2' in publicApi, false);
  assert.equal('PHYSICAL_PLAYABILITY_VALIDATION_VERSION' in publicApi, false);
});
