'use strict';

const REVIEW_DISPOSITION = 'REVIEW_REQUIRED';
const SAFE_ARTICULATION_NAMES = new Set([
  'accent',
  'detached-legato',
  'spiccato',
  'staccatissimo',
  'staccato',
  'tenuto',
]);
const REVIEW_ARTICULATION_NAMES = new Set(['strong-accent', 'caesura']);
const LAYOUT_ATTRIBUTES = new Set(['default-x', 'default-y', 'relative-x', 'relative-y']);

function cloneNode(node, overrides = {}) {
  return {
    name: overrides.name ?? node.name,
    uri: overrides.uri ?? node.uri,
    attributes: overrides.attributes ?? node.attributes.map((attribute) => ({ ...attribute })),
    text: overrides.text ?? node.text,
    children: overrides.children ?? node.children.map((child) => cloneNode(child)),
  };
}

function getAttribute(node, name) {
  const matches = node.attributes.filter((attribute) => attribute.uri.length === 0 && attribute.name === name);
  return matches.length === 1 ? matches[0].value : null;
}

function boundedLayoutNumber(value) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value || '')) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric) <= 1_000_000;
}

function validPlacement(value) {
  return value === null || value === 'above' || value === 'below';
}

function articulationShape(child, reviewable) {
  if (child.children.length !== 0 || child.text.trim().length !== 0) return null;
  const allowedSemantic = reviewable && child.name === 'strong-accent'
    ? new Set(['placement', 'type'])
    : new Set(['placement']);
  const semanticAttributes = [];
  let strippedLayout = false;
  for (const attribute of child.attributes) {
    if (attribute.uri.length !== 0) return null;
    if (LAYOUT_ATTRIBUTES.has(attribute.name)) {
      if (!boundedLayoutNumber(attribute.value)) return null;
      strippedLayout = true;
      continue;
    }
    if (!allowedSemantic.has(attribute.name)) return null;
    semanticAttributes.push({ ...attribute });
  }
  const placement = getAttribute(child, 'placement');
  if (!validPlacement(placement)) return null;
  if (child.name === 'strong-accent') {
    const type = getAttribute(child, 'type');
    if (type !== null && type !== 'up' && type !== 'down') return null;
  }
  return { semanticAttributes, strippedLayout };
}

function exactDownBowTechnical(technical) {
  if (technical.attributes.length !== 0 || technical.text.trim().length !== 0) return false;
  const children = technical.children.filter((child) => child.uri === technical.uri);
  if (children.length !== technical.children.length || children.length !== 1) return false;
  const downBow = children[0];
  if (downBow.name !== 'down-bow' || downBow.children.length !== 0 || downBow.text.trim().length !== 0) {
    return false;
  }
  for (const attribute of downBow.attributes) {
    if (attribute.uri.length !== 0 || attribute.name !== 'placement') return false;
  }
  return validPlacement(getAttribute(downBow, 'placement'));
}

function issue(code, message, feature, measureNumber, measureIndex, noteIndex) {
  return Object.freeze({
    severity: 'error',
    category: 'semantic',
    code,
    message,
    reviewDisposition: REVIEW_DISPOSITION,
    location: Object.freeze({
      measure: measureNumber,
      measureIndex,
      eventIndex: noteIndex,
      sourceEventId: null,
    }),
    details: Object.freeze({ feature }),
  });
}

function normalizeArticulations(articulations, context) {
  if (articulations.attributes.length !== 0 || articulations.text.trim().length !== 0) {
    return cloneNode(articulations);
  }
  const sameNamespace = articulations.children.filter((child) => child.uri === articulations.uri);
  if (sameNamespace.length !== articulations.children.length || sameNamespace.length === 0) {
    return cloneNode(articulations);
  }

  const classified = [];
  for (const child of sameNamespace) {
    if (SAFE_ARTICULATION_NAMES.has(child.name)) {
      const shape = articulationShape(child, false);
      if (!shape) return cloneNode(articulations);
      classified.push({ kind: 'safe', child, shape });
      continue;
    }
    if (REVIEW_ARTICULATION_NAMES.has(child.name)) {
      const shape = articulationShape(child, true);
      if (!shape) return cloneNode(articulations);
      classified.push({ kind: 'review', child, shape });
      continue;
    }
    return cloneNode(articulations);
  }

  const children = [];
  for (const entry of classified) {
    if (entry.kind === 'safe') {
      if (entry.shape.strippedLayout) {
        context.ignoredFeatures.add('notation:articulation-layout');
      }
      children.push(cloneNode(entry.child, { attributes: entry.shape.semanticAttributes }));
      continue;
    }
    context.ignoredFeatures.add(`notation:articulation:${entry.child.name}:review-required`);
    context.issues.push(issue(
      'SOURCE_ARTICULATION_REVIEW_REQUIRED',
      `Source articulation ${entry.child.name} requires teacher review before guitar TAB projection.`,
      `notation:articulation:${entry.child.name}`,
      context.measureNumber,
      context.measureIndex,
      context.noteIndex,
    ));
  }

  return children.length === 0 ? null : cloneNode(articulations, { children });
}

function normalizeNotations(notations, context) {
  const children = [];
  for (const child of notations.children) {
    if (child.uri === notations.uri && child.name === 'articulations') {
      const normalized = normalizeArticulations(child, context);
      if (normalized) children.push(normalized);
      continue;
    }
    if (child.uri === notations.uri && child.name === 'technical' && exactDownBowTechnical(child)) {
      context.ignoredFeatures.add('notation:technical:down-bow:review-required');
      context.issues.push(issue(
        'NON_GUITAR_SOURCE_TECHNIQUE_REVIEW_REQUIRED',
        'Source down-bow technique has no automatic guitar-TAB semantic mapping and requires teacher review.',
        'notation:technical:down-bow',
        context.measureNumber,
        context.measureIndex,
        context.noteIndex,
      ));
      continue;
    }
    children.push(cloneNode(child));
  }
  return children.length === 0 ? null : cloneNode(notations, { children });
}

function normalizeNote(note, context) {
  const children = [];
  for (const child of note.children) {
    if (child.uri === note.uri && child.name === 'notations') {
      const normalized = normalizeNotations(child, context);
      if (normalized) children.push(normalized);
      continue;
    }
    children.push(cloneNode(child));
  }
  return cloneNode(note, { children });
}

function normalizeMeasure(measure, measureIndex, ignoredFeatures, issues) {
  const measureNumber = getAttribute(measure, 'number');
  let noteIndex = 0;
  const children = measure.children.map((child) => {
    if (child.uri !== measure.uri || child.name !== 'note') return cloneNode(child);
    const context = {
      measureNumber,
      measureIndex,
      noteIndex,
      ignoredFeatures,
      issues,
    };
    noteIndex += 1;
    return normalizeNote(child, context);
  });
  return cloneNode(measure, { children });
}

function normalizePart(part, ignoredFeatures, issues) {
  let measureIndex = 0;
  const children = part.children.map((child) => {
    if (child.uri !== part.uri || child.name !== 'measure') return cloneNode(child);
    const normalized = normalizeMeasure(child, measureIndex, ignoredFeatures, issues);
    measureIndex += 1;
    return normalized;
  });
  return cloneNode(part, { children });
}

function normalizeSourceNotationReviewCompatibility(parsedDocument) {
  if (!parsedDocument || !parsedDocument.root) {
    throw new TypeError('parsedDocument with a root is required.');
  }
  const ignoredFeatures = new Set();
  const issues = [];
  const root = parsedDocument.root;
  const normalizedRoot = cloneNode(root, {
    children: root.children.map((child) => (
      child.uri === root.uri && child.name === 'part'
        ? normalizePart(child, ignoredFeatures, issues)
        : cloneNode(child)
    )),
  });
  return Object.freeze({
    parsedDocument: {
      documentType: parsedDocument.documentType,
      contractVersion: parsedDocument.contractVersion,
      root: normalizedRoot,
    },
    ignoredFeatures: Object.freeze([...ignoredFeatures].sort()),
    issues: Object.freeze([...issues]),
  });
}

module.exports = {
  normalizeSourceNotationReviewCompatibility,
};
