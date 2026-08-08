'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCandidateLayers,
} = require('../src/fingering/candidateLayerBuilder');
const {
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');
const {
  OptimizerObservationError,
  createOptimizerObservation,
  validateOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  TeacherFeedbackError,
  createTeacherFeedback,
} = require('../src/fingering/teacherFeedback');
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

function baseFeedbackInput(observation = fixture.observation) {
  return {
    observation,
    observationId: 'observation:full-validation:1',
    eventId: fixture.decision.eventId,
    optimizerSelectedCandidateId: fixture.decision.selectedCandidateId,
    decision: 'accept',
  };
}

function expectObservationRejection(observation) {
  assert.throws(
    () => validateOptimizerObservation(observation),
    (error) => {
      assert.ok(error instanceof OptimizerObservationError);
      assert.equal(error.code, 'INVALID_OPTIMIZER_OBSERVATION_INPUT');
      return true;
    },
  );
  assert.throws(
    () => createTeacherFeedback(baseFeedbackInput(observation)),
    (error) => {
      assert.ok(error instanceof TeacherFeedbackError);
      assert.equal(error.code, 'INVALID_TEACHER_FEEDBACK');
      assert.match(error.message, /complete valid OptimizerObservation/i);
      return true;
    },
  );
}

test('shared full validator accepts a produced observation without exposing it publicly', () => {
  assert.equal(validateOptimizerObservation(fixture.observation), fixture.observation);

  const packageApi = require('..');
  assert.equal(Object.hasOwn(packageApi, 'validateOptimizerObservation'), false);
});

test('rejects a partial OptimizerObservation lookalike before teacher feedback admission', () => {
  const partialObservation = {
    documentType: fixture.observation.documentType,
    contractVersion: fixture.observation.contractVersion,
    guitarConfiguration: structuredClone(fixture.observation.guitarConfiguration),
    noteCount: fixture.observation.noteCount,
    decisions: structuredClone(fixture.observation.decisions),
  };

  expectObservationRejection(partialObservation);
});

test('rejects forged full-observation invariants fail-closed', async (t) => {
  const cases = [
    ['optimizer metadata', (observation) => {
      observation.optimizer.version = 'forged-version';
    }],
    ['candidate contract version', (observation) => {
      observation.candidateContractVersion = 'forged-version';
    }],
    ['selected position', (observation) => {
      delete observation.decisions[0].selectedPosition;
    }],
    ['candidate position identity', (observation) => {
      const candidate = observation.decisions[0].candidates[0];
      candidate.position.string = candidate.position.string === 1 ? 2 : 1;
    }],
    ['candidate index', (observation) => {
      observation.decisions[0].candidates[0].candidateIndex = 99;
    }],
    ['selected cost shape', (observation) => {
      delete observation.decisions[0].cost.isPlayable;
    }],
    ['aggregate total', (observation) => {
      observation.totalCost += 1;
    }],
    ['guitar configuration shape', (observation) => {
      observation.guitarConfiguration.value.tuning.pop();
    }],
    ['guitar pitch and MIDI disagreement', (observation) => {
      const entry = observation.guitarConfiguration.value.tuning[0];
      entry.pitch = entry.pitch === 'E4' ? 'F4' : 'E4';
    }],
    ['non-canonical guitar string order', (observation) => {
      const tuning = observation.guitarConfiguration.value.tuning;
      [tuning[0], tuning[1]] = [tuning[1], tuning[0]];
    }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const forged = structuredClone(fixture.observation);
      mutate(forged);
      expectObservationRejection(forged);
    });
  }
});
