import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as alphaTab from '@coderline/alphatab';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
  convertMusicXmlToInternalPolyphonicTabV2,
} = require('../../src/core/internalPolyphonicConversionPipelineV2');

function findExport(name) {
  const queue = [{ value: alphaTab, depth: 0 }];
  const visited = new Set();
  while (queue.length > 0) {
    const { value, depth } = queue.shift();
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || visited.has(value)) continue;
    visited.add(value);
    if (Object.hasOwn(value, name)) return value[name];
    if (depth < 2) {
      for (const nested of Object.values(value)) {
        if (nested && (typeof nested === 'object' || typeof nested === 'function')) {
          queue.push({ value: nested, depth: depth + 1 });
        }
      }
    }
  }
  throw new Error(`alphaTab export not found: ${name}`);
}

function allBeats(staff) {
  return staff.bars.flatMap((bar) => bar.voices.flatMap((voice) => voice.beats));
}

function allNotes(staff) {
  return allBeats(staff).flatMap((beat) => beat.notes);
}

function musicXmlPosition(note, stringCount) {
  return { string: stringCount - note.string + 1, fret: note.fret };
}

function tupleSort(left, right) {
  return left.midi - right.midi || left.string - right.string || left.fret - right.fret;
}

function renderScore(score) {
  const Settings = findExport('Settings');
  const ScoreRenderer = findExport('ScoreRenderer');
  const settings = new Settings();
  settings.core.engine = 'svg';
  settings.core.enableLazyLoading = false;
  const renderer = new ScoreRenderer(settings);
  renderer.width = 1000;
  const fragments = [];
  const errors = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      renderer.destroy?.();
      reject(new Error('PA-12 alphaTab SVG render timed out.'));
    }, 20_000);
    renderer.error.on((error) => errors.push(error));
    renderer.partialLayoutFinished.on((result) => renderer.renderResult(result.id));
    renderer.partialRenderFinished.on((result) => fragments.push(result));
    renderer.renderFinished.on(() => {
      clearTimeout(timeout);
      try {
        assert.deepEqual(errors, []);
        assert.ok(fragments.length > 0);
        assert.equal(
          fragments.every((entry) => typeof entry.renderResult === 'string' && entry.renderResult.includes('<svg')),
          true,
        );
        resolve({ renderer, fragments });
      } catch (error) {
        renderer.destroy?.();
        reject(error);
      }
    });
    renderer.renderScore(score, [0]);
  });
}

const input = fs.readFileSync(
  path.join(__dirname, '../fixtures/pa12-polyphonic-e2e.musicxml'),
);
const decisions = Array.from({ length: 8 }, (_, index) => ({
  decisionType: 'PRESERVED',
  sourceEventIds: [`P1:measure:0:note:${index}`],
  sourceGroupId: null,
}));
const conversion = convertMusicXmlToInternalPolyphonicTabV2(input, decisions);
assert.equal(conversion.canonicalTabResult.schemaVersion, '2.0.0');
assert.equal(conversion.canonicalTabResult.simultaneousGroups.length, 4);
assert.equal(conversion.canonicalTabResult.selectedShapes.length, 4);

const Settings = findExport('Settings');
const ScoreLoader = findExport('ScoreLoader');
const settings = new Settings();
settings.core.engine = 'svg';
settings.core.enableLazyLoading = false;
const score = ScoreLoader.loadScoreFromBytes(
  new Uint8Array(Buffer.from(conversion.musicXml, 'utf8')),
  settings,
);

assert.equal(score.tracks.length, 1);
assert.equal(score.masterBars.length, 1);
assert.equal(score.tracks[0].staves.length, 2);
const notation = score.tracks[0].staves[0];
const tablature = score.tracks[0].staves[1];
assert.equal(notation.showStandardNotation, true);
assert.equal(tablature.showTablature, true);
assert.deepEqual([...tablature.tuning], [64, 59, 55, 50, 45, 40]);

const expected = conversion.canonicalTabResult.noteDispositions
  .filter((entry) => entry.disposition === 'KEEP')
  .map((entry) => ({
    midi: entry.targetPitch.midi,
    string: entry.selectedPosition.string,
    fret: entry.selectedPosition.fret,
  }))
  .sort(tupleSort);
const notationNotes = allNotes(notation);
const tabNotes = allNotes(tablature);
assert.equal(notationNotes.length, expected.length);
assert.equal(tabNotes.length, expected.length);
assert.deepEqual(
  notationNotes.map((note) => note.realValue).sort((left, right) => left - right),
  expected.map((entry) => entry.midi).sort((left, right) => left - right),
);
assert.deepEqual(
  tabNotes.map((note) => ({
    midi: note.realValue,
    ...musicXmlPosition(note, tablature.tuning.length),
  })).sort(tupleSort),
  expected,
);

function playbackStartHistogram(staff) {
  const histogram = new Map();
  for (const beat of allBeats(staff)) {
    if (beat.notes.length === 0) continue;
    const key = String(beat.absolutePlaybackStart);
    histogram.set(key, (histogram.get(key) || 0) + beat.notes.length);
  }
  return [...histogram.entries()]
    .map(([start, count]) => ({ start: Number(start), count }))
    .sort((left, right) => left.start - right.start);
}

const notationStarts = playbackStartHistogram(notation);
const tabStarts = playbackStartHistogram(tablature);
assert.deepEqual(tabStarts, notationStarts);
assert.equal(notationStarts.length, 4);
assert.deepEqual(notationStarts.map((entry) => entry.count), [2, 2, 2, 2]);

const { renderer, fragments } = await renderScore(score);
try {
  assert.ok(fragments.reduce((sum, entry) => sum + entry.width, 0) > 0);
  assert.ok(fragments.reduce((sum, entry) => sum + entry.height, 0) > 0);
  process.stdout.write(`${JSON.stringify({
    gate: 'PA-12',
    canonicalVersion: conversion.canonicalTabResult.schemaVersion,
    sourceNotes: 8,
    simultaneousAttacks: notationStarts.length,
    notesPerStaff: expected.length,
    selectedShapes: conversion.canonicalTabResult.selectedShapes.length,
    exactTabPositions: true,
    synchronizedAttackStarts: true,
    svgFragments: fragments.length,
  })}\n`);
} finally {
  renderer.destroy?.();
}
