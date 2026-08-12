'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
  validatePolyphonicSourceModel,
} = require('./polyphonicSourceModel');
const {
  SIMULTANEOUS_EVENT_MODEL_VERSION,
  SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE,
  createSimultaneousEventModel,
} = require('./simultaneousEventModel');

const GUITAR_ARRANGEMENT_PLAN_VERSION = '1.0.0';
const GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE = 'GuitarArrangementPlan';

const ARRANGEMENT_DECISION_TYPES = Object.freeze([
  'PRESERVED',
  'OMITTED',
  'OCTAVE_DISPLACED',
  'VOICE_REDISTRIBUTED',
  'CHORD_REDUCED',
  'REVOICED',
  'ARPEGGIATED',
]);

const SINGLE_EVENT_DECISION_TYPES = new Set([
  'PRESERVED',
  'OMITTED',
  'OCTAVE_DISPLACED',
  'VOICE_REDISTRIBUTED',
]);

const GROUP_DECISION_TYPES = new Set([
  'CHORD_REDUCED',
  'REVOICED',
  'ARPEGGIATED',
]);

const DECISION_FIELDS = new Set([
  'decisionType',
  'sourceEventIds',
  'sourceGroupId',
]);

class GuitarArrangementPlanError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_GUITAR_ARRANGEMENT_PLAN',
      Object.freeze({ ...details }),
      'GuitarArrangementPlanError',
    );
  }
}

function invalid(message, details = {}) {
  return new GuitarArrangementPlanError(message, details);
}

function safeIsProxy(value, path) {
  try {
    return isProxy(value);
  } catch {
    throw invalid('Arrangement decision data cannot be safely inspected.', { path });
  }
}

function safeIsArray(value, path) {
  try {
    return Array.isArray(value);
  } catch {
    throw invalid('Arrangement decision data cannot be safely inspected.', { path });
  }
}

function safeOwnKeys(value, path) {
  try {
    return Reflect.ownKeys(value);
  } catch {
    throw invalid('Arrangement decision data cannot be safely inspected.', { path });
  }
}

function safePrototype(value, path) {
  try {
    return Object.getPrototypeOf(value);
  } catch {
    throw invalid('Arrangement decision data cannot be safely inspected.', { path });
  }
}

function safeDescriptor(value, key, path) {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw invalid('Arrangement decision data cannot be safely inspected.', { path });
  }
}

function assertPlainRecord(value, path, allowedFields) {
  if (
    value === null
    || typeof value !== 'object'
    || safeIsProxy(value, path)
    || safeIsArray(value, path)
  ) {
    throw invalid('Arrangement decision must be a non-proxy plain object.', { path });
  }

  const prototype = safePrototype(value, path);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid('Arrangement decision must be a plain object.', { path });
  }

  const keys = safeOwnKeys(value, path);
  const observedFields = new Set();
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid('Arrangement decision cannot contain symbol fields.', { path });
    }
    if (!allowedFields.has(key)) {
      throw invalid('Arrangement decision contains an unknown field.', {
        path,
        field: key,
      });
    }

    const descriptor = safeDescriptor(value, key, `${path}.${key}`);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('Arrangement decision fields must be enumerable data properties.', {
        path,
        field: key,
      });
    }
    observedFields.add(key);
  }

  for (const field of allowedFields) {
    if (!observedFields.has(field)) {
      throw invalid('Arrangement decision is missing a required field.', {
        path,
        field,
      });
    }
  }
}

function assertDenseOrdinaryArray(value, path) {
  if (
    safeIsProxy(value, path)
    || !safeIsArray(value, path)
    || safePrototype(value, path) !== Array.prototype
  ) {
    throw invalid('Arrangement decision lists must be non-proxy ordinary arrays.', { path });
  }

  const keys = safeOwnKeys(value, path);
  for (const key of keys) {
    if (key === 'length') {
      continue;
    }
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) {
      throw invalid('Arrangement decision arrays cannot contain custom fields.', {
        path,
        field: typeof key === 'string' ? key : '<symbol>',
      });
    }
  }

  const lengthDescriptor = safeDescriptor(value, 'length', `${path}.length`);
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw invalid('Arrangement decision array length is invalid.', { path });
  }
  const length = lengthDescriptor.value;

  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = safeDescriptor(value, key, `${path}[${index}]`);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('Arrangement decision arrays must be dense data arrays.', {
        path,
        index,
      });
    }
  }

  return length;
}

function readDataField(record, field, path) {
  const descriptor = safeDescriptor(record, field, `${path}.${field}`);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw invalid('Arrangement decision fields must be data properties.', {
      path,
      field,
    });
  }
  return descriptor.value;
}

function collectSourceNotes(source, runtime) {
  const notes = [];
  const byId = new Map();
  let sourceOrder = 0;

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    const measure = source.measures[measureIndex];
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      if (runtime) {
        runtime.checkpoint('guitar-arrangement-plan:source-event', {
          measureIndex,
          eventIndex,
        });
      }

      const event = measure.events[eventIndex];
      if (event.type !== 'note') {
        continue;
      }
      const entry = Object.freeze({
        event,
        sourceOrder,
      });
      notes.push(entry);
      byId.set(event.sourceEventId, entry);
      sourceOrder += 1;
    }
  }

  return { notes, byId };
}

function collectGroups(grouping, runtime) {
  const byId = new Map();
  for (let measureIndex = 0; measureIndex < grouping.measures.length; measureIndex += 1) {
    const measure = grouping.measures[measureIndex];
    for (let groupIndex = 0; groupIndex < measure.groups.length; groupIndex += 1) {
      if (runtime) {
        runtime.checkpoint('guitar-arrangement-plan:group', {
          measureIndex,
          groupIndex,
        });
      }
      const group = measure.groups[groupIndex];
      byId.set(group.groupId, group);
    }
  }
  return byId;
}

function assertExactStringArray(value, path) {
  const length = assertDenseOrdinaryArray(value, path);
  if (length === 0) {
    throw invalid('sourceEventIds must contain at least one source note id.', { path });
  }

  const result = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = safeDescriptor(value, String(index), `${path}[${index}]`);
    const item = descriptor.value;
    if (typeof item !== 'string' || item.length === 0 || item.length > 256) {
      throw invalid('sourceEventIds must contain bounded non-empty strings.', {
        path,
        index,
      });
    }
    result[index] = item;
  }
  return result;
}

function createGuitarArrangementPlan(sourceModel, decisions, runtime = null) {
  if (runtime) {
    runtime.checkpoint('guitar-arrangement-plan:start');
  }

  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const grouping = createSimultaneousEventModel(source, runtime);
  const { notes, byId: sourceNotesById } = collectSourceNotes(source, runtime);
  const groupsById = collectGroups(grouping, runtime);

  const decisionCount = assertDenseOrdinaryArray(decisions, 'decisions');
  if (decisionCount > notes.length) {
    throw invalid('Arrangement decision count cannot exceed source note count.', {
      field: 'decisions',
      limit: notes.length,
      observed: decisionCount,
    });
  }

  const covered = new Set();
  const normalized = new Array(decisionCount);
  let previousFirstSourceOrder = -1;

  for (let decisionIndex = 0; decisionIndex < decisionCount; decisionIndex += 1) {
    if (runtime) {
      runtime.checkpoint('guitar-arrangement-plan:decision', { decisionIndex });
    }

    const path = `decisions[${decisionIndex}]`;
    const descriptor = safeDescriptor(decisions, String(decisionIndex), path);
    const rawDecision = descriptor.value;
    assertPlainRecord(rawDecision, path, DECISION_FIELDS);

    const decisionType = readDataField(rawDecision, 'decisionType', path);
    const rawSourceEventIds = readDataField(rawDecision, 'sourceEventIds', path);
    const sourceGroupId = readDataField(rawDecision, 'sourceGroupId', path);

    if (typeof decisionType !== 'string' || !ARRANGEMENT_DECISION_TYPES.includes(decisionType)) {
      throw invalid('Arrangement decision type is not supported.', {
        path,
        field: 'decisionType',
      });
    }

    const sourceEventIds = assertExactStringArray(rawSourceEventIds, `${path}.sourceEventIds`);
    const sourceEntries = new Array(sourceEventIds.length);
    for (let memberIndex = 0; memberIndex < sourceEventIds.length; memberIndex += 1) {
      if (runtime) {
        runtime.checkpoint('guitar-arrangement-plan:decision-member', {
          decisionIndex,
          memberIndex,
        });
      }

      const sourceEventId = sourceEventIds[memberIndex];
      const sourceEntry = sourceNotesById.get(sourceEventId);
      if (!sourceEntry) {
        throw invalid('Arrangement decision references an unknown or non-note source event.', {
          path,
          field: 'sourceEventIds',
          sourceEventId,
        });
      }
      if (covered.has(sourceEventId)) {
        throw invalid('A source note cannot be covered by more than one arrangement decision.', {
          path,
          sourceEventId,
        });
      }
      if (memberIndex > 0 && sourceEntries[memberIndex - 1].sourceOrder >= sourceEntry.sourceOrder) {
        throw invalid('sourceEventIds must preserve canonical source order.', {
          path,
          field: 'sourceEventIds',
        });
      }
      sourceEntries[memberIndex] = sourceEntry;
    }

    if (SINGLE_EVENT_DECISION_TYPES.has(decisionType)) {
      if (sourceEventIds.length !== 1 || sourceGroupId !== null) {
        throw invalid('Single-note decisions require exactly one source note and null sourceGroupId.', {
          path,
          decisionType,
        });
      }
    } else if (GROUP_DECISION_TYPES.has(decisionType)) {
      if (typeof sourceGroupId !== 'string' || sourceGroupId.length === 0 || sourceGroupId.length > 256) {
        throw invalid('Group decisions require one bounded PA-3 sourceGroupId.', {
          path,
          decisionType,
        });
      }
      const group = groupsById.get(sourceGroupId);
      if (!group) {
        throw invalid('Group decision references an unknown PA-3 simultaneous group.', {
          path,
          sourceGroupId,
        });
      }
      if (group.sourceEventIds.length !== sourceEventIds.length) {
        throw invalid('Group decision must cover every member of exactly one PA-3 group.', {
          path,
          sourceGroupId,
        });
      }
      for (let memberIndex = 0; memberIndex < sourceEventIds.length; memberIndex += 1) {
        if (group.sourceEventIds[memberIndex] !== sourceEventIds[memberIndex]) {
          throw invalid('Group decision membership must exactly match PA-3 source order.', {
            path,
            sourceGroupId,
            memberIndex,
          });
        }
      }
    }

    const firstSourceOrder = sourceEntries[0].sourceOrder;
    if (firstSourceOrder <= previousFirstSourceOrder) {
      throw invalid('Arrangement decisions must be ordered by earliest covered source event.', {
        path,
      });
    }
    previousFirstSourceOrder = firstSourceOrder;

    for (const sourceEventId of sourceEventIds) {
      covered.add(sourceEventId);
    }

    normalized[decisionIndex] = Object.freeze({
      decisionId: `${source.source.partId}:arrangement-decision:${decisionIndex}`,
      decisionType,
      sourceEventIds: Object.freeze(sourceEventIds),
      sourceGroupId,
    });
  }

  if (covered.size !== notes.length) {
    throw invalid('Every source note must be covered exactly once by the arrangement plan.', {
      field: 'decisions',
      expected: notes.length,
      observed: covered.size,
    });
  }

  if (runtime) {
    runtime.checkpoint('guitar-arrangement-plan:complete', {
      decisionCount: normalized.length,
    });
  }

  return Object.freeze({
    documentType: GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
    contractVersion: GUITAR_ARRANGEMENT_PLAN_VERSION,
    source: Object.freeze({
      documentType: POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
      contractVersion: POLYPHONIC_SOURCE_MODEL_VERSION,
      partId: source.source.partId,
    }),
    grouping: Object.freeze({
      documentType: SIMULTANEOUS_EVENT_MODEL_DOCUMENT_TYPE,
      contractVersion: SIMULTANEOUS_EVENT_MODEL_VERSION,
    }),
    decisionCount: normalized.length,
    decisions: Object.freeze(normalized),
  });
}

module.exports = {
  GUITAR_ARRANGEMENT_PLAN_VERSION,
  GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
  ARRANGEMENT_DECISION_TYPES,
  GuitarArrangementPlanError,
  createGuitarArrangementPlan,
};
