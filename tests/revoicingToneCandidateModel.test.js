'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const publicApi = require('../src');
const { positionToMidi } = require('../src/guitar/fretboard');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  REVOICING_TONE_CANDIDATE_POLICY,
  RevoicingToneCandidateModelError,
  createRevoicingToneCandidateModel,
} = require('../src/benchmark/revoicingToneCandidateModel');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_ROOT = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'fixtures');

function sourceModel(filename) {
  const xml = fs.readFileSync(path.join(FIXTURE_ROOT, filename), 'utf8');
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function pitch(midi, written) {
  const step = written[0];
  const octave = Number(written.slice(1));
  return { step, alter: 0, octave, midi, written };
}

function duplicatePitchClassSource() {
  const events = [
    {
      sourceEventId: createSourceEventId('P1', 0, 0),
      sourceOrder: 0,
      type: 'note',
      voice: '1',
      staff: 1,
      onsetDivisions: 0,
      durationDivisions: 4,
      pitch: pitch(60, 'C4'),
      tieStart: false,
      tieStop: false,
      source: {
        partId: 'P1', measureIndex: 0, measureNumber: '1', noteIndex: 0, chordWithPrevious: false,
      },
    },
    {
      sourceEventId: createSourceEventId('P1', 0, 1),
      sourceOrder: 1,
      type: 'note',
      voice: '1',
      staff: 1,
      onsetDivisions: 0,
      durationDivisions: 4,
      pitch: pitch(72, 'C5'),
      tieStart: false,
      tieStop: false,
      source: {
        partId: 'P1', measureIndex: 0, measureNumber: '1', noteIndex: 1, chordWithPrevious: true,
      },
    },
  ];
  return createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: { format: 'score-partwise', musicXmlVersion: null, partId: 'P1' },
    measureCount: 1,
    eventCount: 2,
    measures: [{
      measureId: createMeasureId('P1', 0),
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events,
    }],
  });
}

function assertCandidateInvariants(model) {
  for (const group of model.groups) {
    for (const source of group.sources) {
      assert.ok(source.candidateCount > 0);
      assert.equal(source.candidateCount, source.candidates.length);
      const positions = new Set();
      for (const candidate of source.candidates) {
        assert.equal(candidate.sourceEventId, source.sourceEventId);
        assert.equal(candidate.sourceMidi, source.sourceMidi);
        assert.equal(candidate.sourcePitchClass, source.sourcePitchClass);
        assert.equal(((candidate.targetMidi % 12) + 12) % 12, source.sourcePitchClass);
        assert.equal(Math.abs(candidate.octaveShiftSemitones % 12), 0);
        assert.equal(positionToMidi({ string: candidate.string, fret: candidate.fret }), candidate.targetMidi);
        assert.ok(candidate.fret >= 0 && candidate.fret <= 20);
        const key = `${candidate.string}:${candidate.fret}`;
        assert.equal(positions.has(key), false);
        positions.add(key);
      }
    }
  }
}

test('PA-11.4A enumerates complete pitch-class realization atoms for the triad fixture without gold input', () => {
  const model = createRevoicingToneCandidateModel(sourceModel('three-note-triad.musicxml'));
  assert.equal(model.documentType, 'RevoicingToneCandidateModel');
  assert.equal(model.contractVersion, '1.0.0');
  assert.equal(model.policy, REVOICING_TONE_CANDIDATE_POLICY);
  assert.equal(model.mode, 'evaluation-only');
  assert.equal(model.authority, 'none');
  assert.deepEqual(model.registerEnvelope, {
    minimumMidi: 40,
    maximumMidi: 84,
    minimumFret: 0,
    maximumFret: 20,
  });
  assert.equal(model.groupCount, 1);
  assert.equal(model.groups[0].sourceEventCount, 3);
  assertCandidateInvariants(model);

  for (const source of model.groups[0].sources) {
    assert.ok(source.candidates.some((candidate) => candidate.targetMidi < source.sourceMidi));
    assert.ok(source.candidates.some((candidate) => candidate.targetMidi === source.sourceMidi));
    assert.ok(source.candidates.some((candidate) => candidate.targetMidi > source.sourceMidi));
  }
});

test('PA-11.4A enumerates the four unique Cmaj7 pitch classes without adding foreign pitch classes', () => {
  const model = createRevoicingToneCandidateModel(sourceModel('four-note-reduction.musicxml'));
  assert.equal(model.groupCount, 1);
  assert.equal(model.groups[0].sourceEventCount, 4);
  assert.deepEqual(
    model.groups[0].sources.map((source) => source.sourceMidi),
    [60, 64, 67, 71],
  );
  assert.deepEqual(
    model.groups[0].sources.map((source) => source.sourcePitchClass),
    [0, 4, 7, 11],
  );
  assertCandidateInvariants(model);
});

test('PA-11.4A exposes multiple octave/string atoms per source so later voice redistribution can duplicate a pitch class', () => {
  const model = createRevoicingToneCandidateModel(sourceModel('three-note-triad.musicxml'));
  const cSource = model.groups[0].sources.find((source) => source.sourcePitchClass === 0);
  const eSource = model.groups[0].sources.find((source) => source.sourcePitchClass === 4);
  assert.ok(cSource.candidates.filter((candidate) => candidate.targetMidi !== cSource.sourceMidi).length >= 2);
  assert.ok(eSource.candidates.filter((candidate) => candidate.targetMidi !== eSource.sourceMidi).length >= 2);
  assert.ok(new Set(cSource.candidates.map((candidate) => candidate.string)).size >= 3);
  assert.ok(new Set(eSource.candidates.map((candidate) => candidate.string)).size >= 3);
});

test('PA-11.4A is deterministic, deeply frozen, and does not select a voicing', () => {
  const source = sourceModel('three-note-triad.musicxml');
  const first = createRevoicingToneCandidateModel(source);
  const second = createRevoicingToneCandidateModel(source);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.groups), true);
  assert.equal(Object.isFrozen(first.groups[0].sources[0].candidates), true);
  assert.equal(Object.hasOwn(first.groups[0], 'selectedShape'), false);
  assert.equal(Object.hasOwn(first.groups[0], 'preferredArrangementId'), false);
});

test('PA-11.4A fails closed for duplicate source pitch classes until mapping ambiguity receives a later contract', () => {
  assert.throws(
    () => createRevoicingToneCandidateModel(duplicatePitchClassSource()),
    (error) => error instanceof RevoicingToneCandidateModelError
      && error.code === 'INVALID_REVOICING_TONE_CANDIDATE_MODEL',
  );
});

test('PA-11.4A remains internal and production package exports are unchanged', () => {
  assert.equal(Object.hasOwn(publicApi, 'createRevoicingToneCandidateModel'), false);
  assert.equal(Object.hasOwn(publicApi, 'REVOICING_TONE_CANDIDATE_POLICY'), false);
});
