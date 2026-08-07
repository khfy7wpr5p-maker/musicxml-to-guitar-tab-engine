'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const packageApi = require('..');
const fretboardApi = require('../src/guitar/fretboard');
const jsonWriterApi = require('../src/writers/canonicalTabJsonWriter');
const asciiWriterApi = require('../src/writers/canonicalTabAsciiWriter');
const musicXmlWriterApi = require('../src/writers/canonicalTabMusicXmlWriter');

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

test('package root exposes the three approved deterministic writer serializers', () => {
  assert.equal(
    packageApi.serializeCanonicalTabResult,
    jsonWriterApi.serializeCanonicalTabResult,
  );
  assert.equal(
    packageApi.serializeCanonicalTabResultToAscii,
    asciiWriterApi.serializeCanonicalTabResultToAscii,
  );
  assert.equal(
    packageApi.serializeCanonicalTabResultToMusicXml,
    musicXmlWriterApi.serializeCanonicalTabResultToMusicXml,
  );
});

test('package root does not expose internal writer errors or EngineError', () => {
  for (const exportName of [
    'CanonicalTabJsonWriterError',
    'CanonicalTabAsciiWriterError',
    'CanonicalTabMusicXmlWriterError',
    'EngineError',
  ]) {
    assert.equal(Object.hasOwn(packageApi, exportName), false);
  }
});

test('package root export set is limited to the approved public surface', () => {
  assert.deepEqual(Object.keys(packageApi).sort(), [
    'FretboardError',
    'PREFLIGHT_STATUS',
    'convertMusicXmlToCanonicalTab',
    'getPositionCandidates',
    'positionToMidi',
    'preflightMusicXml',
    'serializeCanonicalTabResult',
    'serializeCanonicalTabResultToAscii',
    'serializeCanonicalTabResultToMusicXml',
    'validateMidi',
  ].sort());
});
