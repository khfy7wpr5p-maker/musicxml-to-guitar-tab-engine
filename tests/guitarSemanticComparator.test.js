'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageRoot = require('../src');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'sem06');

function loadComparatorApi() {
  let api;
  assert.doesNotThrow(() => {
    api = require('../src/semantic/guitarSemanticComparator');
  });
  return api;
}

function loadReferenceBundle() {
  return {
    sourceBytes: fs.readFileSync(path.join(FIXTURE_DIR, 'semantic_baseline.musicxml')),
    snapshot: JSON.parse(fs.readFileSync(
      path.join(FIXTURE_DIR, 'semantic_baseline.expected.json'),
      'utf8',
    )),
    provenance: JSON.parse(fs.readFileSync(
      path.join(FIXTURE_DIR, 'semantic_baseline.provenance.json'),
      'utf8',
    )),
  };
}

function guitarProjectionResult() {
  return Object.freeze({
    status: 'PASS',
    diagnostics: Object.freeze([]),
    projection: Object.freeze({
      schemaVersion: 'st-guitar-source-semantic-projection-v1',
      partId: 'P1',
      measureCount: 2,
      meters: Object.freeze([
        Object.freeze({ measureIndex: 0, divisions: 4, beats: 4, beatType: 4 }),
        Object.freeze({ measureIndex: 1, divisions: 4, beats: 4, beatType: 4 }),
      ]),
      notes: Object.freeze([
        Object.freeze({
          measureIndex: 0,
          sourceOrder: 0,
          pitchMidi: 60,
          onsetDivisions: 0,
          durationDivisions: 8,
          voice: '1',
          staff: 1,
          tieStart: false,
          tieStop: false,
        }),
        Object.freeze({
          measureIndex: 0,
          sourceOrder: 2,
          pitchMidi: 55,
          onsetDivisions: 0,
          durationDivisions: 16,
          voice: '2',
          staff: 1,
          tieStart: false,
          tieStop: false,
        }),
        Object.freeze({
          measureIndex: 0,
          sourceOrder: 1,
          pitchMidi: 62,
          onsetDivisions: 8,
          durationDivisions: 8,
          voice: '1',
          staff: 1,
          tieStart: true,
          tieStop: false,
        }),
        Object.freeze({
          measureIndex: 1,
          sourceOrder: 0,
          pitchMidi: 62,
          onsetDivisions: 0,
          durationDivisions: 4,
          voice: '1',
          staff: 1,
          tieStart: false,
          tieStop: true,
        }),
        Object.freeze({
          measureIndex: 1,
          sourceOrder: 2,
          pitchMidi: 57,
          onsetDivisions: 0,
          durationDivisions: 16,
          voice: '2',
          staff: 1,
          tieStart: false,
          tieStop: false,
        }),
        Object.freeze({
          measureIndex: 1,
          sourceOrder: 1,
          pitchMidi: 64,
          onsetDivisions: 4,
          durationDivisions: 12,
          voice: '1',
          staff: 1,
          tieStart: false,
          tieStop: false,
        }),
      ]),
      contextSupport: Object.freeze({
        keySignatures: false,
        clefs: false,
      }),
    }),
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
      assert.equal(forbidden.has(key), false, `comparison must not expose ${key}`);
      if (nested && typeof nested === 'object') stack.push(nested);
    }
  }
}

test('SEM-06C keeps semantic comparison internal to the package', () => {
  const api = loadComparatorApi();

  assert.equal(typeof api.compareGuitarSourceWithSemanticReference, 'function');
  assert.equal(packageRoot.compareGuitarSourceWithSemanticReference, undefined);
});

test('SEM-06C returns PASS for the exact represented semantics and marks unavailable contexts unverified', () => {
  const { compareGuitarSourceWithSemanticReference } = loadComparatorApi();

  const result = compareGuitarSourceWithSemanticReference({
    guitarProjection: guitarProjectionResult(),
    referenceBundle: loadReferenceBundle(),
  });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.unverifiedContexts, ['clefs', 'keySignatures']);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.diagnostics));
  assert.ok(Object.isFrozen(result.unverifiedContexts));
  assertNoGuitarAuthorityKeys(result);
});

test('SEM-06C reports deterministic pitch mismatch without guessing cross-engine IDs', () => {
  const { compareGuitarSourceWithSemanticReference } = loadComparatorApi();
  const referenceBundle = loadReferenceBundle();
  referenceBundle.snapshot = cloneJson(referenceBundle.snapshot);
  referenceBundle.snapshot.notes.find((note) => note.source_id === 'n1').pitch_midi = 61;

  const result = compareGuitarSourceWithSemanticReference({
    guitarProjection: guitarProjectionResult(),
    referenceBundle,
  });

  assert.equal(result.status, 'DIAGNOSTIC');
  assert.deepEqual(result.diagnostics, [{
    code: 'PITCH_MISMATCH',
    measureIndex: 0,
    onsetDiv: 0,
    voice: '1',
    staff: 1,
    guitarPitchMidi: 60,
    semanticPitchMidi: 61,
  }]);
  assertNoGuitarAuthorityKeys(result);
});

test('SEM-06C reports meter mismatch deterministically', () => {
  const { compareGuitarSourceWithSemanticReference } = loadComparatorApi();
  const referenceBundle = loadReferenceBundle();
  referenceBundle.snapshot = cloneJson(referenceBundle.snapshot);
  referenceBundle.snapshot.time_signatures[0].beats = 3;

  const result = compareGuitarSourceWithSemanticReference({
    guitarProjection: guitarProjectionResult(),
    referenceBundle,
  });

  assert.equal(result.status, 'DIAGNOSTIC');
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ['METER_MISMATCH', 'METER_MISMATCH'],
  );
});

test('SEM-06C fails closed on ambiguous structural matching', () => {
  const { compareGuitarSourceWithSemanticReference } = loadComparatorApi();
  const referenceBundle = loadReferenceBundle();
  referenceBundle.snapshot = cloneJson(referenceBundle.snapshot);
  const duplicate = {
    ...referenceBundle.snapshot.notes[0],
    source_id: 'different-cross-engine-id',
    pitch_midi: 61,
  };
  referenceBundle.snapshot.notes.push(duplicate);

  const result = compareGuitarSourceWithSemanticReference({
    guitarProjection: guitarProjectionResult(),
    referenceBundle,
  });

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, [{
    code: 'AMBIGUOUS_STRUCTURAL_MATCH',
  }]);
});

test('SEM-06C does not compare an unadmitted semantic reference', () => {
  const { compareGuitarSourceWithSemanticReference } = loadComparatorApi();
  const referenceBundle = loadReferenceBundle();
  referenceBundle.provenance = {
    ...referenceBundle.provenance,
    semanticEngineCommit: '0000000000000000000000000000000000000000',
  };

  const result = compareGuitarSourceWithSemanticReference({
    guitarProjection: guitarProjectionResult(),
    referenceBundle,
  });

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, [{
    code: 'REFERENCE_NOT_ADMITTED',
    cause: 'SEMANTIC_ENGINE_COMMIT_MISMATCH',
  }]);
});

test('SEM-06C propagates unsupported Guitar projection as non-authoritative semantic evidence', () => {
  const { compareGuitarSourceWithSemanticReference } = loadComparatorApi();

  const result = compareGuitarSourceWithSemanticReference({
    guitarProjection: Object.freeze({
      status: 'UNSUPPORTED',
      diagnostics: Object.freeze(['AMBIGUOUS_DUPLICATE_UNISON']),
      projection: null,
    }),
    referenceBundle: loadReferenceBundle(),
  });

  assert.equal(result.status, 'UNSUPPORTED');
  assert.deepEqual(result.diagnostics, [{
    code: 'GUITAR_PROJECTION_UNSUPPORTED',
    cause: 'AMBIGUOUS_DUPLICATE_UNISON',
  }]);
});
