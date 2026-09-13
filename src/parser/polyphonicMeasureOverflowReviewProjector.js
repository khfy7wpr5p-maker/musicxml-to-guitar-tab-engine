'use strict';

const {
  PolyphonicMusicXmlProjectorError,
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_MEASURE_OVERFLOW_REVIEW_VERSION = '1.0.0';
const POLYPHONIC_MEASURE_OVERFLOW_REVIEW_AUTHORITY =
  'PROVISIONAL_DURATION_CLAMP_WITH_IMMUTABLE_SOURCE';
const MAX_MEASURE_OVERFLOW_REPAIRS = 256;

function cloneNode(node, childMapper = null, overrides = {}) {
  const children = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const mapped = childMapper ? childMapper(child, index) : cloneNode(child);
    if (mapped !== null) children.push(mapped);
  }
  return {
    name: overrides.name ?? node.name,
    uri: overrides.uri ?? node.uri,
    attributes: overrides.attributes
      ?? node.attributes.map((attribute) => ({ ...attribute })),
    text: overrides.text ?? node.text,
    children,
  };
}

function deepFreezeNode(node) {
  for (const attribute of node.attributes) Object.freeze(attribute);
  Object.freeze(node.attributes);
  for (const child of node.children) deepFreezeNode(child);
  Object.freeze(node.children);
  return Object.freeze(node);
}

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function exactOverflow(error) {
  return error instanceof PolyphonicMusicXmlProjectorError
    && error.code === 'INVALID_MUSICXML'
    && error.details?.reason === 'MEASURE_EVENT_OVERFLOW'
    && Number.isInteger(error.details?.measureIndex)
    && Number.isInteger(error.details?.sourceOrder)
    && Number.isInteger(error.details?.onsetDivisions)
    && Number.isInteger(error.details?.durationDivisions)
    && Number.isInteger(error.details?.expectedDurationDivisions);
}

function exactCursorOverflow(error) {
  return error instanceof PolyphonicMusicXmlProjectorError
    && error.code === 'INVALID_MUSICXML'
    && Number.isInteger(error.details?.measureIndex)
    && Number.isInteger(error.details?.measureChildIndex)
    && Number.isInteger(error.details?.cursor)
    && Number.isInteger(error.details?.duration)
    && error.details.duration > 0
    && (
      error.message === 'backup moves the cursor before the start of the measure.'
      || (
        error.message === 'forward moves the cursor beyond the declared measure duration.'
        && Number.isInteger(error.details?.expectedDurationDivisions)
      )
    );
}

function clampOverflowDuration(parsedDocument, details) {
  const availableDuration = details.expectedDurationDivisions - details.onsetDivisions;
  if (!Number.isSafeInteger(availableDuration) || availableDuration <= 0) return null;

  const parts = directChildren(parsedDocument.root, 'part');
  const measures = parts.length === 1 ? directChildren(parts[0], 'measure') : [];
  const measure = measures[details.measureIndex];
  const notes = measure ? directChildren(measure, 'note') : [];
  const note = notes[details.sourceOrder];
  const durations = note ? directChildren(note, 'duration') : [];
  if (
    durations.length !== 1
    || durations[0].attributes.length !== 0
    || durations[0].children.length !== 0
    || durations[0].text.trim() !== String(details.durationDivisions)
  ) return null;

  const root = cloneNode(parsedDocument.root, (rootChild) => {
    if (rootChild !== parts[0]) return cloneNode(rootChild);
    return cloneNode(rootChild, (partChild) => {
      if (partChild !== measure) return cloneNode(partChild);
      return cloneNode(partChild, (measureChild) => {
        if (measureChild !== note) return cloneNode(measureChild);
        return cloneNode(measureChild, (noteChild) => (
          noteChild === durations[0]
            ? cloneNode(noteChild, null, { text: String(availableDuration) })
            : cloneNode(noteChild)
        ));
      });
    });
  });
  return Object.freeze({
    parsedDocument: Object.freeze({
      documentType: parsedDocument.documentType,
      contractVersion: parsedDocument.contractVersion,
      root: deepFreezeNode(root),
    }),
    availableDuration,
  });
}

function normalizeCursorDuration(parsedDocument, error) {
  const operation = error.message.startsWith('backup') ? 'backup' : 'forward';
  const replacementDuration = operation === 'backup'
    ? error.details.cursor
    : error.details.expectedDurationDivisions - error.details.cursor;
  if (!Number.isSafeInteger(replacementDuration) || replacementDuration < 0) return null;

  const parts = directChildren(parsedDocument.root, 'part');
  const measures = parts.length === 1 ? directChildren(parts[0], 'measure') : [];
  const measure = measures[error.details.measureIndex];
  if (!measure) return null;
  const cursorNode = measure.children[error.details.measureChildIndex];
  if (
    !cursorNode
    || cursorNode.uri !== measure.uri
    || cursorNode.name !== operation
    || directChildren(cursorNode, 'duration').length !== 1
    || directChildren(cursorNode, 'duration')[0].attributes.length !== 0
    || directChildren(cursorNode, 'duration')[0].children.length !== 0
    || directChildren(cursorNode, 'duration')[0].text.trim() !== String(error.details.duration)
  ) return null;
  const durationNode = directChildren(cursorNode, 'duration')[0];

  const root = cloneNode(parsedDocument.root, (rootChild) => {
    if (rootChild !== parts[0]) return cloneNode(rootChild);
    return cloneNode(rootChild, (partChild) => {
      if (partChild !== measure) return cloneNode(partChild);
      return cloneNode(partChild, (measureChild) => {
        if (measureChild !== cursorNode) return cloneNode(measureChild);
        if (replacementDuration === 0) return null;
        return cloneNode(measureChild, (cursorChild) => (
          cursorChild === durationNode
            ? cloneNode(cursorChild, null, { text: String(replacementDuration) })
            : cloneNode(cursorChild)
        ));
      });
    });
  });
  return Object.freeze({
    parsedDocument: Object.freeze({
      documentType: parsedDocument.documentType,
      contractVersion: parsedDocument.contractVersion,
      root: deepFreezeNode(root),
    }),
    replacementDuration,
    operation,
  });
}

function reviewIssue(details, replacementDurationDivisions, reason = 'MEASURE_EVENT_OVERFLOW') {
  return Object.freeze({
    severity: 'error',
    category: 'semantic',
    code: 'INVALID_MUSICXML',
    message: reason === 'MEASURE_EVENT_OVERFLOW'
      ? 'Overflowing event duration was clamped only in the provisional TAB projection.'
      : 'Overflowing timing cursor operation was normalized only in the provisional TAB projection.',
    reviewDisposition: 'REVIEW_REQUIRED',
    location: Object.freeze({
      measure: details.measureNumber ?? null,
      measureIndex: details.measureIndex,
      eventIndex: details.sourceOrder,
      sourceEventId: details.sourceEventId ?? null,
    }),
    details: Object.freeze({
      ...details,
      feature: 'rhythm-timeline',
      reason,
      reviewDisposition: 'REVIEW_REQUIRED',
      provisionalDurationDivisions: replacementDurationDivisions,
    }),
  });
}

function projectParsedMusicXmlWithMeasureOverflowReview(parsedDocument, runtime = null) {
  let candidate = parsedDocument;
  const reviewIssues = [];
  for (let attempt = 0; attempt <= MAX_MEASURE_OVERFLOW_REPAIRS; attempt += 1) {
    try {
      const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(candidate, runtime);
      return Object.freeze({
        contractVersion: POLYPHONIC_MEASURE_OVERFLOW_REVIEW_VERSION,
        authority: POLYPHONIC_MEASURE_OVERFLOW_REVIEW_AUTHORITY,
        parsedDocument: candidate,
        sourceModel,
        reviewIssues: Object.freeze(reviewIssues),
      });
    } catch (error) {
      if ((!exactOverflow(error) && !exactCursorOverflow(error))
        || attempt === MAX_MEASURE_OVERFLOW_REPAIRS) throw error;
      const normalized = exactOverflow(error)
        ? clampOverflowDuration(candidate, error.details)
        : normalizeCursorDuration(candidate, error);
      if (normalized === null) throw error;
      runtime?.checkpoint('measure-overflow-review:clamp', {
        measureIndex: error.details.measureIndex,
        sourceOrder: error.details.sourceOrder ?? null,
        replacementDurationDivisions:
          normalized.availableDuration ?? normalized.replacementDuration,
      });
      reviewIssues.push(reviewIssue(
        error.details,
        normalized.availableDuration ?? normalized.replacementDuration,
        exactOverflow(error)
          ? 'MEASURE_EVENT_OVERFLOW'
          : `${normalized.operation.toUpperCase()}_CURSOR_OVERFLOW`,
      ));
      candidate = normalized.parsedDocument;
    }
  }
  throw new TypeError('Unreachable measure-overflow review state.');
}

module.exports = {
  POLYPHONIC_MEASURE_OVERFLOW_REVIEW_VERSION,
  POLYPHONIC_MEASURE_OVERFLOW_REVIEW_AUTHORITY,
  MAX_MEASURE_OVERFLOW_REPAIRS,
  projectParsedMusicXmlWithMeasureOverflowReview,
};
