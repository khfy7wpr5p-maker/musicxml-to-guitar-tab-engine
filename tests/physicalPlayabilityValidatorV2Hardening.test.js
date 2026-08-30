'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createLeftHandShapeModel } = require('../src/music/leftHandShapeModel');
const { validatePhysicalPlayabilityV2 } = require('../src/music/physicalPlayabilityValidatorV2');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-9 hardening</part-name></score-part></part-list>
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
  <part-list><score-part id="P1"><part-name>PA-9 limit</part-name></score-part></part-list>
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
        return { group, voicing };
      }
    }
  }
  return null;
}

function findValidationVoicing(validation, sourceGroupId, voicingCandidateId) {
  const group = validation.groups.find((entry) => entry.sourceGroupId === sourceGroupId);
  if (!group) {
    return null;
  }
  return group.voicingCandidates.find((entry) => entry.voicingCandidateId === voicingCandidateId) || null;
}

function walkKeys(value, visit) {
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const key of Object.keys(value)) {
    visit(key);
    walkKeys(value[key], visit);
  }
}

test('PA-9 revalidates hostile source and decisions fail closed without getter execution', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));
  const decisions = preserveAllSourceNotes(source);

  assert.throws(
    () => validatePhysicalPlayabilityV2(new Proxy(source, {}), decisions),
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
    () => validatePhysicalPlayabilityV2(source, [hostileDecision, decisions[1]]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
  assert.equal(getterCalls, 0);
});

test('PA-9 remains deadline-bounded and cancellation-aware through upstream recomputation and verdict validation', () => {
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
    () => validatePhysicalPlayabilityV2(source, decisions, deadlineRuntime),
    (error) => error && error.code === 'PROCESSING_DEADLINE_EXCEEDED',
  );

  const controller = new AbortController();
  controller.abort();
  const cancelledRuntime = createMusicXmlProcessingRuntime({ signal: controller.signal });
  assert.throws(
    () => validatePhysicalPlayabilityV2(source, decisions, cancelledRuntime),
    (error) => error && error.code === 'PROCESSING_ABORTED',
  );
});

test('PA-9 preserves the inherited PA-8 per-source-group assignment attempt ceiling', () => {
  const source = sourceModel(score([
    note('C', { octave: 4 }),
    note('D', { octave: 4, chord: true }),
    note('E', { octave: 4, chord: true }),
    note('F', { octave: 4, chord: true }),
    note('G', { octave: 4, chord: true }),
    note('A', { octave: 4, chord: true }),
  ].join('')));

  assert.throws(
    () => validatePhysicalPlayabilityV2(source, preserveAllSourceNotes(source)),
    (error) => (
      error
      && error.code === 'LEFT_HAND_ASSIGNMENT_ATTEMPT_LIMIT_EXCEEDED'
      && error.details.limit === 100_000
      && error.details.observed === 100_001
    ),
  );
});

test('PA-9 validates PA-8 shapes per source group without changing their aggregate identity', () => {
  const xml = multiMeasureScore(
    121,
    note('C', { octave: 4, duration: 16, type: 'whole' }),
    note('F', { octave: 4, chord: true, duration: 16, type: 'whole' }),
  );
  const source = sourceModel(xml);

  const validation = validatePhysicalPlayabilityV2(source, preserveAllSourceNotes(source));
  assert.ok(validation.shapeCandidateCount > 20_000);
  assert.equal(
    validation.groups.every((group) => (
      group.voicingCandidates.reduce((count, voicing) => count + voicing.shapeCandidateCount, 0)
      <= 20_000
    )),
    true,
  );
});

test('PA-9 accepts a structurally valid PA-8 partial barre without gaining ergonomic authority', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('A', { octave: 2, alter: 1, chord: true }),
  ].join('')));
  const decisions = preserveAllSourceNotes(source);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const match = findVoicing(leftHand, [{ string: 6, fret: 1 }, { string: 5, fret: 1 }]);
  assert.ok(match);
  const shape = match.voicing.shapeCandidates.find((candidate) => (
    candidate.fingerAssignments.map((assignment) => assignment.finger).join(',') === '1,1'
  ));
  assert.ok(shape);
  assert.equal(shape.barreCount, 1);
  assert.equal(shape.barres[0].kind, 'PARTIAL_BARRE');

  const validation = validatePhysicalPlayabilityV2(source, decisions);
  const voicing = findValidationVoicing(
    validation,
    match.group.sourceGroupId,
    match.voicing.voicingCandidateId,
  );
  assert.ok(voicing);
  const verdict = voicing.shapeVerdicts.find((entry) => entry.shapeCandidateId === shape.shapeCandidateId);
  assert.ok(verdict);
  assert.equal(verdict.status, 'PLAYABLE_WITHIN_POLICY');
  assert.equal(verdict.barreCount, 1);
});

test('PA-9 preserves a nonempty structural voicing when every shape is rejected by the static policy', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('D', { octave: 3, alter: 1, chord: true }),
  ].join('')));
  const decisions = preserveAllSourceNotes(source);
  const leftHand = createLeftHandShapeModel(source, decisions);
  const match = findVoicing(leftHand, [{ string: 6, fret: 1 }, { string: 5, fret: 6 }]);
  assert.ok(match);
  assert.ok(match.voicing.shapeCandidateCount > 0);

  const validation = validatePhysicalPlayabilityV2(source, decisions);
  const voicing = findValidationVoicing(
    validation,
    match.group.sourceGroupId,
    match.voicing.voicingCandidateId,
  );
  assert.ok(voicing);
  assert.equal(voicing.shapeCandidateCount, match.voicing.shapeCandidateCount);
  assert.equal(voicing.playableShapeCount, 0);
  assert.equal(voicing.rejectedShapeCount, match.voicing.shapeCandidateCount);
  assert.ok(voicing.shapeVerdicts.every((verdict) => verdict.status === 'REJECTED'));
});

test('PA-9 is deterministic, does not mutate caller-owned decisions, and keeps later-gate authority absent', () => {
  const source = sourceModel(score([
    note('F', { octave: 2 }),
    note('D', { octave: 3, chord: true }),
  ].join('')));
  const decisions = preserveAllSourceNotes(source);
  const before = JSON.stringify(decisions);

  const first = validatePhysicalPlayabilityV2(source, decisions);
  const second = validatePhysicalPlayabilityV2(source, decisions);

  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(decisions), before);

  const forbiddenKeys = new Set([
    'rank', 'score', 'cost', 'selected', 'selection', 'preference', 'preferred',
    'finalSelection', 'transitionCost', 'ergonomic', 'comfort', 'difficulty',
    'handPosition', 'wristPosition', 'tempo', 'pedagogicalPreference',
  ]);
  walkKeys(first, (key) => {
    assert.equal(forbiddenKeys.has(key), false, `unexpected later-gate authority field: ${key}`);
  });
});
