'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  PROCESSING_DEADLINE_EXCEEDED,
} = require('../src/core/processingRuntime');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  createBlindBaselineEngineExecution,
  createBlindBaselineEngineResult,
} = require('../src/benchmark/blindBaselineEngineObserver');
const {
  createGuitarSetVoicingModelV2ShadowReport,
} = require('../src/learning/guitarsetVoicingModelV2Shadow');
const {
  GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE,
  GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY,
  observeGuitarSetVoicingModelV2RuntimeShadow,
  createBlindBaselineGuitarSetV2RuntimeShadowObservation,
} = require('../src/learning/guitarsetVoicingModelV2RuntimeShadow');
const modelArtifact = require('./fixtures/guitarsetObservedVoicingDevelopmentModelV2.json');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_ROOT = path.join(ROOT, 'benchmarks', 'teacher-arrangement-v1', 'fixtures');

function sourceModel(filename) {
  const xml = fs.readFileSync(path.join(FIXTURE_ROOT, filename), 'utf8');
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function assertNoDecisionAuthority(observation) {
  assert.equal(observation.liveOrUserInputAuthorized, false);
  assert.equal(observation.candidateGenerationAuthorized, false);
  assert.equal(observation.candidateMutationAuthorized, false);
  assert.equal(observation.candidateFilteringAuthorized, false);
  assert.equal(observation.authoritativeDecisionEffectAuthorized, false);
  assert.equal(observation.canonicalResultEffectAuthorized, false);
  assert.equal(observation.tabOutputEffectAuthorized, false);
  assert.equal(observation.checkpointMutationAuthorized, false);
  assert.equal(observation.refitAuthorized, false);
  assert.equal(observation.productionAuthorized, false);
  assert.equal(observation.fret20QualityAuthority, false);
}

test('runtime shadow connection is default-off and does not require or validate a model artifact', () => {
  const source = sourceModel('two-note-interval.musicxml');
  const expected = createBlindBaselineEngineResult(source);
  const observation = createBlindBaselineGuitarSetV2RuntimeShadowObservation(source, {
    modelArtifact: { deliberately: 'invalid-but-unused' },
  });

  assert.deepEqual(observation.deterministicResult, expected);
  assert.equal(observation.gate, GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_GATE);
  assert.equal(observation.shadowObservation.policy, GUITARSET_V2_RUNTIME_SHADOW_CONNECTION_POLICY);
  assert.equal(observation.shadowObservation.status, 'RUNTIME_SHADOW_DISABLED_DEFAULT');
  assert.equal(observation.shadowObservation.defaultEnabled, false);
  assert.equal(observation.shadowObservation.enabled, false);
  assert.equal(observation.shadowObservation.shadowExecutionOccurred, false);
  assert.equal(observation.shadowObservation.candidateReadCopyCreated, false);
  assert.equal(observation.shadowObservation.shadowReport, null);
  assert.equal(observation.shadowObservation.runtimeConnectionAuthorized, true);
  assert.equal(observation.shadowObservation.shadowExecutionAuthorized, true);
  assertNoDecisionAuthority(observation.shadowObservation);
});

test('enabled runtime shadow scores a detached PA-7 read-copy while deterministic selection uses the same single-generation handoff lineage', () => {
  const phases = [];
  const runtime = createMusicXmlProcessingRuntime({}, {
    clock(phase) {
      phases.push(phase);
      return 0;
    },
  });
  const source = sourceModel('two-note-interval.musicxml');
  const expected = createBlindBaselineEngineResult(source);
  const observation = createBlindBaselineGuitarSetV2RuntimeShadowObservation(source, {
    enabled: true,
    modelArtifact,
    runtime,
  });

  assert.deepEqual(observation.deterministicResult, expected);
  assert.equal(
    phases.filter((phase) => phase === 'guitar-voicing-candidate-model:start').length,
    1,
  );
  assert.ok(phases.includes('guitarset-v2-runtime-shadow:copy'));
  assert.ok(phases.includes('guitarset-v2-runtime-shadow:score-candidate'));
  assert.equal(observation.samePa7LineageUsedForDeterministicSelectionAndShadow, true);
  assert.equal(observation.deterministicSelectionEffectFromShadowAuthorized, false);
  assert.equal(observation.canonicalResultEffectAuthorized, false);
  assert.equal(observation.tabOutputEffectAuthorized, false);
  assert.equal(observation.productionAuthorized, false);

  const shadow = observation.shadowObservation;
  assert.equal(shadow.status, 'RUNTIME_SHADOW_SCORED_NON_AUTHORITATIVE');
  assert.equal(shadow.defaultEnabled, false);
  assert.equal(shadow.enabled, true);
  assert.equal(shadow.shadowExecutionOccurred, true);
  assert.equal(shadow.candidateReadCopyCreated, true);
  assert.equal(shadow.candidateSourceAuthentic, true);
  assert.equal(shadow.singlePa7GenerationObserved, true);
  assert.equal(shadow.runtimeConnectionAuthorized, true);
  assert.equal(shadow.shadowExecutionAuthorized, true);
  assert.equal(shadow.shadowReport.mode, 'OFFLINE_ADAPTER_PARITY_ONLY');
  assert.equal(shadow.shadowReport.runtimeConnectionAuthorized, false);
  assert.equal(shadow.shadowReport.shadowExecutionAuthorized, false);
  assert.equal(shadow.shadowReport.candidateCount, shadow.candidateCount);
  assert.equal(shadow.shadowReport.groupCount, shadow.groupCount);
  assertNoDecisionAuthority(shadow);
});

test('runtime-budgeted report remains exactly score/rank compatible with the sealed offline v2 adapter', () => {
  const source = sourceModel('three-note-triad.musicxml');
  const execution = createBlindBaselineEngineExecution(source);
  assert.ok(execution.handoff);

  const runtime = createMusicXmlProcessingRuntime({}, {
    clock() {
      return 0;
    },
  });
  const runtimeObservation = observeGuitarSetVoicingModelV2RuntimeShadow(
    execution.handoff,
    modelArtifact,
    { enabled: true, runtime },
  );
  const offlineReport = createGuitarSetVoicingModelV2ShadowReport(
    execution.handoff.voicingCandidateSnapshot,
    modelArtifact,
  );

  assert.equal(runtimeObservation.status, 'RUNTIME_SHADOW_SCORED_NON_AUTHORITATIVE');
  assert.deepEqual(runtimeObservation.shadowReport, offlineReport);
});

test('runtime shadow model/artifact failure preserves completed read-copy state and deterministic result', () => {
  const source = sourceModel('three-note-triad.musicxml');
  const expected = createBlindBaselineEngineResult(source);
  const observation = createBlindBaselineGuitarSetV2RuntimeShadowObservation(source, {
    enabled: true,
    modelArtifact: {},
  });

  assert.deepEqual(observation.deterministicResult, expected);
  assert.equal(observation.shadowObservation.status, 'RUNTIME_SHADOW_FAILURE_ISOLATED');
  assert.equal(observation.shadowObservation.shadowExecutionOccurred, false);
  assert.equal(observation.shadowObservation.candidateReadCopyCreated, true);
  assert.equal(observation.shadowObservation.shadowReport, null);
  assert.equal(
    observation.shadowObservation.isolatedErrorCode,
    'INVALID_GUITARSET_VOICING_MODEL_V2_SHADOW_INPUT',
  );
  assertNoDecisionAuthority(observation.shadowObservation);
});

test('runtime shadow scoring obeys ProcessingRuntime deadline and does not downgrade it to diagnostic failure', () => {
  const source = sourceModel('two-note-interval.musicxml');
  const execution = createBlindBaselineEngineExecution(source);
  assert.ok(execution.handoff);

  const runtime = createMusicXmlProcessingRuntime(
    { maxProcessingMilliseconds: 100 },
    {
      clock(phase) {
        return phase === 'guitarset-v2-runtime-shadow:score-candidate' ? 1000 : 0;
      },
    },
  );

  assert.throws(
    () => observeGuitarSetVoicingModelV2RuntimeShadow(
      execution.handoff,
      modelArtifact,
      { enabled: true, runtime },
    ),
    (error) => error && error.code === PROCESSING_DEADLINE_EXCEEDED,
  );
});

test('singleton deterministic path remains outside PA-7 runtime shadow scoring', () => {
  const source = sourceModel('high-note-octave.musicxml');
  const expected = createBlindBaselineEngineResult(source);
  const observation = createBlindBaselineGuitarSetV2RuntimeShadowObservation(source, {
    enabled: true,
    modelArtifact,
  });

  assert.deepEqual(observation.deterministicResult, expected);
  assert.equal(
    observation.shadowObservation.status,
    'RUNTIME_SHADOW_NOT_APPLICABLE_NO_PA7_MULTI_NOTE_HANDOFF',
  );
  assert.equal(observation.shadowObservation.shadowExecutionOccurred, false);
  assert.equal(observation.samePa7LineageUsedForDeterministicSelectionAndShadow, false);
  assertNoDecisionAuthority(observation.shadowObservation);
});
