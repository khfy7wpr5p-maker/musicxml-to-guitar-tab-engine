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

const SOURCE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'runtime-realworld-guitar-poly.musicxml'),
  'utf8',
);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function withNotation(fragment) {
  return SOURCE.replace(
    '<articulations><staccato/></articulations>',
    fragment,
  );
}

function issueCodes(result) {
  return (result.preflight?.issues || []).map((issue) => issue.code);
}

test('bounded articulation layout attributes do not turn known staccato semantics into a block', () => {
  const bytes = Buffer.from(withNotation(
    '<articulations><staccato placement="below" default-y="-68"/></articulations>',
  ));
  const before = sha256(bytes);
  const result = processMusicXmlUpload({ fileName: 'staccato-layout.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.ok(result.canonicalTabResult);
  assert.ok(result.musicXml);
  assert.equal(sha256(bytes), before);
  const ignored = result.preflight.issues.flatMap((issue) => issue.details?.ignoredFeatures || []);
  assert.ok(ignored.includes('notation:articulation-layout'));
  assert.ok(ignored.includes('notation:articulation:staccato'));
});

test('exact down-bow source technique becomes semantic REVIEW_REQUIRED without canonical TAB authority', () => {
  const bytes = Buffer.from(withNotation(
    '<technical><down-bow placement="above"/></technical>',
  ));
  const before = sha256(bytes);
  const first = processMusicXmlUpload({ fileName: 'source-down-bow.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'source-down-bow.musicxml', bytes });

  assert.deepEqual(first, second);
  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(first.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(first.preflight.canProcess, false);
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);
  assert.ok(issueCodes(first).includes('NON_GUITAR_SOURCE_TECHNIQUE_REVIEW_REQUIRED'));
  assert.equal(sha256(bytes), before);
});

test('strong-accent source articulation is reviewable while adjacent known staccato layout remains bounded', () => {
  const bytes = Buffer.from(withNotation(
    '<articulations><strong-accent type="up" placement="above" default-y="20"/><staccato placement="above" default-y="13"/></articulations>',
  ));
  const result = processMusicXmlUpload({ fileName: 'source-strong-accent.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.ok(issueCodes(result).includes('SOURCE_ARTICULATION_REVIEW_REQUIRED'));
});

test('caesura source articulation is reviewable rather than silently discarded', () => {
  const bytes = Buffer.from(withNotation(
    '<articulations><caesura default-x="45" default-y="-61" placement="below"/></articulations>',
  ));
  const result = processMusicXmlUpload({ fileName: 'source-caesura.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.ok(issueCodes(result).includes('SOURCE_ARTICULATION_REVIEW_REQUIRED'));
});

test('unrecognized technical semantics remain fail-closed', () => {
  const bytes = Buffer.from(withNotation(
    '<technical><up-bow placement="above"/></technical>',
  ));
  const result = processMusicXmlUpload({ fileName: 'unknown-source-technique.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
  assert.equal(result.preflight.issues[0].code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
});

test('unbounded articulation layout remains fail-closed', () => {
  const bytes = Buffer.from(withNotation(
    '<articulations><staccato placement="below" default-y="1000001"/></articulations>',
  ));
  const result = processMusicXmlUpload({ fileName: 'unbounded-layout.musicxml', bytes });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.musicXml, null);
});
