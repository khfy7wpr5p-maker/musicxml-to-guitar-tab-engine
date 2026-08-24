'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { resolveProcessingRuntime } = require('../core/processingRuntime');
const { inspectMusicXml } = require('../validation/musicxmlPreflight');
const { DEFAULT_MAX_XML_BYTES } = require('../validation/xmlSafety');
const { createCanonicalMusicDocument } = require('../music/canonicalMusicDocument');
const { pitchToMidi, validatePitchComponents } = require('../music/pitch');
const { createCanonicalTabResult } = require('../tab/canonicalTabResult');
const { serializeCanonicalTabResultToMusicXml } = require('../writers/canonicalTabMusicXmlWriter');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('./musicXmlUploadRuntime');

const MUSICXML_NOTE_EDIT_RUNTIME_VERSION = '1.0.0';
const MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE = 'MusicXmlNoteEditRuntimeResult';
const MUSICXML_NOTE_EDIT_STATUS = Object.freeze({
  PASS: 'PASS',
  BLOCKED: 'BLOCKED',
});
const MAX_FILE_NAME_LENGTH = 255;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
).get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteOffset',
).get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
).get;

class MusicXmlNoteEditRuntimeError extends EngineError {
  constructor(message, code = 'INVALID_EDIT_REQUEST', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'MusicXmlNoteEditRuntimeError');
  }
}

function invalidRequest(message, details = {}) {
  return new MusicXmlNoteEditRuntimeError(message, 'INVALID_EDIT_REQUEST', details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataProperties(value, field, allowed, required = allowed) {
  if (!isPlainObject(value)) {
    throw invalidRequest(`${field} must be a non-proxy plain object.`, { field });
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalidRequest(`${field} contains an unknown field.`, {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidRequest(`${field} fields must be enumerable data properties.`, { field: key });
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(descriptors, key)) {
      throw invalidRequest(`${field} is missing a required field.`, { field: key });
    }
  }
  return descriptors;
}

function snapshotBytes(bytes) {
  if (bytes && typeof bytes === 'object' && isProxy(bytes)) {
    throw invalidRequest('bytes must not be a Proxy.', { field: 'bytes' });
  }
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw invalidRequest('bytes must be a Buffer or Uint8Array.', { field: 'bytes' });
  }

  let backingBuffer;
  let byteOffset;
  let byteLength;
  try {
    backingBuffer = Reflect.apply(TYPED_ARRAY_BUFFER_GETTER, bytes, []);
    byteOffset = Reflect.apply(TYPED_ARRAY_BYTE_OFFSET_GETTER, bytes, []);
    byteLength = Reflect.apply(TYPED_ARRAY_BYTE_LENGTH_GETTER, bytes, []);
  } catch {
    throw invalidRequest('bytes must be an attached Buffer or Uint8Array.', { field: 'bytes' });
  }

  if (typeof SharedArrayBuffer === 'function' && backingBuffer instanceof SharedArrayBuffer) {
    throw invalidRequest('bytes must not use shared memory.', { field: 'bytes' });
  }
  if (byteLength > DEFAULT_MAX_XML_BYTES) {
    return { bytes: null, byteLength };
  }

  try {
    const plainView = new Uint8Array(backingBuffer, byteOffset, byteLength);
    return { bytes: Buffer.from(plainView), byteLength };
  } catch {
    throw invalidRequest('bytes must be an attached Buffer or Uint8Array.', { field: 'bytes' });
  }
}

function normalizePitchCommand(pitch) {
  const descriptors = ownDataProperties(
    pitch,
    'command.pitch',
    new Set(['step', 'alter', 'octave']),
  );
  const step = descriptors.step.value;
  const alter = descriptors.alter.value;
  const octave = descriptors.octave.value;
  if (typeof step !== 'string' || !/^[A-G]$/.test(step)) {
    throw invalidRequest('command.pitch.step must be uppercase A through G.', {
      field: 'command.pitch.step',
    });
  }
  if (!Number.isSafeInteger(alter) || alter < -2 || alter > 2) {
    throw invalidRequest('command.pitch.alter must be an integer from -2 to 2.', {
      field: 'command.pitch.alter',
    });
  }
  if (!Number.isSafeInteger(octave)) {
    throw invalidRequest('command.pitch.octave must be a safe integer.', {
      field: 'command.pitch.octave',
    });
  }
  validatePitchComponents(step, alter, octave);
  const midi = pitchToMidi({ step, alter, octave });
  const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter];
  return Object.freeze({
    step,
    alter,
    octave,
    written: `${step}${accidental}${octave}`,
    midi,
  });
}

function normalizeCommand(command) {
  const descriptors = ownDataProperties(
    command,
    'command',
    new Set(['measureIndex', 'eventIndex', 'eventId', 'pitch']),
  );
  const measureIndex = descriptors.measureIndex.value;
  const eventIndex = descriptors.eventIndex.value;
  const eventId = descriptors.eventId.value;
  if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {
    throw invalidRequest('command.measureIndex must be a non-negative safe integer.', {
      field: 'command.measureIndex',
    });
  }
  if (!Number.isSafeInteger(eventIndex) || eventIndex < 0) {
    throw invalidRequest('command.eventIndex must be a non-negative safe integer.', {
      field: 'command.eventIndex',
    });
  }
  if (typeof eventId !== 'string' || !/^m[1-9]\d*-e\d+$/.test(eventId)) {
    throw invalidRequest('command.eventId must be a deterministic monophonic event id.', {
      field: 'command.eventId',
    });
  }
  const expectedEventId = `m${measureIndex + 1}-e${eventIndex}`;
  if (eventId !== expectedEventId) {
    throw invalidRequest('command event identity fields do not agree.', {
      eventId,
      expectedEventId,
      measureIndex,
      eventIndex,
    });
  }
  return Object.freeze({
    measureIndex,
    eventIndex,
    eventId,
    pitch: normalizePitchCommand(descriptors.pitch.value),
  });
}

function normalizeRequest(request) {
  const descriptors = ownDataProperties(
    request,
    'request',
    new Set(['fileName', 'bytes', 'expectedInputSha256', 'command']),
  );
  const fileName = descriptors.fileName.value;
  if (
    typeof fileName !== 'string'
    || fileName.length === 0
    || fileName.length > MAX_FILE_NAME_LENGTH
    || /[\\/\u0000-\u001f\u007f]/.test(fileName)
  ) {
    throw invalidRequest('fileName must be a bounded plain file name without path separators.', {
      field: 'fileName',
      maximumLength: MAX_FILE_NAME_LENGTH,
    });
  }
  const expectedInputSha256 = descriptors.expectedInputSha256.value;
  if (typeof expectedInputSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedInputSha256)) {
    throw invalidRequest('expectedInputSha256 must be a lowercase SHA-256 hex digest.', {
      field: 'expectedInputSha256',
    });
  }
  const snapshot = snapshotBytes(descriptors.bytes.value);
  return {
    fileName,
    expectedInputSha256,
    command: normalizeCommand(descriptors.command.value),
    ...snapshot,
  };
}

function createIdentity(fileName, byteLength, bytes) {
  return Object.freeze({
    fileName,
    byteLength,
    sha256: bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex'),
  });
}

function clonePlainData(value) {
  if (Array.isArray(value)) return value.map(clonePlainData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clonePlainData(nested)]));
  }
  return value;
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function issue(code, message, details = {}, category = 'content') {
  return {
    severity: 'error',
    category,
    code,
    message,
    location: {
      measure: details.visibleMeasureNumber ?? details.measure ?? null,
      measureIndex: details.measureIndex ?? null,
      eventIndex: details.eventIndex ?? null,
      sourceEventId: details.eventId ?? details.sourceEventId ?? null,
    },
    details: { ...details },
  };
}

function issueFromError(error) {
  const details = error && typeof error.details === 'object' && error.details
    ? { ...error.details }
    : {};
  const code = typeof error?.code === 'string' ? error.code : 'NOTE_EDIT_FAILED';
  const category = code.startsWith('UNPLAYABLE_')
    ? 'playability'
    : code.startsWith('UNSUPPORTED_') || code === 'EDIT_ROUTE_NOT_SUPPORTED'
      ? 'capability'
      : 'content';
  return issue(code, error instanceof Error ? error.message : 'Note edit failed.', details, category);
}

function blocked(identity, route, blockingIssue, edit = null) {
  return deepFreeze({
    documentType: MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
    contractVersion: MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
    status: MUSICXML_NOTE_EDIT_STATUS.BLOCKED,
    route,
    input: identity,
    edit,
    preflight: {
      status: 'BLOCKED',
      canProcess: false,
      summary: null,
      issues: [blockingIssue],
    },
    canonicalTabResult: null,
    musicXml: null,
  });
}

function processMusicXmlNoteEdit(request, options = {}, runtime = null) {
  if (!isPlainObject(options)) {
    throw invalidRequest('options must be a non-proxy plain object.', { field: 'options' });
  }
  const optionDescriptors = ownDataProperties(
    options,
    'options',
    new Set(['processing']),
    new Set(),
  );
  const processingOptions = Object.hasOwn(optionDescriptors, 'processing')
    ? optionDescriptors.processing.value
    : {};
  if (!isPlainObject(processingOptions)) {
    throw invalidRequest('options.processing must be a non-proxy plain object.', {
      field: 'options.processing',
    });
  }

  const normalized = normalizeRequest(request);
  const identity = createIdentity(normalized.fileName, normalized.byteLength, normalized.bytes);
  if (normalized.bytes === null) {
    return blocked(identity, 'UNRESOLVED', issue(
      'FILE_TOO_LARGE',
      'XML input exceeds the fixed upload size limit.',
      { maxBytes: DEFAULT_MAX_XML_BYTES, byteLength: normalized.byteLength },
      'safety',
    ));
  }
  if (identity.sha256 !== normalized.expectedInputSha256) {
    return blocked(identity, 'UNRESOLVED', issue(
      'STALE_EDIT_INPUT',
      'The edit request does not match the MusicXML document currently shown in the workbench.',
      {
        expectedInputSha256: normalized.expectedInputSha256,
        actualInputSha256: identity.sha256,
      },
      'safety',
    ));
  }

  const uploadResult = processMusicXmlUpload({
    fileName: normalized.fileName,
    bytes: normalized.bytes,
  }, { processing: processingOptions }, runtime);
  if (uploadResult.status !== MUSICXML_UPLOAD_STATUS.PASS) {
    return deepFreeze({
      documentType: MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
      contractVersion: MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
      status: MUSICXML_NOTE_EDIT_STATUS.BLOCKED,
      route: uploadResult.route,
      input: identity,
      edit: null,
      preflight: clonePlainData(uploadResult.preflight),
      canonicalTabResult: null,
      musicXml: null,
    });
  }
  if (uploadResult.route !== MUSICXML_UPLOAD_ROUTE.MONO_V1) {
    return blocked(identity, uploadResult.route, issue(
      'EDIT_ROUTE_NOT_SUPPORTED',
      'Structured pitch editing is currently enabled only for the monophonic v1 route.',
      {
        route: uploadResult.route,
        measureIndex: normalized.command.measureIndex,
        eventIndex: normalized.command.eventIndex,
        eventId: normalized.command.eventId,
      },
      'capability',
    ));
  }

  let processing;
  try {
    processing = resolveProcessingRuntime(processingOptions, runtime);
    processing.checkpoint('app-note-edit:start', {
      measureIndex: normalized.command.measureIndex,
      eventIndex: normalized.command.eventIndex,
    });
    const inspection = inspectMusicXml(normalized.bytes, {}, processing);
    if (!inspection.preflight.canProcess || !inspection.parsedNotes) {
      return deepFreeze({
        documentType: MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
        contractVersion: MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
        status: MUSICXML_NOTE_EDIT_STATUS.BLOCKED,
        route: MUSICXML_UPLOAD_ROUTE.MONO_V1,
        input: identity,
        edit: null,
        preflight: clonePlainData(inspection.preflight),
        canonicalTabResult: null,
        musicXml: null,
      });
    }

    const revisedParsed = clonePlainData(inspection.parsedNotes);
    const measure = revisedParsed.measures[normalized.command.measureIndex];
    const event = measure?.events?.[normalized.command.eventIndex];
    if (!measure || !event) {
      return blocked(identity, MUSICXML_UPLOAD_ROUTE.MONO_V1, issue(
        'EDIT_TARGET_NOT_FOUND',
        'The selected note no longer exists at the requested measure/event location.',
        normalized.command,
      ));
    }
    if (event.eventId !== normalized.command.eventId) {
      return blocked(identity, MUSICXML_UPLOAD_ROUTE.MONO_V1, issue(
        'EDIT_TARGET_IDENTITY_MISMATCH',
        'The selected event identity no longer matches the requested location.',
        {
          measureIndex: normalized.command.measureIndex,
          eventIndex: normalized.command.eventIndex,
          eventId: normalized.command.eventId,
          actualEventId: event.eventId,
        },
        'safety',
      ));
    }
    if (event.type !== 'note') {
      return blocked(identity, MUSICXML_UPLOAD_ROUTE.MONO_V1, issue(
        'EDIT_TARGET_NOT_NOTE',
        'Only note events can receive a pitch edit.',
        {
          measure: measure.number,
          measureIndex: normalized.command.measureIndex,
          eventIndex: normalized.command.eventIndex,
          eventId: normalized.command.eventId,
          eventType: event.type,
        },
        'capability',
      ));
    }

    const beforePitch = clonePlainData(event.pitch);
    event.pitch = clonePlainData(normalized.command.pitch);
    const edit = {
      commandType: 'REPLACE_PITCH',
      measureIndex: normalized.command.measureIndex,
      visibleMeasureNumber: measure.number,
      eventIndex: normalized.command.eventIndex,
      eventId: normalized.command.eventId,
      beforePitch,
      afterPitch: clonePlainData(normalized.command.pitch),
      changed: beforePitch.step !== normalized.command.pitch.step
        || beforePitch.alter !== normalized.command.pitch.alter
        || beforePitch.octave !== normalized.command.pitch.octave,
    };

    processing.checkpoint('app-note-edit:canonical:start', {
      measureIndex: normalized.command.measureIndex,
      eventIndex: normalized.command.eventIndex,
    });
    const canonicalDocument = createCanonicalMusicDocument(revisedParsed);
    const canonicalTabResult = createCanonicalTabResult(canonicalDocument, {}, processing);
    const musicXml = serializeCanonicalTabResultToMusicXml(canonicalTabResult);
    processing.checkpoint('app-note-edit:complete', {
      measureIndex: normalized.command.measureIndex,
      eventIndex: normalized.command.eventIndex,
    });

    return deepFreeze({
      documentType: MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
      contractVersion: MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
      status: MUSICXML_NOTE_EDIT_STATUS.PASS,
      route: MUSICXML_UPLOAD_ROUTE.MONO_V1,
      input: identity,
      edit,
      preflight: clonePlainData(inspection.preflight),
      canonicalTabResult,
      musicXml,
    });
  } catch (error) {
    return blocked(identity, MUSICXML_UPLOAD_ROUTE.MONO_V1, issueFromError(error), {
      commandType: 'REPLACE_PITCH',
      measureIndex: normalized.command.measureIndex,
      eventIndex: normalized.command.eventIndex,
      eventId: normalized.command.eventId,
    });
  }
}

module.exports = {
  MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
  MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
  MUSICXML_NOTE_EDIT_STATUS,
  MusicXmlNoteEditRuntimeError,
  processMusicXmlNoteEdit,
};
