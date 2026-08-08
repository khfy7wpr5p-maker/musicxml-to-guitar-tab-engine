'use strict';

const { EngineError } = require('../errors/engineError');
const {
  OPTIMIZER_OBSERVATION_VERSION,
  createCandidateId,
  validateOptimizerObservation,
} = require('./optimizerObservation');
const { PEDAGOGICAL_FEATURE_VECTOR_VERSION } = require('./pedagogicalFeatureVector');
const { GUITAR_CONFIGURATION_VERSION } = require('../guitar/tuning');

const TEACHER_FEEDBACK_CONTRACT_VERSION = '1.0.0';
const FEEDBACK_DECISIONS = Object.freeze(['accept', 'override', 'reject']);
const MAX_REASON_LENGTH = 1000;
const MAX_OBSERVATION_ID_LENGTH = 512;
const ALLOWED_INPUT_FIELDS = new Set([
  'observation',
  'observationId',
  'eventId',
  'optimizerSelectedCandidateId',
  'decision',
  'teacherSelectedCandidateId',
  'reason',
]);

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

function assertAllowedInputFields(input) {
  for (const field of Object.keys(input)) {
    if (!ALLOWED_INPUT_FIELDS.has(field)) {
      throw new TeacherFeedbackError('Teacher feedback input contains an unsupported field.', {
        field,
      });
    }
  }
}

function validateCandidateId(candidateId, field, maximumFret) {
  assertNonEmptyString(candidateId, field);
  const match = /^candidate:([^:]+):s([1-6]):f(0|[1-9]\d*)$/.exec(candidateId);
  if (!match) {
    throw new TeacherFeedbackError(`${field} must be a canonical candidate identity.`, { field });
  }

  const encodedEventId = match[1];
  let eventId;
  try {
    eventId = decodeURIComponent(encodedEventId);
  } catch {
    throw new TeacherFeedbackError(`${field} must contain a valid encoded event identity.`, {
      field,
    });
  }
  assertNonEmptyString(eventId, `${field}.eventId`);

  const string = Number(match[2]);
  const fret = Number(match[3]);
  if (!Number.isSafeInteger(fret) || fret < 0 || fret > maximumFret) {
    throw new TeacherFeedbackError(`${field} fret is outside the observed guitar configuration.`, {
      field,
      fret,
      maximumFret,
    });
  }

  const canonicalId = createCandidateId(eventId, { string, fret });
  if (canonicalId !== candidateId) {
    throw new TeacherFeedbackError(`${field} must use canonical candidate encoding.`, { field });
  }

  return { candidateId, eventId, string, fret };
}

function validateObservation(observation, eventId) {
  try {
    validateOptimizerObservation(observation);
  } catch (error) {
    throw new TeacherFeedbackError(
      'observation must be a complete valid OptimizerObservation.',
      { observationErrorCode: error?.code ?? null },
    );
  }

  const matchedDecision = observation.decisions.find((decision) => decision.eventId === eventId);
  if (!matchedDecision) {
    throw new TeacherFeedbackError('eventId must identify a decision in the supplied observation.', {
      eventId,
    });
  }

  return {
    selectedCandidateId: matchedDecision.selectedCandidateId,
    candidateIds: new Set(
      matchedDecision.candidates.map((candidate) => candidate.candidateId),
    ),
    maximumFret: observation.guitarConfiguration.value.maximumFret,
  };
}

function createTeacherFeedback(input) {
  if (!isPlainObject(input)) {
    throw new TeacherFeedbackError('Teacher feedback input must be a plain object.');
  }
  assertAllowedInputFields(input);

  const observationId = assertNonEmptyString(
    input.observationId,
    'observationId',
    MAX_OBSERVATION_ID_LENGTH,
  );
  const eventId = assertNonEmptyString(input.eventId, 'eventId');
  const observedDecision = validateObservation(input.observation, eventId);
  const optimizerSelectedCandidate = validateCandidateId(
    input.optimizerSelectedCandidateId,
    'optimizerSelectedCandidateId',
    observedDecision.maximumFret,
  );
  if (
    optimizerSelectedCandidate.eventId !== eventId
    || optimizerSelectedCandidate.candidateId !== observedDecision.selectedCandidateId
  ) {
    throw new TeacherFeedbackError(
      'optimizerSelectedCandidateId must equal the selected candidate in the supplied observation.',
      { eventId },
    );
  }

  const optimizerSelectedCandidateId = optimizerSelectedCandidate.candidateId;
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
    const teacherSelectedCandidate = validateCandidateId(
      input.teacherSelectedCandidateId,
      'teacherSelectedCandidateId',
      observedDecision.maximumFret,
    );
    if (teacherSelectedCandidate.eventId !== eventId) {
      throw new TeacherFeedbackError(
        'teacherSelectedCandidateId must identify the same event as the feedback record.',
      );
    }
    teacherSelectedCandidateId = teacherSelectedCandidate.candidateId;
    if (!observedDecision.candidateIds.has(teacherSelectedCandidateId)) {
      throw new TeacherFeedbackError(
        'teacherSelectedCandidateId must belong to the exact observed candidate set.',
        { eventId },
      );
    }
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
    observationId,
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
  MAX_OBSERVATION_ID_LENGTH,
  TeacherFeedbackError,
  createTeacherFeedback,
};
