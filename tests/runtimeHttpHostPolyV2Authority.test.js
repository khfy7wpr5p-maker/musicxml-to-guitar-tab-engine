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

function densePianoChord() {
  const pitches = [['C', 3], ['G', 3], ['C', 4], ['E', 4], ['G', 4], ['C', 5]];
  return Buffer.from(`<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>${pitches.map(([step, octave], index) => `<note>${index > 0 ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>`).join('')}</measure></part></score-partwise>`);
}

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

test('runtime host edits and regenerates a REVIEW_REQUIRED provisional piano TAB', async (t) => {
  const origin = await startServer(t);
  const sourceBytes = densePianoChord();
  const upload = await readJson(await fetch(`${origin}/api/upload?fileName=dense-piano.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: sourceBytes,
  }));
  assert.equal(upload.response.status, 200);
  assert.equal(upload.payload.status, 'REVIEW_REQUIRED');
  assert.equal(upload.payload.capabilities.editPitch, true);
  assert.equal(upload.payload.reviewEditableProjection.measures[0].events.length, 6);

  const sourceGroupEventIds = [0, 1, 2, 3, 4, 5].map(
    (sourceOrder) => `P1:measure:0:note:${sourceOrder}`,
  );
  const commands = [{
    measureIndex: 0,
    sourceOrder: 0,
    sourceEventId: sourceGroupEventIds[0],
    sourceGroupId: 'P1:measure:0:simultaneous:0',
    sourceGroupEventIds,
    pitch: {step: 'D', alter: 0, octave: 3},
  }];
  const edit = await readJson(await fetch(
    `${origin}/api/edit/poly-v2?fileName=dense-piano.musicxml&sha=${upload.payload.input.sha256}`,
    {
      method: 'POST',
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: editBody(commands, sourceBytes),
    },
  ));

  assert.equal(edit.response.status, 200);
  assert.equal(edit.payload.status, 'REVIEW_REQUIRED');
  assert.equal(edit.payload.revision.revisionNumber, 1);
  assert.equal(edit.payload.revision.appliedEdits[0].afterPitch.written, 'D3');
  assert.equal(edit.payload.capabilities.editPitch, true);
  assert.match(edit.payload.musicXml, /<sign>TAB<\/sign>/);
});

test('runtime host accepts a guarded TAB position override and returns that exact placement', async (t) => {
  const origin = await startServer(t);
  const sourceBytes = densePianoChord();
  const upload = await readJson(await fetch(`${origin}/api/upload?fileName=dense-piano.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: sourceBytes,
  }));
  const sourceGroupEventIds = [0, 1, 2, 3, 4, 5].map(
    (sourceOrder) => `P1:measure:0:note:${sourceOrder}`,
  );
  const commands = [{
    measureIndex: 0,
    sourceOrder: 4,
    sourceEventId: sourceGroupEventIds[4],
    sourceGroupId: 'P1:measure:0:simultaneous:0',
    sourceGroupEventIds,
    pitch: {step: 'G', alter: 0, octave: 4},
    selectedPosition: {string: 3, fret: 12},
  }];
  const edit = await readJson(await fetch(
    `${origin}/api/edit/poly-v2?fileName=dense-piano.musicxml&sha=${upload.payload.input.sha256}`,
    {
      method: 'POST',
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: editBody(commands, sourceBytes),
    },
  ));

  assert.equal(edit.response.status, 200);
  assert.equal(edit.payload.status, 'REVIEW_REQUIRED');
  assert.deepEqual(
    edit.payload.reviewEditableProjection.noteDispositions.find(
      (entry) => entry.sourceEventId === sourceGroupEventIds[4],
    ).selectedPosition,
    {string: 3, fret: 12},
  );
  assert.match(edit.payload.musicXml, /<string>3<\/string>[\s\S]*<fret>12<\/fret>/);
});

test('runtime host applies a guarded duration edit to provisional piano TAB', async (t) => {
  const origin = await startServer(t);
  const sourceBytes = densePianoChord();
  const upload = await readJson(await fetch(`${origin}/api/upload?fileName=dense-piano.musicxml`, {
    method: 'POST',
    headers: {'content-type': 'application/octet-stream'},
    body: sourceBytes,
  }));
  const sourceGroupEventIds = [0, 1, 2, 3, 4, 5].map(
    (sourceOrder) => `P1:measure:0:note:${sourceOrder}`,
  );
  const commands = [{
    measureIndex: 0,
    sourceOrder: 0,
    sourceEventId: sourceGroupEventIds[0],
    sourceGroupId: 'P1:measure:0:simultaneous:0',
    sourceGroupEventIds,
    pitch: {step: 'C', alter: 0, octave: 3},
    durationDivisions: 2,
  }];
  const edit = await readJson(await fetch(
    `${origin}/api/edit/poly-v2?fileName=dense-piano.musicxml&sha=${upload.payload.input.sha256}`,
    {
      method: 'POST',
      headers: {'content-type': EDIT_CONTENT_TYPE},
      body: editBody(commands, sourceBytes),
    },
  ));

  assert.equal(edit.response.status, 200);
  assert.equal(edit.payload.status, 'REVIEW_REQUIRED');
  assert.equal(edit.payload.capabilities.editRhythm, true);
  assert.equal(edit.payload.reviewEditableProjection.measures[0].events[0].durationDivisions, 2);
  assert.match(edit.payload.musicXml, /<pitch><step>C<\/step><octave>4<\/octave><\/pitch><duration>2<\/duration>/);
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
