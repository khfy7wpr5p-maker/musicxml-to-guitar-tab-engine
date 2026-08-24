'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'web/guitar-tab-workbench/index.html');
const uxPath = path.join(root, 'web/guitar-tab-workbench/ux-controller.js');
const shellPath = path.join(root, 'web/guitar-tab-workbench/shell.css');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('UI-06 exposes four accessible inspector tabs and workstation controls', () => {
  const html = read(indexPath);
  const tabs = [...html.matchAll(/data-inspector-tab="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(tabs, ['note', 'fingering', 'issues', 'document']);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 4);
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-controls="inspector-panel-note"/);
  assert.match(html, /aria-controls="inspector-panel-fingering"/);
  assert.match(html, /aria-controls="inspector-panel-issues"/);
  assert.match(html, /aria-controls="inspector-panel-document"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /data-role="zoom-out"/);
  assert.match(html, /data-role="zoom-in"/);
  assert.match(html, /data-role="fit-width"/);
  assert.match(html, /data-role="fit-page"/);
  assert.match(html, /data-role="playback-speed"/);
  assert.match(html, /data-role="position-status"/);
  assert.match(html, /data-role="measure-status"/);
  assert.ok(html.indexOf('./boot.js') < html.indexOf('./ux-controller.js'));
});

test('UI-06 controller stays outside engine authority and browser persistence', () => {
  const source = read(uxPath);

  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(|new\s+Function/);
  assert.match(source, /setAttribute\('aria-selected'/);
  assert.match(source, /button\.tabIndex = selected \? 0 : -1/);
  assert.match(source, /event\.key === 'ArrowRight'/);
  assert.match(source, /event\.key === 'ArrowLeft'/);
  assert.match(source, /api\.settings\.display\.scale/);
  assert.match(source, /api\.updateSettings\(\)/);
  assert.match(source, /api\.render\(\)/);
  assert.match(source, /api\.playbackSpeed/);
  assert.match(source, /workbench\.snapshot\(\)/);
});

test('UI-06 responsive shell keeps inspector panels singular and mobile-safe', () => {
  const css = read(shellPath);

  assert.match(css, /\.workbench-inspector-panel\[hidden\]/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.workbench-inspector-tabs/);
  assert.match(css, /\.workbench\[data-selection="note"\] \.workbench-score-panel/);
});
