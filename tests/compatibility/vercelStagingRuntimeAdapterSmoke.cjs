'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { rewrites } = require('../../vercel.json');

const handler = require('../../api/index.js');

async function main() {
  assert.equal(typeof handler, 'function');

  // Exercise the deployed routing boundary as well as the exported handler.
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://staging.local').pathname;
    const rewrite = rewrites.find(entry => entry.source === pathname);
    if (rewrite?.destination !== '/api/index') {
      response.writeHead(404).end();
      return;
    }
    handler(request, response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'guitar-tab-runtime-host');
    const origin = `http://127.0.0.1:${address.port}`;
    for (const route of ['session', 'patch', 'revalidate', 'finalize']) {
      const methodCheck = await fetch(`${origin}/api/review/${route}`);
      assert.equal(methodCheck.status, 405);
      assert.equal(methodCheck.headers.get('allow'), 'POST');
    }
    const source = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Review</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
<backup><duration>16</duration></backup>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>
</measure></part></score-partwise>`);
    const openedResponse = await fetch(`${origin}/api/review/session?fileName=teacher.xml`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: source,
    });
    assert.equal(openedResponse.status, 200);
    const opened = await openedResponse.json();
    async function post(route, fields, expectedStatus = 200) {
      const result = await fetch(`${origin}/api/review/${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: opened.token, ...fields }),
      });
      assert.equal(result.status, expectedStatus);
      return result.json();
    }
    const patched = await post('patch', { patch: {
      patch_id: 'staging-pitch-1', edit_class: 'PITCH_UPDATE',
      target_event: 'P1:measure:0:note:1',
      before: { step: 'A', alter: 0, octave: 5 },
      after: { step: 'C', alter: 0, octave: 5 },
    } });
    assert.deepEqual(patched.patchIds, ['staging-pitch-1']);
    const revalidated = await post('revalidate', {});
    assert.equal(revalidated.validationState, 'VALID');
    const approved = await post('finalize', {
      baseRevisionId: opened.draftBaseRevisionId,
      commands: [{ sourceEventId: 'P1:measure:0:note:0', selectedPosition: { string: 1, fret: 17 } }],
    });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.sourceSha256, opened.sourceSha256);
    assert.equal(approved.route, 'POLY_V2');
    assert.equal(approved.canonicalTabResult.documentType, 'CanonicalTabResult');
    assert.equal(typeof approved.musicXml, 'string');
    const replay = await post('finalize', { baseRevisionId: opened.draftBaseRevisionId, commands: [] }, 400);
    assert.match(replay.message, /Unknown or expired/);
    process.stdout.write(`${JSON.stringify({
      handlerType: typeof handler,
      status: response.status,
      service: payload.service,
      teacherReview: approved.status,
      replayRejected: true,
    })}\n`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
