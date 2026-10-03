'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createEdtab04dTrustedPitchAdapter } = require('../src/app/edtab04dTrustedPitchAdapter');
const { normalizePatch, VALIDATION_STATE } = require('../src/app/teacherCorrectionRevision');

const source = fs.readFileSync(path.join(__dirname, 'fixtures/pa12-polyphonic-e2e.musicxml'));
const originalSha256 = crypto.createHash('sha256').update(source).digest('hex');

function createAdapter() {
  return createEdtab04dTrustedPitchAdapter({
    fileName: 'teacher.musicxml', sourceBytes: source,
  });
}

function patch(overrides = {}) {
  return normalizePatch({
    patch_id: 'teacher-pitch-1',
    edit_class: 'PITCH_UPDATE',
    target_event: 'P1:measure:0:note:0',
    before: { step: 'C', alter: 0, octave: 4 },
    after: { step: 'D', alter: 0, octave: 4 },
    ...overrides,
  });
}

test('trusted teacher pitch edit materializes source-bound note and independently re-enters upload', () => {
  const adapter = createAdapter();
  const chosen = patch();
  const applied = adapter.applyPatch({
    adapterState: adapter.initialState,
    patch: chosen,
    selectedTarget: chosen.target_event,
  });
  const validated = adapter.revalidate({
    adapterState: applied.adapterState,
    savedRevision: { patches: [chosen] },
  });
  assert.equal(applied.evidence.originalSha256, originalSha256);
  assert.equal(validated.validationState, VALIDATION_STATE.VALID);
  assert.equal(validated.validationEvidence.uploadStatus, 'PASS');
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), originalSha256);
  assert.equal(adapter.manifest.capabilities.DURATION_UPDATE, 'UNAVAILABLE');
  assert.equal(adapter.manifest.history.undo, false);
});

test('forged before pitch and wrong source event do not enter the trusted ledger', () => {
  const adapter = createAdapter();
  for (const changed of [
    patch({ before: { step: 'F', alter: 0, octave: 4 } }),
    patch({ target_event: 'P1:measure:99:note:0' }),
  ]) {
    assert.throws(() => adapter.applyPatch({
      adapterState: adapter.initialState,
      patch: changed,
      selectedTarget: changed.target_event,
    }));
  }
});

test('stale, replayed, and unsupported correction ledgers fail closed', () => {
  const adapter = createAdapter();
  const chosen = patch();
  assert.throws(() => adapter.applyPatch({
    adapterState: { originalSha256: '0'.repeat(64), patches: [] },
    patch: chosen, selectedTarget: chosen.target_event,
  }), /drifted/);
  const applied = adapter.applyPatch({
    adapterState: adapter.initialState,
    patch: chosen, selectedTarget: chosen.target_event,
  });
  assert.throws(() => adapter.applyPatch({
    adapterState: applied.adapterState, patch: chosen,
    selectedTarget: chosen.target_event,
  }), /Duplicate/);
  assert.throws(() => adapter.revalidate({
    adapterState: applied.adapterState, savedRevision: { patches: [] },
  }), /disagree/);
  assert.throws(() => adapter.applyPatch({
    adapterState: adapter.initialState,
    patch: patch({ edit_class: 'DURATION_UPDATE', before: { duration: 1 }, after: { duration: 2 } }),
    selectedTarget: chosen.target_event,
  }), /PITCH_UPDATE/);
});
