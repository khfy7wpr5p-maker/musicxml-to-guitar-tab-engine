'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');

function fixtureText() {
  return fs.readFileSync(
    path.join(__dirname, 'fixtures', 'bach-bwv565-grace-physical-transition.musicxml'),
    'utf8',
  );
}

function withGraceType(source, nominalType) {
  return source.replaceAll('<type>eighth</type>', `<type>${nominalType}</type>`);
}

function graceNoteBodies(xml) {
  return [...xml.matchAll(/<note><grace slash="yes"\/>[\s\S]*?<\/note>/g)].map((match) => match[0]);
}

test('COMPAT production path preserves exact 32nd grace nominal type without numeric timing synthesis', () => {
  const source = fixtureText();
  const bytes = Buffer.from(withGraceType(source, '32nd'));
  const before = Buffer.from(bytes);
  const baseline = processMusicXmlUpload({
    fileName: 'grace-eighth-baseline.musicxml',
    bytes: Buffer.from(source),
  });
  const result = processMusicXmlUpload({
    fileName: 'grace-32nd-production.musicxml',
    bytes,
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.preflight.canProcess, true);
  assert.deepEqual(result.canonicalTabResult, baseline.canonicalTabResult);
  assert.equal(Buffer.compare(bytes, before), 0, 'source upload bytes must remain immutable');

  const graceBodies = graceNoteBodies(result.musicXml);
  assert.equal(graceBodies.length, 4, 'two grace notes must be emitted on notation and TAB staves');
  assert.equal(graceBodies.every((body) => body.includes('<type>32nd</type>')), true);
  assert.equal(graceBodies.every((body) => !body.includes('<duration>')), true);
  assert.equal((result.musicXml.match(/<type>32nd<\/type>/g) || []).length, 4);
  assert.equal(result.musicXml.includes('<type>eighth</type>'), false);
});

test('COMPAT production path keeps unreviewed grace nominal types fail-closed', () => {
  const source = fixtureText();
  for (const nominalType of ['16th', 'quarter', '1024th', '32ND', 'thirty-second']) {
    const result = processMusicXmlUpload({
      fileName: `grace-${nominalType}.musicxml`,
      bytes: Buffer.from(withGraceType(source, nominalType)),
    });

    assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED, nominalType);
    assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2, nominalType);
    assert.equal(result.canonicalTabResult, null, nominalType);
    assert.equal(result.musicXml, null, nominalType);
  }
});
