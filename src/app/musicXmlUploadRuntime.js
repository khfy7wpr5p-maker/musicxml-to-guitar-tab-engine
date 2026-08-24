'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { createGuitarConfiguration } = require('../guitar/tuning');
const { resolveProcessingRuntime } = require('../core/processingRuntime');
const { convertMusicXmlToCanonicalTab } = require('../core/conversionPipeline');
const {
  convertMusicXmlToInternalPolyphonicTabV2,
} = require('../core/internalPolyphonicConversionPipelineV2');
const {
  parseParsedMusicXmlDocument,
} = require('../parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  DEFAULT_MAX_XML_BYTES,
  XmlSafetyError,
  normalizeXmlInput,
} = require('../validation/xmlSafety');
const {
  serializeCanonicalTabResultToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriter');

const MUSICXML_UPLOAD_RUNTIME_VERSION = '1.0.0';
const MUSICXML_UPLOAD_RUNTIME_DOCUMENT_TYPE = 'MusicXmlUploadRuntimeResult';
const MUSICXML_UPLOAD_STATUS = Object.freeze({
  PASS: 'PASS',
  BLOCKED: 'BLOCKED',
});
const MUSICXML_UPLOAD_ROUTE = Object.freeze({
  MONO_V1: 'MONO_V1',
  POLY_V2: 'POLY_V2',
  UNRESOLVED: 'UNRESOLVED',
});
const ALLOWED_UPLOAD_EXTENSIONS = Object.freeze(['.musicxml', '.xml']);
const MAX_UPLOAD_FILE_NAME_LENGTH = 255;

const STANDARD_GUITAR = createGuitarConfiguration();
let STANDARD_GUITAR_MINIMUM_MIDI = Number.POSITIVE_INFINITY;
let STANDARD_GUITAR_MAXIMUM_MIDI = Number.NEGATIVE_INFINITY;
for (const string of STANDARD_GUITAR.tuning) {
  STANDARD_GUITAR_MINIMUM_MIDI = Math.min(
    STANDARD_GUITAR_MINIMUM_MIDI,
    string.midi + STANDARD_GUITAR.minimumFret,
  );
  STANDARD_GUITAR_MAXIMUM_MIDI = Math.max(
    STANDARD_GUITAR_MAXIMUM_MIDI,
    string.midi + STANDARD_GUITAR.maximumFret,
  );
}

class MusicXmlUploadRuntimeError extends EngineError {
  constructor(message, code = 'INVALID_UPLOAD_REQUEST', details = {}) {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'MusicXmlUploadRuntimeError',
    );
  }
}

function invalidRequest(message, details = {}) {
  return new MusicXmlUploadRuntimeError(message, 'INVALID_UPLOAD_REQUEST', details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeOptions(options) {
  if (!isPlainObject(options)) {
    throw invalidRequest('options must be a non-proxy plain object.', { field: 'options' });
  }
  const allowed = new Set(['processing']);
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalidRequest('options contains an unknown field.', {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidRequest('options fields must be enumerable data properties.', { field: key });
    }
    if (!isPlainObject(descriptor.value)) {
      throw invalidRequest(`options.${key} must be a non-proxy plain object.`, { field: key });
    }
  }
  return {
    processing: Object.hasOwn(options, 'processing') ? options.processing : {},
  };
}

function normalizeUpload(upload) {
  if (!isPlainObject(upload)) {
    throw invalidRequest('upload must be a non-proxy plain object.', { field: 'upload' });
  }
  const allowed = new Set(['fileName', 'bytes']);
  const descriptors = Object.getOwnPropertyDescriptors(upload);
  for (const key of Reflect.ownKeys(upload)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw invalidRequest('upload contains an unknown field.', {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidRequest('upload fields must be enumerable data properties.', { field: key });
    }
  }
  for (const field of allowed) {
    if (!Object.hasOwn(descriptors, field)) {
      throw invalidRequest('upload is missing a required field.', { field });
    }
  }

  const fileName = descriptors.fileName.value;
  if (
    typeof fileName !== 'string'
    || fileName.length === 0
    || fileName.length > MAX_UPLOAD_FILE_NAME_LENGTH
    || /[\\/\u0000-\u001f\u007f]/.test(fileName)
  ) {
    throw invalidRequest('fileName must be a bounded plain file name without path separators.', {
      field: 'fileName',
      maximumLength: MAX_UPLOAD_FILE_NAME_LENGTH,
    });
  }

  const bytes = descriptors.bytes.value;
  if (bytes && typeof bytes === 'object' && isProxy(bytes)) {
    throw invalidRequest('bytes must not be a Proxy.', { field: 'bytes' });
  }
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw invalidRequest('bytes must be a Buffer or Uint8Array.', { field: 'bytes' });
  }

  // Own the upload bytes before hashing or invoking any caller-controlled runtime
  // callback. Buffer.from(Uint8Array) copies instead of sharing its backing store.
  const exactBytes = Buffer.from(bytes);
  return {
    fileName,
    bytes: exactBytes,
  };
}

function extensionOf(fileName) {
  const lower = fileName.toLowerCase();
  for (const extension of ALLOWED_UPLOAD_EXTENSIONS) {
    if (lower.endsWith(extension)) return extension;
  }
  return null;
}

function createInputIdentity(fileName, bytes) {
  return Object.freeze({
    fileName,
    byteLength: bytes.byteLength,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
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

function categoryForError(error) {
  if (error instanceof XmlSafetyError) return 'safety';
  if (String(error?.code || '').startsWith('UNSUPPORTED_')) return 'capability';
  if (String(error?.code || '').startsWith('UNPLAYABLE_')) return 'playability';
  return 'content';
}

function issueFromError(error) {
  const details = error && typeof error.details === 'object' && error.details
    ? { ...error.details }
    : {};
  return {
    severity: 'error',
    category: categoryForError(error),
    code: typeof error?.code === 'string' ? error.code : 'UPLOAD_CONVERSION_FAILED',
    message: error instanceof Error ? error.message : 'MusicXML upload conversion failed.',
    location: {
      measure: details.measureNumber ?? details.measure ?? null,
      measureIndex: details.measureIndex ?? null,
      eventIndex: details.eventIndex ?? details.sourceOrder ?? null,
      sourceEventId: details.sourceEventId ?? null,
    },
    details,
  };
}

function blockedResult(identity, route, issue, normalization = null) {
  return deepFreeze({
    documentType: MUSICXML_UPLOAD_RUNTIME_DOCUMENT_TYPE,
    contractVersion: MUSICXML_UPLOAD_RUNTIME_VERSION,
    status: MUSICXML_UPLOAD_STATUS.BLOCKED,
    route,
    input: identity,
    preflight: {
      status: 'BLOCKED',
      canProcess: false,
      summary: null,
      issues: [issue],
    },
    normalization: normalization || {
      tabStaffMirrorCollapsed: false,
      collapsedStaff: null,
      omittedRepresentationNoteCount: 0,
    },
    canonicalTabResult: null,
    musicXml: null,
  });
}

function isCapabilityOnlyPreflight(preflight) {
  return Boolean(
    preflight
    && preflight.canProcess === false
    && Array.isArray(preflight.issues)
    && preflight.issues.length > 0
    && preflight.issues.every((issue) => issue.category === 'capability'),
  );
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name && child.uri === node.uri);
}

function getAttribute(node, name) {
  const attribute = node.attributes.find(
    (candidate) => candidate.name === name && candidate.uri.length === 0,
  );
  return attribute ? attribute.value : undefined;
}

function hasExplicitTabClefForStaff(parsedDocument, staffNumber) {
  const target = String(staffNumber);
  const pending = [parsedDocument.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node.name === 'clef' && (getAttribute(node, 'number') || '1') === target) {
      const sign = directChildren(node, 'sign')[0];
      if (sign && sign.text.trim().toUpperCase() === 'TAB') return true;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }
  return false;
}

function sourceEventFingerprint(event) {
  return JSON.stringify([
    event.type,
    event.onsetDivisions,
    event.durationDivisions,
    event.type === 'note' ? event.pitch.midi : null,
    event.tieStart,
    event.tieStop,
    event.source.chordWithPrevious,
  ]);
}

function detectExactTabStaffMirror(parsedDocument, sourceModel) {
  if (!hasExplicitTabClefForStaff(parsedDocument, 2)) {
    return Object.freeze({
      tabStaffMirrorCollapsed: false,
      collapsedStaff: null,
      omittedRepresentationNoteIds: Object.freeze([]),
    });
  }

  let staffTwoEventCount = 0;
  for (const measure of sourceModel.measures) {
    const staffOne = measure.events
      .filter((event) => event.staff === 1)
      .map(sourceEventFingerprint)
      .sort();
    const staffTwo = measure.events
      .filter((event) => event.staff === 2)
      .map(sourceEventFingerprint)
      .sort();
    staffTwoEventCount += staffTwo.length;
    if (
      staffOne.length !== staffTwo.length
      || staffOne.some((fingerprint, index) => fingerprint !== staffTwo[index])
    ) {
      return Object.freeze({
        tabStaffMirrorCollapsed: false,
        collapsedStaff: null,
        omittedRepresentationNoteIds: Object.freeze([]),
      });
    }
  }

  if (staffTwoEventCount === 0) {
    return Object.freeze({
      tabStaffMirrorCollapsed: false,
      collapsedStaff: null,
      omittedRepresentationNoteIds: Object.freeze([]),
    });
  }

  const omittedRepresentationNoteIds = [];
  for (const measure of sourceModel.measures) {
    for (const event of measure.events) {
      if (event.type === 'note' && event.staff === 2) {
        omittedRepresentationNoteIds.push(event.sourceEventId);
      }
    }
  }

  return Object.freeze({
    tabStaffMirrorCollapsed: true,
    collapsedStaff: 2,
    omittedRepresentationNoteIds: Object.freeze(omittedRepresentationNoteIds),
  });
}

function buildExactPitchPreservingDecisions(sourceModel, normalization) {
  const omitted = new Set(normalization.omittedRepresentationNoteIds);
  const decisions = [];

  for (const measure of sourceModel.measures) {
    for (const event of measure.events) {
      if (event.type !== 'note') continue;

      if (!omitted.has(event.sourceEventId)) {
        if (
          event.pitch.midi < STANDARD_GUITAR_MINIMUM_MIDI
          || event.pitch.midi > STANDARD_GUITAR_MAXIMUM_MIDI
        ) {
          throw new MusicXmlUploadRuntimeError(
            'Source note is outside the supported standard-guitar range; automatic octave displacement is disabled.',
            'UNPLAYABLE_SOURCE_PITCH',
            {
              sourceEventId: event.sourceEventId,
              measure: measure.number,
              measureIndex: measure.index,
              sourceOrder: event.sourceOrder,
              writtenPitch: event.pitch.written,
              midi: event.pitch.midi,
              minimumMidi: STANDARD_GUITAR_MINIMUM_MIDI,
              maximumMidi: STANDARD_GUITAR_MAXIMUM_MIDI,
            },
          );
        }
      }

      decisions.push(Object.freeze({
        decisionType: omitted.has(event.sourceEventId) ? 'OMITTED' : 'PRESERVED',
        sourceEventIds: Object.freeze([event.sourceEventId]),
        sourceGroupId: null,
      }));
    }
  }

  return Object.freeze(decisions);
}

function assertNoSilentMusicalChange(sourceModel, canonicalTabResult, normalization) {
  const omittedRepresentationIds = new Set(normalization.omittedRepresentationNoteIds);
  const sourceNotes = sourceModel.measures.flatMap(
    (measure) => measure.events.filter((event) => event.type === 'note'),
  );
  const dispositions = canonicalTabResult.noteDispositions;

  if (dispositions.length !== sourceNotes.length) {
    throw new MusicXmlUploadRuntimeError(
      'Polyphonic conversion did not produce one disposition for every source note.',
      'UNEXPECTED_NOTE_LOSS',
      { sourceNoteCount: sourceNotes.length, dispositionCount: dispositions.length },
    );
  }

  const byId = new Map(dispositions.map((entry) => [entry.sourceEventId, entry]));
  for (const event of sourceNotes) {
    const disposition = byId.get(event.sourceEventId);
    if (!disposition) {
      throw new MusicXmlUploadRuntimeError(
        'Polyphonic conversion lost a source-note disposition.',
        'UNEXPECTED_NOTE_LOSS',
        {
          sourceEventId: event.sourceEventId,
          measure: event.source.measureNumber,
          measureIndex: event.source.measureIndex,
          sourceOrder: event.sourceOrder,
        },
      );
    }

    if (omittedRepresentationIds.has(event.sourceEventId)) {
      if (disposition.disposition !== 'OMIT') {
        throw new MusicXmlUploadRuntimeError(
          'TAB-staff mirror normalization was not preserved by the canonical result.',
          'REPRESENTATION_NORMALIZATION_MISMATCH',
          { sourceEventId: event.sourceEventId },
        );
      }
      continue;
    }

    if (
      disposition.disposition !== 'KEEP'
      || disposition.octaveShiftSemitones !== 0
      || !disposition.targetPitch
      || disposition.targetPitch.midi !== event.pitch.midi
    ) {
      throw new MusicXmlUploadRuntimeError(
        'Polyphonic conversion attempted to omit or transpose a musical source note.',
        'UNEXPECTED_MUSICAL_CHANGE',
        {
          sourceEventId: event.sourceEventId,
          measure: event.source.measureNumber,
          measureIndex: event.source.measureIndex,
          sourceOrder: event.sourceOrder,
          sourceMidi: event.pitch.midi,
          disposition: disposition.disposition,
          octaveShiftSemitones: disposition.octaveShiftSemitones,
          targetMidi: disposition.targetPitch?.midi ?? null,
        },
      );
    }
  }
}

function publicNormalization(normalization) {
  return Object.freeze({
    tabStaffMirrorCollapsed: normalization.tabStaffMirrorCollapsed,
    collapsedStaff: normalization.collapsedStaff,
    omittedRepresentationNoteCount: normalization.omittedRepresentationNoteIds.length,
  });
}

function processMusicXmlUpload(upload, options = {}, runtime = null) {
  const normalizedUpload = normalizeUpload(upload);
  const normalizedOptions = normalizeOptions(options);
  const identity = createInputIdentity(normalizedUpload.fileName, normalizedUpload.bytes);
  const extension = extensionOf(normalizedUpload.fileName);

  if (!extension) {
    return blockedResult(identity, MUSICXML_UPLOAD_ROUTE.UNRESOLVED, {
      severity: 'error',
      category: 'capability',
      code: 'UNSUPPORTED_UPLOAD_EXTENSION',
      message: 'Only .xml and .musicxml uploads are accepted.',
      location: { measure: null, measureIndex: null, eventIndex: null, sourceEventId: null },
      details: { allowedExtensions: ALLOWED_UPLOAD_EXTENSIONS },
    });
  }

  if (normalizedUpload.bytes.byteLength > DEFAULT_MAX_XML_BYTES) {
    return blockedResult(identity, MUSICXML_UPLOAD_ROUTE.UNRESOLVED, {
      severity: 'error',
      category: 'safety',
      code: 'FILE_TOO_LARGE',
      message: 'XML input exceeds the fixed upload size limit.',
      location: { measure: null, measureIndex: null, eventIndex: null, sourceEventId: null },
      details: {
        maxBytes: DEFAULT_MAX_XML_BYTES,
        byteLength: normalizedUpload.bytes.byteLength,
      },
    });
  }

  let processing;
  try {
    processing = resolveProcessingRuntime(normalizedOptions.processing, runtime);
    processing.checkpoint('app-upload:start', { byteLength: normalizedUpload.bytes.byteLength });
    normalizeXmlInput(normalizedUpload.bytes, { maxBytes: DEFAULT_MAX_XML_BYTES });
    processing.checkpoint('app-upload:safety-complete');
  } catch (error) {
    return blockedResult(identity, MUSICXML_UPLOAD_ROUTE.UNRESOLVED, issueFromError(error));
  }

  let monophonic;
  try {
    monophonic = convertMusicXmlToCanonicalTab(
      normalizedUpload.bytes,
      { parser: {} },
      processing,
    );
  } catch (error) {
    return blockedResult(identity, MUSICXML_UPLOAD_ROUTE.MONO_V1, issueFromError(error));
  }

  if (monophonic.preflight.canProcess && monophonic.canonicalTabResult) {
    try {
      processing.checkpoint('app-upload:mono-writer:start');
      const musicXml = serializeCanonicalTabResultToMusicXml(monophonic.canonicalTabResult);
      processing.checkpoint('app-upload:mono-complete');
      return deepFreeze({
        documentType: MUSICXML_UPLOAD_RUNTIME_DOCUMENT_TYPE,
        contractVersion: MUSICXML_UPLOAD_RUNTIME_VERSION,
        status: MUSICXML_UPLOAD_STATUS.PASS,
        route: MUSICXML_UPLOAD_ROUTE.MONO_V1,
        input: identity,
        preflight: monophonic.preflight,
        normalization: {
          tabStaffMirrorCollapsed: false,
          collapsedStaff: null,
          omittedRepresentationNoteCount: 0,
        },
        canonicalTabResult: monophonic.canonicalTabResult,
        musicXml,
      });
    } catch (error) {
      return blockedResult(identity, MUSICXML_UPLOAD_ROUTE.MONO_V1, issueFromError(error));
    }
  }

  if (!isCapabilityOnlyPreflight(monophonic.preflight)) {
    return deepFreeze({
      documentType: MUSICXML_UPLOAD_RUNTIME_DOCUMENT_TYPE,
      contractVersion: MUSICXML_UPLOAD_RUNTIME_VERSION,
      status: MUSICXML_UPLOAD_STATUS.BLOCKED,
      route: MUSICXML_UPLOAD_ROUTE.UNRESOLVED,
      input: identity,
      preflight: monophonic.preflight,
      normalization: {
        tabStaffMirrorCollapsed: false,
        collapsedStaff: null,
        omittedRepresentationNoteCount: 0,
      },
      canonicalTabResult: null,
      musicXml: null,
    });
  }

  let normalization = null;
  try {
    processing.checkpoint('app-upload:poly:start');
    const parsedDocument = parseParsedMusicXmlDocument(normalizedUpload.bytes, {}, processing);
    const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(parsedDocument, processing);
    normalization = detectExactTabStaffMirror(parsedDocument, sourceModel);
    const decisions = buildExactPitchPreservingDecisions(sourceModel, normalization);
    const conversion = convertMusicXmlToInternalPolyphonicTabV2(
      normalizedUpload.bytes,
      decisions,
      {},
      processing,
    );
    assertNoSilentMusicalChange(sourceModel, conversion.canonicalTabResult, normalization);
    processing.checkpoint('app-upload:poly-complete');

    return deepFreeze({
      documentType: MUSICXML_UPLOAD_RUNTIME_DOCUMENT_TYPE,
      contractVersion: MUSICXML_UPLOAD_RUNTIME_VERSION,
      status: MUSICXML_UPLOAD_STATUS.PASS,
      route: MUSICXML_UPLOAD_ROUTE.POLY_V2,
      input: identity,
      preflight: {
        status: 'PASS',
        canProcess: true,
        summary: {
          format: sourceModel.source.format,
          version: sourceModel.source.musicXmlVersion,
          partId: sourceModel.source.partId,
          measureCount: sourceModel.measureCount,
          eventCount: sourceModel.eventCount,
        },
        issues: [],
      },
      normalization: publicNormalization(normalization),
      canonicalTabResult: conversion.canonicalTabResult,
      musicXml: conversion.musicXml,
    });
  } catch (error) {
    return blockedResult(
      identity,
      MUSICXML_UPLOAD_ROUTE.POLY_V2,
      issueFromError(error),
      normalization ? publicNormalization(normalization) : null,
    );
  }
}

module.exports = {
  MUSICXML_UPLOAD_RUNTIME_VERSION,
  MUSICXML_UPLOAD_RUNTIME_DOCUMENT_TYPE,
  MUSICXML_UPLOAD_STATUS,
  MUSICXML_UPLOAD_ROUTE,
  MusicXmlUploadRuntimeError,
  processMusicXmlUpload,
};
