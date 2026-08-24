'use strict';

const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');

const PARSED_MUSICXML_DOCUMENT_VERSION = '1.0.0';
const ALLOWED_MEASURE_CHILDREN = new Set(['attributes', 'note', 'backup', 'forward']);
const ALLOWED_ATTRIBUTES_CHILDREN = new Set([
  'divisions',
  'time',
  'staves',
  'part-symbol',
  'clef',
  'staff-details',
  'transpose',
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
]);
const ALLOWED_ROOT_CHILDREN = new Set(['identification', 'part-list', 'part']);
const ALLOWED_SCORE_PART_CHILDREN = new Set(['part-name', 'score-instrument']);
const ALLOWED_TECHNICAL_CHILDREN = new Set(['fingering', 'string', 'fret']);

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

function hasTabClefForStaffTwo(parsedDocument) {
  const pending = [parsedDocument.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (
      node.name === 'clef'
      && (getAttribute(node, 'number') || '1') === '2'
      && directChildren(node, 'sign').some((sign) => sign.text.trim().toUpperCase() === 'TAB')
    ) {
      return true;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }
  return false;
}

function notationPitchOctaveShift(attributesNodes) {
  const transposeNodes = attributesNodes.flatMap((attributes) => directChildren(attributes, 'transpose'));
  if (transposeNodes.length === 0) return 0;
  if (transposeNodes.length !== 1) return null;

  const transpose = transposeNodes[0];
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
  if (
    diatonicNodes.length !== 1
    || chromaticNodes.length !== 1
    || octaveChangeNodes.length !== 1
  ) {
    return null;
  }
  const diatonic = scalarInteger(diatonicNodes[0]);
  const chromatic = scalarInteger(chromaticNodes[0]);
  const octaveChange = scalarInteger(octaveChangeNodes[0]);
  if (diatonic !== 0 || chromatic !== 0 || octaveChange !== -1) return null;
  return octaveChange;
}

function sanitizedAttributes(attributesNode) {
  if (
    attributesNode.children.some(
      (child) => child.uri === attributesNode.uri && !ALLOWED_ATTRIBUTES_CHILDREN.has(child.name),
    )
  ) {
    return null;
  }

  const children = [];
  for (const child of attributesNode.children) {
    if (child.uri !== attributesNode.uri) continue;
    if (child.name === 'divisions' || child.name === 'time') {
      children.push(cloneNode(child));
    } else if (child.name === 'staves') {
      children.push(cloneNode(child, { text: '1' }));
    }
  }
  return cloneNode(attributesNode, { children });
}

function staffNumber(noteNode) {
  const staffNodes = directChildren(noteNode, 'staff');
  if (staffNodes.length === 0) return 1;
  if (staffNodes.length !== 1) return null;
  return scalarInteger(staffNodes[0]);
}

function sanitizedNotations(notationsNode, sourceStaff) {
  const children = [];
  for (const child of notationsNode.children) {
    if (child.uri !== notationsNode.uri) continue;
    if (child.name === 'tied') {
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'technical' && sourceStaff === 2) {
      const unqualifiedAttributes = child.attributes.filter((attribute) => attribute.uri.length === 0);
      if (unqualifiedAttributes.length !== 0) return false;
      if (
        child.children.some(
          (technicalChild) => (
            technicalChild.uri !== child.uri
            || !ALLOWED_TECHNICAL_CHILDREN.has(technicalChild.name)
            || technicalChild.children.length !== 0
          ),
        )
      ) {
        return false;
      }
      const stringNodes = directChildren(child, 'string');
      const fretNodes = directChildren(child, 'fret');
      if (
        stringNodes.length !== 1
        || fretNodes.length !== 1
        || scalarInteger(stringNodes[0]) === null
        || scalarInteger(fretNodes[0]) === null
      ) {
        return false;
      }
      continue;
    }
    return false;
  }
  if (children.length === 0) return null;
  return cloneNode(notationsNode, { children });
}

function sanitizedNote(noteNode, sourceStaff, pitchOctaveShift) {
  if (
    noteNode.children.some(
      (child) => child.uri === noteNode.uri && !ALLOWED_NOTE_CHILDREN.has(child.name),
    )
  ) {
    return null;
  }

  const children = [];
  for (const child of noteNode.children) {
    if (child.uri !== noteNode.uri) continue;
    if (child.name === 'staff') {
      children.push(cloneNode(child, { text: '1' }));
      continue;
    }
    if (child.name === 'notations') {
      const notations = sanitizedNotations(child, sourceStaff);
      if (notations === false) return null;
      if (notations) children.push(notations);
      continue;
    }
    if (child.name === 'pitch' && pitchOctaveShift !== 0) {
      const octaveNodes = directChildren(child, 'octave');
      const octave = octaveNodes.length === 1 ? scalarInteger(octaveNodes[0]) : null;
      if (octave === null || !Number.isSafeInteger(octave + pitchOctaveShift)) return null;
      const pitchChildren = child.children.map((pitchChild) => (
        pitchChild === octaveNodes[0]
          ? cloneNode(pitchChild, { text: String(octave + pitchOctaveShift) })
          : cloneNode(pitchChild)
      ));
      children.push(cloneNode(child, { children: pitchChildren }));
      continue;
    }
    children.push(cloneNode(child));
  }
  return cloneNode(noteNode, { children });
}

function sanitizedTiming(node) {
  return cloneNode(node);
}

function findStaffBoundary(measureNode) {
  const noteRecords = [];
  for (let index = 0; index < measureNode.children.length; index += 1) {
    const child = measureNode.children[index];
    if (child.uri !== measureNode.uri || child.name !== 'note') continue;
    const staff = staffNumber(child);
    if (staff !== 1 && staff !== 2) return null;
    noteRecords.push({ index, staff });
  }
  if (noteRecords.length === 0) return { boundary: measureNode.children.length, empty: true };

  const firstStaffTwo = noteRecords.findIndex((record) => record.staff === 2);
  if (firstStaffTwo <= 0) return null;
  if (noteRecords.slice(0, firstStaffTwo).some((record) => record.staff !== 1)) return null;
  if (noteRecords.slice(firstStaffTwo).some((record) => record.staff !== 2)) return null;

  const firstStaffTwoChildIndex = noteRecords[firstStaffTwo].index;
  let boundary = -1;
  for (let index = firstStaffTwoChildIndex - 1; index >= 0; index -= 1) {
    const child = measureNode.children[index];
    if (child.uri === measureNode.uri && child.name === 'backup') {
      boundary = index;
      break;
    }
  }
  return boundary >= 0 ? { boundary, empty: false } : null;
}

function cursorDuration(node) {
  const durationNodes = directChildren(node, 'duration');
  if (durationNodes.length !== 1) return null;
  const duration = scalarInteger(durationNodes[0]);
  return duration !== null && duration > 0 ? duration : null;
}

function boundaryResetsNotationCursor(measureNode, boundary) {
  let cursor = 0;
  for (let index = 0; index < boundary; index += 1) {
    const child = measureNode.children[index];
    if (child.uri !== measureNode.uri || child.name === 'attributes') continue;
    if (child.name === 'note') {
      const chordNodes = directChildren(child, 'chord');
      if (chordNodes.length > 1) return false;
      if (chordNodes.length === 0) {
        const duration = cursorDuration(child);
        if (duration === null || cursor > Number.MAX_SAFE_INTEGER - duration) return false;
        cursor += duration;
      }
      continue;
    }
    if (child.name === 'forward' || child.name === 'backup') {
      const duration = cursorDuration(child);
      if (duration === null) return false;
      if (child.name === 'forward') {
        if (cursor > Number.MAX_SAFE_INTEGER - duration) return false;
        cursor += duration;
      } else {
        if (duration > cursor) return false;
        cursor -= duration;
      }
    }
  }
  const resetDuration = cursorDuration(measureNode.children[boundary]);
  return resetDuration !== null && resetDuration === cursor;
}

function buildMeasure(measureNode, sourceStaff, boundary, empty, pitchOctaveShift) {
  const children = [];
  for (let index = 0; index < measureNode.children.length; index += 1) {
    const child = measureNode.children[index];
    if (child.uri !== measureNode.uri) continue;
    if (!ALLOWED_MEASURE_CHILDREN.has(child.name)) return null;

    if (child.name === 'attributes') {
      const attributes = sanitizedAttributes(child);
      if (!attributes) return null;
      children.push(attributes);
      continue;
    }
    if (empty) continue;

    const inSelectedBlock = sourceStaff === 1 ? index < boundary : index > boundary;
    if (!inSelectedBlock) continue;
    if (child.name === 'note') {
      if (staffNumber(child) !== sourceStaff) return null;
      const note = sanitizedNote(child, sourceStaff, pitchOctaveShift);
      if (!note) return null;
      children.push(note);
    } else {
      children.push(sanitizedTiming(child));
    }
  }
  return cloneNode(measureNode, { children });
}

function derivedDocument(parsedDocument, partList, scorePart, part, measures) {
  const root = parsedDocument.root;
  const partName = directChildren(scorePart, 'part-name')[0];
  const derivedScorePart = cloneNode(scorePart, {
    children: partName ? [cloneNode(partName)] : [],
  });
  const derivedPartList = cloneNode(partList, { children: [derivedScorePart] });
  const derivedPart = cloneNode(part, { children: measures });
  return {
    documentType: 'ParsedMusicXmlDocument',
    contractVersion: PARSED_MUSICXML_DOCUMENT_VERSION,
    root: cloneNode(root, { children: [derivedPartList, derivedPart] }),
  };
}

function fingerprint(event) {
  return JSON.stringify([
    event.type,
    event.onsetDivisions,
    event.durationDivisions,
    event.type === 'note' ? event.pitch.midi : null,
    event.tieStart,
    event.tieStop,
    event.source.chordWithPrevious,
  ]);
}

function exactModelsMatch(notationModel, tabModel) {
  if (notationModel.measures.length !== tabModel.measures.length) return false;
  for (let index = 0; index < notationModel.measures.length; index += 1) {
    const notation = notationModel.measures[index].events.map(fingerprint).sort();
    const tab = tabModel.measures[index].events.map(fingerprint).sort();
    if (notation.length !== tab.length) return false;
    if (notation.some((value, eventIndex) => value !== tab[eventIndex])) return false;
  }
  return true;
}

function tryProjectExactTabStaffMirror(parsedDocument, runtime) {
  if (!hasTabClefForStaffTwo(parsedDocument)) return null;

  const root = parsedDocument.root;
  if (
    root.children.some(
      (child) => child.uri === root.uri && !ALLOWED_ROOT_CHILDREN.has(child.name),
    )
  ) {
    return null;
  }
  const partLists = directChildren(root, 'part-list');
  const parts = directChildren(root, 'part');
  if (partLists.length !== 1 || parts.length !== 1) return null;
  const scoreParts = directChildren(partLists[0], 'score-part');
  if (scoreParts.length !== 1) return null;
  if (
    partLists[0].children.some(
      (child) => child.uri === partLists[0].uri && child.name !== 'score-part',
    )
    || scoreParts[0].children.some(
      (child) => child.uri === scoreParts[0].uri && !ALLOWED_SCORE_PART_CHILDREN.has(child.name),
    )
    || parts[0].children.some(
      (child) => child.uri === parts[0].uri && child.name !== 'measure',
    )
  ) {
    return null;
  }
  if (getAttribute(scoreParts[0], 'id') !== getAttribute(parts[0], 'id')) return null;

  const measureNodes = directChildren(parts[0], 'measure');
  if (measureNodes.length === 0) return null;
  const attributesNodes = measureNodes.flatMap((measure) => directChildren(measure, 'attributes'));
  const declaredStaves = attributesNodes.flatMap((attributes) => directChildren(attributes, 'staves'));
  if (declaredStaves.length === 0 || declaredStaves.some((staves) => scalarInteger(staves) !== 2)) {
    return null;
  }
  const notationOctaveShift = notationPitchOctaveShift(attributesNodes);
  if (notationOctaveShift === null) return null;

  const notationMeasures = [];
  const tabMeasures = [];
  for (let index = 0; index < measureNodes.length; index += 1) {
    runtime.checkpoint('app-upload:tab-mirror-measure', { measureIndex: index });
    const boundary = findStaffBoundary(measureNodes[index]);
    if (!boundary) return null;
    if (!boundary.empty && !boundaryResetsNotationCursor(measureNodes[index], boundary.boundary)) {
      return null;
    }
    const notationMeasure = buildMeasure(
      measureNodes[index],
      1,
      boundary.boundary,
      boundary.empty,
      notationOctaveShift,
    );
    const tabMeasure = buildMeasure(
      measureNodes[index],
      2,
      boundary.boundary,
      boundary.empty,
      0,
    );
    if (!notationMeasure || !tabMeasure) return null;
    notationMeasures.push(notationMeasure);
    tabMeasures.push(tabMeasure);
  }

  const notationDocument = derivedDocument(
    parsedDocument,
    partLists[0],
    scoreParts[0],
    parts[0],
    notationMeasures,
  );
  const tabDocument = derivedDocument(
    parsedDocument,
    partLists[0],
    scoreParts[0],
    parts[0],
    tabMeasures,
  );
  const notationModel = projectParsedMusicXmlToPolyphonicSourceModel(notationDocument, runtime);
  const tabModel = projectParsedMusicXmlToPolyphonicSourceModel(tabDocument, runtime);
  if (!exactModelsMatch(notationModel, tabModel)) return null;

  const omittedRepresentationNoteCount = tabModel.measures.reduce(
    (count, measure) => count + measure.events.filter((event) => event.type === 'note').length,
    0,
  );
  if (omittedRepresentationNoteCount === 0) return null;

  return Object.freeze({
    sourceModel: notationModel,
    normalization: Object.freeze({
      tabStaffMirrorCollapsed: true,
      collapsedStaff: 2,
      omittedRepresentationNoteIds: Object.freeze([]),
      omittedRepresentationNoteCount,
    }),
  });
}

module.exports = {
  tryProjectExactTabStaffMirror,
};
