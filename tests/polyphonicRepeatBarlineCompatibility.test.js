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

function firstAndSecondEndingScore() {
  const forward = '      <barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>';
  const first = [
    '      <barline location="left"><ending number="1" type="start"/></barline>',
    '      <barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline>\n',
  ].join('\n');
  const second = [
    '      <barline location="left"><ending number="2" type="start"/></barline>',
    '      <barline location="right"><ending number="2" type="stop"/></barline>\n',
  ].join('\n');
  return fixture()
    .replace('      </attributes>', `      </attributes>\n${forward}`)
    .replace(
      '    </measure>\n  </part>',
      `    </measure>\n${extraMeasure('2', 'D', first)}\n${extraMeasure('3', 'E', second)}\n${extraMeasure('4', 'F')}\n  </part>`,
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

test('orphan backward repeat keeps single-pass provisional TAB at a stable source measure', () => {
  const xml = fixture().replace(
    '<bar-style>light-heavy</bar-style>',
    '<bar-style>light-heavy</bar-style><repeat direction="backward"/>',
  );
  const result = processMusicXmlUpload({
    fileName: 'orphan-backward-repeat.musicxml',
    bytes: Buffer.from(xml),
  });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.preflight.status, 'REVIEW_REQUIRED');
  assert.equal(result.preflight.canProcess, false);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  const repeatIssue = result.preflight.issues.find(
    (issue) => issue.code === 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE',
  );
  assert.ok(repeatIssue);
  assert.equal(repeatIssue.details.reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(repeatIssue.details.originalReason, 'ORPHAN_BACKWARD_REPEAT');
  assert.equal(repeatIssue.location.measureIndex, 0);
  assert.ok(result.canonicalTabResult);
  assert.equal(typeof result.musicXml, 'string');
  assert.match(result.musicXml, /<sign>TAB<\/sign>/);
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.capabilities.playback, 'APPROXIMATE');
  assert.equal(result.capabilities.export, false);
  assert.equal(result.artifacts.provisionalTabAvailable, true);
  assert.equal(result.artifacts.canonicalTabAvailable, false);
});

test('noncanonical forward repeat times yields deterministic review-only TAB without changing source bytes', () => {
  const bytes = Buffer.from(repeatScore().replace(
    '<repeat direction="forward"/>',
    '<repeat direction="forward" times="2"/>',
  ));
  const before = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'forward-times-review.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'forward-times-review.musicxml', bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(first.preflight.issues[0].code, 'NONCANONICAL_FORWARD_REPEAT_TIMES');
  assert.equal(first.preflight.issues[0].details.sourceTimes, '2');
  assert.equal(first.capabilities.generateTab, true);
  assert.equal(first.capabilities.export, false);
  assert.equal(first.artifacts.provisionalTabAvailable, true);
  assert.ok(first.canonicalTabResult);
  assert.match(first.musicXml, /<repeat direction="forward"\/>/);
  assert.doesNotMatch(first.musicXml, /<repeat direction="forward" times=/);
  assert.deepEqual(first, second);
  assert.deepEqual(bytes, before);
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

test('valid MusicXML ending presentation attributes and display text do not block repeat semantics', () => {
  const xml = firstAndSecondEndingScore().replace(
    '<ending number="1" type="start"/>',
    '<ending number="1" type="start" default-x="12" default-y="24" relative-x="1" relative-y="-2" end-length="10" text-x="3" text-y="4" font-family="Bravura Text" font-style="italic" font-size="12" font-weight="bold" color="#000000" print-object="yes" system="only-top">1.</ending>',
  );
  const bytes = Buffer.from(xml);
  const before = inputHash(bytes);

  const normalization = normalizePolyphonicRepeatBarlines(parsed(bytes));
  assert.deepEqual(sourceIndices(normalization.measureOccurrencePlan), [0, 1, 0, 2, 3]);

  const result = processMusicXmlUpload({
    fileName: 'repeat-ending-presentation.musicxml',
    bytes,
  });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.ok(result.canonicalTabResult);
  assert.match(result.musicXml, /<ending number="1" type="start" default-y="24"\/>/);
  assert.equal(inputHash(bytes), before);
});

test('valid multi-number ending remains review-only when playback semantics exceed the exact first-second contract', () => {
  const xml = firstAndSecondEndingScore().replace(
    '<ending number="1" type="start"/>',
    '<ending number="1,2" type="start">1.-2.</ending>',
  );
  const result = processMusicXmlUpload({
    fileName: 'repeat-ending-multi-number.musicxml',
    bytes: Buffer.from(xml),
  });
  assertReviewWithoutOutput(result);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_REPEAT_BARLINE');
  assert.equal(result.preflight.issues[0].details.reason, 'UNSUPPORTED_ENDING_NUMBER_OR_TYPE');
});

test('unknown ending attribute remains review-only instead of widening the compatibility profile', () => {
  const xml = firstAndSecondEndingScore().replace(
    '<ending number="1" type="start"/>',
    '<ending number="1" type="start" vendor-layout="42">1.</ending>',
  );
  const result = processMusicXmlUpload({
    fileName: 'repeat-ending-unknown-attribute.musicxml',
    bytes: Buffer.from(xml),
  });
  assertReviewWithoutOutput(result);
  assert.equal(result.preflight.issues[0].details.reason, 'UNSUPPORTED_ENDING_SHAPE');
});

test('out-of-bound ending default-y remains review-only', () => {
  const xml = firstAndSecondEndingScore().replace(
    '<ending number="1" type="start"/>',
    '<ending number="1" type="start" default-y="10001">1.</ending>',
  );
  const result = processMusicXmlUpload({
    fileName: 'repeat-ending-layout-bound.musicxml',
    bytes: Buffer.from(xml),
  });
  assertReviewWithoutOutput(result);
  assert.equal(result.preflight.issues[0].details.reason, 'UNSUPPORTED_ENDING_LAYOUT');
});

test('valid first and second endings preserve volta marks and continue TAB production', () => {
  const bytes = Buffer.from(firstAndSecondEndingScore());
  const before = inputHash(bytes);
  const normalization = normalizePolyphonicRepeatBarlines(parsed(bytes));
  assert.deepEqual(sourceIndices(normalization.measureOccurrencePlan), [0, 1, 0, 2, 3]);
  const result = processMusicXmlUpload({ fileName: 'repeat-endings.musicxml', bytes });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.match(result.musicXml, /<ending number="1" type="start"\/>/);
  assert.match(result.musicXml, /<ending number="1" type="stop"\/>/);
  assert.match(result.musicXml, /<ending number="2" type="start"\/>/);
  assert.match(result.musicXml, /<ending number="2" type="stop"\/>/);
  assert.equal(inputHash(bytes), before);
});

test('first ending without a complete second ending yields review-only single-pass TAB', () => {
  const xml = firstAndSecondEndingScore().replace(
    /\s*<barline location="left"><ending number="2" type="start"\/><\/barline>/,
    '',
  ).replace(
    /\s*<barline location="right"><ending number="2" type="stop"\/><\/barline>/,
    '',
  );
  const result = processMusicXmlUpload({ fileName: 'incomplete-endings.musicxml', bytes: Buffer.from(xml) });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.issues[0].code, 'AMBIGUOUS_REPEAT_ENDING_SINGLE_PASS');
  assert.equal(result.capabilities.generateTab, true);
  assert.equal(result.capabilities.export, false);
  assert.ok(result.musicXml);
  assert.doesNotMatch(result.musicXml, /<ending /);
});
