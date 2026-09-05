'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlThroughPolyProductionCompatibilityChain,
} = require('../src/app/polyProductionCompatibilityNormalizationChain');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  createProcessingRuntime,
} = require('../src/core/processingRuntime');

function slur(type, number = '1', attributes = '') {
  return `<notations><slur type="${type}" number="${number}"${attributes}/></notations>`;
}

function note({ step, octave = 4, duration = 2, voice = 1, staff = 1, notation = '', chord = false }) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${duration === 1 ? 'quarter' : 'half'}</type><staff>${staff}</staff>${notation}</note>`;
}

function score(body, { staves = 1 } = {}) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Instrument</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>${staves}</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalSelectionSnapshot(result) {
  return {
    dispositions: result.canonicalTabResult.noteDispositions,
    shapes: result.canonicalTabResult.selectedShapes,
  };
}

test('numbered slur start/stop becomes exact articulation provenance with source endpoints', () => {
  const bytes = score([
    note({ step: 'C', notation: slur('start', '1') }),
    note({ step: 'D', notation: slur('stop', '1') }),
  ].join(''));
  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );

  assert.equal(result.slurProvenance.recordCount, 2);
  assert.equal(result.slurProvenance.spanCount, 1);
  assert.equal(result.slurProvenance.issues.length, 0);
  assert.equal(result.slurProvenance.authority, 'ARTICULATION_METADATA_ONLY');
  assert.equal(result.slurProvenance.affectsDuration, false);
  assert.equal(result.slurProvenance.createsTie, false);
  assert.equal(result.slurProvenance.createsGuitarTechnique, false);
  assert.equal(result.slurProvenance.solverAuthority, false);

  const span = result.slurProvenance.spans[0];
  assert.equal(span.number, '1');
  assert.equal(span.voice, '1');
  assert.equal(span.staff, '1');
  assert.equal(span.startSourceEventId, 'P1:measure:0:note:0');
  assert.equal(span.stopSourceEventId, 'P1:measure:0:note:1');
});

test('slur presentation and Bezier fields are preserved but have no semantic authority', () => {
  const attributes = [
    ' bezier-x="1.25"',
    ' bezier-y="-2.5"',
    ' bezier-x2="3"',
    ' bezier-y2="-4"',
    ' bezier-offset="0.5"',
    ' bezier-offset2="-0.25"',
    ' default-x="10"',
    ' default-y="-20"',
    ' relative-x="1"',
    ' relative-y="-1"',
    ' placement="above"',
    ' orientation="over"',
    ' line-type="dashed"',
    ' dash-length="5"',
    ' space-length="2"',
    ' color="#112233"',
    ' font-family="Bravura"',
    ' font-style="italic"',
    ' font-size="10"',
    ' font-weight="bold"',
  ].join('');
  const bytes = score([
    note({ step: 'C', notation: slur('start', '2', attributes) }),
    note({ step: 'D', notation: slur('stop', '2') }),
  ].join(''));
  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );

  assert.equal(result.slurProvenance.spanCount, 1);
  const start = result.slurProvenance.records[0];
  assert.deepEqual(start.presentationMetadata, {
    'bezier-x': '1.25',
    'bezier-y': '-2.5',
    'bezier-x2': '3',
    'bezier-y2': '-4',
    'bezier-offset': '0.5',
    'bezier-offset2': '-0.25',
    'default-x': '10',
    'default-y': '-20',
    'relative-x': '1',
    'relative-y': '-1',
    placement: 'above',
    orientation: 'over',
    'line-type': 'dashed',
    'dash-length': '5',
    'space-length': '2',
    color: '#112233',
    'font-family': 'Bravura',
    'font-style': 'italic',
    'font-size': '10',
    'font-weight': 'bold',
  });
  assert.equal(result.slurProvenance.spans[0].solverAuthority, false);
});

test('slur changes neither source musical facts nor final guitar selection and creates no technique', () => {
  const baselineBytes = score([
    note({ step: 'C' }),
    note({ step: 'D' }),
  ].join(''));
  const slurredBytes = score([
    note({ step: 'C', notation: slur('start', '1', ' bezier-x="2" relative-y="-3"') }),
    note({ step: 'D', notation: slur('stop', '1') }),
  ].join(''));

  const baselineProjection = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(baselineBytes),
  );
  const slurredProjection = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(slurredBytes),
  );
  assert.deepEqual(slurredProjection.sourceModel, baselineProjection.sourceModel);
  assert.equal(slurredProjection.guitarTechniqueProvenance.recordCount, 0);
  assert.equal(slurredProjection.slurProvenance.createsTie, false);
  assert.equal(slurredProjection.slurProvenance.createsGuitarTechnique, false);

  const baseline = processMusicXmlUpload({ fileName: 'baseline.musicxml', bytes: baselineBytes });
  const slurred = processMusicXmlUpload({ fileName: 'slurred.musicxml', bytes: slurredBytes });
  assert.equal(baseline.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(slurred.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(slurred.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(canonicalSelectionSnapshot(slurred), canonicalSelectionSnapshot(baseline));
});

test('same slur number in simultaneous voices pairs independently by voice and staff context', () => {
  const bytes = score([
    note({ step: 'C', voice: 1, notation: slur('start', '1') }),
    note({ step: 'D', voice: 1, notation: slur('stop', '1') }),
    '<backup><duration>4</duration></backup>',
    note({ step: 'E', voice: 2, notation: slur('start', '1') }),
    note({ step: 'F', voice: 2, notation: slur('stop', '1') }),
  ].join(''));
  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );

  assert.equal(result.slurProvenance.spanCount, 2);
  assert.deepEqual(result.slurProvenance.spans.map((span) => span.voice).sort(), ['1', '2']);
  assert.equal(result.slurProvenance.issues.length, 0);
});

test('orphan slur stop is a located REVIEW_REQUIRED issue rather than guessed pairing', () => {
  const bytes = score([
    note({ step: 'C', notation: slur('stop', '1') }),
    note({ step: 'D' }),
  ].join(''));
  const result = processMusicXmlUpload({ fileName: 'orphan-stop.musicxml', bytes });

  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.canonicalTabResult, null);
  const issue = result.preflight.issues.find((entry) => entry.code === 'ORPHAN_SLUR_STOP');
  assert.ok(issue);
  assert.equal(issue.location.sourceEventId, 'P1:measure:0:note:0');
  assert.equal(issue.details.slurNumber, '1');
});

test('duplicate slur start becomes REVIEW_REQUIRED and is not silently re-paired', () => {
  const bytes = score([
    note({ step: 'C', duration: 1, notation: slur('start', '1') }),
    note({ step: 'D', duration: 1, notation: slur('start', '1') }),
    note({ step: 'E', duration: 2, notation: slur('stop', '1') }),
  ].join(''));
  const result = processMusicXmlUpload({ fileName: 'duplicate-start.musicxml', bytes });

  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.ok(result.preflight.issues.some((entry) => entry.code === 'DUPLICATE_SLUR_START'));
});

test('cross-staff endpoint mismatch remains review-required instead of nearest-neighbor guessing', () => {
  const bytes = score([
    note({ step: 'C', staff: 1, notation: slur('start', '1') }),
    note({ step: 'D', staff: 2, notation: slur('stop', '1') }),
  ].join(''), { staves: 2 });
  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );

  assert.equal(result.slurProvenance.spanCount, 0);
  assert.equal(result.slurProvenance.status, 'REVIEW_REQUIRED');
  assert.ok(result.slurProvenance.issues.some((entry) => entry.code === 'ORPHAN_SLUR_STOP'));
  assert.ok(result.slurProvenance.issues.some((entry) => entry.code === 'ORPHAN_SLUR_START'));
});

test('unknown slur attributes remain fail-closed and cannot use the provenance normalizer as a wildcard bypass', () => {
  const bytes = score([
    note({ step: 'C', notation: '<notations><slur type="start" number="1" mystery="x"/></notations>' }),
    note({ step: 'D', notation: slur('stop', '1') }),
  ].join(''));
  const result = processMusicXmlUpload({ fileName: 'unsupported-slur.musicxml', bytes });

  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.ok(result.preflight.issues.some((issue) => (
    issue.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
    && issue.details.feature === 'notation:slur'
  )));
});

test('Mudarra-observed Bezier slur shape is admitted without changing musical authority', () => {
  const bytes = score([
    note({ step: 'G', notation: slur('start', '1', ' bezier-x="6.7" bezier-y="-11.2" default-y="18" placement="above"') }),
    note({ step: 'A', notation: slur('stop', '1', ' bezier-x="-4.4" bezier-y="8.1" relative-x="2"') }),
  ].join(''));
  const result = processMusicXmlUpload({ fileName: 'rights-safe-observed-slur-shape.musicxml', bytes });

  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.ok(!result.preflight.issues.some((issue) => (
    issue.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
    && issue.details?.feature === 'notation:slur'
  )));
});

test('slur normalization is deterministic, single-pass and leaves caller bytes immutable', () => {
  const bytes = score([
    note({ step: 'C', notation: slur('start', '3', ' bezier-x="1" default-y="12"') }),
    note({ step: 'E', notation: '', chord: true }),
    note({ step: 'D', notation: slur('stop', '3') }),
  ].join(''));
  const before = Buffer.from(bytes);
  const beforeHash = sha256(bytes);

  const first = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );
  const second = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );
  assert.deepEqual(first.slurProvenance, second.slurProvenance);

  let slurStarts = 0;
  const runtime = createProcessingRuntime({}, {
    clock: (phase) => {
      if (phase === 'polyphonic-slur-provenance:start') slurStarts += 1;
      return 0;
    },
  });
  const publicResult = processMusicXmlUpload(
    { fileName: 'single-pass-slur.musicxml', bytes },
    {},
    runtime,
  );
  assert.equal(publicResult.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(publicResult.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(slurStarts, 1);
  assert.deepEqual(bytes, before);
  assert.equal(sha256(bytes), beforeHash);
});
