'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageRoot = require('../src');
const {
  createPolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sem06', 'semantic_baseline.musicxml');

function loadProjectionApi() {
  let api;
  assert.doesNotThrow(() => {
    api = require('../src/semantic/guitarSourceSemanticProjection');
  });
  return api;
}

function pinnedSourceModel() {
  const xml = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function duplicateUnisonModel() {
  return createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: { format: 'score-partwise', musicXmlVersion: '4.0', partId: 'P1' },
    measureCount: 1,
    eventCount: 2,
    measures: [{
      measureId: 'P1:measure:0',
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events: [
        {
          sourceEventId: 'P1:measure:0:note:0',
          sourceOrder: 0,
          type: 'note',
          voice: '1',
          staff: 1,
          onsetDivisions: 0,
          durationDivisions: 4,
          pitch: { step: 'C', alter: 0, octave: 4, midi: 60, written: 'C4' },
          tieStart: false,
          tieStop: false,
          source: {
            partId: 'P1',
            measureIndex: 0,
            measureNumber: '1',
            noteIndex: 0,
            chordWithPrevious: false,
          },
        },
        {
          sourceEventId: 'P1:measure:0:note:1',
          sourceOrder: 1,
          type: 'note',
          voice: '1',
          staff: 1,
          onsetDivisions: 0,
          durationDivisions: 4,
          pitch: { step: 'C', alter: 0, octave: 4, midi: 60, written: 'C4' },
          tieStart: false,
          tieStop: false,
          source: {
            partId: 'P1',
            measureIndex: 0,
            measureNumber: '1',
            noteIndex: 1,
            chordWithPrevious: true,
          },
        },
      ],
    }],
  });
}

function assertNoGuitarAuthorityKeys(value) {
  const forbidden = new Set([
    'string',
    'stringNumber',
    'fret',
    'finger',
    'barre',
    'handPosition',
    'arrangement',
    'arrangementScore',
  ]);

  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') continue;
    for (const [key, nested] of Object.entries(current)) {
      assert.equal(forbidden.has(key), false, `projection must not expose ${key}`);
      if (nested && typeof nested === 'object') stack.push(nested);
    }
  }
}

test('SEM-06B keeps Guitar semantic projection internal to the package', () => {
  const api = loadProjectionApi();

  assert.equal(typeof api.projectGuitarSourceSemantics, 'function');
  assert.equal(packageRoot.projectGuitarSourceSemantics, undefined);
});

test('SEM-06B projects deterministic read-only source semantics from the pinned real source model', () => {
  const { projectGuitarSourceSemantics } = loadProjectionApi();
  const sourceModel = pinnedSourceModel();
  const before = JSON.stringify(sourceModel);

  const result = projectGuitarSourceSemantics(sourceModel);

  assert.equal(result.status, 'PASS');
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.projection.schemaVersion, 'st-guitar-source-semantic-projection-v1');
  assert.equal(result.projection.partId, 'P1');
  assert.equal(result.projection.measureCount, 2);
  assert.deepEqual(result.projection.meters, [
    { measureIndex: 0, divisions: 4, beats: 4, beatType: 4 },
    { measureIndex: 1, divisions: 4, beats: 4, beatType: 4 },
  ]);
  assert.deepEqual(result.projection.notes, [
    {
      measureIndex: 0,
      sourceOrder: 0,
      pitchMidi: 60,
      onsetDivisions: 0,
      durationDivisions: 8,
      voice: '1',
      staff: 1,
      tieStart: false,
      tieStop: false,
    },
    {
      measureIndex: 0,
      sourceOrder: 2,
      pitchMidi: 55,
      onsetDivisions: 0,
      durationDivisions: 16,
      voice: '2',
      staff: 1,
      tieStart: false,
      tieStop: false,
    },
    {
      measureIndex: 0,
      sourceOrder: 1,
      pitchMidi: 62,
      onsetDivisions: 8,
      durationDivisions: 8,
      voice: '1',
      staff: 1,
      tieStart: true,
      tieStop: false,
    },
    {
      measureIndex: 1,
      sourceOrder: 0,
      pitchMidi: 62,
      onsetDivisions: 0,
      durationDivisions: 4,
      voice: '1',
      staff: 1,
      tieStart: false,
      tieStop: true,
    },
    {
      measureIndex: 1,
      sourceOrder: 2,
      pitchMidi: 57,
      onsetDivisions: 0,
      durationDivisions: 16,
      voice: '2',
      staff: 1,
      tieStart: false,
      tieStop: false,
    },
    {
      measureIndex: 1,
      sourceOrder: 1,
      pitchMidi: 64,
      onsetDivisions: 4,
      durationDivisions: 12,
      voice: '1',
      staff: 1,
      tieStart: false,
      tieStop: false,
    },
  ]);
  assert.equal(result.projection.contextSupport.keySignatures, false);
  assert.equal(result.projection.contextSupport.clefs, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.projection));
  assert.ok(Object.isFrozen(result.projection.notes));
  assert.equal(JSON.stringify(sourceModel), before);
  assertNoGuitarAuthorityKeys(result);
});

test('SEM-06B is deterministic across repeated projection', () => {
  const { projectGuitarSourceSemantics } = loadProjectionApi();
  const sourceModel = pinnedSourceModel();

  const first = projectGuitarSourceSemantics(sourceModel);
  const second = projectGuitarSourceSemantics(sourceModel);

  assert.deepEqual(first, second);
});

test('SEM-06B fails closed on duplicate-unison structural ambiguity', () => {
  const { projectGuitarSourceSemantics } = loadProjectionApi();

  const result = projectGuitarSourceSemantics(duplicateUnisonModel());

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, ['AMBIGUOUS_DUPLICATE_UNISON']);
  assert.equal(result.projection, null);
  assertNoGuitarAuthorityKeys(result);
});
