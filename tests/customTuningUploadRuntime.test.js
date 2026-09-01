'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

const STANDARD_LOW_TO_HIGH = Object.freeze(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
const DROP_D_LOW_TO_HIGH = Object.freeze(['D2', 'A2', 'D3', 'G3', 'B3', 'E4']);
const DADGAD_LOW_TO_HIGH = Object.freeze(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);

function pitchParts(pitch) {
  const match = /^([A-G])([#b]{0,2})(\d)$/.exec(pitch);
  assert.ok(match, `invalid test pitch ${pitch}`);
  const alter = { bb: -2, b: -1, '': 0, '#': 1, '##': 2 }[match[2]];
  return { step: match[1], alter, octave: Number(match[3]) };
}

function staffDetails(lowToHigh, capoFret = null) {
  return `<staff-details><staff-lines>6</staff-lines>${lowToHigh.map((pitch, index) => {
    const { step, alter, octave } = pitchParts(pitch);
    const line = index + 1;
    return `<staff-tuning line="${line}"><tuning-step>${step}</tuning-step>${alter === 0 ? '' : `<tuning-alter>${alter}</tuning-alter>`}<tuning-octave>${octave}</tuning-octave></staff-tuning>`;
  }).join('')}${capoFret === null ? '' : `<capo>${capoFret}</capo>`}</staff-details>`;
}

function note(step, octave, voice, { alter = 0 } = {}) {
  return `<note><pitch><step>${step}</step>${alter === 0 ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>1</duration><voice>${voice}</voice><type>quarter</type><staff>1</staff></note>`;
}

function score({ staffDetailsXml, body }) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetailsXml}</attributes>${body}</measure></part></score-partwise>`);
}

function tuningFacts(result) {
  return result.canonicalTabResult.guitar.tuning.map(({ number, pitch, midi }) => ({ number, pitch, midi }));
}

test('tuning-only Drop D MONO is admitted and round-trips exact source tuning', () => {
  const bytes = score({
    staffDetailsXml: staffDetails(DROP_D_LOW_TO_HIGH),
    body: note('D', 2, 1),
  });
  const result = processMusicXmlUpload({ fileName: 'drop-d-mono.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.equal(result.canonicalTabResult.schemaVersion, '1.0.0');
  assert.deepEqual(tuningFacts(result), [
    { number: 1, pitch: 'E4', midi: 64 },
    { number: 2, pitch: 'B3', midi: 59 },
    { number: 3, pitch: 'G3', midi: 55 },
    { number: 4, pitch: 'D3', midi: 50 },
    { number: 5, pitch: 'A2', midi: 45 },
    { number: 6, pitch: 'D2', midi: 38 },
  ]);
  const event = result.canonicalTabResult.measures[0].events[0];
  assert.equal(event.pitch.written, 'D2');
  assert.deepEqual(event.selectedPosition, { string: 6, fret: 0 });
  assert.match(result.musicXml, /<staff-tuning line="1"><tuning-step>D<\/tuning-step><tuning-octave>2<\/tuning-octave><\/staff-tuning>/);
  assert.equal(result.musicXml.includes('<capo>'), false);
});

test('Drop D POLY keeps native D2 at zero octave displacement', () => {
  const bytes = score({
    staffDetailsXml: staffDetails(DROP_D_LOW_TO_HIGH),
    body: `${note('D', 2, 1)}<backup><duration>1</duration></backup>${note('A', 2, 2)}`,
  });
  const result = processMusicXmlUpload({ fileName: 'drop-d-poly.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult.schemaVersion, '2.0.0');
  const d2 = result.canonicalTabResult.noteDispositions.find(
    (entry) => entry.sourceEventId === 'P1:measure:0:note:0',
  );
  assert.ok(d2);
  assert.equal(d2.disposition, 'KEEP');
  assert.equal(d2.octaveShiftSemitones, 0);
  assert.equal(d2.targetPitch.written, 'D2');
  assert.equal(d2.targetPitch.midi, 38);
  assert.deepEqual(d2.selectedPosition, { string: 6, fret: 0 });
  assert.deepEqual(tuningFacts(result)[5], { number: 6, pitch: 'D2', midi: 38 });
});

test('alternate tuning plus capo uses RELATIVE_FROM_CAPO and round-trips configuration', () => {
  const bytes = score({
    staffDetailsXml: staffDetails(DADGAD_LOW_TO_HIGH, 1),
    body: `${note('E', 4, 1)}<backup><duration>1</duration></backup>${note('A', 3, 2)}`,
  });
  const result = processMusicXmlUpload({ fileName: 'dadgad-capo-poly.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult.schemaVersion, '2.1.0');
  assert.equal(result.canonicalTabResult.guitar.capoFret, 1);
  assert.equal(result.canonicalTabResult.guitar.fretSemantics, 'RELATIVE_FROM_CAPO');
  assert.deepEqual(tuningFacts(result), [
    { number: 1, pitch: 'D4', midi: 62 },
    { number: 2, pitch: 'A3', midi: 57 },
    { number: 3, pitch: 'G3', midi: 55 },
    { number: 4, pitch: 'D3', midi: 50 },
    { number: 5, pitch: 'A2', midi: 45 },
    { number: 6, pitch: 'D2', midi: 38 },
  ]);
  assert.match(result.musicXml, /<capo>1<\/capo>/);
  assert.match(result.musicXml, /<staff-tuning line="6"><tuning-step>D<\/tuning-step><tuning-octave>4<\/tuning-octave><\/staff-tuning>/);
});

test('explicit Standard tuning without capo preserves the default conversion result', () => {
  const explicit = score({
    staffDetailsXml: staffDetails(STANDARD_LOW_TO_HIGH),
    body: note('E', 4, 1),
  });
  const implicit = score({
    staffDetailsXml: '',
    body: note('E', 4, 1),
  });

  const explicitResult = processMusicXmlUpload({ fileName: 'standard-explicit.musicxml', bytes: explicit });
  const implicitResult = processMusicXmlUpload({ fileName: 'standard-default.musicxml', bytes: implicit });
  assert.equal(explicitResult.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(implicitResult.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.deepEqual(explicitResult.canonicalTabResult, implicitResult.canonicalTabResult);
  assert.equal(explicitResult.musicXml, implicitResult.musicXml);
});

test('partial tuning without capo becomes explicit fail-closed provenance instead of being guessed', () => {
  const partial = '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>D</tuning-step><tuning-octave>2</tuning-octave></staff-tuning></staff-details>';
  const bytes = score({ staffDetailsXml: partial, body: note('E', 4, 1) });
  const result = processMusicXmlUpload({ fileName: 'partial-tuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});
