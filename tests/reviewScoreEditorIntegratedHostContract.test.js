'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const hostJs = fs.readFileSync(path.join(ROOT, 'web/review-score-editor/integrated-host.js'), 'utf8');
const pinJs = fs.readFileSync(path.join(ROOT, 'web/review-score-editor/editor-core-pin.js'), 'utf8');
const shellJs = fs.readFileSync(path.join(ROOT, 'web/review-score-editor/review-editor.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'web/review-score-editor/index.html'), 'utf8');
const EDITOR_CORE_SOURCE_REVISION = '9429116bd5c92d4db4c4edbb21b307c6c74c2391';

test('Stage 07 integrated host is syntactically valid and pins exact reviewed renderer and Editor Core boundaries', () => {
  assert.doesNotThrow(() => new vm.Script(hostJs));
  assert.doesNotThrow(() => new vm.Script(pinJs));
  assert.match(hostJs, /13c32eefccd5bf2c227e815aa27aae4a0583801d/);
  assert.match(hostJs, /RENDERER_CONTRACT_VERSION = '0\.2\.0'/);
  assert.match(hostJs, /OSMD_VERSION = '2\.1\.2'/);
  assert.match(hostJs, /OSMD_LICENSE = 'BSD-3-Clause'/);
  assert.match(hostJs, /runtime-manifest\.json/);
  assert.match(hostJs, /manifestUrl\.origin === global\.location\.origin/);
  assert.match(pinJs, new RegExp(EDITOR_CORE_SOURCE_REVISION));
  assert.match(pinJs, /Editor Core source revision mismatch/);
  assert.match(html, /integrated-host\.js/);
  assert.match(html, /editor-core-pin\.js/);
  assert.ok(html.indexOf('integrated-host.js') < html.indexOf('editor-core-pin.js'));
  assert.ok(html.indexOf('editor-core-pin.js') < html.indexOf('review-editor.js'));
});

test('Stage 07 exact visual hit chain uses render freshness and Editor Core semantic authority', () => {
  assert.match(hostJs, /hitTestNoteDetailed/);
  assert.match(hostJs, /hit\.renderEpoch !== evidence\.renderEpoch/);
  assert.match(hostJs, /\(hit\.sourceId \?\? null\) !== evidence\.sourceId/);
  assert.match(hostJs, /selectRenderedScoreNoteRef\(hit\.target\)/);
  assert.match(hostJs, /reviewPort\.selectTarget\(after\.selection\)/);
  assert.match(hostJs, /resolveRenderedScoreNoteRef\(address\)/);
  assert.match(hostJs, /resolveRenderedScoreMeasureRef\(address\)/);
  assert.match(hostJs, /rendererApi\.moveCursor\(measureRef\)/);
  assert.equal(/nearest[-_ ]?note/i.test(hostJs), false);
  assert.equal(/elementFromPoint/i.test(hostJs), false);
  assert.equal(/elementsFromPoint/i.test(hostJs), false);
  assert.equal(/radius/i.test(hostJs), false);
});

test('Stage 07 issue synchronization requires a trusted semantic resolver instead of guessing from UI location', () => {
  assert.match(hostJs, /reviewPort\.resolvePresentationAddress/);
  assert.match(hostJs, /SEMANTIC_ADDRESS_VERSION = '3\.0\.0'/);
  assert.match(hostJs, /selectEditorAddressOnly\(address\)/);
  assert.match(hostJs, /sameIdentity\(before, after\)/);
  assert.equal(/selectedTarget\.measure\s*[-+]/.test(hostJs), false);
  assert.equal(/measureIndex\s*=\s*selectedTarget/.test(hostJs), false);
});

test('Stage 07 mobile interaction follows the physical-iPhone-proven pointerup path and controlled rerender policy', () => {
  assert.match(shellJs, /'PointerEvent' in global \? 'pointerup' : 'click'/);
  assert.match(shellJs, /onScorePoint: selectScorePoint/);
  assert.match(hostJs, /'PointerEvent' in childWindow \? 'pointerup' : 'click'/);
  assert.match(hostJs, /autoResize: false/);
  assert.match(hostJs, /orientationchange/);
  assert.match(hostJs, /visualViewport/);
  assert.match(hostJs, /ensureRenderedCurrent\(\{ force: true \}\)/);
});

test('Stage 07 integrated host exposes the shell contract, exact Editor Core pin and bounded PASS handoff without implementing Stage 08', () => {
  const fakeWindow = {
    location: { origin: 'https://example.test', href: 'https://example.test/' },
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    visualViewport: null,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  };
  const context = { window: fakeWindow, URL, console, setTimeout, clearTimeout };
  vm.runInNewContext(hostJs, context);
  vm.runInNewContext(pinJs, context);
  const api = {
    renderMusicXml() {}, hitTestNoteDetailed() {}, highlight() {}, clearHighlights() {}, moveCursor() {}, dispose() {},
  };
  const reviewPort = {
    snapshot() {}, selectIssue() {}, selectTarget() {}, resolvePresentationAddress() {}, command() {}, undo() {}, redo() {}, save() {}, revalidate() {},
  };
  const editorController = {
    getDocument() {}, getRendererState() {}, attachOsmdRenderer() {}, detachRenderer() {}, renderCurrent() {}, select() {},
    selectRenderedScoreNoteRef() {}, resolveRenderedScoreNoteRef() {}, resolveRenderedScoreMeasureRef() {},
  };
  const manifest = {
    rendererSourceRevision: '13c32eefccd5bf2c227e815aa27aae4a0583801d',
    scoreRendererContractVersion: '0.2.0',
    vendor: { opensheetmusicdisplay: { version: '2.1.2', license: 'BSD-3-Clause' } },
  };
  assert.throws(() => fakeWindow.ReviewScoreEditorIntegratedHost.create({
    reviewPort, editorController, rendererApi: api, rendererManifest: manifest,
    editorCoreSourceRevision: '0'.repeat(40),
  }), /Editor Core source revision mismatch/);
  const host = fakeWindow.ReviewScoreEditorIntegratedHost.create({
    reviewPort, editorController, rendererApi: api, rendererManifest: manifest,
    editorCoreSourceRevision: EDITOR_CORE_SOURCE_REVISION,
  });
  for (const method of ['snapshot','mountScore','syncScoreSelection','selectIssue','selectScorePoint','command','undo','redo','save','revalidate','continueToTab','dispose']) {
    assert.equal(typeof host[method], 'function');
  }
  assert.equal(host.pins.rendererContractVersion, '0.2.0');
  assert.equal(host.pins.editorCoreSourceRevision, EDITOR_CORE_SOURCE_REVISION);
  assert.equal(fakeWindow.ReviewScoreEditorIntegratedHost.pins.editorCoreSourceRevision, EDITOR_CORE_SOURCE_REVISION);
  assert.match(hostJs, /to: 'STAGE_08_REVALIDATION_AND_TAB'/);
  assert.equal(hostJs.includes('processMusicXmlUpload('), false);
});