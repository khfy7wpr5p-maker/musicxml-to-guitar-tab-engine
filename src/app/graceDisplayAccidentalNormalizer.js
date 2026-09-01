'use strict';

const { EngineError } = require('../errors/engineError');

const GRACE_DISPLAY_ACCIDENTAL_NORMALIZER_VERSION = '1.0.0';
const GRACE_DISPLAY_ACCIDENTAL_FEATURE = 'grace:accidental:display-only';
const DISPLAY_ACCIDENTAL_BY_ALTER = Object.freeze({
  '-2': 'flat-flat',
  '-1': 'flat',
  0: 'natural',
  1: 'sharp',
  2: 'double-sharp',
});

class GraceDisplayAccidentalNormalizerError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'UNSUPPORTED_POLYPHONIC_GRACE_ORNAMENT',
      Object.freeze({ feature: 'accidental', ...details }),
      'GraceDisplayAccidentalNormalizerError',
    );
  }
}

function unsupported(message, details = {}) {
  throw new GraceDisplayAccidentalNormalizerError(message, details);
}

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function cloneAttributes(attributes) {
  return attributes.map((attribute) => ({ ...attribute }));
}

function deepFreezeNode(node) {
  for (const attribute of node.attributes) Object.freeze(attribute);
  Object.freeze(node.attributes);
  for (const child of node.children) deepFreezeNode(child);
  Object.freeze(node.children);
  return Object.freeze(node);
}

function exactLeafText(node, field, details) {
  if (
    !node
    || node.children.length !== 0
    || node.attributes.length !== 0
  ) {
    unsupported(`Grace ${field} must be an exact attribute-free leaf.`, details);
  }
  return node.text.trim();
}

function pitchAlterForAccidental(note, details) {
  const pitches = directChildren(note, 'pitch');
  if (pitches.length !== 1) {
    unsupported('Grace accidental requires exactly one pitch element.', {
      ...details,
      observedPitchCount: pitches.length,
    });
  }
  const pitch = pitches[0];
  if (pitch.attributes.length !== 0 || pitch.text.trim().length !== 0) {
    unsupported('Grace accidental requires the bounded pitch child form.', details);
  }
  const alters = directChildren(pitch, 'alter');
  if (alters.length > 1) {
    unsupported('Grace accidental cannot resolve duplicate pitch alter elements.', {
      ...details,
      observedAlterCount: alters.length,
    });
  }
  if (alters.length === 0) return 0;
  const text = exactLeafText(alters[0], 'pitch alter', details);
  if (!/^-?\d+$/.test(text)) {
    unsupported('Grace accidental requires an integer pitch alter.', details);
  }
  const alter = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(alter) || Object.is(alter, -0)) {
    unsupported('Grace accidental requires a safe integer pitch alter.', details);
  }
  return alter;
}

function normalizeGraceNote(note, details, counters) {
  const accidentals = directChildren(note, 'accidental');
  if (accidentals.length === 0) return null;
  if (accidentals.length !== 1) {
    unsupported('Grace note may contain at most one display accidental.', {
      ...details,
      observedAccidentalCount: accidentals.length,
    });
  }

  const observed = exactLeafText(accidentals[0], 'accidental', details);
  const alter = pitchAlterForAccidental(note, details);
  const expected = DISPLAY_ACCIDENTAL_BY_ALTER[String(alter)];
  if (expected === undefined || observed !== expected) {
    unsupported('Grace display accidental must exactly match pitch alter.', {
      ...details,
      pitchAlter: alter,
      observed,
      expected: expected ?? null,
    });
  }

  counters.removedAccidentalCount += 1;
  const children = note.children
    .filter((child) => child !== accidentals[0])
    .map((child) => cloneNode(child, details, counters));
  return {
    name: note.name,
    uri: note.uri,
    attributes: cloneAttributes(note.attributes),
    text: note.text,
    children,
  };
}

function cloneNode(node, details, counters) {
  if (node.name === 'note' && directChildren(node, 'grace').length > 0) {
    const normalized = normalizeGraceNote(node, details, counters);
    if (normalized) return normalized;
  }
  return {
    name: node.name,
    uri: node.uri,
    attributes: cloneAttributes(node.attributes),
    text: node.text,
    children: node.children.map((child) => cloneNode(child, details, counters)),
  };
}

function normalizeGraceDisplayAccidental(parsedDocument) {
  if (
    !parsedDocument
    || parsedDocument.documentType !== 'ParsedMusicXmlDocument'
    || parsedDocument.contractVersion !== '1.0.0'
    || !parsedDocument.root
  ) {
    unsupported('Grace accidental normalization requires ParsedMusicXmlDocument 1.0.0 input.', {
      field: 'parsedDocument',
    });
  }

  const counters = { removedAccidentalCount: 0 };
  const root = cloneNode(parsedDocument.root, {}, counters);
  const normalizedDocument = Object.freeze({
    documentType: parsedDocument.documentType,
    contractVersion: parsedDocument.contractVersion,
    root: deepFreezeNode(root),
  });
  return Object.freeze({
    contractVersion: GRACE_DISPLAY_ACCIDENTAL_NORMALIZER_VERSION,
    parsedDocument: normalizedDocument,
    removedAccidentalCount: counters.removedAccidentalCount,
    ignoredFeatures: Object.freeze(
      counters.removedAccidentalCount === 0 ? [] : [GRACE_DISPLAY_ACCIDENTAL_FEATURE],
    ),
  });
}

module.exports = {
  GRACE_DISPLAY_ACCIDENTAL_NORMALIZER_VERSION,
  GRACE_DISPLAY_ACCIDENTAL_FEATURE,
  GraceDisplayAccidentalNormalizerError,
  normalizeGraceDisplayAccidental,
};
