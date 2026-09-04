'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  createProcessingRuntime,
} = require('../src/core/processingRuntime');

function score() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    <direction placement="below"><direction-type><dynamics><pp/></dynamics></direction-type><staff>1</staff><sound dynamics="-1.11"/></direction>
    <note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

test('performance metadata diagnostics reuse the one in-budget normalization pass', () => {
  let policyStartCount = 0;
  const runtime = createProcessingRuntime({}, {
    clock: (phase) => {
      if (phase === 'polyphonic-performance-metadata-policy:start') policyStartCount += 1;
      return 0;
    },
  });

  const result = processMusicXmlUpload({
    fileName: 'single-pass.musicxml',
    bytes: Buffer.from(score()),
  }, {}, runtime);

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(policyStartCount, 1);
  assert.equal(
    result.preflight.issues.some((issue) => issue.code === 'INVALID_PERFORMANCE_DYNAMICS'),
    true,
  );
});

test('performance metadata diagnostics come from the runtime-owned byte snapshot', () => {
  const bytes = Buffer.from(score());
  let mutated = false;
  const runtime = createProcessingRuntime({}, {
    clock: (phase) => {
      if (phase === 'app-upload:start' && !mutated) {
        mutated = true;
        bytes.fill(0x20);
      }
      return 0;
    },
  });

  const result = processMusicXmlUpload({
    fileName: 'owned-snapshot.musicxml',
    bytes,
  }, {}, runtime);

  assert.equal(mutated, true);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  const issue = result.preflight.issues.find((candidate) => candidate.code === 'INVALID_PERFORMANCE_DYNAMICS');
  assert.ok(issue);
  assert.equal(issue.details.rawLexeme, '-1.11');
  assert.equal(bytes.every((value) => value === 0x20), true);
});
