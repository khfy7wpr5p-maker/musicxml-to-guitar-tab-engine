'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_VERSION,
  POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_AUTHORITY,
  normalizeDeferredPolyphonicPerformanceDirections,
  normalizePolyphonicPerformanceDirections,
  projectParsedMusicXmlWithPerformanceDirectionCompatibility,
} = require('../src/parser/polyphonicPerformanceDirectionNormalizer');

function score(directions = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <identification><encoding><software>Fixture</software></encoding></identification>
  <defaults/>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <print/>
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${directions}
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

function normalizedMeasure(normalization) {
  const part = normalization.parsedDocument.root.children.find((child) => child.name === 'part');
  return part.children.find((child) => child.name === 'measure');
}

test('PS-6B2A removes only allowlisted performance directions and preserves pitch source facts', () => {
  const xml = score(`
    <direction placement="below">
      <direction-type><dynamics default-y="-40"><f/></dynamics></direction-type>
      <offset sound="yes">-4</offset><sound dynamics="106.67"/><staff>1</staff>
    </direction>
    <direction placement="above">
      <direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type>
      <sound tempo="60"/><staff>1</staff>
    </direction>
    <direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type><staff>1</staff></direction>
    <direction placement="above"><direction-type><wedge type="crescendo" number="1"/></direction-type><staff>1</staff></direction>
    <direction placement="above"><direction-type><words font-style="italic">rit.</words></direction-type><staff>1</staff></direction>
  `);
  const sourceDocument = parsed(xml);
  assert.equal(featureOf(() => projectParsedMusicXmlToPolyphonicSourceModel(sourceDocument)), 'root-child:identification');

  const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);
  assert.equal(POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_AUTHORITY,
    'NON_PITCH_NON_SCORE_TIMELINE_PERFORMANCE_DIRECTIONS_ONLY',
  );
  assert.equal(normalized.ignoredDirectionCount, 5);
  assert.equal(normalizedMeasure(normalized).children.some((child) => child.name === 'direction'), false);
  assert.deepEqual(normalized.ignoredDirectionFeatureCounts, {
    'direction:dynamics': 1,
    'direction:metronome': 1,
    'direction:offset': 1,
    'direction:pedal': 1,
    'direction:sound:dynamics': 1,
    'direction:sound:tempo': 1,
    'direction:wedge': 1,
    'direction:words': 1,
  });
  assert.deepEqual(normalized.ignoredFeatures, [
    'direction:dynamics',
    'direction:metronome',
    'direction:offset',
    'direction:pedal',
    'direction:sound:dynamics',
    'direction:sound:tempo',
    'direction:wedge',
    'direction:words',
    'measure:print',
    'root:defaults',
    'root:identification',
  ]);

  const result = projectParsedMusicXmlWithPerformanceDirectionCompatibility(sourceDocument);
  assert.equal(result.sourceModel.measureCount, 1);
  assert.equal(result.sourceModel.eventCount, 1);
  assert.equal(result.sourceModel.measures[0].events[0].pitch.written, 'E3');
});

test('PS-6B2A removes bounded producer layout attributes on wedge and pedal directions', () => {
  const sourceDocument = parsed(score(`
    <direction placement="above"><direction-type><wedge type="crescendo" number="1" default-y="-65.74"/></direction-type><staff>1</staff></direction>
    <direction placement="below"><direction-type><pedal type="start" line="yes" default-y="-80.00"/></direction-type><staff>2</staff></direction>
  `).replace('<staves>1</staves>', '<staves>2</staves>'));

  const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);

  assert.equal(normalized.ignoredDirectionCount, 2);
  assert.equal(normalizedMeasure(normalized).children.some((child) => child.name === 'direction'), false);
  assert.equal(normalized.ignoredDirectionFeatureCounts['direction:wedge'], 1);
  assert.equal(normalized.ignoredDirectionFeatureCounts['direction:pedal'], 1);
});

test('PS-6B2A keeps malformed or unbounded deferred layout attributes fail-closed', () => {
  for (const direction of [
    '<direction placement="above"><direction-type><wedge type="crescendo" number="1" default-y="1000001"/></direction-type><staff>1</staff></direction>',
    '<direction placement="below"><direction-type><pedal type="start" line="yes" relative-y="NaN"/></direction-type><staff>1</staff></direction>',
    '<direction placement="above"><direction-type><wedge type="crescendo" number="1" mystery="x"/></direction-type><staff>1</staff></direction>',
  ]) {
    const sourceDocument = parsed(score(direction));
    const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);
    assert.equal(normalized.ignoredDirectionCount, 0, direction);
    assert.equal(normalizedMeasure(normalized).children.some((child) => child.name === 'direction'), true, direction);
  }
});

test('PS-6B2A keeps octave-shift fail-closed for the dedicated pitch semantic stage', () => {
  const sourceDocument = parsed(score(`
    <direction placement="above">
      <direction-type><octave-shift type="up" size="8" number="1"/></direction-type><staff>1</staff>
    </direction>
  `));
  const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);
  assert.equal(normalized.ignoredDirectionCount, 0);
  assert.equal(normalizedMeasure(normalized).children.some((child) => child.name === 'direction'), true);
  assert.equal(
    featureOf(() => projectParsedMusicXmlWithPerformanceDirectionCompatibility(sourceDocument)),
    'measure-child:direction',
  );
});

test('PS-6B2A never removes a mixed direction containing octave-shift', () => {
  const sourceDocument = parsed(score(`
    <direction placement="above">
      <direction-type><words>8va</words><octave-shift type="up" size="8" number="1"/></direction-type><staff>1</staff>
    </direction>
  `));
  const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);
  assert.equal(normalized.ignoredDirectionCount, 0);
  assert.equal(
    featureOf(() => projectParsedMusicXmlWithPerformanceDirectionCompatibility(sourceDocument)),
    'measure-child:direction',
  );
});

test('PS-6B2A rejects structural playback commands by retaining their direction', () => {
  for (const sound of [
    '<sound dacapo="yes"/>',
    '<sound segno="segno1"/>',
    '<sound fine="yes"/>',
  ]) {
    const sourceDocument = parsed(score(`
      <direction><direction-type><words>Marker</words></direction-type>${sound}<staff>1</staff></direction>
    `));
    const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);
    assert.equal(normalized.ignoredDirectionCount, 0);
    assert.equal(
      featureOf(() => projectParsedMusicXmlWithPerformanceDirectionCompatibility(sourceDocument)),
      'measure-child:direction',
    );
  }
});

test('PS-6B2A retains unknown direction types, extra children, and unbounded sound values', () => {
  const fixtures = [
    '<direction><direction-type><rehearsal>A</rehearsal></direction-type><staff>1</staff></direction>',
    '<direction><direction-type><words>text</words></direction-type><voice>1</voice><staff>1</staff></direction>',
    '<direction><direction-type><metronome><per-minute>60</per-minute></metronome></direction-type><sound tempo="10001"/><staff>1</staff></direction>',
  ];
  for (const fixture of fixtures) {
    const sourceDocument = parsed(score(fixture));
    const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);
    assert.equal(normalized.ignoredDirectionCount, 0);
    assert.equal(
      featureOf(() => projectParsedMusicXmlWithPerformanceDirectionCompatibility(sourceDocument)),
      'measure-child:direction',
    );
  }
});

test('exact segno directions are isolated as explicit single-pass review evidence', () => {
  const parsed = parseParsedMusicXmlDocument(score(`
    <direction><direction-type><segno/></direction-type></direction>
    <direction><sound segno="1"/></direction>
  `));
  const normalized = normalizeDeferredPolyphonicPerformanceDirections(parsed);

  assert.equal(normalized.reviewIssues.length, 1);
  assert.equal(normalized.reviewIssues[0].code, 'UNVERIFIED_NAVIGATION_DIRECTION_SINGLE_PASS');
  assert.equal(normalized.reviewIssues[0].details.directionCount, 2);
  assert.deepEqual(normalized.reviewIssues[0].details.kinds, ['SEGNO_MARK', 'SOUND_SEGNO']);
  assert.equal(normalizedMeasure(normalized).children.some((child) => child.name === 'direction'), false);
});

test('PS-6B2A output is deeply isolated and provenance is immutable', () => {
  const sourceDocument = parsed(score(`
    <direction><direction-type><words>rit.</words></direction-type><staff>1</staff></direction>
  `));
  const namesBefore = sourceDocument.root.children.map((child) => child.name);
  const normalized = normalizePolyphonicPerformanceDirections(sourceDocument);

  assert.deepEqual(sourceDocument.root.children.map((child) => child.name), namesBefore);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.ignoredFeatures), true);
  assert.equal(Object.isFrozen(normalized.ignoredDirectionFeatureCounts), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument), true);
  assert.equal(Object.isFrozen(normalized.parsedDocument.root), true);
});

test('PS-6B2A remains internal and does not widen the package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicPerformanceDirections, undefined);
  assert.equal(publicApi.projectParsedMusicXmlWithPerformanceDirectionCompatibility, undefined);
  assert.equal(publicApi.POLYPHONIC_PERFORMANCE_DIRECTION_NORMALIZER_VERSION, undefined);
});
