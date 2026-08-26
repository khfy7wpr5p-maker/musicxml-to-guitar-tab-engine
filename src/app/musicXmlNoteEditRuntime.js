'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { resolveProcessingRuntime } = require('../core/processingRuntime');
const { inspectMusicXml } = require('../validation/musicxmlPreflight');
const { DEFAULT_MAX_XML_BYTES } = require('../validation/xmlSafety');
const { createCanonicalMusicDocument } = require('../music/canonicalMusicDocument');
const { pitchToMidi, validatePitchComponents } = require('../music/pitch');
const {
  STANDARD_GUITAR_WORKBENCH_TARGET,
} = require('../guitar/standardGuitarRegister');
const { createCanonicalTabResult } = require('../tab/canonicalTabResult');
const { serializeCanonicalTabResultToMusicXml } = require('../writers/canonicalTabMusicXmlWriter');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('./musicXmlUploadRuntime');

const MUSICXML_NOTE_EDIT_RUNTIME_VERSION = '1.1.0';
const MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE = 'MusicXmlNoteEditRuntimeResult';
const MUSICXML_NOTE_EDIT_STATUS = Object.freeze({ PASS: 'PASS', BLOCKED: 'BLOCKED' });
const MAX_FILE_NAME_LENGTH = 255;
const MAX_REVISION_COMMANDS = 128;
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
  if (byteLength > DEFAULT_MAX_XML_BYTES) return { bytes: null, byteLength };

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
  try {
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
  } catch (error) {
    throw invalidRequest('command.pitch is outside the supported pitch contract.', {
      field: 'command.pitch',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeCommand(command, revisionIndex) {
  const descriptors = ownDataProperties(
    command,
    `commands[${revisionIndex}]`,
    new Set(['measureIndex', 'eventIndex', 'eventId', 'pitch']),
  );
  const measureIndex = descriptors.measureIndex.value;
  const eventIndex = descriptors.eventIndex.value;
  const eventId = descriptors.eventId.value;
  if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {
    throw invalidRequest('command.measureIndex must be a non-negative safe integer.', {
      revisionIndex,
      field: 'measureIndex',
    });
  }
  if (!Number.isSafeInteger(eventIndex) || eventIndex < 0) {
    throw invalidRequest('command.eventIndex must be a non-negative safe integer.', {
      revisionIndex,
      field: 'eventIndex',
    });
  }
  if (typeof eventId !== 'string' || !/^m[1-9]\d*-e\d+$/.test(eventId)) {
    throw invalidRequest('command.eventId must be a deterministic monophonic event id.', {
      revisionIndex,
      field: 'eventId',
    });
  }
  const expectedEventId = `m${measureIndex + 1}-e${eventIndex}`;
  if (eventId !== expectedEventId) {
    throw invalidRequest('command event identity fields do not agree.', {
      revisionIndex,
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

function normalizeCommands(commands) {
  if (!Array.isArray(commands) || isProxy(commands)) {
    throw invalidRequest('commands must be a non-proxy array.', { field: 'commands' });
  }
  const descriptors = Object.getOwnPropertyDescriptors(commands);
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) {
    throw invalidRequest('commands must have an intrinsic array length.', { field: 'commands' });
  }
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_REVISION_COMMANDS) {
    throw invalidRequest(`commands must contain 1-${MAX_REVISION_COMMANDS} revisions.`, {
      field: 'commands',
      length,
    });
  }
  for (const key of Reflect.ownKeys(commands)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) {
      throw invalidRequest('commands contains an unsupported own property.', {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }
  }

  const normalized = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidRequest('commands must be dense and contain only data elements.', {
        field: `commands[${index}]`,
      });
    }
    normalized.push(normalizeCommand(descriptor.value, index));
  }
  return Object.freeze(normalized);
}

function normalizeRequest(request) {
  const descriptors = ownDataProperties(
    request,
    'request',
    new Set(['fileName', 'bytes', 'expectedInputSha256', 'commands']),
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
  return {
    fileName,
    expectedInputSha256,
    commands: normalizeCommands(descriptors.commands.value),
    ...snapshotBytes(descriptors.bytes.value),
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

function issueFromError(error, fallbackDetails = {}) {
  const details = error && typeof error.details === 'object' && error.details
    ? { ...fallbackDetails, ...error.details }
    : { ...fallbackDetails };
  const code = typeof error?.code === 'string' ? error.code : 'NOTE_EDIT_FAILED';
  const category = code.startsWith('UNPLAYABLE_')
    ? 'playability'
    : code.startsWith('UNSUPPORTED_') || code.endsWith('_NOT_SUPPORTED')
      ? 'capability'
      : 'content';
  return issue(code, error instanceof Error ? error.message : 'Note edit failed.', details, category);
}

function blocked(identity, route, blockingIssue, revision = null) {
  return deepFreeze({
    documentType: MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
    contractVersion: MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
    status: MUSICXML_NOTE_EDIT_STATUS.BLOCKED,
    route,
    input: identity,
    revision,
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

function samePitch(left, right) {
  return Boolean(
    left
    && right
    && left.step === right.step
    && left.alter === right.alter
    && left.octave === right.octave
    && left.midi === right.midi,
  );
}

function flattenEventReferences(parsedDocument) {
  const references = [];
  for (let measureIndex = 0; measureIndex < parsedDocument.measures.length; measureIndex += 1) {
    const measure = parsedDocument.measures[measureIndex];
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      references.push({
        measure,
        event: measure.events[eventIndex],
        measureIndex,
        eventIndex,
      });
    }
  }
  return references;
}

function areTieAdjacent(left, right) {
  if (!left || !right) return false;
  const leftEnd = left.event.start.divisions + left.event.rhythm.durationDivisions;
  if (left.measureIndex === right.measureIndex) {
    return leftEnd === right.event.start.divisions;
  }
  return Boolean(
    right.measureIndex === left.measureIndex + 1
    && leftEnd === left.measure.actualDurationDivisions
    && right.event.start.divisions === 0,
  );
}

function invalidTieChain(message, details) {
  return new MusicXmlNoteEditRuntimeError(message, 'INVALID_TIE_CHAIN', details);
}

function resolveTieChain(revisedParsed, targetRef, baseDetails) {
  const { event } = targetRef;
  if (!event.rhythm?.tieStart && !event.rhythm?.tieStop) return [targetRef];

  const references = flattenEventReferences(revisedParsed);
  let cursor = references.findIndex((candidate) => candidate.event === event);
  if (cursor < 0) {
    throw invalidTieChain('The tied-note target is not present in the parsed event sequence.', baseDetails);
  }

  let first = cursor;
  while (references[first].event.rhythm?.tieStop) {
    const current = references[first];
    const previous = references[first - 1];
    if (
      !previous
      || previous.event.type !== 'note'
      || !previous.event.rhythm?.tieStart
      || !samePitch(previous.event.pitch, current.event.pitch)
      || !areTieAdjacent(previous, current)
    ) {
      throw invalidTieChain(
        'Tie-stop event does not have one immediately adjacent matching tie-start predecessor.',
        {
          ...baseDetails,
          chainEventId: current.event.eventId,
          chainMeasureIndex: current.measureIndex,
          chainEventIndex: current.eventIndex,
        },
      );
    }
    first -= 1;
  }

  let last = cursor;
  while (references[last].event.rhythm?.tieStart) {
    const current = references[last];
    const next = references[last + 1];
    if (
      !next
      || next.event.type !== 'note'
      || !next.event.rhythm?.tieStop
      || !samePitch(current.event.pitch, next.event.pitch)
      || !areTieAdjacent(current, next)
    ) {
      throw invalidTieChain(
        'Tie-start event does not have one immediately adjacent matching tie-stop successor.',
        {
          ...baseDetails,
          chainEventId: current.event.eventId,
          chainMeasureIndex: current.measureIndex,
          chainEventIndex: current.eventIndex,
        },
      );
    }
    last += 1;
  }

  const chain = references.slice(first, last + 1);
  if (chain.length < 2) {
    throw invalidTieChain('A tied note must resolve to at least two adjacent note events.', baseDetails);
  }
  for (let index = 0; index < chain.length; index += 1) {
    const member = chain[index];
    if (member.event.type !== 'note' || !samePitch(member.event.pitch, event.pitch)) {
      throw invalidTieChain('Tie-chain members must remain pitch-identical note events.', {
        ...baseDetails,
        chainEventId: member.event.eventId,
        chainMeasureIndex: member.measureIndex,
        chainEventIndex: member.eventIndex,
      });
    }
    const expectedStop = index > 0;
    const expectedStart = index < chain.length - 1;
    if (
      Boolean(member.event.rhythm?.tieStop) !== expectedStop
      || Boolean(member.event.rhythm?.tieStart) !== expectedStart
    ) {
      throw invalidTieChain('Tie-chain start/stop markers are not internally consistent.', {
        ...baseDetails,
        chainEventId: member.event.eventId,
        chainMeasureIndex: member.measureIndex,
        chainEventIndex: member.eventIndex,
      });
    }
  }
  return chain;
}

function applyRevisionCommand(revisedParsed, command, revisionIndex) {
  const measure = revisedParsed.measures[command.measureIndex];
  const event = measure?.events?.[command.eventIndex];
  const baseDetails = {
    revisionIndex,
    measure: measure?.number ?? null,
    measureIndex: command.measureIndex,
    eventIndex: command.eventIndex,
    eventId: command.eventId,
  };

  if (!measure || !event) {
    throw new MusicXmlNoteEditRuntimeError(
      'The selected note no longer exists at the requested measure/event location.',
      'EDIT_TARGET_NOT_FOUND',
      baseDetails,
    );
  }
  if (event.eventId !== command.eventId) {
    throw new MusicXmlNoteEditRuntimeError(
      'The selected event identity no longer matches the requested location.',
      'EDIT_TARGET_IDENTITY_MISMATCH',
      { ...baseDetails, actualEventId: event.eventId },
    );
  }
  if (event.type !== 'note') {
    throw new MusicXmlNoteEditRuntimeError(
      'Only note events can receive a pitch edit.',
      'EDIT_TARGET_NOT_NOTE',
      { ...baseDetails, eventType: event.type },
    );
  }

  const targetRef = { measure, event, measureIndex: command.measureIndex, eventIndex: command.eventIndex };
  const chain = resolveTieChain(revisedParsed, targetRef, baseDetails);
  const beforePitch = clonePlainData(event.pitch);
  const affectedEvents = chain.map((member) => {
    const memberBefore = clonePlainData(member.event.pitch);
    member.event.pitch = clonePlainData(command.pitch);
    return {
      measureIndex: member.measureIndex,
      visibleMeasureNumber: member.measure.number,
      eventIndex: member.eventIndex,
      eventId: member.event.eventId,
      beforePitch: memberBefore,
      afterPitch: clonePlainData(command.pitch),
    };
  });

  return {
    revisionIndex,
    commandType: chain.length > 1 ? 'REPLACE_TIE_CHAIN_PITCH' : 'REPLACE_PITCH',
    measureIndex: command.measureIndex,
    visibleMeasureNumber: measure.number,
    eventIndex: command.eventIndex,
    eventId: command.eventId,
    beforePitch,
    afterPitch: clonePlainData(command.pitch),
    affectedEventCount: affectedEvents.length,
    affectedEvents,
    changed: beforePitch.step !== command.pitch.step
      || beforePitch.alter !== command.pitch.alter
      || beforePitch.octave !== command.pitch.octave,
  };
}

function selectedPositionFor(canonicalTabResult, affectedEvent) {
  const event = canonicalTabResult.measures?.[affectedEvent.measureIndex]?.events?.[affectedEvent.eventIndex];
  if (!event || event.eventId !== affectedEvent.eventId || event.type !== 'note') {
    throw new MusicXmlNoteEditRuntimeError(
      'Tie-chain event identity changed during canonical regeneration.',
      'TIE_CHAIN_REGENERATION_MISMATCH',
      affectedEvent,
    );
  }
  return event.selectedPosition;
}

function assertTieChainFingeringContinuity(canonicalTabResult, appliedEdits) {
  for (const edit of appliedEdits) {
    if (edit.commandType !== 'REPLACE_TIE_CHAIN_PITCH') continue;
    const positions = edit.affectedEvents.map((member) => selectedPositionFor(canonicalTabResult, member));
    const first = positions[0];
    if (!first || !Number.isSafeInteger(first.string) || !Number.isSafeInteger(first.fret)) {
      throw new MusicXmlNoteEditRuntimeError(
        'Regenerated tie chain is missing a concrete guitar position.',
        'TIE_CHAIN_FINGERING_INCONSISTENT',
        { revisionIndex: edit.revisionIndex, eventId: edit.eventId },
      );
    }
    for (let index = 1; index < positions.length; index += 1) {
      if (!positions[index] || positions[index].string !== first.string || positions[index].fret !== first.fret) {
        throw new MusicXmlNoteEditRuntimeError(
          'Regenerated tie-chain members must remain on one guitar string and fret.',
          'TIE_CHAIN_FINGERING_INCONSISTENT',
          {
            revisionIndex: edit.revisionIndex,
            eventId: edit.eventId,
            affectedEventCount: positions.length,
          },
        );
      }
    }
  }
}

function processMusicXmlNoteEdit(request, options = {}, runtime = null) {
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
      'The revision does not match the immutable MusicXML source currently owned by this workbench session.',
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
      revision: null,
      preflight: clonePlainData(uploadResult.preflight),
      canonicalTabResult: null,
      musicXml: null,
    });
  }
  if (uploadResult.route !== MUSICXML_UPLOAD_ROUTE.MONO_V1) {
    return blocked(identity, uploadResult.route, issue(
      'EDIT_ROUTE_NOT_SUPPORTED',
      'Structured pitch revisions are currently enabled only for the monophonic v1 route.',
      { route: uploadResult.route },
      'capability',
    ));
  }

  let processing;
  try {
    processing = resolveProcessingRuntime(processingOptions, runtime);
    processing.checkpoint('app-note-edit:start', {
      revisionCount: normalized.commands.length,
    });
    const inspection = inspectMusicXml(normalized.bytes, {}, processing);
    if (!inspection.preflight.canProcess || !inspection.parsedNotes) {
      return deepFreeze({
        documentType: MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
        contractVersion: MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
        status: MUSICXML_NOTE_EDIT_STATUS.BLOCKED,
        route: MUSICXML_UPLOAD_ROUTE.MONO_V1,
        input: identity,
        revision: null,
        preflight: clonePlainData(inspection.preflight),
        canonicalTabResult: null,
        musicXml: null,
      });
    }

    const revisedParsed = clonePlainData(inspection.parsedNotes);
    const appliedEdits = [];
    for (let index = 0; index < normalized.commands.length; index += 1) {
      processing.checkpoint('app-note-edit:apply-command', { revisionIndex: index });
      appliedEdits.push(applyRevisionCommand(revisedParsed, normalized.commands[index], index));
    }

    processing.checkpoint('app-note-edit:canonical:start', {
      revisionCount: normalized.commands.length,
    });
    const canonicalDocument = createCanonicalMusicDocument(revisedParsed);
    const canonicalTabResult = createCanonicalTabResult(
      canonicalDocument,
      { guitar: STANDARD_GUITAR_WORKBENCH_TARGET },
      processing,
    );
    assertTieChainFingeringContinuity(canonicalTabResult, appliedEdits);
    const musicXml = serializeCanonicalTabResultToMusicXml(canonicalTabResult);
    processing.checkpoint('app-note-edit:complete', {
      revisionCount: normalized.commands.length,
    });

    return deepFreeze({
      documentType: MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
      contractVersion: MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
      status: MUSICXML_NOTE_EDIT_STATUS.PASS,
      route: MUSICXML_UPLOAD_ROUTE.MONO_V1,
      input: identity,
      revision: {
        revisionNumber: normalized.commands.length,
        commands: normalized.commands.map(clonePlainData),
        appliedEdits,
      },
      preflight: clonePlainData(inspection.preflight),
      canonicalTabResult,
      musicXml,
    });
  } catch (error) {
    return blocked(
      identity,
      MUSICXML_UPLOAD_ROUTE.MONO_V1,
      issueFromError(error),
      {
        revisionNumber: normalized.commands.length,
        commands: normalized.commands.map(clonePlainData),
      },
    );
  }
}

module.exports = {
  MUSICXML_NOTE_EDIT_RUNTIME_VERSION,
  MUSICXML_NOTE_EDIT_RUNTIME_DOCUMENT_TYPE,
  MUSICXML_NOTE_EDIT_STATUS,
  MAX_REVISION_COMMANDS,
  MusicXmlNoteEditRuntimeError,
  processMusicXmlNoteEdit,
};
