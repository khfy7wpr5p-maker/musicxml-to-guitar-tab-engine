'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const { createDeterministicVoiceAnalysis } = require('../src/music/deterministicVoiceAnalysis');

function score(notes) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-5 edge</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${notes}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
}

function analyse(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  const source = projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
  return createDeterministicVoiceAnalysis(source, runtime);
}

test('PA-5 marks tied lowest pitches ambiguous while preserving a unique highest candidate', () => {
  const model = analyse(score([
    note('C'),
    note('C', { chord: true }),
    note('G', { chord: true }),
  ].join('')));

  assert.deepEqual(model.eventAnalyses.map((entry) => entry.role), [
    'OUTER_VOICE_AMBIGUOUS',
    'OUTER_VOICE_AMBIGUOUS',
    'MELODY_CANDIDATE',
  ]);
});

test('PA-5 marks a same-pitch unison onset entirely ambiguous', () => {
  const model = analyse(score([
    note('E'),
    note('E', { chord: true }),
    note('E', { chord: true }),
  ].join('')));

  assert.deepEqual(model.eventAnalyses.map((entry) => entry.role), [
    'OUTER_VOICE_AMBIGUOUS',
    'OUTER_VOICE_AMBIGUOUS',
    'OUTER_VOICE_AMBIGUOUS',
  ]);
  assert.equal(model.voiceSummaries[0].ambiguousOuterCount, 3);
});

test('PA-5 source-lane summary counts bass, inner and melody candidates exactly', () => {
  const model = analyse(score([
    note('C'),
    note('E', { chord: true }),
    note('G', { chord: true }),
  ].join('')));

  assert.deepEqual(model.voiceSummaries, [{
    voice: '1',
    staff: 1,
    noteCount: 3,
    soleNoteCount: 0,
    melodyCandidateCount: 1,
    bassCandidateCount: 1,
    innerVoiceCandidateCount: 1,
    ambiguousOuterCount: 0,
  }]);
});