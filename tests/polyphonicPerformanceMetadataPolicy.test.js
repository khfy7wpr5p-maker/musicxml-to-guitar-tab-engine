'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  POLYPHONIC_PERFORMANCE_METADATA_POLICY_VERSION,
  POLYPHONIC_PERFORMANCE_METADATA_POLICY_AUTHORITY,
  normalizePolyphonicPerformanceMetadataPolicy,
} = require('../src/parser/polyphonicPerformanceMetadataPolicy');

function score(directions = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${directions}
    <note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>1</staff></note>
  </measure></part>
</score-partwise>`;
}

function parsed(xml) {
  return parseParsedMusicXmlDocument(xml);
}

function normalizedMeasure(normalization) {
  const part = normalization.parsedDocument.root.children.find((child) => child.name === 'part');
  return part.children.find((child) => child.name === 'measure');
}

function directionCount(normalization) {
  return normalizedMeasure(normalization).children.filter((child) => child.name === 'direction').length;
}

function eventSnapshot(sourceModel) {
  return sourceModel.measures.flatMap((measure) => measure.events.map((event) => ({
    type: event.type,
    voice: event.voice,
    staff: event.staff,
    onsetDivisions: event.onsetDivisions,
    durationDivisions: event.durationDivisions,
    writtenPitch: event.pitch?.written || null,
    tieStart: event.tieStart,
    tieStop: event.tieStop,
  })));
}

const INVALID_DYNAMICS_DIRECTION =
  '<direction placement="below"><direction-type><dynamics><pp/></dynamics></direction-type><staff>1</staff><sound dynamics="-1.11"/></direction>';

const VALID_METRONOME_DIRECTION =
  '<direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><staff>1</staff><sound tempo="60"/></direction>';

const LARGHETTO_DIRECTION =
  '<direction placement="above"><direction-type><words font-style="italic" default-y="40">Larghetto</words></direction-type><staff>1</staff></direction>';

test('CAP_PERFORMANCE_METADATA_POLICY_V1 classifies exact -1.11 as warning evidence without inventing dynamics', () => {
  const sourceDocument = parsed(score(INVALID_DYNAMICS_DIRECTION));
  const baselineDocument = parsed(score(''));
  const normalized = normalizePolyphonicPerformanceMetadataPolicy(sourceDocument);

  assert.equal(POLYPHONIC_PERFORMANCE_METADATA_POLICY_VERSION, '1.0.0');
  assert.equal(
    POLYPHONIC_PERFORMANCE_METADATA_POLICY_AUTHORITY,
    'NON_TAB_AUTHORITATIVE_PERFORMANCE_AND_DISPLAY_METADATA_ONLY',
  );
  assert.equal(directionCount(normalized), 0);
  assert.equal(normalized.performanceMetadataRecords.length, 1);
  assert.equal(normalized.performanceMetadataRecords[0].kind, 'DYNAMICS');
  assert.equal(normalized.performanceMetadataRecords[0].rawDynamics, '-1.11');
  assert.equal(normalized.performanceMetadataRecords[0].canonicalDynamics, null);
  assert.equal(normalized.performanceMetadataRecords[0].invalidNegativeDynamics, '-1.11');

  assert.equal(normalized.issues.length, 1);
  assert.equal(normalized.issues[0].code, 'INVALID_PERFORMANCE_DYNAMICS');
  assert.equal(normalized.issues[0].severity, 'warning');
  assert.equal(normalized.issues[0].details.rawLexeme, '-1.11');
  assert.equal(normalized.issues[0].details.policy, 'EXCLUDE_INVALID_PLAYBACK_ONLY_FIELD_WITHOUT_REPLACEMENT');

  const projected = projectParsedMusicXmlToPolyphonicSourceModel(normalized.parsedDocument);
  const baseline = projectParsedMusicXmlToPolyphonicSourceModel(baselineDocument);
  assert.deepEqual(eventSnapshot(projected), eventSnapshot(baseline));
});

test('CAP_PERFORMANCE_METADATA_POLICY_V1 handles all four observed -1.11 occurrences generically', () => {
  const sourceDocument = parsed(score(Array.from({ length: 4 }, () => INVALID_DYNAMICS_DIRECTION).join('\n')));
  const normalized = normalizePolyphonicPerformanceMetadataPolicy(sourceDocument);
  assert.equal(directionCount(normalized), 0);
  assert.equal(normalized.performanceMetadataRecords.length, 4);
  assert.equal(normalized.issues.length, 4);
  assert.equal(normalized.issues.every((issue) => issue.code === 'INVALID_PERFORMANCE_DYNAMICS'), true);
  assert.deepEqual(
    normalized.issues.map((issue) => issue.details.rawLexeme),
    ['-1.11', '-1.11', '-1.11', '-1.11'],
  );
  assert.deepEqual(
    normalized.issues.map((issue) => issue.location.eventIndex),
    [1, 2, 3, 4],
  );
});

test('CAP_PERFORMANCE_METADATA_POLICY_V1 preserves Larghetto and exact metronome as distinct metadata records', () => {
  const normalized = normalizePolyphonicPerformanceMetadataPolicy(parsed(score(
    `${LARGHETTO_DIRECTION}\n${VALID_METRONOME_DIRECTION}`,
  )));

  assert.equal(normalized.performanceMetadataRecords.length, 2);
  const words = normalized.performanceMetadataRecords.find((record) => record.kind === 'WORDS');
  const metronome = normalized.performanceMetadataRecords.find((record) => record.kind === 'METRONOME');
  assert.ok(words);
  assert.ok(metronome);
  assert.equal(words.rawText, 'Larghetto');
  assert.equal(words.displayText, 'Larghetto');
  assert.equal(Object.hasOwn(words, 'bpm'), false);
  assert.equal(metronome.beatUnit, 'quarter');
  assert.equal(metronome.rawPerMinute, '60');
  assert.equal(metronome.canonicalPerMinute, '60');
  assert.equal(metronome.rawSoundTempo, '60');
  assert.equal(metronome.conflictingTempo, false);
  assert.deepEqual(normalized.issues, []);
  assert.equal(directionCount(normalized), 1, 'words is excluded; exact metronome stays for runtime validation');
});

test('CAP_PERFORMANCE_METADATA_POLICY_V1 preserves words-only display text without guessed BPM', () => {
  const normalized = normalizePolyphonicPerformanceMetadataPolicy(parsed(score(LARGHETTO_DIRECTION)));
  assert.equal(directionCount(normalized), 0);
  assert.equal(normalized.performanceMetadataRecords.length, 1);
  const record = normalized.performanceMetadataRecords[0];
  assert.equal(record.kind, 'WORDS');
  assert.equal(record.rawText, 'Larghetto');
  assert.equal(Object.hasOwn(record, 'canonicalPerMinute'), false);
  assert.equal(normalized.issues.length, 0);
});

test('CAP_PERFORMANCE_METADATA_POLICY_V1 emits REVIEW_REQUIRED evidence instead of averaging exact tempo conflict', () => {
  const direction =
    '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type><staff>1</staff><sound tempo="61"/></direction>';
  const normalized = normalizePolyphonicPerformanceMetadataPolicy(parsed(score(direction)));

  assert.equal(directionCount(normalized), 0);
  assert.equal(normalized.performanceMetadataRecords.length, 1);
  assert.equal(normalized.performanceMetadataRecords[0].conflictingTempo, true);
  assert.equal(normalized.issues.length, 1);
  assert.equal(normalized.issues[0].code, 'CONFLICTING_PERFORMANCE_TEMPO');
  assert.equal(normalized.issues[0].severity, 'error');
  assert.equal(normalized.issues[0].reviewDisposition, 'REVIEW_REQUIRED');
  assert.equal(normalized.issues[0].details.rawPerMinute, '60');
  assert.equal(normalized.issues[0].details.rawSoundTempo, '61');
  assert.equal(normalized.issues[0].details.policy, 'NO_AVERAGING_NO_GUESSED_TEMPO');
});

test('CAP_PERFORMANCE_METADATA_POLICY_V1 leaves overrange, ultra-precision, reordered and structural directions fail-closed', () => {
  const fixtures = [
    '<direction placement="below"><direction-type><dynamics><ff/></dynamics></direction-type><staff>1</staff><sound dynamics="128"/></direction>',
    '<direction placement="below"><direction-type><dynamics><pp/></dynamics></direction-type><staff>1</staff><sound dynamics="-0.0000000000000000001"/></direction>',
    '<direction placement="below"><sound dynamics="-1.11"/><staff>1</staff><direction-type><dynamics><pp/></dynamics></direction-type></direction>',
    '<direction><direction-type><words>D.C.</words></direction-type><sound dacapo="yes"/></direction>',
    '<direction><direction-type><octave-shift type="up" size="8"/></direction-type></direction>',
    '<direction><direction-type><words>8va</words></direction-type></direction>',
  ];

  for (const direction of fixtures) {
    const normalized = normalizePolyphonicPerformanceMetadataPolicy(parsed(score(direction)));
    assert.equal(directionCount(normalized), 1, direction);
    assert.equal(normalized.issues.length, 0, direction);
  }
});

test('CAP_PERFORMANCE_METADATA_POLICY_V1 is deterministic, deeply immutable and does not mutate source parsed facts', () => {
  const sourceDocument = parsed(score(`${LARGHETTO_DIRECTION}\n${INVALID_DYNAMICS_DIRECTION}`));
  const sourceDirectionCount = sourceDocument.root.children
    .find((child) => child.name === 'part').children
    .find((child) => child.name === 'measure').children
    .filter((child) => child.name === 'direction').length;

  const first = normalizePolyphonicPerformanceMetadataPolicy(sourceDocument);
  const second = normalizePolyphonicPerformanceMetadataPolicy(sourceDocument);
  assert.deepEqual(first, second);
  assert.equal(sourceDirectionCount, 2);
  assert.equal(sourceDocument.root.children
    .find((child) => child.name === 'part').children
    .find((child) => child.name === 'measure').children
    .filter((child) => child.name === 'direction').length, 2);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.parsedDocument), true);
  assert.equal(Object.isFrozen(first.parsedDocument.root), true);
  assert.equal(Object.isFrozen(first.performanceMetadataRecords), true);
  assert.equal(Object.isFrozen(first.issues), true);
});

test('CAP_PERFORMANCE_METADATA_POLICY_V1 remains internal and does not widen package-root API', () => {
  assert.equal(publicApi.normalizePolyphonicPerformanceMetadataPolicy, undefined);
  assert.equal(publicApi.POLYPHONIC_PERFORMANCE_METADATA_POLICY_VERSION, undefined);
});
