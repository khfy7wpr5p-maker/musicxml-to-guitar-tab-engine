import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as alphaTab from '@coderline/alphatab';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  serializeCanonicalTabResultToMusicXml,
} = require('../../src/writers/canonicalTabMusicXmlWriter');
const {
  createCanonicalTabCompatibilityFixture,
} = require('../fixtures/compatibility/canonicalTabCompatibilityFixture');

function findExport(name) {
  const queue = [{ value: alphaTab, depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const { value, depth } = queue.shift();
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || visited.has(value)) {
      continue;
    }
    visited.add(value);
    if (Object.hasOwn(value, name)) {
      return value[name];
    }
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

function renderScore(score, settings) {
  const ScoreRenderer = findExport('ScoreRenderer');
  const renderer = new ScoreRenderer(settings);
  renderer.width = 1200;

  const renderResults = [];
  const errors = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      renderer.destroy?.();
      reject(new Error('alphaTab SVG renderer did not finish within 20 seconds.'));
    }, 20_000);

    renderer.error.on((error) => {
      errors.push(error);
    });
    renderer.preRender.on(() => {
      renderResults.length = 0;
    });
    renderer.partialLayoutFinished.on((result) => {
      renderer.renderResult(result.id);
    });
    renderer.partialRenderFinished.on((result) => {
      renderResults.push(result);
    });
    renderer.renderFinished.on(() => {
      clearTimeout(timeout);
      try {
        assert.deepEqual(errors, []);
        resolve({ renderer, renderResults });
      } catch (error) {
        renderer.destroy?.();
        reject(error);
      }
    });

    renderer.renderScore(score, [0]);
  });
}

const Settings = findExport('Settings');
const ScoreLoader = findExport('ScoreLoader');
const settings = new Settings();
settings.core.engine = 'svg';
settings.core.enableLazyLoading = false;
settings.core.includeNoteBounds = true;

const canonicalTabResult = createCanonicalTabCompatibilityFixture();
const xml = serializeCanonicalTabResultToMusicXml(canonicalTabResult);
const score = ScoreLoader.loadScoreFromBytes(
  new Uint8Array(Buffer.from(xml, 'utf8')),
  settings,
);

assert.equal(score.tracks.length, 1);
assert.equal(score.masterBars.length, 5);
assert.equal(score.tracks[0].staves.length, 2);

const notationStaff = score.tracks[0].staves[0];
const tablatureStaff = score.tracks[0].staves[1];
assert.equal(notationStaff.showStandardNotation, true);
assert.equal(tablatureStaff.showTablature, true);
assert.deepEqual([...tablatureStaff.tuning], [64, 59, 55, 50, 45, 40]);
assert.equal(allNotes(tablatureStaff).some((note) => note.fret === 10), true);

const { renderer, renderResults } = await renderScore(score, settings);

try {
  assert.ok(renderResults.length > 0, 'alphaTab must emit at least one SVG render result.');
  assert.equal(renderResults.every((result) => typeof result.renderResult === 'string'), true);
  assert.equal(renderResults.every((result) => result.renderResult.includes('<svg')), true);
  assert.ok(renderResults.reduce((sum, result) => sum + result.width, 0) > 0);
  assert.ok(renderResults.reduce((sum, result) => sum + result.height, 0) > 0);

  const boundsLookup = renderer.boundsLookup;
  assert.ok(boundsLookup, 'alphaTab must expose rendered bounds.');
  assert.equal(boundsLookup.isFinished, true);
  assert.ok(boundsLookup.staffSystems.length > 0);

  const musicalBeats = [notationStaff, tablatureStaff]
    .flatMap((staff) => allBeats(staff))
    .filter((beat) => beat.notes.length > 0 || (beat.isRest && !beat.isEmpty));
  assert.equal(musicalBeats.length, 28);

  let renderedBeatBounds = 0;
  let renderedNoteBounds = 0;
  for (const beat of musicalBeats) {
    const beatBounds = boundsLookup.findBeats(beat);
    assert.ok(beatBounds.length > 0, 'Every musical beat must have rendered geometry.');
    renderedBeatBounds += beatBounds.length;
    renderedNoteBounds += beatBounds.reduce(
      (sum, bounds) => sum + (Array.isArray(bounds.notes) ? bounds.notes.length : 0),
      0,
    );
  }
  assert.ok(renderedNoteBounds >= 24, 'Rendered note geometry must cover both staves.');

  process.stdout.write(`${JSON.stringify({
    alphaTabRenderer: 'svg',
    tracks: score.tracks.length,
    staves: score.tracks[0].staves.length,
    measures: score.masterBars.length,
    renderFragments: renderResults.length,
    totalWidth: renderResults.reduce((sum, result) => sum + result.width, 0),
    totalHeight: renderResults.reduce((sum, result) => sum + result.height, 0),
    staffSystems: boundsLookup.staffSystems.length,
    renderedBeatBounds,
    renderedNoteBounds,
    doubleDigitFret: true,
  })}\n`);
} finally {
  renderer.destroy?.();
}
