'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const packageApi = require('..');
const {
  INTEGRATION_CONTRACT_VERSION,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS,
  INTEGRATION_NON_AUTHORITIES,
} = require('../src/contracts/integrationContractMetadata');
const {
  GUITAR_CONFIGURATION_VERSION,
} = require('../src/guitar/tuning');
const {
  ENGINE_ERROR_CONTRACT_VERSION,
} = require('../src/errors/engineError');
const {
  CANONICAL_TAB_RESULT_VERSION,
} = require('../src/contracts/canonicalTabContractMetadata');

test('defines Integration Contract v1 as internal version 1.0.0', () => {
  assert.equal(INTEGRATION_CONTRACT_VERSION, '1.0.0');
  assert.ok(Object.isFrozen(SUPPORTED_INPUTS));
  assert.ok(Object.isFrozen(SUPPORTED_OUTPUTS));
  assert.ok(Object.isFrozen(INTEGRATION_NON_AUTHORITIES));
});

test('references the currently approved stable internal contract versions', () => {
  assert.equal(GUITAR_CONFIGURATION_VERSION, '1.0.0');
  assert.equal(ENGINE_ERROR_CONTRACT_VERSION, '1.0.0');
  assert.equal(CANONICAL_TAB_RESULT_VERSION, '1.0.0');
});

test('keeps the Integration Contract metadata out of the package-root public API', () => {
  for (const exportName of [
    'INTEGRATION_CONTRACT_VERSION',
    'SUPPORTED_INPUTS',
    'SUPPORTED_OUTPUTS',
    'INTEGRATION_NON_AUTHORITIES',
  ]) {
    assert.equal(Object.hasOwn(packageApi, exportName), false);
  }
});

test('preserves the approved package-root public API surface', () => {
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

test('records explicit integration non-authorities', () => {
  assert.ok(INTEGRATION_NON_AUTHORITIES.includes('modify MusicXML musical meaning'));
  assert.ok(INTEGRATION_NON_AUTHORITIES.includes('bypass physical playability validation'));
  assert.ok(INTEGRATION_NON_AUTHORITIES.includes('mutate CanonicalTabResult after creation'));
});
