'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const handler = require('../api/index.js');

test('Vercel staging export is callable and serves the runtime health endpoint', async () => {
  assert.equal(typeof handler, 'function');

  const server = http.createServer(handler);
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
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
