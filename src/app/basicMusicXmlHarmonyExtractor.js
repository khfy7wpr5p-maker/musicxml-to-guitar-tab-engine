'use strict';

const { EngineError } = require('../errors/engineError');

const BASIC_MUSICXML_HARMONY_EXTRACTION_VERSION = '1.0.0';
const MAX_EXPLICIT_HARMONIES = 4000;
const SUPPORTED_KINDS = new Set([
  'major',
  'minor',
  'diminished',
  'augmented',
  'dominant',
  'major-seventh',
  'minor-seventh',
  'half-diminished',
  'diminished-seventh',
]);
const STEPS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

class BasicMusicXmlHarmonyExtractionError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'UNSUPPORTED_BASIC_MUSICXML_HARMONY',
      Object.freeze({ ...details }),
      'BasicMusicXmlHarmonyExtractionError',
    );
  }
}

function unsupported(message, reason, details = {}) {
  return new BasicMusicXmlHarmonyExtractionError(message, { reason, ...details });
}

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function single(node, name, location, optional = false) {
  const matches = directChildren(node, name);
  if (matches.length === 0 && optional) return null;
  if (matches.length !== 1) {
    throw unsupported('Basic harmony child count is unsupported.', 'INVALID_CHILD_COUNT', {
      ...location,
      field: name,
      observedCount: matches.length,
    });
  }
  return matches[0];
}

function scalarText(node, field, location) {
  if (node.children.some((child) => child.uri === node.uri)) {
    throw unsupported('Basic harmony scalar contains nested MusicXML.', 'NESTED_SCALAR', {
      ...location,
      field,
    });
  }
  const value = node.text.trim();
  if (value.length === 0 || value.length > 32) {
    throw unsupported('Basic harmony scalar text is invalid.', 'INVALID_SCALAR_TEXT', {
      ...location,
      field,
    });
  }
  return value;
}

function parseAlter(node, field, location) {
  if (!node) return 0;
  const value = scalarText(node, field, location);
  if (!/^-?\d+$/.test(value)) {
    throw unsupported('Harmony alteration must be an integer.', 'INVALID_ALTER', {
      ...location,
      field,
    });
  }
  const alter = Number.parseInt(value, 10);
  if (!Number.isInteger(alter) || alter < -2 || alter > 2) {
    throw unsupported('Harmony alteration is outside the basic spelling range.', 'INVALID_ALTER', {
      ...location,
      field,
      alter,
    });
  }
  return alter;
}

function parseSpelling(container, prefix, location) {
  if (container.attributes.some((attribute) => attribute.uri.length === 0)) {
    throw unsupported('Semantic harmony containers cannot carry attributes.', 'UNSUPPORTED_ATTRIBUTES', {
      ...location,
      field: prefix,
    });
  }
  const stepNode = single(container, `${prefix}-step`, location);
  const alterNode = single(container, `${prefix}-alter`, location, true);
  const allowed = new Set([`${prefix}-step`, `${prefix}-alter`]);
  const unknown = container.children.find(
    (child) => child.uri === container.uri && !allowed.has(child.name),
  );
  if (unknown) {
    throw unsupported('Harmony spelling contains an unsupported child.', 'UNSUPPORTED_SPELLING_CHILD', {
      ...location,
      field: unknown.name,
    });
  }
  const step = scalarText(stepNode, `${prefix}-step`, location);
  if (!STEPS.has(step)) {
    throw unsupported('Harmony step is invalid.', 'INVALID_STEP', { ...location, step });
  }
  return Object.freeze({
    step,
    alter: parseAlter(alterNode, `${prefix}-alter`, location),
  });
}

function parseHarmony(node, measureIndex, nextSourceOrder) {
  const location = { measureIndex, sourceOrder: nextSourceOrder };
  const allowedAttributes = new Set([
    'default-x', 'default-y', 'relative-x', 'relative-y', 'placement', 'print-object', 'color',
  ]);
  const unknownAttribute = node.attributes.find(
    (attribute) => attribute.uri.length === 0 && !allowedAttributes.has(attribute.name),
  );
  if (unknownAttribute) {
    throw unsupported('Harmony carries an unsupported attribute.', 'UNSUPPORTED_ATTRIBUTES', {
      ...location,
      field: unknownAttribute.name,
    });
  }

  const rootNode = single(node, 'root', location);
  const kindNode = single(node, 'kind', location);
  const bassNode = single(node, 'bass', location, true);
  const staffNode = single(node, 'staff', location, true);
  const allowedChildren = new Set(['root', 'kind', 'bass', 'staff']);
  const unknownChild = node.children.find(
    (child) => child.uri === node.uri && !allowedChildren.has(child.name),
  );
  if (unknownChild) {
    throw unsupported('Harmony contains semantics outside the basic profile.', 'UNSUPPORTED_HARMONY_CHILD', {
      ...location,
      field: unknownChild.name,
    });
  }
  if (kindNode.attributes.some((attribute) => (
    attribute.uri.length === 0 && attribute.name !== 'text'
  ))) {
    throw unsupported('Harmony kind carries an unsupported attribute.', 'UNSUPPORTED_ATTRIBUTES', {
      ...location,
      field: 'kind',
    });
  }
  const kind = scalarText(kindNode, 'kind', location);
  if (!SUPPORTED_KINDS.has(kind)) {
    throw unsupported('Harmony kind is outside the basic vocabulary.', 'UNSUPPORTED_KIND', {
      ...location,
      kind,
    });
  }
  if (staffNode && scalarText(staffNode, 'staff', location) !== '1') {
    throw unsupported('Basic harmony must target notation staff 1.', 'UNSUPPORTED_STAFF', location);
  }
  return Object.freeze({
    measureIndex,
    nextSourceOrder,
    root: parseSpelling(rootNode, 'root', location),
    kind,
    bass: bassNode ? parseSpelling(bassNode, 'bass', location) : null,
  });
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') pending.push(value);
    }
    Object.freeze(current);
  }
  return root;
}

function extractBasicMusicXmlHarmony(parsedDocument, runtime = null) {
  if (runtime) runtime.checkpoint('basic-musicxml-harmony:start');
  const part = parsedDocument.root.children.find(
    (child) => child.uri === parsedDocument.root.uri && child.name === 'part',
  );
  const measures = part
    ? part.children.filter((child) => child.uri === part.uri && child.name === 'measure')
    : [];
  const references = [];
  let observedHarmony = false;

  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    let sourceOrder = 0;
    for (const child of measures[measureIndex].children) {
      if (child.uri !== measures[measureIndex].uri) continue;
      if (child.name === 'harmony') {
        observedHarmony = true;
        references.push(parseHarmony(child, measureIndex, sourceOrder));
        if (references.length > MAX_EXPLICIT_HARMONIES) {
          throw unsupported('Explicit harmony count exceeds the fixed boundary.', 'HARMONY_LIMIT', {
            limit: MAX_EXPLICIT_HARMONIES,
            observed: references.length,
          });
        }
      } else if (child.name === 'note') {
        sourceOrder += 1;
      }
    }
  }

  let outputDocument = parsedDocument;
  if (observedHarmony) {
    function cloneScoped(node) {
      const isMeasure = node.name === 'measure';
      return {
        name: node.name,
        uri: node.uri,
        attributes: node.attributes.map((attribute) => ({ ...attribute })),
        text: node.text,
        children: node.children
          .filter((child) => !(isMeasure && child.uri === node.uri && child.name === 'harmony'))
          .map(cloneScoped),
      };
    }
    outputDocument = deepFreeze({
      documentType: parsedDocument.documentType,
      contractVersion: parsedDocument.contractVersion,
      root: cloneScoped(parsedDocument.root),
    });
  }

  const result = Object.freeze({
    contractVersion: BASIC_MUSICXML_HARMONY_EXTRACTION_VERSION,
    parsedDocument: outputDocument,
    references: Object.freeze(references),
  });
  if (runtime) runtime.checkpoint('basic-musicxml-harmony:complete', { count: references.length });
  return result;
}

function resolveBasicMusicXmlHarmonyReferences(references, sourceModel) {
  return Object.freeze(references.map((reference, index) => {
    const measure = sourceModel.measures[reference.measureIndex];
    const event = measure && measure.events[reference.nextSourceOrder];
    if (!event) {
      throw unsupported('Explicit harmony does not precede a source event.', 'UNRESOLVED_ONSET', {
        index,
        measureIndex: reference.measureIndex,
        sourceOrder: reference.nextSourceOrder,
      });
    }
    return Object.freeze({
      measureIndex: reference.measureIndex,
      onsetDivisions: event.onsetDivisions,
      root: reference.root,
      kind: reference.kind,
      bass: reference.bass,
    });
  }));
}

module.exports = {
  BASIC_MUSICXML_HARMONY_EXTRACTION_VERSION,
  MAX_EXPLICIT_HARMONIES,
  BasicMusicXmlHarmonyExtractionError,
  extractBasicMusicXmlHarmony,
  resolveBasicMusicXmlHarmonyReferences,
};
