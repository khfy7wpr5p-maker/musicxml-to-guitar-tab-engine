'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workbenchRoot = path.join(root, 'web/guitar-tab-workbench');
const html = fs.readFileSync(path.join(workbenchRoot, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(workbenchRoot, 'workbench.js'), 'utf8');
const hostAdapters = fs.readFileSync(path.join(workbenchRoot, 'host-adapters.js'), 'utf8');
const hostController = fs.readFileSync(path.join(workbenchRoot, 'host-controller.js'), 'utf8');
const boot = fs.readFileSync(path.join(workbenchRoot, 'boot.js'), 'utf8');
const previewConfig = fs.readFileSync(path.join(workbenchRoot, 'preview-config.js'), 'utf8');
const tokens = fs.readFileSync(path.join(workbenchRoot, 'tokens.css'), 'utf8');
const shellCss = fs.readFileSync(path.join(workbenchRoot, 'shell.css'), 'utf8');
const css = fs.readFileSync(path.join(workbenchRoot, 'workbench.css'), 'utf8');
const browserScripts = [script, hostAdapters, hostController, boot, previewConfig].join('\n');

test('Guitar TAB Workbench exposes product shell, upload, playback, cursor, issues and structured note editing', () => {
  for (const role of [
    'musicxml-file',
    'play',
    'stop',
    'score',
    'issues',
    'issue-count',
    'document-status',
    'route-status',
    'cursor-status',
    'selected-note',
    'edit-status',
    'edit-step',
    'edit-alter',
    'edit-octave',
    'apply-edit',
    'cancel-edit',
    'mode-badge',
    'mode-description',
    'runtime-upload-action',
    'load-demo',
    'preview-notice',
  ]) {
    assert.match(html, new RegExp(`data-role=["']${role}["']`));
  }

  assert.match(html, /accept="[^"]*\.musicxml[^"]*\.xml/);
  assert.match(html, /\.\/tokens\.css/);
  assert.match(html, /\.\/shell\.css/);
  assert.match(html, /\.\/workbench\.css/);
  assert.match(html, /\.\/host-adapters\.js/);
  assert.match(html, /\.\/host-controller\.js/);
  assert.match(html, /\.\/preview-config\.js/);
  assert.match(html, /\.\/boot\.js/);
  assert.match(html, /\.\.\/assets\/alphatab\.js/);

  assert.match(hostAdapters, /\/api/);
  assert.match(hostAdapters, /\/upload\?fileName=/);
  assert.match(hostAdapters, /\/edit/);
  assert.match(hostAdapters, /application\/octet-stream/);
  assert.match(hostAdapters, /x-st-edit-commands/);
  assert.match(hostAdapters, /expectedInputSha256/);
  assert.match(hostAdapters, /createRuntimeApiAdapter/);
  assert.match(hostAdapters, /createStaticPreviewAdapter/);
  assert.match(hostAdapters, /same-origin path/);
  assert.doesNotMatch(hostAdapters, /FormData|multipart\/form-data/);

  assert.match(hostController, /createDocumentController/);
  assert.match(hostController, /createPlaybackController/);
  assert.match(hostController, /createSelectionController/);
  assert.match(hostController, /createIssueController/);
  assert.match(hostController, /mode === 'preview'/);
  assert.match(hostController, /assetBaseUrl/);
  assert.match(previewConfig, /mode:\s*'runtime'/);
  assert.match(previewConfig, /playerMode:\s*'synthesizer'/);

  assert.match(script, /5 \* 1024 \* 1024/);
  assert.match(script, /MAX_REVISION_COMMANDS\s*=\s*128/);
  assert.match(script, /Only \.musicxml and \.xml files are accepted/);
  assert.match(script, /alphaTab\.PlayerMode\.EnabledSynthesizer/);
  assert.match(script, /includeNoteBounds:\s*true/);
  assert.match(script, /enableCursor:\s*true/);
  assert.match(script, /enableElementHighlighting:\s*true/);
  assert.match(script, /api\.noteMouseDown\.on/);
  assert.match(script, /selectEventByIdentity/);
  assert.match(script, /expectedInputSha256/);
  assert.match(script, /commands:\s*pendingCommands\.map/);
  assert.match(script, /api\.load\(new TextEncoder\(\)\.encode\(result\.musicXml\)\)/);
  assert.match(script, /api\.play\(\)/);
  assert.match(script, /api\.stop\(\)/);
  assert.match(browserScripts, /textContent/);

  assert.match(tokens, /--gt-color-bg:/);
  assert.match(tokens, /--gt-color-accent:/);
  assert.match(tokens, /--gt-sidebar-width:/);
  assert.match(shellCss, /workbench-appbar/);
  assert.match(shellCss, /workbench-toolrail/);
  assert.match(shellCss, /data-mode="preview"/);
  assert.ok(tokens.length + shellCss.length + css.length > 9000);

  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(browserScripts, /https?:\/\//i);
  assert.doesNotMatch(browserScripts, /innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(|new\s+Function/i);
  assert.doesNotMatch(browserScripts, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test('Workbench keeps source bytes private and does not mutate MusicXML or TAB in browser code', () => {
  assert.doesNotMatch(browserScripts, /DOMParser|XMLSerializer|replaceAll\s*\(|\.replace\s*\([^)]*<note/i);
  assert.doesNotMatch(browserScripts, /\.fret\s*=|\.string\s*=|\.pitch\s*=/);
  assert.doesNotMatch(browserScripts, /require\s*\(|module\.exports|src\/app|src\/core|src\/learning|CanonicalTabResult/);
  assert.doesNotMatch(html, /src\/app|src\/core|src\/learning/);
  assert.match(script, /new Uint8Array\(session\.sourceBytes\)/);
  assert.match(script, /session\.commands = pendingCommands\.map\(cloneCommand\)/);
  assert.match(hostAdapters, /Static preview mode is read-only/);
});

test('Product controllers wrap the verified Workbench public seam instead of importing engine internals', () => {
  assert.match(hostController, /workbench\.loadFile\(file\)/);
  assert.match(hostController, /workbench\.loadRuntimeResult\(result\)/);
  assert.match(hostController, /workbench\.api\.play\(\)/);
  assert.match(hostController, /workbench\.api\.stop\(\)/);
  assert.match(hostController, /workbench\.selectEvent\(identity\)/);
  assert.match(hostController, /workbench\.focusMeasure\(location\)/);
  assert.doesNotMatch(hostController, /src\/|require\s*\(|module\.exports/);
});
