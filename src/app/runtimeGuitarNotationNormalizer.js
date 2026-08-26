'use strict';

const {
  PolyphonicMusicXmlProjectorError,
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
const IGNORED_PART_LIST_CHILDREN = new Set([
  'part-group',
]);
const IGNORED_SCORE_PART_CHILDREN = new Set([
  'part-abbreviation',
  'score-instrument',
  'midi-device',
  'midi-instrument',
]);
const IGNORED_MEASURE_CHILDREN = new Set([
  'print',
  'grouping',
  'link',
  'bookmark',
]);
const IGNORED_ATTRIBUTE_CHILDREN = new Set([
  'instruments',
  'part-symbol',
]);
const SAFE_ARTICULATION_CHILDREN = new Set([
  'accent',
  'detached-legato',
  'spiccato',
  'staccatissimo',
  'staccato',
  'tenuto',
]);
const SAFE_SLUR_ATTRIBUTES = new Set([
  'type',
  'number',
  'line-type',
  'placement',
  'orientation',
]);
const SAFE_DIRECTION_ATTRIBUTES = new Set(['placement']);
const SAFE_BARLINE_STYLES = new Set([
  'regular',
  'dotted',
  'dashed',
  'heavy',
  'light-light',
  'light-heavy',
  'heavy-light',
  'heavy-heavy',
  'tick',
  'short',
  'none',
]);
const SAFE_STAFF_DETAILS_CHILDREN = new Set([
  'staff-type',
  'staff-lines',
  'staff-size',
]);
const SAFE_STAFF_DETAILS_ATTRIBUTES = new Set([
  'number',
  'show-frets',
  'print-object',
  'print-spacing',
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

function unsupported(feature, details = {}) {
  return new PolyphonicMusicXmlProjectorError(
    `MusicXML feature is outside the runtime guitar normalization profile: ${feature}.`,
    'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE',
    { feature, ...details },
  );
}

function hasOnlyUnqualifiedAttributes(node, allowed) {
  return !node.attributes.some((attribute) => (
    attribute.uri.length === 0 && !allowed.has(attribute.name)
  ));
}

function hasSameNamespaceChildren(node) {
  return node.children.some((child) => child.uri === node.uri);
}

function parseStandardGuitarTranspose(measureNodes) {
  const transposeRecords = [];
  for (let measureIndex = 0; measureIndex < measureNodes.length; measureIndex += 1) {
    const measure = measureNodes[measureIndex];
    for (let childIndex = 0; childIndex < measure.children.length; childIndex += 1) {
      const attributes = measure.children[childIndex];
      if (attributes.uri !== measure.uri || attributes.name !== 'attributes') continue;
      for (const transpose of directChildren(attributes, 'transpose')) {
        transposeRecords.push({ measureIndex, childIndex, transpose });
      }
    }
  }

  if (transposeRecords.length === 0) return 0;
  if (transposeRecords.length !== 1) return null;

  const record = transposeRecords[0];
  if (record.measureIndex !== 0) return null;
  const timingStartedBeforeTranspose = measureNodes[0].children
    .slice(0, record.childIndex)
    .some((child) => (
      child.uri === measureNodes[0].uri
      && (child.name === 'note' || child.name === 'backup' || child.name === 'forward')
    ));
  if (timingStartedBeforeTranspose) return null;

  const transpose = record.transpose;
  if (!hasOnlyUnqualifiedAttributes(transpose, new Set(['number']))) return null;
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
  return -1;
}

function safeSlur(node) {
  if (!hasOnlyUnqualifiedAttributes(node, SAFE_SLUR_ATTRIBUTES) || hasSameNamespaceChildren(node)) {
    return false;
  }
  if (!['start', 'stop', 'continue'].includes(getAttribute(node, 'type'))) return false;
  const number = getAttribute(node, 'number');
  if (number !== undefined && (!/^\d+$/.test(number) || Number(number) < 1 || Number(number) > 16)) {
    return false;
  }
  const lineType = getAttribute(node, 'line-type');
  if (lineType !== undefined && !['solid', 'dashed', 'dotted', 'wavy'].includes(lineType)) {
    return false;
  }
  const placement = getAttribute(node, 'placement');
  if (placement !== undefined && !['above', 'below'].includes(placement)) return false;
  const orientation = getAttribute(node, 'orientation');
  return orientation === undefined || ['over', 'under'].includes(orientation);
}

function safeArticulations(node, ignoredFeatures) {
  if (!hasOnlyUnqualifiedAttributes(node, new Set())) return false;
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.length === 0) return false;
  for (const child of children) {
    if (
      !SAFE_ARTICULATION_CHILDREN.has(child.name)
      || hasSameNamespaceChildren(child)
      || !hasOnlyUnqualifiedAttributes(child, new Set(['placement']))
    ) {
      return false;
    }
    const placement = getAttribute(child, 'placement');
    if (placement !== undefined && !['above', 'below'].includes(placement)) return false;
    ignoredFeatures.add(`notation:articulation:${child.name}`);
  }
  return true;
}

function positiveTempo(node) {
  if (!node || hasSameNamespaceChildren(node) || !hasOnlyUnqualifiedAttributes(node, new Set())) {
    return null;
  }
  if (!/^(?:\d+|\d+\.\d+)$/.test(node.text.trim())) return null;
  const value = Number(node.text.trim());
  return Number.isFinite(value) && value > 0 && value <= 1000 ? value : null;
}

function safeMetronomeDirection(node) {
  if (!hasOnlyUnqualifiedAttributes(node, SAFE_DIRECTION_ATTRIBUTES)) return false;
  const placement = getAttribute(node, 'placement');
  if (placement !== undefined && !['above', 'below'].includes(placement)) return false;

  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.some((child) => child.name !== 'direction-type' && child.name !== 'sound')) {
    return false;
  }
  const directionTypes = directChildren(node, 'direction-type');
  const soundNodes = directChildren(node, 'sound');
  if (directionTypes.length !== 1 || soundNodes.length > 1) return false;

  const directionType = directionTypes[0];
  if (!hasOnlyUnqualifiedAttributes(directionType, new Set())) return false;
  const metronomeNodes = directChildren(directionType, 'metronome');
  if (
    metronomeNodes.length !== 1
    || directionType.children.some((child) => (
      child.uri === directionType.uri && child.name !== 'metronome'
    ))
  ) {
    return false;
  }

  const metronome = metronomeNodes[0];
  if (!hasOnlyUnqualifiedAttributes(metronome, new Set())) return false;
  const metronomeChildren = metronome.children.filter((child) => child.uri === metronome.uri);
  if (metronomeChildren.some((child) => !['beat-unit', 'per-minute'].includes(child.name))) {
    return false;
  }
  const beatUnits = directChildren(metronome, 'beat-unit');
  const perMinutes = directChildren(metronome, 'per-minute');
  if (beatUnits.length !== 1 || perMinutes.length !== 1) return false;
  if (
    hasSameNamespaceChildren(beatUnits[0])
    || !hasOnlyUnqualifiedAttributes(beatUnits[0], new Set())
    || !['whole', 'half', 'quarter', 'eighth', '16th', '32nd'].includes(beatUnits[0].text.trim())
  ) {
    return false;
  }
  const perMinute = positiveTempo(perMinutes[0]);
  if (perMinute === null) return false;

  if (soundNodes.length === 1) {
    const sound = soundNodes[0];
    if (hasSameNamespaceChildren(sound) || !hasOnlyUnqualifiedAttributes(sound, new Set(['tempo']))) {
      return false;
    }
    const tempo = getAttribute(sound, 'tempo');
    if (tempo === undefined || !/^(?:\d+|\d+\.\d+)$/.test(tempo)) return false;
    const numericTempo = Number(tempo);
    if (!Number.isFinite(numericTempo) || numericTempo <= 0 || numericTempo > 1000) return false;
    if (numericTempo !== perMinute) return false;
  }
  return true;
}

function safeSimpleBarline(node) {
  if (!hasOnlyUnqualifiedAttributes(node, new Set(['location']))) return false;
  const location = getAttribute(node, 'location');
  if (location !== undefined && !['left', 'middle', 'right'].includes(location)) return false;
  const children = node.children.filter((child) => child.uri === node.uri);
  const barStyles = directChildren(node, 'bar-style');
  if (children.length !== 1 || barStyles.length !== 1) return false;
  const barStyle = barStyles[0];
  return (
    !hasSameNamespaceChildren(barStyle)
    && hasOnlyUnqualifiedAttributes(barStyle, new Set())
    && SAFE_BARLINE_STYLES.has(barStyle.text.trim())
  );
}

function safeStaffDetails(node) {
  const unsafeChildren = node.children.some((child) => (
    child.uri === node.uri && !SAFE_STAFF_DETAILS_CHILDREN.has(child.name)
  ));
  if (unsafeChildren) return false;
  return !node.attributes.some((attribute) => (
    attribute.uri.length === 0 && !SAFE_STAFF_DETAILS_ATTRIBUTES.has(attribute.name)
  ));
}

function parseKeySignature(node, measureIndex) {
  if (!hasOnlyUnqualifiedAttributes(node, new Set(['number']))) throw unsupported('key');
  if ((getAttribute(node, 'number') || '1') !== '1') throw unsupported('key');
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.some((child) => !['fifths', 'mode'].includes(child.name))) {
    throw unsupported('key');
  }
  const fifthsNodes = directChildren(node, 'fifths');
  const modeNodes = directChildren(node, 'mode');
  if (fifthsNodes.length !== 1 || modeNodes.length > 1) throw unsupported('key');
  if (!hasOnlyUnqualifiedAttributes(fifthsNodes[0], new Set())) throw unsupported('key');
  const fifths = scalarInteger(fifthsNodes[0]);
  if (fifths === null || fifths < -7 || fifths > 7) throw unsupported('key');
  let mode = null;
  if (modeNodes.length === 1) {
    if (hasSameNamespaceChildren(modeNodes[0]) || !hasOnlyUnqualifiedAttributes(modeNodes[0], new Set())) {
      throw unsupported('key');
    }
    mode = modeNodes[0].text.trim();
    if (!['major', 'minor'].includes(mode)) throw unsupported('key');
  }
  return Object.freeze({ measureIndex, fifths, mode });
}

function requireStandardNotationClef(node) {
  if (!hasOnlyUnqualifiedAttributes(node, new Set(['number']))) throw unsupported('clef');
  if ((getAttribute(node, 'number') || '1') !== '1') throw unsupported('clef');
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.some((child) => !['sign', 'line'].includes(child.name))) throw unsupported('clef');
  const signs = directChildren(node, 'sign');
  const lines = directChildren(node, 'line');
  if (
    signs.length !== 1
    || lines.length !== 1
    || hasSameNamespaceChildren(signs[0])
    || hasSameNamespaceChildren(lines[0])
    || !hasOnlyUnqualifiedAttributes(signs[0], new Set())
    || !hasOnlyUnqualifiedAttributes(lines[0], new Set())
    || signs[0].text.trim() !== 'G'
    || scalarInteger(lines[0]) !== 2
  ) {
    throw unsupported('clef');
  }
}

function sanitizeAttributes(node, ignoredFeatures, measureIndex, keySignatures) {
  const children = [];
  for (const child of node.children) {
    if (child.uri !== node.uri) continue;
    if (child.name === 'divisions' || child.name === 'time') {
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'staves') {
      if (scalarInteger(child) !== 1) throw unsupported('staves');
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'transpose') {
      ignoredFeatures.add('attributes:transpose');
      continue;
    }
    if (child.name === 'key') {
      if (keySignatures.some((entry) => entry.measureIndex === measureIndex)) {
        throw unsupported('key');
      }
      keySignatures.push(parseKeySignature(child, measureIndex));
      continue;
    }
    if (child.name === 'clef') {
      requireStandardNotationClef(child);
      continue;
    }
    if (child.name === 'staff-details') {
      if (!safeStaffDetails(child)) throw unsupported('staff-details');
      ignoredFeatures.add('attributes:staff-details');
      continue;
    }
    if (IGNORED_ATTRIBUTE_CHILDREN.has(child.name)) {
      ignoredFeatures.add(`attributes:${child.name}`);
      continue;
    }
    throw unsupported(`attributes-child:${child.name}`);
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
    if (child.name === 'slur' && safeSlur(child)) {
      ignoredFeatures.add('notation:slur');
      continue;
    }
    if (child.name === 'articulations' && safeArticulations(child, ignoredFeatures)) {
      continue;
    }
    throw unsupported(`notation:${child.name}`);
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
    if (!ALLOWED_NOTE_CHILDREN.has(child.name)) throw unsupported(`note-child:${child.name}`);
    if (child.name === 'lyric') {
      ignoredFeatures.add('note:lyric');
      continue;
    }
    if (child.name === 'staff') {
      if (scalarInteger(child) !== 1) throw unsupported('note-staff');
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'notations') {
      const notations = sanitizeNotations(child, ignoredFeatures);
      if (notations) children.push(notations);
      continue;
    }
    if (child.name === 'pitch') {
      const pitch = sanitizePitch(child, pitchOctaveShift);
      if (!pitch) throw unsupported('pitch-octave-normalization');
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
  const ignoredFeatures = new Set();
  for (const child of rootChildren) {
    if (child.name === 'part-list' || child.name === 'part') continue;
    if (!IGNORED_ROOT_CHILDREN.has(child.name)) return null;
    ignoredFeatures.add(`root:${child.name}`);
  }

  const partLists = directChildren(root, 'part-list');
  const parts = directChildren(root, 'part');
  if (partLists.length !== 1 || parts.length !== 1) return null;
  const partList = partLists[0];
  const scoreParts = directChildren(partList, 'score-part');
  if (scoreParts.length !== 1) return null;
  for (const child of partList.children) {
    if (child.uri !== partList.uri || child.name === 'score-part') continue;
    if (!IGNORED_PART_LIST_CHILDREN.has(child.name)) return null;
    ignoredFeatures.add(`part-list:${child.name}`);
  }

  const scorePart = scoreParts[0];
  for (const child of scorePart.children) {
    if (child.uri !== scorePart.uri || child.name === 'part-name') continue;
    if (!IGNORED_SCORE_PART_CHILDREN.has(child.name)) return null;
    ignoredFeatures.add(`score-part:${child.name}`);
  }

  if (getAttribute(scorePart, 'id') !== getAttribute(parts[0], 'id')) return null;
  if (parts[0].children.some((child) => child.uri === parts[0].uri && child.name !== 'measure')) {
    return null;
  }

  const measureNodes = directChildren(parts[0], 'measure');
  if (measureNodes.length === 0) return null;
  const pitchOctaveShift = parseStandardGuitarTranspose(measureNodes);
  if (pitchOctaveShift === null) throw unsupported('transpose');

  const measures = [];
  const keySignatures = [];
  for (let measureIndex = 0; measureIndex < measureNodes.length; measureIndex += 1) {
    const measure = measureNodes[measureIndex];
    const children = [];
    for (const child of measure.children) {
      if (child.uri !== measure.uri) continue;
      if (child.name === 'attributes') {
        const attributes = sanitizeAttributes(child, ignoredFeatures, measureIndex, keySignatures);
        children.push(attributes);
        continue;
      }
      if (child.name === 'note') {
        const note = sanitizeNote(child, pitchOctaveShift, ignoredFeatures);
        children.push(note);
        continue;
      }
      if (child.name === 'backup' || child.name === 'forward') {
        children.push(cloneNode(child));
        continue;
      }
      if (child.name === 'direction') {
        if (!safeMetronomeDirection(child)) throw unsupported('direction');
        ignoredFeatures.add('measure:direction:metronome-tempo');
        continue;
      }
      if (child.name === 'barline') {
        if (!safeSimpleBarline(child)) throw unsupported('barline');
        ignoredFeatures.add('measure:barline:style');
        continue;
      }
      if (child.name === 'harmony') throw unsupported('harmony');
      if (IGNORED_MEASURE_CHILDREN.has(child.name)) {
        ignoredFeatures.add(`measure:${child.name}`);
        continue;
      }
      throw unsupported(`measure-child:${child.name}`);
    }
    measures.push(cloneNode(measure, { children }));
  }

  if (pitchOctaveShift !== 0) ignoredFeatures.add('guitar:sounding-octave-normalization');
  const derived = derivedDocument(parsedDocument, partList, scorePart, parts[0], measures);
  const sourceModel = projectParsedMusicXmlToPolyphonicSourceModel(derived, runtime);
  return Object.freeze({
    sourceModel,
    pitchOctaveShift,
    notationContext: Object.freeze({ keySignatures: Object.freeze(keySignatures) }),
    ignoredFeatures: Object.freeze([...ignoredFeatures].sort()),
  });
}

module.exports = {
  tryProjectRuntimeGuitarNotation,
};
