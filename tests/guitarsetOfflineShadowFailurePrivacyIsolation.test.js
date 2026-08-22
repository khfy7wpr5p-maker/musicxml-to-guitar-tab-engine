'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../src/parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  createBlindBaselineArrangementDecisions,
  createBlindBaselineEngineResult,
} = require('../src/benchmark/blindBaselineEngineObserver');
const { createGuitarVoicingCandidateModel } = require('../src/music/guitarVoicingCandidateModel');
const {
  parsePythonHexFloat,
  createGuitarSetObservedVoicingShadowReport,
} = require('../src/learning/guitarsetObservedVoicingShadow');
const {
  createControlledOfflineShadowEvidence,
} = require('../tools/controlledOfflineGuitarSetShadowRunner');
const {
  evaluateGuitarSetShadowCoverage,
} = require('../tools/guitarsetShadowCoverageGate');

const REPO_ROOT = path.join(__dirname, '..');
const MODEL_PATH = path.join(
  __dirname,
  'fixtures',
  'guitarsetObservedVoicingDevelopmentModelV1.json',
);
const ENGINE_SHA = 'd'.repeat(40);

function readModel() {
  return JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function score(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>offline isolation</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves></attributes>
    ${body}
  </measure></part>
</score-partwise>`;
}

function note(step, { octave = 4, chord = false } = {}) {
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
}

function sourceModel(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function dyad(stepA, octaveA, stepB, octaveB) {
  return sourceModel(score([
    note(stepA, { octave: octaveA }),
    note(stepB, { octave: octaveB, chord: true }),
  ].join('')));
}

function controlledFixture(xml, evaluationId = 'offline-isolation-fixture') {
  return Object.freeze({
    evaluationId,
    expectedSha256: createHash('sha256').update(xml, 'utf8').digest('hex'),
    musicXml: xml,
  });
}

function assertDeterministicBaselineUnchanged(source, action, expectedError) {
  const before = createBlindBaselineEngineResult(source);
  assert.ok(before);
  if (expectedError) {
    assert.throws(action, expectedError);
  } else {
    action();
  }
  const after = createBlindBaselineEngineResult(source);
  assert.deepEqual(after, before);
  return before;
}

test('missing, malformed, corrupted and SHA-mismatched retained models fail closed without changing the deterministic baseline', () => {
  const xml = score([
    note('C', { octave: 3 }),
    note('E', { octave: 3, chord: true }),
  ].join(''));
  const source = sourceModel(xml);
  const fixture = controlledFixture(xml);
  const valid = readModel();

  const corrupted = clone(valid);
  corrupted.parameters.logistic_coef_hex[0] = '0x1.0000000000000p+0';

  const shaMismatch = clone(valid);
  shaMismatch.artifact_sha256 = '0'.repeat(64);

  for (const modelArtifact of [undefined, {}, corrupted, shaMismatch]) {
    assertDeterministicBaselineUnchanged(
      source,
      () => createControlledOfflineShadowEvidence({
        engineCommitSha: ENGINE_SHA,
        fixtures: [fixture],
        modelArtifact,
      }),
      (error) => error
        && error.code === 'CONTROLLED_OFFLINE_SHADOW_HARD_STOP'
        && /model identity\/provenance validation failed/i.test(error.message),
    );
  }
});

test('non-finite model transport input fails closed and cannot affect deterministic fingering', () => {
  const source = dyad('C', 3, 'E', 3);
  assertDeterministicBaselineUnchanged(
    source,
    () => parsePythonHexFloat('0x1.fffffffffffffp+1024'),
    /finite number/i,
  );
});

test('shadow candidate-model exceptions are isolated from deterministic baseline state', () => {
  const source = dyad('C', 3, 'E', 3);
  const decisions = createBlindBaselineArrangementDecisions(source);
  const candidates = createGuitarVoicingCandidateModel(source, decisions);
  const malformed = clone(candidates);
  malformed.groups[0].candidateCount += 1;

  assertDeterministicBaselineUnchanged(
    source,
    () => createGuitarSetObservedVoicingShadowReport(malformed, readModel()),
    /candidateCount|candidates\.length/i,
  );
});

test('zero-candidate and fret-20 domain mismatch paths remain diagnostic-only and preserve deterministic output', () => {
  for (const source of [dyad('E', 2, 'E', 2), dyad('C', 4, 'E', 4)]) {
    const before = createBlindBaselineEngineResult(source);
    const decisions = createBlindBaselineArrangementDecisions(source);
    const candidates = createGuitarVoicingCandidateModel(source, decisions);
    const report = createGuitarSetObservedVoicingShadowReport(candidates, readModel());

    assert.equal(report.scoredGroupCount, 0);
    assert.equal(report.authoritativeDecisionEffectAuthorized, false);
    assert.equal(report.runtimeConnectionAuthorized, false);
    assert.equal(report.tabOutputEffectAuthorized, false);
    assert.equal(report.productionAuthorized, false);
    assert.deepEqual(createBlindBaselineEngineResult(source), before);
  }
});

test('consumer-side evidence serialization failure cannot back-propagate into deterministic engine output', () => {
  const xml = score([
    note('C', { octave: 3 }),
    note('E', { octave: 3, chord: true }),
  ].join(''));
  const source = sourceModel(xml);
  const evidence = createControlledOfflineShadowEvidence({
    engineCommitSha: ENGINE_SHA,
    fixtures: [controlledFixture(xml)],
    modelArtifact: readModel(),
  });
  const before = createBlindBaselineEngineResult(source);

  assert.throws(
    () => JSON.stringify({ evidence, intentionallyUnserializableDiagnostic: 1n }),
    TypeError,
  );
  assert.deepEqual(createBlindBaselineEngineResult(source), before);
  assert.equal(evidence.authoritativeDecisionEffectAuthorized, false);
  assert.equal(evidence.canonicalResultEffectAuthorized, false);
  assert.equal(evidence.tabOutputEffectAuthorized, false);
});

test('a determinism-gate failure hard-stops offline promotion logic without changing deterministic output', () => {
  const xml = score([
    note('C', { octave: 3 }),
    note('E', { octave: 3, chord: true }),
  ].join(''));
  const source = sourceModel(xml);
  const evidence = createControlledOfflineShadowEvidence({
    engineCommitSha: ENGINE_SHA,
    fixtures: [controlledFixture(xml)],
    modelArtifact: readModel(),
  });
  const before = createBlindBaselineEngineResult(source);

  assert.throws(
    () => evaluateGuitarSetShadowCoverage({
      evidence,
      determinism: {
        repetitions: 10,
        deterministic: false,
      },
    }),
    (error) => error && error.code === 'GUITARSET_SHADOW_COVERAGE_HARD_STOP',
  );
  assert.deepEqual(createBlindBaselineEngineResult(source), before);
});

test('controlled shadow input rejects filename/path/private-label payload expansion', () => {
  const xml = score([
    note('C', { octave: 3 }),
    note('E', { octave: 3, chord: true }),
  ].join(''));
  const fixture = {
    ...controlledFixture(xml),
    filename: 'user-upload.musicxml',
  };

  assert.throws(
    () => createControlledOfflineShadowEvidence({
      engineCommitSha: ENGINE_SHA,
      fixtures: [fixture],
      modelArtifact: readModel(),
    }),
    /fields do not match|frozen contract/i,
  );
});

test('offline GuitarSet shadow code has no network/telemetry persistence capability', () => {
  const reviewedFiles = [
    path.join(REPO_ROOT, 'src', 'learning', 'guitarsetObservedVoicingShadow.js'),
    path.join(REPO_ROOT, 'tools', 'controlledOfflineGuitarSetShadowRunner.js'),
    path.join(REPO_ROOT, 'tools', 'guitarsetShadowCoverageGate.js'),
    path.join(REPO_ROOT, 'tools', 'guitarsetOfflineShadowDiagnostics.js'),
  ];
  const forbidden = [
    /require\(['"](?:node:)?(?:http|https|net|tls|dgram)['"]\)/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\baxios\b/,
    /\btelemetry\b\s*\(/i,
  ];

  for (const filePath of reviewedFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.relative(REPO_ROOT, filePath)}: ${pattern}`);
    }
  }
});
