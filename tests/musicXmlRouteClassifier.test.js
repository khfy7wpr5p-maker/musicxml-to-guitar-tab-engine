'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  MUSICXML_ROUTE_REQUIREMENT,
  routeRequirementFromParsedMusicXml,
} = require('../src/app/musicXmlRouteClassifier');

function parsed(body) {
  return parseParsedMusicXmlDocument(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>${body}</attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>`));
}

test('route classifier retains MONO_V1 for an exact one-voice one-staff score', () => {
  assert.equal(
    routeRequirementFromParsedMusicXml(parsed('<staves>1</staves>')),
    MUSICXML_ROUTE_REQUIREMENT.MONO_V1,
  );
});

test('route classifier requires POLY_V2 for structural polyphony signals', () => {
  for (const source of [
    parsed('<staves>2</staves>'),
    parseParsedMusicXmlDocument(Buffer.from(`<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>G</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note><backup><duration>1</duration></backup><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type></note></measure></part></score-partwise>`)),
  ]) {
    assert.equal(routeRequirementFromParsedMusicXml(source), MUSICXML_ROUTE_REQUIREMENT.POLY_V2);
  }
});
