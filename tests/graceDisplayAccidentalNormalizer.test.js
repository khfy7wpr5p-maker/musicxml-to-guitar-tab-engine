'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { extractPolyphonicGraceOrnaments } = require('../src/parser/polyphonicGraceOrnamentExtractor');
const {
  GRACE_DISPLAY_ACCIDENTAL_FEATURE,
  normalizeGraceDisplayAccidental,
} = require('../src/app/graceDisplayAccidentalNormalizer');

function score({ alter = 1, accidental = 'sharp', accidentalAttributes = '', accidentalBody = null } = {}) {
  const alterMarkup = alter === 0 ? '' : `<alter>${alter}</alter>`;
  const body = accidentalBody ?? accidental;
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes><note><grace slash="yes"/><pitch><step>F</step>${alterMarkup}<octave>4</octave></pitch><voice>1</voice><type>32nd</type><accidental${accidentalAttributes ? ` ${accidentalAttributes}` : ''}>${body}</accidental><stem>up</stem><staff>1</staff></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure></part></score-partwise>`;
}

function baselineScore({ alter = 1 } = {}) {
  return score({ alter }).replace(/<accidental[^>]*>[\s\S]*?<\/accidental>/, '');
}

test('exact plain grace accidental matching pitch alter is representation-only and source immutable', () => {
  const source = parseParsedMusicXmlDocument(score({ alter: 1, accidental: 'sharp' }));
  const before = JSON.stringify(source);
  const normalized = normalizeGraceDisplayAccidental(source);
  const accepted = extractPolyphonicGraceOrnaments(normalized.parsedDocument);
  const baseline = extractPolyphonicGraceOrnaments(
    parseParsedMusicXmlDocument(baselineScore({ alter: 1 })),
  );

  assert.equal(normalized.removedAccidentalCount, 1);
  assert.deepEqual(normalized.ignoredFeatures, [GRACE_DISPLAY_ACCIDENTAL_FEATURE]);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(accepted.graceOrnamentGroups, baseline.graceOrnamentGroups);
  assert.equal(accepted.graceOrnamentGroups[0].notes[0].pitch.alter, 1);
});

test('bounded plain accidental spellings must exactly match pitch alter', () => {
  for (const [alter, accidental] of [
    [-2, 'flat-flat'],
    [-1, 'flat'],
    [0, 'natural'],
    [1, 'sharp'],
    [2, 'double-sharp'],
  ]) {
    const normalized = normalizeGraceDisplayAccidental(
      parseParsedMusicXmlDocument(score({ alter, accidental })),
    );
    assert.equal(normalized.removedAccidentalCount, 1);
  }
});

test('mismatched or editorial grace accidentals remain fail-closed', () => {
  const duplicate = score({ alter: 1, accidental: 'sharp' }).replace(
    '</accidental>',
    '</accidental><accidental>sharp</accidental>',
  );
  const cases = [
    score({ alter: 1, accidental: 'flat' }),
    score({ alter: 1, accidental: 'sharp', accidentalAttributes: 'cautionary="yes"' }),
    score({ alter: 1, accidentalBody: '<display-text>sharp</display-text>' }),
    duplicate,
  ];
  for (const xml of cases) {
    assert.throws(
      () => normalizeGraceDisplayAccidental(parseParsedMusicXmlDocument(xml)),
      (error) => error.code === 'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT'
        && error.details.feature === 'accidental',
    );
  }
});
