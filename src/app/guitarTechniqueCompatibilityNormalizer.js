'use strict';

const {
  PolyphonicMusicXmlProjectorError,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  GuitarTechniqueProvenanceError,
  extractGuitarTechniqueProvenance,
} = require('../parser/guitarTechniqueProvenance');

function cloneNode(node, children = null) {
  return {
    name: node.name,
    uri: node.uri,
    attributes: node.attributes.map((attribute) => ({ ...attribute })),
    text: node.text,
    children: children || node.children.map((child) => cloneNode(child)),
  };
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name && child.uri === node.uri);
}

function projectorFeatureForTechniqueError(error) {
  const path = error.details?.path || '';
  if (path.startsWith('note/play')) return 'note-child:play';
  if (path.includes('slide') || error.details?.kind === 'SLIDE') return 'notation:slide';
  if (path.includes('technical') || error.details?.kind === 'HAMMER_ON') return 'notation:technical';
  return 'guitar-technique-provenance';
}

function translateTechniqueError(error) {
  return new PolyphonicMusicXmlProjectorError(
    `MusicXML feature is outside the verified guitar technique provenance profile: ${projectorFeatureForTechniqueError(error)}.`,
    'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE',
    Object.freeze({
      feature: projectorFeatureForTechniqueError(error),
      techniqueErrorCode: error.code,
      techniqueErrorDetails: error.details,
    }),
  );
}

function recordTechnicalFeatures(technical, ignoredFeatures) {
  for (const child of technical.children) {
    if (child.uri !== technical.uri) continue;
    if (child.name === 'harmonic') ignoredFeatures.add('notation:technical:harmonic-provenance');
    else if (child.name === 'hammer-on') ignoredFeatures.add('notation:technical:hammer-on-provenance');
    else if (child.name === 'string' || child.name === 'fret') {
      ignoredFeatures.add('notation:technical:string-fret-provenance');
    } else if (child.name === 'fingering') {
      ignoredFeatures.add('notation:technical:fingering-provenance');
    } else if (child.name === 'pluck') {
      ignoredFeatures.add('notation:technical:pluck-provenance');
    }
  }
}

function normalizeNotations(notations, ignoredFeatures) {
  const children = [];
  for (const child of notations.children) {
    if (child.uri === notations.uri && child.name === 'technical') {
      recordTechnicalFeatures(child, ignoredFeatures);
      continue;
    }
    if (child.uri === notations.uri && child.name === 'slide') {
      ignoredFeatures.add('notation:slide:guitar-technique-provenance');
      continue;
    }
    children.push(cloneNode(child));
  }
  return children.length === 0 ? null : cloneNode(notations, children);
}

function normalizeNote(note, ignoredFeatures) {
  const children = [];
  for (const child of note.children) {
    if (child.uri === note.uri && child.name === 'play') {
      ignoredFeatures.add('note:play:straight-mute-provenance');
      continue;
    }
    if (child.uri === note.uri && child.name === 'notations') {
      const normalized = normalizeNotations(child, ignoredFeatures);
      if (normalized) children.push(normalized);
      continue;
    }
    children.push(cloneNode(child));
  }
  return cloneNode(note, children);
}

function normalizeMeasure(measure, ignoredFeatures) {
  return cloneNode(measure, measure.children.map((child) => (
    child.uri === measure.uri && child.name === 'note'
      ? normalizeNote(child, ignoredFeatures)
      : cloneNode(child)
  )));
}

function normalizePart(part, ignoredFeatures) {
  return cloneNode(part, part.children.map((child) => (
    child.uri === part.uri && child.name === 'measure'
      ? normalizeMeasure(child, ignoredFeatures)
      : cloneNode(child)
  )));
}

function normalizeVerifiedGuitarTechniqueProvenance(parsedDocument) {
  let guitarTechniqueProvenance;
  try {
    guitarTechniqueProvenance = extractGuitarTechniqueProvenance(parsedDocument);
  } catch (error) {
    if (error instanceof GuitarTechniqueProvenanceError) throw translateTechniqueError(error);
    throw error;
  }

  if (guitarTechniqueProvenance.status === 'ABSENT') {
    return Object.freeze({
      parsedDocument,
      guitarTechniqueProvenance,
      ignoredFeatures: Object.freeze([]),
    });
  }

  const ignoredFeatures = new Set();
  const root = parsedDocument.root;
  const normalizedRoot = cloneNode(root, root.children.map((child) => (
    child.uri === root.uri && child.name === 'part'
      ? normalizePart(child, ignoredFeatures)
      : cloneNode(child)
  )));

  return Object.freeze({
    parsedDocument: {
      documentType: parsedDocument.documentType,
      contractVersion: parsedDocument.contractVersion,
      root: normalizedRoot,
    },
    guitarTechniqueProvenance,
    ignoredFeatures: Object.freeze([...ignoredFeatures].sort()),
  });
}

module.exports = {
  normalizeVerifiedGuitarTechniqueProvenance,
};
