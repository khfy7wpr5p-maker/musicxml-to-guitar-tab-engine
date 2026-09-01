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

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function eventSnapshot(result) {
  return result.canonicalTabResult.measures.flatMap((measure) => measure.events.map((event) => ({
    type: event.type,
    voice: event.voice,
    staff: event.staff,
    onset: event.onsetDivisions,
    duration: event.durationDivisions,
    pitch: event.pitch?.written || null,
    tieStart: event.tieStart,
    tieStop: event.tieStop,
  })));
}

function assertDeterministicPolyPass(name, xml) {
  const upload = { fileName: `${name}.musicxml`, bytes: Buffer.from(xml) };
  const first = processMusicXmlUpload(upload);
  const second = processMusicXmlUpload(upload);
  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS, JSON.stringify(first.preflight));
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(first, second);

  const notes = first.canonicalTabResult.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
  assert.equal(first.canonicalTabResult.noteDispositions.length, notes.length);
  const eventsById = new Map(notes.map((event) => [event.sourceEventId, event]));
  for (const disposition of first.canonicalTabResult.noteDispositions) {
    const event = eventsById.get(disposition.sourceEventId);
    assert.ok(event, `lost note ${disposition.sourceEventId}`);
    assert.equal(disposition.disposition, 'KEEP');
    assert.equal(disposition.octaveShiftSemitones, 0);
    assert.equal(disposition.targetPitch.midi, event.pitch.midi);
  }
  return first;
}

const BASE_RUNTIME_SNAPSHOT = Object.freeze([
  { type: 'note', voice: '1', staff: 1, onset: 0, duration: 4, pitch: 'E3', tieStart: false, tieStop: false },
  { type: 'note', voice: '1', staff: 1, onset: 0, duration: 4, pitch: 'G3', tieStart: false, tieStop: false },
  { type: 'note', voice: '1', staff: 1, onset: 4, duration: 4, pitch: 'F#3', tieStart: false, tieStop: false },
  { type: 'rest', voice: '1', staff: 1, onset: 8, duration: 4, pitch: null, tieStart: false, tieStop: false },
  { type: 'note', voice: '1', staff: 1, onset: 12, duration: 4, pitch: 'A3', tieStart: false, tieStop: false },
  { type: 'note', voice: '2', staff: 1, onset: 0, duration: 4, pitch: 'C3', tieStart: false, tieStop: false },
  { type: 'note', voice: '2', staff: 1, onset: 8, duration: 4, pitch: 'E3', tieStart: false, tieStop: false },
  { type: 'note', voice: '2', staff: 1, onset: 12, duration: 4, pitch: 'F3', tieStart: false, tieStop: false },
]);

function runtimeFixture() {
  return fixture('runtime-realworld-guitar-poly.musicxml');
}

function withExactDisplayedTriplet(xml) {
  const timeModification = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
  let tripletIndex = 0;
  return xml.replace(/      <note>[\s\S]*?      <\/note>/g, (note) => {
    if (!note.includes('<voice>1</voice>') || tripletIndex >= 3) return note;
    const currentIndex = tripletIndex;
    tripletIndex += 1;
    let normalized = note.replace(
      '<staff>1</staff>',
      `${timeModification}<staff>1</staff>`,
    );
    const tuplet = currentIndex === 0
      ? '<tuplet type="start" bracket="no"/>'
      : (currentIndex === 2 ? '<tuplet type="stop"/>' : '');
    if (tuplet.length === 0) return normalized;
    if (normalized.includes('<notations>')) {
      return normalized.replace('<notations>', `<notations>${tuplet}`);
    }
    return normalized.replace(
      '      </note>',
      `        <notations>${tuplet}</notations>\n      </note>`,
    );
  });
}

function withGrace(xml) {
  return xml.replace(
    '<note>\n        <pitch><step>E</step><octave>4</octave></pitch>',
    '<note><grace slash="yes"/><pitch><step>F</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type><staff>1</staff></note>\n      <note>\n        <pitch><step>E</step><octave>4</octave></pitch>',
  );
}

function withTwoStaff(xml) {
  return xml
    .replace('<staves>1</staves>', '<staves>2</staves>')
    .replace(
      '<clef><sign>G</sign><line>2</line></clef>',
      '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>',
    )
    .replaceAll(
      '<voice>2</voice><type>quarter</type><staff>1</staff>',
      '<voice>2</voice><type>quarter</type><staff>2</staff>',
    );
}

function withObservedGuitarProDirections(xml) {
  return xml.replace(
    '    <note>',
    '    <direction directive="yes"><direction-type><metronome parentheses="no" default-y="40"><beat-unit>quarter</beat-unit><per-minute>80</per-minute></metronome></direction-type><sound tempo="80"/></direction>\n    <direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>\n    <note>',
  );
}

function withExactDisplayRehearsal(xml) {
  return xml.replace(
    '    <note>',
    '    <direction><direction-type><rehearsal>Section A</rehearsal></direction-type></direction>\n    <note>',
  );
}

test('POLY production chain accepts ordinary two-voice input without musical change', () => {
  const result = assertDeterministicPolyPass('ordinary-two-voice', fixture('ps6-counterpoint-2v.musicxml'));
  assert.equal(result.canonicalTabResult.measures.length > 0, true);
});

test('POLY production chain preserves a cross-measure tie', () => {
  const result = assertDeterministicPolyPass('cross-measure-tie', fixture('ps6-counterpoint-4v-tie.musicxml'));
  assert.equal(eventSnapshot(result).some((event) => event.tieStart), true);
  assert.equal(eventSnapshot(result).some((event) => event.tieStop), true);
});

test('POLY production chain routes exact staccato through existing normalization without shortening score time', () => {
  const result = assertDeterministicPolyPass('staccato-poly', runtimeFixture());
  assert.deepEqual(eventSnapshot(result), BASE_RUNTIME_SNAPSHOT);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('notation:staccato-context'));
});

test('POLY production chain routes exact 3:2 timing and display context without rescaling duration', () => {
  const result = assertDeterministicPolyPass('triplet-poly', withExactDisplayedTriplet(runtimeFixture()));
  assert.deepEqual(eventSnapshot(result), BASE_RUNTIME_SNAPSHOT);
  const ignored = result.preflight.issues[0].details.ignoredFeatures;
  assert.ok(ignored.includes('note:triplet-time-modification-context'));
  assert.ok(ignored.includes('notation:triplet-display-context'));
});

test('POLY production chain combines order-only grace extraction with runtime guitar metadata', () => {
  const result = assertDeterministicPolyPass('grace-poly', withGrace(runtimeFixture()));
  assert.deepEqual(eventSnapshot(result), BASE_RUNTIME_SNAPSHOT);
  assert.match(result.musicXml, /<grace slash="yes"\/><pitch><step>F<\/step><octave>4<\/octave><\/pitch>/);
  const graceNote = result.musicXml.match(/<note><grace[^>]*\/>[\s\S]*?<\/note>/)?.[0];
  assert.ok(graceNote);
  assert.doesNotMatch(graceNote, /<duration>/);
});

test('POLY production chain accepts bounded two-staff explicit-pitch layout', () => {
  const result = assertDeterministicPolyPass('two-staff-poly', withTwoStaff(runtimeFixture()));
  const snapshot = eventSnapshot(result);
  assert.equal(snapshot.filter((event) => event.voice === '1').every((event) => event.staff === 1), true);
  assert.equal(snapshot.filter((event) => event.voice === '2').every((event) => event.staff === 2), true);
});

test('POLY production chain accepts TAB clef and staff-tuning only as provenance', () => {
  const xml = runtimeFixture().replace(
    '<clef><sign>G</sign><line>2</line></clef>',
    '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details><clef><sign>TAB</sign><line>5</line></clef>',
  );
  const result = assertDeterministicPolyPass('tab-tuning-provenance', xml);
  assert.deepEqual(eventSnapshot(result), BASE_RUNTIME_SNAPSHOT);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:staff-tuning-provenance'));
});

test('POLY production chain accepts source technical string/fret only as provenance', () => {
  const xml = runtimeFixture().replace(
    '<articulations><staccato/></articulations>',
    '<technical><string>6</string><fret>12</fret></technical>',
  );
  const result = assertDeterministicPolyPass('technical-provenance', xml);
  assert.deepEqual(eventSnapshot(result), BASE_RUNTIME_SNAPSHOT);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('notation:technical:string-fret-provenance'));
  assert.notDeepEqual(result.canonicalTabResult.noteDispositions[0].selectedPosition, { string: 6, fret: 12 });
});

test('POLY production chain accepts the observed Guitar Pro metronome and dynamics forms as provenance', () => {
  const result = assertDeterministicPolyPass(
    'guitar-pro-safe-directions',
    withObservedGuitarProDirections(runtimeFixture()),
  );
  assert.deepEqual(eventSnapshot(result), BASE_RUNTIME_SNAPSHOT);
  const ignored = result.preflight.issues[0].details.ignoredFeatures;
  assert.ok(ignored.includes('measure:direction:metronome-tempo'));
  assert.ok(ignored.includes('measure:direction:dynamics'));
});

test('POLY production chain accepts an exact display-only rehearsal mark as provenance', () => {
  const result = assertDeterministicPolyPass(
    'guitar-pro-safe-rehearsal',
    withExactDisplayRehearsal(runtimeFixture()),
  );
  assert.deepEqual(eventSnapshot(result), BASE_RUNTIME_SNAPSHOT);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('measure:direction:rehearsal'));
});

test('POLY production chain remains fail-closed for timing-affecting or unbounded directions', () => {
  for (const [name, direction] of [
    ['offset', '<direction><offset>1</offset><direction-type><dynamics><mf/></dynamics></direction-type></direction>'],
    ['octave-shift', '<direction><direction-type><octave-shift type="up" size="8"/></direction-type></direction>'],
    ['navigation-sound', '<direction><direction-type><dynamics><mf/></dynamics></direction-type><sound dacapo="yes"/></direction>'],
    ['unbounded-dynamic', '<direction><direction-type><dynamics><pp/></dynamics></direction-type></direction>'],
    ['invalid-layout', '<direction directive="yes"><direction-type><metronome parentheses="maybe" default-y="40"><beat-unit>quarter</beat-unit><per-minute>80</per-minute></metronome></direction-type><sound tempo="80"/></direction>'],
    ['rehearsal-with-timing-offset', '<direction><offset>1</offset><direction-type><rehearsal>Section A</rehearsal></direction-type></direction>'],
    ['rehearsal-with-playback-sound', '<direction><direction-type><rehearsal>Section A</rehearsal></direction-type><sound dacapo="yes"/></direction>'],
    ['rehearsal-with-layout-attribute', '<direction placement="above"><direction-type><rehearsal>Section A</rehearsal></direction-type></direction>'],
    ['rehearsal-with-structured-content', '<direction><direction-type><rehearsal><display-text>Section A</display-text></rehearsal></direction-type></direction>'],
    ['rehearsal-with-direction-text', '<direction>unexpected<direction-type><rehearsal>Section A</rehearsal></direction-type></direction>'],
    ['rehearsal-with-direction-type-text', '<direction><direction-type>unexpected<rehearsal>Section A</rehearsal></direction-type></direction>'],
  ]) {
    const result = processMusicXmlUpload({
      fileName: `unsupported-direction-${name}.musicxml`,
      bytes: Buffer.from(runtimeFixture().replace('    <note>', `    ${direction}\n    <note>`)),
    });
    assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED, name);
    assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2, name);
    assert.equal(result.canonicalTabResult, null, name);
    assert.equal(result.preflight.issues[0].details.feature, 'direction', name);
  }
});

test('POLY production chain accepts the combined producer profile without losing notes or timing', () => {
  let xml = withTwoStaff(runtimeFixture())
    .replace(
      '<clef number="1"><sign>G</sign><line>2</line></clef>',
      '<staff-details number="1"><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details><clef number="1"><sign>TAB</sign><line>5</line></clef>',
    )
    .replace(
      '<articulations><staccato/></articulations>',
      '<articulations><staccato/></articulations><technical><string>6</string><fret>0</fret></technical>',
    );
  xml = withExactDisplayedTriplet(xml);
  const result = assertDeterministicPolyPass('combined-realworld-poly', xml);
  const expected = BASE_RUNTIME_SNAPSHOT.map((event) => ({
    ...event,
    staff: event.voice === '2' ? 2 : 1,
  }));
  assert.deepEqual(eventSnapshot(result), expected);
  const ignored = result.preflight.issues[0].details.ignoredFeatures;
  for (const feature of [
    'attributes:two-staff-layout',
    'attributes:staff-tuning-provenance',
    'notation:technical:string-fret-provenance',
    'notation:staccato-context',
    'note:triplet-time-modification-context',
    'notation:triplet-display-context',
  ]) assert.ok(ignored.includes(feature), feature);
});

test('POLY production chain remains fail-closed for unsupported ratio and malformed timing', () => {
  const unsupportedRatio = withExactDisplayedTriplet(runtimeFixture())
    .replaceAll('<normal-notes>2</normal-notes>', '<normal-notes>4</normal-notes>');
  const ratioResult = processMusicXmlUpload({
    fileName: 'unsupported-ratio.musicxml',
    bytes: Buffer.from(unsupportedRatio),
  });
  assert.equal(ratioResult.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(ratioResult.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(ratioResult.canonicalTabResult, null);

  const malformedBackup = fixture('ps6-counterpoint-2v.musicxml')
    .replace('<backup><duration>16</duration></backup>', '<backup><duration>999</duration></backup>');
  const timingResult = processMusicXmlUpload({
    fileName: 'malformed-backup.musicxml',
    bytes: Buffer.from(malformedBackup),
  });
  assert.equal(timingResult.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(timingResult.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(timingResult.canonicalTabResult, null);
});
