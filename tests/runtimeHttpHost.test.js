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
const monoFixture = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/parser-single-voice.musicxml'),
);
const polyFixture = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/pa12-polyphonic-e2e.musicxml'),
);

function editBody(commands, sourceBytes) {
  const metadata = Buffer.from(JSON.stringify(commands), 'utf8');
  assert.ok(metadata.length > 0 && metadata.length <= MAX_EDIT_COMMAND_BYTES);
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

async function json(response) {
  const payload = await response.json();
  return { response, payload };
}

test('runtime host health and Workbench shell are same-origin and bounded', async (t) => {
  const origin = await startServer(t);

  const health = await json(await fetch(`${origin}/healthz`));
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.status, 'ok');
  assert.equal(health.payload.service, 'guitar-tab-runtime-host');
  assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.response.headers.get('access-control-allow-origin'), null);

  const root = await fetch(`${origin}/`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/workbench/');

  const workbench = await fetch(`${origin}/workbench/`);
  assert.equal(workbench.status, 200);
  assert.match(await workbench.text(), /data-mode="runtime"/);

  const traversal = await fetch(`${origin}/workbench/%2e%2e/src/index.js`);
  assert.equal(traversal.status, 404);
});

test('runtime host accepts real MusicXML bytes and returns the authoritative upload result', async (t) => {
  const origin = await startServer(t);
  const result = await json(await fetch(`${origin}/api/upload?fileName=fixture.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: monoFixture,
  }));

  assert.equal(result.response.status, 200);
  assert.equal(result.payload.status, 'PASS');
  assert.equal(result.payload.route, 'MONO_V1');
  assert.equal(result.payload.input.fileName, 'fixture.musicxml');
  assert.match(result.payload.input.sha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof result.payload.musicXml, 'string');
  assert.ok(result.payload.musicXml.length > 0);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
});

test('runtime host wires cumulative monophonic edits to immutable source bytes', async (t) => {
  const origin = await startServer(t);
  const upload = await json(await fetch(`${origin}/api/upload?fileName=fixture.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: monoFixture,
  }));
  assert.equal(upload.payload.status, 'PASS');

  const commands = [{
    measureIndex: 0,
    eventIndex: 1,
    eventId: 'm1-e1',
    pitch: {step: 'G', alter: 0, octave: 4},
  }];
  const edit = await json(await fetch(
    `${origin}/api/edit?fileName=fixture.musicxml&sha=${upload.payload.input.sha256}`,
    {
      method: 'POST',
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: editBody(commands, monoFixture),
    },
  ));

  assert.equal(edit.response.status, 200);
  assert.equal(edit.payload.status, 'PASS');
  assert.equal(edit.payload.route, 'MONO_V1');
  assert.equal(edit.payload.revision.revisionNumber, 1);
  assert.equal(edit.payload.revision.appliedEdits[0].afterPitch.written, 'G4');
  assert.equal(edit.payload.input.sha256, upload.payload.input.sha256);
});

test('runtime host exposes the separated POLY_V2 edit endpoint without changing public package authority', async (t) => {
  const origin = await startServer(t);
  const upload = await json(await fetch(`${origin}/api/upload?fileName=poly.musicxml`, {
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
    pitch: {step: 'E', alter: 0, octave: 4},
  }];
  const edit = await json(await fetch(
    `${origin}/api/edit/poly-v2?fileName=poly.musicxml&sha=${upload.payload.input.sha256}`,
    {
      method: 'POST',
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: editBody(commands, polyFixture),
    },
  ));

  assert.equal(edit.response.status, 200);
  assert.equal(edit.payload.status, 'PASS');
  assert.equal(edit.payload.route, 'POLY_V2');
  assert.equal(edit.payload.revision.revisionNumber, 1);
  assert.equal(edit.payload.revision.appliedEdits[0].sourceEventId, 'P1:measure:0:note:0');
  assert.equal(edit.payload.revision.appliedEdits[0].afterPitch.written, 'E4');
});

test('runtime host exposes bounded document transposition without browser-side MusicXML mutation', async (t) => {
  const origin = await startServer(t);
  const upload = await json(await fetch(`${origin}/api/upload?fileName=fixture.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: monoFixture,
  }));
  assert.equal(upload.payload.status, 'PASS');

  const transposed = await json(await fetch(
    `${origin}/api/transpose?fileName=fixture.musicxml&sha=${upload.payload.input.sha256}&semitones=1&spelling=flats`,
    {
      method: 'POST',
      headers: {'content-type': 'application/octet-stream'},
      body: monoFixture,
    },
  ));
  assert.equal(transposed.response.status, 200);
  assert.equal(transposed.payload.status, 'PASS');
  assert.equal(transposed.payload.route, 'MONO_V1');
  assert.equal(transposed.payload.transposition.semitones, 1);
  assert.equal(transposed.payload.transposition.spelling, 'flats');
  assert.notEqual(transposed.payload.input.sha256, upload.payload.input.sha256);
  assert.match(transposed.payload.sourceMusicXml, /<step>F<\/step>/);
  assert.match(transposed.payload.musicXml, /<sign>TAB<\/sign>/);

  const invalid = await json(await fetch(
    `${origin}/api/transpose?fileName=fixture.musicxml&sha=${upload.payload.input.sha256}&semitones=1&targetKey=D`,
    {
      method: 'POST',
      headers: {'content-type': 'application/octet-stream'},
      body: monoFixture,
    },
  ));
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.payload.code, 'INVALID_TRANSPOSITION_QUERY');
});

test('runtime host transports Unicode POLY_V2 source identities through the UTF-8 edit body', async (t) => {
  const origin = await startServer(t);
  const unicodeFixture = Buffer.from(polyFixture.toString('utf8').split('P1').join('乐'), 'utf8');
  const upload = await json(await fetch(`${origin}/api/upload?fileName=unicode.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: unicodeFixture,
  }));
  assert.equal(upload.response.status, 200);
  assert.equal(upload.payload.status, 'PASS');
  assert.equal(upload.payload.route, 'POLY_V2');

  const commands = [{
    measureIndex: 0,
    sourceOrder: 0,
    sourceEventId: '乐:measure:0:note:0',
    sourceGroupId: '乐:measure:0:simultaneous:0',
    sourceGroupEventIds: ['乐:measure:0:note:0', '乐:measure:0:note:4'],
    pitch: {step: 'E', alter: 0, octave: 4},
  }];
  const edit = await json(await fetch(
    `${origin}/api/edit/poly-v2?fileName=unicode.musicxml&sha=${upload.payload.input.sha256}`,
    {
      method: 'POST',
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: editBody(commands, unicodeFixture),
    },
  ));

  assert.equal(edit.response.status, 200);
  assert.equal(edit.payload.status, 'PASS');
  assert.equal(edit.payload.revision.appliedEdits[0].sourceEventId, '乐:measure:0:note:0');
});

test('runtime host rejects transport misuse before engine execution', async (t) => {
  const origin = await startServer(t);

  const wrongType = await json(await fetch(`${origin}/api/upload?fileName=fixture.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'text/plain'},
    body: monoFixture,
  }));
  assert.equal(wrongType.response.status, 415);
  assert.equal(wrongType.payload.code, 'UNSUPPORTED_MEDIA_TYPE');

  const duplicateName = await json(await fetch(
    `${origin}/api/upload?fileName=a.musicxml&fileName=b.musicxml`,
    {
      method: 'POST',
      headers: {'content-type': 'application/octet-stream'},
      body: monoFixture,
    },
  ));
  assert.equal(duplicateName.response.status, 400);
  assert.equal(duplicateName.payload.code, 'INVALID_QUERY');

  const legacyHeader = await json(await fetch(
    `${origin}/api/edit?fileName=fixture.musicxml&sha=${'0'.repeat(64)}`,
    {
      method: 'POST',
      headers: {
        'content-type': EDIT_CONTENT_TYPE,
        'x-st-edit-commands': '[]',
      },
      body: Buffer.from([0, 0, 0, 2, 91, 93]),
    },
  ));
  assert.equal(legacyHeader.response.status, 400);
  assert.equal(legacyHeader.payload.code, 'LEGACY_EDIT_COMMAND_HEADER_NOT_SUPPORTED');

  const truncated = await json(await fetch(
    `${origin}/api/edit?fileName=fixture.musicxml&sha=${'0'.repeat(64)}`,
    {
      method: 'POST',
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: Buffer.from([0, 0, 0, 10, 91, 93]),
    },
  ));
  assert.equal(truncated.response.status, 400);
  assert.equal(truncated.payload.code, 'INVALID_EDIT_BODY_FRAME');
});
