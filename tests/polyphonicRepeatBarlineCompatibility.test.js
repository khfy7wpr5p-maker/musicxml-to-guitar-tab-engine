'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  DEFAULT_REPEAT_PLAY_COUNT,
  MAX_REPEAT_PLAY_COUNT,
  normalizePolyphonicRepeatBarlines,
} = require('../src/parser/polyphonicRepeatBarlineNormalizer');

function fixture() {
  return fs.readFileSync(
    path.join(__dirname, 'fixtures', 'runtime-realworld-guitar-poly.musicxml'),
    'utf8',
  );
}

function extraMeasure(number, pitchStep, barline = '') {
  return `    <measure number="${number}">
      <note>
        <pitch><step>${pitchStep}</step><octave>4</octave></pitch>
        <duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff>
      </note>
${barline}    </measure>`;
}

function repeatScore({ times = null } = {}) {
  const forward = '      <barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>';
  const timesAttribute = times === null ? '' : ` times="${times}"`;
  const backward = `      <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"${timesAttribute}/></barline>\n`;
  return fixture()
    .replace('      </attributes>', `      </attributes>\n${forward}`)
    .replace(
      '    </measure>\n  </part>',
      `    </measure>\n${extraMeasure('2', 'D', backward)}\n${extraMeasure('3', 'E')}\n  </part>`,
    );
}

function parsed(xml) {
  return parseParsedMusicXmlDocument(Buffer.from(xml));
}

function sourceIndices(plan) {
  return plan.map((entry) => entry.sourceMeasureIndex);
}

function inputHash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertReviewWithoutOutput(result) {
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.preflight.status, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.canProcess, false);
  assert.equal(result.preflight.issues[0].details.reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.issues[0].reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
}

test('repeat normalizer derives a deterministic two-pass occurrence plan without changing source identities', () => {
  assert.equal(DEFAULT_REPEAT_PLAY_COUNT, 2);
  const xml = repeatScore();
  const first = normalizePolyphonicRepeatBarlines(parsed(xml));
  const second = normalizePolyphonicRepeatBarlines(parsed(xml));

  assert.deepEqual(sourceIndices(first.measureOccurrencePlan), [0, 1, 0, 1, 2]);
  assert.deepEqual(first.measureOccurrencePlan, second.measureOccurrencePlan);
  assert.deepEqual(first.repeatBarlines, second.repeatBarlines);
  assert.equal(first.repeatBarlines.length, 2);
  assert.deepEqual(
    first.repeatBarlines.map((entry) => [entry.measureIndex, entry.direction, entry.barStyle]),
    [[0, 'forward', 'heavy-light'], [1, 'backward', 'light-heavy']],
  );
  assert.equal(first.repeatBarlines[1].times, null);
  assert.equal(first.repeatBarlines[1].playCount, 2);
  assert.ok(first.ignoredFeatures.includes('measure:barline:repeat-playback-order'));
});

test('explicit bounded repeat times produces the exact requested traversal', () => {
  const normalization = normalizePolyphonicRepeatBarlines(parsed(repeatScore({ times: 3 })));
  assert.deepEqual(sourceIndices(normalization.measureOccurrencePlan), [0, 1, 0, 1, 0, 1, 2]);
  assert.equal(normalization.repeatBarlines[1].times, 3);
  assert.equal(normalization.repeatBarlines[1].playCount, 3);
});

test('bar-style without repeat remains presentation-only and does not create traversal changes', () => {
  const normalization = normalizePolyphonicRepeatBarlines(parsed(fixture()));
  assert.deepEqual(sourceIndices(normalization.measureOccurrencePlan), [0]);
  assert.equal(normalization.repeatBarlines.length, 0);
  assert.equal(normalization.ignoredFeatures.length, 0);
});

test('POLY_V2 preserves repeat marks in TAB MusicXML while canonical source measure identities remain single-copy', () => {
  const bytes = Buffer.from(repeatScore());
  const before = inputHash(bytes);
  const first = processMusicXmlUpload({ fileName: 'repeat-safe.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'repeat-safe.musicxml', bytes });
  const after = inputHash(bytes);

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(first.canonicalTabResult.measures.length, 3);
  assert.deepEqual(
    first.canonicalTabResult.measures.map((measure) => measure.index),
    [0, 1, 2],
  );
  assert.match(
    first.musicXml,
    /<barline location="left"><bar-style>heavy-light<\/bar-style><repeat direction="forward"\/><\/barline>/,
  );
  assert.match(
    first.musicXml,
    /<barline location="right"><bar-style>light-heavy<\/bar-style><repeat direction="backward"\/><\/barline>/,
  );
  assert.deepEqual(first, second);
  assert.equal(before, after);
  assert.ok(
    first.preflight.issues[0].details.ignoredFeatures
      .includes('measure:barline:repeat-playback-order'),
  );
});

test('writer preserves explicit repeat times rather than normalizing the source lexeme away', () => {
  const result = processMusicXmlUpload({
    fileName: 'repeat-times.musicxml',
    bytes: Buffer.from(repeatScore({ times: 3 })),
  });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.match(result.musicXml, /<repeat direction="backward" times="3"\/>/);
});

test('orphan backward repeat requires review without output at a stable source measure', () => {
  const xml = fixture().replace(
    '<bar-style>light-heavy</bar-style>',
    '<bar-style>light-heavy</bar-style><repeat direction="backward"/>',
  );
  const result = processMusicXmlUpload({
    fileName: 'orphan-backward-repeat.musicxml',
    bytes: Buffer.from(xml),
  });
  assertReviewWithoutOutput(result);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE');
  assert.equal(result.preflight.issues[0].details.reason, 'ORPHAN_BACKWARD_REPEAT');
  assert.equal(result.preflight.issues[0].location.measureIndex, 0);
});

test('nested repeat structure requires review without traversal or output', () => {
  const xml = repeatScore().replace(
    '    <measure number="2">',
    '    <measure number="2">\n      <barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>',
  );
  const result = processMusicXmlUpload({
    fileName: 'nested-repeat.musicxml',
    bytes: Buffer.from(xml),
  });
  assertReviewWithoutOutput(result);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE');
  assert.equal(result.preflight.issues[0].details.reason, 'NESTED_REPEAT_UNSUPPORTED');
});

test('repeat times above the unchanged fixed bound requires review without output', () => {
  const result = processMusicXmlUpload({
    fileName: 'repeat-times-excessive.musicxml',
    bytes: Buffer.from(repeatScore({ times: MAX_REPEAT_PLAY_COUNT + 1 })),
  });
  assertReviewWithoutOutput(result);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE');
  assert.equal(result.preflight.issues[0].details.reason, 'REPEAT_TIMES_OUT_OF_RANGE');
});

test('repeat barline with ending/volta metadata is not admitted by the V1 wildcard boundary', () => {
  const xml = repeatScore().replace(
    '<bar-style>light-heavy</bar-style><repeat direction="backward"/>',
    '<ending number="1" type="stop"/><bar-style>light-heavy</bar-style><repeat direction="backward"/>',
  );
  const result = processMusicXmlUpload({
    fileName: 'repeat-ending-unsupported.musicxml',
    bytes: Buffer.from(xml),
  });
  assertReviewWithoutOutput(result);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE');
});
