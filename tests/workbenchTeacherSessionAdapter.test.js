'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '../web/guitar-tab-workbench/host-adapters.js'),
  'utf8',
);

const SHA = 'a'.repeat(64);
const TOKEN = 'b'.repeat(64);
const BASE_REVISION = 'review-tab-draft-v1:base';

function response(payload, ok = true) {
  return {
    ok,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function reviewUpload() {
  return {
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    input: {sha256: SHA},
    capabilities: {editPitch: true},
    reviewTabDraft: {
      documentType: 'ReviewTabDraft',
      revisionId: BASE_REVISION,
    },
  };
}

function runtimeAdapter(fetch) {
  const window = {};
  vm.runInNewContext(source, {
    window,
    fetch,
    TextEncoder,
    DataView,
    URLSearchParams,
    Uint8Array,
  });
  return window.GuitarTabWorkbenchHostAdapters.createRuntimeApiAdapter({apiBaseUrl: '/api'});
}

test('runtime adapter keeps the teacher token private and sends only bounded commands', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({
      url,
      options: {
        ...options,
        body: options.body instanceof Uint8Array ? new Uint8Array(options.body) : options.body,
      },
    });
    if (url.startsWith('/api/upload?')) return response(reviewUpload());
    if (url.startsWith('/api/review/session?')) {
      return response({
        token: TOKEN,
        sourceSha256: SHA,
        draftBaseRevisionId: BASE_REVISION,
      });
    }
    if (url === '/api/review/patch') return response({phase: 'EDITING', patchIds: ['teacher-pitch-0001']});
    if (url === '/api/review/revalidate') return response({phase: 'REVALIDATED', validationState: 'VALID'});
    if (url === '/api/review/finalize') {
      return response({
        status: 'APPROVED',
        route: 'POLY_V2',
        canonicalTabResult: {documentType: 'CanonicalTabResult'},
        musicXml: '<score-partwise/>',
        approvedRevision: {state: 'APPROVED_CANONICAL_SCORE'},
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const adapter = runtimeAdapter(fetch);
  const bytes = new Uint8Array([1, 2, 3]);

  const uploaded = await adapter.upload({name: 'teacher.musicxml'}, bytes);
  assert.equal(uploaded.token, undefined);
  assert.equal(uploaded.status, 'REVIEW_REQUIRED');
  assert.equal(calls.length, 1);

  await adapter.applyTeacherPitchPatch({
    sourceEventId: 'P1:measure:0:note:1',
    before: {step: 'A', alter: 0, octave: 5},
    after: {step: 'C', alter: 0, octave: 5},
  });
  assert.deepEqual([...calls[1].options.body], [1, 2, 3]);
  const patchBody = JSON.parse(calls[2].options.body);
  assert.equal(patchBody.token, TOKEN);
  assert.deepEqual(patchBody.patch, {
    patch_id: 'teacher-pitch-0001',
    edit_class: 'PITCH_UPDATE',
    target_event: 'P1:measure:0:note:1',
    before: {step: 'A', alter: 0, octave: 5},
    after: {step: 'C', alter: 0, octave: 5},
  });

  const finalized = await adapter.finalizeTeacherReview({
    baseRevisionId: BASE_REVISION,
    commands: [{
      sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: {string: 1, fret: 17},
    }],
  });
  assert.equal(finalized.status, 'APPROVED');
  assert.equal(JSON.parse(calls[3].options.body).token, TOKEN);
  assert.deepEqual(JSON.parse(calls[4].options.body), {
    token: TOKEN,
    baseRevisionId: BASE_REVISION,
    commands: [{
      sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: {string: 1, fret: 17},
    }],
  });
  assert.equal(JSON.stringify(uploaded).includes(TOKEN), false);
  assert.equal(JSON.stringify(adapter).includes(TOKEN), false);
});

test('runtime adapter preserves a validated session for position retry and clears it on replacement', async () => {
  let finalizeCount = 0;
  let revalidateCount = 0;
  let returnReview = true;
  const fetch = async (url) => {
    if (url.startsWith('/api/upload?')) {
      return response(returnReview ? reviewUpload() : {status: 'PASS', route: 'MONO_V1'});
    }
    if (url.startsWith('/api/review/session?')) {
      return response({token: TOKEN, sourceSha256: SHA, draftBaseRevisionId: BASE_REVISION});
    }
    if (url === '/api/review/patch') return response({phase: 'EDITING'});
    if (url === '/api/review/revalidate') {
      revalidateCount += 1;
      return response({validationState: 'VALID'});
    }
    if (url === '/api/review/finalize') {
      finalizeCount += 1;
      if (finalizeCount === 1) {
        return response({message: 'Teacher position parity was not proven.'}, false);
      }
      return response({status: 'APPROVED'});
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const adapter = runtimeAdapter(fetch);
  await adapter.upload({name: 'teacher.musicxml'}, new Uint8Array([1]));
  await adapter.applyTeacherPitchPatch({
    sourceEventId: 'event-1',
    before: {step: 'A', alter: 0, octave: 5},
    after: {step: 'C', alter: 0, octave: 5},
  });
  const request = {
    baseRevisionId: BASE_REVISION,
    commands: [{sourceEventId: 'event-0', selectedPosition: {string: 1, fret: 17}}],
  };
  await assert.rejects(() => adapter.finalizeTeacherReview(request), /parity was not proven/);
  assert.equal((await adapter.finalizeTeacherReview(request)).status, 'APPROVED');
  assert.equal(revalidateCount, 1);

  returnReview = false;
  await adapter.upload({name: 'replacement.musicxml'}, new Uint8Array([2]));
  await assert.rejects(() => adapter.finalizeTeacherReview(request), /No trusted teacher session/);
});
