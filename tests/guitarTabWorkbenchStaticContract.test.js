'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/workbench.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web/guitar-tab-workbench/workbench.css'), 'utf8');

test('Guitar TAB Workbench shell exposes the six-stage UI-1 viewer surfaces without remote runtime dependencies', () => {
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
  ]) {
    assert.match(html, new RegExp(`data-role=["']${role}["']`));
  }

  assert.match(html, /accept="[^"]*\.musicxml[^"]*\.xml/);
  assert.match(html, /\/api\/upload/);
  assert.match(script, /5 \* 1024 \* 1024/);
  assert.match(script, /Only \.musicxml and \.xml files are accepted/);
  assert.match(script, /alphaTab\.PlayerMode\.EnabledSynthesizer/);
  assert.match(script, /enableCursor:\s*true/);
  assert.match(script, /enableElementHighlighting:\s*true/);
  assert.match(script, /focusMeasure/);
  assert.match(script, /api\.play\(\)/);
  assert.match(script, /api\.stop\(\)/);
  assert.match(script, /textContent/);

  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(script, /https?:\/\//i);
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(|new\s+Function/i);
  assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
  assert.ok(css.length > 1000);
});

test('Workbench browser layer does not import or expose internal engine modules', () => {
  assert.doesNotMatch(script, /require\s*\(|module\.exports|src\/app|src\/core|src\/learning|CanonicalTabResult/);
  assert.doesNotMatch(html, /src\/app|src\/core|src\/learning/);
});
