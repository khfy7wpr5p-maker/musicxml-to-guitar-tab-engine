'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {
  convertMusicXmlToCanonicalTab,
  serializeCanonicalTabResult,
  serializeCanonicalTabResultToAscii,
  serializeCanonicalTabResultToMusicXml,
} = require('../src');

const INPUT_SHA256 = '580899d3ab43b10a57f598fd04ec984dc943e6e575a259f293bd7b55784eb084';
const fixtureSource = fs.readFileSync(path.join(__dirname, '..', 'tests', 'manualTunaRuntimeOutput.test.js'), 'utf8');
const match = fixtureSource.match(/const INPUT_GZIP_BASE64 = '([^']+)'/);
if (!match) {
  throw new Error('Embedded tuna runtime input was not found.');
}

const input = zlib.gunzipSync(Buffer.from(match[1], 'base64'));
const inputSha256 = crypto.createHash('sha256').update(input).digest('hex');
if (inputSha256 !== INPUT_SHA256) {
  throw new Error(`Input SHA mismatch: ${inputSha256}`);
}

const conversion = convertMusicXmlToCanonicalTab(input);
if (!conversion.preflight.canProcess || !conversion.canonicalTabResult) {
  throw new Error(`Application preflight blocked input: ${JSON.stringify(conversion.preflight)}`);
}

const result = conversion.canonicalTabResult;
const ascii = serializeCanonicalTabResultToAscii(result);
const tabMusicXml = serializeCanonicalTabResultToMusicXml(result);
const canonicalJson = serializeCanonicalTabResult(result);
const outputDir = process.env.OUTPUT_DIR || path.join(process.cwd(), 'tmp', 'tuna-runtime-output');
fs.mkdirSync(outputDir, { recursive: true });

const summary = {
  inputSha256,
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
  tabMusicXmlByteLength: Buffer.byteLength(tabMusicXml, 'utf8'),
  tabMusicXmlSha256: crypto.createHash('sha256').update(tabMusicXml).digest('hex'),
};

fs.writeFileSync(path.join(outputDir, 'preflight.json'), `${JSON.stringify(conversion.preflight, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'tab.txt'), `${ascii}\n`);
fs.writeFileSync(path.join(outputDir, 'tab.musicxml'), tabMusicXml);
fs.writeFileSync(path.join(outputDir, 'canonical-tab-result.json'), canonicalJson);
console.log(JSON.stringify(summary, null, 2));
