'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createSustainedGuitarPositionStateModel } = require('../src/music/sustainedGuitarPositionStateModel');
const {
  SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION,
  SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE,
  SUSTAINED_GUITAR_TRANSITION_MODEL_AUTHORITY,
  TRANSITION_STATUS,
  TRANSITION_COMPATIBILITY_MODE,
  createSustainedGuitarTransitionModel,
} = require('../src/music/sustainedGuitarTransitionModel');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function note(step, { octave = 4, duration = 16, voice = '1', chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>1</staff></note>`;
}

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PS-4B</part-name></score-part></part-list>
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

function transitions(xml, runtime = null) {
  return createSustainedGuitarTransitionModel(sourceModel(xml), runtime);
}

function candidateIndex(positionModel) {
  const index = new Map();
  for (const measure of positionModel.measures) {
    for (const point of measure.points) {
      for (const candidate of point.candidates) index.set(candidate.stateCandidateId, candidate);
    }
  }
  return index;
}

test('PS-4B exposes an internal hold-continuity-facts-only contract', () => {
  const model = transitions(score(note('C')));
  assert.equal(SUSTAINED_GUITAR_TRANSITION_MODEL_VERSION, '1.0.0');
  assert.equal(SUSTAINED_GUITAR_TRANSITION_MODEL_DOCUMENT_TYPE, 'SustainedGuitarTransitionModel');
  assert.equal(SUSTAINED_GUITAR_TRANSITION_MODEL_AUTHORITY, 'HOLD_CONTINUITY_FACTS_ONLY');
  assert.equal(model.authority, 'HOLD_CONTINUITY_FACTS_ONLY');
  assert.equal(publicApi.createSustainedGuitarTransitionModel, undefined);
});

test('PS-4B buckets held-note transitions only when string/fret identity is preserved', () => {
  const xml = score([
    note('C', { duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { duration: 12, voice: '2' }),
  ].join(''));
  const source = sourceModel(xml);
  const positionModel = createSustainedGuitarPositionStateModel(source);
  const index = candidateIndex(positionModel);
  const model = createSustainedGuitarTransitionModel(source);
  const transition = model.transitions.find((entry) => (
    entry.to.measureIndex === 0 && entry.to.timeDivisions === 4
  ));
  const heldId = 'P1:measure:0:note:0';

  assert.equal(transition.status, TRANSITION_STATUS.COMPATIBLE);
  assert.equal(transition.compatibilityMode, TRANSITION_COMPATIBILITY_MODE.HOLD_SIGNATURE_BUCKETS);
  assert.deepEqual(transition.holdLogicalNoteIds, [heldId]);
  assert.ok(transition.buckets.length > 0);

  for (const bucket of transition.buckets) {
    const prior = index.get(bucket.previousStateCandidateIds[0]);
    const current = index.get(bucket.currentStateCandidateIds[0]);
    const priorHeld = prior.positions.find((position) => position.logicalNoteId === heldId);
    const currentHeld = current.positions.find((position) => position.logicalNoteId === heldId);
    assert.equal(priorHeld.string, currentHeld.string);
    assert.equal(priorHeld.fret, currentHeld.fret);
    assert.match(bucket.holdSignature, new RegExp(`^${heldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@`));
  }
});

test('PS-4B preserves a tied sustain chain across a measure boundary', () => {
  const model = transitions(fixture('ui07-poly-unison-tie.musicxml'));
  const boundary = model.transitions.find((entry) => (
    entry.from.measureIndex === 0
    && entry.from.timeDivisions === 16
    && entry.to.measureIndex === 1
    && entry.to.timeDivisions === 0
  ));

  assert.ok(boundary);
  assert.equal(boundary.status, TRANSITION_STATUS.COMPATIBLE);
  assert.equal(boundary.compatibilityMode, TRANSITION_COMPATIBILITY_MODE.HOLD_SIGNATURE_BUCKETS);
  assert.deepEqual(boundary.holdLogicalNoteIds, ['P1:sustain-chain:0']);
  assert.ok(boundary.buckets.length > 0);
});

test('PS-4B represents transitions without held notes compactly as ALL_TO_ALL instead of materializing edges', () => {
  const model = transitions(score([
    note('C', { duration: 4 }),
    note('D', { duration: 12 }),
  ].join('')));
  const transition = model.transitions.find((entry) => entry.to.timeDivisions === 4);

  assert.equal(transition.status, TRANSITION_STATUS.COMPATIBLE);
  assert.equal(transition.compatibilityMode, TRANSITION_COMPATIBILITY_MODE.ALL_TO_ALL);
  assert.deepEqual(transition.holdLogicalNoteIds, []);
  assert.ok(transition.potentialPairCount > 0);
  assert.deepEqual(transition.buckets, []);
  assert.equal('edges' in transition, false);
});

test('PS-4B propagates an exact-unplayable endpoint without inventing a reduction', () => {
  const body = [
    note('C', { octave: 3 }),
    note('D', { octave: 3, chord: true }),
    note('E', { octave: 3, chord: true }),
    note('F', { octave: 3, chord: true }),
    note('G', { octave: 3, chord: true }),
    note('A', { octave: 3, chord: true }),
    note('B', { octave: 3, chord: true }),
  ].join('');
  const model = transitions(score(body));

  assert.ok(model.unplayableTransitionCount > 0);
  assert.equal(model.transitions[0].status, TRANSITION_STATUS.UNPLAYABLE_EXACT);
  assert.equal(model.transitions[0].reason, 'UNPLAYABLE_ENDPOINT');
  assert.equal(model.transitions[0].compatibilityMode, TRANSITION_COMPATIBILITY_MODE.NONE);
  assert.equal(model.transitions[0].potentialPairCount, 0);
});

test('PS-4B output is deeply immutable and carries no selected path or ergonomic authority', () => {
  const model = transitions(score(note('C')));
  const transition = model.transitions[0];

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.transitions), true);
  assert.equal(Object.isFrozen(transition), true);
  assert.equal(Object.isFrozen(transition.from), true);
  assert.equal(Object.isFrozen(transition.to), true);
  assert.equal(Object.isFrozen(transition.holdLogicalNoteIds), true);
  assert.equal(Object.isFrozen(transition.buckets), true);
  for (const forbidden of ['selected', 'cost', 'finger', 'barre', 'edges']) {
    assert.equal(forbidden in transition, false);
  }
});

test('PS-4B revalidates source input and remains deadline/cancellation bounded', () => {
  const source = sourceModel(score([
    note('C', { duration: 16, voice: '1' }),
    '<backup><duration>12</duration></backup>',
    note('E', { duration: 12, voice: '2' }),
  ].join('')));
  const hostile = structuredClone(source);
  hostile.measures[0].events[0].voice = '';
  assert.throws(() => createSustainedGuitarTransitionModel(hostile), {
    code: 'INVALID_POLYPHONIC_SOURCE_MODEL',
  });

  let transitionChecks = 0;
  const deadlineRuntime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 10 },
    { clock: (phase) => {
      if (phase !== 'sustained-guitar-transition:transition') return 0;
      transitionChecks += 1;
      return transitionChecks >= 2 ? 11 : 0;
    } },
  );
  assert.throws(
    () => createSustainedGuitarTransitionModel(source, deadlineRuntime),
    (error) => error.code === 'PROCESSING_DEADLINE_EXCEEDED'
      && error.details.phase === 'sustained-guitar-transition:transition',
  );

  const controller = new AbortController();
  let injected = false;
  const cancelRuntime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    { clock: (phase) => {
      if (phase === 'sustained-guitar-transition:transition' && !injected) {
        injected = true;
        controller.abort();
      }
      return 0;
    } },
  );
  assert.throws(
    () => createSustainedGuitarTransitionModel(source, cancelRuntime),
    (error) => error.code === 'PROCESSING_ABORTED',
  );
});
