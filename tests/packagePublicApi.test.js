'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const packageApi = require('..');
const errorApi = require('../src/errors/engineError');
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

test('package root exposes the narrow public engine-error detection boundary', () => {
  assert.equal(
    packageApi.ENGINE_ERROR_CONTRACT_VERSION,
    errorApi.ENGINE_ERROR_CONTRACT_VERSION,
  );
  assert.equal(packageApi.ENGINE_ERROR_CONTRACT_VERSION, '1.0.0');
  assert.equal(packageApi.isEngineError, errorApi.isEngineError);

  const publicError = new packageApi.FretboardError('public error');
  assert.equal(packageApi.isEngineError(publicError), true);
  assert.equal(packageApi.isEngineError(new Error('native error')), false);
  assert.equal(packageApi.isEngineError({
    name: 'FretboardError',
    code: 'INVALID_FRETBOARD_INPUT',
    details: {},
    message: 'spoofed',
  }), false);
});

test('package root keeps internal error classes private', () => {
  for (const exportName of [
    'CanonicalTabJsonWriterError',
    'CanonicalTabAsciiWriterError',
    'CanonicalTabMusicXmlWriterError',
    'GuitarConfigurationError',
    'CanonicalTabResultError',
    'EngineError',
  ]) {
    assert.equal(Object.hasOwn(packageApi, exportName), false);
  }
});

test('public error detector recognizes errors thrown by public writer and conversion APIs', () => {
  assert.throws(
    () => packageApi.serializeCanonicalTabResult(null),
    (error) => {
      assert.equal(packageApi.isEngineError(error), true);
      assert.equal(error.code, 'INVALID_CANONICAL_TAB_RESULT');
      return true;
    },
  );

  assert.throws(
    () => packageApi.convertMusicXmlToCanonicalTab('', { unknown: true }),
    (error) => {
      assert.equal(packageApi.isEngineError(error), true);
      assert.equal(error.code, 'INVALID_CANONICAL_TAB_OPTIONS');
      return true;
    },
  );
});

test('package root export set is limited to the approved public surface', () => {
  assert.deepEqual(Object.keys(packageApi).sort(), [
    'ENGINE_ERROR_CONTRACT_VERSION',
    'FretboardError',
    'PREFLIGHT_STATUS',
    'convertMusicXmlToCanonicalTab',
    'getPositionCandidates',
    'isEngineError',
    'positionToMidi',
    'preflightMusicXml',
    'serializeCanonicalTabResult',
    'serializeCanonicalTabResultToAscii',
    'serializeCanonicalTabResultToMusicXml',
    'validateMidi',
  ].sort());
});
