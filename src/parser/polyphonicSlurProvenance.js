'use strict';

const { EngineError } = require('../errors/engineError');
const { createSourceEventId } = require('../music/polyphonicSourceModel');

const POLYPHONIC_SLUR_PROVENANCE_VERSION = '1.0.0';
const POLYPHONIC_SLUR_PROVENANCE_DOCUMENT_TYPE = 'PolyphonicSlurProvenance';
const MAX_LAYOUT_ABS = 1_000_000;
const MAX_PRESENTATION_TEXT = 256;

const SEMANTIC_ATTRIBUTES = new Set(['type', 'number']);
const PRESENTATION_ATTRIBUTES = new Set([
  'bezier-x',
  'bezier-y',
  'bezier-x2',
  'bezier-y2',
  'bezier-offset',
  'bezier-offset2',
  'default-x',
  'default-y',
  'relative-x',
  'relative-y',
  'placement',
  'orientation',
  'line-type',
  'dash-length',
  'space-length',
  'color',
  'font-family',
  'font-style',
  'font-size',
  'font-weight',
]);
const ALLOWED_ATTRIBUTES = new Set([...SEMANTIC_ATTRIBUTES, ...PRESENTATION_ATTRIBUTES]);
const NUMERIC_PRESENTATION_ATTRIBUTES = new Set([
  'bezier-x',
  'bezier-y',
  'bezier-x2',
  'bezier-y2',
  'bezier-offset',
  'bezier-offset2',
  'default-x',
  'default-y',
  'relative-x',
  'relative-y',
  'dash-length',
  'space-length',
]);

class PolyphonicSlurProvenanceError extends EngineError {
  constructor(message, details = {}, code = 'INVALID_POLYPHONIC_SLUR_PROVENANCE') {
    super(
      message,
      code,
      Object.freeze({ ...details }),
      'PolyphonicSlurProvenanceError',
    );
  }
}

function fail(message, details = {}) {
  throw new PolyphonicSlurProvenanceError(message, details);
}

function unsupportedSlur(context) {
  throw new PolyphonicSlurProvenanceError(
    'MusicXML slur is outside the bounded semantic/layout provenance profile.',
    {
      feature: 'notation:slur',
      partId: context.partId,
      measure: context.measureNumber,
      measureIndex: context.measureIndex,
      eventIndex: context.noteIndex,
    },
    'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE',
  );
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

function scalarNoteText(note, name) {
  const nodes = directChildren(note, name);
  if (nodes.length !== 1) return null;
  const node = nodes[0];
  if (node.attributes.length !== 0 || node.children.length !== 0) return null;
  const value = node.text.trim();
  return value.length > 0 && value.length <= 64 && !/\s/.test(value) ? value : null;
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

function boundedNumeric(value) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value || '')) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric) <= MAX_LAYOUT_ABS;
}

function validFontSize(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 32) return false;
  if (/^(?:xx-small|x-small|small|medium|large|x-large|xx-large)$/.test(value)) return true;
  return /^\d+(?:\.\d+)?$/.test(value) && Number(value) <= 1000;
}

function validPresentationAttribute(name, value) {
  if (NUMERIC_PRESENTATION_ATTRIBUTES.has(name)) return boundedNumeric(value);
  if (name === 'placement') return value === 'above' || value === 'below';
  if (name === 'orientation') return value === 'over' || value === 'under';
  if (name === 'line-type') return ['solid', 'dashed', 'dotted', 'wavy'].includes(value);
  if (name === 'color') return /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(value);
  if (name === 'font-style') return value === 'normal' || value === 'italic';
  if (name === 'font-weight') return value === 'normal' || value === 'bold';
  if (name === 'font-size') return validFontSize(value);
  if (name === 'font-family') return value.length > 0 && value.length <= MAX_PRESENTATION_TEXT;
  return false;
}

function parseSupportedSlur(node, context, slurIndex) {
  if (node.children.length !== 0 || node.text.trim().length !== 0) return null;
  const sourceAttributes = Object.create(null);
  for (const entry of node.attributes) {
    if (
      entry.uri.length !== 0
      || !ALLOWED_ATTRIBUTES.has(entry.name)
      || Object.hasOwn(sourceAttributes, entry.name)
      || entry.value.length > MAX_PRESENTATION_TEXT
    ) return null;
    sourceAttributes[entry.name] = entry.value;
  }

  const type = sourceAttributes.type;
  if (!['start', 'stop', 'continue'].includes(type)) return null;
  const rawNumber = sourceAttributes.number ?? null;
  const number = rawNumber ?? '1';
  if (!/^\d+$/.test(number) || Number(number) < 1 || Number(number) > 16) return null;

  const presentationMetadata = Object.create(null);
  for (const name of PRESENTATION_ATTRIBUTES) {
    if (!Object.hasOwn(sourceAttributes, name)) continue;
    if (!validPresentationAttribute(name, sourceAttributes[name])) return null;
    presentationMetadata[name] = sourceAttributes[name];
  }

  return Object.freeze({
    sourceEventId: null,
    partIndex: context.partIndex,
    partId: context.partId,
    measureIndex: context.measureIndex,
    measureNumber: context.measureNumber,
    noteIndex: context.noteIndex,
    voice: context.voice,
    staff: context.staff,
    type,
    number,
    rawNumber,
    sourceAttributes: Object.freeze({ ...sourceAttributes }),
    presentationMetadata: Object.freeze({ ...presentationMetadata }),
    provenance: Object.freeze({
      sourcePath: 'note/notations/slur',
      partIndex: context.partIndex,
      measureIndex: context.measureIndex,
      noteIndex: context.noteIndex,
      notationsIndex: context.notationsIndex,
      slurIndex,
    }),
  });
}

function normalizeNotations(notations, context, records) {
  const children = [];
  let slurIndex = 0;
  for (const child of notations.children) {
    if (child.uri === notations.uri && child.name === 'slur') {
      const parsed = parseSupportedSlur(child, context, slurIndex);
      slurIndex += 1;
      if (!parsed) unsupportedSlur(context);
      records.push(parsed);
      continue;
    }
    children.push(cloneNode(child));
  }
  if (children.length === 0 && notations.attributes.length === 0 && notations.text.trim().length === 0) {
    return null;
  }
  return cloneNode(notations, children);
}

function normalizeNote(note, context, records) {
  const voice = scalarNoteText(note, 'voice');
  const staff = scalarNoteText(note, 'staff');
  const children = [];
  let notationsIndex = 0;
  for (const child of note.children) {
    if (child.uri === note.uri && child.name === 'notations') {
      const normalized = normalizeNotations(
        child,
        { ...context, voice, staff, notationsIndex },
        records,
      );
      notationsIndex += 1;
      if (normalized) children.push(normalized);
    } else {
      children.push(cloneNode(child));
    }
  }
  return cloneNode(note, children);
}

function normalizeMeasure(measure, context, records) {
  const children = [];
  let noteIndex = 0;
  for (const child of measure.children) {
    if (child.uri === measure.uri && child.name === 'note') {
      children.push(normalizeNote(child, { ...context, noteIndex }, records));
      noteIndex += 1;
    } else {
      children.push(cloneNode(child));
    }
  }
  return cloneNode(measure, children);
}

function normalizePart(part, partIndex, records) {
  const partId = attribute(part, 'id');
  const children = [];
  let measureIndex = 0;
  for (const child of part.children) {
    if (child.uri === part.uri && child.name === 'measure') {
      children.push(normalizeMeasure(child, {
        partIndex,
        partId,
        measureIndex,
        measureNumber: attribute(child, 'number') ?? String(measureIndex + 1),
      }, records));
      measureIndex += 1;
    } else {
      children.push(cloneNode(child));
    }
  }
  return cloneNode(part, children);
}

function normalizePolyphonicSlurProvenance(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-slur-provenance:start');
  if (
    !parsedDocument
    || parsedDocument.documentType !== 'ParsedMusicXmlDocument'
    || parsedDocument.contractVersion !== '1.0.0'
    || !parsedDocument.root
    || parsedDocument.root.name !== 'score-partwise'
  ) fail('Expected ParsedMusicXmlDocument score-partwise input.');

  const records = [];
  let partIndex = 0;
  const rootChildren = parsedDocument.root.children.map((child) => {
    if (child.uri === parsedDocument.root.uri && child.name === 'part') {
      const normalized = normalizePart(child, partIndex, records);
      partIndex += 1;
      return normalized;
    }
    return cloneNode(child);
  });
  const parsedNormalized = {
    documentType: parsedDocument.documentType,
    contractVersion: parsedDocument.contractVersion,
    root: cloneNode(parsedDocument.root, rootChildren),
  };
  checkpoint(runtime, 'polyphonic-slur-provenance:complete', { recordCount: records.length });
  return Object.freeze({
    documentType: 'PolyphonicSlurNormalization',
    contractVersion: POLYPHONIC_SLUR_PROVENANCE_VERSION,
    parsedDocument: parsedNormalized,
    preliminaryRecords: Object.freeze(records),
    ignoredFeatures: records.length > 0
      ? Object.freeze(['notation:slur', 'notation:slur-provenance'])
      : Object.freeze([]),
  });
}

function locatedIssue(code, message, record, details = {}) {
  return Object.freeze({
    severity: 'error',
    category: 'semantic',
    code,
    message,
    reviewDisposition: 'REVIEW_REQUIRED',
    location: Object.freeze({
      measure: record.measureNumber,
      measureIndex: record.measureIndex,
      eventIndex: record.noteIndex,
      sourceEventId: record.sourceEventId,
    }),
    details: Object.freeze({
      partId: record.partId,
      voice: record.voice,
      staff: record.staff,
      slurNumber: record.number,
      slurType: record.type,
      ...details,
    }),
  });
}

function bindSourceEventIds(normalization, graceOrnamentGroups, sourceModel) {
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

  return Object.freeze(normalization.preliminaryRecords.map((record) => {
    const graceEventId = graceIdByMeasureAndOrder.get(`${record.measureIndex}:${record.noteIndex}`) || null;
    let sourceEventId = graceEventId;
    const isGraceEvent = graceEventId !== null;
    if (!sourceEventId) {
      const removed = removedByMeasure.get(record.measureIndex) || [];
      let removedBefore = 0;
      while (removedBefore < removed.length && removed[removedBefore] < record.noteIndex) removedBefore += 1;
      const projectedSourceOrder = record.noteIndex - removedBefore;
      sourceEventId = createSourceEventId(record.partId, record.measureIndex, projectedSourceOrder);
      if (!sourceEventIds.has(sourceEventId)) {
        fail('Slur provenance could not bind to the projected source-event identity.', {
          partId: record.partId,
          measureIndex: record.measureIndex,
          noteIndex: record.noteIndex,
          projectedSourceOrder,
          sourceEventId,
        });
      }
    }
    return Object.freeze({
      ...record,
      sourceEventId,
      provenance: Object.freeze({ ...record.provenance, isGraceEvent }),
    });
  }));
}

function pairBoundSlurs(records) {
  const issues = [];
  const spans = [];
  const openByKey = new Map();
  const stackByContext = new Map();

  const contextKey = (record) => `${record.partIndex}\u0000${record.voice}\u0000${record.staff}`;
  const pairKey = (record) => `${contextKey(record)}\u0000${record.number}`;

  for (const record of records) {
    if (record.voice === null || record.staff === null) {
      issues.push(locatedIssue(
        'AMBIGUOUS_SLUR_CONTEXT',
        'Slur pairing requires explicit voice and staff context.',
        record,
      ));
      continue;
    }

    const key = pairKey(record);
    const cKey = contextKey(record);
    let stack = stackByContext.get(cKey);
    if (!stack) {
      stack = [];
      stackByContext.set(cKey, stack);
    }

    if (record.type === 'start') {
      if (openByKey.has(key)) {
        issues.push(locatedIssue(
          'DUPLICATE_SLUR_START',
          'A slur start appeared before the prior slur with the same number and context was closed.',
          record,
        ));
        continue;
      }
      const state = { start: record, continues: [] };
      openByKey.set(key, state);
      stack.push(key);
      continue;
    }

    if (record.type === 'continue') {
      const state = openByKey.get(key);
      if (!state) {
        issues.push(locatedIssue(
          'ORPHAN_SLUR_CONTINUE',
          'A slur continue marker has no compatible open start.',
          record,
        ));
      } else {
        state.continues.push(record);
      }
      continue;
    }

    const state = openByKey.get(key);
    if (!state) {
      issues.push(locatedIssue(
        'ORPHAN_SLUR_STOP',
        'A slur stop marker has no compatible open start in the same part, voice, staff and number.',
        record,
      ));
      continue;
    }

    if (stack[stack.length - 1] !== key) {
      issues.push(locatedIssue(
        'CROSSING_SLUR_ENDPOINTS',
        'Slur endpoints cross within one voice/staff context and require review.',
        record,
        { openOrder: Object.freeze([...stack]) },
      ));
    }
    const stackIndex = stack.lastIndexOf(key);
    if (stackIndex >= 0) stack.splice(stackIndex, 1);
    openByKey.delete(key);

    const spanId = `slur:${record.partId}:${spans.length}`;
    spans.push(Object.freeze({
      spanId,
      number: record.number,
      partId: record.partId,
      partIndex: record.partIndex,
      voice: record.voice,
      staff: record.staff,
      startSourceEventId: state.start.sourceEventId,
      stopSourceEventId: record.sourceEventId,
      continueSourceEventIds: Object.freeze(state.continues.map((entry) => entry.sourceEventId)),
      authority: 'ARTICULATION_METADATA_ONLY',
      affectsDuration: false,
      createsTie: false,
      createsGuitarTechnique: false,
      solverAuthority: false,
    }));
  }

  for (const state of openByKey.values()) {
    issues.push(locatedIssue(
      'ORPHAN_SLUR_START',
      'A slur start marker has no compatible stop in the same part, voice, staff and number.',
      state.start,
    ));
  }

  return Object.freeze({ spans: Object.freeze(spans), issues: Object.freeze(issues) });
}

function bindPolyphonicSlurProvenance(normalization, graceOrnamentGroups, sourceModel, runtime = null) {
  checkpoint(runtime, 'polyphonic-slur-provenance:bind:start');
  if (!normalization || normalization.documentType !== 'PolyphonicSlurNormalization') {
    fail('Expected PolyphonicSlurNormalization input.');
  }
  const records = bindSourceEventIds(normalization, graceOrnamentGroups, sourceModel);
  const paired = pairBoundSlurs(records);
  const result = Object.freeze({
    documentType: POLYPHONIC_SLUR_PROVENANCE_DOCUMENT_TYPE,
    contractVersion: POLYPHONIC_SLUR_PROVENANCE_VERSION,
    status: records.length === 0 ? 'ABSENT' : (paired.issues.length === 0 ? 'EXPLICIT' : 'REVIEW_REQUIRED'),
    authority: 'ARTICULATION_METADATA_ONLY',
    recordCount: records.length,
    spanCount: paired.spans.length,
    records,
    spans: paired.spans,
    issues: paired.issues,
    affectsDuration: false,
    createsTie: false,
    createsGuitarTechnique: false,
    solverAuthority: false,
  });
  checkpoint(runtime, 'polyphonic-slur-provenance:bind:complete', {
    recordCount: result.recordCount,
    spanCount: result.spanCount,
    issueCount: result.issues.length,
  });
  return result;
}

module.exports = {
  POLYPHONIC_SLUR_PROVENANCE_VERSION,
  POLYPHONIC_SLUR_PROVENANCE_DOCUMENT_TYPE,
  PolyphonicSlurProvenanceError,
  normalizePolyphonicSlurProvenance,
  bindPolyphonicSlurProvenance,
};
