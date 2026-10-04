'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createEdtab04dSessionStore } = require('../src/app/edtab04dSessionStore');

const fileName = 'teacher.musicxml';
const sourceBytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Physical review</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
<backup><duration>16</duration></backup>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>
</measure></part></score-partwise>`);

function correction(overrides = {}) {
  return {
    patch_id: 'teacher-pitch-1',
    edit_class: 'PITCH_UPDATE',
    target_event: 'P1:measure:0:note:1',
    before: { step: 'A', alter: 0, octave: 5 },
    after: { step: 'C', alter: 0, octave: 5 },
    ...overrides,
  };
}

test('server-owned Stage 06 session saves an exact correction and consumes it once', () => {
  const store = createEdtab04dSessionStore();
  const opened = store.open({ fileName, sourceBytes });
  assert.match(opened.token, /^[0-9a-f]{64}$/);
  assert.equal(opened.capabilities.capabilities.PITCH_UPDATE, 'BOUNDED');
  assert.deepEqual(store.apply(opened.token, correction()).patchIds, ['teacher-pitch-1']);
  const validation = store.saveAndRevalidate(opened.token);
  assert.equal(validation.validationState, 'VALID');
  const internal = store.consumeValidated(opened.token);
  assert.equal(internal.session.revalidated_revision.validation_state, 'VALID');
  assert.throws(() => store.consumeValidated(opened.token), /Unknown or expired/);
});

test('finalize grants one-time canonical output only after exact teacher position parity', () => {
  const store = createEdtab04dSessionStore();
  const opened = store.open({ fileName, sourceBytes });
  store.apply(opened.token, correction());
  store.saveAndRevalidate(opened.token);

  const finalized = store.finalize(opened.token, {
    baseRevisionId: opened.draftBaseRevisionId,
    commands: [{
      sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 1, fret: 17 },
    }],
  });

  assert.equal(finalized.status, 'APPROVED');
  assert.equal(finalized.route, 'POLY_V2');
  assert.equal(finalized.matchedCount, 1);
  assert.equal(finalized.canonicalTabResult.documentType, 'CanonicalTabResult');
  assert.equal(typeof finalized.musicXml, 'string');
  assert.equal(finalized.musicXml.length > 0, true);
  assert.equal(finalized.approvedRevision.state, 'APPROVED_CANONICAL_SCORE');
  assert.throws(() => store.finalize(opened.token, {
    baseRevisionId: opened.draftBaseRevisionId,
    commands: [],
  }), /Unknown or expired/);
});

test('finalize withholds canonical output on position mismatch without consuming the session', () => {
  const store = createEdtab04dSessionStore();
  const opened = store.open({ fileName, sourceBytes });
  store.apply(opened.token, correction());
  store.saveAndRevalidate(opened.token);

  assert.throws(() => store.finalize(opened.token, {
    baseRevisionId: opened.draftBaseRevisionId,
    commands: [{
      sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 2, fret: 22 },
    }],
  }), /Teacher position parity was not proven/);

  const finalized = store.finalize(opened.token, {
    baseRevisionId: opened.draftBaseRevisionId,
    commands: [{
      sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 1, fret: 17 },
    }],
  });
  assert.equal(finalized.status, 'APPROVED');
});

test('forged, cross-store, expired and mismatched teacher sessions fail closed', () => {
  let time = Date.parse('2026-10-03T15:00:00.000Z');
  const store = createEdtab04dSessionStore({ now: () => time });
  const opened = store.open({ fileName, sourceBytes });
  assert.throws(() => store.apply('0'.repeat(64), correction()), /Unknown or expired/);
  assert.throws(() => createEdtab04dSessionStore().apply(opened.token, correction()),
    /Unknown or expired/);
  assert.throws(() => store.apply(opened.token, correction({
    before: { step: 'G', alter: 0, octave: 5 },
  })));
  assert.throws(() => store.consumeValidated(opened.token), /VALID correction/);
  time += 15 * 60 * 1000;
  assert.throws(() => store.apply(opened.token, correction()), /Unknown or expired/);
});
