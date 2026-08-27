'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  SUSTAINED_POLYPHONIC_PATH_SELECTION_VERSION,
  SUSTAINED_POLYPHONIC_PATH_SELECTION_AUTHORITY,
  createSustainedPolyphonicPathSelection,
} = require('../src/music/sustainedPolyphonicPathSolver');

const CORPUS = Object.freeze([
  Object.freeze({ file: 'ps6-counterpoint-2v.musicxml', expectedVoices: Object.freeze(['1', '2']), expectedPeakNotes: 2 }),
  Object.freeze({ file: 'ps6-counterpoint-3v.musicxml', expectedVoices: Object.freeze(['1', '2', '3']), expectedPeakNotes: 3 }),
  Object.freeze({ file: 'ps6-counterpoint-4v.musicxml', expectedVoices: Object.freeze(['1', '2', '3', '4']), expectedPeakNotes: 4 }),
]);

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function project(name) {
  const runtime = createMusicXmlProcessingRuntime();
  return projectParsedMusicXmlToPolyphonicSourceModel(
    parseParsedMusicXmlDocument(fixture(name), {}, runtime),
    runtime,
  );
}

function noteVoices(source) {
  return [...new Set(source.measures.flatMap((measure) => (
    measure.events.filter((event) => event.type === 'note').map((event) => event.voice)
  )))].sort();
}

function selectedVoices(selection) {
  return [...new Set(selection.logicalNoteSelections.map((entry) => entry.voice))].sort();
}

function peakSelectedNotes(selection) {
  return Math.max(...selection.selectedPointStates.map((point) => point.positions.length));
}

function assertUniqueStringsAtEveryPoint(selection) {
  for (const point of selection.selectedPointStates) {
    assert.equal(
      new Set(point.positions.map((position) => position.string)).size,
      point.positions.length,
      `${point.sonorityPointId} must not place two active notes on one string`,
    );
  }
}

for (const corpusCase of CORPUS) {
  test(`PS-6 exact sustained corpus gate: ${corpusCase.file}`, () => {
    const source = project(corpusCase.file);
    const first = createSustainedPolyphonicPathSelection(source);
    const second = createSustainedPolyphonicPathSelection(source);

    assert.deepEqual(noteVoices(source), corpusCase.expectedVoices);
    assert.deepEqual(selectedVoices(first), corpusCase.expectedVoices);
    assert.equal(peakSelectedNotes(first), corpusCase.expectedPeakNotes);
    assert.equal(first.contractVersion, SUSTAINED_POLYPHONIC_PATH_SELECTION_VERSION);
    assert.equal(first.authority, SUSTAINED_POLYPHONIC_PATH_SELECTION_AUTHORITY);
    assert.equal(first.pathCost.heldFingerSubstitutionCount, 0);
    assert.deepEqual(first, second);
    assertUniqueStringsAtEveryPoint(first);
  });
}

test('PS-6 four-voice gate proves staggered ATTACK/HOLD accumulation rather than a static chord only', () => {
  const selection = createSustainedPolyphonicPathSelection(project('ps6-counterpoint-4v.musicxml'));
  const accumulatingPoints = selection.selectedPointStates.filter((point) => point.positions.length > 0);

  assert.deepEqual(accumulatingPoints.map((point) => point.positions.length), [1, 2, 3, 4]);
  assert.deepEqual(accumulatingPoints.map((point) => point.attackLogicalNoteIds.length), [1, 1, 1, 1]);
  assert.deepEqual(accumulatingPoints.map((point) => point.holdLogicalNoteIds.length), [0, 1, 2, 3]);
});

test('PS-6 four-voice tie gate preserves a voice-1 sustain chain across a measure boundary while voices 2-4 enter later', () => {
  const source = project('ps6-counterpoint-4v-tie.musicxml');
  const first = createSustainedPolyphonicPathSelection(source);
  const second = createSustainedPolyphonicPathSelection(source);
  const chainId = 'P1:sustain-chain:0';
  const chain = first.logicalNoteSelections.find((entry) => entry.logicalNoteId === chainId);

  assert.deepEqual(noteVoices(source), ['1', '2', '3', '4']);
  assert.deepEqual(selectedVoices(first), ['1', '2', '3', '4']);
  assert.ok(chain);
  assert.equal(chain.voice, '1');
  assert.equal(chain.string, 6);
  assert.equal(chain.fret, 0);
  assert.equal(chain.initialFinger, 0);
  assert.equal(chain.finalFinger, 0);
  assert.equal(chain.fingerSubstitutionCount, 0);
  assert.equal(chain.sourceEventIds.length, 2);
  assert.ok(first.selectedPointStates.some((point) => (
    point.measureIndex === 1 && point.holdLogicalNoteIds.includes(chainId)
  )));
  assert.equal(peakSelectedNotes(first), 4);
  assert.equal(first.pathCost.heldFingerSubstitutionCount, 0);
  assert.deepEqual(first, second);
  assertUniqueStringsAtEveryPoint(first);
});
