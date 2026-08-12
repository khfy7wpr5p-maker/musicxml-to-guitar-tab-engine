'use strict';

const {
  createProcessingRuntime,
  resolveProcessingRuntime,
} = require('../core/processingRuntime');
const {
  XmlSafetyError,
} = require('../validation/xmlSafety');
const {
  validateParsedMusicXmlStructure,
} = require('./musicxmlDocumentAdapter');

const MUSICXML_SEMANTIC_RESOURCE_LIMIT_CODES = Object.freeze({
  maxMeasures: 'MUSICXML_MEASURE_LIMIT_EXCEEDED',
  maxEvents: 'MUSICXML_EVENT_LIMIT_EXCEEDED',
});

function createMusicXmlProcessingBudget(options = {}) {
  return createProcessingRuntime(options).budget;
}

function createMusicXmlProcessingRuntime(options = {}, runtimeOptions = {}) {
  return createProcessingRuntime(options, runtimeOptions);
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name);
}

function getAttribute(node, name) {
  const attribute = node.attributes.find(
    (candidate) => candidate.name === name && candidate.uri.length === 0,
  );
  return attribute ? attribute.value : undefined;
}

function semanticResourceLimitExceeded(field, limit, observed, location = {}) {
  const messages = {
    maxMeasures: 'MusicXML measure count exceeds the configured limit.',
    maxEvents: 'MusicXML event count exceeds the configured limit.',
  };

  return new XmlSafetyError(
    messages[field],
    MUSICXML_SEMANTIC_RESOURCE_LIMIT_CODES[field],
    Object.freeze({ field, limit, observed, ...location }),
  );
}

function enforceLimit(field, limit, observed, location = {}) {
  if (observed > limit) {
    throw semanticResourceLimitExceeded(field, limit, observed, location);
  }
}

function enforceMusicXmlSemanticResourceLimits(parsedDocument, runtime) {
  const processing = resolveProcessingRuntime({}, runtime);
  processing.checkpoint('semantic:start');
  const validation = validateParsedMusicXmlStructure(parsedDocument);
  processing.checkpoint('semantic:structure');
  const { limits } = processing.budget;

  enforceLimit(
    'maxMeasures',
    limits.maxMeasures,
    validation.measureCount,
  );

  const part = directChildren(parsedDocument.root, 'part')[0];
  const measureNodes = directChildren(part, 'measure');
  let eventCount = 0;

  for (const measureNode of measureNodes) {
    const measure = getAttribute(measureNode, 'number') ?? null;
    processing.checkpoint('semantic:measure', { measure });
    let eventIndex = 0;

    for (const child of measureNode.children) {
      if (child.name !== 'note' || child.uri !== measureNode.uri) {
        continue;
      }

      processing.checkpoint('semantic:event', { measure, eventIndex });
      eventCount += 1;
      enforceLimit(
        'maxEvents',
        limits.maxEvents,
        eventCount,
        { measure, eventIndex },
      );
      eventIndex += 1;
    }
  }

  processing.checkpoint('semantic:complete');
  return validation;
}

module.exports = {
  MUSICXML_SEMANTIC_RESOURCE_LIMIT_CODES,
  createMusicXmlProcessingBudget,
  createMusicXmlProcessingRuntime,
  enforceMusicXmlSemanticResourceLimits,
};
