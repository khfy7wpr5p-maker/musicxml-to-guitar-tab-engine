'use strict';

const crypto = require('node:crypto');
const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { createGuitarConfiguration } = require('../guitar/tuning');
const {
  STANDARD_GUITAR_WORKBENCH_TARGET,
} = require('../guitar/standardGuitarRegister');
const { resolveProcessingRuntime } = require('../core/processingRuntime');
const { convertMusicXmlToCanonicalTab } = require('../core/conversionPipeline');
const {
  convertMusicXmlToInternalPolyphonicTabV2,
} = require('../core/internalPolyphonicConversionPipelineV2');
const {
  createCanonicalTabResultV2,
} = require('../tab/canonicalTabResultV2');
const {
  parseParsedMusicXmlDocument,
} = require('../parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  projectParsedMusicXmlWithGraceOrnamentExtraction,
} = require('../parser/polyphonicGraceOrnamentExtractor');
const {
  createGracePhysicalTransitionModel,
} = require('../music/gracePhysicalTransitionModel');
const {
  DEFAULT_MAX_XML_BYTES,
  XmlSafetyError,
  normalizeXmlInput,
} = require('../validation/xmlSafety');
const {
  serializeCanonicalTabResultToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriter');
const {
  serializeCanonicalTabResultV2ToMusicXml,
} = require('../writers/canonicalTabMusicXmlWriterV2');
const {
  tryProjectExactTabStaffMirror,
} = require('./exactTabStaffMirrorNormalizer');
const {
  tryProjectRuntimeGuitarNotation,
} = require('./runtimeGuitarNotationNormalizer');
const {
  extractBasicMusicXmlHarmony,
  resolveBasicMusicXmlHarmonyReferences,
} = require('./basicMusicXmlHarmonyExtractor');
const { createBasicChordLabelModel } = require('../music/basicChordLabelModel');

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
  if (
    typeof SharedArrayBuffer === 'function'
    && backingBuffer instanceof SharedArrayBuffer
  ) {
    throw invalidRequest('bytes must not use shared memory.', { field: 'bytes' });
  }

  if (byteLength > DEFAULT_MAX_XML_BYTES) {
    return {
      fileName,
      byteLength,
      bytes: null,
    };
  }

  let exactBytes;
  try {
    const plainView = new Uint8Array(backingBuffer, byteOffset, byteLength);
    exactBytes = Buffer.from(plainView);
  } catch {
    throw invalidRequest('bytes must be an attached Buffer or Uint8Array.', { field: 'bytes' });
  }
  return {
    fileName,
    byteLength,
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

function createOversizedInputIdentity(fileName, byteLength) {
  return Object.freeze({
    fileName,
    byteLength,
    sha256: null,
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

function noRepresentationNormalization() {
  return Object.freeze({
    tabStaffMirrorCollapsed: false,
    collapsedStaff: null,
    omittedRepresentationNoteIds: Object.freeze([]),
    omittedRepresentationNoteCount: 0,
  });
}

function parsedDocumentHasGraceNotes(parsedDocument) {
  const root = parsedDocument.root;
  for (const part of root.children) {
    if (part.uri !== root.uri || part.name !== 'part') continue;
    for (const measure of part.children) {
      if (measure.uri !== part.uri || measure.name !== 'measure') continue;
      for (const note of measure.children) {
        if (note.uri !== measure.uri || note.name !== 'note') continue;
        if (note.children.some((child) => child.uri === note.uri && child.name === 'grace')) {
          return true;
        }
      }
    }
  }
  return false;
}

function graceWriterTransitions(model) {
  return Object.freeze(model.groups.map((group) => Object.freeze({
    graceGroupId: group.graceGroupId,
    measureIndex: group.measureIndex,
    voice: group.voice,
    staff: group.staff,
    anchorSourceEventId: group.anchorSourceEventId,
    notes: Object.freeze(group.notes.map((note) => Object.freeze({
      graceEventId: note.graceEventId,
      orderIndex: note.orderIndex,
      pitch: Object.freeze({
        step: note.pitch.step,
        alter: note.pitch.alter,
        octave: note.pitch.octave,
      }),
      nominalType: note.nominalType,
      slash: note.slash,
      stem: note.stem,
      beam: note.beam,
      string: note.string,
      fret: note.fret,
    }))),
  })));
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
    omittedRepresentationNoteCount: normalization.omittedRepresentationNoteCount
      ?? normalization.omittedRepresentationNoteIds.length,
  });
}

function convertProjectedMirrorToCanonicalTab(sourceModel, decisions, processing, writerOptions = {}) {
  processing.checkpoint('app-upload:tab-mirror-canonical:start');
  const canonicalTabResult = createCanonicalTabResultV2(sourceModel, decisions, processing);
  const musicXml = serializeCanonicalTabResultV2ToMusicXml(
    canonicalTabResult,
    writerOptions,
    processing,
  );
  processing.checkpoint('app-upload:tab-mirror-canonical:complete');
  return { canonicalTabResult, musicXml };
}

function convertGraceProjectionToCanonicalTab(
  graceProjection,
  decisions,
  processing,
  writerOptions = {},
) {
  processing.checkpoint('app-upload:grace-canonical:start');
  const canonicalTabResult = createCanonicalTabResultV2(
    graceProjection.mainSourceModel,
    decisions,
    processing,
  );
  const physicalGrace = createGracePhysicalTransitionModel(
    graceProjection.mainSourceModel,
    canonicalTabResult,
    graceProjection.graceOrnamentGroups,
    processing,
  );
  const musicXml = serializeCanonicalTabResultV2ToMusicXml(
    canonicalTabResult,
    {
      ...writerOptions,
      graceTransitions: graceWriterTransitions(physicalGrace),
    },
    processing,
  );
  processing.checkpoint('app-upload:grace-canonical:complete', {
    graceGroupCount: physicalGrace.graceGroupCount,
    graceEventCount: physicalGrace.graceEventCount,
  });
  return { canonicalTabResult, musicXml };
}

function runtimeCompatibilityIssue(runtimeProjection) {
  return Object.freeze({
    severity: 'warning',
    category: 'quality',
    code: 'RUNTIME_GUITAR_NOTATION_NORMALIZED',
    message: 'Standard guitar notation metadata was normalized for deterministic POLY_V2 conversion.',
    location: { measure: null, measureIndex: null, eventIndex: null, sourceEventId: null },
    details: Object.freeze({
      pitchOctaveShift: runtimeProjection.pitchOctaveShift,
      ignoredFeatures: Object.freeze([...runtimeProjection.ignoredFeatures]),
    }),
  });
}

function processMusicXmlUpload(upload, options = {}, runtime = null) {
  const normalizedUpload = normalizeUpload(upload);
  const normalizedOptions = normalizeOptions(options);
  const identity = normalizedUpload.bytes === null
    ? createOversizedInputIdentity(normalizedUpload.fileName, normalizedUpload.byteLength)
    : createInputIdentity(normalizedUpload.fileName, normalizedUpload.bytes);

  if (normalizedUpload.bytes === null) {
    return blockedResult(identity, MUSICXML_UPLOAD_ROUTE.UNRESOLVED, {
      severity: 'error',
      category: 'safety',
      code: 'FILE_TOO_LARGE',
      message: 'XML input exceeds the fixed upload size limit.',
      location: { measure: null, measureIndex: null, eventIndex: null, sourceEventId: null },
      details: {
        maxBytes: DEFAULT_MAX_XML_BYTES,
        byteLength: normalizedUpload.byteLength,
      },
    });
  }

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

  let processing;
  let harmonyExtraction;
  try {
    processing = resolveProcessingRuntime(normalizedOptions.processing, runtime);
    processing.checkpoint('app-upload:start', { byteLength: normalizedUpload.bytes.byteLength });
    normalizeXmlInput(normalizedUpload.bytes, { maxBytes: DEFAULT_MAX_XML_BYTES });
    processing.checkpoint('app-upload:safety-complete');
    harmonyExtraction = extractBasicMusicXmlHarmony(
      parseParsedMusicXmlDocument(normalizedUpload.bytes, {}, processing),
      processing,
    );
  } catch (error) {
    const route = error?.code === 'UNSUPPORTED_BASIC_MUSICXML_HARMONY'
      ? MUSICXML_UPLOAD_ROUTE.POLY_V2
      : MUSICXML_UPLOAD_ROUTE.UNRESOLVED;
    return blockedResult(identity, route, issueFromError(error));
  }

  let monophonic;
  if (harmonyExtraction.references.length > 0) {
    monophonic = {
      preflight: {
        canProcess: false,
        issues: [{ category: 'capability', code: 'BASIC_HARMONY_REQUIRES_POLY_V2' }],
      },
      canonicalTabResult: null,
    };
  } else {
    try {
      monophonic = convertMusicXmlToCanonicalTab(
        normalizedUpload.bytes,
        { parser: {}, guitar: STANDARD_GUITAR_WORKBENCH_TARGET },
        processing,
      );
    } catch (error) {
      return blockedResult(identity, MUSICXML_UPLOAD_ROUTE.MONO_V1, issueFromError(error));
    }
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
  let runtimeProjection = null;
  let graceProjection = null;
  try {
    processing.checkpoint('app-upload:poly:start');
    const parsedDocument = harmonyExtraction.parsedDocument;
    const projectedMirror = tryProjectExactTabStaffMirror(parsedDocument, processing);
    let sourceModel;
    if (projectedMirror) {
      sourceModel = projectedMirror.sourceModel;
    } else if (parsedDocumentHasGraceNotes(parsedDocument)) {
      graceProjection = projectParsedMusicXmlWithGraceOrnamentExtraction(
        parsedDocument,
        processing,
      );
      sourceModel = graceProjection.mainSourceModel;
    } else {
      try {
        sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(parsedDocument, processing);
      } catch (projectionError) {
        if (projectionError?.code !== 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE') {
          throw projectionError;
        }
        runtimeProjection = tryProjectRuntimeGuitarNotation(parsedDocument, processing);
        if (!runtimeProjection) throw projectionError;
        sourceModel = runtimeProjection.sourceModel;
      }
    }
    normalization = projectedMirror
      ? projectedMirror.normalization
      : noRepresentationNormalization();
    const decisions = buildExactPitchPreservingDecisions(sourceModel, normalization);
    const explicitHarmonyFacts = resolveBasicMusicXmlHarmonyReferences(
      harmonyExtraction.references,
      sourceModel,
    );
    const chordLabels = createBasicChordLabelModel(
      sourceModel,
      explicitHarmonyFacts,
      processing,
    ).labels;
    const writerOptions = {
      ...(runtimeProjection ? { notationContext: runtimeProjection.notationContext } : {}),
      chordLabels,
    };
    let conversion;
    if (graceProjection) {
      conversion = convertGraceProjectionToCanonicalTab(
        graceProjection,
        decisions,
        processing,
        writerOptions,
      );
    } else {
      conversion = (projectedMirror || runtimeProjection || chordLabels.length > 0)
        ? convertProjectedMirrorToCanonicalTab(
          sourceModel,
          decisions,
          processing,
          writerOptions,
        )
        : convertMusicXmlToInternalPolyphonicTabV2(
          normalizedUpload.bytes,
          decisions,
          {},
          processing,
        );
    }
    assertNoSilentMusicalChange(sourceModel, conversion.canonicalTabResult, normalization);
    processing.checkpoint('app-upload:poly-complete');

    const compatibilityIssues = runtimeProjection
      ? [runtimeCompatibilityIssue(runtimeProjection)]
      : [];
    return deepFreeze({
      documentType: MUSICXML_UPLOAD_RUNTIME_DOCUMENT_TYPE,
      contractVersion: MUSICXML_UPLOAD_RUNTIME_VERSION,
      status: MUSICXML_UPLOAD_STATUS.PASS,
      route: MUSICXML_UPLOAD_ROUTE.POLY_V2,
      input: identity,
      preflight: {
        status: compatibilityIssues.length > 0 ? 'WARNING' : 'PASS',
        canProcess: true,
        summary: {
          format: sourceModel.source.format,
          version: sourceModel.source.musicXmlVersion,
          partId: sourceModel.source.partId,
          measureCount: sourceModel.measureCount,
          eventCount: sourceModel.eventCount,
        },
        issues: compatibilityIssues,
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
