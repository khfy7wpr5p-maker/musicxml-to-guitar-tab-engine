'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  extractPolyphonicGraceOrnaments,
} = require('../src/parser/polyphonicGraceOrnamentExtractor');

function score(typeMarkup) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="86">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><grace slash="yes"/><pitch><step>F</step><octave>4</octave></pitch><voice>1</voice>${typeMarkup}<stem>up</stem><notehead>normal</notehead><staff>1</staff></note>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function extract(xml) {
  return extractPolyphonicGraceOrnaments(parseParsedMusicXmlDocument(xml));
}

test('COMPAT accepts exact grace type=32nd as nominal source metadata without timing synthesis', () => {
  const source = parseParsedMusicXmlDocument(score('<type>32nd</type>'));
  const before = JSON.stringify(source);
  const result = extractPolyphonicGraceOrnaments(source);
  const event = result.graceOrnamentGroups[0].notes[0];

  assert.equal(event.nominalType, '32nd');
  assert.equal(event.pitch.written, 'F4');
  assert.equal(event.voice, '1');
  assert.equal(event.staff, 1);
  assert.equal(event.slash, 'yes');
  assert.equal(Object.hasOwn(event, 'duration'), false);
  assert.equal(Object.hasOwn(event, 'durationDivisions'), false);
  assert.equal(Object.hasOwn(event, 'onsetDivisions'), false);
  assert.equal(JSON.stringify(source), before);
});

test('COMPAT preserves existing exact eighth grace behavior', () => {
  const event = extract(score('<type>eighth</type>')).graceOrnamentGroups[0].notes[0];
  assert.equal(event.nominalType, 'eighth');
  assert.equal(Object.hasOwn(event, 'durationDivisions'), false);
});

test('COMPAT keeps unreviewed grace nominal types fail-closed', () => {
  for (const type of ['16th', 'quarter', '1024th']) {
    assert.throws(
      () => extract(score(`<type>${type}</type>`)),
      (error) => error.code === 'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT'
        && error.details.field === 'type'
        && error.details.observed === type,
    );
  }
});

test('COMPAT keeps malformed 32nd type representations fail-closed', () => {
  for (const typeMarkup of [
    '<type size="cue">32nd</type>',
    '<type><display-text>32nd</display-text></type>',
    '<type>32nd</type><type>32nd</type>',
  ]) {
    assert.throws(
      () => extract(score(typeMarkup)),
      (error) => error.code === 'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
    );
  }
});
