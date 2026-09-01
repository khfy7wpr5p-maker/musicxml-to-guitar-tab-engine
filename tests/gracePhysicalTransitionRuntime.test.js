'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

function fixture() {
  return fs.readFileSync(
    path.join(__dirname, 'fixtures', 'bach-bwv565-grace-physical-transition.musicxml'),
  );
}

function findExport(alphaTab, name) {
  const queue = [{ value: alphaTab, depth: 0 }];
  const visited = new Set();
  while (queue.length > 0) {
    const { value, depth } = queue.shift();
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || visited.has(value)) {
      continue;
    }
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

async function loadScore(xml) {
  const alphaTab = await import('@coderline/alphatab');
  const Environment = findExport(alphaTab, 'Environment');
  const ByteBuffer = findExport(alphaTab, 'ByteBuffer');
  const Settings = findExport(alphaTab, 'Settings');
  const importer = Environment.buildImporters().find((candidate) => candidate.name === 'MusicXML');
  assert.ok(importer, 'alphaTab MusicXML importer must be registered.');
  importer.init(ByteBuffer.fromBuffer(new Uint8Array(Buffer.from(xml, 'utf8'))), new Settings());
  return importer.readScore();
}

function allNotes(staff) {
  return staff.bars.flatMap(
    (bar) => bar.voices.flatMap((voice) => voice.beats.flatMap((beat) => beat.notes)),
  );
}

function musicXmlPosition(note, stringCount) {
  return { string: stringCount - note.string + 1, fret: note.fret };
}

function graceNoteBodies(xml) {
  return [...xml.matchAll(/<note><grace slash="yes"\/>[\s\S]*?<\/note>/g)].map((match) => match[0]);
}

function standardCapoStaffDetails(capoFret) {
  const tuning = [['E', 2], ['A', 2], ['D', 3], ['G', 3], ['B', 3], ['E', 4]];
  return `<staff-details><staff-lines>6</staff-lines>${tuning.map(([step, octave], index) => (
    `<staff-tuning line="${index + 1}"><tuning-step>${step}</tuning-step><tuning-octave>${octave}</tuning-octave></staff-tuning>`
  )).join('')}<capo>${capoFret}</capo></staff-details>`;
}

test('PS-6B6B resolves the pinned BWV 565 F4→G4→F4 grace chain without inventing timing', async () => {
  const result = processMusicXmlUpload({
    fileName: 'bach-bwv565-grace-physical-transition.musicxml',
    bytes: fixture(),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.canProcess, true);
  assert.equal(result.canonicalTabResult.noteDispositions.length, 1);
  assert.equal(result.canonicalTabResult.noteDispositions[0].targetPitch.written, 'F4');
  assert.deepEqual(result.canonicalTabResult.noteDispositions[0].selectedPosition, {
    string: 1,
    fret: 1,
  });

  const graceBodies = graceNoteBodies(result.musicXml);
  assert.equal(graceBodies.length, 4, 'two grace notes must be emitted on notation and TAB staves');
  assert.equal(graceBodies.every((body) => !body.includes('<duration>')), true);
  assert.equal((result.musicXml.match(/<grace slash="yes"\/>/g) || []).length, 4);
  assert.match(result.musicXml, /<grace slash="yes"\/><pitch><step>F<\/step><octave>4<\/octave><\/pitch>.*?<string>1<\/string><fret>1<\/fret>/);
  assert.match(result.musicXml, /<grace slash="yes"\/><pitch><step>G<\/step><octave>4<\/octave><\/pitch>.*?<string>1<\/string><fret>3<\/fret>/);

  const score = await loadScore(result.musicXml);
  assert.equal(score.tracks.length, 1);
  assert.equal(score.tracks[0].staves.length, 2);
  const tablature = score.tracks[0].staves[1];
  const notes = allNotes(tablature);
  assert.deepEqual(notes.map((note) => note.realValue), [65, 67, 65]);
  assert.deepEqual(
    notes.map((note) => musicXmlPosition(note, tablature.tuning.length)),
    [
      { string: 1, fret: 1 },
      { string: 1, fret: 3 },
      { string: 1, fret: 1 },
    ],
  );

  assert.equal(require('../src').createGracePhysicalTransitionModel, undefined);
});

test('PS-6B6B retains exact grace physical transitions for a source-declared POLY capo', () => {
  const source = fixture().toString('utf8').replace(
    '<staves>1</staves>',
    `<staves>1</staves>${standardCapoStaffDetails(2)}`,
  );
  const result = processMusicXmlUpload({
    fileName: 'bach-bwv565-grace-capo.musicxml',
    bytes: Buffer.from(source),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult.schemaVersion, '2.1.0');
  assert.equal(result.canonicalTabResult.guitar.capoFret, 2);
  assert.match(result.musicXml, /<capo>2<\/capo>/);
  assert.equal(graceNoteBodies(result.musicXml).length, 4);
});

test('production accepts exact grace notehead=normal as display-only metadata', () => {
  const source = fixture().toString('utf8');
  const withNormalNoteheads = source.replaceAll(
    '<stem>up</stem><staff>1</staff>',
    '<stem>up</stem><notehead>normal</notehead><staff>1</staff>',
  );
  const baseline = processMusicXmlUpload({
    fileName: 'grace-notehead-normal.musicxml',
    bytes: Buffer.from(source),
  });
  const accepted = processMusicXmlUpload({
    fileName: 'grace-notehead-normal.musicxml',
    bytes: Buffer.from(withNormalNoteheads),
  });

  assert.equal(accepted.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(accepted.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(accepted.canonicalTabResult, baseline.canonicalTabResult);
  assert.equal(accepted.musicXml, baseline.musicXml);
});

test('PS-6B6B fails closed when a grace pitch has no exact standard-guitar position', () => {
  const source = fixture().toString('utf8');
  const unplayable = source.replace(
    '<pitch><step>F</step><octave>4</octave></pitch>',
    '<pitch><step>C</step><octave>8</octave></pitch>',
  );
  const result = processMusicXmlUpload({
    fileName: 'bach-bwv565-unplayable-grace.musicxml',
    bytes: Buffer.from(unplayable),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.preflight.issues.length, 1);
  assert.equal(result.preflight.issues[0].category, 'playability');
  assert.equal(result.preflight.issues[0].code, 'UNPLAYABLE_GRACE_PHYSICAL_TRANSITION');
  assert.equal(result.preflight.issues[0].details.reason, 'NO_EXACT_GRACE_POSITION');
});

test('PS-6B6B rebases harmony ordinals after grace removal and preserves the label', () => {
  const source = fixture().toString('utf8');
  const withHarmony = source.replace(
    '      <note>\n        <pitch><step>F</step><octave>4</octave></pitch>\n        <duration>16</duration>',
    `      <harmony>
        <root><root-step>C</root-step></root><kind>major</kind><staff>1</staff>
      </harmony>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>16</duration>`,
  );
  const result = processMusicXmlUpload({
    fileName: 'bach-bwv565-grace-with-harmony.musicxml',
    bytes: Buffer.from(withHarmony),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.match(
    result.musicXml,
    /<harmony print-frame="no"><root><root-step>C<\/root-step><\/root><kind>major<\/kind><staff>1<\/staff><\/harmony>/,
  );
});

test('PS-6B6B forwards grace-sidecar key signatures to the MusicXML writer', () => {
  const source = fixture().toString('utf8');
  const withKeySignature = source.replace(
    '        <divisions>4</divisions>',
    '        <divisions>4</divisions>\n        <key><fifths>-2</fifths></key>',
  );
  const result = processMusicXmlUpload({
    fileName: 'bach-bwv565-grace-with-key.musicxml',
    bytes: Buffer.from(withKeySignature),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.match(result.musicXml, /<attributes><divisions>4<\/divisions><key><fifths>-2<\/fifths><\/key>/);
});
