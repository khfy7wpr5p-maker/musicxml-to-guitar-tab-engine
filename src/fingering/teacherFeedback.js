'use strict';

const { EngineError } = require('../errors/engineError');
const { OPTIMIZER_OBSERVATION_VERSION } = require('./optimizerObservation');
const { PEDAGOGICAL_FEATURE_VECTOR_VERSION } = require('./pedagogicalFeatureVector');
const { GUITAR_CONFIGURATION_VERSION } = require('../guitar/tuning');

const TEACHER_FEEDBACK_CONTRACT_VERSION = '1.0.0';
const FEEDBACK_DECISIONS = Object.freeze(['accept', 'override', 'reject']);
const MAX_REASON_LENGTH = 1000;

class TeacherFeedbackError extends EngineError {
  constructor(message, details = {}) {
    super(message, 'INVALID_TEACHER_FEEDBACK', details, 'TeacherFeedbackError');
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNonEmptyString(value, field, maximumLength = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new TeacherFeedbackError(`${field} must be a non-empty bounded string.`, { field });
  }
  return value;
}

function validateCandidateId(candidateId, field) {
  assertNonEmptyString(candidateId, field);
  if (!candidateId.startsWith('candidate:')) {
    throw new TeacherFeedbackError(`${field} must be a canonical candidate identity.`, { field });
  }
  return candidateId;
}

function createTeacherFeedback(input) {
  if (!isPlainObject(input)) {
    throw new TeacherFeedbackError('Teacher feedback input must be a plain object.');
  }

  const eventId = assertNonEmptyString(input.eventId, 'eventId');
  const optimizerSelectedCandidateId = validateCandidateId(
    input.optimizerSelectedCandidateId,
    'optimizerSelectedCandidateId',
  );
  const decision = input.decision;
  if (!FEEDBACK_DECISIONS.includes(decision)) {
    throw new TeacherFeedbackError('decision must be accept, override, or reject.', { decision });
  }

  let teacherSelectedCandidateId = null;
  if (decision === 'accept') {
    if (
      input.teacherSelectedCandidateId !== undefined
      && input.teacherSelectedCandidateId !== optimizerSelectedCandidateId
    ) {
      throw new TeacherFeedbackError(
        'accept cannot select a candidate different from the optimizer selection.',
      );
    }
    teacherSelectedCandidateId = optimizerSelectedCandidateId;
  } else if (decision === 'override') {
    teacherSelectedCandidateId = validateCandidateId(
      input.teacherSelectedCandidateId,
      'teacherSelectedCandidateId',
    );
    if (teacherSelectedCandidateId === optimizerSelectedCandidateId) {
      throw new TeacherFeedbackError('override must select a different candidate.');
    }
  } else if (input.teacherSelectedCandidateId !== undefined && input.teacherSelectedCandidateId !== null) {
    throw new TeacherFeedbackError('reject must not select a replacement candidate.');
  }

  let reason = null;
  if (input.reason !== undefined && input.reason !== null) {
    if (typeof input.reason !== 'string' || input.reason.length === 0 || input.reason.length > MAX_REASON_LENGTH) {
      throw new TeacherFeedbackError('reason must be a non-empty bounded string when supplied.');
    }
    reason = input.reason;
  }

  return Object.freeze({
    documentType: 'TeacherFeedback',
    contractVersion: TEACHER_FEEDBACK_CONTRACT_VERSION,
    eventId,
    optimizerSelectedCandidateId,
    decision,
    teacherSelectedCandidateId,
    reason,
    optimizerObservationVersion: OPTIMIZER_OBSERVATION_VERSION,
    featureVectorVersion: PEDAGOGICAL_FEATURE_VECTOR_VERSION,
    guitarConfigurationVersion: GUITAR_CONFIGURATION_VERSION,
  });
}

module.exports = {
  TEACHER_FEEDBACK_CONTRACT_VERSION,
  FEEDBACK_DECISIONS,
  MAX_REASON_LENGTH,
  TeacherFeedbackError,
  createTeacherFeedback,
};
