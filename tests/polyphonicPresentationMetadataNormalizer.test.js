'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_VERSION,
  POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_AUTHORITY,
  normalizePolyphonicPresentationMetadata,
  projectParsedMusicXmlWithPresentationCompatibility,
} = require('../src/parser/polyphonicPresentationMetadataNormalizer');

function score({ rootMetadata = '', measureMetadata = '', extraRoot = '', extraMeasure = '' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  ${rootMetadata}
  ${extraRoot}
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    ${measureMetadata}
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${extraMeasure}
    <note><pitch><step>E</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function parsed(xml) {
  return parseParsedMusicXmlDocument(xml);
}

function featureOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
    return error.details.feature;
  }
  assert.fail('Expected unsupported projection feature.');
}

test('PS-6B strips only bounded root document metadata and measure print layout', () => {
  const xml = score({
    rootMetadata: `
      <work><work-title>Fixture</work-title></work>
      <movement-number>1</movement-number>
      <movement-title>Fixture</movement-title>
      <identification><encoding><software>Fixture</software></encoding></identification>
      <defaults/>
      <credit page="1"><credit-words>Fixture</credit-words></credit>`,
    measureMetadata: '<print new-system="yes"/>',
  });
  const sourceDocument = parsed(xml);

  assert.equal(featureOf(() => projectParsedMusicXmlToPolyphonicSourceModel(sourceDocument)), 'root-child:work');

  const normalized = normalizePolyphonicPresentationMetadata(sourceDocument);
  assert.equal(normalized.contractVersion, '1.0.0');
  assert.equal(POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_AUTHORITY,
    'NON_MUSICAL_DOCUMENT_AND_LAYOUT_METADATA_ONLY',
  );
  assert.deepEqual(normalized.ignoredFeatures, [
    'measure:print',
    'root:credit',
    'root:defaults',
    'root:identification',
    'root:movement-number',
    'root:movement-title',
    'root:work',
  ]);

  const result = projectParsedMusicXmlWithPresentationCompatibility(sourceDocument);
  assert.equal(result.sourceModel.measureCount, 1);
  assert.equal(result.sourceModel.eventCount, 1);
  assert.equal(result.sourceModel.measures[0].events[0].pitch.written, 'E3');

  const clean = projectParsedMusicXmlToPolyphonicSourceModel(parsed(score()));
  assert.deepEqual(result.sourceModel, clean);
});

test('PS-6B compatibility result is deeply isolated while source parsed document remains unchanged', () => {
  const sourceDocument = parsed(score({
    rootMetadata: '<identification><encoding><software>Fixture</software></encoding></identification>',
    measureMetadata: '<print/>',
  }));
  const rootNamesBefore = sourceDocument.root.children.map((child) => child.name);
  const normalization = normalizePolyphonicPresentationMetadata(sourceDocument);

  assert.deepEqual(sourceDocument.root.children.map((child) => child.name), rootNamesBefore);
  assert.ok(sourceDocument.root.children.some((child) => child.name === 'identification'));
  assert.equal(Object.isFrozen(normalization), true);
  assert.equal(Object.isFrozen(normalization.ignoredFeatures), true);
  assert.equal(Object.isFrozen(normalization.parsedDocument), true);
  assert.equal(Object.isFrozen(normalization.parsedDocument.root), true);
  assert.equal(
    normalization.parsedDocument.root.children.some((child) => child.name === 'identification'),
    false,
  );
  const part = normalization.parsedDocument.root.children.find((child) => child.name === 'part');
  assert.equal(part.children[0].children.some((child) => child.name === 'print'), false);
});

test('PS-6B does not discard unknown root or measure-level musical semantics', () => {
  const unknownRoot = parsed(score({ extraRoot: '<unknown-root/>' }));
  assert.equal(
    featureOf(() => projectParsedMusicXmlWithPresentationCompatibility(unknownRoot)),
    'root-child:unknown-root',
  );

  const direction = parsed(score({
    extraMeasure: '<direction><direction-type><words>rit.</words></direction-type></direction>',
  }));
  assert.equal(
    featureOf(() => projectParsedMusicXmlWithPresentationCompatibility(direction)),
    'measure-child:direction',
  );
});

test('PS-6B presentation compatibility remains internal', () => {
  assert.equal(publicApi.normalizePolyphonicPresentationMetadata, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithPresentationCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_PRESENTATION_METADATA_NORMALIZER_VERSION, undefined);
});
