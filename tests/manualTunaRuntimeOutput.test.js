'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {
  convertMusicXmlToCanonicalTab,
  serializeCanonicalTabResultToAscii,
  serializeCanonicalTabResultToMusicXml,
} = require('../src');

const INPUT_SHA256 = '580899d3ab43b10a57f598fd04ec984dc943e6e575a259f293bd7b55784eb084';
const INPUT_GZIP_BASE64 = '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';

test('manual real-world mono runtime output: tuna-dalgalari.xml', () => {
  const input = zlib.gunzipSync(Buffer.from(INPUT_GZIP_BASE64, 'base64'));
  assert.equal(crypto.createHash('sha256').update(input).digest('hex'), INPUT_SHA256);

  const conversion = convertMusicXmlToCanonicalTab(input);
  console.log('=== APP_RUNTIME_PREFLIGHT ===');
  console.log(JSON.stringify(conversion.preflight, null, 2));

  assert.equal(conversion.preflight.canProcess, true);
  assert.ok(conversion.canonicalTabResult);

  const result = conversion.canonicalTabResult;
  console.log('=== APP_RUNTIME_SUMMARY ===');
  console.log(JSON.stringify({
    documentType: result.documentType,
    schemaVersion: result.schemaVersion,
    engine: result.engine,
    measureCount: result.measureCount,
    voiceCount: result.voiceCount,
    noteCount: result.noteCount,
    restCount: result.restCount,
    totalFingeringCost: result.totalFingeringCost,
    requiresTeacherReview: result.requiresTeacherReview,
    guitar: result.guitar,
  }, null, 2));

  const ascii = serializeCanonicalTabResultToAscii(result);
  console.log('=== APP_RUNTIME_ASCII_TAB_BEGIN ===');
  console.log(ascii);
  console.log('=== APP_RUNTIME_ASCII_TAB_END ===');

  const tabMusicXml = serializeCanonicalTabResultToMusicXml(result);
  console.log('=== APP_RUNTIME_TAB_MUSICXML_META ===');
  console.log(JSON.stringify({
    byteLength: Buffer.byteLength(tabMusicXml, 'utf8'),
    sha256: crypto.createHash('sha256').update(tabMusicXml).digest('hex'),
  }, null, 2));
});
