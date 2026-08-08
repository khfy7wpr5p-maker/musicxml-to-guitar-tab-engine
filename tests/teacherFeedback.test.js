'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEACHER_FEEDBACK_CONTRACT_VERSION,
  MAX_OBSERVATION_ID_LENGTH,
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
  createCandidateId,
  createOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  createOptimizerObservationDigest,
} = require('../src/fingering/optimizerObservationDigest');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function buildFeedbackFixture() {
  const canonical = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
  const candidateSet = buildCandidateLayers(canonical);
  const optimized = optimizeFingering(candidateSet.candidateLayers);
  const observation = createOptimizerObservation(candidateSet, optimized);
  const observedDecision = observation.decisions.find((item) => item.candidates.length > 1);
  assert.ok(observedDecision, 'fixture must contain a decision with an alternate candidate');
  const alternateCandidate = observedDecision.candidates.find(
    (candidate) => candidate.candidateId !== observedDecision.selectedCandidateId,
  );
  assert.ok(alternateCandidate, 'fixture must contain an alternate candidate');
  const otherDecision = observation.decisions.find(
    (item) => item.eventId !== observedDecision.eventId,
  );
  assert.ok(otherDecision, 'fixture must contain another observed event');

  return {
    observation,
    observedDecision,
    alternateCandidateId: alternateCandidate.candidateId,
    otherDecision,
  };
}

const fixture = buildFeedbackFixture();
const fixtureDigest = createOptimizerObservationDigest(fixture.observation);

function baseInput(overrides = {}) {
  return {
    observation: fixture.observation,
    observationId: 'observation:test-score:1',
    observationDigest: fixtureDigest,
    eventId: fixture.observedDecision.eventId,
    optimizerSelectedCandidateId: fixture.observedDecision.selectedCandidateId,
    decision: 'accept',
    ...overrides,
  };
}

function findUnobservedCandidateId() {
  const candidateIds = new Set(
    fixture.observedDecision.candidates.map((candidate) => candidate.candidateId),
  );
  const maximumFret = fixture.observation.guitarConfiguration.value.maximumFret;
  for (let string = 1; string <= 6; string += 1) {
    for (let fret = 0; fret <= maximumFret; fret += 1) {
      const candidateId = createCandidateId(fixture.observedDecision.eventId, { string, fret });
      if (!candidateIds.has(candidateId)) {
        return candidateId;
      }
    }
  }
  throw new Error('fixture must have at least one non-member canonical candidate identity');
}

test('records immutable acceptance bound to an observation identity and content digest', () => {
  const feedback = createTeacherFeedback(baseInput({ reason: 'Appropriate for this exercise.' }));

  assert.equal(feedback.documentType, 'TeacherFeedback');
  assert.equal(feedback.contractVersion, TEACHER_FEEDBACK_CONTRACT_VERSION);
  assert.equal(feedback.observationId, 'observation:test-score:1');
  assert.deepEqual(feedback.observationDigest, fixtureDigest);
  assert.equal(Object.isFrozen(feedback.observationDigest), true);
  assert.equal(feedback.teacherSelectedCandidateId, fixture.observedDecision.selectedCandidateId);
  assert.equal(feedback.decision, 'accept');
  assert.equal(feedback.optimizerObservationVersion, '1.0.0');
  assert.equal(feedback.featureVectorVersion, '1.0.0');
  assert.equal(feedback.guitarConfigurationVersion, '1.0.0');
  assert.equal(Object.isFrozen(feedback), true);
  assert.equal(Object.hasOwn(feedback, 'observation'), false);
});

test('records an override only when the candidate belongs to the exact observed event layer', () => {
  const feedback = createTeacherFeedback(baseInput({
    decision: 'override',
    teacherSelectedCandidateId: fixture.alternateCandidateId,
  }));

  assert.equal(feedback.optimizerSelectedCandidateId, fixture.observedDecision.selectedCandidateId);
  assert.equal(feedback.teacherSelectedCandidateId, fixture.alternateCandidateId);
});

test('records rejection without inventing a replacement candidate', () => {
  const feedback = createTeacherFeedback(baseInput({ decision: 'reject' }));
  assert.equal(feedback.teacherSelectedCandidateId, null);
});

test('rejects contradictory decisions fail-closed', () => {
  const invalidCases = [
    baseInput({ decision: 'accept', teacherSelectedCandidateId: fixture.alternateCandidateId }),
    baseInput({ decision: 'override' }),
    baseInput({
      decision: 'override',
      teacherSelectedCandidateId: fixture.observedDecision.selectedCandidateId,
    }),
    baseInput({ decision: 'reject', teacherSelectedCandidateId: fixture.alternateCandidateId }),
    baseInput({ decision: 'unknown' }),
  ];

  for (const input of invalidCases) {
    assert.throws(() => createTeacherFeedback(input), TeacherFeedbackError);
  }
});

test('rejects malformed or out-of-range canonical candidate identities', () => {
  const maximumFret = fixture.observation.guitarConfiguration.value.maximumFret;
  const encodedEventId = encodeURIComponent(fixture.observedDecision.eventId);
  const invalidCases = [
    'candidate:',
    `candidate:${encodedEventId}:s9:f-1`,
    `candidate:${encodedEventId}:s1:f${maximumFret + 1}`,
  ];

  for (const optimizerSelectedCandidateId of invalidCases) {
    assert.throws(
      () => createTeacherFeedback(baseInput({ optimizerSelectedCandidateId })),
      TeacherFeedbackError,
    );
  }
});

test('rejects optimizer selection that is not the selected candidate in the supplied observation', () => {
  assert.throws(
    () => createTeacherFeedback(baseInput({
      optimizerSelectedCandidateId: fixture.alternateCandidateId,
    })),
    (error) => {
      assert.ok(error instanceof TeacherFeedbackError);
      assert.match(error.message, /selected candidate in the supplied observation/i);
      return true;
    },
  );
});

test('rejects override candidates outside the exact observed candidate set', () => {
  const unobservedCandidateId = findUnobservedCandidateId();
  assert.throws(
    () => createTeacherFeedback(baseInput({
      decision: 'override',
      teacherSelectedCandidateId: unobservedCandidateId,
    })),
    (error) => {
      assert.ok(error instanceof TeacherFeedbackError);
      assert.match(error.message, /exact observed candidate set/i);
      return true;
    },
  );
});

test('rejects a valid candidate identity from a different observed event', () => {
  assert.throws(
    () => createTeacherFeedback(baseInput({
      decision: 'override',
      teacherSelectedCandidateId: fixture.otherDecision.selectedCandidateId,
    })),
    (error) => {
      assert.ok(error instanceof TeacherFeedbackError);
      assert.match(error.message, /same event/i);
      return true;
    },
  );
});

test('requires a bounded opaque observation identity', () => {
  assert.throws(
    () => createTeacherFeedback(baseInput({ observationId: '' })),
    TeacherFeedbackError,
  );
  assert.throws(
    () => createTeacherFeedback(baseInput({
      observationId: 'x'.repeat(MAX_OBSERVATION_ID_LENGTH + 1),
    })),
    TeacherFeedbackError,
  );
});

test('rejects missing or mismatched observation binding', () => {
  assert.throws(
    () => createTeacherFeedback(baseInput({ observation: null })),
    TeacherFeedbackError,
  );
  assert.throws(
    () => createTeacherFeedback(baseInput({ eventId: 'missing-event' })),
    TeacherFeedbackError,
  );
});

test('keeps consent and privacy metadata outside the TeacherFeedback contract', () => {
  assert.throws(
    () => createTeacherFeedback(baseInput({ researchConsent: true })),
    (error) => {
      assert.ok(error instanceof TeacherFeedbackError);
      assert.match(error.message, /unsupported field/i);
      return true;
    },
  );
  assert.throws(
    () => createTeacherFeedback(baseInput({ studentId: 'student-123' })),
    TeacherFeedbackError,
  );
});

test('rejects unbounded reasons and non-plain input', () => {
  assert.throws(
    () => createTeacherFeedback(baseInput({ reason: 'x'.repeat(1001) })),
    TeacherFeedbackError,
  );
  assert.throws(() => createTeacherFeedback([]), TeacherFeedbackError);
});
