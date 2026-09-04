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
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

const STANDARD_OPEN_STRING_MIDI = Object.freeze({
  1: 64,
  2: 59,
  3: 55,
  4: 50,
  5: 45,
  6: 40,
});

function assertBlockedUnsupported(name, xml, expectedFeature) {
  const result = processMusicXmlUpload({
    fileName: `${name}.musicxml`,
    bytes: Buffer.from(xml),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED, name);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2, name);
  assert.equal(result.canonicalTabResult, null, name);
  assert.equal(result.musicXml, null, name);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE', name);
  assert.equal(result.preflight.issues[0].details.feature, expectedFeature, name);
}

function musicalFactSnapshot(result) {
  return result.canonicalTabResult.measures.flatMap((measure) => measure.events.map((event) => ({
    type: event.type,
    voice: event.voice,
    staff: event.staff,
    onset: event.onsetDivisions,
    duration: event.durationDivisions,
    chordWithPrevious: event.source.chordWithPrevious,
    pitch: event.pitch?.written ?? null,
    tieStart: event.tieStart,
    tieStop: event.tieStop,
  })));
}

test('runtime routes real-world single-staff multi-voice guitar notation through POLY_V2 with sounding-octave normalization', () => {
  const result = processMusicXmlUpload({
    fileName: 'real-guitar.musicxml',
    bytes: fixture('runtime-realworld-guitar-poly.musicxml'),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.status, 'WARNING');
  assert.equal(result.preflight.canProcess, true);
  assert.equal(result.preflight.issues.length, 1);
  assert.equal(result.preflight.issues[0].code, 'RUNTIME_GUITAR_NOTATION_NORMALIZED');
  assert.equal(result.preflight.issues[0].details.pitchOctaveShift, -1);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:transpose'));
  assert.equal(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:key'), false);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:clef-layout'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('measure:direction:metronome-tempo'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('measure:barline:style'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('notation:slur'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('notation:articulation:staccato'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('score-part:score-instrument'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('score-part:midi-device'));
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('score-part:midi-instrument'));

  const dispositions = result.canonicalTabResult.noteDispositions;
  assert.equal(dispositions.length, 7);
  assert.equal(dispositions[0].targetPitch.written, 'E3');
  assert.equal(dispositions[0].targetPitch.midi, 52);
  assert.equal(dispositions[1].targetPitch.written, 'G3');
  assert.equal(dispositions[2].targetPitch.written, 'F#3');
  assert.equal(dispositions[4].targetPitch.written, 'C3');
  assert.equal(dispositions[4].targetPitch.midi, 48);
  assert.equal(
    dispositions.every((entry) => entry.disposition === 'KEEP' && entry.octaveShiftSemitones === 0),
    true,
  );
  assert.equal(
    dispositions.every((entry) => (
      STANDARD_OPEN_STRING_MIDI[entry.selectedPosition.string] + entry.selectedPosition.fret
      === entry.targetPitch.midi
    )),
    true,
  );

  assert.deepEqual(
    result.canonicalTabResult.measures[0].events.map((event) => ({
      sourceEventId: event.sourceEventId,
      type: event.type,
      voice: event.voice,
      onset: event.onsetDivisions,
      duration: event.durationDivisions,
      chordWithPrevious: event.source.chordWithPrevious,
      pitch: event.pitch?.written ?? null,
    })),
    [
      { sourceEventId: 'P1:measure:0:note:0', type: 'note', voice: '1', onset: 0, duration: 4, chordWithPrevious: false, pitch: 'E3' },
      { sourceEventId: 'P1:measure:0:note:1', type: 'note', voice: '1', onset: 0, duration: 4, chordWithPrevious: true, pitch: 'G3' },
      { sourceEventId: 'P1:measure:0:note:2', type: 'note', voice: '1', onset: 4, duration: 4, chordWithPrevious: false, pitch: 'F#3' },
      { sourceEventId: 'P1:measure:0:note:3', type: 'rest', voice: '1', onset: 8, duration: 4, chordWithPrevious: false, pitch: null },
      { sourceEventId: 'P1:measure:0:note:4', type: 'note', voice: '1', onset: 12, duration: 4, chordWithPrevious: false, pitch: 'A3' },
      { sourceEventId: 'P1:measure:0:note:5', type: 'note', voice: '2', onset: 0, duration: 4, chordWithPrevious: false, pitch: 'C3' },
      { sourceEventId: 'P1:measure:0:note:6', type: 'note', voice: '2', onset: 8, duration: 4, chordWithPrevious: false, pitch: 'E3' },
      { sourceEventId: 'P1:measure:0:note:7', type: 'note', voice: '2', onset: 12, duration: 4, chordWithPrevious: false, pitch: 'F3' },
    ],
  );

  assert.match(result.musicXml, /<octave-change>-1<\/octave-change>/);
  assert.match(result.musicXml, /<key><fifths>0<\/fifths><\/key>/);
  assert.match(result.musicXml, /<clef number="1"><sign>G<\/sign><line>2<\/line><\/clef>/);
  assert.match(result.musicXml, /<step>E<\/step><octave>4<\/octave>/);
  assert.match(result.musicXml, /<step>F<\/step><alter>1<\/alter><octave>4<\/octave>/);
});

test('runtime accepts explicit-pitch notation with non-G clef layout metadata', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const result = processMusicXmlUpload({
    fileName: 'f-clef-layout.musicxml',
    bytes: Buffer.from(source.replace(
      '<clef><sign>G</sign><line>2</line></clef>',
      '<clef><sign>F</sign><line>4</line></clef>',
    )),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.status, 'WARNING');
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:clef-layout'));
  assert.equal(result.canonicalTabResult.noteDispositions[0].targetPitch.written, 'E3');
});

test('runtime accepts bounded source string/fret provenance without treating it as target fingering authority', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const result = processMusicXmlUpload({
    fileName: 'source-fingering-provenance.musicxml',
    bytes: Buffer.from(source.replace(
      '<articulations><staccato/></articulations>',
      '<technical><string>6</string><fret>12</fret></technical>',
    )),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.ok(
    result.preflight.issues[0].details.ignoredFeatures
      .includes('notation:technical:string-fret-provenance'),
  );
  assert.equal(result.canonicalTabResult.noteDispositions[0].targetPitch.written, 'E3');
  assert.notDeepEqual(result.canonicalTabResult.noteDispositions[0].selectedPosition, {
    string: 6,
    fret: 12,
  });
});

test('runtime accepts the exact Guitar Pro empty harmonic technical form as provenance', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const baseline = processMusicXmlUpload({ fileName: 'harmonic-baseline.musicxml', bytes: Buffer.from(source) });
  const withHarmonic = source.replace(
    '<articulations><staccato/></articulations>',
    '<articulations><staccato/></articulations><technical><harmonic/><string>6</string><fret>12</fret></technical>',
  );
  const first = processMusicXmlUpload({ fileName: 'guitar-pro-harmonic.musicxml', bytes: Buffer.from(withHarmonic) });
  const second = processMusicXmlUpload({ fileName: 'guitar-pro-harmonic.musicxml', bytes: Buffer.from(withHarmonic) });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(first, second);
  assert.deepEqual(musicalFactSnapshot(first), musicalFactSnapshot(baseline));
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('notation:technical:harmonic-provenance'));
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('notation:technical:string-fret-provenance'));
});

test('runtime accepts the exact Guitar Pro straight-mute play form as provenance', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const baseline = processMusicXmlUpload({ fileName: 'straight-mute-baseline.musicxml', bytes: Buffer.from(source) });
  const withStraightMute = source.replace(
    '<duration>4</duration><voice>1</voice>',
    '<duration>4</duration><play><mute>straight</mute></play><voice>1</voice>',
  );
  const first = processMusicXmlUpload({ fileName: 'guitar-pro-straight-mute.musicxml', bytes: Buffer.from(withStraightMute) });
  const second = processMusicXmlUpload({ fileName: 'guitar-pro-straight-mute.musicxml', bytes: Buffer.from(withStraightMute) });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(first, second);
  assert.deepEqual(musicalFactSnapshot(first), musicalFactSnapshot(baseline));
  assert.ok(first.preflight.issues[0].details.ignoredFeatures.includes('note:play:straight-mute-provenance'));
});

test('runtime accepts bounded staff-tuning provenance while recomputing standard-guitar TAB', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const withStaffTuning = source.replace(
    '<clef><sign>G</sign><line>2</line></clef>',
    '<staff-details number="1"><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning></staff-details><clef><sign>TAB</sign><line>5</line></clef>',
  );
  const result = processMusicXmlUpload({
    fileName: 'source-staff-tuning-provenance.musicxml',
    bytes: Buffer.from(withStaffTuning),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:staff-details'));
  assert.ok(
    result.preflight.issues[0].details.ignoredFeatures
      .includes('attributes:staff-tuning-provenance'),
  );
  assert.ok(result.preflight.issues[0].details.ignoredFeatures.includes('attributes:clef-layout'));
  assert.match(result.musicXml, /<staff-tuning line="1"><tuning-step>E<\/tuning-step><tuning-octave>2<\/tuning-octave><\/staff-tuning>/);
});

test('runtime fails closed on unsupported key semantics instead of dropping notation fidelity', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  assertBlockedUnsupported(
    'unsupported-key-mode',
    source.replace('<fifths>0</fifths>', '<fifths>0</fifths><mode>dorian</mode>'),
    'key',
  );
});

test('runtime remains fail-closed for non-standard source transposition', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const unsafe = source.replace('<octave-change>-1</octave-change>', '<octave-change>-2</octave-change>');
  const result = processMusicXmlUpload({
    fileName: 'unsupported-transpose.musicxml',
    bytes: Buffer.from(unsafe),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
});

test('runtime does not silently discard unknown score-part metadata', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const unknown = source.replace(
    '<part-name>Guitar</part-name>',
    '<part-name>Guitar</part-name><unknown-part-metadata/>',
  );
  const result = processMusicXmlUpload({
    fileName: 'unknown-part-metadata.musicxml',
    bytes: Buffer.from(unknown),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
});

test('runtime classifies unsupported musical metadata fail-closed instead of dropping semantics', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const cases = [
    {
      name: 'advanced-technical-semantics',
      expectedFeature: 'notation:technical',
      xml: source.replace(
        '<articulations><staccato/></articulations>',
        '<technical><hammer-on type="start">H</hammer-on></technical>',
      ),
    },
    {
      name: 'non-empty-harmonic',
      expectedFeature: 'notation:technical',
      xml: source.replace(
        '<articulations><staccato/></articulations>',
        '<technical><harmonic><natural/></harmonic></technical>',
      ),
    },
    {
      name: 'unknown-play-mute',
      expectedFeature: 'note-child:play',
      xml: source.replace(
        '<duration>4</duration><voice>1</voice>',
        '<duration>4</duration><play><mute>palm</mute></play><voice>1</voice>',
      ),
    },
    {
      name: 'conflicting-play-mute',
      expectedFeature: 'note-child:play',
      xml: source.replace(
        '<duration>4</duration><voice>1</voice>',
        '<duration>4</duration><play><mute>straight</mute><mute>straight</mute></play><voice>1</voice>',
      ),
    },
    {
      name: 'unknown-notation',
      expectedFeature: 'notation:unknown-notation',
      xml: source.replace(
        '<articulations><staccato/></articulations>',
        '<unknown-notation/>',
      ),
    },
    {
      name: 'unknown-articulation',
      expectedFeature: 'notation:articulations',
      xml: source.replace('<staccato/>', '<unknown-articulation/>'),
    },
    {
      name: 'octave-shift-direction',
      expectedFeature: 'direction',
      xml: source.replace(
        '<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type>',
        '<direction-type><octave-shift type="down" size="8"/></direction-type>',
      ),
    },
  ];

  for (const entry of cases) {
    assertBlockedUnsupported(entry.name, entry.xml, entry.expectedFeature);
  }

  const advancedHarmony = processMusicXmlUpload({
    fileName: 'advanced-harmony.musicxml',
    bytes: Buffer.from(source.replace(
      '<barline',
      '<harmony><root><root-step>C</root-step></root><kind>major</kind><degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree></harmony><barline',
    )),
  });
  assert.equal(advancedHarmony.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(advancedHarmony.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(advancedHarmony.preflight.issues[0].code, 'UNSUPPORTED_BASIC_MUSICXML_HARMONY');
  assert.equal(
    advancedHarmony.preflight.issues[0].details.reason,
    'UNSUPPORTED_HARMONY_CHILD',
  );
});

test('runtime rejects a late guitar transpose instead of applying it to earlier notes', () => {
  const source = fixture('runtime-realworld-guitar-poly.musicxml').toString('utf8');
  const transpose = source.match(/\s*<transpose>[\s\S]*?<\/transpose>/)[0];
  const withoutInitialTranspose = source.replace(transpose, '');
  const firstNoteEnd = withoutInitialTranspose.indexOf('</note>') + '</note>'.length;
  const chordNoteEnd = withoutInitialTranspose.indexOf('</note>', firstNoteEnd) + '</note>'.length;
  const lateTranspose = `${withoutInitialTranspose.slice(0, chordNoteEnd)}<attributes>${transpose.trim()}</attributes>${withoutInitialTranspose.slice(chordNoteEnd)}`;

  assertBlockedUnsupported('late-transpose', lateTranspose, 'transpose');
});
