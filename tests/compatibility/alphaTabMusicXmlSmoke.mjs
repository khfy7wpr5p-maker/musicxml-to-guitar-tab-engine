import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import * as alphaTab from '@coderline/alphatab';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');

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

function resolveInstalledPackageVersion() {
  let directory = path.dirname(require.resolve('@coderline/alphatab'));
  while (directory !== path.dirname(directory)) {
    const packagePath = path.join(directory, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (packageJson.name === '@coderline/alphatab') {
        return packageJson.version;
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error('Unable to locate installed alphaTab package.json.');
}

function loadScore(xml) {
  const Environment = findExport('Environment');
  const ByteBuffer = findExport('ByteBuffer');
  const Settings = findExport('Settings');
  const importer = Environment.buildImporters().find((candidate) => candidate.name === 'MusicXML');

  assert.ok(importer, 'alphaTab MusicXML importer must be registered.');
  importer.init(
    ByteBuffer.fromBuffer(new Uint8Array(Buffer.from(xml, 'utf8'))),
    new Settings(),
  );
  return importer.readScore();
}

function allBeats(staff) {
  return staff.bars.flatMap((bar) => bar.voices.flatMap((voice) => voice.beats));
}

function allNotes(staff) {
  return allBeats(staff).flatMap((beat) => beat.notes);
}

function explicitRestBeats(staff) {
  return allBeats(staff).filter(
    (beat) => beat.notes.length === 0 && beat.isRest && !beat.isEmpty,
  );
}

function musicXmlPosition(note, stringCount) {
  return {
    string: stringCount - note.string + 1,
    fret: note.fret,
  };
}

function assertStrictlyNonDecreasing(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] >= values[index - 1], `${label} must be non-decreasing.`);
  }
}

const expectedVersion = process.env.ALPHATAB_EXPECTED_VERSION || '1.8.4';
const installedVersion = resolveInstalledPackageVersion();
assert.equal(installedVersion, expectedVersion);

const compatibilityResult = createCanonicalTabCompatibilityFixture();
const compatibilityXml = serializeCanonicalTabResultToMusicXml(compatibilityResult);
const compatibilityScore = loadScore(compatibilityXml);

assert.equal(compatibilityScore.tracks.length, 1);
assert.equal(compatibilityScore.masterBars.length, 5);

const track = compatibilityScore.tracks[0];
assert.equal(track.staves.length, 2);
const notationStaff = track.staves[0];
const tablatureStaff = track.staves[1];

assert.equal(notationStaff.showStandardNotation, true);
assert.equal(tablatureStaff.showTablature, true);
assert.deepEqual([...tablatureStaff.tuning], [64, 59, 55, 50, 45, 40]);
assert.equal(notationStaff.bars.length, 5);
assert.equal(tablatureStaff.bars.length, 5);

const expectedMidi = [64, 60, 66, 67, 69, 59, 58, 62, 64, 57, 74, 74];
const expectedPositions = [
  { string: 1, fret: 0 },
  { string: 3, fret: 5 },
  { string: 1, fret: 2 },
  { string: 1, fret: 3 },
  { string: 1, fret: 5 },
  { string: 2, fret: 0 },
  { string: 3, fret: 3 },
  { string: 2, fret: 3 },
  { string: 1, fret: 0 },
  { string: 3, fret: 2 },
  { string: 1, fret: 10 },
  { string: 1, fret: 10 },
];

const notationNotes = allNotes(notationStaff);
const tablatureNotes = allNotes(tablatureStaff);
assert.equal(notationNotes.length, expectedMidi.length);
assert.equal(tablatureNotes.length, expectedMidi.length);
assert.deepEqual(notationNotes.map((note) => note.realValue), expectedMidi);
assert.deepEqual(tablatureNotes.map((note) => note.realValue), expectedMidi);
assert.deepEqual(
  tablatureNotes.map((note) => musicXmlPosition(note, tablatureStaff.tuning.length)),
  expectedPositions,
);
assert.equal(tablatureNotes.some((note) => note.fret === 10), true);

const notationRestCount = explicitRestBeats(notationStaff).length;
const tablatureRestCount = explicitRestBeats(tablatureStaff).length;
assert.equal(notationRestCount, 2);
assert.equal(tablatureRestCount, 2);

const notationMusicalBeats = allBeats(notationStaff).filter(
  (beat) => beat.notes.length > 0 || (beat.isRest && !beat.isEmpty),
);
const tablatureMusicalBeats = allBeats(tablatureStaff).filter(
  (beat) => beat.notes.length > 0 || (beat.isRest && !beat.isEmpty),
);
assert.equal(notationMusicalBeats.length, 14);
assert.equal(tablatureMusicalBeats.length, 14);
assert.deepEqual(
  notationMusicalBeats.map((beat) => beat.duration),
  tablatureMusicalBeats.map((beat) => beat.duration),
);
assert.deepEqual(
  notationMusicalBeats.map((beat) => beat.dots),
  tablatureMusicalBeats.map((beat) => beat.dots),
);
assertStrictlyNonDecreasing(
  notationMusicalBeats.map((beat) => beat.absolutePlaybackStart),
  'standard-notation playback starts',
);
assertStrictlyNonDecreasing(
  tablatureMusicalBeats.map((beat) => beat.absolutePlaybackStart),
  'tablature playback starts',
);

assert.equal(notationNotes.filter((note) => note.isTieOrigin).length, 1);
assert.equal(notationNotes.filter((note) => note.isTieDestination).length, 1);
assert.equal(tablatureNotes.filter((note) => note.isTieOrigin).length, 1);
assert.equal(tablatureNotes.filter((note) => note.isTieDestination).length, 1);

const singleNoteXml = fs.readFileSync(
  path.join(repositoryRoot, 'tests/fixtures/canonical-tab-single-note.golden.musicxml'),
  'utf8',
);
const singleNoteScore = loadScore(singleNoteXml);
assert.equal(singleNoteScore.tracks.length, 1);
assert.equal(singleNoteScore.masterBars.length, 1);
assert.equal(singleNoteScore.tracks[0].staves.length, 2);
const singleTabNote = allNotes(singleNoteScore.tracks[0].staves[1])[0];
assert.equal(singleTabNote.realValue, 60);
assert.deepEqual(
  musicXmlPosition(singleTabNote, singleNoteScore.tracks[0].staves[1].tuning.length),
  { string: 2, fret: 1 },
);

process.stdout.write(`${JSON.stringify({
  alphaTabVersion: installedVersion,
  importer: 'MusicXML',
  tracks: compatibilityScore.tracks.length,
  staves: track.staves.length,
  measures: compatibilityScore.masterBars.length,
  notesPerStaff: notationNotes.length,
  restsPerStaff: notationRestCount,
  tuning: [...tablatureStaff.tuning],
  firstSelectedPosition: musicXmlPosition(tablatureNotes[1], tablatureStaff.tuning.length),
  doubleDigitFret: tablatureNotes.some((note) => note.fret === 10),
  tieOriginsPerStaff: notationNotes.filter((note) => note.isTieOrigin).length,
})}\n`);
