'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEACHER_FEEDBACK_CONTRACT_VERSION,
  TeacherFeedbackError,
  createTeacherFeedback,
} = require('../src/fingering/teacherFeedback');

const optimizerCandidate = 'candidate:m1%3Ae0:s2:f1';
const alternateCandidate = 'candidate:m1%3Ae0:s3:f5';

function baseInput(overrides = {}) {
  return {
    eventId: 'm1:e0',
    optimizerSelectedCandidateId: optimizerCandidate,
    decision: 'accept',
    ...overrides,
  };
}

test('records immutable acceptance with version references', () => {
  const feedback = createTeacherFeedback(baseInput({ reason: 'Appropriate for this exercise.' }));

  assert.equal(feedback.documentType, 'TeacherFeedback');
  assert.equal(feedback.contractVersion, TEACHER_FEEDBACK_CONTRACT_VERSION);
  assert.equal(feedback.teacherSelectedCandidateId, optimizerCandidate);
  assert.equal(feedback.decision, 'accept');
  assert.equal(feedback.optimizerObservationVersion, '1.0.0');
  assert.equal(feedback.featureVectorVersion, '1.0.0');
  assert.equal(feedback.guitarConfigurationVersion, '1.0.0');
  assert.equal(Object.isFrozen(feedback), true);
});

test('records a teacher override without changing optimizer output', () => {
  const feedback = createTeacherFeedback(baseInput({
    decision: 'override',
    teacherSelectedCandidateId: alternateCandidate,
  }));

  assert.equal(feedback.optimizerSelectedCandidateId, optimizerCandidate);
  assert.equal(feedback.teacherSelectedCandidateId, alternateCandidate);
});

test('records rejection without inventing a replacement candidate', () => {
  const feedback = createTeacherFeedback(baseInput({ decision: 'reject' }));
  assert.equal(feedback.teacherSelectedCandidateId, null);
});

test('rejects contradictory decisions fail-closed', () => {
  const invalidCases = [
    baseInput({ decision: 'accept', teacherSelectedCandidateId: alternateCandidate }),
    baseInput({ decision: 'override' }),
    baseInput({ decision: 'override', teacherSelectedCandidateId: optimizerCandidate }),
    baseInput({ decision: 'reject', teacherSelectedCandidateId: alternateCandidate }),
    baseInput({ decision: 'unknown' }),
  ];

  for (const input of invalidCases) {
    assert.throws(() => createTeacherFeedback(input), TeacherFeedbackError);
  }
});

test('rejects malformed identities, unbounded reasons and non-plain input', () => {
  assert.throws(() => createTeacherFeedback(baseInput({
    optimizerSelectedCandidateId: 'not-a-candidate',
  })), TeacherFeedbackError);
  assert.throws(() => createTeacherFeedback(baseInput({ reason: 'x'.repeat(1001) })), TeacherFeedbackError);
  assert.throws(() => createTeacherFeedback([]), TeacherFeedbackError);
});
