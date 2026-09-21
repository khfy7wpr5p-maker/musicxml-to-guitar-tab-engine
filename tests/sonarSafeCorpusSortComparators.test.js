'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareCodeUnitStrings,
} = require('../tools/codeUnitStringComparator');

const TARGETS = [
  'scripts/guitar-tech-real-corpus-gate.js',
  'scripts/stage09-real-corpus-product-gate.js',
  'scripts/stage09-private-tierb-revalidation.js',
  'tools/controlledOfflineGuitarSetShadowRunner.js',
  'tools/controlledOfflineGuitarSetV2ShadowRunner.js',
];

test('shared code-unit comparator preserves JavaScript default string sort order', () => {
  const values = ['b', 'A', 'aa', 'a', '10', '2', 'ä', 'Z'];
  assert.deepEqual(
    [...values].sort(compareCodeUnitStrings),
    [...values].sort(),
  );
});

test('Sonar-safe string sort sites always use an explicit comparator', () => {
  for (const relativePath of TARGETS) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /\.sort\(\s*\)/,
      `${relativePath} must not use comparator-less Array.prototype.sort()`,
    );
  }
});
