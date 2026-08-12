'use strict';

const CLASSIFICATION = Object.freeze({
  SUPPORTED: 'SUPPORTED',
  SAFE_IGNORE: 'SAFE_IGNORE',
  LATER_GATE: 'LATER_GATE',
  REJECT: 'REJECT',
});

function classified(classification, feature = null) {
  return Object.freeze({ classification, feature });
}

const SUPPORTED = classified(CLASSIFICATION.SUPPORTED);
const SAFE_IGNORE = classified(CLASSIFICATION.SAFE_IGNORE);

const ROOT_CHILDREN = Object.freeze({
  'part-list': SUPPORTED,
  part: SUPPORTED,
});

const PART_CHILDREN = Object.freeze({
  measure: SUPPORTED,
});

const MEASURE_CHILDREN = Object.freeze({
  attributes: SUPPORTED,
  note: SUPPORTED,
  backup: classified(CLASSIFICATION.LATER_GATE, 'backup-forward-cursor'),
  forward: classified(CLASSIFICATION.LATER_GATE, 'backup-forward-cursor'),
});

const ATTRIBUTES_CHILDREN = Object.freeze({
  divisions: SUPPORTED,
  time: SUPPORTED,
  staves: SUPPORTED,
  transpose: classified(CLASSIFICATION.REJECT, 'transpose'),
  'measure-style': classified(CLASSIFICATION.REJECT, 'measure-style'),
});

const TIME_CHILDREN = Object.freeze({
  beats: SUPPORTED,
  'beat-type': SUPPORTED,
});

const NOTE_CHILDREN = Object.freeze({
  pitch: SUPPORTED,
  rest: SUPPORTED,
  duration: SUPPORTED,
  voice: SUPPORTED,
  staff: SUPPORTED,
  tie: SUPPORTED,
  notations: SUPPORTED,
  type: SAFE_IGNORE,
  dot: SAFE_IGNORE,
  stem: SAFE_IGNORE,
  beam: SAFE_IGNORE,
  notehead: SAFE_IGNORE,
  'notehead-text': SAFE_IGNORE,
  accidental: SAFE_IGNORE,
  footnote: SAFE_IGNORE,
  level: SAFE_IGNORE,
  chord: classified(CLASSIFICATION.LATER_GATE, 'source-chord-marker'),
  grace: classified(CLASSIFICATION.LATER_GATE, 'grace-note'),
  cue: classified(CLASSIFICATION.REJECT, 'cue-note'),
  unpitched: classified(CLASSIFICATION.REJECT, 'unpitched-note'),
  'time-modification': classified(CLASSIFICATION.LATER_GATE, 'time-modification'),
  instrument: classified(CLASSIFICATION.REJECT, 'note-instrument-assignment'),
});

const PITCH_CHILDREN = Object.freeze({
  step: SUPPORTED,
  alter: SUPPORTED,
  octave: SUPPORTED,
});

const NOTATIONS_CHILDREN = Object.freeze({
  tied: SUPPORTED,
});

const ROOT_ATTRIBUTES = Object.freeze({ version: SUPPORTED });
const PART_ATTRIBUTES = Object.freeze({ id: SUPPORTED });
const MEASURE_ATTRIBUTES = Object.freeze({ number: SUPPORTED, implicit: SUPPORTED });
const EMPTY_ATTRIBUTES = Object.freeze({});

const NOTE_ATTRIBUTES = Object.freeze({
  color: SAFE_IGNORE,
  'default-x': SAFE_IGNORE,
  'default-y': SAFE_IGNORE,
  'relative-x': SAFE_IGNORE,
  'relative-y': SAFE_IGNORE,
  'font-family': SAFE_IGNORE,
  'font-size': SAFE_IGNORE,
  'font-style': SAFE_IGNORE,
  'font-weight': SAFE_IGNORE,
  'print-dot': SAFE_IGNORE,
  'print-leger': SAFE_IGNORE,
  'print-object': SAFE_IGNORE,
  'print-spacing': SAFE_IGNORE,
  id: SAFE_IGNORE,
  attack: classified(CLASSIFICATION.REJECT, 'note-timing-offset'),
  release: classified(CLASSIFICATION.REJECT, 'note-timing-offset'),
  'time-only': classified(CLASSIFICATION.REJECT, 'conditional-note'),
  dynamics: classified(CLASSIFICATION.REJECT, 'note-attribute:dynamics'),
  'end-dynamics': classified(CLASSIFICATION.REJECT, 'note-attribute:end-dynamics'),
  pizzicato: classified(CLASSIFICATION.REJECT, 'note-attribute:pizzicato'),
});

const TIE_ATTRIBUTES = Object.freeze({
  type: SUPPORTED,
  'time-only': classified(CLASSIFICATION.REJECT, 'conditional-tie'),
});

function unqualifiedAttribute(node, name) {
  return node.attributes.find(
    (attribute) => attribute.name === name && attribute.uri.length === 0,
  );
}

function directSameProfileChildren(node, name) {
  return node.children.filter(
    (child) => child.name === name && child.uri === node.uri,
  );
}

function rejectEntry(entry, fallbackFeature, location, rejectUnsupported, extraDetails = {}) {
  if (
    entry.classification === CLASSIFICATION.SUPPORTED
    || entry.classification === CLASSIFICATION.SAFE_IGNORE
  ) {
    return;
  }
  rejectUnsupported(entry.feature || fallbackFeature, { ...location, ...extraDetails });
}

function enforceChildren(node, surface, table, location, rejectUnsupported, unknownFeature = null) {
  for (const child of node.children) {
    if (child.uri !== node.uri) {
      continue;
    }
    const entry = table[child.name];
    if (!entry) {
      const feature = unknownFeature
        ? unknownFeature(child.name)
        : `${surface}-child:${child.name}`;
      rejectUnsupported(feature, location);
    }
    rejectEntry(entry, `${surface}-child:${child.name}`, location, rejectUnsupported);
  }
}

function enforceAttributes(node, surface, table, location, rejectUnsupported) {
  for (const attribute of node.attributes) {
    if (attribute.uri.length !== 0) {
      continue;
    }
    const entry = table[attribute.name];
    if (!entry) {
      rejectUnsupported(`${surface}-attribute:${attribute.name}`, location);
    }
    const extraDetails = {};
    if (entry.feature === 'note-timing-offset') {
      extraDetails.attribute = attribute.name;
    } else if (entry.feature === 'conditional-note' || entry.feature === 'conditional-tie') {
      extraDetails.timeOnly = attribute.value;
    }
    rejectEntry(
      entry,
      `${surface}-attribute:${attribute.name}`,
      location,
      rejectUnsupported,
      extraDetails,
    );
  }
}

function enforceLeaf(node, surface, location, rejectUnsupported) {
  enforceChildren(node, surface, Object.freeze({}), location, rejectUnsupported);
  enforceAttributes(node, surface, EMPTY_ATTRIBUTES, location, rejectUnsupported);
}

function enforceNoteProfile(noteNode, location, rejectUnsupported) {
  enforceChildren(noteNode, 'note', NOTE_CHILDREN, location, rejectUnsupported);
  enforceAttributes(noteNode, 'note', NOTE_ATTRIBUTES, location, rejectUnsupported);

  for (const pitch of directSameProfileChildren(noteNode, 'pitch')) {
    enforceChildren(pitch, 'pitch', PITCH_CHILDREN, location, rejectUnsupported);
    enforceAttributes(pitch, 'pitch', EMPTY_ATTRIBUTES, location, rejectUnsupported);
  }
  for (const rest of directSameProfileChildren(noteNode, 'rest')) {
    enforceLeaf(rest, 'rest', location, rejectUnsupported);
  }
  for (const tie of directSameProfileChildren(noteNode, 'tie')) {
    enforceChildren(tie, 'tie', Object.freeze({}), location, rejectUnsupported);
    enforceAttributes(tie, 'tie', TIE_ATTRIBUTES, location, rejectUnsupported);
  }
  for (const notations of directSameProfileChildren(noteNode, 'notations')) {
    enforceChildren(
      notations,
      'notations',
      NOTATIONS_CHILDREN,
      location,
      rejectUnsupported,
      (name) => `notation:${name}`,
    );
    enforceAttributes(notations, 'notations', EMPTY_ATTRIBUTES, location, rejectUnsupported);
    for (const tied of directSameProfileChildren(notations, 'tied')) {
      enforceChildren(tied, 'tied', Object.freeze({}), location, rejectUnsupported);
      enforceAttributes(tied, 'tied', TIE_ATTRIBUTES, location, rejectUnsupported);
    }
  }
}

function enforceAttributesProfile(attributesNode, location, rejectUnsupported) {
  enforceChildren(
    attributesNode,
    'attributes',
    ATTRIBUTES_CHILDREN,
    location,
    rejectUnsupported,
  );
  enforceAttributes(
    attributesNode,
    'attributes',
    EMPTY_ATTRIBUTES,
    location,
    rejectUnsupported,
  );
  for (const time of directSameProfileChildren(attributesNode, 'time')) {
    enforceChildren(time, 'time', TIME_CHILDREN, location, rejectUnsupported);
    enforceAttributes(time, 'time', EMPTY_ATTRIBUTES, location, rejectUnsupported);
  }
}

function enforcePolyphonicMusicXmlSemanticProfile(parsedDocument, rejectUnsupported) {
  const root = parsedDocument.root;
  enforceChildren(root, 'root', ROOT_CHILDREN, {}, rejectUnsupported);
  enforceAttributes(root, 'root', ROOT_ATTRIBUTES, {}, rejectUnsupported);

  const part = directSameProfileChildren(root, 'part')[0];
  enforceChildren(part, 'part', PART_CHILDREN, {}, rejectUnsupported);
  enforceAttributes(part, 'part', PART_ATTRIBUTES, {}, rejectUnsupported);

  const measures = directSameProfileChildren(part, 'measure');
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const measure = measures[measureIndex];
    const numberAttribute = unqualifiedAttribute(measure, 'number');
    const location = {
      measureIndex,
      measureNumber: numberAttribute ? numberAttribute.value : undefined,
    };
    enforceChildren(measure, 'measure', MEASURE_CHILDREN, location, rejectUnsupported);
    enforceAttributes(measure, 'measure', MEASURE_ATTRIBUTES, location, rejectUnsupported);

    for (const attributes of directSameProfileChildren(measure, 'attributes')) {
      enforceAttributesProfile(attributes, location, rejectUnsupported);
    }

    let sourceOrder = 0;
    for (const child of measure.children) {
      if (child.uri !== measure.uri || child.name !== 'note') {
        continue;
      }
      enforceNoteProfile(
        child,
        { ...location, sourceOrder },
        rejectUnsupported,
      );
      sourceOrder += 1;
    }
  }
}

module.exports = {
  CLASSIFICATION,
  enforcePolyphonicMusicXmlSemanticProfile,
};
