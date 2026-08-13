'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { positionToMidi } = require('../src/guitar/fretboard');
const {
  GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
  GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
  GUITAR_VOICING_CANDIDATE_POLICY,
  MAX_GUITAR_VOICING_CANDIDATES,
  createGuitarVoicingCandidateModel,
} = require('../src/music/guitarVoicingCandidateModel');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-7</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function repeatedDyadScore(measureCount) {
  const measures = [];
  for (let index = 0; index < measureCount; index += 1) {
    measures.push(`<measure number="${index + 1}">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
      ${note('C', { octave: 4 })}${note('E', { octave: 4, chord: true })}
    </measure>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-7 limit</part-name></score-part></part-list>
  <part id="P1">${measures.join('')}</part>
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

function eventId(index, measureIndex = 0) {
  return `P1:measure:${measureIndex}:note:${index}`;
}

function groupId(onset = 0, measureIndex = 0) {
  return `P1:measure:${measureIndex}:simultaneous:${onset}`;
}

function preserveDecision(index, measureIndex = 0) {
  return {
    decisionType: 'PRESERVED',
    sourceEventIds: [eventId(index, measureIndex)],
    sourceGroupId: null,
  };
}

function preserveAllDecisions(source) {
  const decisions = [];
  for (const measure of source.measures) {
    for (const event of measure.events) {
      if (event.type === 'note') {
        decisions.push({
          decisionType: 'PRESERVED',
          sourceEventIds: [event.sourceEventId],
          sourceGroupId: null,
        });
      }
    }
  }
  return decisions;
}

test('PA-7 fixes the internal voicing-candidate contract and standard distinct-string policy', () => {
  const source = sourceModel(score([
    note('E', { octave: 2 }),
    note('A', { octave: 2, chord: true }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [preserveDecision(0), preserveDecision(1)]);

  assert.equal(GUITAR_VOICING_CANDIDATE_MODEL_VERSION, '1.0.0');
  assert.equal(GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE, 'GuitarVoicingCandidateModel');
  assert.equal(GUITAR_VOICING_CANDIDATE_POLICY, 'STANDARD_SIX_STRING_DISTINCT_STRING_1.0');
  assert.equal(MAX_GUITAR_VOICING_CANDIDATES, 10_000);
  assert.deepEqual(model.configuration, {
    contractVersion: '1.0.0',
    stringCount: 6,
    minimumFret: 0,
    maximumFret: 20,
  });
  assert.equal(model.groupCount, 1);
  assert.equal(model.candidateCount, 1);
  assert.deepEqual(model.groups[0].candidates[0].positions, [
    { sourceEventId: eventId(0), targetMidi: 40, string: 6, fret: 0 },
    { sourceEventId: eventId(1), targetMidi: 45, string: 5, fret: 0 },
  ]);
});

test('PA-7 enumerates deterministic string-distinct alternatives without ranking them', () => {
  const source = sourceModel(score([
    note('C', { octave: 4 }),
    note('E', { octave: 4, chord: true }),
  ].join('')));
  const decisions = [preserveDecision(0), preserveDecision(1)];
  const first = createGuitarVoicingCandidateModel(source, decisions);
  const second = createGuitarVoicingCandidateModel(source, decisions);

  assert.deepEqual(first, second);
  assert.equal(first.groups[0].sourceGroupId, groupId());
  assert.deepEqual(first.groups[0].sourceEventIds, [eventId(0), eventId(1)]);
  assert.deepEqual(first.groups[0].activeSourceEventIds, [eventId(0), eventId(1)]);
  assert.deepEqual(first.groups[0].omittedSourceEventIds, []);
  assert.deepEqual(first.groups[0].targetMidis, [60, 64]);
  assert.deepEqual(first.groups[0].candidates[0].positions, [
    { sourceEventId: eventId(0), targetMidi: 60, string: 2, fret: 1 },
    { sourceEventId: eventId(1), targetMidi: 64, string: 1, fret: 0 },
  ]);

  for (const candidate of first.groups[0].candidates) {
    const strings = candidate.positions.map((position) => position.string);
    assert.equal(new Set(strings).size, strings.length);
    for (const position of candidate.positions) {
      assert.equal(positionToMidi(position), position.targetMidi);
      assert.ok(position.fret >= 0 && position.fret <= 20);
    }
  }
});

test('PA-7 uses exact PA-6 CHORD_REDUCED survivors and preserves omitted provenance', () => {
  const source = sourceModel(score([
    note('C', { octave: 4 }),
    note('E', { octave: 4, chord: true }),
    note('G', { octave: 4, chord: true }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [{
    decisionType: 'CHORD_REDUCED',
    sourceEventIds: [eventId(0), eventId(1), eventId(2)],
    sourceGroupId: groupId(),
  }]);

  const group = model.groups[0];
  assert.deepEqual(group.sourceEventIds, [eventId(0), eventId(1), eventId(2)]);
  assert.deepEqual(group.activeSourceEventIds, [eventId(0), eventId(2)]);
  assert.deepEqual(group.omittedSourceEventIds, [eventId(1)]);
  assert.deepEqual(group.targetMidis, [60, 67]);
  assert.ok(group.candidateCount > 0);
  for (const candidate of group.candidates) {
    assert.deepEqual(candidate.positions.map((position) => position.sourceEventId), [eventId(0), eventId(2)]);
    assert.deepEqual(candidate.positions.map((position) => position.targetMidi), [60, 67]);
  }
});

test('PA-7 returns zero candidates when simultaneous retained notes can only occupy the same string', () => {
  const source = sourceModel(score([
    note('E', { octave: 2 }),
    note('E', { octave: 2, chord: true }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [preserveDecision(0), preserveDecision(1)]);
  assert.equal(model.groupCount, 1);
  assert.equal(model.groups[0].candidateCount, 0);
  assert.deepEqual(model.groups[0].candidates, []);
});

test('PA-7 does not silently drop notes when more than six active notes are simultaneous', () => {
  const notes = [note('C')];
  for (let index = 1; index < 7; index += 1) {
    notes.push(note('C', { chord: true }));
  }
  const source = sourceModel(score(notes.join('')));
  const model = createGuitarVoicingCandidateModel(source, preserveAllDecisions(source));
  assert.equal(model.groupCount, 1);
  assert.equal(model.groups[0].activeSourceEventIds.length, 7);
  assert.equal(model.groups[0].candidateCount, 0);
  assert.deepEqual(model.groups[0].candidates, []);
});

test('PA-7 omits a source simultaneous group from chord candidates when PA-6 leaves fewer than two active notes', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [
    preserveDecision(0),
    { decisionType: 'OMITTED', sourceEventIds: [eventId(1)], sourceGroupId: null },
  ]);
  assert.equal(model.groupCount, 0);
  assert.equal(model.candidateCount, 0);
  assert.deepEqual(model.groups, []);
});

test('PA-7 output is deeply immutable', () => {
  const source = sourceModel(score([
    note('E', { octave: 2 }),
    note('A', { octave: 2, chord: true }),
  ].join('')));
  const model = createGuitarVoicingCandidateModel(source, [preserveDecision(0), preserveDecision(1)]);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.configuration), true);
  assert.equal(Object.isFrozen(model.groups), true);
  assert.equal(Object.isFrozen(model.groups[0]), true);
  assert.equal(Object.isFrozen(model.groups[0].sourceEventIds), true);
  assert.equal(Object.isFrozen(model.groups[0].activeSourceEventIds), true);
  assert.equal(Object.isFrozen(model.groups[0].omittedSourceEventIds), true);
  assert.equal(Object.isFrozen(model.groups[0].targetMidis), true);
  assert.equal(Object.isFrozen(model.groups[0].candidates), true);
  assert.equal(Object.isFrozen(model.groups[0].candidates[0]), true);
  assert.equal(Object.isFrozen(model.groups[0].candidates[0].positions), true);
  assert.equal(Object.isFrozen(model.groups[0].candidates[0].positions[0]), true);
  assert.throws(() => {
    model.groups[0].candidates[0].positions[0].fret = 99;
  }, TypeError);
});

test('PA-7 enforces an aggregate voicing-candidate ceiling before unbounded growth', () => {
  const source = sourceModel(repeatedDyadScore(500));
  const decisions = preserveAllDecisions(source);
  assert.throws(
    () => createGuitarVoicingCandidateModel(source, decisions),
    (error) => error && error.code === 'GUITAR_VOICING_CANDIDATE_LIMIT_EXCEEDED'
      && error.details.limit === MAX_GUITAR_VOICING_CANDIDATES,
  );
});

test('PA-7 reuses ProcessingRuntime deadline checkpoints during candidate enumeration', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));
  const decisions = [preserveDecision(0), preserveDecision(1)];
  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 1 },
    { clock: (phase) => (phase.startsWith('guitar-voicing-candidate-model:') && phase !== 'guitar-voicing-candidate-model:start' ? 2 : 0) },
  );
  assert.throws(
    () => createGuitarVoicingCandidateModel(source, decisions, runtime),
    (error) => error && error.code === 'PROCESSING_DEADLINE_EXCEEDED'
      && String(error.details.phase).startsWith('guitar-voicing-candidate-model:'),
  );
});

test('PA-7 reuses ProcessingRuntime cancellation checkpoints after PA-6 recomputation', () => {
  const source = sourceModel(score([
    note('C'),
    note('E', { chord: true }),
  ].join('')));
  const decisions = [preserveDecision(0), preserveDecision(1)];
  const controller = new AbortController();
  const runtime = createMusicXmlProcessingRuntime(
    { signal: controller.signal },
    { clock: (phase) => {
      if (phase === 'deterministic-reduction-plan:complete') {
        controller.abort();
      }
      return 0;
    } },
  );
  assert.throws(
    () => createGuitarVoicingCandidateModel(source, decisions, runtime),
    (error) => error && error.code === 'PROCESSING_ABORTED'
      && String(error.details.phase).startsWith('guitar-voicing-candidate-model:'),
  );
});

test('PA-7 remains internal and does not expand the package-root public API', () => {
  const publicApi = require('../src');
  assert.equal('createGuitarVoicingCandidateModel' in publicApi, false);
  assert.equal('GUITAR_VOICING_CANDIDATE_MODEL_VERSION' in publicApi, false);
});
