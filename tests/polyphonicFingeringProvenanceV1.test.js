'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  FINGERING_AUTHORITY,
} = require('../src/parser/polyphonicFingeringProvenance');
const {
  normalizeInstrumentAwareFingeringProvenance,
} = require('../src/app/fingeringCompatibilityNormalizer');
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

function standardGuitarStaffDetails() {
  const tuning = [['E', 2], ['A', 2], ['D', 3], ['G', 3], ['B', 3], ['E', 4]];
  return `<staff-details number="1"><staff-lines>6</staff-lines>${tuning.map(([step, octave], index) => (
    `<staff-tuning line="${index + 1}"><tuning-step>${step}</tuning-step><tuning-octave>${octave}</tuning-octave></staff-tuning>`
  )).join('')}</staff-details>`;
}

function fingering(value, attributes = '') {
  return `<notations><technical><fingering${attributes}>${value}</fingering></technical></notations>`;
}

function note({ step, octave, fingeringXml = '', chord = false, duration = 4, voice = 1, staff = 1 }) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>whole</type><staff>${staff}</staff>${fingeringXml}</note>`;
}

function score({ body, staffDetailsXml = '', partName = 'Piano', beats = 4 }) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>${partName}</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>${beats}</beats><beat-type>4</beat-type></time><staves>1</staves>${staffDetailsXml}</attributes>
    ${body}
  </measure></part>
</score-partwise>`);
}

function chordBody(firstFingering = '', secondFingering = '') {
  return [
    note({ step: 'C', octave: 4, fingeringXml: firstFingering }),
    note({ step: 'E', octave: 4, fingeringXml: secondFingering, chord: true }),
  ].join('');
}

function canonicalSelectionSnapshot(result) {
  return {
    dispositions: result.canonicalTabResult.noteDispositions,
    shapes: result.canonicalTabResult.selectedShapes,
  };
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

test('generic fingering is preserved as source annotation and binds to exact source event identity', () => {
  const bytes = score({
    body: chordBody(fingering('2', ' placement="above" substitution="no" alternate="no"')),
  });
  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );

  assert.equal(result.fingeringProvenance.recordCount, 1);
  const record = result.fingeringProvenance.records[0];
  assert.equal(record.sourceEventId, 'P1:measure:0:note:0');
  assert.equal(record.rawFingeringLexeme, '2');
  assert.equal(record.normalizedFinger, 2);
  assert.equal(record.placement, 'above');
  assert.equal(record.substitution, 'no');
  assert.equal(record.alternate, 'no');
  assert.equal(record.sourceInstrumentContext, 'UNPROVEN_GENERIC_SCORE');
  assert.equal(record.authorityClass, FINGERING_AUTHORITY.SOURCE_ANNOTATION_ONLY);
  assert.equal(result.exactGuitarFingeringConstraints.constraintCount, 0);
});

test('generic or piano fingering cannot change guitar string/fret or final shape selection', () => {
  const withoutFingering = score({ body: chordBody() });
  const withFingering = score({
    body: chordBody(fingering('1'), fingering('4')),
  });

  const baseline = processMusicXmlUpload({ fileName: 'generic-baseline.musicxml', bytes: withoutFingering });
  const annotated = processMusicXmlUpload({ fileName: 'generic-annotated.musicxml', bytes: withFingering });

  assert.equal(baseline.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(annotated.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(baseline.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(annotated.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.deepEqual(canonicalSelectionSnapshot(annotated), canonicalSelectionSnapshot(baseline));
});

test('explicit six-string guitar fingering becomes an exact existing PA-8 finger constraint', () => {
  const bytes = score({
    partName: 'Instrument',
    staffDetailsXml: standardGuitarStaffDetails(),
    body: chordBody(fingering('1'), fingering('3')),
  });

  const projected = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );
  assert.equal(projected.fingeringProvenance.authorityCounts.GUITAR_FINGERING_EXACT, 2);
  assert.equal(projected.exactGuitarFingeringConstraints.constraintCount, 2);
  assert.equal(projected.exactGuitarFingeringConstraints.bySourceEventId['P1:measure:0:note:0'], 1);
  assert.equal(projected.exactGuitarFingeringConstraints.bySourceEventId['P1:measure:0:note:1'], 3);

  const result = processMusicXmlUpload({ fileName: 'explicit-source-guitar.musicxml', bytes });
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.canonicalTabResult.selectedShapes.length, 1);
  const assignment = Object.fromEntries(
    result.canonicalTabResult.selectedShapes[0].fingerAssignments.map((entry) => (
      [entry.sourceEventId, entry.finger]
    )),
  );
  assert.equal(assignment['P1:measure:0:note:0'], 1);
  assert.equal(assignment['P1:measure:0:note:1'], 3);
});

test('identical duplicate fingering wrappers preserve both source records but create one exact constraint', () => {
  const duplicate = '<notations><technical><fingering>2</fingering></technical><technical><fingering>2</fingering></technical></notations>';
  const bytes = score({
    staffDetailsXml: standardGuitarStaffDetails(),
    body: chordBody(duplicate, fingering('3')),
  });
  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );

  const firstEventRecords = result.fingeringProvenance.records.filter(
    (record) => record.sourceEventId === 'P1:measure:0:note:0',
  );
  assert.equal(firstEventRecords.length, 2);
  assert.ok(firstEventRecords.every((record) => record.duplicateStatus === 'EQUIVALENT_DUPLICATE'));
  assert.ok(firstEventRecords.every((record) => record.authorityClass === FINGERING_AUTHORITY.GUITAR_FINGERING_EXACT));
  assert.equal(result.exactGuitarFingeringConstraints.constraintCount, 2);
  assert.equal(result.exactGuitarFingeringConstraints.bySourceEventId['P1:measure:0:note:0'], 2);
});

test('conflicting duplicate fingering wrappers become REVIEW_REQUIRED with bound source identity', () => {
  const conflicting = '<notations><technical><fingering>1</fingering></technical><technical><fingering>2</fingering></technical></notations>';
  const bytes = score({ body: chordBody(conflicting) });
  const result = processMusicXmlUpload({ fileName: 'conflicting-generic-fingering.musicxml', bytes });

  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(result.canonicalTabResult, null);
  const issue = result.preflight.issues.find((entry) => entry.code === 'CONFLICTING_FINGERING_ANNOTATIONS');
  assert.ok(issue);
  assert.equal(issue.reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(issue.location.sourceEventId, 'P1:measure:0:note:0');
});

test('invalid fingering lexeme becomes located REVIEW_REQUIRED and is never normalized to a finger number', () => {
  const bytes = score({ body: chordBody(fingering('p')) });
  const normalized = normalizeInstrumentAwareFingeringProvenance(
    parseParsedMusicXmlDocument(bytes),
  );
  assert.equal(normalized.preliminaryRecords[0].authorityClass, FINGERING_AUTHORITY.INVALID_FINGERING);
  assert.equal(normalized.preliminaryRecords[0].normalizedFinger, null);
  assert.equal(normalized.preliminaryRecords[0].rawFingeringLexeme, 'p');

  const result = processMusicXmlUpload({ fileName: 'invalid-fingering.musicxml', bytes });
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  const issue = result.preflight.issues.find((entry) => entry.code === 'INVALID_FINGERING');
  assert.ok(issue);
  assert.equal(issue.details.rawLexeme, 'p');
  assert.equal(issue.location.sourceEventId, 'P1:measure:0:note:0');
});

test('accepting fingering does not create a wildcard technical-wrapper bypass', () => {
  const mixedTechnical = '<notations><technical><fingering>1</fingering><bend><bend-alter>1</bend-alter></bend></technical></notations>';
  const bytes = score({ body: chordBody(mixedTechnical) });
  const result = processMusicXmlUpload({ fileName: 'foreign-technical.musicxml', bytes });

  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.ok(result.preflight.issues.some((issue) => (
    issue.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
  )));
});

test('215 generic fingering annotations are deterministic evidence and never become guitar constraints', () => {
  const body = Array.from({ length: 215 }, (_, index) => note({
    step: ['C', 'D', 'E', 'F', 'G', 'A', 'B'][index % 7],
    octave: 4,
    duration: 1,
    fingeringXml: fingering(String((index % 5) + 1)),
  })).join('');
  const bytes = score({ body, beats: 215 });

  const first = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );
  const second = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
    parseParsedMusicXmlDocument(bytes),
  );

  assert.equal(first.fingeringProvenance.recordCount, 215);
  assert.equal(first.exactGuitarFingeringConstraints.constraintCount, 0);
  assert.ok(first.fingeringProvenance.records.every((record) => (
    record.authorityClass === FINGERING_AUTHORITY.SOURCE_ANNOTATION_ONLY
  )));
  assert.deepEqual(first.fingeringProvenance, second.fingeringProvenance);
});

test('fingering policy stays inside one owned runtime pass and leaves caller bytes immutable', () => {
  const bytes = score({ body: chordBody(fingering('1')) });
  const before = Buffer.from(bytes);
  const beforeHash = sha256(bytes);
  let fingeringStarts = 0;
  const runtime = createProcessingRuntime({}, {
    clock: (phase) => {
      if (phase === 'polyphonic-fingering-provenance:start') fingeringStarts += 1;
      return 0;
    },
  });

  const result = processMusicXmlUpload({ fileName: 'single-pass-fingering.musicxml', bytes }, {}, runtime);
  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.PASS);
  assert.equal(result.route, MUSICXML_UPLOAD_ROUTE.POLY_V2);
  assert.equal(fingeringStarts, 1);
  assert.deepEqual(bytes, before);
  assert.equal(sha256(bytes), beforeHash);
});