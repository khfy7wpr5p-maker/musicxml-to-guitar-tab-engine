'use strict';

const {
  PolyphonicMusicXmlProjectorError,
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('./polyphonicMusicXmlProjector');

const POLYPHONIC_MEASURE_OVERFLOW_REVIEW_VERSION = '1.0.0';
const POLYPHONIC_MEASURE_OVERFLOW_REVIEW_AUTHORITY =
  'PROVISIONAL_DURATION_CLAMP_WITH_IMMUTABLE_SOURCE';
const MAX_MEASURE_OVERFLOW_REPAIRS = 256;
const CONSENSUS_OVERFULL_MEASURE_REVIEW_POLICY = 'CONSENSUS_OVERFULL_MEASURE_REVIEW';
const BOUNDARY_TAIL_MEASURE_REVIEW_POLICY = 'BOUNDARY_TAIL_MEASURE_REVIEW';
const MAX_PROVISIONAL_QUARTER_BEATS = 32;

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


function scalarPositiveInteger(node) {
  if (
    !node
    || node.attributes.length !== 0
    || node.children.length !== 0
    || !/^[1-9]\d*$/.test(node.text.trim())
  ) return null;
  const value = Number(node.text.trim());
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function simpleTimeSignature(timeNode) {
  if (!timeNode || timeNode.text.trim().length !== 0) return null;
  const beatsNodes = directChildren(timeNode, 'beats');
  const beatTypeNodes = directChildren(timeNode, 'beat-type');
  const semanticChildren = timeNode.children.filter((child) => child.uri === timeNode.uri);
  if (
    beatsNodes.length !== 1
    || beatTypeNodes.length !== 1
    || semanticChildren.length !== 2
    || semanticChildren[0] !== beatsNodes[0]
    || semanticChildren[1] !== beatTypeNodes[0]
  ) return null;
  const beats = scalarPositiveInteger(beatsNodes[0]);
  const beatType = scalarPositiveInteger(beatTypeNodes[0]);
  if (beats === null || beatType === null) return null;
  return Object.freeze({ beats, beatType });
}

function measureHasAffirmativeFlag(measure, name) {
  const matches = measure.attributes.filter(
    (attribute) => attribute.uri.length === 0 && attribute.name === name,
  );
  return matches.length === 1 && matches[0].value === 'yes';
}

function timingAtMeasure(parsedDocument, measureIndex) {
  const parts = directChildren(parsedDocument.root, 'part');
  const measures = parts.length === 1 ? directChildren(parts[0], 'measure') : [];
  if (measureIndex < 0 || measureIndex >= measures.length) return null;

  let divisions = null;
  let timeSignature = null;
  for (let index = 0; index <= measureIndex; index += 1) {
    for (const attributes of directChildren(measures[index], 'attributes')) {
      const divisionsNodes = directChildren(attributes, 'divisions');
      if (divisionsNodes.length > 1) return null;
      if (divisionsNodes.length === 1) {
        const parsedDivisions = scalarPositiveInteger(divisionsNodes[0]);
        if (parsedDivisions === null) return null;
        divisions = parsedDivisions;
      }
      const timeNodes = directChildren(attributes, 'time');
      if (timeNodes.length > 1) return null;
      if (timeNodes.length === 1) {
        const parsedTime = simpleTimeSignature(timeNodes[0]);
        if (parsedTime === null) return null;
        timeSignature = parsedTime;
      }
    }
  }
  if (divisions === null || timeSignature === null) return null;
  return Object.freeze({ divisions, timeSignature });
}

function simpleDurationChild(parent) {
  const durations = directChildren(parent, 'duration');
  return durations.length === 1 ? scalarPositiveInteger(durations[0]) : null;
}

function consensusCursorTracks(measure) {
  let cursor = 0;
  let maximumEnd = 0;
  let chordAnchorOnset = null;
  let trackHasTiming = false;
  const extents = [];

  for (const child of measure.children) {
    if (child.uri !== measure.uri) continue;
    if (child.name === 'note') {
      const duration = simpleDurationChild(child);
      if (duration === null) return null;
      const chordMarkers = directChildren(child, 'chord');
      if (chordMarkers.length > 1) return null;
      if (chordMarkers.length === 1) {
        if (chordAnchorOnset === null) return null;
        const chordEnd = chordAnchorOnset + duration;
        if (!Number.isSafeInteger(chordEnd)) return null;
        maximumEnd = Math.max(maximumEnd, chordEnd);
      } else {
        chordAnchorOnset = cursor;
        if (cursor > Number.MAX_SAFE_INTEGER - duration) return null;
        cursor += duration;
        maximumEnd = Math.max(maximumEnd, cursor);
      }
      trackHasTiming = true;
      continue;
    }
    if (child.name === 'forward') {
      const duration = simpleDurationChild(child);
      if (duration === null || cursor > Number.MAX_SAFE_INTEGER - duration) return null;
      cursor += duration;
      maximumEnd = Math.max(maximumEnd, cursor);
      chordAnchorOnset = null;
      trackHasTiming = true;
      continue;
    }
    if (child.name === 'backup') {
      const duration = simpleDurationChild(child);
      if (
        duration === null
        || !trackHasTiming
        || duration !== cursor
        || maximumEnd !== cursor
      ) return null;
      extents.push(cursor);
      cursor = 0;
      maximumEnd = 0;
      chordAnchorOnset = null;
      trackHasTiming = false;
    }
  }

  if (!trackHasTiming || cursor <= 0 || maximumEnd !== cursor) return null;
  extents.push(cursor);
  if (extents.length < 2 || extents.some((extent) => extent !== extents[0])) return null;
  return Object.freeze(extents);
}

function measureHasExplicitTime(measure) {
  return directChildren(measure, 'attributes').some(
    (attributes) => directChildren(attributes, 'time').length > 0,
  );
}

function syntheticTimeNode(uri, signature) {
  return {
    name: 'time',
    uri,
    attributes: [],
    text: '',
    children: [
      {
        name: 'beats',
        uri,
        attributes: [],
        text: String(signature.beats),
        children: [],
      },
      {
        name: 'beat-type',
        uri,
        attributes: [],
        text: String(signature.beatType),
        children: [],
      },
    ],
  };
}

function withTimeSignature(measure, signature, replaceExisting) {
  const attributesWithTime = directChildren(measure, 'attributes').filter(
    (attributes) => directChildren(attributes, 'time').length > 0,
  );
  if (attributesWithTime.length > 1) return null;

  if (attributesWithTime.length === 1) {
    if (!replaceExisting) return cloneNode(measure);
    const attributes = attributesWithTime[0];
    const timeNodes = directChildren(attributes, 'time');
    if (timeNodes.length !== 1 || simpleTimeSignature(timeNodes[0]) === null) return null;
    const timeNode = timeNodes[0];
    return cloneNode(measure, (measureChild) => (
      measureChild === attributes
        ? cloneNode(attributes, (attributeChild) => (
          attributeChild === timeNode
            ? cloneNode(syntheticTimeNode(measure.uri, signature))
            : cloneNode(attributeChild)
        ))
        : cloneNode(measureChild)
    ));
  }

  const normalized = cloneNode(measure);
  normalized.children.unshift({
    name: 'attributes',
    uri: measure.uri,
    attributes: [],
    text: '',
    children: [syntheticTimeNode(measure.uri, signature)],
  });
  return normalized;
}

function normalizeConsensusOverfullMeasure(parsedDocument, details) {
  const parts = directChildren(parsedDocument.root, 'part');
  const measures = parts.length === 1 ? directChildren(parts[0], 'measure') : [];
  const measureIndex = details.measureIndex;
  const measure = measures[measureIndex];
  const nextMeasure = measures[measureIndex + 1];
  if (
    !measure
    || !nextMeasure
    || measureHasAffirmativeFlag(measure, 'implicit')
    || measureHasAffirmativeFlag(measure, 'non-controlling')
    || measureHasAffirmativeFlag(nextMeasure, 'non-controlling')
  ) return null;

  const timing = timingAtMeasure(parsedDocument, measureIndex);
  if (
    !timing
    || timing.timeSignature.beatType !== 4
    || details.expectedDurationDivisions !== timing.divisions * timing.timeSignature.beats
  ) return null;

  const trackExtents = consensusCursorTracks(measure);
  if (!trackExtents) return null;
  const provisionalMeasureDurationDivisions = trackExtents[0];
  const provisionalBeats = timing.timeSignature.beats + 1;
  if (
    provisionalBeats > MAX_PROVISIONAL_QUARTER_BEATS
    || provisionalMeasureDurationDivisions !== details.expectedDurationDivisions + timing.divisions
    || provisionalMeasureDurationDivisions !== timing.divisions * provisionalBeats
  ) return null;

  const provisionalTimeSignature = Object.freeze({ beats: provisionalBeats, beatType: 4 });
  const targetMeasure = withTimeSignature(measure, provisionalTimeSignature, true);
  if (!targetMeasure) return null;
  const restoredNextMeasure = measureHasExplicitTime(nextMeasure)
    ? cloneNode(nextMeasure)
    : withTimeSignature(nextMeasure, timing.timeSignature, false);
  if (!restoredNextMeasure) return null;

  const part = parts[0];
  const normalizedRoot = cloneNode(parsedDocument.root, (rootChild) => {
    if (rootChild !== part) return cloneNode(rootChild);
    return cloneNode(part, (partChild) => {
      if (partChild === measure) return targetMeasure;
      if (partChild === nextMeasure) return restoredNextMeasure;
      return cloneNode(partChild);
    });
  });

  return Object.freeze({
    parsedDocument: Object.freeze({
      documentType: parsedDocument.documentType,
      contractVersion: parsedDocument.contractVersion,
      root: deepFreezeNode(normalizedRoot),
    }),
    sourceExpectedDurationDivisions: details.expectedDurationDivisions,
    provisionalMeasureDurationDivisions,
    sourceTimeSignature: timing.timeSignature,
    provisionalTimeSignature,
    cursorTrackCount: trackExtents.length,
  });
}


function normalizeBoundaryTailOverflowMeasure(parsedDocument, details) {
  const parts = directChildren(parsedDocument.root, 'part');
  const measures = parts.length === 1 ? directChildren(parts[0], 'measure') : [];
  const measure = measures[details.measureIndex];
  const nextMeasure = measures[details.measureIndex + 1];
  if (
    !measure
    || !nextMeasure
    || measureHasAffirmativeFlag(measure, 'implicit')
    || measureHasAffirmativeFlag(measure, 'non-controlling')
    || measureHasAffirmativeFlag(nextMeasure, 'non-controlling')
  ) return null;

  const timing = timingAtMeasure(parsedDocument, details.measureIndex);
  if (
    !timing
    || timing.timeSignature.beatType !== 4
    || details.expectedDurationDivisions !== timing.divisions * timing.timeSignature.beats
    || details.onsetDivisions !== details.expectedDurationDivisions
    || details.durationDivisions !== timing.divisions
    || details.endDivisions !== details.onsetDivisions + details.durationDivisions
  ) return null;

  const provisionalMeasureDurationDivisions = details.endDivisions;
  if (
    !Number.isSafeInteger(provisionalMeasureDurationDivisions)
    || provisionalMeasureDurationDivisions <= details.expectedDurationDivisions
    || provisionalMeasureDurationDivisions % timing.divisions !== 0
  ) return null;
  const provisionalBeats = provisionalMeasureDurationDivisions / timing.divisions;
  if (
    !Number.isSafeInteger(provisionalBeats)
    || provisionalBeats <= timing.timeSignature.beats
    || provisionalBeats > MAX_PROVISIONAL_QUARTER_BEATS
  ) return null;

  const notes = directChildren(measure, 'note');
  const note = notes[details.sourceOrder];
  const durationNodes = note ? directChildren(note, 'duration') : [];
  if (
    durationNodes.length !== 1
    || durationNodes[0].attributes.length !== 0
    || durationNodes[0].children.length !== 0
    || durationNodes[0].text.trim() !== String(details.durationDivisions)
  ) return null;

  const provisionalTimeSignature = Object.freeze({ beats: provisionalBeats, beatType: 4 });
  const targetMeasure = withTimeSignature(measure, provisionalTimeSignature, true);
  if (!targetMeasure) return null;
  const restoredNextMeasure = measureHasExplicitTime(nextMeasure)
    ? cloneNode(nextMeasure)
    : withTimeSignature(nextMeasure, timing.timeSignature, false);
  if (!restoredNextMeasure) return null;

  const part = parts[0];
  const normalizedRoot = cloneNode(parsedDocument.root, (rootChild) => {
    if (rootChild !== part) return cloneNode(rootChild);
    return cloneNode(part, (partChild) => {
      if (partChild === measure) return targetMeasure;
      if (partChild === nextMeasure) return restoredNextMeasure;
      return cloneNode(partChild);
    });
  });

  return Object.freeze({
    parsedDocument: Object.freeze({
      documentType: parsedDocument.documentType,
      contractVersion: parsedDocument.contractVersion,
      root: deepFreezeNode(normalizedRoot),
    }),
    sourceExpectedDurationDivisions: details.expectedDurationDivisions,
    provisionalMeasureDurationDivisions,
    sourceTimeSignature: timing.timeSignature,
    provisionalTimeSignature,
  });
}

function boundaryTailOverflowReviewIssue(details, normalization) {
  return Object.freeze({
    severity: 'error',
    category: 'semantic',
    code: 'INVALID_MUSICXML',
    message: 'A measure-boundary source event is retained at full duration only in a bounded provisional local timing extent.',
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
      reason: 'MEASURE_EVENT_OVERFLOW',
      policy: BOUNDARY_TAIL_MEASURE_REVIEW_POLICY,
      reviewDisposition: 'REVIEW_REQUIRED',
      sourceExpectedDurationDivisions: normalization.sourceExpectedDurationDivisions,
      provisionalMeasureDurationDivisions: normalization.provisionalMeasureDurationDivisions,
      sourceTimeSignature: normalization.sourceTimeSignature,
      provisionalTimeSignature: normalization.provisionalTimeSignature,
      sourceMusicXmlImmutable: true,
      targetTimingAuthority: false,
    }),
  });
}

function consensusOverflowReviewIssue(details, normalization) {
  return Object.freeze({
    severity: 'error',
    category: 'semantic',
    code: 'INVALID_MUSICXML',
    message: 'Consistent one-quarter overfull measure timing is represented only in the provisional TAB projection.',
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
      reason: 'MEASURE_EVENT_OVERFLOW',
      policy: CONSENSUS_OVERFULL_MEASURE_REVIEW_POLICY,
      reviewDisposition: 'REVIEW_REQUIRED',
      sourceExpectedDurationDivisions: normalization.sourceExpectedDurationDivisions,
      provisionalMeasureDurationDivisions: normalization.provisionalMeasureDurationDivisions,
      sourceTimeSignature: normalization.sourceTimeSignature,
      provisionalTimeSignature: normalization.provisionalTimeSignature,
      cursorTrackCount: normalization.cursorTrackCount,
      sourceMusicXmlImmutable: true,
      targetTimingAuthority: false,
    }),
  });
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
      if (exactOverflow(error)) {
        const consensusNormalization = normalizeConsensusOverfullMeasure(
          candidate,
          error.details,
        );
        if (consensusNormalization !== null) {
          runtime?.checkpoint('measure-overflow-review:consensus-extent', {
            measureIndex: error.details.measureIndex,
            sourceOrder: error.details.sourceOrder ?? null,
            sourceExpectedDurationDivisions:
              consensusNormalization.sourceExpectedDurationDivisions,
            provisionalMeasureDurationDivisions:
              consensusNormalization.provisionalMeasureDurationDivisions,
            cursorTrackCount: consensusNormalization.cursorTrackCount,
          });
          reviewIssues.push(consensusOverflowReviewIssue(
            error.details,
            consensusNormalization,
          ));
          candidate = consensusNormalization.parsedDocument;
          continue;
        }

        const boundaryTailNormalization = normalizeBoundaryTailOverflowMeasure(
          candidate,
          error.details,
        );
        if (boundaryTailNormalization !== null) {
          runtime?.checkpoint('measure-overflow-review:boundary-tail-extent', {
            measureIndex: error.details.measureIndex,
            sourceOrder: error.details.sourceOrder ?? null,
            sourceExpectedDurationDivisions:
              boundaryTailNormalization.sourceExpectedDurationDivisions,
            provisionalMeasureDurationDivisions:
              boundaryTailNormalization.provisionalMeasureDurationDivisions,
          });
          reviewIssues.push(boundaryTailOverflowReviewIssue(
            error.details,
            boundaryTailNormalization,
          ));
          candidate = boundaryTailNormalization.parsedDocument;
          continue;
        }
      }

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
