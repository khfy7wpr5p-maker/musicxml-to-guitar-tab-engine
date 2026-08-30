'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  normalizePolyphonicTripletDisplay,
} = require('../src/parser/polyphonicTripletDisplayNormalizer');
const {
  processMusicXmlUpload,
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
} = require('../src/app/musicXmlUploadRuntime');

const TRIPLET = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
const GP_START = '<tuplet placement="below" number="1" bracket="yes" type="start"/>';
const GP_STOP = '<tuplet placement="below" number="1" bracket="yes" type="stop"/>';

function note({ step, chord = false, tuplet = '', voice = '1', staff = '1' }) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>4</octave></pitch><duration>2</duration><voice>${voice}</voice><type>eighth</type>${TRIPLET}<staff>${staff}</staff>${tuplet ? `<notations>${tuplet}</notations>` : ''}</note>`;
}

function score({ duplicate = GP_START, stop = GP_STOP } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar Pro triplet display</part-name></score-part></part-list>
  <part id="P1"><measure number="45">
    <attributes><divisions>3</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${note({ step: 'C', tuplet: GP_START })}
    ${note({ step: 'E', chord: true, tuplet: duplicate })}
    ${note({ step: 'D' })}
    ${note({ step: 'E', tuplet: stop })}
    <note><rest/><duration>6</duration><voice>2</voice><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function parsed(xml) {
  return parseParsedMusicXmlDocument(xml);
}

function thrownCode(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  assert.fail('Expected an error.');
}

test('accepts exact Guitar Pro bracketed-below triplet display and deduplicates chord-member start', () => {
  const result = normalizePolyphonicTripletDisplay(parsed(score()));
  assert.deepEqual(result.tripletDisplayMarkers, [
    {
      kind: 'triplet-display',
      type: 'start',
      bracket: true,
      placement: 'below',
      number: '1',
      voice: '1',
      staff: '1',
      measureIndex: 0,
      measureNumber: '45',
      sourceOrder: 0,
      notationChildIndex: 0,
    },
    {
      kind: 'triplet-display',
      type: 'stop',
      bracket: true,
      placement: 'below',
      number: '1',
      voice: '1',
      staff: '1',
      measureIndex: 0,
      measureNumber: '45',
      sourceOrder: 3,
      notationChildIndex: 0,
    },
  ]);
});

test('exact Guitar Pro bracketed triplet display reaches real POLY_V2 upload runtime without timing synthesis', () => {
  const bytes = Buffer.from(score());
  const before = Buffer.from(bytes);
  const result = processMusicXmlUpload({ fileName: 'gp-triplet-display.musicxml', bytes });

  assert.equal(
    result.status,
    MUSICXML_UPLOAD_STATUS.PASS,
    JSON.stringify(result.preflight?.issues, null, 2),
  );
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(Buffer.compare(bytes, before), 0, 'source bytes must remain immutable');
});

test('Guitar Pro triplet display profile remains fail-closed for conflicting style and non-chord duplicates', () => {
  const fixtures = [
    score({ duplicate: '<tuplet placement="below" number="2" bracket="yes" type="start"/>' }),
    score({ stop: '<tuplet placement="above" number="1" bracket="yes" type="stop"/>' }),
    score({ stop: '<tuplet placement="below" number="1" bracket="no" type="stop"/>' }),
    score().replace('<chord/>', ''),
  ];
  for (const xml of fixtures) {
    assert.ok([
      'UNSUPPORTED_POLYPHONIC_TRIPLET_DISPLAY',
      'INVALID_POLYPHONIC_TRIPLET_DISPLAY',
    ].includes(thrownCode(() => normalizePolyphonicTripletDisplay(parsed(xml)))));
  }
});
