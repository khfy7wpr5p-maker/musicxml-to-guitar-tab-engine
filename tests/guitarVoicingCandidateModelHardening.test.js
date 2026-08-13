'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createGuitarVoicingCandidateModel } = require('../src/music/guitarVoicingCandidateModel');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-7 hardening</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, chord = false, voice = '1', staff = 1 } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function backup(duration = 4) {
  return `<backup><duration>${duration}</duration></backup>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function eventId(index) {
  return `P1:measure:0:note:${index}`;
}

function preserve(index) {
  return {
    decisionType: 'PRESERVED',
    sourceEventIds: [eventId(index)],
    sourceGroupId: null,
  };
}

test('PA-7 revalidates hostile source models and hostile decisions fail closed without getter execution', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));

  assert.throws(
    () => createGuitarVoicingCandidateModel(new Proxy(source, {}), [preserve(0), preserve(1)]),
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
    value: [eventId(0)],
  });
  Object.defineProperty(hostileDecision, 'sourceGroupId', {
    enumerable: true,
    value: null,
  });

  assert.throws(
    () => createGuitarVoicingCandidateModel(source, [hostileDecision, preserve(1)]),
    (error) => error && error.code === 'INVALID_GUITAR_ARRANGEMENT_PLAN',
  );
  assert.equal(getterCalls, 0);
});

test('PA-7 preserves exact cross-voice/staff simultaneity provenance while only assigning positions', () => {
  const source = sourceModel(score([
    note('C', { octave: 5, voice: 'upper', staff: 1 }),
    backup(),
    note('C', { octave: 3, voice: 'bass', staff: 2 }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [preserve(0), preserve(1)]);

  assert.equal(model.groupCount, 1);
  assert.equal(model.groups[0].sourceGroupId, 'P1:measure:0:simultaneous:0');
  assert.deepEqual(model.groups[0].sourceEventIds, [eventId(0), eventId(1)]);
  assert.deepEqual(model.groups[0].activeSourceEventIds, [eventId(0), eventId(1)]);
  assert.deepEqual(model.groups[0].targetMidis, [72, 48]);
  assert.ok(model.groups[0].candidateCount > 0);
});

test('PA-7 preserves PA-6 octave-displaced target MIDI exactly', () => {
  const source = sourceModel(score([
    note('C', { octave: 6 }),
    note('E', { octave: 4, chord: true }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [
    { decisionType: 'OCTAVE_DISPLACED', sourceEventIds: [eventId(0)], sourceGroupId: null },
    preserve(1),
  ]);

  assert.deepEqual(model.groups[0].targetMidis, [72, 64]);
  for (const candidate of model.groups[0].candidates) {
    assert.deepEqual(candidate.positions.map((position) => position.targetMidi), [72, 64]);
  }
});

test('PA-7 candidate records contain no PA-8/PA-9/final-selection authority', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [preserve(0), preserve(1)]);
  const group = model.groups[0];
  const candidate = group.candidates[0];

  for (const forbidden of [
    'selected', 'rank', 'score', 'cost', 'preference', 'finger', 'barre',
    'partialBarre', 'handPosition', 'leftHandShape', 'playable', 'approved',
  ]) {
    assert.equal(forbidden in candidate, false);
    assert.equal(forbidden in group, false);
    for (const position of candidate.positions) {
      assert.equal(forbidden in position, false);
    }
  }
});
