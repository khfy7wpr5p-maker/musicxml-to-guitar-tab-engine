'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workbenchPath = path.join(root, 'web/guitar-tab-workbench/workbench.js');
const hostAdaptersPath = path.join(root, 'web/guitar-tab-workbench/host-adapters.js');
const uxPath = path.join(root, 'web/guitar-tab-workbench/ux-controller.js');
const indexPath = path.join(root, 'web/guitar-tab-workbench/index.html');
const compatibilitySmokePath = path.join(
  root,
  'tests/compatibility/alphaTabGuitarTabPolyV2WorkbenchSmoke.mjs',
);
const stageDocumentPath = path.join(root, 'docs/ui-stage-1-guitar-tab-workbench.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('UI-07 browser mapping binds POLY_V2 selection to voice, onset, chord fingerprint and duplicate ordinal', () => {
  const source = read(workbenchPath);

  assert.match(source, /rendererTrackEvidence/);
  assert.match(source, /rendererTrackOnsetEvidence/);
  assert.match(source, /canonicalTrackRecords/);
  assert.match(source, /rendererFingerprint/);
  assert.match(source, /canonicalFingerprint/);
  assert.match(source, /rendererDuplicateOrdinal/);
  assert.match(source, /sourceTieEventIds/);
  assert.match(source, /resolvePolyTieEventIds/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(|new\s+Function/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test('UI-07 keeps browser tie identity as metadata and projects only the v1 POLY_V2 command schema to runtime', () => {
  const host = read(hostAdaptersPath);

  assert.match(host, /polyV2RuntimeCommands/);
  assert.match(host, /sourceGroupEventIds:\s*\[\.\.\.command\.sourceGroupEventIds\]/);
  assert.match(host, /pitch:\s*\{/);
  assert.doesNotMatch(host, /sourceTieEventIds/);
  assert.doesNotMatch(host, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('UI-07 inspector exposes source, group, voice and tie evidence as read-only text surfaces', () => {
  const html = read(indexPath);
  const ux = read(uxPath);

  for (const role of [
    'fingering-voice',
    'fingering-source-event',
    'fingering-group',
    'fingering-tie-chain',
  ]) {
    assert.match(html, new RegExp(`data-role="${role}"`));
    assert.match(ux, new RegExp(`data-role=\\"${role}\\"`));
  }
  assert.match(ux, /\.textContent\s*=/);
  assert.doesNotMatch(ux, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(ux, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('UI-07 leaves authoritative TAB regeneration on the existing bounded edit host', () => {
  const source = read(workbenchPath);

  assert.match(source, /polyphonicEdit/);
  assert.match(source, /expectedInputSha256/);
  assert.match(source, /pendingCommands/);
  assert.match(source, /api\.load\(new TextEncoder\(\)\.encode\(result\.musicXml\)\)/);
  assert.doesNotMatch(source, /selectedPosition\s*=|\.fret\s*=|\.string\s*=/);
});

test('UI-07 compatibility host projects browser metadata to the v1 runtime command schema', () => {
  const smoke = read(compatibilitySmokePath);

  assert.match(smoke, /runtimeCommands/);
  assert.match(smoke, /JSON\.stringify\(runtimeCommands\)/);
  assert.match(smoke, /sourceTieEventIds/);
  assert.match(smoke, /Object\.hasOwn\([^)]*sourceTieEventIds/);
  assert.match(smoke, /runtimeCommands\[0\][\s\S]*'sourceTieEventIds'\),\s*false/);
  assert.doesNotMatch(smoke, /JSON\.stringify\(request\.commands\)/);
});

test('UI-07 active Workbench documentation matches the hardened selection boundary', () => {
  const stage = read(stageDocumentPath);

  assert.match(stage, /UI-07/);
  assert.match(stage, /renderer voice/i);
  assert.match(stage, /chord MIDI multiset/i);
  assert.match(stage, /duplicate same-MIDI ordinal/i);
  assert.match(stage, /sourceTieEventIds/);
  assert.match(stage, /RETAINED_TIE_NOT_SUPPORTED/);
  assert.doesNotMatch(stage, /ambiguous POLY_V2 unisons at one onset are intentionally non-editable/i);
});
