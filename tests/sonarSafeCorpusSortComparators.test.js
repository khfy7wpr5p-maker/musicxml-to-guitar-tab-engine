'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const TARGETS = [
  'scripts/guitar-tech-real-corpus-gate.js',
  'scripts/stage09-real-corpus-product-gate.js',
  'scripts/stage09-private-tierb-revalidation.js',
  'src/app/guitarTechniqueCompatibilityNormalizer.js',
];

test('Sonar-safe corpus sort sites always use an explicit comparator', () => {
  for (const relativePath of TARGETS) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /\.sort\(\s*\)/,
      `${relativePath} must not use comparator-less Array.prototype.sort()`,
    );
  }
});
