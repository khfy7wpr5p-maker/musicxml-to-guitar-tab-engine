'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { resolveProcessingRuntime } = require('../core/processingRuntime');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlThroughPolyProductionCompatibilityChain,
} = require('./polyProductionCompatibilityNormalizationChain');
const {
  createPolyphonicSourceModel,
} = require('../music/polyphonicSourceModel');
const {
  createSimultaneousEventModel,
} = require('../music/simultaneousEventModel');
const { createSustainTieGraph } = require('../music/sustainTieGraph');
const { pitchToMidi, validatePitchComponents } = require('../music/pitch');
const { createCanonicalTabResultV2 } = require('../tab/canonicalTabResultV2');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriterV2');
const { DEFAULT_MAX_XML_BYTES } = require('../validation/xmlSafety');
const {
  MUSICXML_UPLOAD_ROUTE,
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('./musicXmlUploadRuntime');
const {
  tryProjectExactTabStaffMirror,
} = require('./exactTabStaffMirrorNormalizer');
const {
  extractBasicMusicXmlHarmony,
  resolveBasicMusicXmlHarmonyReferences,
} = require('./basicMusicXmlHarmonyExtractor');
const { createBasicChordLabelModel } = require('../music/basicChordLabelModel');
const { createGuitarArrangementRegister } = require('../guitar/guitarArrangementRegister');
const { recoverPartialGuitarArrangement } = require('./partialGuitarArrangement');
const { decorateUploadResultWithCapabilities } = require('./reviewRequiredCapabilityContract');

const MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION = '1.3.0';
const MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_DOCUMENT_TYPE = 'MusicXmlPolyphonicNoteEditRuntimeV2Result';
const MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS = Object.freeze({
  PASS: 'PASS',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
});
const MAX_FILE_NAME_LENGTH = 255;
const MAX_REVISION_COMMANDS = 128;
const MAX_ACKNOWLEDGED_GROUP_EVENTS = 64;
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

class MusicXmlPolyphonicNoteEditRuntimeV2Error extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_EDIT_REQUEST', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'MusicXmlPolyphonicNoteEditRuntimeV2Error');
  }
}

function invalidRequest(message, details = {}) {
  return new MusicXmlPolyphonicNoteEditRuntimeV2Error(
    message,
    'INVALID_POLYPHONIC_EDIT_REQUEST',
    details,
  );
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
    return {
      bytes: Buffer.from(new Uint8Array(backingBuffer, byteOffset, byteLength)),
      byteLength,
    };
  } catch {
    throw invalidRequest('bytes must be an attached Buffer or Uint8Array.', { field: 'bytes' });
  }
}

function normalizePitch(pitch, field) {
  const descriptors = ownDataProperties(
    pitch,
    field,
    new Set(['step', 'alter', 'octave']),
  );
  const step = descriptors.step.value;
  const alter = descriptors.alter.value;
  const octave = descriptors.octave.value;
  if (typeof step !== 'string' || !/^[A-G]$/.test(step)) {
    throw invalidRequest(`${field}.step must be uppercase A through G.`, { field: `${field}.step` });
  }
  if (!Number.isSafeInteger(alter) || alter < -2 || alter > 2) {
    throw invalidRequest(`${field}.alter must be an integer from -2 through 2.`, {
      field: `${field}.alter`,
    });
  }
  if (!Number.isSafeInteger(octave)) {
    throw invalidRequest(`${field}.octave must be a safe integer.`, { field: `${field}.octave` });
  }
  try {
    validatePitchComponents(step, alter, octave);
    const midi = pitchToMidi({ step, alter, octave });
    const accidental = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[alter];
    return Object.freeze({ step, alter, octave, midi, written: `${step}${accidental}${octave}` });
  } catch (error) {
    throw invalidRequest(`${field} is outside the supported pitch contract.`, {
      field,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeSelectedPosition(position, field) {
  const descriptors = ownDataProperties(
    position,
    field,
    new Set(['string', 'fret']),
  );
  const string = descriptors.string.value;
  const fret = descriptors.fret.value;
  if (!Number.isSafeInteger(string) || string < 1 || string > 6) {
    throw invalidRequest(`${field}.string must be an integer from 1 through 6.`, {
      field: `${field}.string`,
    });
  }
  if (!Number.isSafeInteger(fret) || fret < 0 || fret > 20) {
    throw invalidRequest(`${field}.fret must be an integer from 0 through 20.`, {
      field: `${field}.fret`,
    });
  }
  return Object.freeze({ string, fret });
}

function normalizeGroupEventIds(value, field) {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalidRequest(`${field} must be a non-proxy ordinary array.`, { field });
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (
    !Number.isSafeInteger(length)
    || length < 1
    || length > MAX_ACKNOWLEDGED_GROUP_EVENTS
  ) {
    throw invalidRequest(`${field} must contain 1-${MAX_ACKNOWLEDGED_GROUP_EVENTS} event ids.`, {
      field,
      length,
    });
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
      throw invalidRequest(`${field} must not contain custom properties.`, { field });
    }
  }
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidRequest(`${field} must be dense and accessor-free.`, { field, index });
    }
    const item = descriptor.value;
    if (typeof item !== 'string' || item.length === 0 || item.length > 256) {
      throw invalidRequest(`${field} contains an invalid event id.`, { field, index });
    }
    result.push(item);
  }
  if (new Set(result).size !== result.length) {
    throw invalidRequest(`${field} must not contain duplicate event ids.`, { field });
  }
  return Object.freeze(result);
}

function normalizeCommand(command, revisionIndex) {
  const field = `commands[${revisionIndex}]`;
  const descriptors = ownDataProperties(
    command,
    field,
    new Set([
      'measureIndex',
      'sourceOrder',
      'sourceEventId',
      'sourceGroupId',
      'sourceGroupEventIds',
      'sourceTieEventIds',
      'pitch',
      'selectedPosition',
      'durationDivisions',
    ]),
    new Set([
      'measureIndex',
      'sourceOrder',
      'sourceEventId',
      'sourceGroupId',
      'sourceGroupEventIds',
      'pitch',
    ]),
  );
  const measureIndex = descriptors.measureIndex.value;
  const sourceOrder = descriptors.sourceOrder.value;
  const sourceEventId = descriptors.sourceEventId.value;
  const sourceGroupId = descriptors.sourceGroupId.value;
  if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {
    throw invalidRequest(`${field}.measureIndex must be a non-negative safe integer.`, {
      revisionIndex,
      field: 'measureIndex',
    });
  }
  if (!Number.isSafeInteger(sourceOrder) || sourceOrder < 0) {
    throw invalidRequest(`${field}.sourceOrder must be a non-negative safe integer.`, {
      revisionIndex,
      field: 'sourceOrder',
    });
  }
  if (typeof sourceEventId !== 'string' || sourceEventId.length === 0 || sourceEventId.length > 256) {
    throw invalidRequest(`${field}.sourceEventId must be a bounded non-empty string.`, {
      revisionIndex,
      field: 'sourceEventId',
    });
  }
  if (
    sourceGroupId !== null
    && (typeof sourceGroupId !== 'string' || sourceGroupId.length === 0 || sourceGroupId.length > 256)
  ) {
    throw invalidRequest(`${field}.sourceGroupId must be null or a bounded non-empty string.`, {
      revisionIndex,
      field: 'sourceGroupId',
    });
  }
  return Object.freeze({
    measureIndex,
    sourceOrder,
    sourceEventId,
    sourceGroupId,
    sourceGroupEventIds: normalizeGroupEventIds(
      descriptors.sourceGroupEventIds.value,
      `${field}.sourceGroupEventIds`,
    ),
    ...(Object.hasOwn(descriptors, 'sourceTieEventIds') ? {
      sourceTieEventIds: normalizeGroupEventIds(
        descriptors.sourceTieEventIds.value,
        `${field}.sourceTieEventIds`,
      ),
    } : {}),
    pitch: normalizePitch(descriptors.pitch.value, `${field}.pitch`),
    ...(Object.hasOwn(descriptors, 'selectedPosition') ? {
      selectedPosition: normalizeSelectedPosition(
        descriptors.selectedPosition.value,
        `${field}.selectedPosition`,
      ),
    } : {}),
    ...(Object.hasOwn(descriptors, 'durationDivisions') ? {
      durationDivisions: (() => {
        const value = descriptors.durationDivisions.value;
        if (!Number.isSafeInteger(value) || value <= 0) {
          throw invalidRequest(`${field}.durationDivisions must be a positive safe integer.`, {
            revisionIndex,
            field: 'durationDivisions',
          });
        }
        return value;
      })(),
    } : {}),
  });
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands) || isProxy(commands) || Object.getPrototypeOf(commands) !== Array.prototype) {
    throw invalidRequest('commands must be a non-proxy ordinary array.', { field: 'commands' });
  }
  const descriptors = Object.getOwnPropertyDescriptors(commands);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_REVISION_COMMANDS) {
    throw invalidRequest(`commands must contain 1-${MAX_REVISION_COMMANDS} revisions.`, {
      field: 'commands',
      length,
    });
  }
  for (const key of Reflect.ownKeys(commands)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
      throw invalidRequest('commands must not contain custom properties.', { field: 'commands' });
    }
  }
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidRequest('commands must be dense and accessor-free.', {
        field: `commands[${index}]`,
      });
    }
    result.push(normalizeCommand(descriptor.value, index));
  }
  return Object.freeze(result);
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

function identity(fileName, byteLength, bytes) {
  return Object.freeze({
    fileName,
    byteLength,
    sha256: bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex'),
  });
}

function issue(code, message, details = {}, category = 'content') {
  return {
    severity: 'error',
    category,
    code,
    message,
    location: {
      measure: details.measureNumber ?? details.measure ?? null,
      measureIndex: details.measureIndex ?? null,
      eventIndex: details.sourceOrder ?? details.eventIndex ?? null,
      sourceEventId: details.sourceEventId ?? null,
    },
    details: { ...details },
  };
}

function issueFromError(error, fallback = {}) {
  const details = error && typeof error.details === 'object' && error.details
    ? { ...fallback, ...error.details }
    : { ...fallback };
  const code = typeof error?.code === 'string' ? error.code : 'POLYPHONIC_NOTE_EDIT_FAILED';
  const category = code.startsWith('UNPLAYABLE_') || code.includes('PLAYABILITY')
    ? 'playability'
    : code.startsWith('UNSUPPORTED_') || code.endsWith('_NOT_SUPPORTED')
      ? 'capability'
      : code.includes('STALE') || code.includes('IDENTITY') || code.includes('GROUP_')
        ? 'safety'
        : 'content';
  return issue(code, error instanceof Error ? error.message : 'Polyphonic note edit failed.', details, category);
}

function blocked(inputIdentity, route, blockingIssue, revision = null) {
  return deepFreeze({
    documentType: MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_DOCUMENT_TYPE,
    contractVersion: MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION,
    status: MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED,
    route,
    input: inputIdentity,
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

function projectEditableSource(bytes, processing) {
  processing.checkpoint('app-poly-note-edit:parse:start');
  const rawParsedDocument = parseParsedMusicXmlDocument(bytes, {}, processing);
  const harmonyExtraction = extractBasicMusicXmlHarmony(rawParsedDocument, processing);
  const parsedDocument = harmonyExtraction.parsedDocument;
  const mirror = tryProjectExactTabStaffMirror(parsedDocument, processing);
  let runtimeProjection = null;
  let sourceModel;
  if (mirror) {
    sourceModel = mirror.sourceModel;
  } else {
    runtimeProjection = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(
      parsedDocument,
      processing,
    );
    sourceModel = runtimeProjection.mainSourceModel;
  }
  processing.checkpoint('app-poly-note-edit:parse:complete', {
    measureCount: sourceModel.measureCount,
    eventCount: sourceModel.eventCount,
    tabStaffMirrorCollapsed: Boolean(mirror),
    runtimeGuitarNotationNormalized: Boolean(runtimeProjection),
  });
  return {
    sourceModel,
    tabStaffMirrorCollapsed: Boolean(mirror),
    notationContext: runtimeProjection?.notationContext ?? null,
    graceOrnamentGroups: runtimeProjection?.graceOrnamentGroups ?? [],
    explicitHarmonyFacts: resolveBasicMusicXmlHarmonyReferences(
      harmonyExtraction.references,
      sourceModel,
    ),
  };
}

function createGroupIdentityIndex(sourceModel, processing) {
  const grouping = createSimultaneousEventModel(sourceModel, processing);
  const bySourceEventId = new Map();
  for (const measure of grouping.measures) {
    for (const group of measure.groups) {
      if (group.sourceEventIds.length > MAX_ACKNOWLEDGED_GROUP_EVENTS) {
        throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
          'A simultaneous source group exceeds the edit acknowledgement boundary.',
          'EDIT_SOURCE_GROUP_TOO_LARGE',
          {
            sourceGroupId: group.groupId,
            observed: group.sourceEventIds.length,
            limit: MAX_ACKNOWLEDGED_GROUP_EVENTS,
          },
        );
      }
      for (const sourceEventId of group.sourceEventIds) {
        bySourceEventId.set(sourceEventId, group);
      }
    }
  }
  return bySourceEventId;
}

function createTieIdentityIndex(sourceModel, processing) {
  const graph = createSustainTieGraph(sourceModel, processing);
  const bySourceEventId = new Map();
  for (const chain of graph.chains) {
    for (const sourceEventId of chain.sourceEventIds) {
      bySourceEventId.set(sourceEventId, chain);
    }
  }
  return bySourceEventId;
}

function assertExactGroupIdentity(command, event, group, revisionIndex) {
  const expectedGroupId = group ? group.groupId : null;
  const expectedIds = group ? [...group.sourceEventIds] : [event.sourceEventId];
  if (command.sourceGroupId !== expectedGroupId) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Edit command does not acknowledge the current simultaneous-group identity.',
      'EDIT_SOURCE_GROUP_IDENTITY_MISMATCH',
      {
        revisionIndex,
        sourceEventId: event.sourceEventId,
        expectedSourceGroupId: expectedGroupId,
        actualSourceGroupId: command.sourceGroupId,
      },
    );
  }
  if (
    command.sourceGroupEventIds.length !== expectedIds.length
    || command.sourceGroupEventIds.some((value, index) => value !== expectedIds[index])
  ) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Edit command does not acknowledge every member of the current simultaneous group.',
      'EDIT_SOURCE_GROUP_MEMBERSHIP_MISMATCH',
      {
        revisionIndex,
        sourceEventId: event.sourceEventId,
        sourceGroupId: expectedGroupId,
        expectedSourceGroupEventIds: expectedIds,
        actualSourceGroupEventIds: [...command.sourceGroupEventIds],
      },
    );
  }
}

function applyCommand(revisedSource, groupIndex, tieIndex, command, revisionIndex) {
  const measure = revisedSource.measures[command.measureIndex];
  const event = measure?.events?.[command.sourceOrder];
  const details = {
    revisionIndex,
    measureIndex: command.measureIndex,
    measureNumber: measure?.number ?? null,
    sourceOrder: command.sourceOrder,
    sourceEventId: command.sourceEventId,
  };
  if (!measure || !event) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'The selected polyphonic source event no longer exists.',
      'EDIT_SOURCE_EVENT_NOT_FOUND',
      details,
    );
  }
  if (event.sourceOrder !== command.sourceOrder || event.sourceEventId !== command.sourceEventId) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'The selected polyphonic source-event identity no longer matches its location.',
      'EDIT_SOURCE_EVENT_IDENTITY_MISMATCH',
      {
        ...details,
        actualSourceOrder: event.sourceOrder,
        actualSourceEventId: event.sourceEventId,
      },
    );
  }
  if (event.type !== 'note') {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Only pitched source events can receive a polyphonic pitch edit.',
      'EDIT_SOURCE_EVENT_NOT_NOTE',
      { ...details, eventType: event.type },
    );
  }

  const group = groupIndex.get(event.sourceEventId) || null;
  assertExactGroupIdentity(command, event, group, revisionIndex);

  const tieChain = tieIndex.get(event.sourceEventId) || null;
  const expectedTieEventIds = tieChain
    ? [...tieChain.sourceEventIds]
    : [event.sourceEventId];
  const actualTieEventIds = command.sourceTieEventIds
    ? [...command.sourceTieEventIds]
    : [event.sourceEventId];
  if (
    actualTieEventIds.length !== expectedTieEventIds.length
    || actualTieEventIds.some((value, index) => value !== expectedTieEventIds[index])
  ) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Edit command does not acknowledge the complete current sustain/tie chain.',
      'EDIT_SOURCE_TIE_CHAIN_IDENTITY_MISMATCH',
      {
        ...details,
        expectedSourceTieEventIds: expectedTieEventIds,
        actualSourceTieEventIds: actualTieEventIds,
      },
    );
  }
  if (tieChain && (command.selectedPosition || command.durationDivisions !== undefined)) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Position and duration edits are not enabled for sustain/tie chains.',
      'EDIT_TIE_CHAIN_OPERATION_NOT_SUPPORTED',
      {
        ...details,
        sourceTieEventIds: expectedTieEventIds,
      },
    );
  }

  const acknowledgedIds = group ? group.sourceEventIds : [event.sourceEventId];
  const acknowledgedEvents = acknowledgedIds.map((sourceEventId) => {
    for (const candidateMeasure of revisedSource.measures) {
      const candidate = candidateMeasure.events.find((entry) => entry.sourceEventId === sourceEventId);
      if (candidate) return candidate;
    }
    return null;
  });
  if (acknowledgedEvents.some((member) => !member || member.type !== 'note')) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Acknowledged simultaneous-group membership no longer resolves to pitched source events.',
      'EDIT_SOURCE_GROUP_IDENTITY_MISMATCH',
      details,
    );
  }
  if (!tieChain && acknowledgedEvents.some((member) => member.tieStart || member.tieStop)) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Polyphonic editing of a simultaneous group containing tied notes is not enabled in this gate.',
      'EDIT_POLYPHONIC_GROUP_WITH_TIES_NOT_SUPPORTED',
      {
        ...details,
        sourceGroupId: group?.groupId ?? null,
        sourceGroupEventIds: [...acknowledgedIds],
      },
    );
  }

  const beforePitch = clonePlainData(event.pitch);
  const beforeDurationDivisions = event.durationDivisions;
  const editedEvents = tieChain
    ? expectedTieEventIds.map((sourceEventId) => {
      for (const candidateMeasure of revisedSource.measures) {
        const candidate = candidateMeasure.events.find(
          (entry) => entry.sourceEventId === sourceEventId,
        );
        if (candidate) return candidate;
      }
      return null;
    })
    : [event];
  if (editedEvents.some((member) => !member || member.type !== 'note')) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Acknowledged sustain/tie-chain membership no longer resolves to pitched source events.',
      'EDIT_SOURCE_TIE_CHAIN_IDENTITY_MISMATCH',
      details,
    );
  }
  for (const editedEvent of editedEvents) {
    editedEvent.pitch = clonePlainData(command.pitch);
  }
  if (command.durationDivisions !== undefined) {
    event.durationDivisions = command.durationDivisions;
  }
  const pitchChanged = beforePitch.step !== command.pitch.step
    || beforePitch.alter !== command.pitch.alter
    || beforePitch.octave !== command.pitch.octave;
  const durationChanged = command.durationDivisions !== undefined
    && beforeDurationDivisions !== command.durationDivisions;
  const durationRequested = command.durationDivisions !== undefined;
  let commandType = 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH';
  if (tieChain) {
    commandType = 'REPLACE_POLYPHONIC_TIE_CHAIN_PITCH';
  } else if (command.selectedPosition && durationRequested) {
    commandType = pitchChanged
      ? 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH_DURATION_AND_POSITION'
      : 'SET_POLYPHONIC_SOURCE_EVENT_DURATION_AND_POSITION';
  } else if (command.selectedPosition) {
    commandType = pitchChanged
      ? 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH_AND_POSITION'
      : 'SET_POLYPHONIC_SOURCE_EVENT_POSITION';
  } else if (durationRequested) {
    commandType = pitchChanged
      ? 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH_AND_DURATION'
      : 'SET_POLYPHONIC_SOURCE_EVENT_DURATION';
  }
  return {
    revisionIndex,
    commandType,
    measureIndex: command.measureIndex,
    measureNumber: measure.number,
    sourceOrder: command.sourceOrder,
    sourceEventId: event.sourceEventId,
    sourceGroupId: group?.groupId ?? null,
    sourceGroupEventIds: [...acknowledgedIds],
    sourceTieEventIds: expectedTieEventIds,
    affectedEventCount: editedEvents.length,
    beforePitch,
    afterPitch: clonePlainData(command.pitch),
    beforeDurationDivisions,
    afterDurationDivisions: event.durationDivisions,
    changed: pitchChanged || durationChanged || Boolean(command.selectedPosition),
    ...(command.selectedPosition ? {
      selectedPosition: clonePlainData(command.selectedPosition),
    } : {}),
  };
}

function positionOverridesFromCommands(commands) {
  const overrides = Object.create(null);
  for (const command of commands) {
    if (command.selectedPosition) {
      overrides[command.sourceEventId] = clonePlainData(command.selectedPosition);
    }
  }
  return Object.freeze(overrides);
}

function buildPreserveDecisions(sourceModel) {
  const decisions = [];
  for (const measure of sourceModel.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      decisions.push(Object.freeze({
        decisionType: 'PRESERVED',
        sourceEventIds: Object.freeze([event.sourceEventId]),
        sourceGroupId: null,
      }));
    }
  }
  return Object.freeze(decisions);
}

function buildReviewArrangementDecisions(sourceModel) {
  const register = createGuitarArrangementRegister();
  const decisions = [];
  for (const measure of sourceModel.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;
      const raisedMidi = event.pitch.midi + 12;
      if (event.pitch.midi > register.maximumMidi || (
        event.pitch.midi < register.minimumMidi
        && (raisedMidi < register.minimumMidi || raisedMidi > register.maximumMidi)
      )) {
        throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
          'Edited source pitch is outside the bounded guitar arrangement register.',
          'UNPLAYABLE_SOURCE_PITCH',
          {
            measureIndex: measure.index,
            sourceOrder: event.sourceOrder,
            sourceEventId: event.sourceEventId,
            writtenPitch: event.pitch.written,
            minimumMidi: register.minimumMidi,
            maximumMidi: register.maximumMidi,
          },
        );
      }
      decisions.push(Object.freeze({
        decisionType: event.pitch.midi < register.minimumMidi
          ? 'OCTAVE_DISPLACED'
          : 'PRESERVED',
        sourceEventIds: Object.freeze([event.sourceEventId]),
        sourceGroupId: null,
      }));
    }
  }
  return Object.freeze(decisions);
}

function assertNoSilentChange(sourceModel, canonicalTabResult) {
  const sourceNotes = sourceModel.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
  if (canonicalTabResult.noteDispositions.length !== sourceNotes.length) {
    throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
      'Polyphonic edit regeneration changed the source-note disposition count.',
      'POLYPHONIC_EDIT_UNEXPECTED_NOTE_LOSS',
      {
        sourceNoteCount: sourceNotes.length,
        dispositionCount: canonicalTabResult.noteDispositions.length,
      },
    );
  }
  const byId = new Map(canonicalTabResult.noteDispositions.map((entry) => [entry.sourceEventId, entry]));
  for (const event of sourceNotes) {
    const disposition = byId.get(event.sourceEventId);
    if (
      !disposition
      || disposition.disposition !== 'KEEP'
      || disposition.octaveShiftSemitones !== 0
      || !disposition.targetPitch
      || disposition.targetPitch.midi !== event.pitch.midi
    ) {
      throw new MusicXmlPolyphonicNoteEditRuntimeV2Error(
        'Polyphonic edit regeneration attempted a silent omission or pitch displacement.',
        'POLYPHONIC_EDIT_UNEXPECTED_MUSICAL_CHANGE',
        {
          sourceEventId: event.sourceEventId,
          sourceMidi: event.pitch.midi,
          disposition: disposition?.disposition ?? null,
          octaveShiftSemitones: disposition?.octaveShiftSemitones ?? null,
          targetMidi: disposition?.targetPitch?.midi ?? null,
        },
      );
    }
  }
}

function processMusicXmlPolyphonicNoteEditV2(request, options = {}, runtime = null) {
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
  const inputIdentity = identity(normalized.fileName, normalized.byteLength, normalized.bytes);
  if (normalized.bytes === null) {
    return blocked(inputIdentity, MUSICXML_UPLOAD_ROUTE.UNRESOLVED, issue(
      'FILE_TOO_LARGE',
      'XML input exceeds the fixed upload size limit.',
      { maxBytes: DEFAULT_MAX_XML_BYTES, byteLength: normalized.byteLength },
      'safety',
    ));
  }
  if (inputIdentity.sha256 !== normalized.expectedInputSha256) {
    return blocked(inputIdentity, MUSICXML_UPLOAD_ROUTE.UNRESOLVED, issue(
      'STALE_POLYPHONIC_EDIT_INPUT',
      'The polyphonic revision does not match the immutable MusicXML source currently owned by the session.',
      {
        expectedInputSha256: normalized.expectedInputSha256,
        actualInputSha256: inputIdentity.sha256,
      },
      'safety',
    ));
  }

  const uploadResult = processMusicXmlUpload({
    fileName: normalized.fileName,
    bytes: normalized.bytes,
  }, { processing: processingOptions }, runtime);
  if (uploadResult.status !== MUSICXML_UPLOAD_STATUS.PASS) {
    const reviewEditable = uploadResult.status === MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED
      && uploadResult.route === MUSICXML_UPLOAD_ROUTE.POLY_V2
      && (uploadResult.canonicalTabResult || uploadResult.reviewEditableProjection)
      && uploadResult.capabilities?.editPitch === true;
    if (reviewEditable) {
      // Continue below. The immutable source identity and command validation
      // remain identical; only the regenerated result keeps review authority.
    } else {
    return deepFreeze({
      documentType: MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_DOCUMENT_TYPE,
      contractVersion: MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION,
      status: MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.BLOCKED,
      route: uploadResult.route,
      input: inputIdentity,
      revision: null,
      preflight: clonePlainData(uploadResult.preflight),
      canonicalTabResult: null,
      musicXml: null,
    });
    }
  }
  if (uploadResult.route !== MUSICXML_UPLOAD_ROUTE.POLY_V2) {
    return blocked(inputIdentity, uploadResult.route, issue(
      'EDIT_ROUTE_NOT_SUPPORTED',
      'This edit contract accepts only POLY_V2 MusicXML sources.',
      { route: uploadResult.route },
      'capability',
    ));
  }

  let processing;
  try {
    processing = resolveProcessingRuntime(processingOptions, runtime);
    processing.checkpoint('app-poly-note-edit:start', { revisionCount: normalized.commands.length });
    const projected = projectEditableSource(normalized.bytes, processing);
    const sourceGroupIndex = createGroupIdentityIndex(projected.sourceModel, processing);
    const sourceTieIndex = createTieIdentityIndex(projected.sourceModel, processing);
    const revisedPlain = clonePlainData(projected.sourceModel);
    const appliedEdits = [];
    for (let index = 0; index < normalized.commands.length; index += 1) {
      processing.checkpoint('app-poly-note-edit:apply-command', { revisionIndex: index });
      appliedEdits.push(applyCommand(
        revisedPlain,
        sourceGroupIndex,
        sourceTieIndex,
        normalized.commands[index],
        index,
      ));
    }

    processing.checkpoint('app-poly-note-edit:canonical:start', {
      revisionCount: normalized.commands.length,
    });
    const revisedSourceModel = createPolyphonicSourceModel(revisedPlain, processing);
    const guitarOptions = Object.freeze({
      positionOverrides: positionOverridesFromCommands(normalized.commands),
    });
    const inputRequiresReview = uploadResult.status === MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED;
    const decisions = inputRequiresReview
      ? buildReviewArrangementDecisions(revisedSourceModel)
      : buildPreserveDecisions(revisedSourceModel);
    const chordLabels = createBasicChordLabelModel(
      revisedSourceModel,
      projected.explicitHarmonyFacts,
      processing,
    ).labels;
    const writerOptions = {
      ...(projected.notationContext ? { notationContext: projected.notationContext } : {}),
      chordLabels,
    };
    let canonicalTabResult;
    let musicXml;
    let recovery = null;
    try {
      canonicalTabResult = createCanonicalTabResultV2(
        revisedSourceModel,
        decisions,
        processing,
        guitarOptions,
      );
      if (!inputRequiresReview) assertNoSilentChange(revisedSourceModel, canonicalTabResult);
      musicXml = serializeCanonicalTabResultV2ToMusicXml(
        canonicalTabResult,
        writerOptions,
        processing,
      );
    } catch (arrangementError) {
      recovery = recoverPartialGuitarArrangement({
        sourceModel: revisedSourceModel,
        arrangementDecisions: decisions,
        processing,
        writerOptions,
        sourceUploadSha256: inputIdentity.sha256,
        originalError: arrangementError,
        guitarOptions,
        graceOrnamentGroups: projected.graceOrnamentGroups,
      });
      if (!recovery) throw arrangementError;
      canonicalTabResult = null;
      musicXml = recovery.musicXml;
    }
    processing.checkpoint('app-poly-note-edit:complete', {
      revisionCount: normalized.commands.length,
    });

    const remainsUnderReview = uploadResult.status === MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED
      || recovery !== null;
    return decorateUploadResultWithCapabilities({
      documentType: MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_DOCUMENT_TYPE,
      contractVersion: MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION,
      status: remainsUnderReview
        ? MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.REVIEW_REQUIRED
        : MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS.PASS,
      route: MUSICXML_UPLOAD_ROUTE.POLY_V2,
      input: inputIdentity,
      normalization: {
        tabStaffMirrorCollapsed: projected.tabStaffMirrorCollapsed,
      },
      revision: {
        revisionNumber: normalized.commands.length,
        commands: normalized.commands.map(clonePlainData),
        appliedEdits,
      },
      preflight: clonePlainData(uploadResult.preflight),
      canonicalTabResult,
      ...(recovery ? {
        arrangementArtifact: recovery.arrangementArtifact,
        reviewEditableProjection: recovery.reviewEditableProjection,
      } : {}),
      musicXml,
    });
  } catch (error) {
    return blocked(
      inputIdentity,
      MUSICXML_UPLOAD_ROUTE.POLY_V2,
      issueFromError(error),
      {
        revisionNumber: normalized.commands.length,
        commands: normalized.commands.map(clonePlainData),
      },
    );
  }
}

module.exports = {
  MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_VERSION,
  MUSICXML_POLYPHONIC_NOTE_EDIT_RUNTIME_V2_DOCUMENT_TYPE,
  MUSICXML_POLYPHONIC_NOTE_EDIT_STATUS,
  MAX_REVISION_COMMANDS,
  MAX_ACKNOWLEDGED_GROUP_EVENTS,
  MusicXmlPolyphonicNoteEditRuntimeV2Error,
  processMusicXmlPolyphonicNoteEditV2,
};
