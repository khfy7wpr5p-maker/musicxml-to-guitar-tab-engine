'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  GuitarTechniqueProvenanceError,
  extractGuitarTechniqueProvenance,
} = require('../src/parser/guitarTechniqueProvenance');

function note(body) {
  return `<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>${body}</note>`;
}

function parsed(...bodies) {
  return parseParsedMusicXmlDocument(`<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${bodies.map(note).join('')}</measure></part></score-partwise>`);
}

test('duplicate straight-mute play nodes remain fail-closed', () => {
  assert.throws(
    () => extractGuitarTechniqueProvenance(parsed('<play><mute>straight</mute></play><play><mute>straight</mute></play>')),
    (error) => error instanceof GuitarTechniqueProvenanceError
      && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE'
      && error.details.path === 'note/play',
  );
});

test('duplicate identical slide event markers remain fail-closed while a balanced chain stays unpaired metadata', () => {
  assert.throws(
    () => extractGuitarTechniqueProvenance(parsed('<notations><slide number="5" type="start"/><slide number="5" type="start"/></notations>')),
    (error) => error instanceof GuitarTechniqueProvenanceError
      && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_SHAPE'
      && error.details.path === 'note/notations/slide',
  );

  assert.throws(
    () => extractGuitarTechniqueProvenance(parsed('<notations><slide number="5" type="stop"/><slide number="5" type="start"/></notations>')),
    (error) => error instanceof GuitarTechniqueProvenanceError
      && error.code === 'UNSUPPORTED_GUITAR_TECHNIQUE_PAIRING',
  );

  const result = extractGuitarTechniqueProvenance(parsed(
    '<notations><slide number="5" type="start"/></notations>',
    '<notations><slide number="5" type="stop"/><slide number="5" type="start"/></notations>',
    '<notations><slide number="5" type="stop"/></notations>',
  ));
  assert.equal(result.recordCount, 4);
  assert.deepEqual(result.records.map((entry) => entry.state), ['START', 'STOP', 'START', 'STOP']);
  assert.ok(result.records.every((entry) => entry.pairingId === null));
  assert.ok(result.records.every((entry) => entry.pairingBasis === null));
  assert.ok(result.records.every((entry) => entry.sourcePairingToken === null));
});
