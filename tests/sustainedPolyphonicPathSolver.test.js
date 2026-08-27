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
  SUSTAINED_POLYPHONIC_PATH_SELECTION_VERSION,
  SUSTAINED_POLYPHONIC_PATH_SELECTION_DOCUMENT_TYPE,
  SUSTAINED_POLYPHONIC_PATH_SELECTION_POLICY,
  SUSTAINED_POLYPHONIC_PATH_TRANSITION_POLICY,
  SUSTAINED_POLYPHONIC_PATH_SELECTION_AUTHORITY,
  MAX_SUSTAINED_PATH_STATES,
  createSustainedPolyphonicPathSelection,
} = require('../src/music/sustainedPolyphonicPathSolver');

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
  <part-list><score-part id="P1"><part-name>PS-5</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(xml, {}, runtime),
    runtime,
  );
}

function solve(xml, runtime = null) {
  return createSustainedPolyphonicPathSelection(sourceModel(xml), runtime);
}

function assignmentsForLogical(model, logicalNoteId) {
  const assignments = [];
  for (const point of model.selectedPointStates) {
    for (const assignment of point.fingerAssignments) {
      if (assignment.logicalNoteId === logicalNoteId) assignments.push(assignment);
    }
  }
  return assignments;
}

function physicalSignature(assignment) {
  return `${assignment.string}:${assignment.fret}:f${assignment.finger}`;
}

test('PS-5 exposes an internal deterministic sustained-path-facts contract', () => {
  const model = solve(score(note('E', { octave: 2 })));

  assert.equal(SUSTAINED_POLYPHONIC_PATH_SELECTION_VERSION, '1.0.0');
  assert.equal(SUSTAINED_POLYPHONIC_PATH_SELECTION_DOCUMENT_TYPE, 'SustainedPolyphonicPathSelection');
  assert.equal(SUSTAINED_POLYPHONIC_PATH_SELECTION_POLICY, 'SUSTAINED_PHYSICAL_PATH_LEXICOGRAPHIC_1.0');
  assert.equal(SUSTAINED_POLYPHONIC_PATH_TRANSITION_POLICY, 'HOLD_STRING_FRET_FINGER_STABLE_1.0');
  assert.equal(SUSTAINED_POLYPHONIC_PATH_SELECTION_AUTHORITY, 'DETERMINISTIC_SUSTAINED_PATH_FACTS_ONLY');
  assert.equal(MAX_SUSTAINED_PATH_STATES, 400_000);
  assert.equal(model.authority, 'DETERMINISTIC_SUSTAINED_PATH_FACTS_ONLY');
  assert.equal(model.selectedLogicalNoteCount, 1);
  assert.equal(model.logicalNoteSelections.length, 1);
  assert.equal(publicApi.createSustainedPolyphonicPathSelection, undefined);
});

test('PS-5 preserves a tied logical note on one string, fret and finger across measures', () => {
  const model = solve(fixture('ui07-poly-unison-tie.musicxml'));
  const chainId = 'P1:sustain-chain:0';
  const logical = model.logicalNoteSelections.find((entry) => entry.logicalNoteId === chainId);

  assert.ok(logical);
  assert.ok(logical.sourceEventIds.length >= 2);
  const assignments = assignmentsForLogical(model, chainId);
  assert.ok(assignments.length >= 2);
  assert.equal(new Set(assignments.map(physicalSignature)).size, 1);
  assert.equal(logical.string, assignments[0].string);
  assert.equal(logical.fret, assignments[0].fret);
  assert.equal(logical.finger, assignments[0].finger);

  const crossMeasureHold = model.selectedPointStates.find((point) => (
    point.measureIndex === 1 && point.holdLogicalNoteIds.includes(chainId)
  ));
  assert.ok(crossMeasureHold);
});

test('PS-5 supports later attacks while an earlier independent voice remains physically held', () => {
  const xml = score([
    note('C', { octave: 3, duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { octave: 3, duration: 12, voice: '2' }),
  ].join(''));
  const model = solve(xml);
  const heldId = 'P1:measure:0:note:0';
  const laterAttackId = 'P1:measure:0:note:2';
  const heldAssignments = assignmentsForLogical(model, heldId);

  assert.ok(heldAssignments.length >= 2);
  assert.equal(new Set(heldAssignments.map(physicalSignature)).size, 1);
  const overlapPoint = model.selectedPointStates.find((point) => (
    point.holdLogicalNoteIds.includes(heldId)
    && point.attackLogicalNoteIds.includes(laterAttackId)
  ));
  assert.ok(overlapPoint);
  assert.equal(overlapPoint.positions.length, 2);
  assert.equal(new Set(overlapPoint.positions.map((position) => position.string)).size, 2);

  const heldSelection = model.logicalNoteSelections.find((entry) => entry.logicalNoteId === heldId);
  const attackSelection = model.logicalNoteSelections.find((entry) => entry.logicalNoteId === laterAttackId);
  assert.ok(heldSelection);
  assert.ok(attackSelection);
});

test('PS-5 selection is deterministic for the same overlapping polyphonic source', () => {
  const xml = score([
    note('G', { octave: 3, duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('C', { octave: 4, duration: 12, voice: '2' }),
  ].join(''));
  const source = sourceModel(xml);
  const first = createSustainedPolyphonicPathSelection(source);
  const second = createSustainedPolyphonicPathSelection(source);

  assert.deepEqual(first, second);
  assert.ok(Number.isInteger(first.pathCost.transitionFretDistance));
  assert.ok(first.pathCost.transitionFretDistance >= 0);
});

test('PS-5 fails closed instead of reducing seven exact simultaneous notes', () => {
  const xml = score([
    note('C', { octave: 3 }),
    note('D', { octave: 3, chord: true }),
    note('E', { octave: 3, chord: true }),
    note('F', { octave: 3, chord: true }),
    note('G', { octave: 3, chord: true }),
    note('A', { octave: 3, chord: true }),
    note('B', { octave: 3, chord: true }),
  ].join(''));

  assert.throws(
    () => solve(xml),
    (error) => error.code === 'UNSUPPORTED_SUSTAINED_POLYPHONIC_PATH_SELECTION'
      && error.details.reason === 'UNPLAYABLE_PHYSICAL_POINT'
      && error.details.physicalReason === 'ACTIVE_NOTE_COUNT_EXCEEDS_STRING_COUNT',
  );
});

test('PS-5 selected facts are deeply immutable and do not claim public TAB authority', () => {
  const model = solve(score([
    note('C', { octave: 3, duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { octave: 3, duration: 12, voice: '2' }),
  ].join('')));

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.selectedPointStates), true);
  assert.equal(Object.isFrozen(model.logicalNoteSelections), true);
  assert.equal(Object.isFrozen(model.pathCost), true);
  assert.equal(model.authority, 'DETERMINISTIC_SUSTAINED_PATH_FACTS_ONLY');
  assert.equal('musicXml' in model, false);
  assert.equal('canonicalTabResult' in model, false);
  assert.equal('publicApi' in model, false);
});

test('PS-5 remains deadline and cancellation bounded during global path work', () => {
  const source = sourceModel(score([
    note('C', { octave: 3, duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { octave: 3, duration: 12, voice: '2' }),
  ].join('')));

  let candidateChecks = 0;
  const deadlineRuntime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    { clock: (phase) => {
      if (phase !== 'sustained-polyphonic-path:point-candidate') return 0;
      candidateChecks += 1;
      return candidateChecks >= 2 ? 11 : 0;
    } },
  );
  assert.throws(
    () => createSustainedPolyphonicPathSelection(source, deadlineRuntime),
    (error) => error.code === 'PROCESSING_DEADLINE_EXCEEDED'
      && error.details.phase === 'sustained-polyphonic-path:point-candidate',
  );

  const controller = new AbortController();
  let injected = false;
  const cancelRuntime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    { clock: (phase) => {
      if (phase === 'sustained-polyphonic-path:point-candidate' && !injected) {
        injected = true;
        controller.abort();
      }
      return 0;
    } },
  );
  assert.throws(
    () => createSustainedPolyphonicPathSelection(source, cancelRuntime),
    (error) => error.code === 'PROCESSING_ABORTED',
  );
});