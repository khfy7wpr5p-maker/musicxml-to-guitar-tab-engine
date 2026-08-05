'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const packageApi = require('..');
const fretboardApi = require('../src/guitar/fretboard');

test('package root resolves to the controlled src/index.js entry point', () => {
  assert.equal(
    require.resolve('..'),
    path.resolve(__dirname, '..', 'src', 'index.js'),
  );
});

test('package root preserves the previous fretboard public API', () => {
  for (const exportName of [
    'FretboardError',
    'getPositionCandidates',
    'positionToMidi',
    'validateMidi',
  ]) {
    assert.equal(packageApi[exportName], fretboardApi[exportName]);
  }
});

test('package root exposes the controlled conversion and preflight APIs', () => {
  assert.equal(typeof packageApi.convertMusicXmlToCanonicalTab, 'function');
  assert.equal(typeof packageApi.preflightMusicXml, 'function');
  assert.equal(packageApi.PREFLIGHT_STATUS.PASS, 'PASS');
  assert.equal(packageApi.PREFLIGHT_STATUS.WARNING, 'WARNING');
  assert.equal(packageApi.PREFLIGHT_STATUS.BLOCKED, 'BLOCKED');
});
