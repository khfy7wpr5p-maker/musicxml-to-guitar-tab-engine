'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MusicXmlNoteParserError,
  parseMusicXmlNotes,
} = require('../src/parser/musicxmlNoteParser');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

function expectCode(input, code) {
  assert.throws(() => parseMusicXmlNotes(input), (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    return true;
  });
}

function score(measureXml, { beats = 4, beatType = 4, divisions = 4, number = '1', implicit = false } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="${number}"${implicit ? ' implicit="yes"' : ''}>
      <attributes><divisions>${divisions}</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time></attributes>
      ${measureXml}
    </measure>
  </part>
</score-partwise>`;
}

function note({
  step = 'C', alter = null, octave = 4, duration = 4, type = 'quarter',
  dots = 0, voice = 1, staff = 1, extra = '', rest = false,
} = {}) {
  const pitch = rest
    ? '<rest/>'
    : `<pitch><step>${step}</step>${alter === null ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch>`;
  return `<note>${extra}${pitch}<duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${'<dot/>'.repeat(dots)}<staff>${staff}</staff></note>`;
}

test('parses deterministic note, rest, pitch, tie, beam and dotted-rhythm data', () => {
  const result = parseMusicXmlNotes(fixture('parser-single-voice.musicxml'));

  assert.equal(result.format, 'score-partwise');
  assert.equal(result.partId, 'P1');
  assert.equal(result.measureCount, 2);
  assert.equal(result.voiceCount, 1);
  assert.ok(Object.isFrozen(result));

  const [first, second] = result.measures;
  assert.deepEqual(
    {
      number: first.number,
      index: first.index,
      divisions: first.divisions,
      timeSignature: first.timeSignature,
      expected: first.expectedDurationDivisions,
      actual: first.actualDurationDivisions,
    },
    {
      number: '1',
      index: 0,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expected: 16,
      actual: 16,
    },
  );

  assert.deepEqual(first.events[0].pitch, {
    step: 'C', alter: 0, octave: 4, written: 'C4', midi: 60,
  });
  assert.equal(first.events[0].rhythm.tieStart, true);
  assert.deepEqual(first.events[1].pitch, {
    step: 'D', alter: 1, octave: 4, written: 'D#4', midi: 63,
  });
  assert.deepEqual(first.events[1].rhythm.beam, [{ level: 1, value: 'begin' }]);
  assert.equal(first.events[3].type, 'rest');
  assert.equal(Object.hasOwn(first.events[3], 'pitch'), false);
  assert.equal(first.events[3].selectedPosition, null);
  assert.equal(first.events[3].start.divisions, 8);

  assert.equal(second.divisions, 4);
  assert.deepEqual(second.timeSignature, { beats: 4, beatType: 4 });
  assert.equal(second.events[0].rhythm.tieStop, true);
  assert.deepEqual(second.events[1].rhythm, {
    durationDivisions: 12,
    type: 'half',
    dots: 1,
    timeModification: null,
    tieStart: false,
    tieStop: false,
    beam: [],
  });
  assert.equal(second.events[1].start.beats, 1);
});

test('accepts an implicit pickup and inherits divisions and time signature', () => {
  const result = parseMusicXmlNotes(fixture('parser-pickup.musicxml'));
  const [pickup, fullMeasure] = result.measures;

  assert.equal(pickup.number, '0');
  assert.equal(pickup.implicit, true);
  assert.equal(pickup.expectedDurationDivisions, 6);
  assert.equal(pickup.actualDurationDivisions, 2);
  assert.equal(fullMeasure.divisions, 4);
  assert.deepEqual(fullMeasure.timeSignature, { beats: 3, beatType: 8 });
  assert.equal(fullMeasure.actualDurationDivisions, 6);
});

test('preserves non-numeric MusicXML measure numbers', () => {
  const result = parseMusicXmlNotes(score(note({ duration: 16, type: 'whole' }), { number: 'intro' }));
  assert.equal(result.measures[0].number, 'intro');
  assert.equal(result.measures[0].sourceLocation, undefined);
  assert.equal(result.measures[0].events[0].sourceLocation.measure, 'intro');
});

test('accepts and strips the exact trusted MusicXML DOCTYPE before parsing', () => {
  const xml = score(note({ duration: 16, type: 'whole' })).replace(
    '<score-partwise',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0.3 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise',
  );
  assert.equal(parseMusicXmlNotes(Buffer.from(xml)).measureCount, 1);
});

test('normalizes MusicXML beam hook values to the canonical data contract', () => {
  const result = parseMusicXmlNotes(score(
    note({
      duration: 1,
      type: '16th',
      extra: '<beam number="2">backward hook</beam>',
    }),
    { implicit: true, number: '0' },
  ));
  assert.deepEqual(result.measures[0].events[0].rhythm.beam, [
    { level: 2, value: 'backward-hook' },
  ]);
});

test('rejects chord, backup, forward and multiple-voice content', () => {
  expectCode(score(note({ extra: '<chord/>', duration: 16, type: 'whole' })), 'UNSUPPORTED_POLYPHONY');
  expectCode(score(`${note({ duration: 16, type: 'whole' })}<backup><duration>4</duration></backup>`), 'UNSUPPORTED_POLYPHONY');
  expectCode(score(`<forward><duration>4</duration></forward>${note({ duration: 16, type: 'whole' })}`), 'UNSUPPORTED_POLYPHONY');
  expectCode(
    score(`${note({ duration: 4, type: 'quarter', voice: 1 })}${note({ step: 'D', duration: 4, type: 'quarter', voice: 2 })}`, { beats: 2 }),
    'UNSUPPORTED_POLYPHONY',
  );
});

test('rejects grace notes, tuplets and multiple staves', () => {
  expectCode(score(note({ extra: '<grace/>', duration: 16, type: 'whole' })), 'UNSUPPORTED_GRACE_NOTE');
  expectCode(score(note({ extra: '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>', duration: 16, type: 'whole' })), 'UNSUPPORTED_TUPLET');
  expectCode(score(note({ duration: 16, type: 'whole', staff: 2 })), 'UNSUPPORTED_MULTISTAFF');
});

test('rejects unsupported rhythm types and inconsistent note durations', () => {
  expectCode(score(note({ duration: 1, type: '32nd' })), 'UNSUPPORTED_RHYTHM');
  expectCode(score(note({ duration: 2, type: 'quarter' })), 'INVALID_RHYTHM_DURATION');
});

test('rejects incomplete normal measures and pickup measures that are too long', () => {
  expectCode(score(note({ duration: 4, type: 'quarter' })), 'INVALID_MEASURE_DURATION');
  expectCode(
    score(note({ duration: 16, type: 'whole' }), { beats: 3, beatType: 8, implicit: true, number: '0' }),
    'INVALID_MEASURE_DURATION',
  );
});

test('allows an empty measure with a deterministic warning', () => {
  const result = parseMusicXmlNotes(score(''));
  assert.equal(result.voiceCount, 0);
  assert.deepEqual(result.measures[0].warnings, [{
    code: 'EMPTY_MEASURE',
    message: 'Measure contains no note or rest events.',
    severity: 'warning',
    location: { measure: '1' },
    details: {},
  }]);
});

test('uses stable parser error types and codes for parser-specific failures', () => {
  assert.throws(
    () => parseMusicXmlNotes(score(note({ duration: 4, type: 'quarter' }))),
    (error) => {
      assert.ok(error instanceof MusicXmlNoteParserError);
      assert.equal(error.code, 'INVALID_MEASURE_DURATION');
      return true;
    },
  );
});
