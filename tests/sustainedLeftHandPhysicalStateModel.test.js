'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  createLeftHandShapeModel,
  enumerateStaticLeftHandShapeCandidatesFromPositions,
} = require('../src/music/leftHandShapeModel');
const {
  PLAYABILITY_STATUS,
  validatePhysicalPlayabilityV2,
  evaluateStaticLeftHandShapeCandidate,
} = require('../src/music/physicalPlayabilityValidatorV2');
const {
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION,
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE,
  SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_AUTHORITY,
  SUSTAINED_PHYSICAL_POINT_STATUS,
  createSustainedLeftHandPhysicalStateModel,
} = require('../src/music/sustainedLeftHandPhysicalStateModel');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function note(step, {
  octave = 4,
  duration = 16,
  voice = '1',
  chord = false,
  alter = null,
} = {}) {
  const alterXml = alter === null ? '' : `<alter>${alter}</alter>`;
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>1</staff></note>`;
}

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-4C</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function repeatedWholeNoteScore(measureCount) {
  const measures = [];
  for (let index = 0; index < measureCount; index += 1) {
    measures.push(`<measure number="${index + 1}">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
      ${note('C', { duration: 16 })}
      ${note('F', { chord: true, duration: 16 })}
    </measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-4C PA-8 grouping</part-name></score-part></part-list>
  <part id="P1">${measures.join('')}</part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(xml, {}, runtime),
    runtime,
  );
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

function physical(xml, runtime = null) {
  return createSustainedLeftHandPhysicalStateModel(sourceModel(xml), runtime);
}

test('PS-4C exposes an internal static-physical-candidates-only contract', () => {
  const model = physical(score(note('E', { octave: 2 })));

  assert.equal(SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_VERSION, '1.0.0');
  assert.equal(SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_DOCUMENT_TYPE, 'SustainedLeftHandPhysicalStateModel');
  assert.equal(SUSTAINED_LEFT_HAND_PHYSICAL_STATE_MODEL_AUTHORITY, 'STATIC_PHYSICAL_CANDIDATES_ONLY');
  assert.equal(model.authority, 'STATIC_PHYSICAL_CANDIDATES_ONLY');
  assert.equal(model.sharedPhysicalPolicy.leftHandShapePolicy, 'ORDERED_FRET_FINGER_BARRE_1.0');
  assert.equal(model.sharedPhysicalPolicy.physicalPlayabilityPolicy, 'CONSERVATIVE_STATIC_LEFT_HAND_2.0');
  assert.equal(publicApi.createSustainedLeftHandPhysicalStateModel, undefined);
  assert.equal(publicApi.enumerateStaticLeftHandShapeCandidatesFromPositions, undefined);
  assert.equal(publicApi.evaluateStaticLeftHandShapeCandidate, undefined);
});

test('PS-4C internal PA-8/PA-9 seams reproduce the existing PA shape and verdict outputs exactly', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('C', { octave: 3, chord: true }),
  ].join('')));
  const decisions = preserveAll(2);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const group = leftHand.groups[0];
  const voicing = group.voicingCandidates[0];
  const counters = { shapeCandidates: 0, assignmentAttempts: 0 };
  const directShapes = enumerateStaticLeftHandShapeCandidatesFromPositions(
    voicing.voicingCandidateId,
    voicing.positions,
    null,
    counters,
    group.sourceGroupId,
  );

  assert.deepEqual(directShapes, voicing.shapeCandidates);

  const physicalModel = validatePhysicalPlayabilityV2(source, decisions);
  const physicalGroup = physicalModel.groups.find((entry) => entry.sourceGroupId === group.sourceGroupId);
  const physicalVoicing = physicalGroup.voicingCandidates.find(
    (entry) => entry.voicingCandidateId === voicing.voicingCandidateId,
  );
  const directVerdicts = directShapes.map((shape) => evaluateStaticLeftHandShapeCandidate(
    shape,
    voicing.positions,
    voicing.voicingCandidateId,
    group.sourceGroupId,
  ));

  assert.deepEqual(directVerdicts, physicalVoicing.shapeVerdicts);
});

test('PS-4C preserves open-string finger-zero semantics using the shared PA-8 policy', () => {
  const model = physical(score([
    note('E', { octave: 2 }),
    note('A', { octave: 2, chord: true }),
  ].join('')));
  const point = model.measures[0].points[0];

  assert.equal(point.status, SUSTAINED_PHYSICAL_POINT_STATUS.PHYSICAL_CANDIDATES_AVAILABLE);
  const openState = point.physicalCandidates.find((candidate) => {
    const positions = candidate.positions.map((position) => `${position.string}:${position.fret}`).join('|');
    return positions === '6:0|5:0';
  });
  assert.ok(openState);
  assert.deepEqual(openState.fingerAssignments.map((assignment) => assignment.finger), [0, 0]);
  assert.equal(openState.barres.length, 0);
  assert.equal(openState.physicalValidation.status, PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY);
});

test('PS-4C can retain a shared-policy barre candidate without inventing new fingering rules', () => {
  const model = physical(score([
    note('A', { octave: 2, alter: 1 }),
    note('D', { octave: 3, alter: 1, chord: true }),
  ].join('')));
  const point = model.measures[0].points[0];
  const barreState = point.physicalCandidates.find((candidate) => candidate.barres.some((barre) => (
    barre.kind === 'PARTIAL_BARRE'
      && barre.fret === 1
      && barre.startString === 4
      && barre.endString === 5
  )));

  assert.ok(barreState);
  assert.equal(barreState.physicalValidation.status, PLAYABILITY_STATUS.PLAYABLE_WITHIN_POLICY);
});

test('PS-4C scopes shared PA-8 ceilings to each independently enumerated sonority point', () => {
  const model = physical(repeatedWholeNoteScore(121));

  assert.equal(model.pointCount, 242);
  assert.ok(model.evaluatedShapeCount > 20_000);
  assert.equal(
    model.measures.every((measure) => measure.points.every((point) => (
      point.status === SUSTAINED_PHYSICAL_POINT_STATUS.PHYSICAL_CANDIDATES_AVAILABLE
        || point.status === SUSTAINED_PHYSICAL_POINT_STATUS.EMPTY_SONORITY
    ))),
    true,
  );
});

test('PS-4C preserves tied logical-note provenance in physical finger assignments', () => {
  const model = physical(fixture('ui07-poly-unison-tie.musicxml'));
  const point = model.measures[1].points[0];
  const chainId = 'P1:sustain-chain:0';

  assert.equal(point.status, SUSTAINED_PHYSICAL_POINT_STATUS.PHYSICAL_CANDIDATES_AVAILABLE);
  for (const candidate of point.physicalCandidates) {
    const held = candidate.fingerAssignments.find((assignment) => assignment.logicalNoteId === chainId);
    assert.ok(held);
    assert.equal(held.sourceEventId, 'P1:measure:1:note:0');
    assert.equal(held.sustainChainId, chainId);
    assert.equal(held.disposition, 'HOLD');
  }
});

test('PS-4C propagates exact unplayability instead of reducing seven simultaneous notes', () => {
  const body = [
    note('C', { octave: 3 }),
    note('D', { octave: 3, chord: true }),
    note('E', { octave: 3, chord: true }),
    note('F', { octave: 3, chord: true }),
    note('G', { octave: 3, chord: true }),
    note('A', { octave: 3, chord: true }),
    note('B', { octave: 3, chord: true }),
  ].join('');
  const model = physical(score(body));
  const point = model.measures[0].points[0];

  assert.equal(point.status, SUSTAINED_PHYSICAL_POINT_STATUS.UNPLAYABLE_EXACT);
  assert.equal(point.reason, 'ACTIVE_NOTE_COUNT_EXCEEDS_STRING_COUNT');
  assert.equal(point.physicalCandidateCount, 0);
  assert.deepEqual(point.physicalCandidates, []);
});

test('PS-4C output is deeply immutable and carries no selected path or cost authority', () => {
  const model = physical(score(note('F', { octave: 2 })));
  const point = model.measures[0].points[0];
  const candidate = point.physicalCandidates[0];

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.measures), true);
  assert.equal(Object.isFrozen(point), true);
  assert.equal(Object.isFrozen(point.physicalCandidates), true);
  assert.equal(Object.isFrozen(candidate), true);
  assert.equal(Object.isFrozen(candidate.fingerAssignments), true);
  assert.equal(Object.isFrozen(candidate.barres), true);
  assert.equal(Object.isFrozen(candidate.physicalValidation), true);
  for (const forbidden of ['selected', 'cost', 'pathCost']) {
    assert.equal(forbidden in point, false);
    assert.equal(forbidden in candidate, false);
  }
});

test('PS-4C revalidates source input and remains deadline/cancellation bounded', () => {
  const source = sourceModel(score([
    note('C', { octave: 3, duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { octave: 3, duration: 12, voice: '2' }),
  ].join('')));
  const hostile = structuredClone(source);
  hostile.measures[0].events[0].voice = '';
  assert.throws(() => createSustainedLeftHandPhysicalStateModel(hostile), {
    code: 'INVALID_POLYPHONIC_SOURCE_MODEL',
  });

  let stateChecks = 0;
  const deadlineRuntime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    { clock: (phase) => {
      if (phase !== 'sustained-left-hand-physical:position-state') return 0;
      stateChecks += 1;
      return stateChecks >= 2 ? 11 : 0;
    } },
  );
  assert.throws(
    () => createSustainedLeftHandPhysicalStateModel(source, deadlineRuntime),
    (error) => error.code === 'PROCESSING_DEADLINE_EXCEEDED'
      && error.details.phase === 'sustained-left-hand-physical:position-state',
  );

  const controller = new AbortController();
  let injected = false;
  const cancelRuntime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    { clock: (phase) => {
      if (phase === 'sustained-left-hand-physical:position-state' && !injected) {
        injected = true;
        controller.abort();
      }
      return 0;
    } },
  );
  assert.throws(
    () => createSustainedLeftHandPhysicalStateModel(source, cancelRuntime),
    (error) => error.code === 'PROCESSING_ABORTED',
  );
});
