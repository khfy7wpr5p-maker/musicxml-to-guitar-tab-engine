'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createRuntimeHttpServer } = require('../src/app/runtimeHttpHost');

const sourceBytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Physical review</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
<backup><duration>16</duration></backup>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>
</measure></part></score-partwise>`);

async function start(t) {
  const server = createRuntimeHttpServer({ repositoryRoot: path.resolve(__dirname, '..') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function command(token, patch) {
  return { token, patch: {
    patch_id: 'teacher-pitch-1', edit_class: 'PITCH_UPDATE',
    target_event: 'P1:measure:0:note:1',
    before: { step: 'A', alter: 0, octave: 5 },
    after: { step: 'C', alter: 0, octave: 5 },
    ...patch,
  } };
}

async function postJson(origin, route, body) {
  const response = await fetch(`${origin}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

test('HTTP host owns the teacher revision; browser receives only token and bounded results', async (t) => {
  const origin = await start(t);
  const response = await fetch(`${origin}/api/review/session?fileName=teacher.musicxml`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream' },
    body: sourceBytes,
  });
  assert.equal(response.status, 200);
  const opened = await response.json();
  assert.match(opened.token, /^[0-9a-f]{64}$/);
  assert.equal(opened.session, undefined);
  const applied = await postJson(origin, '/api/review/patch', command(opened.token));
  assert.equal(applied.response.status, 200);
  assert.deepEqual(applied.data.patchIds, ['teacher-pitch-1']);
  const validated = await postJson(origin, '/api/review/revalidate', { token: opened.token });
  assert.equal(validated.response.status, 200);
  assert.equal(validated.data.validationState, 'VALID');
  assert.equal(validated.data.canonicalTabResult, undefined);
  assert.equal(validated.data.export, undefined);

  const finalized = await postJson(origin, '/api/review/finalize', {
    token: opened.token,
    baseRevisionId: opened.draftBaseRevisionId,
    commands: [{
      sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 1, fret: 17 },
    }],
  });
  assert.equal(finalized.response.status, 200);
  assert.equal(finalized.data.status, 'APPROVED');
  assert.equal(finalized.data.route, 'POLY_V2');
  assert.equal(finalized.data.canonicalTabResult.documentType, 'CanonicalTabResult');
  assert.equal(typeof finalized.data.musicXml, 'string');

  const replay = await postJson(origin, '/api/review/finalize', {
    token: opened.token,
    baseRevisionId: opened.draftBaseRevisionId,
    commands: [],
  });
  assert.equal(replay.response.status, 400);
  assert.match(replay.data.message, /Unknown or expired/);
});

test('HTTP host rejects forged session fields, cross-server tokens and oversized JSON', async (t) => {
  const origin = await start(t);
  const other = await start(t);
  const response = await fetch(`${origin}/api/review/session?fileName=teacher.musicxml`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: sourceBytes,
  });
  const opened = await response.json();
  const forged = await postJson(origin, '/api/review/patch', {
    ...command(opened.token), session: { phase: 'REVALIDATED' },
  });
  assert.equal(forged.response.status, 400);
  assert.equal(forged.data.code, 'INVALID_TEACHER_COMMAND');
  const crossServer = await postJson(other, '/api/review/patch', command(opened.token));
  assert.equal(crossServer.response.status, 400);
  assert.match(crossServer.data.message, /Unknown or expired/);
  const oversized = await postJson(origin, '/api/review/revalidate', {
    token: opened.token, padding: 'a'.repeat(16 * 1024),
  });
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.data.code, 'REQUEST_TOO_LARGE');
});
