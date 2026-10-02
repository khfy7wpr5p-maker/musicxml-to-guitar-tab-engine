'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');

const { EngineError } = require('../errors/engineError');
const { DEFAULT_MAX_XML_BYTES } = require('../validation/xmlSafety');
const { getPositionCandidates } = require('../guitar/fretboard');
const { processMusicXmlUpload } = require('./musicXmlUploadRuntime');
const { createReviewTabDraft } = require('./reviewTabDraft');
const { decorateUploadResultWithCapabilities } = require('./reviewRequiredCapabilityContract');
const { freezeObjectGraph } = require('./freezeObjectGraph');

const REVIEW_TAB_DRAFT_EDIT_RUNTIME_VERSION = '1.0.0';
const REVIEW_TAB_DRAFT_EDIT_RUNTIME_DOCUMENT_TYPE = 'ReviewTabDraftEditRuntimeResult';
const MAX_REVIEW_DRAFT_COMMANDS = 128;

class ReviewTabDraftEditRuntimeError extends EngineError {
  constructor(message, code = 'INVALID_REVIEW_TAB_DRAFT_EDIT_REQUEST', details = {}) {
    super(message, code, details, 'ReviewTabDraftEditRuntimeError');
  }
}

function invalid(message, code = 'INVALID_REVIEW_TAB_DRAFT_EDIT_REQUEST', details = {}) {
  return new ReviewTabDraftEditRuntimeError(message, code, details);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactFields(value, allowed, required, field) {
  if (!plainObject(value)) throw invalid(`${field} must be a non-proxy plain object.`, undefined, { field });
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalid(`${field} contains an unknown field.`, undefined, { field, key: String(key) });
    }
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid(`${field} fields must be enumerable data properties.`, undefined, { field, key });
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) {
      throw invalid(`${field} is missing a required field.`, undefined, { field, key });
    }
  }
  return descriptors;
}

function snapshotBytes(value) {
  if (value && typeof value === 'object' && isProxy(value)) {
    throw invalid('bytes must not be a Proxy.', undefined, { field: 'bytes' });
  }
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw invalid('bytes must be a Buffer or Uint8Array.', undefined, { field: 'bytes' });
  }
  if (value.byteLength > DEFAULT_MAX_XML_BYTES) {
    throw invalid('MusicXML source bytes exceed the fixed size limit.', 'REVIEW_DRAFT_SOURCE_TOO_LARGE', {
      byteLength: value.byteLength,
      maximumBytes: DEFAULT_MAX_XML_BYTES,
    });
  }
  return Buffer.from(value);
}

function normalizePosition(value, field) {
  const descriptors = exactFields(
    value,
    new Set(['string', 'fret']),
    new Set(['string', 'fret']),
    field,
  );
  const string = descriptors.string.value;
  const fret = descriptors.fret.value;
  if (!Number.isSafeInteger(string) || string < 1 || string > 6) {
    throw invalid(`${field}.string must be an integer from 1 through 6.`, undefined, {
      field: `${field}.string`,
    });
  }
  if (!Number.isSafeInteger(fret) || fret < 0 || fret > 20) {
    throw invalid(`${field}.fret must be an integer from 0 through 20.`, undefined, {
      field: `${field}.fret`,
    });
  }
  return Object.freeze({ string, fret });
}

function normalizeCommands(value) {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalid('commands must be a non-proxy ordinary array.', undefined, { field: 'commands' });
  }
  if (value.length > MAX_REVIEW_DRAFT_COMMANDS) {
    throw invalid('commands exceed the review draft revision limit.', 'REVIEW_DRAFT_REVISION_LIMIT', {
      maximum: MAX_REVIEW_DRAFT_COMMANDS,
    });
  }
  return Object.freeze(value.map((command, index) => {
    const field = `commands[${index}]`;
    const descriptors = exactFields(
      command,
      new Set(['sourceEventId', 'selectedPosition']),
      new Set(['sourceEventId', 'selectedPosition']),
      field,
    );
    const sourceEventId = descriptors.sourceEventId.value;
    if (typeof sourceEventId !== 'string' || sourceEventId.length === 0 || sourceEventId.length > 256) {
      throw invalid(`${field}.sourceEventId must be a bounded non-empty string.`, undefined, {
        field: `${field}.sourceEventId`,
      });
    }
    return Object.freeze({
      sourceEventId,
      selectedPosition: normalizePosition(descriptors.selectedPosition.value, `${field}.selectedPosition`),
    });
  }));
}

function normalizeRequest(request) {
  const descriptors = exactFields(
    request,
    new Set(['fileName', 'bytes', 'expectedInputSha256', 'baseRevisionId', 'commands']),
    new Set(['fileName', 'bytes', 'expectedInputSha256', 'baseRevisionId', 'commands']),
    'request',
  );
  const fileName = descriptors.fileName.value;
  if (
    typeof fileName !== 'string'
    || fileName.length === 0
    || fileName.length > 255
    || /[\\/\u0000-\u001f\u007f]/.test(fileName)
  ) {
    throw invalid('fileName must be a bounded plain file name without path separators.', undefined, {
      field: 'fileName',
    });
  }
  const expectedInputSha256 = descriptors.expectedInputSha256.value;
  if (typeof expectedInputSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedInputSha256)) {
    throw invalid('expectedInputSha256 must be a lowercase SHA-256 digest.', undefined, {
      field: 'expectedInputSha256',
    });
  }
  const baseRevisionId = descriptors.baseRevisionId.value;
  if (
    typeof baseRevisionId !== 'string'
    || baseRevisionId.length === 0
    || baseRevisionId.length > 256
  ) {
    throw invalid('baseRevisionId must be a bounded non-empty string.', undefined, {
      field: 'baseRevisionId',
    });
  }
  return Object.freeze({
    fileName,
    bytes: snapshotBytes(descriptors.bytes.value),
    expectedInputSha256,
    baseRevisionId,
    commands: normalizeCommands(descriptors.commands.value),
  });
}

function issue(code, message, details = {}) {
  return Object.freeze({
    severity: 'error',
    category: code.includes('PITCH') || code.includes('COLLISION') ? 'playability' : 'safety',
    code,
    message,
    location: Object.freeze({
      measure: details.measure ?? null,
      measureIndex: details.measureIndex ?? null,
      eventIndex: details.sourceOrder ?? null,
      sourceEventId: details.sourceEventId ?? null,
    }),
    details: freezeObjectGraph({ ...details }),
  });
}

function blocked(upload, blockingIssue, revision = null) {
  return freezeObjectGraph({
    documentType: REVIEW_TAB_DRAFT_EDIT_RUNTIME_DOCUMENT_TYPE,
    contractVersion: REVIEW_TAB_DRAFT_EDIT_RUNTIME_VERSION,
    status: 'BLOCKED',
    route: upload?.route ?? 'POLY_V2',
    input: upload?.input ?? null,
    revision,
    preflight: {
      status: 'BLOCKED',
      canProcess: false,
      canOpenForReview: false,
      summary: null,
      issues: [blockingIssue],
    },
    sourceArtifact: upload?.sourceArtifact ?? null,
    sourceReviewIndex: upload?.sourceReviewIndex ?? null,
    reviewTabDraft: upload?.reviewTabDraft ?? null,
    canonicalTabResult: null,
    musicXml: null,
    capabilities: {
      renderScore: false,
      draftVisible: false,
      generateTab: false,
      editPitch: false,
      editRhythm: false,
      assignTabPosition: false,
      editVoice: false,
      editStructure: false,
      playback: 'DISABLED',
      export: false,
    },
    artifacts: {
      sourceArtifactAvailable: Boolean(upload?.sourceArtifact),
      reviewTabDraftAvailable: false,
      sourceReviewIndexAvailable: Boolean(upload?.sourceReviewIndex),
      canonicalTabAvailable: false,
    },
  });
}

function guitarOptions(guitar) {
  return {
    tuning: guitar.tuning,
    minimumFret: guitar.minimumFret,
    maximumFret: guitar.maximumFret,
    capoFret: guitar.capoFret,
  };
}

function exactCandidate(source, position, guitar) {
  return getPositionCandidates(source.knownPitchOrNull.midi, guitarOptions(guitar))
    .some((candidate) => (
      candidate.string === position.string
      && candidate.fret === position.fret
    ));
}

function revisionId(baseRevisionId, commands) {
  if (commands.length === 0) return baseRevisionId;
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(commands))
    .digest('hex')
    .slice(0, 20);
  return `${baseRevisionId}:r${commands.length}:${digest}`;
}

function processReviewTabDraftEdit(rawRequest) {
  const request = normalizeRequest(rawRequest);
  const actualSha256 = crypto.createHash('sha256').update(request.bytes).digest('hex');
  if (actualSha256 !== request.expectedInputSha256) {
    return blocked(null, issue(
      'STALE_REVIEW_DRAFT_SOURCE',
      'The review draft edit does not match the immutable source SHA-256.',
      { expected: request.expectedInputSha256, actual: actualSha256 },
    ));
  }

  const upload = processMusicXmlUpload({
    fileName: request.fileName,
    bytes: request.bytes,
  });
  if (
    upload.status !== 'REVIEW_REQUIRED'
    || upload.route !== 'POLY_V2'
    || upload.reviewTabDraft?.documentType !== 'ReviewTabDraft'
    || upload.reviewTabDraft?.contractVersion !== '1.0.0'
    || upload.sourceReviewIndex?.documentType !== 'SourceReviewIndex'
    || upload.sourceReviewIndex?.contractVersion !== '1.0.0'
    || upload.input?.sha256 !== request.expectedInputSha256
  ) {
    return blocked(upload, issue(
      'REVIEW_DRAFT_EDIT_NOT_AVAILABLE',
      'The immutable source does not reproduce an editable ReviewTabDraft.',
      { sourceEventId: null },
    ));
  }

  const baseRevisionId = upload.reviewTabDraft.revisionId;
  if (request.baseRevisionId !== baseRevisionId) {
    return blocked(upload, issue(
      'STALE_REVIEW_DRAFT_REVISION',
      'The requested ReviewTabDraft base revision is stale or belongs to another source.',
      { expectedRevisionId: baseRevisionId, suppliedRevisionId: request.baseRevisionId },
    ));
  }

  const sourceById = new Map(
    upload.sourceReviewIndex.entries.map((entry) => [entry.sourceEventId, entry]),
  );
  const assignedById = new Map();

  for (let index = 0; index < request.commands.length; index += 1) {
    const command = request.commands[index];
    const source = sourceById.get(command.sourceEventId);
    if (
      !source
      || source.eventKind !== 'PITCHED_NOTE'
      || source.knownPitchOrNull === null
      || source.knownOnsetOrNull === null
      || source.knownDurationOrNull === null
    ) {
      return blocked(upload, issue(
        'REVIEW_DRAFT_SOURCE_EVENT_NOT_ASSIGNABLE',
        'The selected source event does not have enough verified source evidence for a TAB position.',
        {
          commandIndex: index,
          sourceEventId: command.sourceEventId,
          measure: source?.evidenceLocation?.measure ?? null,
          measureIndex: source?.evidenceLocation?.measureIndex ?? null,
          sourceOrder: source?.evidenceLocation?.sourceOrder ?? null,
        },
      ));
    }

    if (!exactCandidate(source, command.selectedPosition, upload.reviewTabDraft.guitarConfiguration)) {
      return blocked(upload, issue(
        'REVIEW_DRAFT_POSITION_PITCH_MISMATCH',
        'The requested string/fret does not reproduce the verified source pitch under the current guitar configuration.',
        {
          commandIndex: index,
          sourceEventId: source.sourceEventId,
          measure: source.evidenceLocation.measure,
          measureIndex: source.evidenceLocation.measureIndex,
          sourceOrder: source.evidenceLocation.sourceOrder,
          targetMidi: source.knownPitchOrNull.midi,
          selectedPosition: command.selectedPosition,
        },
      ));
    }

    for (const [otherSourceEventId, otherPosition] of assignedById) {
      if (otherSourceEventId === source.sourceEventId) continue;
      const other = sourceById.get(otherSourceEventId);
      if (
        other
        && other.measureId === source.measureId
        && other.knownOnsetOrNull === source.knownOnsetOrNull
        && otherPosition.string === command.selectedPosition.string
      ) {
        return blocked(upload, issue(
          'REVIEW_DRAFT_STRING_COLLISION',
          'Two simultaneous ReviewTabDraft notes cannot occupy the same guitar string.',
          {
            commandIndex: index,
            sourceEventId: source.sourceEventId,
            conflictingSourceEventId: other.sourceEventId,
            measure: source.evidenceLocation.measure,
            measureIndex: source.evidenceLocation.measureIndex,
            sourceOrder: source.evidenceLocation.sourceOrder,
            string: command.selectedPosition.string,
          },
        ));
      }
    }
    assignedById.set(source.sourceEventId, command.selectedPosition);
  }

  const nextRevisionId = revisionId(baseRevisionId, request.commands);
  const positionAssignments = [...assignedById].map(([sourceEventId, selectedPosition]) => ({
    sourceEventId,
    selectedPosition,
  }));
  const draft = createReviewTabDraft({
    sourceReviewIndex: upload.sourceReviewIndex,
    sourceScoreArtifact: upload.sourceArtifact,
    guitarConfiguration: upload.reviewTabDraft.guitarConfiguration,
    issues: upload.reviewTabDraft.issues,
    positionAssignments,
    revisionId: nextRevisionId,
  });
  if (!draft) {
    return blocked(upload, issue(
      'REVIEW_DRAFT_REBUILD_FAILED',
      'The ReviewTabDraft revision could not be rebuilt from immutable source evidence.',
    ));
  }

  const revision = freezeObjectGraph({
    documentType: 'ReviewTabDraftRevision',
    contractVersion: '1.0.0',
    baseRevisionId,
    revisionId: nextRevisionId,
    revisionNumber: request.commands.length,
    appliedEdits: request.commands.map((command, index) => ({
      commandIndex: index,
      commandType: 'SET_REVIEW_TAB_DRAFT_POSITION',
      sourceEventId: command.sourceEventId,
      selectedPosition: command.selectedPosition,
    })),
  });

  const result = decorateUploadResultWithCapabilities({
    ...upload,
    reviewTabDraft: draft,
    revision,
  });
  return freezeObjectGraph({
    ...result,
    editRuntime: Object.freeze({
      documentType: REVIEW_TAB_DRAFT_EDIT_RUNTIME_DOCUMENT_TYPE,
      contractVersion: REVIEW_TAB_DRAFT_EDIT_RUNTIME_VERSION,
    }),
  });
}

module.exports = {
  REVIEW_TAB_DRAFT_EDIT_RUNTIME_VERSION,
  REVIEW_TAB_DRAFT_EDIT_RUNTIME_DOCUMENT_TYPE,
  ReviewTabDraftEditRuntimeError,
  processReviewTabDraftEdit,
};
