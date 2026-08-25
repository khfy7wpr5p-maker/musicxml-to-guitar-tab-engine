'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createRuntimeHttpServer } = require('../src/app/runtimeHttpHost');

const repositoryRoot = path.resolve(__dirname, '..');
const polyFixture = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/pa12-polyphonic-e2e.musicxml'),
);

async function startServer(t) {
  const server = createRuntimeHttpServer({ repositoryRoot });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function readJson(response) {
  return { response, payload: await response.json() };
}

test('runtime host keeps UI-07 browser tie metadata outside POLY_V2 edit authority', async (t) => {
  const origin = await startServer(t);
  const upload = await readJson(await fetch(`${origin}/api/upload?fileName=poly.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: polyFixture,
  }));
  assert.equal(upload.response.status, 200);
  assert.equal(upload.payload.status, 'PASS');
  assert.equal(upload.payload.route, 'POLY_V2');

  const commands = [{
    measureIndex: 0,
    sourceOrder: 0,
    sourceEventId: 'P1:measure:0:note:0',
    sourceGroupId: 'P1:measure:0:simultaneous:0',
    sourceGroupEventIds: ['P1:measure:0:note:0', 'P1:measure:0:note:4'],
    sourceTieEventIds: ['P1:measure:0:note:0'],
    pitch: {step: 'E', alter: 0, octave: 4},
  }];

  const edit = await readJson(await fetch(
    `${origin}/api/edit/poly-v2?fileName=poly.musicxml&sha=${upload.payload.input.sha256}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-st-edit-commands': JSON.stringify(commands),
      },
      body: polyFixture,
    },
  ));

  assert.equal(edit.response.status, 400);
  assert.equal(edit.payload.code, 'INVALID_POLYPHONIC_EDIT_REQUEST');
  assert.match(edit.payload.message, /unknown field/i);
});
