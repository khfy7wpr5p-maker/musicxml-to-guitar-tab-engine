'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const SRC_DIR = path.join(__dirname, '..', 'src');
const ADAPTER_PATH = path.normalize(
  path.join(SRC_DIR, 'learning', 'guitarsetObservedVoicingShadow.js'),
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

test('GuitarSet observed-voicing adapter remains unreachable from ordinary runtime source', () => {
  const offenders = [];
  for (const filePath of listJavaScriptFiles(SRC_DIR)) {
    if (filePath === ADAPTER_PATH) {
      continue;
    }
    const source = fs.readFileSync(filePath, 'utf8');
    if (source.includes('guitarsetObservedVoicingShadow')) {
      offenders.push(path.relative(path.join(__dirname, '..'), filePath));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'shadow adapter must not have a production/runtime call site before a later explicit gate',
  );
});

test('package-root API does not expose the GuitarSet observed-voicing adapter', () => {
  const packageRootSource = fs.readFileSync(path.join(SRC_DIR, 'index.js'), 'utf8');
  assert.equal(packageRootSource.includes('guitarsetObservedVoicingShadow'), false);
  assert.equal(packageRootSource.includes('createGuitarSetObservedVoicingShadowReport'), false);
  assert.equal(packageRootSource.includes('scoreGuitarSetObservedVoicingCandidate'), false);
});
