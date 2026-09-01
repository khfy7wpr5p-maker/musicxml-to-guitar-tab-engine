'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MusicXmlGuitarConfigurationProvenanceError,
  extractMusicXmlGuitarConfigurationProvenance,
} = require('../src/parser/musicXmlGuitarConfigurationProvenance');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');

function fullStandardStaffDetails({ staffNumber = '1', capo = 2 } = {}) {
  return `<staff-details number="${staffNumber}"><staff-lines>6</staff-lines>
    <staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
    <staff-tuning line="2"><tuning-step>A</tuning-step><tuning-octave>2</tuning-octave></staff-tuning>
    <staff-tuning line="3"><tuning-step>D</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
    <staff-tuning line="4"><tuning-step>G</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
    <staff-tuning line="5"><tuning-step>B</tuning-step><tuning-octave>3</tuning-octave></staff-tuning>
    <staff-tuning line="6"><tuning-step>E</tuning-step><tuning-octave>4</tuning-octave></staff-tuning>
    <capo>${capo}</capo></staff-details>`;
}

function note() {
  return '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>';
}

function score(measures) {
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${measures.map((body, index) => `<measure number="${index + 1}">${body}</measure>`).join('')}</part></score-partwise>`;
}

test('capo-only later restatement reuses only the exact prior same-staff tuning', () => {
  const parsed = parseParsedMusicXmlDocument(score([
    `<attributes><divisions>1</divisions>${fullStandardStaffDetails({ staffNumber: '2', capo: 2 })}</attributes>${note()}`,
    `<attributes><staff-details number="2"><capo>2</capo></staff-details></attributes>${note()}`,
  ]));

  const result = extractMusicXmlGuitarConfigurationProvenance(parsed);
  assert.equal(result.status, 'EXPLICIT');
  assert.equal(result.recordCount, 2);
  assert.equal(result.configuration.capoFret, 2);
  assert.deepEqual(result.configuration.tuning.map(({ number, pitch }) => ({ number, pitch })), [
    { number: 1, pitch: 'E4' },
    { number: 2, pitch: 'B3' },
    { number: 3, pitch: 'G3' },
    { number: 4, pitch: 'D3' },
    { number: 5, pitch: 'A2' },
    { number: 6, pitch: 'E2' },
  ]);
});

test('capo-only later change remains unsupported after solve start', () => {
  const parsed = parseParsedMusicXmlDocument(score([
    `<attributes><divisions>1</divisions>${fullStandardStaffDetails({ staffNumber: '2', capo: 2 })}</attributes>${note()}`,
    `<attributes><staff-details number="2"><capo>3</capo></staff-details></attributes>${note()}`,
  ]));

  assert.throws(
    () => extractMusicXmlGuitarConfigurationProvenance(parsed),
    (error) => error.code === 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE',
  );
});

test('capo-only declaration cannot originate configuration or borrow another staff tuning', () => {
  const firstCapoOnly = parseParsedMusicXmlDocument(score([
    `<attributes><divisions>1</divisions><staff-details number="2"><capo>2</capo></staff-details></attributes>${note()}`,
  ]));
  assert.throws(
    () => extractMusicXmlGuitarConfigurationProvenance(firstCapoOnly),
    MusicXmlGuitarConfigurationProvenanceError,
  );

  const wrongStaff = parseParsedMusicXmlDocument(score([
    `<attributes><divisions>1</divisions>${fullStandardStaffDetails({ staffNumber: '2', capo: 2 })}</attributes>${note()}`,
    `<attributes><staff-details number="1"><capo>2</capo></staff-details></attributes>${note()}`,
  ]));
  assert.throws(
    () => extractMusicXmlGuitarConfigurationProvenance(wrongStaff),
    MusicXmlGuitarConfigurationProvenanceError,
  );
});
