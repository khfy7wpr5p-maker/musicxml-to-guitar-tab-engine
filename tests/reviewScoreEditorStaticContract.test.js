'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'web/review-score-editor/index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'web/review-score-editor/review-editor.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'web/review-score-editor/review-editor.css'), 'utf8');

test('Stage 07 shell exposes the required review, correction and revision surfaces', () => {
  for (const role of [
    'score-host',
    'issue-list',
    'selected-target',
    'blocked-panel',
    'blocked-reason',
    'pitch-step',
    'pitch-alter',
    'pitch-octave',
    'duration-value',
    'voice-value',
    'staff-value',
  ]) {
    assert.match(html, new RegExp(`data-role="${role}"`));
  }

  for (const command of [
    'PITCH_UPDATE',
    'DURATION_UPDATE',
    'VOICE_REASSIGNMENT',
    'STAFF_REASSIGNMENT',
    'TIE_CORRECTION',
    'CHORD_GROUPING_CORRECTION',
    'NOTE_ADD',
    'NOTE_DELETE',
    'REST_ADD',
    'REST_DELETE',
  ]) {
    assert.match(html, new RegExp(`data-command="${command}"`));
  }

  for (const action of ['undo', 'redo', 'save', 'revalidate', 'continue']) {
    assert.match(html, new RegExp(`data-action="${action}"`));
  }
});

test('Stage 07 browser shell delegates semantic authority and score highlighting to its host', () => {
  for (const method of [
    'snapshot',
    'mountScore',
    'syncScoreSelection',
    'selectIssue',
    'selectScorePoint',
    'command',
    'undo',
    'redo',
    'save',
    'revalidate',
  ]) {
    assert.ok(js.includes(`'${method}'`), `review editor host contract must require ${method}()`);
  }
  assert.match(js, /host\.selectScorePoint\(\{\s*clientX: event\.clientX,\s*clientY: event\.clientY/);
  assert.match(js, /host\.syncScoreSelection\(\{\s*selectedTarget:/);
  assert.match(js, /host\.command\(\{ command, value \}\)/);
  assert.equal(js.includes('hitTestNote('), false, 'UI must not convert renderer hit evidence into edit identity itself');
  assert.equal(js.includes('innerHTML'), false, 'review evidence must not be injected with innerHTML');
});

test('note/rest addition intents carry explicit requested values instead of asking the host to guess', () => {
  assert.match(js, /command === 'NOTE_ADD'[\s\S]*pitch: requestedPitch\(\),[\s\S]*duration: durationValue\.value/);
  assert.match(js, /command === 'REST_ADD'[\s\S]*value = \{ duration: durationValue\.value \}/);
});

test('score mounting may be asynchronous and completes before the first review refresh', () => {
  assert.match(js, /Promise\.resolve\(host\.mountScore\(scoreHost/);
  assert.match(js, /return refresh\(\);/);
});

test('hard BLOCKED presentation is explicit and cannot silently expose editing', () => {
  assert.match(js, /model\.documentStatus !== REVIEW_REQUIRED/);
  assert.match(js, /blockedPanel\.hidden = model\.documentStatus !== BLOCKED/);
  assert.match(js, /button\.disabled = !control\?\.enabled/);
  assert.match(js, /reviewable \? \(model\.score\.selectedTarget \?\? null\) : null/);
});

test('Stage 07 shell is mobile-aware and keeps controls touch-sized', () => {
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /min-height: 42px/);
  assert.match(html, /viewport-fit=cover/);
});

test('Stage 07 shell does not expose raw MusicXML editing', () => {
  assert.equal(/<textarea/i.test(html), false);
  assert.equal(/contenteditable/i.test(html), false);
  assert.equal(/raw xml/i.test(html), false);
});
