'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createDeterministicVoiceAnalysis } = require('../src/music/deterministicVoiceAnalysis');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-5 hardening</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, voice = '1', staff = 1, rest = false } = {}) {
  return `<note>${rest ? '<rest/>' : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`}<duration>4</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
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

function groupId(onset = 0) {
  return `P1:measure:0:simultaneous:${onset}`;
}

test('PA-5 preserves exact PA-3 provenance across source voices and staves', () => {
  const source = sourceModel(score([
    note('C', { octave: 5, voice: 'upper', staff: 1 }),
    backup(),
    note('C', { octave: 3, voice: 'bass', staff: 2 }),
  ].join('')));
  const model = createDeterministicVoiceAnalysis(source);

  assert.deepEqual(model.eventAnalyses, [
    { sourceEventId: eventId(0), sourceGroupId: groupId(), voice: 'upper', staff: 1, role: 'MELODY_CANDIDATE' },
    { sourceEventId: eventId(1), sourceGroupId: groupId(), voice: 'bass', staff: 2, role: 'BASS_CANDIDATE' },
  ]);
});

test('PA-5 excludes rests and builds source-lane summaries in first-note occurrence order', () => {
  const source = sourceModel(score([
    note('C', { octave: 5, voice: 'upper', staff: 1 }),
    backup(),
    note('C', { octave: 3, voice: 'bass', staff: 2 }),
    note('D', { octave: 3, voice: 'bass', staff: 2 }),
    note('D', { rest: true, voice: 'bass', staff: 2 }),
  ].join('')));
  const model = createDeterministicVoiceAnalysis(source);

  assert.deepEqual(model.eventAnalyses.map((entry) => entry.sourceEventId), [eventId(0), eventId(1), eventId(2)]);
  assert.equal(model.voiceSummaryCount, 2);
  assert.deepEqual(model.voiceSummaries, [
    {
      voice: 'upper', staff: 1, noteCount: 1, soleNoteCount: 0,
      melodyCandidateCount: 1, bassCandidateCount: 0,
      innerVoiceCandidateCount: 0, ambiguousOuterCount: 0,
    },
    {
      voice: 'bass', staff: 2, noteCount: 2, soleNoteCount: 1,
      melodyCandidateCount: 0, bassCandidateCount: 1,
      innerVoiceCandidateCount: 0, ambiguousOuterCount: 0,
    },
  ]);
});

test('PA-5 revalidates hostile source models fail closed', () => {
  const source = sourceModel(score(note('C')));
  const hostile = new Proxy(source, {});
  assert.throws(
    () => createDeterministicVoiceAnalysis(hostile),
    (error) => error && error.code === 'INVALID_POLYPHONIC_SOURCE_MODEL',
  );
});

test('PA-5 remains deadline-bounded and cancellation-aware', () => {
  const source = sourceModel(score([
    note('C', { octave: 4 }),
    backup(),
    note('E', { octave: 4, voice: '2' }),
  ].join('')));

  let now = 0;
  const deadlineRuntime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 1 },
    { clock: () => { now += 1; return now; } },
  );
  assert.throws(
    () => createDeterministicVoiceAnalysis(source, deadlineRuntime),
    (error) => error && error.code === 'PROCESSING_DEADLINE_EXCEEDED',
  );

  const controller = new AbortController();
  controller.abort();
  const cancelledRuntime = createMusicXmlProcessingRuntime({ signal: controller.signal });
  assert.throws(
    () => createDeterministicVoiceAnalysis(source, cancelledRuntime),
    (error) => error && error.code === 'PROCESSING_ABORTED',
  );
});

test('PA-5 returns deeply immutable analysis without arrangement or guitar authority', () => {
  const model = createDeterministicVoiceAnalysis(sourceModel(score(note('C'))));

  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.source), true);
  assert.equal(Object.isFrozen(model.grouping), true);
  assert.equal(Object.isFrozen(model.eventAnalyses), true);
  assert.equal(Object.isFrozen(model.eventAnalyses[0]), true);
  assert.equal(Object.isFrozen(model.voiceSummaries), true);
  assert.equal(Object.isFrozen(model.voiceSummaries[0]), true);

  for (const entry of model.eventAnalyses) {
    for (const forbidden of ['decisionType', 'targetPitch', 'targetVoice', 'string', 'fret', 'finger', 'barre']) {
      assert.equal(forbidden in entry, false);
    }
  }
});