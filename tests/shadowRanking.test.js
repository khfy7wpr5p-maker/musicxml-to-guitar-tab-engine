'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildCandidateLayers,
} = require('../src/fingering/candidateLayerBuilder');
const {
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');
const {
  createOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');
const {
  SHADOW_RANKING_CONTRACT_VERSION,
  SHADOW_RANKING_MODEL_CONTRACT_VERSION,
  ShadowRankingError,
  computeShadowRankingModelSha256,
  createShadowRankingReport,
  validateShadowRankingModel,
} = require('../src/learning/shadowRanking');

const packageRoot = require('../src');

const REPOSITORY_ROOT = path.join(__dirname, '..');
const REFERENCE_MODEL_PATH = path.join(
  REPOSITORY_ROOT,
  'models',
  'shadow-ranking',
  'synthetic-reference-v1.json',
);

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function buildObservationFromSource(source) {
  const canonical = parseCanonicalMusicDocument(source);
  const candidates = buildCandidateLayers(canonical);
  const optimized = optimizeFingering(candidates.candidateLayers);
  return createOptimizerObservation(candidates, optimized);
}

function buildObservedFixture() {
  return buildObservationFromSource(readFixture('parser-single-voice.musicxml'));
}

function loadReferenceModel() {
  return JSON.parse(fs.readFileSync(REFERENCE_MODEL_PATH, 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function bindModel(model) {
  model.modelSha256 = computeShadowRankingModelSha256(model);
  return model;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, 'value')) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(value);
}

function expectShadowError(fn, field = undefined) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ShadowRankingError);
    assert.equal(error.code, 'INVALID_SHADOW_RANKING_INPUT');
    if (field !== undefined) {
      assert.equal(error.details.field, field);
    }
    return true;
  });
}

const SINGLE_E4 = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

test('defines versioned internal shadow contracts and verifies the synthetic reference model digest', () => {
  const model = loadReferenceModel();
  const normalized = validateShadowRankingModel(model);

  assert.equal(SHADOW_RANKING_CONTRACT_VERSION, '1.0.0');
  assert.equal(SHADOW_RANKING_MODEL_CONTRACT_VERSION, '1.0.0');
  assert.equal(normalized.documentType, 'ShadowRankingModel');
  assert.equal(normalized.contractVersion, '1.0.0');
  assert.equal(normalized.modelId, 'synthetic-reference-movement-v1');
  assert.equal(normalized.modelVersion, '1.0.0');
  assert.equal(normalized.modelKind, 'synthetic-reference-linear');
  assert.equal(normalized.featureContractVersion, '1.0.0');
  assert.equal(normalized.scoreDirection, 'lower-is-better');
  assert.equal(computeShadowRankingModelSha256(model), model.modelSha256);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.featureWeights));
});

test('produces a deterministic frozen shadow-only report without changing optimizer authority', () => {
  const observation = buildObservedFixture();
  const model = loadReferenceModel();
  const beforeObservation = structuredClone(observation);
  const beforeModel = clone(model);

  const first = createShadowRankingReport({ observation, model });
  const second = createShadowRankingReport({ observation, model });

  assert.deepEqual(first, second);
  assert.deepEqual(observation, beforeObservation);
  assert.deepEqual(model, beforeModel);
  assert.equal(first.documentType, 'ShadowRankingReport');
  assert.equal(first.contractVersion, '1.0.0');
  assert.equal(first.mode, 'shadow');
  assert.equal(first.authority, 'none');
  assert.equal(first.model.modelId, model.modelId);
  assert.equal(first.model.modelSha256, model.modelSha256);
  assert.equal(first.observation.contractVersion, observation.contractVersion);
  assert.match(first.observation.digest.value, /^[0-9a-f]{64}$/);

  assert.deepEqual(
    first.baseline.candidateIds,
    observation.decisions.map((decision) => decision.selectedCandidateId),
  );
  assert.equal(first.shadow.decisions.length, observation.noteCount);
  for (let index = 0; index < first.shadow.decisions.length; index += 1) {
    const decision = first.shadow.decisions[index];
    const observed = observation.decisions[index];
    assert.equal(decision.eventId, observed.eventId);
    assert.ok(observed.candidates.some((candidate) => candidate.candidateId === decision.candidateId));
    assert.ok(Number.isFinite(decision.localScore));
    assert.ok(Number.isFinite(decision.cumulativeScore));
    assert.equal(decision.features.contractVersion, '1.0.0');
  }

  assert.equal(first.comparison.samePath, true);
  assert.equal(first.comparison.divergentDecisionCount, 0);
  assert.deepEqual(first.comparison.divergentDecisionIndexes, []);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.shadow));
  assert.ok(Object.isFrozen(first.shadow.decisions));
  assert.ok(Object.isFrozen(first.shadow.decisions[0]));
});

test('shadow suggestion may disagree with the deterministic baseline but cannot replace it', () => {
  const observation = buildObservationFromSource(SINGLE_E4);
  const model = loadReferenceModel();
  model.featureWeights.openStringUsage = 100;
  bindModel(model);

  const report = createShadowRankingReport({ observation, model });

  assert.deepEqual(observation.decisions[0].selectedPosition, { string: 1, fret: 0 });
  assert.deepEqual(report.baseline.positions[0], { string: 1, fret: 0 });
  assert.deepEqual(report.shadow.positions[0], { string: 2, fret: 5 });
  assert.equal(report.comparison.samePath, false);
  assert.equal(report.comparison.divergentDecisionCount, 1);
  assert.deepEqual(report.comparison.divergentDecisionIndexes, [0]);
  assert.equal(report.mode, 'shadow');
  assert.equal(report.authority, 'none');
});

test('fails closed on stale model digest, non-finite or excessive weights, and executable extension fields', () => {
  const observation = buildObservedFixture();

  const stale = loadReferenceModel();
  stale.featureWeights.fretMovement = 2;
  expectShadowError(
    () => createShadowRankingReport({ observation, model: stale }),
    'model.modelSha256',
  );

  for (const invalidWeight of [Number.NaN, Number.POSITIVE_INFINITY, -1001, 1001]) {
    const model = loadReferenceModel();
    model.featureWeights.fretMovement = invalidWeight;
    expectShadowError(
      () => createShadowRankingReport({ observation, model }),
      'model.featureWeights.fretMovement',
    );
  }

  const executable = loadReferenceModel();
  executable.scoreCandidate = () => 0;
  expectShadowError(
    () => createShadowRankingReport({ observation, model: executable }),
    'model.scoreCandidate',
  );
});

test('rejects proxy, accessor, and custom-array hostile inputs without invoking attacker hooks', () => {
  const observation = buildObservedFixture();
  const model = loadReferenceModel();
  let inputTrapCalled = false;
  const hostileInput = new Proxy({ observation, model }, {
    ownKeys() {
      inputTrapCalled = true;
      throw new Error('input trap should never run');
    },
  });
  expectShadowError(() => createShadowRankingReport(hostileInput), 'input');
  assert.equal(inputTrapCalled, false);

  let modelGetterCalled = false;
  const accessorModel = loadReferenceModel();
  Object.defineProperty(accessorModel, 'modelId', {
    enumerable: true,
    get() {
      modelGetterCalled = true;
      throw new Error('model getter should never run');
    },
  });
  expectShadowError(
    () => createShadowRankingReport({ observation, model: accessorModel }),
    'model.modelId',
  );
  assert.equal(modelGetterCalled, false);

  let arrayMethodCalled = false;
  class HostileDecisions extends Array {
    map() {
      arrayMethodCalled = true;
      throw new Error('array override should never run');
    }
  }
  const hostileObservation = clone(observation);
  hostileObservation.decisions = new HostileDecisions(...hostileObservation.decisions);
  deepFreeze(hostileObservation);
  expectShadowError(
    () => createShadowRankingReport({ observation: hostileObservation, model }),
    'observation.decisions',
  );
  assert.equal(arrayMethodCalled, false);
});

test('keeps shadow ranking internal and free of filesystem, network, process, and callback authority', () => {
  assert.equal(packageRoot.SHADOW_RANKING_CONTRACT_VERSION, undefined);
  assert.equal(packageRoot.SHADOW_RANKING_MODEL_CONTRACT_VERSION, undefined);
  assert.equal(packageRoot.ShadowRankingError, undefined);
  assert.equal(packageRoot.computeShadowRankingModelSha256, undefined);
  assert.equal(packageRoot.validateShadowRankingModel, undefined);
  assert.equal(packageRoot.createShadowRankingReport, undefined);

  const source = fs.readFileSync(
    path.join(REPOSITORY_ROOT, 'src', 'learning', 'shadowRanking.js'),
    'utf8',
  );
  for (const forbidden of [
    'node:fs',
    'node:http',
    'node:https',
    'node:net',
    'node:child_process',
    'child_process',
    'fetch(',
    'eval(',
    'new Function',
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden authority token: ${forbidden}`);
  }
});
