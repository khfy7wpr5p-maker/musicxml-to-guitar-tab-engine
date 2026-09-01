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
  const match = /^([A-G])([#b]?)(\d)$/.exec(pitch);
  if (!match) throw new Error(`Unsupported test pitch: ${pitch}`);
  const alter = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return { step: match[1], alter, octave: Number(match[3]) };
}

function staffDetails(tuningLowToHigh, capoFret = null) {
  const tuningXml = tuningLowToHigh.map((pitch, index) => {
    const { step, alter, octave } = pitchParts(pitch);
    return `<staff-tuning line="${index + 1}"><tuning-step>${step}</tuning-step>${alter === 0 ? '' : `<tuning-alter>${alter}</tuning-alter>`}<tuning-octave>${octave}</tuning-octave></staff-tuning>`;
  }).join('');
  const capoXml = capoFret === null ? '' : `<capo>${capoFret}</capo>`;
  return `<staff-details><staff-lines>6</staff-lines>${tuningXml}${capoXml}</staff-details>`;
}

function legacyTabStaffDetails(tuningHighToLow) {
  const tuningXml = tuningHighToLow.map((pitch, index) => {
    const { step, alter, octave } = pitchParts(pitch);
    return `<staff-tuning line="${index + 1}"><tuning-step>${step}</tuning-step>${alter === 0 ? '' : `<tuning-alter>${alter}</tuning-alter>`}<tuning-octave>${octave}</tuning-octave></staff-tuning>`;
  }).join('');
  return `<staff-details><staff-lines>6</staff-lines>${tuningXml}</staff-details>`;
}

function note(step, octave, voice = 1, { alter = 0 } = {}) {
  return `<note><pitch><step>${step}</step>${alter === 0 ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>1</duration><voice>${voice}</voice><type>quarter</type><staff>1</staff></note>`;
}

function score({ staffDetailsXml = '', body, beats = 1 }) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<attributes><divisions>1</divisions><time><beats>${beats}</beats><beat-type>4</beat-type></time>${staffDetailsXml}</attributes>
${body}
</measure></part></score-partwise>`);
}

function tuningFacts(result) {
  return result.canonicalTabResult.guitar.tuning.map(({ number, pitch, midi }) => ({ number, pitch, midi }));
}

test('tuning-only Drop D MONO is admitted and round-trips exact source tuning', () => {
  const bytes = score({
    staffDetailsXml: staffDetails(DROP_D_LOW_TO_HIGH),
    body: note('D', 3),
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
  const plain = score({ body: note('E', 4) });
  const explicit = score({
    staffDetailsXml: staffDetails(STANDARD_LOW_TO_HIGH),
    body: note('E', 4),
  });
  const plainResult = processMusicXmlUpload({ fileName: 'plain.musicxml', bytes: plain });
  const explicitResult = processMusicXmlUpload({ fileName: 'explicit-standard.musicxml', bytes: explicit });

  assert.equal(plainResult.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(explicitResult.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.deepEqual(explicitResult.canonicalTabResult, plainResult.canonicalTabResult);
  assert.equal(explicitResult.musicXml, plainResult.musicXml);
});

test('partial tuning without capo becomes explicit fail-closed provenance instead of being guessed', () => {
  const bytes = score({
    staffDetailsXml: '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>D</tuning-step><tuning-octave>2</tuning-octave></staff-tuning></staff-details>',
    body: note('E', 4),
  });
  const result = processMusicXmlUpload({ fileName: 'partial-tuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.preflight.issues[0].details.tuningCount, 1);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('well-formed reversed legacy TAB tuning is presentation-only provenance', () => {
  const bytes = score({
    staffDetailsXml: `${legacyTabStaffDetails(STANDARD_LOW_TO_HIGH.slice().reverse())}<clef><sign>TAB</sign><line>5</line></clef>`,
    body: note('E', 4),
  });
  const result = processMusicXmlUpload({ fileName: 'legacy-reversed-tab-tuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.deepEqual(tuningFacts(result), [
    { number: 1, pitch: 'E4', midi: 64 },
    { number: 2, pitch: 'B3', midi: 59 },
    { number: 3, pitch: 'G3', midi: 55 },
    { number: 4, pitch: 'D3', midi: 50 },
    { number: 5, pitch: 'A2', midi: 45 },
    { number: 6, pitch: 'E2', midi: 40 },
  ]);
});

test('physically inconsistent reversed TAB tuning is not downgraded to presentation-only provenance', () => {
  const bytes = score({
    staffDetailsXml: `${legacyTabStaffDetails(['E4', 'E4', 'G3', 'D3', 'A2', 'E2'])}<clef><sign>TAB</sign><line>5</line></clef>`,
    body: note('E', 4),
  });
  const result = processMusicXmlUpload({ fileName: 'inconsistent-reversed-tab-tuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('repeated reversed legacy TAB tuning is not downgraded after the solve scope begins', () => {
  const legacyTuning = legacyTabStaffDetails(STANDARD_LOW_TO_HIGH.slice().reverse());
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${legacyTuning}<clef><sign>TAB</sign><line>5</line></clef></attributes>${note('E', 4)}</measure>
<measure number="2"><attributes>${legacyTuning}<clef><sign>TAB</sign><line>5</line></clef></attributes>${note('E', 4)}</measure>
</part></score-partwise>`);
  const result = processMusicXmlUpload({ fileName: 'repeated-legacy-tab-tuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('malformed partial TAB tuning is not downgraded to presentation-only provenance', () => {
  const bytes = score({
    staffDetailsXml: '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>H</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details><clef><sign>TAB</sign><line>5</line></clef>',
    body: note('E', 4),
  });
  const result = processMusicXmlUpload({ fileName: 'malformed-tab-partial.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('conflicting complete TAB tunings remain fail-closed', () => {
  const bytes = score({
    staffDetailsXml: `${staffDetails(STANDARD_LOW_TO_HIGH)}${staffDetails(DROP_D_LOW_TO_HIGH)}<clef><sign>TAB</sign><line>5</line></clef>`,
    body: note('E', 4),
  });
  const result = processMusicXmlUpload({ fileName: 'conflicting-tab-tuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'AMBIGUOUS_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('mid-score TAB retuning remains fail-closed', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetails(STANDARD_LOW_TO_HIGH)}<clef><sign>TAB</sign><line>5</line></clef></attributes>${note('E', 4)}</measure>
<measure number="2"><attributes>${staffDetails(DROP_D_LOW_TO_HIGH)}<clef><sign>TAB</sign><line>5</line></clef></attributes>${note('E', 4)}</measure>
</part></score-partwise>`);
  const result = processMusicXmlUpload({ fileName: 'mid-score-tab-retuning.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});
