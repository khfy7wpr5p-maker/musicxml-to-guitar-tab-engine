'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  DETERMINISTIC_VOICE_ANALYSIS_VERSION,
  DETERMINISTIC_VOICE_ANALYSIS_DOCUMENT_TYPE,
  DETERMINISTIC_VOICE_ANALYSIS_BASIS,
  DETERMINISTIC_VOICE_ROLES,
  createDeterministicVoiceAnalysis,
} = require('../src/music/deterministicVoiceAnalysis');

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>PA-5</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, chord = false, voice = '1', staff = 1, rest = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}${rest ? '<rest/>' : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`}<duration>4</duration><voice>${voice}</voice><type>quarter</type><staff>${staff}</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function analyse(xml) {
  return createDeterministicVoiceAnalysis(sourceModel(xml));
}

function eventId(index) {
  return `P1:measure:0:note:${index}`;
}

function groupId(onset = 0) {
  return `P1:measure:0:simultaneous:${onset}`;
}

test('PA-5 fixes the internal analysis identity, basis and role vocabulary', () => {
  const model = analyse(score(note('C')));
  assert.equal(DETERMINISTIC_VOICE_ANALYSIS_VERSION, '1.0.0');
  assert.equal(DETERMINISTIC_VOICE_ANALYSIS_DOCUMENT_TYPE, 'DeterministicVoiceAnalysis');
  assert.equal(DETERMINISTIC_VOICE_ANALYSIS_BASIS, 'ONSET_LOCAL_REGISTER_1.0');
  assert.deepEqual(DETERMINISTIC_VOICE_ROLES, [
    'SOLE_NOTE',
    'MELODY_CANDIDATE',
    'BASS_CANDIDATE',
    'INNER_VOICE_CANDIDATE',
    'OUTER_VOICE_AMBIGUOUS',
  ]);
  assert.equal(model.analysisBasis, 'ONSET_LOCAL_REGISTER_1.0');
});

test('PA-5 classifies singleton onsets as SOLE_NOTE with no group id', () => {
  const model = analyse(score([note('C'), note('D')].join('')));
  assert.deepEqual(model.eventAnalyses.map(({ sourceEventId, sourceGroupId, role }) => ({ sourceEventId, sourceGroupId, role })), [
    { sourceEventId: eventId(0), sourceGroupId: null, role: 'SOLE_NOTE' },
    { sourceEventId: eventId(1), sourceGroupId: null, role: 'SOLE_NOTE' },
  ]);
});

test('PA-5 classifies same-onset lower, inner and upper register candidates deterministically', () => {
  const model = analyse(score([
    note('C'),
    note('E', { chord: true }),
    note('G', { chord: true }),
  ].join('')));
  assert.deepEqual(model.eventAnalyses.map(({ sourceEventId, sourceGroupId, role }) => ({ sourceEventId, sourceGroupId, role })), [
    { sourceEventId: eventId(0), sourceGroupId: groupId(), role: 'BASS_CANDIDATE' },
    { sourceEventId: eventId(1), sourceGroupId: groupId(), role: 'INNER_VOICE_CANDIDATE' },
    { sourceEventId: eventId(2), sourceGroupId: groupId(), role: 'MELODY_CANDIDATE' },
  ]);
});

test('PA-5 marks tied outer-register pitches ambiguous instead of selecting by source order', () => {
  const model = analyse(score([
    note('C'),
    note('G', { chord: true }),
    note('G', { chord: true }),
  ].join('')));
  assert.deepEqual(model.eventAnalyses.map((entry) => entry.role), [
    'BASS_CANDIDATE',
    'OUTER_VOICE_AMBIGUOUS',
    'OUTER_VOICE_AMBIGUOUS',
  ]);
});

test('PA-5 remains internal and does not expand package-root exports', () => {
  const publicApi = require('../src');
  assert.equal('createDeterministicVoiceAnalysis' in publicApi, false);
  assert.equal('DETERMINISTIC_VOICE_ANALYSIS_VERSION' in publicApi, false);
});