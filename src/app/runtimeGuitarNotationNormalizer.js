'use strict';

const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');

const PARSED_MUSICXML_DOCUMENT_VERSION = '1.0.0';
const IGNORED_ROOT_CHILDREN = new Set([
  'work',
  'movement-number',
  'movement-title',
  'identification',
  'defaults',
  'credit',
]);
const IGNORED_MEASURE_CHILDREN = new Set([
  'print',
  'direction',
  'barline',
  'harmony',
  'grouping',
  'link',
  'bookmark',
]);
const IGNORED_ATTRIBUTE_CHILDREN = new Set([
  'key',
  'clef',
  'instruments',
  'part-symbol',
]);
const IGNORED_NOTATION_CHILDREN = new Set([
  'slur',
  'articulations',
  'fermata',
  'arpeggiate',
  'non-arpeggiate',
]);
const ALLOWED_NOTE_CHILDREN = new Set([
  'pitch',
  'rest',
  'duration',
  'voice',
  'staff',
  'tie',
  'notations',
  'type',
  'dot',
  'stem',
  'beam',
  'notehead',
  'notehead-text',
  'accidental',
  'footnote',
  'level',
  'chord',
  'lyric',
]);

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name && child.uri === node.uri);
}

function getAttribute(node, name) {
  const attribute = node.attributes.find(
    (candidate) => candidate.name === name && candidate.uri.length === 0,
  );
  return attribute ? attribute.value : undefined;
}

function scalarInteger(node) {
  if (!node || node.children.length !== 0 || !/^-?\d+$/.test(node.text.trim())) return null;
  const value = Number.parseInt(node.text.trim(), 10);
  return Number.isSafeInteger(value) && !Object.is(value, -0) ? value : null;
}

function cloneNode(node, overrides = {}) {
  return {
    name: overrides.name ?? node.name,
    uri: overrides.uri ?? node.uri,
    attributes: overrides.attributes ?? node.attributes.map((attribute) => ({ ...attribute })),
    text: overrides.text ?? node.text,
    children: overrides.children ?? node.children.map((child) => cloneNode(child)),
  };
}

function parseStandardGuitarTranspose(attributesNodes) {
  const transposeNodes = attributesNodes.flatMap((attributes) => directChildren(attributes, 'transpose'));
  if (transposeNodes.length === 0) return 0;

  for (const transpose of transposeNodes) {
    const attributeNames = transpose.attributes
      .filter((attribute) => attribute.uri.length === 0)
      .map((attribute) => attribute.name);
    if (attributeNames.some((name) => name !== 'number')) return null;
    if ((getAttribute(transpose, 'number') || '1') !== '1') return null;

    const allowed = new Set(['diatonic', 'chromatic', 'octave-change']);
    if (transpose.children.some((child) => child.uri === transpose.uri && !allowed.has(child.name))) {
      return null;
    }
    const diatonicNodes = directChildren(transpose, 'diatonic');
    const chromaticNodes = directChildren(transpose, 'chromatic');
    const octaveChangeNodes = directChildren(transpose, 'octave-change');
    if (diatonicNodes.length > 1 || chromaticNodes.length !== 1 || octaveChangeNodes.length !== 1) {
      return null;
    }
    const diatonic = diatonicNodes.length === 0 ? 0 : scalarInteger(diatonicNodes[0]);
    const chromatic = scalarInteger(chromaticNodes[0]);
    const octaveChange = scalarInteger(octaveChangeNodes[0]);
    if (diatonic !== 0 || chromatic !== 0 || octaveChange !== -1) return null;
  }
  return -1;
}

function safeStaffDetails(node) {
  const unsafe = new Set(['staff-tuning', 'capo']);
  return !node.children.some((child) => child.uri === node.uri && unsafe.has(child.name));
}

function sanitizeAttributes(node, ignoredFeatures) {
  const children = [];
  for (const child of node.children) {
    if (child.uri !== node.uri) continue;
    if (child.name === 'divisions' || child.name === 'time') {
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'staves') {
      if (scalarInteger(child) !== 1) return null;
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'transpose') {
      ignoredFeatures.add('attributes:transpose');
      continue;
    }
    if (child.name === 'staff-details') {
      if (!safeStaffDetails(child)) return null;
      ignoredFeatures.add('attributes:staff-details');
      continue;
    }
    if (IGNORED_ATTRIBUTE_CHILDREN.has(child.name)) {
      ignoredFeatures.add(`attributes:${child.name}`);
      continue;
    }
    return null;
  }
  return cloneNode(node, { children });
}

function sanitizeNotations(node, ignoredFeatures) {
  const children = [];
  for (const child of node.children) {
    if (child.uri !== node.uri) continue;
    if (child.name === 'tied') {
      children.push(cloneNode(child));
      continue;
    }
    if (IGNORED_NOTATION_CHILDREN.has(child.name)) {
      ignoredFeatures.add(`notation:${child.name}`);
      continue;
    }
    return null;
  }
  return children.length === 0 ? null : cloneNode(node, { children });
}

function sanitizePitch(node, pitchOctaveShift) {
  if (pitchOctaveShift === 0) return cloneNode(node);
  const octaveNodes = directChildren(node, 'octave');
  const octave = octaveNodes.length === 1 ? scalarInteger(octaveNodes[0]) : null;
  if (octave === null || !Number.isSafeInteger(octave + pitchOctaveShift)) return null;
  const children = node.children.map((child) => (
    child === octaveNodes[0]
      ? cloneNode(child, { text: String(octave + pitchOctaveShift) })
      : cloneNode(child)
  ));
  return cloneNode(node, { children });
}

function sanitizeNote(node, pitchOctaveShift, ignoredFeatures) {
  const children = [];
  for (const child of node.children) {
    if (child.uri !== node.uri) continue;
    if (!ALLOWED_NOTE_CHILDREN.has(child.name)) return null;
    if (child.name === 'lyric') {
      ignoredFeatures.add('note:lyric');
      continue;
    }
    if (child.name === 'staff') {
      if (scalarInteger(child) !== 1) return null;
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'notations') {
      const notations = sanitizeNotations(child, ignoredFeatures);
      if (notations === false) return null;
      if (notations) children.push(notations);
      continue;
    }
    if (child.name === 'pitch') {
      const pitch = sanitizePitch(child, pitchOctaveShift);
      if (!pitch) return null;
      children.push(pitch);
      continue;
    }
    children.push(cloneNode(child));
  }
  return cloneNode(node, { children });
}

function derivedDocument(parsedDocument, partList, scorePart, part, measures) {
  const partName = directChildren(scorePart, 'part-name')[0];
  const derivedScorePart = cloneNode(scorePart, {
    children: partName ? [cloneNode(partName)] : [],
  });
  const derivedPartList = cloneNode(partList, { children: [derivedScorePart] });
  const derivedPart = cloneNode(part, { children: measures });
  return {
    documentType: 'ParsedMusicXmlDocument',
    contractVersion: PARSED_MUSICXML_DOCUMENT_VERSION,
    root: cloneNode(parsedDocument.root, { children: [derivedPartList, derivedPart] }),
  };
}

function tryProjectRuntimeGuitarNotation(parsedDocument, runtime = null) {
  if (
    !parsedDocument
    || parsedDocument.documentType !== 'ParsedMusicXmlDocument'
    || parsedDocument.contractVersion !== PARSED_MUSICXML_DOCUMENT_VERSION
    || !parsedDocument.root
  ) {
    return null;
  }

  const root = parsedDocument.root;
  const rootChildren = root.children.filter((child) => child.uri === root.uri);
  for (const child of rootChildren) {
    if (child.name !== 'part-list' && child.name !== 'part' && !IGNORED_ROOT_CHILDREN.has(child.name)) {
      return null;
    }
  }
  const partLists = directChildren(root, 'part-list');
  const parts = directChildren(root, 'part');
  if (partLists.length !== 1 || parts.length !== 1) return null;
  const scoreParts = directChildren(partLists[0], 'score-part');
  if (scoreParts.length !== 1) return null;
  if (getAttribute(scoreParts[0], 'id') !== getAttribute(parts[0], 'id')) return null;
  if (parts[0].children.some((child) => child.uri === parts[0].uri && child.name !== 'measure')) {
    return null;
  }

  const measureNodes = directChildren(parts[0], 'measure');
  if (measureNodes.length === 0) return null;
  const attributesNodes = measureNodes.flatMap((measure) => directChildren(measure, 'attributes'));
  const pitchOctaveShift = parseStandardGuitarTranspose(attributesNodes);
  if (pitchOctaveShift === null) return null;

  const ignoredFeatures = new Set();
  for (const child of rootChildren) {
    if (IGNORED_ROOT_CHILDREN.has(child.name)) ignoredFeatures.add(`root:${child.name}`);
  }

  const measures = [];
  for (const measure of measureNodes) {
    const children = [];
    for (const child of measure.children) {
      if (child.uri !== measure.uri) continue;
      if (child.name === 'attributes') {
        const attributes = sanitizeAttributes(child, ignoredFeatures);
        if (!attributes) return null;
        children.push(attributes);
        continue;
      }
      if (child.name === 'note') {
        const note = sanitizeNote(child, pitchOctaveShift, ignoredFeatures);
        if (!note) return null;
        children.push(note);
        continue;
      }
      if (child.name === 'backup' || child.name === 'forward') {
        children.push(cloneNode(child));
        continue;
      }
      if (IGNORED_MEASURE_CHILDREN.has(child.name)) {
        ignoredFeatures.add(`measure:${child.name}`);
        continue;
      }
      return null;
    }
    measures.push(cloneNode(measure, { children }));
  }

  if (pitchOctaveShift !== 0) ignoredFeatures.add('guitar:sounding-octave-normalization');
  const derived = derivedDocument(parsedDocument, partLists[0], scoreParts[0], parts[0], measures);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(derived, runtime);
  return Object.freeze({
    sourceModel,
    pitchOctaveShift,
    ignoredFeatures: Object.freeze([...ignoredFeatures].sort()),
  });
}

module.exports = {
  tryProjectRuntimeGuitarNotation,
};
