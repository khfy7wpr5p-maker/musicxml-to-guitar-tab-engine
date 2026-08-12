'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  DETERMINISTIC_REDUCTION_PLAN_VERSION,
  DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
  DETERMINISTIC_REDUCTION_POLICY,
  DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK,
  createDeterministicReductionPlan,
} = require('../src/music/deterministicReductionPlan');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-6</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, chord = false, voice = '1', staff = 1 } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function eventId(index) {
  return `P1:measure:0:note:${index}`;
}

function groupId(onset = 0) {
  return `P1:measure:0:simultaneous:${onset}`;
}

function singleDecision(decisionType, index = 0) {
  return {
    decisionType,
    sourceEventIds: [eventId(index)],
    sourceGroupId: null,
  };
}

function analyse(xml, decisions) {
  return createDeterministicReductionPlan(sourceModel(xml), decisions);
}

test('PA-6 fixes the internal reduction contract, policy, register envelope and tie break', () => {
  const model = analyse(score(note('C')), [singleDecision('PRESERVED')]);
  assert.equal(DETERMINISTIC_REDUCTION_PLAN_VERSION, '1.0.0');
  assert.equal(DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE, 'DeterministicReductionPlan');
  assert.equal(DETERMINISTIC_REDUCTION_POLICY, 'STANDARD_GUITAR_REGISTER_20_FRET_1.0');
  assert.equal(DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK, 'DOWNWARD_TIE_BREAK_1.0');
  assert.deepEqual(model.registerEnvelope, { minimumMidi: 40, maximumMidi: 84 });
});

test('PA-6 PRESERVED keeps an in-register source note unchanged with exact decision provenance', () => {
  const model = analyse(score(note('C', { octave: 4 })), [singleDecision('PRESERVED')]);
  assert.deepEqual(model.instructions, [{
    sourceEventId: eventId(0),
    decisionId: 'P1:arrangement-decision:0',
    decisionType: 'PRESERVED',
    sourceGroupId: null,
    sourceRole: 'SOLE_NOTE',
    disposition: 'KEEP',
    targetMidi: 60,
    octaveShiftSemitones: 0,
    ruleId: 'PRESERVE_IN_REGISTER',
  }]);
});

test('PA-6 OMITTED emits an explicit omission and does not invent a target pitch', () => {
  const model = analyse(score(note('C')), [singleDecision('OMITTED')]);
  assert.deepEqual(model.instructions[0], {
    sourceEventId: eventId(0),
    decisionId: 'P1:arrangement-decision:0',
    decisionType: 'OMITTED',
    sourceGroupId: null,
    sourceRole: 'SOLE_NOTE',
    disposition: 'OMIT',
    targetMidi: null,
    octaveShiftSemitones: null,
    ruleId: 'OMIT_EXPLICIT',
  });
});

test('PA-6 OCTAVE_DISPLACED chooses the nearest in-register pitch-class equivalent with downward tie break', () => {
  const model = analyse(score(note('C', { octave: 5 })), [singleDecision('OCTAVE_DISPLACED')]);
  assert.equal(model.instructions[0].targetMidi, 60);
  assert.equal(model.instructions[0].octaveShiftSemitones, -12);
  assert.equal(model.instructions[0].ruleId, 'OCTAVE_NEAREST_IN_REGISTER');
});

test('PA-6 OCTAVE_DISPLACED moves an out-of-register source by the smallest octave distance into the envelope', () => {
  const model = analyse(score(note('C', { octave: 7 })), [singleDecision('OCTAVE_DISPLACED')]);
  assert.equal(model.instructions[0].targetMidi, 84);
  assert.equal(model.instructions[0].octaveShiftSemitones, -12);
  assert.equal((model.instructions[0].targetMidi - 96) % 12, 0);
});

test('PA-6 CHORD_REDUCED keeps unique outer register candidates and omits inner candidates', () => {
  const xml = score([
    note('C'),
    note('E', { chord: true }),
    note('G', { chord: true }),
  ].join(''));
  const model = analyse(xml, [{
    decisionType: 'CHORD_REDUCED',
    sourceEventIds: [eventId(0), eventId(1), eventId(2)],
    sourceGroupId: groupId(),
  }]);

  assert.deepEqual(model.instructions.map(({ sourceRole, disposition, targetMidi, ruleId }) => ({
    sourceRole, disposition, targetMidi, ruleId,
  })), [
    { sourceRole: 'BASS_CANDIDATE', disposition: 'KEEP', targetMidi: 60, ruleId: 'CHORD_REDUCTION_KEEP_OUTER' },
    { sourceRole: 'INNER_VOICE_CANDIDATE', disposition: 'OMIT', targetMidi: null, ruleId: 'CHORD_REDUCTION_OMIT_INNER' },
    { sourceRole: 'MELODY_CANDIDATE', disposition: 'KEEP', targetMidi: 67, ruleId: 'CHORD_REDUCTION_KEEP_OUTER' },
  ]);
  assert.deepEqual(model.instructions.map((entry) => entry.sourceGroupId), [groupId(), groupId(), groupId()]);
});

test('PA-6 rejects ambiguous or no-op chord reductions rather than choosing arbitrary tones', () => {
  const ambiguous = score([
    note('C'),
    note('G', { chord: true }),
    note('G', { chord: true }),
  ].join(''));
  assert.throws(
    () => analyse(ambiguous, [{
      decisionType: 'CHORD_REDUCED',
      sourceEventIds: [eventId(0), eventId(1), eventId(2)],
      sourceGroupId: groupId(),
    }]),
    (error) => error && error.code === 'INVALID_DETERMINISTIC_REDUCTION_PLAN',
  );

  const noOp = score([note('C'), note('G', { chord: true })].join(''));
  assert.throws(
    () => analyse(noOp, [{
      decisionType: 'CHORD_REDUCED',
      sourceEventIds: [eventId(0), eventId(1)],
      sourceGroupId: groupId(),
    }]),
    (error) => error && error.code === 'INVALID_DETERMINISTIC_REDUCTION_PLAN',
  );
});

test('PA-6 rejects PRESERVED notes outside the fixed register instead of silently octave-shifting them', () => {
  assert.throws(
    () => analyse(score(note('C', { octave: 7 })), [singleDecision('PRESERVED')]),
    (error) => error && error.code === 'INVALID_DETERMINISTIC_REDUCTION_PLAN',
  );
});

test('PA-6 fails closed for PA-4 decision kinds whose executable semantics are deferred', () => {
  for (const decisionType of ['VOICE_REDISTRIBUTED', 'REVOICED', 'ARPEGGIATED']) {
    if (decisionType === 'VOICE_REDISTRIBUTED') {
      assert.throws(
        () => analyse(score(note('C')), [singleDecision(decisionType)]),
        (error) => error && error.code === 'INVALID_DETERMINISTIC_REDUCTION_PLAN',
      );
      continue;
    }

    const xml = score([note('C'), note('E', { chord: true })].join(''));
    assert.throws(
      () => analyse(xml, [{
        decisionType,
        sourceEventIds: [eventId(0), eventId(1)],
        sourceGroupId: groupId(),
      }]),
      (error) => error && error.code === 'INVALID_DETERMINISTIC_REDUCTION_PLAN',
    );
  }
});

test('PA-6 remains internal and does not expand package-root public API', () => {
  const publicApi = require('../src');
  assert.equal('createDeterministicReductionPlan' in publicApi, false);
  assert.equal('DETERMINISTIC_REDUCTION_PLAN_VERSION' in publicApi, false);
});