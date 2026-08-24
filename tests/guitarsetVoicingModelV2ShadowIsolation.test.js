'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const SRC_DIR = path.join(__dirname, '..', 'src');
const ADAPTER_BASENAME = 'guitarsetVoicingModelV2Shadow';
const RUNTIME_BRIDGE_BASENAME = 'guitarsetVoicingModelV2RuntimeShadow';
const ADAPTER_PATH = path.normalize(
  path.join(SRC_DIR, 'learning', `${ADAPTER_BASENAME}.js`),
);
const RUNTIME_BRIDGE_PATH = path.normalize(
  path.join(SRC_DIR, 'learning', `${RUNTIME_BRIDGE_BASENAME}.js`),
);

function listJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.normalize(fullPath));
    }
  }
  return files.sort();
}

test('GuitarSet v2 shadow adapter is reachable only through the reviewed internal runtime bridge', () => {
  const offenders = [];
  for (const filePath of listJavaScriptFiles(SRC_DIR)) {
    if (filePath === ADAPTER_PATH || filePath === RUNTIME_BRIDGE_PATH) {
      continue;
    }
    const source = fs.readFileSync(filePath, 'utf8');
    if (source.includes(ADAPTER_BASENAME)) {
      offenders.push(path.relative(path.join(__dirname, '..'), filePath));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'v2 shadow adapter may have only the reviewed internal runtime bridge call site',
  );

  const bridgeSource = fs.readFileSync(RUNTIME_BRIDGE_PATH, 'utf8');
  assert.equal(bridgeSource.includes(ADAPTER_BASENAME), true);
  assert.equal(bridgeSource.includes('ENGINE_RUNTIME_SHADOW_CONNECTION_REVIEW_V1'), true);
});

test('ordinary runtime source does not activate the GuitarSet v2 runtime bridge', () => {
  const offenders = [];
  for (const filePath of listJavaScriptFiles(SRC_DIR)) {
    if (filePath === RUNTIME_BRIDGE_PATH) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    if (source.includes(RUNTIME_BRIDGE_BASENAME)) {
      offenders.push(path.relative(path.join(__dirname, '..'), filePath));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'runtime shadow must remain default-off and explicitly invoked through the internal bridge',
  );
});

test('package-root API exposes neither the GuitarSet v2 adapter nor runtime shadow bridge', () => {
  const packageRootSource = fs.readFileSync(path.join(SRC_DIR, 'index.js'), 'utf8');
  assert.equal(packageRootSource.includes(ADAPTER_BASENAME), false);
  assert.equal(packageRootSource.includes(RUNTIME_BRIDGE_BASENAME), false);
  assert.equal(packageRootSource.includes('createGuitarSetVoicingModelV2ShadowReport'), false);
  assert.equal(packageRootSource.includes('createBlindBaselineGuitarSetV2RuntimeShadowObservation'), false);
  assert.equal(packageRootSource.includes('scoreGuitarSetVoicingModelV2Candidate'), false);
  assert.equal(packageRootSource.includes('validateModelArtifactV2'), false);
});
