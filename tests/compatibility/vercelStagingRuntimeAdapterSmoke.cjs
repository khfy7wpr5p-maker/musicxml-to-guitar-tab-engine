'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');

const handler = require('../../api/index.js');

async function main() {
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
    process.stdout.write(`${JSON.stringify({
      handlerType: typeof handler,
      status: response.status,
      service: payload.service,
    })}\n`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
