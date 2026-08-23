'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadControlledOfflineV2FixtureInputs,
} = require('../tools/controlledOfflineGuitarSetV2ShadowRunner');

const REPO_ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'benchmarks',
  'guitarset-shadow',
  'controlled-offline-fixtures.v1.json',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('v2 fixture loader never re-reads the caller-owned manifest after normalization', () => {
  const reviewed = readJson(MANIFEST_PATH);
  let fixtureGetterReads = 0;

  const statefulManifest = {
    documentType: reviewed.documentType,
    contractVersion: reviewed.contractVersion,
    sourcePolicy: reviewed.sourcePolicy,
    teacherLabelsIncluded: reviewed.teacherLabelsIncluded,
    get fixtures() {
      fixtureGetterReads += 1;
      if (fixtureGetterReads > 4) {
        throw new Error('caller-owned manifest was re-read after normalized review');
      }
      return reviewed.fixtures;
    },
  };

  const fixtures = loadControlledOfflineV2FixtureInputs(REPO_ROOT, statefulManifest);

  assert.equal(fixtures.length, reviewed.fixtures.length);
  assert.equal(fixtureGetterReads, 4);
  assert.equal(fixtures.every((entry) => Object.isFrozen(entry)), true);
});
