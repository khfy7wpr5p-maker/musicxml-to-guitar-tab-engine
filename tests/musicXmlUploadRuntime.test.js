'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  MusicXmlUploadRuntimeError,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  convertMusicXmlToCanonicalTab,
} = require('../src/core/conversionPipeline');
const {
  createProcessingRuntime,
} = require('../src/core/processingRuntime');
const {
  DEFAULT_MAX_XML_BYTES,
} = require('../src/validation/xmlSafety');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function noteEvents(result) {
  return result.canonicalTabResult.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
}

function staffDetails({ lowStringPitch = 'E2', capoFret = 0 } = {}) {
  const tuning = [
    [lowStringPitch[0], Number(lowStringPitch.slice(1))], ['A', 2], ['D', 3], ['G', 3], ['B', 3], ['E', 4],
  ];
  return `<staff-details><staff-lines>6</staff-lines>${tuning.map(([step, octave], index) => (
    `<staff-tuning line="${index + 1}"><tuning-step>${step}</tuning-step><tuning-octave>${octave}</tuning-octave></staff-tuning>`
  )).join('')}<capo>${capoFret}</capo></staff-details>`;
}

test('secure Workbench upload maps written standard notation to standard-guitar sounding register without changing public conversion defaults', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const direct = convertMusicXmlToCanonicalTab(bytes);
  assert.ok(direct.canonicalTabResult);

  const result = processMusicXmlUpload({
    fileName: 'melody.musicxml',
    bytes,
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.equal(result.input.fileName, 'melody.musicxml');
  assert.equal(result.input.byteLength, bytes.byteLength);
  assert.equal(result.input.sha256, sha256(bytes));

  const sourceNotes = direct.canonicalTabResult.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
  const targetNotes = noteEvents(result);
  assert.equal(targetNotes.length, sourceNotes.length);
  for (let index = 0; index < sourceNotes.length; index += 1) {
    assert.equal(targetNotes[index].pitch.midi, sourceNotes[index].pitch.midi - 12);
    assert.equal(targetNotes[index].pitch.octave, sourceNotes[index].pitch.octave - 1);
    assert.equal(targetNotes[index].pitch.step, sourceNotes[index].pitch.step);
    assert.equal(targetNotes[index].pitch.alter, sourceNotes[index].pitch.alter);
  }

  assert.equal(direct.canonicalTabResult.measures[0].events[0].pitch.written, 'C4');
  assert.equal(result.canonicalTabResult.measures[0].events[0].pitch.written, 'C3');
  assert.match(result.musicXml, /<octave-change>-1<\/octave-change>/);
  assert.equal(result.normalization.tabStaffMirrorCollapsed, false);
  assert.equal(Object.isFrozen(result), true);
});

test('real-user register regression E4 G#4 A4 becomes E3 G#3 A3 with first-position guitar TAB while notation stays written', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>G</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
</measure></part></score-partwise>`);

  const publicDirect = convertMusicXmlToCanonicalTab(bytes);
  assert.deepEqual(
    publicDirect.canonicalTabResult.measures[0].events.map((event) => event.pitch.written),
    ['E4', 'G#4', 'A4'],
  );

  const result = processMusicXmlUpload({ fileName: 'written-source.musicxml', bytes });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);

  const events = result.canonicalTabResult.measures[0].events;
  assert.deepEqual(events.map((event) => event.pitch.written), ['E3', 'G#3', 'A3']);
  assert.deepEqual(events.map((event) => event.pitch.midi), [52, 56, 57]);
  assert.deepEqual(events.map((event) => event.selectedPosition), [
    { string: 4, fret: 2 },
    { string: 3, fret: 1 },
    { string: 3, fret: 2 },
  ]);

  assert.match(
    result.musicXml,
    /<pitch><step>E<\/step><octave>4<\/octave><\/pitch>[\s\S]*?<staff>1<\/staff>/,
  );
  assert.match(
    result.musicXml,
    /<pitch><step>E<\/step><octave>3<\/octave><\/pitch>[\s\S]*?<staff>2<\/staff>/,
  );
  assert.match(result.musicXml, /<string>4<\/string><fret>2<\/fret>/);
});

test('upload identity and conversion use an owned snapshot when caller bytes mutate', () => {
  const original = fixture('parser-single-voice.musicxml');
  const mutable = new Uint8Array(original);
  let mutated = false;
  const runtime = createProcessingRuntime({}, {
    clock: (phase) => {
      if (!mutated && phase === 'app-upload:start') {
        mutable.fill(0);
        mutated = true;
      }
      return 0;
    },
  });

  const baseline = processMusicXmlUpload({
    fileName: 'baseline.musicxml',
    bytes: original,
  });
  const result = processMusicXmlUpload({
    fileName: 'mutable.musicxml',
    bytes: mutable,
  }, {}, runtime);

  assert.equal(mutated, true);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.equal(result.input.byteLength, original.byteLength);
  assert.equal(result.input.sha256, sha256(original));
  assert.deepEqual(result.canonicalTabResult, baseline.canonicalTabResult);
});

test('upload snapshot does not invoke Uint8Array subclass coercion hooks', () => {
  const original = fixture('parser-single-voice.musicxml');
  let invoked = false;
  class HostileUint8Array extends Uint8Array {
    valueOf() {
      invoked = true;
      throw new Error('caller hook must not run');
    }

    get length() {
      invoked = true;
      throw new Error('caller hook must not run');
    }
  }
  const hostile = new HostileUint8Array(original);

  const result = processMusicXmlUpload({
    fileName: 'hostile-subclass.musicxml',
    bytes: hostile,
  });

  assert.equal(invoked, false);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.input.sha256, sha256(original));
});

test('oversized upload is rejected before snapshot allocation or hashing', () => {
  let invoked = false;
  class OversizedUint8Array extends Uint8Array {
    valueOf() {
      invoked = true;
      throw new Error('caller hook must not run');
    }
  }
  const oversized = new OversizedUint8Array(DEFAULT_MAX_XML_BYTES + 1);

  const result = processMusicXmlUpload({
    fileName: 'oversized.musicxml',
    bytes: oversized,
  });

  assert.equal(invoked, false);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].code, 'FILE_TOO_LARGE');
  assert.equal(result.input.byteLength, DEFAULT_MAX_XML_BYTES + 1);
  assert.equal(result.input.sha256, null);
});

test('shared-memory upload storage is rejected before hashing or conversion', () => {
  if (typeof SharedArrayBuffer !== 'function') return;
  const shared = new Uint8Array(new SharedArrayBuffer(8));

  assert.throws(
    () => processMusicXmlUpload({ fileName: 'shared.musicxml', bytes: shared }),
    (error) => {
      assert.ok(error instanceof MusicXmlUploadRuntimeError);
      assert.equal(error.code, 'INVALID_UPLOAD_REQUEST');
      assert.match(error.message, /shared memory/);
      return true;
    },
  );
});

test('detached upload storage is rejected as an invalid request', () => {
  const detached = new Uint8Array(fixture('parser-single-voice.musicxml'));
  structuredClone(detached.buffer, { transfer: [detached.buffer] });

  assert.throws(
    () => processMusicXmlUpload({ fileName: 'detached.musicxml', bytes: detached }),
    (error) => {
      assert.ok(error instanceof MusicXmlUploadRuntimeError);
      assert.equal(error.code, 'INVALID_UPLOAD_REQUEST');
      assert.match(error.message, /attached/);
      return true;
    },
  );
});

test('automatic dispatcher sends multi-voice MusicXML through PA-12 v2 without silent note loss or transposition', () => {
  const bytes = fixture('pa12-polyphonic-e2e.musicxml');
  const result = processMusicXmlUpload({
    fileName: 'poly.xml',
    bytes: new Uint8Array(bytes),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult.schemaVersion, '2.0.0');
  assert.equal(result.canonicalTabResult.noteDispositions.length, 8);
  assert.equal(
    result.canonicalTabResult.noteDispositions.every((entry) => (
      entry.disposition === 'KEEP' && entry.octaveShiftSemitones === 0
    )),
    true,
  );
  assert.equal(result.normalization.omittedRepresentationNoteCount, 0);
  assert.match(result.musicXml, /<score-partwise\b/);
});

test('explicit multi-staff source is routed to POLY_V2 before any successful MONO result can be returned', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time><staves>2</staves></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part></score-partwise>`);

  const result = processMusicXmlUpload({ fileName: 'explicit-multistaff.musicxml', bytes });
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.notEqual(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
});

test('explicit source capo uses the MONO V1.1 and POLY V2.1 physical contracts', () => {
  const mono = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetails({ capoFret: 2 })}</attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part></score-partwise>`);
  const poly = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetails({ capoFret: 2 })}</attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><backup><duration>1</duration></backup><note><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note></measure></part></score-partwise>`);

  const monoResult = processMusicXmlUpload({ fileName: 'capo-mono.musicxml', bytes: mono });
  assert.equal(monoResult.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(monoResult.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
  assert.equal(monoResult.canonicalTabResult.schemaVersion, '1.1.0');
  assert.equal(monoResult.canonicalTabResult.guitar.capoFret, 2);
  assert.equal(monoResult.canonicalTabResult.guitar.fretSemantics, 'RELATIVE_FROM_CAPO');
  assert.match(monoResult.musicXml, /<capo>2<\/capo>/);
  assert.equal(monoResult.canonicalTabResult.measures[0].events[0].pitch.midi, 52);
  assert.deepEqual(monoResult.canonicalTabResult.measures[0].events[0].selectedPosition, {
    string: 4,
    fret: 0,
  });

  const polyResult = processMusicXmlUpload({ fileName: 'standard-capo-poly.musicxml', bytes: poly });
  assert.equal(polyResult.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(polyResult.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(polyResult.canonicalTabResult.schemaVersion, '2.1.0');
  assert.equal(polyResult.canonicalTabResult.guitar.capoFret, 2);
  assert.equal(polyResult.canonicalTabResult.guitar.fretSemantics, 'RELATIVE_FROM_CAPO');
  assert.match(polyResult.musicXml, /<capo>2<\/capo>/);
  assert.deepEqual(polyResult.canonicalTabResult.noteDispositions.map((entry) => entry.selectedPosition), [
    { string: 3, fret: 7 },
    { string: 4, fret: 7 },
  ]);
});

test('a complete explicit Standard/capo-0 source configuration preserves the existing upload route', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time>${staffDetails()}</attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part></score-partwise>`);
  const result = processMusicXmlUpload({ fileName: 'standard-config.musicxml', bytes });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);
});

test('engine notation plus TAB output is collapsed before restricted polyphonic projection', () => {
  const first = processMusicXmlUpload({
    fileName: 'poly.xml',
    bytes: fixture('pa12-polyphonic-e2e.musicxml'),
  });
  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);

  const roundTrip = processMusicXmlUpload({
    fileName: 'notation-and-tab.musicxml',
    bytes: Buffer.from(first.musicXml),
  });

  assert.equal(roundTrip.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(roundTrip.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(roundTrip.normalization, {
    tabStaffMirrorCollapsed: true,
    collapsedStaff: 2,
    omittedRepresentationNoteCount: 8,
  });
  assert.equal(roundTrip.canonicalTabResult.noteDispositions.length, 8);
  assert.equal(
    roundTrip.canonicalTabResult.noteDispositions.every((entry) => (
      entry.disposition === 'KEEP' && entry.octaveShiftSemitones === 0
    )),
    true,
  );
});

test('monophonic writer notation plus TAB output reaches the mirror normalizer', () => {
  const source = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
<part id="P1"><measure number="1">
<attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
</measure></part></score-partwise>`);
  const first = processMusicXmlUpload({ fileName: 'single.xml', bytes: source });
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.MONO_V1);

  const roundTrip = processMusicXmlUpload({
    fileName: 'single-notation-tab.musicxml',
    bytes: Buffer.from(first.musicXml),
  });

  assert.equal(roundTrip.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(roundTrip.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(roundTrip.normalization, {
    tabStaffMirrorCollapsed: true,
    collapsedStaff: 2,
    omittedRepresentationNoteCount: 1,
  });
  assert.equal(roundTrip.canonicalTabResult.noteDispositions.length, 1);
});

test('near-mirror notation and TAB staves fail closed instead of dropping changed music', () => {
  const first = processMusicXmlUpload({
    fileName: 'poly.xml',
    bytes: fixture('pa12-polyphonic-e2e.musicxml'),
  });
  const firstTabStaff = first.musicXml.indexOf('<staff>2</staff>');
  const octaveStart = first.musicXml.lastIndexOf('<octave>', firstTabStaff) + '<octave>'.length;
  const octaveEnd = first.musicXml.indexOf('</octave>', octaveStart);
  const changedOctave = String(Number.parseInt(
    first.musicXml.slice(octaveStart, octaveEnd),
    10,
  ) + 1);
  const changed = `${first.musicXml.slice(0, octaveStart)}${changedOctave}${first.musicXml.slice(octaveEnd)}`;

  const result = processMusicXmlUpload({
    fileName: 'changed-tab.musicxml',
    bytes: Buffer.from(changed),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.normalization.tabStaffMirrorCollapsed, false);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('TAB mirror normalization rejects a partial staff reset and unsupported technique', () => {
  const first = processMusicXmlUpload({
    fileName: 'poly.xml',
    bytes: fixture('pa12-polyphonic-e2e.musicxml'),
  });
  const firstTabStaff = first.musicXml.indexOf('<staff>2</staff>');
  const boundaryStart = first.musicXml.lastIndexOf('<backup>', firstTabStaff);
  const boundaryDurationStart = first.musicXml.indexOf('<duration>', boundaryStart)
    + '<duration>'.length;
  const boundaryDurationEnd = first.musicXml.indexOf('</duration>', boundaryDurationStart);
  const partialReset = `${first.musicXml.slice(0, boundaryDurationStart)}12${first.musicXml.slice(boundaryDurationEnd)}`;
  const unsupportedTechnique = first.musicXml.replace(
    '<technical>',
    '<technical><bend><bend-alter>1</bend-alter></bend>',
  );

  for (const [fileName, musicXml] of [
    ['partial-reset.musicxml', partialReset],
    ['unsupported-technique.musicxml', unsupportedTechnique],
  ]) {
    const result = processMusicXmlUpload({ fileName, bytes: Buffer.from(musicXml) });
    assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
    assert.equal(result.normalization.tabStaffMirrorCollapsed, false);
    assert.equal(result.canonicalTabResult, null);
  }
});

test('TAB mirror normalization rejects late clef and transpose declarations', () => {
  const first = processMusicXmlUpload({
    fileName: 'poly.xml',
    bytes: fixture('pa12-polyphonic-e2e.musicxml'),
  });
  const transpose = first.musicXml.match(/<transpose number="1">.*?<\/transpose>/s)[0];
  const withoutInitialTranspose = first.musicXml.replace(transpose, '');
  const firstNoteEnd = withoutInitialTranspose.indexOf('</note>') + '</note>'.length;
  const lateTranspose = `${withoutInitialTranspose.slice(0, firstNoteEnd)}<attributes>${transpose}</attributes>${withoutInitialTranspose.slice(firstNoteEnd)}`;
  const lateTabClef = first.musicXml
    .replace('<clef number="2"><sign>TAB</sign>', '<clef number="2"><sign>G</sign>')
    .replace('</note>', '</note><attributes><clef number="2"><sign>TAB</sign><line>5</line></clef></attributes>');

  for (const [fileName, musicXml] of [
    ['late-transpose.musicxml', lateTranspose],
    ['late-tab-clef.musicxml', lateTabClef],
  ]) {
    const result = processMusicXmlUpload({ fileName, bytes: Buffer.from(musicXml) });
    assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
    assert.equal(result.normalization.tabStaffMirrorCollapsed, false);
    assert.equal(result.canonicalTabResult, null);
  }
});

test('upload boundary rejects non-MusicXML file extensions before conversion', () => {
  const bytes = fixture('parser-single-voice.musicxml');
  const result = processMusicXmlUpload({ fileName: 'score.txt', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.UNRESOLVED);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_UPLOAD_EXTENSION');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});

test('upload boundary fails closed on unsafe XML while retaining exact file identity', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise [<!ENTITY x "boom">]>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>X</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>`);
  const result = processMusicXmlUpload({ fileName: 'unsafe.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.preflight.issues[0].category, 'safety');
  assert.equal(result.preflight.issues[0].code, 'UNSAFE_XML_DECLARATION');
  assert.equal(result.input.sha256, sha256(bytes));
});

test('polyphonic route raises an exact one-octave low-register source note into standard-guitar range', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Range</part-name></score-part></part-list>
<part id="P1"><measure number="7">
<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
<note><pitch><step>A</step><octave>1</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>8</duration></backup>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<forward><duration>4</duration></forward>
</measure></part></score-partwise>`);

  const first = processMusicXmlUpload({ fileName: 'low-register.xml', bytes });
  const second = processMusicXmlUpload({ fileName: 'low-register.xml', bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(first, second);
  assert.equal(first.input.sha256, sha256(bytes));

  const displaced = first.canonicalTabResult.noteDispositions[0];
  assert.equal(displaced.disposition, 'KEEP');
  assert.equal(displaced.octaveShiftSemitones, 12);
  assert.equal(displaced.targetPitch.written, 'A2');
  assert.equal(displaced.targetPitch.midi, 45);
  assert.equal(displaced.ruleId, 'OCTAVE_NEAREST_IN_REGISTER');
  assert.equal(first.canonicalTabResult.arrangementDecisions[0].decisionType, 'OCTAVE_DISPLACED');
  assert.equal(first.canonicalTabResult.measures[0].events[0].pitch.written, 'A1');
  assert.match(first.musicXml, /<pitch><step>A<\/step><octave>2<\/octave><\/pitch>[\s\S]*?<staff>2<\/staff>/);
});

test('polyphonic route still refuses high-register source notes and reports the source measure/event', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Range</part-name></score-part></part-list>
<part id="P1"><measure number="7">
<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
<note><pitch><step>C</step><octave>7</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>8</duration></backup>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<forward><duration>4</duration></forward>
</measure></part></score-partwise>`);

  const result = processMusicXmlUpload({ fileName: 'range.musicxml', bytes });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNPLAYABLE_SOURCE_PITCH');
  assert.equal(result.preflight.issues[0].location.measure, '7');
  assert.equal(result.preflight.issues[0].location.measureIndex, 0);
  assert.equal(result.preflight.issues[0].details.writtenPitch, 'C7');
});

test('polyphonic route refuses low notes that need more than one octave of displacement', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
<part-list><score-part id="P1"><part-name>Range</part-name></score-part></part-list>
<part id="P1"><measure number="3">
<attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
<note><pitch><step>C</step><octave>1</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>1</duration></backup>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
</measure></part></score-partwise>`);

  const result = processMusicXmlUpload({ fileName: 'too-low.xml', bytes });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNPLAYABLE_SOURCE_PITCH');
  assert.equal(result.preflight.issues[0].details.writtenPitch, 'C1');
  assert.equal(result.preflight.issues[0].details.permittedOctaveShiftSemitones, 12);
});

test('upload request shape is fail-closed and the application runtime remains outside package-root authority', () => {
  assert.equal(Object.hasOwn(publicApi, 'processMusicXmlUpload'), false);

  assert.throws(
    () => processMusicXmlUpload({ fileName: '../score.musicxml', bytes: Buffer.from('<x/>') }),
    (error) => {
      assert.ok(error instanceof MusicXmlUploadRuntimeError);
      assert.equal(error.code, 'INVALID_UPLOAD_REQUEST');
      return true;
    },
  );

  let invoked = false;
  const hostile = {};
  Object.defineProperty(hostile, 'fileName', {
    enumerable: true,
    get() {
      invoked = true;
      return 'score.musicxml';
    },
  });
  Object.defineProperty(hostile, 'bytes', {
    enumerable: true,
    value: Buffer.from('<x/>'),
  });
  assert.throws(() => processMusicXmlUpload(hostile), /data properties/);
  assert.equal(invoked, false);
});
