'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '../web/guitar-tab-workbench/host-controller.js'),
  'utf8',
);

function hostApi() {
  const sandbox = {};
  vm.runInNewContext(source, { window: sandbox });
  return sandbox.GuitarTabWorkbenchHost;
}

function reviewResult(overrides = {}) {
  return {
    documentType: 'MusicXmlUploadRuntimeResult',
    contractVersion: '1.1.0',
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    input: { sha256: 'a'.repeat(64) },
    preflight: { status: 'REVIEW_REQUIRED', issues: [] },
    canonicalTabResult: { measures: [] },
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    capabilities: {
      renderScore: true,
      generateTab: true,
      editPitch: false,
      editRhythm: false,
      editVoice: false,
      editStructure: false,
      playback: 'APPROXIMATE',
      export: false,
    },
    artifacts: {
      provisionalTabAvailable: true,
      canonicalTabAvailable: false,
    },
    ...overrides,
  };
}

test('product bridge renders only backend-authorized REVIEW_REQUIRED artifacts', async () => {
  const api = hostApi();
  assert.equal(typeof api.createCapabilityBridge, 'function');
  const authoritative = reviewResult();
  const bridge = api.createCapabilityBridge({
    upload: async () => authoritative,
    edit: async () => ({ status: 'PASS' }),
    polyphonicEdit: async () => ({ status: 'PASS' }),
    transpose: async () => ({ status: 'PASS' }),
    loadPreview: null,
  });

  const presented = await bridge.adapter.upload({}, new Uint8Array());
  assert.equal(presented.status, 'PASS');
  assert.equal(presented.musicXml, authoritative.musicXml);
  assert.equal(presented.canonicalTabResult, authoritative.canonicalTabResult);
  assert.equal(bridge.currentResult(), authoritative);
  assert.equal(bridge.currentResult().status, 'REVIEW_REQUIRED');
});

test('product bridge cannot invent review renderability without capabilities and artifacts', async () => {
  const api = hostApi();
  const authoritative = reviewResult({
    canonicalTabResult: null,
    musicXml: null,
    capabilities: {
      renderScore: false,
      generateTab: false,
      editPitch: false,
      editRhythm: false,
      editVoice: false,
      editStructure: false,
      playback: 'DISABLED',
      export: false,
    },
    artifacts: {
      provisionalTabAvailable: false,
      canonicalTabAvailable: false,
    },
  });
  const bridge = api.createCapabilityBridge({
    upload: async () => authoritative,
    edit: async () => ({ status: 'PASS' }),
    polyphonicEdit: async () => ({ status: 'PASS' }),
    transpose: async () => ({ status: 'PASS' }),
    loadPreview: null,
  });

  const presented = await bridge.adapter.upload({}, new Uint8Array());
  assert.equal(presented.status, 'REVIEW_REQUIRED');
  assert.equal(presented.musicXml, null);
  assert.equal(bridge.currentResult(), authoritative);
});

test('preview controller feeds raw REVIEW_REQUIRED result through the bridge exactly once', async () => {
  const api = hostApi();
  const authoritative = reviewResult();
  const rawAdapter = {
    upload: async () => authoritative,
    edit: async () => ({ status: 'PASS' }),
    polyphonicEdit: async () => ({ status: 'PASS' }),
    transpose: async () => ({ status: 'PASS' }),
    loadPreview: async () => authoritative,
  };
  const bridge = api.createCapabilityBridge(rawAdapter);
  let coreRuntimeResult = null;
  const presentationWorkbench = {
    loadFile: async () => true,
    loadRuntimeResult(result) {
      coreRuntimeResult = bridge.present(result);
      return true;
    },
    applySelectedEdit: async () => false,
    applyDocumentTransposition: async () => false,
    snapshot: () => ({ runtimeResult: bridge.currentResult() }),
  };

  const controller = api.createDocumentController(presentationWorkbench, rawAdapter);
  const loaded = await controller.loadPreview();

  assert.equal(loaded, authoritative);
  assert.equal(coreRuntimeResult.status, 'PASS');
  assert.equal(bridge.currentResult(), authoritative);
  assert.equal(bridge.currentResult().status, 'REVIEW_REQUIRED');
  assert.match(source, /document: createDocumentController\(workbench, adapter\)/);
  assert.doesNotMatch(source, /document: createDocumentController\(workbench, capabilityBridge\.adapter\)/);
});

test('legacy PASS behavior is unchanged and non-upload operations clear review authority', async () => {
  const api = hostApi();
  const pass = { status: 'PASS', musicXml: '<score-partwise/>', canonicalTabResult: {} };
  const bridge = api.createCapabilityBridge({
    upload: async () => pass,
    edit: async () => ({ status: 'PASS', route: 'POLY_V2' }),
    polyphonicEdit: async () => ({ status: 'PASS', route: 'POLY_V2' }),
    transpose: async () => ({ status: 'PASS', route: 'POLY_V2' }),
    loadPreview: null,
  });

  assert.equal(await bridge.adapter.upload({}, new Uint8Array()), pass);
  assert.equal(bridge.currentResult(), pass);
  await bridge.adapter.edit({});
  assert.equal(bridge.currentResult(), null);
});
