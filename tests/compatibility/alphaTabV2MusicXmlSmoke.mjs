import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import * as alphaTab from '@coderline/alphatab';

const require = createRequire(import.meta.url);
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../../src/writers/canonicalTabMusicXmlWriterV2');
const {
  createCanonicalTabV2CompatibilityFixture,
} = require('../fixtures/compatibility/canonicalTabV2CompatibilityFixture');

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

function loadScore(xml) {
  const Environment = findExport('Environment');
  const ByteBuffer = findExport('ByteBuffer');
  const Settings = findExport('Settings');
  const importer = Environment.buildImporters().find((candidate) => candidate.name === 'MusicXML');
  assert.ok(importer, 'alphaTab MusicXML importer must be registered.');
  importer.init(ByteBuffer.fromBuffer(new Uint8Array(Buffer.from(xml, 'utf8'))), new Settings());
  return importer.readScore();
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
      reject(new Error('alphaTab v2 SVG render timed out.'));
    }, 20_000);
    renderer.error.on((error) => errors.push(error));
    renderer.partialLayoutFinished.on((result) => renderer.renderResult(result.id));
    renderer.partialRenderFinished.on((result) => fragments.push(result));
    renderer.renderFinished.on(() => {
      clearTimeout(timeout);
      try {
        assert.deepEqual(errors, []);
        assert.ok(fragments.length > 0);
        assert.equal(fragments.every((entry) => typeof entry.renderResult === 'string' && entry.renderResult.includes('<svg')), true);
        resolve({ renderer, fragments });
      } catch (error) {
        renderer.destroy?.();
        reject(error);
      }
    });
    renderer.renderScore(score, [0]);
  });
}

const result = createCanonicalTabV2CompatibilityFixture();
const xml = serializeCanonicalTabResultV2ToMusicXml(result, {
  chordLabels: [{
    measureIndex: 0,
    onsetDivisions: 0,
    label: 'C',
    root: { step: 'C', alter: 0 },
    kind: 'major',
    bass: null,
    source: 'EXPLICIT_MUSICXML',
  }],
});
const score = loadScore(xml);

assert.equal(score.tracks.length, 1);
assert.equal(score.masterBars.length, 1);
assert.equal(score.tracks[0].staves.length, 2);
const notation = score.tracks[0].staves[0];
const tablature = score.tracks[0].staves[1];
assert.equal(notation.showStandardNotation, true);
assert.equal(tablature.showTablature, true);
assert.deepEqual([...notation.chords.values()].map((chord) => chord.name), ['C']);
assert.ok(allBeats(notation).some((beat) => beat.chordId !== null));
assert.deepEqual([...tablature.tuning], [64, 59, 55, 50, 45, 40]);

const expectedDispositions = result.noteDispositions.filter((entry) => entry.disposition === 'KEEP');
const expectedMidi = expectedDispositions.map((entry) => entry.targetPitch.midi);
const expectedPositions = expectedDispositions.map((entry) => entry.selectedPosition);
const notationNotes = allNotes(notation);
const tabNotes = allNotes(tablature);
assert.deepEqual(notationNotes.map((note) => note.realValue), expectedMidi);
assert.deepEqual(tabNotes.map((note) => note.realValue), expectedMidi);
assert.deepEqual(
  tabNotes.map((note) => musicXmlPosition(note, tablature.tuning.length)),
  expectedPositions,
);
assert.equal(allBeats(notation).filter((beat) => beat.isRest && !beat.isEmpty).length, 1);
assert.equal(allBeats(tablature).filter((beat) => beat.isRest && !beat.isEmpty).length, 1);

const capoResult = createCanonicalTabV2CompatibilityFixture({ capoFret: 2 });
const capoXml = serializeCanonicalTabResultV2ToMusicXml(capoResult);
const capoScore = loadScore(capoXml);
const capoTablature = capoScore.tracks[0].staves[1];
const capoDispositions = capoResult.noteDispositions.filter((entry) => entry.disposition === 'KEEP');
assert.equal(capoResult.schemaVersion, '2.1.0');
assert.match(capoXml, /<capo>2<\/capo>/);
assert.deepEqual(
  allNotes(capoTablature).map((note) => note.realValue),
  capoDispositions.map((entry) => entry.targetPitch.midi),
);
assert.deepEqual(
  allNotes(capoTablature).map((note) => musicXmlPosition(note, capoTablature.tuning.length)),
  capoDispositions.map((entry) => entry.selectedPosition),
);

const { renderer, fragments } = await renderScore(score);
try {
  assert.ok(fragments.reduce((sum, entry) => sum + entry.width, 0) > 0);
  assert.ok(fragments.reduce((sum, entry) => sum + entry.height, 0) > 0);
  process.stdout.write(`${JSON.stringify({
    canonicalVersion: result.schemaVersion,
    tracks: score.tracks.length,
    staves: score.tracks[0].staves.length,
    measures: score.masterBars.length,
    notesPerStaff: expectedMidi.length,
    selectedPositions: expectedPositions,
    svgFragments: fragments.length,
  })}\n`);
} finally {
  renderer.destroy?.();
}

const capoRender = await renderScore(capoScore);
try {
  assert.ok(capoRender.fragments.reduce((sum, entry) => sum + entry.width, 0) > 0);
  assert.ok(capoRender.fragments.reduce((sum, entry) => sum + entry.height, 0) > 0);
} finally {
  capoRender.renderer.destroy?.();
}
