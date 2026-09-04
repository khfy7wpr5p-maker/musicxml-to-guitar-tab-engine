'use strict';

const { EngineError } = require('../errors/engineError');
const { createSourceEventId } = require('../music/polyphonicSourceModel');
const { createSimultaneousEventModel } = require('../music/simultaneousEventModel');

const POLYPHONIC_FINGERING_PROVENANCE_VERSION = '1.0.0';
const POLYPHONIC_FINGERING_PROVENANCE_DOCUMENT_TYPE = 'PolyphonicFingeringProvenance';
const EXACT_GUITAR_FINGERING_CONSTRAINTS_VERSION = '1.0.0';
const MAX_FINGERING_TEXT_LENGTH = 64;

const FINGERING_AUTHORITY = Object.freeze({
  SOURCE_ANNOTATION_ONLY: 'SOURCE_ANNOTATION_ONLY',
  GUITAR_FINGERING_CANDIDATE: 'GUITAR_FINGERING_CANDIDATE',
  GUITAR_FINGERING_EXACT: 'GUITAR_FINGERING_EXACT',
  INVALID_FINGERING: 'INVALID_FINGERING',
});

const SOURCE_INSTRUMENT_CONTEXT = Object.freeze({
  EXPLICIT_SIX_STRING_GUITAR_STAFF: 'EXPLICIT_SIX_STRING_GUITAR_STAFF',
  UNPROVEN_GENERIC_SCORE: 'UNPROVEN_GENERIC_SCORE',
});

const ALLOWED_FINGERING_ATTRIBUTES = new Set(['placement', 'substitution', 'alternate']);

class PolyphonicFingeringProvenanceError extends EngineError {
  constructor(message, code = 'INVALID_POLYPHONIC_FINGERING_PROVENANCE', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicFingeringProvenanceError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicFingeringProvenanceError(message, undefined, details);
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function attribute(node, name) {
  const matches = node.attributes.filter((entry) => entry.uri.length === 0 && entry.name === name);
  return matches.length === 1 ? matches[0].value : null;
}

function cloneNode(node, children = null) {
  return {
    name: node.name,
    uri: node.uri,
    attributes: node.attributes.map((entry) => ({ ...entry })),
    text: node.text,
    children: children === null ? node.children.map((child) => cloneNode(child)) : children,
  };
}

function scalarNoteText(note, name) {
  const nodes = directChildren(note, name);
  if (nodes.length !== 1) return null;
  const node = nodes[0];
  if (node.attributes.length !== 0 || node.children.length !== 0) return null;
  const value = node.text.trim();
  return value.length > 0 ? value : null;
}

function explicitGuitarStaffKeys(sourceConfigurationProvenance) {
  const keys = new Set();
  if (
    !sourceConfigurationProvenance
    || sourceConfigurationProvenance.documentType !== 'MusicXmlGuitarConfigurationProvenance'
    || sourceConfigurationProvenance.status !== 'EXPLICIT'
    || !Array.isArray(sourceConfigurationProvenance.records)
  ) return keys;
  for (const record of sourceConfigurationProvenance.records) {
    if (!Number.isInteger(record.partIndex) || typeof record.staffNumber !== 'string') continue;
    keys.add(`${record.partIndex}:${record.staffNumber}`);
  }
  return keys;
}

function parseFingeringAttributes(node) {
  const attributes = Object.create(null);
  let valid = true;
  for (const entry of node.attributes) {
    if (
      entry.uri.length !== 0
      || !ALLOWED_FINGERING_ATTRIBUTES.has(entry.name)
      || Object.hasOwn(attributes, entry.name)
    ) {
      valid = false;
      continue;
    }
    attributes[entry.name] = entry.value;
  }
  if (attributes.placement !== undefined && !['above', 'below'].includes(attributes.placement)) {
    valid = false;
  }
  for (const name of ['substitution', 'alternate']) {
    if (attributes[name] !== undefined && !['yes', 'no'].includes(attributes[name])) valid = false;
  }
  return {
    valid,
    sourceAttributes: Object.freeze({ ...attributes }),
    placement: attributes.placement ?? null,
    substitution: attributes.substitution ?? null,
    alternate: attributes.alternate ?? null,
  };
}

function parseFingeringNode(node, context, guitarStaffKeys, fingeringIndex) {
  const parsedAttributes = parseFingeringAttributes(node);
  const rawLexeme = node.text;
  const trimmed = rawLexeme.trim();
  const lexicallyValid = (
    rawLexeme.length <= MAX_FINGERING_TEXT_LENGTH
    && node.children.length === 0
    && /^[1-5]$/.test(trimmed)
  );
  const normalizedFinger = lexicallyValid ? Number(trimmed) : null;
  const valid = lexicallyValid && parsedAttributes.valid;
  const explicitGuitar = guitarStaffKeys.has(`${context.partIndex}:${context.staff ?? ''}`);
  const sourceInstrumentContext = explicitGuitar
    ? SOURCE_INSTRUMENT_CONTEXT.EXPLICIT_SIX_STRING_GUITAR_STAFF
    : SOURCE_INSTRUMENT_CONTEXT.UNPROVEN_GENERIC_SCORE;
  let authorityClass;
  if (!valid) authorityClass = FINGERING_AUTHORITY.INVALID_FINGERING;
  else if (explicitGuitar) authorityClass = FINGERING_AUTHORITY.GUITAR_FINGERING_CANDIDATE;
  else authorityClass = FINGERING_AUTHORITY.SOURCE_ANNOTATION_ONLY;

  return {
    sourceEventId: null,
    partIndex: context.partIndex,
    partId: context.partId,
    measureIndex: context.measureIndex,
    measureNumber: context.measureNumber,
    noteIndex: context.noteIndex,
    staff: context.staff,
    voice: context.voice,
    rawFingeringLexeme: rawLexeme,
    normalizedFinger,
    placement: parsedAttributes.placement,
    substitution: parsedAttributes.substitution,
    alternate: parsedAttributes.alternate,
    sourceAttributes: parsedAttributes.sourceAttributes,
    sourceInstrumentContext,
    authorityClass,
    duplicateStatus: 'UNIQUE',
    constraintEligible: valid
      && explicitGuitar
      && normalizedFinger >= 1
      && normalizedFinger <= 4
      && parsedAttributes.substitution !== 'yes'
      && parsedAttributes.alternate !== 'yes',
    provenance: Object.freeze({
      sourcePath: 'note/notations/technical/fingering',
      partIndex: context.partIndex,
      measureIndex: context.measureIndex,
      noteIndex: context.noteIndex,
      notationsIndex: context.notationsIndex,
      technicalIndex: context.technicalIndex,
      fingeringIndex,
    }),
  };
}

function semanticSignature(record) {
  return JSON.stringify([
    record.authorityClass === FINGERING_AUTHORITY.INVALID_FINGERING ? 'INVALID' : 'VALID',
    record.normalizedFinger,
    record.placement,
    record.substitution,
    record.alternate,
    record.rawFingeringLexeme.trim(),
  ]);
}

function locatedIssue(code, message, record, details = {}, severity = 'error') {
  return Object.freeze({
    severity,
    category: 'semantic',
    code,
    message,
    ...(severity === 'error' ? { reviewDisposition: 'REVIEW_REQUIRED' } : {}),
    location: Object.freeze({
      measure: record.measureNumber,
      measureIndex: record.measureIndex,
      eventIndex: record.noteIndex,
      sourceEventId: record.sourceEventId,
    }),
    details: Object.freeze({
      partId: record.partId,
      staff: record.staff,
      voice: record.voice,
      rawLexeme: record.rawFingeringLexeme,
      ...details,
    }),
  });
}

function finalizeNoteRecords(rawRecords, issues) {
  if (rawRecords.length === 0) return Object.freeze([]);
  const signatures = new Set(rawRecords.map(semanticSignature));
  const duplicateStatus = rawRecords.length === 1
    ? 'UNIQUE'
    : (signatures.size === 1 ? 'EQUIVALENT_DUPLICATE' : 'CONFLICTING_DUPLICATE');
  if (duplicateStatus === 'CONFLICTING_DUPLICATE') {
    issues.push(locatedIssue(
      'CONFLICTING_FINGERING_ANNOTATIONS',
      'Multiple fingering annotations on one source note are not provably equivalent.',
      rawRecords[0],
      { observedCount: rawRecords.length, uniqueSemanticShapeCount: signatures.size },
    ));
  }
  const finalized = rawRecords.map((record) => {
    if (record.authorityClass === FINGERING_AUTHORITY.INVALID_FINGERING) {
      issues.push(locatedIssue(
        'INVALID_FINGERING',
        'Fingering annotation is outside the bounded V1 lexical or attribute profile.',
        record,
      ));
    }
    return Object.freeze({
      ...record,
      duplicateStatus,
      constraintEligible: record.constraintEligible && duplicateStatus !== 'CONFLICTING_DUPLICATE',
    });
  });
  return Object.freeze(finalized);
}

function isLegacyTechniqueSafeFingering(node) {
  return (
    node.attributes.length === 0
    && node.children.length === 0
    && /^[1-5]$/.test(node.text.trim())
  );
}

function normalizeTechnical(technical) {
  const sameNamespaceFingerings = directChildren(technical, 'fingering');
  const preserveLegacySafeFingering = (
    sameNamespaceFingerings.length === 1
    && isLegacyTechniqueSafeFingering(sameNamespaceFingerings[0])
  );

  const children = technical.children
    .filter((child) => !(
      child.uri === technical.uri
      && child.name === 'fingering'
      && !preserveLegacySafeFingering
    ))
    .map((child) => cloneNode(child));
  if (children.length === 0 && technical.attributes.length === 0 && technical.text.trim().length === 0) {
    return null;
  }
  return cloneNode(technical, children);
}

function normalizeNotations(notations) {
  const children = [];
  for (const child of notations.children) {
    if (child.uri === notations.uri && child.name === 'technical') {
      const technical = normalizeTechnical(child);
      if (technical) children.push(technical);
    } else {
      children.push(cloneNode(child));
    }
  }
  if (children.length === 0 && notations.attributes.length === 0 && notations.text.trim().length === 0) {
    return null;
  }
  return cloneNode(notations, children);
}

function analyzeAndNormalizeNote(note, context, guitarStaffKeys, records, issues) {
  const noteRecords = [];
  const voice = scalarNoteText(note, 'voice');
  const staff = scalarNoteText(note, 'staff');
  let notationsIndex = 0;
  for (const child of note.children) {
    if (child.uri !== note.uri || child.name !== 'notations') continue;
    let technicalIndex = 0;
    for (const notationChild of child.children) {
      if (notationChild.uri !== child.uri || notationChild.name !== 'technical') continue;
      const fingerings = directChildren(notationChild, 'fingering');
      fingerings.forEach((fingering, fingeringIndex) => {
        checkpoint(context.runtime, 'polyphonic-fingering-provenance:fingering', {
          measureIndex: context.measureIndex,
          noteIndex: context.noteIndex,
          fingeringIndex,
        });
        noteRecords.push(parseFingeringNode(
          fingering,
          {
            ...context,
            voice,
            staff,
            notationsIndex,
            technicalIndex,
          },
          guitarStaffKeys,
          fingeringIndex,
        ));
      });
      technicalIndex += 1;
    }
    notationsIndex += 1;
  }
  records.push(...finalizeNoteRecords(noteRecords, issues));

  const children = [];
  for (const child of note.children) {
    if (child.uri === note.uri && child.name === 'notations') {
      const normalized = normalizeNotations(child);
      if (normalized) children.push(normalized);
    } else {
      children.push(cloneNode(child));
    }
  }
  return cloneNode(note, children);
}

function normalizeMeasure(measure, context, guitarStaffKeys, records, issues) {
  const children = [];
  let noteIndex = 0;
  for (const child of measure.children) {
    if (child.uri === measure.uri && child.name === 'note') {
      children.push(analyzeAndNormalizeNote(
        child,
        { ...context, noteIndex },
        guitarStaffKeys,
        records,
        issues,
      ));
      noteIndex += 1;
    } else {
      children.push(cloneNode(child));
    }
  }
  return cloneNode(measure, children);
}

function normalizePart(part, partIndex, guitarStaffKeys, records, issues, runtime) {
  const partId = attribute(part, 'id');
  const children = [];
  let measureIndex = 0;
  for (const child of part.children) {
    if (child.uri === part.uri && child.name === 'measure') {
      children.push(normalizeMeasure(
        child,
        {
          partIndex,
          partId,
          measureIndex,
          measureNumber: attribute(child, 'number') ?? String(measureIndex + 1),
          runtime,
        },
        guitarStaffKeys,
        records,
        issues,
      ));
      measureIndex += 1;
    } else {
      children.push(cloneNode(child));
    }
  }
  return cloneNode(part, children);
}

function normalizePolyphonicFingeringProvenance(
  parsedDocument,
  sourceConfigurationProvenance = null,
  runtime = null,
) {
  checkpoint(runtime, 'polyphonic-fingering-provenance:start');
  if (
    !parsedDocument
    || parsedDocument.documentType !== 'ParsedMusicXmlDocument'
    || parsedDocument.contractVersion !== '1.0.0'
    || !parsedDocument.root
    || parsedDocument.root.name !== 'score-partwise'
  ) {
    throw invalid('Expected ParsedMusicXmlDocument score-partwise input.');
  }
  const guitarStaffKeys = explicitGuitarStaffKeys(sourceConfigurationProvenance);
  const records = [];
  const issues = [];
  let partIndex = 0;
  const rootChildren = parsedDocument.root.children.map((child) => {
    if (child.uri === parsedDocument.root.uri && child.name === 'part') {
      const normalized = normalizePart(child, partIndex, guitarStaffKeys, records, issues, runtime);
      partIndex += 1;
      return normalized;
    }
    return cloneNode(child);
  });
  const normalizedDocument = {
    documentType: parsedDocument.documentType,
    contractVersion: parsedDocument.contractVersion,
    root: cloneNode(parsedDocument.root, rootChildren),
  };
  checkpoint(runtime, 'polyphonic-fingering-provenance:complete', {
    recordCount: records.length,
    issueCount: issues.length,
  });
  return Object.freeze({
    documentType: 'PolyphonicFingeringNormalization',
    contractVersion: POLYPHONIC_FINGERING_PROVENANCE_VERSION,
    parsedDocument: normalizedDocument,
    preliminaryRecords: Object.freeze(records),
    issues: Object.freeze(issues),
    ignoredFeatures: records.length > 0
      ? Object.freeze(['notation:technical:fingering-provenance'])
      : Object.freeze([]),
  });
}

function bindPolyphonicFingeringProvenance(normalization, graceOrnamentGroups, sourceModel, runtime = null) {
  checkpoint(runtime, 'polyphonic-fingering-provenance:bind:start');
  if (!normalization || normalization.documentType !== 'PolyphonicFingeringNormalization') {
    throw invalid('Expected PolyphonicFingeringNormalization input.');
  }
  const removedByMeasure = new Map();
  const graceIdByMeasureAndOrder = new Map();
  for (const group of graceOrnamentGroups || []) {
    let removed = removedByMeasure.get(group.measureIndex);
    if (!removed) {
      removed = [];
      removedByMeasure.set(group.measureIndex, removed);
    }
    for (const note of group.notes) {
      removed.push(note.originalSourceOrder);
      graceIdByMeasureAndOrder.set(`${group.measureIndex}:${note.originalSourceOrder}`, note.graceEventId);
    }
  }
  for (const removed of removedByMeasure.values()) removed.sort((left, right) => left - right);

  const sourceEventIds = new Set();
  for (const measure of sourceModel.measures) {
    for (const event of measure.events) sourceEventIds.add(event.sourceEventId);
  }
  const groupedEventIds = new Set();
  const grouping = createSimultaneousEventModel(sourceModel, runtime);
  for (const measure of grouping.measures) {
    for (const group of measure.groups) {
      if (group.sourceEventIds.length < 2) continue;
      for (const sourceEventId of group.sourceEventIds) groupedEventIds.add(sourceEventId);
    }
  }

  const constraintIndex = Object.create(null);
  const records = normalization.preliminaryRecords.map((record) => {
    const removed = removedByMeasure.get(record.measureIndex) || [];
    const graceEventId = graceIdByMeasureAndOrder.get(`${record.measureIndex}:${record.noteIndex}`) || null;
    let sourceEventId;
    let isGraceEvent = false;
    if (graceEventId) {
      sourceEventId = graceEventId;
      isGraceEvent = true;
    } else {
      let removedBefore = 0;
      while (removedBefore < removed.length && removed[removedBefore] < record.noteIndex) {
        removedBefore += 1;
      }
      const projectedSourceOrder = record.noteIndex - removedBefore;
      sourceEventId = createSourceEventId(record.partId, record.measureIndex, projectedSourceOrder);
      if (!sourceEventIds.has(sourceEventId)) {
        throw invalid('Fingering provenance could not bind to the projected source-event identity.', {
          partId: record.partId,
          measureIndex: record.measureIndex,
          noteIndex: record.noteIndex,
          projectedSourceOrder,
          sourceEventId,
        });
      }
    }

    let authorityClass = record.authorityClass;
    if (
      authorityClass === FINGERING_AUTHORITY.GUITAR_FINGERING_CANDIDATE
      && record.constraintEligible
      && !isGraceEvent
      && groupedEventIds.has(sourceEventId)
    ) {
      authorityClass = FINGERING_AUTHORITY.GUITAR_FINGERING_EXACT;
      if (Object.hasOwn(constraintIndex, sourceEventId)) {
        if (constraintIndex[sourceEventId] !== record.normalizedFinger) {
          throw invalid('Equivalent fingering records produced conflicting exact constraints.', {
            sourceEventId,
          });
        }
      } else {
        Object.defineProperty(constraintIndex, sourceEventId, {
          value: record.normalizedFinger,
          enumerable: true,
          writable: false,
          configurable: false,
        });
      }
    }

    return Object.freeze({
      sourceEventId,
      measureIndex: record.measureIndex,
      measureNumber: record.measureNumber,
      staff: record.staff,
      voice: record.voice,
      rawFingeringLexeme: record.rawFingeringLexeme,
      normalizedFinger: record.normalizedFinger,
      placement: record.placement,
      substitution: record.substitution,
      alternate: record.alternate,
      sourceAttributes: record.sourceAttributes,
      sourceInstrumentContext: record.sourceInstrumentContext,
      authorityClass,
      duplicateStatus: record.duplicateStatus,
      provenance: Object.freeze({
        ...record.provenance,
        isGraceEvent,
      }),
    });
  });
  Object.freeze(constraintIndex);

  const authorityCounts = Object.freeze(Object.fromEntries(
    Object.values(FINGERING_AUTHORITY).map((authorityClass) => [
      authorityClass,
      records.filter((record) => record.authorityClass === authorityClass).length,
    ]),
  ));
  const result = Object.freeze({
    documentType: POLYPHONIC_FINGERING_PROVENANCE_DOCUMENT_TYPE,
    contractVersion: POLYPHONIC_FINGERING_PROVENANCE_VERSION,
    status: records.length === 0 ? 'ABSENT' : 'EXPLICIT',
    authority: 'INSTRUMENT_AWARE_SOURCE_FINGERING_PROVENANCE',
    recordCount: records.length,
    records: Object.freeze(records),
    authorityCounts,
    exactConstraints: Object.freeze({
      documentType: 'ExactGuitarFingeringConstraints',
      contractVersion: EXACT_GUITAR_FINGERING_CONSTRAINTS_VERSION,
      authority: 'EXPLICIT_SOURCE_GUITAR_FINGERING_ONLY',
      constraintCount: Object.keys(constraintIndex).length,
      bySourceEventId: constraintIndex,
    }),
    issues: normalization.issues,
  });
  checkpoint(runtime, 'polyphonic-fingering-provenance:bind:complete', {
    recordCount: result.recordCount,
    exactConstraintCount: result.exactConstraints.constraintCount,
  });
  return result;
}

module.exports = {
  POLYPHONIC_FINGERING_PROVENANCE_VERSION,
  POLYPHONIC_FINGERING_PROVENANCE_DOCUMENT_TYPE,
  EXACT_GUITAR_FINGERING_CONSTRAINTS_VERSION,
  FINGERING_AUTHORITY,
  SOURCE_INSTRUMENT_CONTEXT,
  PolyphonicFingeringProvenanceError,
  normalizePolyphonicFingeringProvenance,
  bindPolyphonicFingeringProvenance,
};