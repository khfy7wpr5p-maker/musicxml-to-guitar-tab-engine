'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/workbench.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/workbench.css'), 'utf8');

test('Guitar TAB Workbench exposes upload, playback, cursor, issues and structured note editing', () => {
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
  ]) {
    assert.match(html, new RegExp(`data-role=["']${role}["']`));
  }

  assert.match(html, /accept="[^"]*\.musicxml[^"]*\.xml/);
  assert.match(html, /\/api\/upload/);
  assert.match(html, /\/api\/edit/);
  assert.match(html, /FormData/);
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
  assert.match(script, /textContent/);

  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(script, /https?:\/\//i);
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(|new\s+Function/i);
  assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
  assert.ok(css.length > 3000);
});

test('Workbench keeps source bytes private and does not mutate MusicXML or TAB in the browser', () => {
  assert.doesNotMatch(script, /DOMParser|XMLSerializer|replaceAll\s*\(|\.replace\s*\([^)]*<note/i);
  assert.doesNotMatch(script, /\.fret\s*=|\.string\s*=|\.pitch\s*=/);
  assert.doesNotMatch(script, /require\s*\(|module\.exports|src\/app|src\/core|src\/learning|CanonicalTabResult/);
  assert.doesNotMatch(html, /src\/app|src\/core|src\/learning/);
  assert.match(script, /new Uint8Array\(session\.sourceBytes\)/);
  assert.match(script, /session\.commands = pendingCommands\.map\(cloneCommand\)/);
});
