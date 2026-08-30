'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  GuitarTechniqueProvenanceError,
  extractGuitarTechniqueProvenance,
} = require('../src/parser/guitarTechniqueProvenance');

function parsed(body) {
  return parseParsedMusicXmlDocument(`<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>${body}</note></measure></part></score-partwise>`);
}

test('foreign-namespace children inside technical/harmonic/play fail closed instead of being silently dropped', () => {
  const cases = [
    '<notations><technical><harmonic/><x:unknown xmlns:x="urn:foreign"/></technical></notations>',
    '<notations><technical><harmonic><x:unknown xmlns:x="urn:foreign"/></harmonic></technical></notations>',
    '<play><mute>straight</mute><x:unknown xmlns:x="urn:foreign"/></play>',
  ];
  for (const body of cases) {
    assert.throws(
      () => extractGuitarTechniqueProvenance(parsed(body)),
      (error) => error instanceof GuitarTechniqueProvenanceError && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE',
      body,
    );
  }
});

test('qualified attributes on accepted technique markers fail closed', () => {
  assert.throws(
    () => extractGuitarTechniqueProvenance(parsed('<notations><slide xmlns:x="urn:foreign" number="1" type="start" x:authority="solver"/></notations>')),
    (error) => error instanceof GuitarTechniqueProvenanceError && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE',
  );
});
