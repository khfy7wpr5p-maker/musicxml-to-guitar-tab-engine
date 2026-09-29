'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageRoot = require('../src');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'sem06');
const AUTHORITY_MODULES = [
  'src/music/deterministicReductionPlan.js',
  'src/music/deterministicPolyphonicFinalSelector.js',
  'src/music/noLossArpeggiationPhysicalValidation.js',
  'src/tab/canonicalTabResultV2.js',
  'src/app/musicXmlPolyphonicNoteEditRuntimeV2.js',
  'src/writers/canonicalTabMusicXmlWriterV2.js',
];

function loadPacketApi() {
  let api;
  assert.doesNotThrow(() => {
    api = require('../src/semantic/semanticTabValidationPacket');
  });
  return api;
}

function provenance() {
  return JSON.parse(fs.readFileSync(
    path.join(FIXTURE_DIR, 'semantic_baseline.provenance.json'),
    'utf8',
  ));
}

function comparison(status, diagnostics = [], unverifiedContexts = ['clefs', 'keySignatures']) {
  return Object.freeze({
    status,
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze({ ...item }))),
    unverifiedContexts: Object.freeze([...unverifiedContexts]),
  });
}

test('SEM-06D keeps semantic validation packet internal to the package', () => {
  const api = loadPacketApi();

  assert.equal(typeof api.createSemanticTabValidationPacket, 'function');
  assert.equal(packageRoot.createSemanticTabValidationPacket, undefined);
});

test('SEM-06D creates immutable PASS packet with every production authority disabled', () => {
  const { createSemanticTabValidationPacket } = loadPacketApi();
  const packet = createSemanticTabValidationPacket({
    comparison: comparison('PASS'),
    provenance: provenance(),
  });

  assert.deepEqual(packet, {
    schemaVersion: 'st-semantic-tab-validation-packet-v1',
    sourceSha256: '943708ecae3d291f32f8c42472b12a300f2719a1c46fc74ab2aba9456a847dd6',
    semanticEngineCommit: 'ef305f45ff90d940ac6c51a0c46c4fac006d7c5c',
    semanticSnapshotSchemaVersion: 'st-semantic-snapshot-v1',
    partituraVersion: '1.9.0',
    status: 'PASS',
    diagnostics: [],
    unverifiedContexts: ['clefs', 'keySignatures'],
    resolverEligible: false,
    selectorEligible: false,
    arrangementAuthority: false,
    automaticCorrectionAuthority: false,
    tabGenerationBlocking: false,
  });
  assert.ok(Object.isFrozen(packet));
  assert.ok(Object.isFrozen(packet.diagnostics));
  assert.ok(Object.isFrozen(packet.unverifiedContexts));
});

test('SEM-06D preserves DIAGNOSTIC and UNSUPPORTED evidence without gaining blocking authority', () => {
  const { createSemanticTabValidationPacket } = loadPacketApi();
  for (const status of ['DIAGNOSTIC', 'UNSUPPORTED']) {
    const packet = createSemanticTabValidationPacket({
      comparison: comparison(status, [{ code: 'TEST_EVIDENCE' }]),
      provenance: provenance(),
    });

    assert.equal(packet.status, status);
    assert.deepEqual(packet.diagnostics, [{ code: 'TEST_EVIDENCE' }]);
    assert.equal(packet.resolverEligible, false);
    assert.equal(packet.selectorEligible, false);
    assert.equal(packet.arrangementAuthority, false);
    assert.equal(packet.automaticCorrectionAuthority, false);
    assert.equal(packet.tabGenerationBlocking, false);
  }
});

test('SEM-06D authority modules do not import or consume the semantic packet', () => {
  for (const relativePath of AUTHORITY_MODULES) {
    const content = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    assert.equal(
      content.includes('semanticTabValidationPacket'),
      false,
      `${relativePath} must not consume semantic packet authority`,
    );
    assert.equal(
      content.includes('SemanticTabValidationPacket'),
      false,
      `${relativePath} must not consume semantic packet authority`,
    );
  }
});
