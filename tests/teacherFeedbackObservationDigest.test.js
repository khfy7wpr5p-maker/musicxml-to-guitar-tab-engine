'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OptimizerObservationError,
  createOptimizerObservation,
  validateOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  OPTIMIZER_OBSERVATION_DIGEST_VERSION,
  OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM,
  createOptimizerObservationDigest,
  verifyOptimizerObservationDigest,
} = require('../src/fingering/optimizerObservationDigest');
const {
  TEACHER_FEEDBACK_CONTRACT_VERSION,
  TeacherFeedbackError,
  createTeacherFeedback,
} = require('../src/fingering/teacherFeedback');
const {
  buildCandidateLayers,
} = require('../src/fingering/candidateLayerBuilder');
const {
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function buildFixture() {
  const canonical = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const candidateSet = buildCandidateLayers(canonical);
  const optimized = optimizeFingering(candidateSet.candidateLayers);
  const observation = createOptimizerObservation(candidateSet, optimized);
  const decision = observation.decisions.find((item) => item.candidates.length > 1)
    ?? observation.decisions[0];
  assert.ok(decision, 'fixture must contain at least one observed decision');
  return { observation, decision };
}

const fixture = buildFixture();
const fixtureDigest = createOptimizerObservationDigest(fixture.observation);

function baseInput(overrides = {}) {
  return {
    observation: fixture.observation,
    observationId: 'observation:digest-binding:1',
    observationDigest: fixtureDigest,
    eventId: fixture.decision.eventId,
    optimizerSelectedCandidateId: fixture.decision.selectedCandidateId,
    decision: 'accept',
    ...overrides,
  };
}

test('creates a stable versioned SHA-256 digest for a validated observation', () => {
  assert.equal(fixtureDigest.contractVersion, OPTIMIZER_OBSERVATION_DIGEST_VERSION);
  assert.equal(fixtureDigest.algorithm, OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM);
  assert.match(fixtureDigest.value, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(fixtureDigest), true);

  const reordered = Object.fromEntries(
    Object.entries(fixture.observation).reverse(),
  );
  assert.deepEqual(createOptimizerObservationDigest(reordered), fixtureDigest);
});

test('TeacherFeedback 1.1.0 requires and records the verified observation digest', () => {
  const feedback = createTeacherFeedback(baseInput());

  assert.equal(TEACHER_FEEDBACK_CONTRACT_VERSION, '1.1.0');
  assert.deepEqual(feedback.observationDigest, fixtureDigest);
  assert.notEqual(feedback.observationDigest, fixtureDigest);
  assert.equal(Object.isFrozen(feedback.observationDigest), true);
});

test('rejects missing, malformed, or mismatched observation digests fail-closed', () => {
  const missing = baseInput();
  delete missing.observationDigest;
  assert.throws(() => createTeacherFeedback(missing), TeacherFeedbackError);

  assert.throws(
    () => createTeacherFeedback(baseInput({
      observationDigest: {
        contractVersion: OPTIMIZER_OBSERVATION_DIGEST_VERSION,
        algorithm: OPTIMIZER_OBSERVATION_DIGEST_ALGORITHM,
        value: 'not-a-digest',
      },
    })),
    TeacherFeedbackError,
  );

  assert.throws(
    () => createTeacherFeedback(baseInput({
      observationDigest: {
        ...fixtureDigest,
        value: '0'.repeat(64),
      },
    })),
    (error) => {
      assert.ok(error instanceof TeacherFeedbackError);
      assert.match(error.message, /digest.*match|match.*digest/i);
      return true;
    },
  );
});

test('detects valid observation-content tampering that remains shape-valid', () => {
  const tampered = structuredClone(fixture.observation);
  tampered.partId = `${tampered.partId}:tampered`;
  tampered.decisions[0].measureKey = `${tampered.decisions[0].measureKey}:tampered`;

  assert.doesNotThrow(() => validateOptimizerObservation(tampered));
  assert.notDeepEqual(createOptimizerObservationDigest(tampered), fixtureDigest);
  assert.throws(
    () => verifyOptimizerObservationDigest(tampered, fixtureDigest),
    OptimizerObservationError,
  );
  assert.throws(
    () => createTeacherFeedback(baseInput({ observation: tampered })),
    (error) => {
      assert.ok(error instanceof TeacherFeedbackError);
      assert.match(error.message, /digest/i);
      return true;
    },
  );
});

test('digest includes accepted copied optimizer metadata', () => {
  const augmented = structuredClone(fixture.observation);
  augmented.decisions[0].cost.breakdown.observationNote = 'digest-covered';

  assert.doesNotThrow(() => validateOptimizerObservation(augmented));
  assert.notDeepEqual(createOptimizerObservationDigest(augmented), fixtureDigest);
});

test('rejects non-enumerable or symbol observation content instead of omitting it from the digest', () => {
  const hidden = structuredClone(fixture.observation);
  Object.defineProperty(hidden, 'hiddenProvenance', {
    value: 'must-not-be-digest-invisible',
    enumerable: false,
  });
  assert.doesNotThrow(() => validateOptimizerObservation(hidden));
  assert.throws(
    () => createOptimizerObservationDigest(hidden),
    OptimizerObservationError,
  );

  const symbolContent = structuredClone(fixture.observation);
  symbolContent[Symbol('hidden-provenance')] = 'must-not-be-digest-invisible';
  assert.doesNotThrow(() => validateOptimizerObservation(symbolContent));
  assert.throws(
    () => createOptimizerObservationDigest(symbolContent),
    OptimizerObservationError,
  );
});

test('observation digest helpers remain internal package details', () => {
  const packageApi = require('..');
  assert.equal(Object.hasOwn(packageApi, 'createOptimizerObservationDigest'), false);
  assert.equal(Object.hasOwn(packageApi, 'verifyOptimizerObservationDigest'), false);
});
