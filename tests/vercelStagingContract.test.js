'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const adapter = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');

test('Vercel staging adapter preserves the reviewed runtime host boundary', () => {
  assert.equal(
    config.installCommand,
    'npm ci --ignore-scripts && npm install --no-save --package-lock=false --ignore-scripts @coderline/alphatab@1.8.4',
  );
  assert.equal(config.functions['api/index.js'].maxDuration, 60);
  assert.deepEqual(config.functions['api/index.js'].includeFiles, [
    'web/guitar-tab-workbench/**',
    'node_modules/@coderline/alphatab/dist/**',
  ]);

  const rewrites = new Map(config.rewrites.map(entry => [entry.source, entry.destination]));
  for (const route of [
    '/healthz',
    '/api/upload',
    '/api/edit',
    '/api/edit/poly-v2',
    '/workbench',
    '/workbench/(.*)',
    '/assets/(.*)',
    '/',
  ]) {
    assert.equal(rewrites.get(route), '/api/index');
  }
  assert.equal(config.rewrites.length, 8);

  assert.match(adapter, /createRuntimeHttpServer/);
  assert.match(adapter, /@coderline\/alphatab/);
  assert.match(adapter, /1\.8\.4/);
  assert.match(adapter, /module\.exports\s*=\s*createRuntimeHttpServer/);
  assert.doesNotMatch(adapter, /\.listen\s*\(/);
  assert.doesNotMatch(adapter, /process\.env\.(?:VERCEL_TOKEN|AUTH|SECRET|API_KEY)/);
});
