'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  EDIT_CONTENT_TYPE,
  MAX_EDIT_COMMAND_BYTES,
  createRuntimeHttpServer,
} = require('../src/app/runtimeHttpHost');

const repositoryRoot = path.resolve(__dirname, '..');
const polyFixture = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/pa12-polyphonic-e2e.musicxml'),
);

function editBody(commands, sourceBytes) {
  const metadata = Buffer.from(JSON.stringify(commands), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(metadata.length, 0);
  return Buffer.concat([header, metadata, sourceBytes]);
}

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
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: editBody(commands, polyFixture),
    },
  ));

  assert.equal(edit.response.status, 400);
  assert.equal(edit.payload.code, 'INVALID_POLYPHONIC_EDIT_REQUEST');
  assert.match(edit.payload.message, /unknown field/i);
});

test('framed edit metadata budget covers the maximum bounded 128-command POLY_V2 schema shape', () => {
  function boundedId(commandIndex, groupIndex) {
    const suffix = `${commandIndex.toString().padStart(3, '0')}-${groupIndex.toString().padStart(2, '0')}`;
    return `${'乐'.repeat(256 - suffix.length)}${suffix}`;
  }

  const commands = Array.from({length: 128}, (_, commandIndex) => ({
    measureIndex: commandIndex,
    sourceOrder: commandIndex,
    sourceEventId: boundedId(commandIndex, 64),
    sourceGroupId: boundedId(commandIndex, 65),
    sourceGroupEventIds: Array.from(
      {length: 64},
      (_, groupIndex) => boundedId(commandIndex, groupIndex),
    ),
    pitch: {step: 'C', alter: -2, octave: 4},
  }));

  for (const command of commands) {
    assert.equal(new Set(command.sourceGroupEventIds).size, 64);
    assert.ok(command.sourceEventId.length <= 256);
    assert.ok(command.sourceGroupId.length <= 256);
    assert.ok(command.sourceGroupEventIds.every(id => id.length <= 256));
  }

  const metadataBytes = Buffer.byteLength(JSON.stringify(commands), 'utf8');
  assert.ok(metadataBytes > 48 * 1024);
  assert.ok(metadataBytes <= MAX_EDIT_COMMAND_BYTES);
});
