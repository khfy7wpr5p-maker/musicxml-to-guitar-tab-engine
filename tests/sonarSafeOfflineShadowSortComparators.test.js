'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const TARGETS = [
  'tools/controlledOfflineGuitarSetShadowRunner.js',
  'tools/controlledOfflineGuitarSetV2ShadowRunner.js',
];

test('controlled offline shadow tools always use explicit sort comparators', () => {
  for (const relativePath of TARGETS) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /\.sort\(\s*\)/,
      `${relativePath} must not use comparator-less Array.prototype.sort()`,
    );
  }
});
