'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const adapter = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');

test('Vercel staging adapter preserves the reviewed runtime host boundary', () => {
  assert.equal(config.installCommand, 'npm ci --ignore-scripts');
  assert.equal(pkg.dependencies['@coderline/alphatab'], '1.8.4');
  assert.equal(lock.packages[''].dependencies['@coderline/alphatab'], '1.8.4');
  assert.equal(lock.packages['node_modules/@coderline/alphatab'].version, '1.8.4');
  assert.equal(
    lock.packages['node_modules/@coderline/alphatab'].integrity,
    'sha512-VN5rfTZZWgA63Ny1aDKCp02k3Qm9CHhg4Q9AnK0kHm7G+fNDNZo36TeToPDFoJ6VpB9+AHcCrHwHFUP1tKqdsw==',
  );
  assert.equal(config.functions['api/index.js'].maxDuration, 60);
  assert.equal(
    config.functions['api/index.js'].includeFiles,
    '{web/guitar-tab-workbench/**,node_modules/@coderline/alphatab/**}',
  );

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
  assert.match(adapter, /\.listeners\(['"]request['"]\)/);
  assert.match(adapter, /module\.exports\s*=\s*requestListeners\[0\]/);
  assert.match(adapter, /@coderline\/alphatab/);
  assert.match(adapter, /1\.8\.4/);
  assert.doesNotMatch(config.installCommand, /npm install --no-save/);
  assert.doesNotMatch(adapter, /module\.exports\s*=\s*createRuntimeHttpServer/);
  assert.doesNotMatch(adapter, /\.listen\s*\(/);
  assert.doesNotMatch(adapter, /process\.env\.(?:VERCEL_TOKEN|AUTH|SECRET|API_KEY)/);
});
