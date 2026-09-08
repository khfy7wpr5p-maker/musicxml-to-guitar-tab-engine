'use strict';

const {
  MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION,
  REVIEW_REQUIRED_CAPABILITY_CONTRACT_VERSION,
} = require('./reviewRequiredCapabilityContract');

const REVIEW_EDITOR_CAPABILITY_STATE_CONTRACT_VERSION = '1.0.0';
const REVIEW_EDITOR_CAPABILITY_STATE_DOCUMENT_TYPE = 'ReviewEditorCapabilityScoreState';
const MAX_ISSUES = 512;
const MAX_TEXT = 4096;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedText(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT || value !== value.trim()) {
    throw new TypeError(`${field} must be a bounded non-empty string.`);
  }
  return value;
}

function stableIssueId(issue, index) {
  const value = issue?.issueId ?? issue?.reviewEvidence?.issue_id ?? null;
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 160
    || value !== value.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)
  ) {
    throw new TypeError(`issues[${index}] requires a bounded stable issue id.`);
  }
  return value;
}

function normalizedLocation(issue) {
  const source = isPlainObject(issue?.location) ? issue.location : {};
  const measure = source.measure ?? null;
  const measureIndex = Number.isInteger(source.measureIndex) && source.measureIndex >= 0
    ? source.measureIndex
    : null;
  const eventIndex = Number.isInteger(source.eventIndex) && source.eventIndex >= 0
    ? source.eventIndex
    : null;
  const sourceEventId = typeof source.sourceEventId === 'string' && source.sourceEventId.length > 0
    ? source.sourceEventId
    : null;
  return Object.freeze({ measure, measureIndex, eventIndex, sourceEventId });
}

function eventLocation(issue, location) {
  const evidence = isPlainObject(issue?.reviewEvidence) ? issue.reviewEvidence : {};
  if (evidence.event_id_or_location !== undefined && evidence.event_id_or_location !== null) {
    return evidence.event_id_or_location;
  }
  if (location.sourceEventId) return location.sourceEventId;
  if (location.measureIndex !== null || location.eventIndex !== null) {
    return Object.freeze({
      measureIndex: location.measureIndex,
      eventIndex: location.eventIndex,
    });
  }
  return null;
}

function editorIssue(issue, index) {
  if (!isPlainObject(issue)) throw new TypeError(`issues[${index}] must be a plain object.`);
  if (issue.teacherActionRequired !== true) return null;
  if (!Array.isArray(issue.allowedActions) || !issue.allowedActions.includes('EDIT_MANUALLY')) {
    throw new TypeError(`issues[${index}] must explicitly allow EDIT_MANUALLY.`);
  }

  const issueId = stableIssueId(issue, index);
  const code = boundedText(issue.code, `issues[${index}].code`);
  const location = normalizedLocation(issue);
  const evidence = isPlainObject(issue.reviewEvidence) ? issue.reviewEvidence : {};
  const suggested = typeof evidence.suggested_review_action === 'string' && evidence.suggested_review_action.length > 0
    ? boundedText(evidence.suggested_review_action, `issues[${index}].suggested_review_action`)
    : 'Inspect and correct the localized score evidence manually.';

  if (location.measure === null && location.measureIndex === null && location.sourceEventId === null) {
    throw new TypeError(`issues[${index}] requires a stable review location.`);
  }

  return Object.freeze({
    severity: issue.severity ?? 'error',
    category: issue.category ?? 'semantic',
    code,
    message: typeof issue.message === 'string' && issue.message.length > 0 ? issue.message : suggested,
    reviewDisposition: 'REVIEW_REQUIRED',
    location,
    reviewEvidence: Object.freeze({
      issue_id: issueId,
      code,
      measure: location.measure,
      staff: evidence.staff ?? null,
      voice: evidence.voice ?? null,
      event_id_or_location: eventLocation(issue, location),
      suggested_review_action: suggested,
    }),
  });
}

function assertCapabilityUploadResult(result) {
  if (!isPlainObject(result)) throw new TypeError('uploadResult must be a plain object.');
  if (result.status !== 'REVIEW_REQUIRED') {
    throw new TypeError('Capability editor state requires REVIEW_REQUIRED upload status.');
  }
  if (result.resultSchemaVersion !== MUSICXML_UPLOAD_RESULT_SCHEMA_VERSION) {
    throw new TypeError('Capability editor state requires the current additive upload-result schema.');
  }
  if (result.capabilityContractVersion !== REVIEW_REQUIRED_CAPABILITY_CONTRACT_VERSION) {
    throw new TypeError('Capability editor state requires the current review capability contract.');
  }
  if (result.capabilities?.renderScore !== true || result.scoreAvailable !== true) {
    throw new TypeError('Capability editor state requires backend-authorized score rendering.');
  }
  if (typeof result.musicXml !== 'string' || result.musicXml.length === 0) {
    throw new TypeError('Capability editor state requires renderer MusicXML evidence.');
  }
  if (!Array.isArray(result.issues) || result.issues.length === 0 || result.issues.length > MAX_ISSUES) {
    throw new TypeError('Capability editor state requires a bounded non-empty issue list.');
  }
}

function buildReviewEditorCapabilityState(uploadResult) {
  assertCapabilityUploadResult(uploadResult);
  const issues = uploadResult.issues
    .map(editorIssue)
    .filter((issue) => issue !== null);
  if (issues.length === 0) {
    throw new TypeError('Capability editor state requires at least one manual teacher-review issue.');
  }

  return Object.freeze({
    documentType: REVIEW_EDITOR_CAPABILITY_STATE_DOCUMENT_TYPE,
    contractVersion: REVIEW_EDITOR_CAPABILITY_STATE_CONTRACT_VERSION,
    status: 'REVIEW_REQUIRED',
    route: boundedText(uploadResult.route, 'route'),
    canProcess: false,
    canOpenForReview: true,
    sourceReviewAvailability: 'AVAILABLE',
    issues: Object.freeze(issues),
    sourceIdentity: Object.freeze({
      sha256: typeof uploadResult.input?.sha256 === 'string' ? uploadResult.input.sha256 : null,
      fileName: typeof uploadResult.input?.fileName === 'string' ? uploadResult.input.fileName : null,
      byteLength: Number.isSafeInteger(uploadResult.input?.byteLength) ? uploadResult.input.byteLength : null,
    }),
  });
}

module.exports = {
  REVIEW_EDITOR_CAPABILITY_STATE_CONTRACT_VERSION,
  REVIEW_EDITOR_CAPABILITY_STATE_DOCUMENT_TYPE,
  buildReviewEditorCapabilityState,
};
