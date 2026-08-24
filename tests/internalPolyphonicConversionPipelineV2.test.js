'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const publicApi = require('../src');
const {
  PROCESSING_DEADLINE_EXCEEDED,
  createProcessingRuntime,
} = require('../src/core/processingRuntime');
const {
  InternalPolyphonicConversionV2Error,
  convertMusicXmlToInternalPolyphonicTabV2,
} = require('../src/core/internalPolyphonicConversionPipelineV2');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function preservedDecisions(count) {
  return Array.from({ length: count }, (_, index) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [`P1:measure:0:note:${index}`],
    sourceGroupId: null,
  }));
}

function deeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((nested) => deeplyFrozen(nested, seen));
}

test('PA-12 runs raw multi-voice MusicXML through one bounded internal v2 pipeline deterministically', () => {
  const phases = [];
  const runtime = createProcessingRuntime({}, {
    clock(phase) {
      phases.push(phase);
      return 0;
    },
  });
  const input = fixture('pa12-polyphonic-e2e.musicxml');
  const decisions = preservedDecisions(8);
  const result = convertMusicXmlToInternalPolyphonicTabV2(input, decisions, {}, runtime);

  assert.equal(result.documentType, 'InternalPolyphonicTabV2Conversion');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.sourceModel.documentType, 'PolyphonicSourceModel');
  assert.equal(result.sourceModel.eventCount, 8);
  assert.equal(result.canonicalTabResult.documentType, 'CanonicalTabResult');
  assert.equal(result.canonicalTabResult.schemaVersion, '2.0.0');
  assert.equal(result.canonicalTabResult.simultaneousGroups.length, 4);
  assert.equal(result.canonicalTabResult.noteDispositions.length, 8);
  assert.equal(result.canonicalTabResult.selectedShapes.length, 4);
  assert.equal(result.canonicalTabResult.noteDispositions.every((entry) => entry.disposition === 'KEEP'), true);
  assert.equal(deeplyFrozen(result.sourceModel), true);
  assert.equal(deeplyFrozen(result.canonicalTabResult), true);
  assert.equal(Object.isFrozen(result), true);

  const parsedOutput = parseParsedMusicXmlDocument(result.musicXml);
  assert.equal(parsedOutput.root.name, 'score-partwise');
  assert.equal((result.musicXml.match(/<note>/g) || []).length, 16);
  assert.equal((result.musicXml.match(/<staff>1<\/staff>/g) || []).length, 8);
  assert.equal((result.musicXml.match(/<staff>2<\/staff>/g) || []).length, 8);

  for (const requiredPhase of [
    'internal-polyphonic-v2:start',
    'xml:start',
    'polyphonic-projector:start',
    'canonical-tab-result-v2:start',
    'deterministic-final-selection:start',
    'internal-polyphonic-v2:canonical',
    'canonical-tab-musicxml-v2:start',
    'canonical-tab-musicxml-v2:measure',
    'canonical-tab-musicxml-v2:complete',
    'internal-polyphonic-v2:complete',
  ]) {
    assert.equal(phases.includes(requiredPhase), true, `missing shared runtime phase: ${requiredPhase}`);
  }

  const repeated = convertMusicXmlToInternalPolyphonicTabV2(input, decisions);
  assert.deepEqual(repeated.canonicalTabResult, result.canonicalTabResult);
  assert.equal(repeated.musicXml, result.musicXml);
});

test('PA-12 enforces the shared processing deadline during MusicXML serialization', () => {
  const runtime = createProcessingRuntime(
    { maxProcessingMilliseconds: 100 },
    {
      clock(phase) {
        return phase === 'canonical-tab-musicxml-v2:fragment' ? 101 : 0;
      },
    },
  );

  assert.throws(
    () => convertMusicXmlToInternalPolyphonicTabV2(
      fixture('pa12-polyphonic-e2e.musicxml'),
      preservedDecisions(8),
      {},
      runtime,
    ),
    (error) => {
      assert.equal(error.code, PROCESSING_DEADLINE_EXCEEDED);
      assert.equal(error.details.phase, 'canonical-tab-musicxml-v2:fragment');
      return true;
    },
  );
});

test('PA-12 internal execution does not drift public monophonic conversion or package-root exports', () => {
  const monophonic = fixture('parser-single-voice.musicxml');
  const before = publicApi.convertMusicXmlToCanonicalTab(monophonic);
  assert.ok(before.canonicalTabResult);

  convertMusicXmlToInternalPolyphonicTabV2(
    fixture('pa12-polyphonic-e2e.musicxml'),
    preservedDecisions(8),
  );

  const after = publicApi.convertMusicXmlToCanonicalTab(monophonic);
  assert.deepEqual(after, before);
  assert.deepEqual(Object.keys(publicApi).sort(), [
    'ENGINE_ERROR_CONTRACT_VERSION',
    'FretboardError',
    'PREFLIGHT_STATUS',
    'convertMusicXmlToCanonicalTab',
    'getPositionCandidates',
    'isEngineError',
    'positionToMidi',
    'preflightMusicXml',
    'serializeCanonicalTabResult',
    'serializeCanonicalTabResultToAscii',
    'serializeCanonicalTabResultToMusicXml',
    'validateMidi',
  ].sort());
  assert.equal(Object.hasOwn(publicApi, 'convertMusicXmlToInternalPolyphonicTabV2'), false);
  assert.equal(Object.hasOwn(publicApi, 'createCanonicalTabResultV2'), false);
  assert.equal(Object.hasOwn(publicApi, 'serializeCanonicalTabResultV2ToMusicXml'), false);
});

test('PA-12 fails closed on retained sustained overlap instead of guessing hand occupancy', () => {
  const input = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Overlap</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    <forward><duration>8</duration></forward>
  </measure></part>
</score-partwise>`;

  assert.throws(
    () => convertMusicXmlToInternalPolyphonicTabV2(input, preservedDecisions(2)),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION');
      assert.equal(error.details.reason, 'RETAINED_SUSTAINED_OVERLAP_NOT_SUPPORTED');
      return true;
    },
  );
});

test('PA-12 rejects unknown and proxy pipeline options before processing', () => {
  assert.throws(
    () => convertMusicXmlToInternalPolyphonicTabV2(
      fixture('pa12-polyphonic-e2e.musicxml'),
      preservedDecisions(8),
      { public: true },
    ),
    (error) => {
      assert.ok(error instanceof InternalPolyphonicConversionV2Error);
      assert.equal(error.code, 'INVALID_INTERNAL_POLYPHONIC_V2_OPTIONS');
      return true;
    },
  );

  let trapCalled = false;
  const hostileOptions = new Proxy({}, {
    getPrototypeOf() {
      trapCalled = true;
      throw new Error('must not execute');
    },
  });
  assert.throws(
    () => convertMusicXmlToInternalPolyphonicTabV2(
      fixture('pa12-polyphonic-e2e.musicxml'),
      preservedDecisions(8),
      hostileOptions,
    ),
    (error) => {
      assert.ok(error instanceof InternalPolyphonicConversionV2Error);
      assert.equal(error.code, 'INVALID_INTERNAL_POLYPHONIC_V2_OPTIONS');
      return true;
    },
  );
  assert.equal(trapCalled, false);
});
