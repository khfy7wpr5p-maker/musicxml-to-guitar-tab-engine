'use strict';

const {
  PolyphonicMusicXmlProjectorError,
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../parser/polyphonicMusicXmlProjector');
const {
  extractPolyphonicGraceOrnaments,
} = require('../parser/polyphonicGraceOrnamentExtractor');
const {
  STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT,
  isStandardGuitarTranspose,
  shiftWrittenPitchByOctaves,
} = require('../guitar/standardGuitarRegister');

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
const SAFE_DIRECTION_ATTRIBUTES = new Set(['placement', 'directive']);
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
  'staff-tuning',
  'capo',
]);
const SAFE_STAFF_DETAILS_ATTRIBUTES = new Set([
  'number',
  'show-frets',
  'print-object',
  'print-spacing',
]);
const SAFE_CLEF_ATTRIBUTES = new Set([
  'number',
  'additional',
  'size',
  'after-barline',
  'print-object',
]);
const SAFE_CLEF_SIGNS = new Set(['G', 'F', 'C', 'TAB', 'percussion', 'jianpu', 'none']);
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
  'grace',
  'lyric',
  'time-modification',
  'play',
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

function isSafeDirectionStaff(node) {
  if (
    !node
    || node.attributes.length !== 0
    || node.children.length !== 0
    || !/^\d+$/.test(node.text.trim())
  ) return false;
  const staff = Number(node.text.trim());
  return Number.isSafeInteger(staff) && staff >= 1 && staff <= 2;
}

function isBoundedUnsignedDecimal(value, maximum) {
  const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(value || '');
  if (!match) return false;

  const integerDigits = (match[1] || '0').replace(/^0+(?=\d)/, '');
  const fractionalDigits = match[2] ?? match[3] ?? '';
  const maximumDigits = String(maximum);
  if (integerDigits.length !== maximumDigits.length) {
    return integerDigits.length < maximumDigits.length;
  }
  if (integerDigits !== maximumDigits) return integerDigits < maximumDigits;
  return !/[1-9]/.test(fractionalDigits);
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
  if (!isStandardGuitarTranspose({ diatonic, chromatic, octaveChange })) return null;
  return STANDARD_GUITAR_WRITTEN_PITCH_OCTAVE_SHIFT;
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
  if (!node || node.children.length !== 0 || node.attributes.length !== 0) {
    return null;
  }
  if (!/^(?:\d+|\d+\.\d+)$/.test(node.text.trim())) return null;
  const value = Number(node.text.trim());
  return Number.isFinite(value) && value > 0 && value <= 1000 ? value : null;
}

function hasSafeMetronomeDirectionAttributes(node) {
  const seen = new Set();
  for (const attribute of node.attributes) {
    if (attribute.uri.length !== 0 || !SAFE_DIRECTION_ATTRIBUTES.has(attribute.name)) return false;
    if (seen.has(attribute.name)) return false;
    seen.add(attribute.name);
    if (attribute.name === 'placement' && !['above', 'below'].includes(attribute.value)) return false;
    if (attribute.name === 'directive' && attribute.value !== 'yes') return false;
  }
  return true;
}

function hasSafeMetronomeLayoutAttributes(node) {
  const seen = new Set();
  for (const attribute of node.attributes) {
    if (attribute.uri.length !== 0 || !['parentheses', 'default-y'].includes(attribute.name)) {
      return false;
    }
    if (seen.has(attribute.name)) return false;
    seen.add(attribute.name);
    if (attribute.name === 'parentheses' && !['yes', 'no'].includes(attribute.value)) return false;
    if (
      attribute.name === 'default-y'
      && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(attribute.value)
        || !Number.isFinite(Number(attribute.value))
        || Math.abs(Number(attribute.value)) > 1_000_000)
    ) return false;
  }
  return true;
}

function safeMetronomeDirection(node) {
  if (!hasSafeMetronomeDirectionAttributes(node) || node.text.trim().length !== 0) return false;

  const children = node.children.filter((child) => child.uri === node.uri);
  if (
    children.length !== node.children.length
    || children.some((child) => !['direction-type', 'sound', 'staff'].includes(child.name))
  ) {
    return false;
  }
  const directionTypes = directChildren(node, 'direction-type');
  const soundNodes = directChildren(node, 'sound');
  const staffNodes = directChildren(node, 'staff');
  if (
    directionTypes.length !== 1
    || soundNodes.length > 1
    || staffNodes.length > 1
    || (staffNodes.length === 1 && !isSafeDirectionStaff(staffNodes[0]))
  ) return false;

  const directionType = directionTypes[0];
  if (
    directionType.attributes.length !== 0
    || directionType.text.trim().length !== 0
    || directionType.children.some((child) => child.uri !== directionType.uri)
  ) return false;
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
  if (
    !hasSafeMetronomeLayoutAttributes(metronome)
    || metronome.text.trim().length !== 0
    || metronome.children.some((child) => child.uri !== metronome.uri)
  ) return false;
  const metronomeChildren = metronome.children.filter((child) => child.uri === metronome.uri);
  if (metronomeChildren.some((child) => !['beat-unit', 'per-minute'].includes(child.name))) {
    return false;
  }
  const beatUnits = directChildren(metronome, 'beat-unit');
  const perMinutes = directChildren(metronome, 'per-minute');
  if (beatUnits.length !== 1 || perMinutes.length !== 1) return false;
  if (
    hasSameNamespaceChildren(beatUnits[0])
    || beatUnits[0].children.length !== 0
    || beatUnits[0].attributes.length !== 0
    || !['whole', 'half', 'quarter', 'eighth', '16th', '32nd'].includes(beatUnits[0].text.trim())
  ) {
    return false;
  }
  const perMinute = positiveTempo(perMinutes[0]);
  if (perMinute === null) return false;

  if (soundNodes.length === 1) {
    const sound = soundNodes[0];
    if (
      sound.children.length !== 0
      || sound.attributes.length !== 1
      || sound.attributes[0].uri.length !== 0
      || sound.attributes[0].name !== 'tempo'
      || sound.text.trim().length !== 0
    ) {
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

function safeGuitarProDynamicsDirection(node) {
  if (!hasSafeMetronomeDirectionAttributes(node) || node.text.trim().length !== 0) return false;
  const children = node.children.filter((child) => child.uri === node.uri);
  if (
    children.length !== node.children.length
    || children.some((child) => !['direction-type', 'sound', 'staff'].includes(child.name))
  ) return false;
  const directionTypes = directChildren(node, 'direction-type');
  const soundNodes = directChildren(node, 'sound');
  const staffNodes = directChildren(node, 'staff');
  if (
    directionTypes.length !== 1
    || soundNodes.length > 1
    || staffNodes.length > 1
    || (staffNodes.length === 1 && !isSafeDirectionStaff(staffNodes[0]))
  ) return false;

  const directionType = directionTypes[0];
  if (
    directionType.attributes.length !== 0
    || directionType.children.length !== 1
    || directionType.text.trim().length !== 0
  ) return false;
  const dynamicsNodes = directChildren(directionType, 'dynamics');
  if (dynamicsNodes.length !== 1) return false;

  const dynamics = dynamicsNodes[0];
  if (dynamics.attributes.length !== 0 || dynamics.children.length !== 1) return false;
  const mark = dynamics.children[0];
  if (!(
    mark.uri === dynamics.uri
    && ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'].includes(mark.name)
    && mark.attributes.length === 0
    && mark.children.length === 0
    && mark.text.trim().length === 0
  )) return false;

  const isLegacyExactDirection = (
    node.attributes.length === 0
    && children.length === 1
    && soundNodes.length === 0
    && staffNodes.length === 0
    && ['p', 'mf', 'f'].includes(mark.name)
  );
  if (isLegacyExactDirection) return true;

  const placementAttributes = node.attributes.filter((attribute) => (
    attribute.uri.length === 0 && attribute.name === 'placement'
  ));
  if (
    node.attributes.length !== 1
    || placementAttributes.length !== 1
    || !['above', 'below'].includes(placementAttributes[0].value)
    || soundNodes.length !== 1
    || staffNodes.length !== 1
  ) return false;

  const sound = soundNodes[0];
  if (
    sound.children.length !== 0
    || sound.attributes.length !== 1
    || sound.attributes[0].uri.length !== 0
    || sound.attributes[0].name !== 'dynamics'
    || sound.text.trim().length !== 0
    || !isBoundedUnsignedDecimal(sound.attributes[0].value, 127)
  ) return false;
  return true;
}

// Display-only rehearsal labels are safe only in this exact, bounded shape.
// Playback, timing, staff, voice, layout, and extension data remain unsupported.
function safeDisplayRehearsalDirection(node) {
  if (
    node.attributes.length !== 0
    || node.children.length !== 1
    || node.text.trim().length !== 0
  ) return false;
  const directionType = node.children[0];
  if (
    directionType.uri !== node.uri
    || directionType.name !== 'direction-type'
    || directionType.attributes.length !== 0
    || directionType.children.length !== 1
    || directionType.text.trim().length !== 0
  ) return false;

  const rehearsal = directionType.children[0];
  const text = rehearsal.text.trim();
  return (
    rehearsal.uri === directionType.uri
    && rehearsal.name === 'rehearsal'
    && rehearsal.attributes.length === 0
    && rehearsal.children.length === 0
    && text.length > 0
    && text.length <= 256
  );
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

function safeStaffTuning(node) {
  if (!hasOnlyUnqualifiedAttributes(node, new Set(['line']))) return false;
  const line = getAttribute(node, 'line');
  if (line !== undefined && (!/^\d+$/.test(line) || Number(line) < 1 || Number(line) > 16)) return false;
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.some((child) => !['tuning-step', 'tuning-alter', 'tuning-octave'].includes(child.name))) {
    return false;
  }
  const steps = directChildren(node, 'tuning-step');
  const alters = directChildren(node, 'tuning-alter');
  const octaves = directChildren(node, 'tuning-octave');
  if (steps.length !== 1 || alters.length > 1 || octaves.length !== 1) return false;
  if (
    hasSameNamespaceChildren(steps[0])
    || !hasOnlyUnqualifiedAttributes(steps[0], new Set())
    || !['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(steps[0].text.trim())
  ) return false;
  if (alters.length === 1) {
    const alter = scalarInteger(alters[0]);
    if (alter === null || alter < -2 || alter > 2) return false;
  }
  const octave = scalarInteger(octaves[0]);
  return octave !== null && octave >= 0 && octave <= 9;
}

function safeStaffDetails(node) {
  const unsafeChildren = node.children.some((child) => (
    child.uri === node.uri
    && (!SAFE_STAFF_DETAILS_CHILDREN.has(child.name)
      || (child.name === 'staff-tuning' && !safeStaffTuning(child)))
  ));
  if (unsafeChildren) return false;
  return !node.attributes.some((attribute) => (
    attribute.uri.length === 0 && !SAFE_STAFF_DETAILS_ATTRIBUTES.has(attribute.name)
  ));
}

function safeClef(node) {
  if (!hasOnlyUnqualifiedAttributes(node, SAFE_CLEF_ATTRIBUTES)) return false;
  const number = getAttribute(node, 'number');
  if (number !== undefined && (!/^\d+$/.test(number) || Number(number) < 1 || Number(number) > 16)) {
    return false;
  }
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.some((child) => !['sign', 'line', 'clef-octave-change'].includes(child.name))) return false;
  const signs = directChildren(node, 'sign');
  const lines = directChildren(node, 'line');
  const octaveChanges = directChildren(node, 'clef-octave-change');
  if (signs.length !== 1 || lines.length > 1 || octaveChanges.length > 1) return false;
  if (
    hasSameNamespaceChildren(signs[0])
    || !hasOnlyUnqualifiedAttributes(signs[0], new Set())
    || !SAFE_CLEF_SIGNS.has(signs[0].text.trim())
  ) return false;
  if (lines.length === 1) {
    const line = scalarInteger(lines[0]);
    if (line === null || line < 1 || line > 8) return false;
  }
  if (octaveChanges.length === 1) {
    const change = scalarInteger(octaveChanges[0]);
    if (change === null || change < -4 || change > 4) return false;
  }
  return true;
}

function safeTechnical(node) {
  if (node.attributes.length !== 0 || node.children.some((child) => child.uri !== node.uri)) {
    return false;
  }
  const children = node.children.filter((child) => child.uri === node.uri);
  if (
    children.length === 0
    || children.some((child) => !['harmonic', 'string', 'fret'].includes(child.name))
  ) {
    return false;
  }
  const harmonics = directChildren(node, 'harmonic');
  const strings = directChildren(node, 'string');
  const frets = directChildren(node, 'fret');
  if (harmonics.length > 1 || strings.length > 1 || frets.length > 1) return false;
  if (harmonics.length === 1 && (
    harmonics[0].children.length !== 0
    || harmonics[0].attributes.length !== 0
    || harmonics[0].text.trim().length !== 0
  )) return false;
  if (harmonics.length === 0 && strings.length === 0 && frets.length === 0) return false;
  for (const stringNode of strings) {
    if (stringNode.attributes.some((attribute) => (
      attribute.uri.length !== 0 || attribute.name !== 'placement'
    ))) return false;
    const string = scalarInteger(stringNode);
    if (string === null || string < 1 || string > 16) return false;
  }
  for (const fretNode of frets) {
    if (fretNode.attributes.some((attribute) => (
      attribute.uri.length !== 0 || attribute.name !== 'placement'
    ))) return false;
    const fret = scalarInteger(fretNode);
    if (fret === null || fret < 0 || fret > 48) return false;
  }
  return true;
}

function safeGuitarProStraightMutePlay(node) {
  if (node.attributes.length !== 0 || node.children.length !== 1) return false;
  const muteNodes = directChildren(node, 'mute');
  if (muteNodes.length !== 1) return false;
  const mute = muteNodes[0];
  return (
    mute.attributes.length === 0
    && mute.children.length === 0
    && mute.text.trim() === 'straight'
  );
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

function sanitizeAttributes(node, ignoredFeatures, measureIndex, keySignatures) {
  const children = [];
  for (const child of node.children) {
    if (child.uri !== node.uri) continue;
    if (child.name === 'divisions' || child.name === 'time') {
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'staves') {
      const staffCount = scalarInteger(child);
      if (staffCount === null || staffCount < 1 || staffCount > 2) throw unsupported('staves');
      children.push(cloneNode(child));
      if (staffCount === 2) ignoredFeatures.add('attributes:two-staff-layout');
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
      if (!safeClef(child)) throw unsupported('clef');
      ignoredFeatures.add('attributes:clef-layout');
      continue;
    }
    if (child.name === 'staff-details') {
      if (!safeStaffDetails(child)) throw unsupported('staff-details');
      ignoredFeatures.add('attributes:staff-details');
      if (directChildren(child, 'staff-tuning').length > 0) {
        ignoredFeatures.add('attributes:staff-tuning-provenance');
      }
      if (directChildren(child, 'capo').length > 0) {
        ignoredFeatures.add('attributes:capo-provenance');
      }
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
    if (
      child.name === 'articulations'
      && child.text.trim().length === 0
      && child.attributes.length === 0
      && child.children.length === 1
      && child.children[0].uri === child.uri
      && child.children[0].name === 'staccato'
      && child.children[0].text.trim().length === 0
      && child.children[0].attributes.length === 0
      && child.children[0].children.length === 0
    ) {
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'articulations' && safeArticulations(child, ignoredFeatures)) {
      continue;
    }
    if (child.name === 'tuplet' || child.name === 'fermata') {
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'technical' && safeTechnical(child)) {
      if (directChildren(child, 'harmonic').length === 1) {
        ignoredFeatures.add('notation:technical:harmonic-provenance');
      }
      if (directChildren(child, 'string').length > 0 || directChildren(child, 'fret').length > 0) {
        ignoredFeatures.add('notation:technical:string-fret-provenance');
      }
      continue;
    }
    throw unsupported(`notation:${child.name}`);
  }
  return children.length === 0 ? null : cloneNode(node, { children });
}

function sanitizePitch(node, pitchOctaveShift) {
  if (pitchOctaveShift === 0) return cloneNode(node);
  const stepNodes = directChildren(node, 'step');
  const alterNodes = directChildren(node, 'alter');
  const octaveNodes = directChildren(node, 'octave');
  const step = stepNodes.length === 1 && !hasSameNamespaceChildren(stepNodes[0])
    ? stepNodes[0].text.trim()
    : null;
  const alter = alterNodes.length === 0 ? 0 : scalarInteger(alterNodes[0]);
  const octave = octaveNodes.length === 1 ? scalarInteger(octaveNodes[0]) : null;
  if (step === null || alterNodes.length > 1 || octave === null) return null;
  const targetPitch = shiftWrittenPitchByOctaves({ step, alter, octave }, pitchOctaveShift);
  if (!targetPitch) return null;
  const children = node.children.map((child) => (
    child === octaveNodes[0]
      ? cloneNode(child, { text: String(targetPitch.octave) })
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
      const staff = scalarInteger(child);
      if (staff === null || staff < 1 || staff > 2) throw unsupported('note-staff');
      children.push(cloneNode(child));
      continue;
    }
    if (child.name === 'notations') {
      const notations = sanitizeNotations(child, ignoredFeatures);
      if (notations) children.push(notations);
      continue;
    }
    if (child.name === 'play') {
      if (!safeGuitarProStraightMutePlay(child)) throw unsupported('note-child:play');
      ignoredFeatures.add('note:play:straight-mute-provenance');
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

function tryNormalizeRuntimeGuitarNotation(parsedDocument) {
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
        if (safeMetronomeDirection(child)) {
          ignoredFeatures.add('measure:direction:metronome-tempo');
          continue;
        }
        if (safeGuitarProDynamicsDirection(child)) {
          ignoredFeatures.add('measure:direction:dynamics');
          continue;
        }
        if (safeDisplayRehearsalDirection(child)) {
          ignoredFeatures.add('measure:direction:rehearsal');
          continue;
        }
        throw unsupported('direction');
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
  return Object.freeze({
    parsedDocument: derived,
    pitchOctaveShift,
    notationContext: Object.freeze({ keySignatures: Object.freeze(keySignatures) }),
    ignoredFeatures: Object.freeze([...ignoredFeatures].sort()),
  });
}

function tryProjectRuntimeGuitarNotation(parsedDocument, runtime = null) {
  const normalization = tryNormalizeRuntimeGuitarNotation(parsedDocument);
  if (!normalization) return null;
  const semanticNormalization = extractPolyphonicGraceOrnaments(
    normalization.parsedDocument,
    runtime,
  );
  if (semanticNormalization.graceOrnamentGroups.length > 0) {
    throw unsupported('grace-requires-production-compatibility-chain');
  }
  return Object.freeze({
    ...normalization,
    sourceModel: projectParsedMusicXmlToPolyphonicSourceModel(
      semanticNormalization.parsedMainDocument,
      runtime,
    ),
    ignoredFeatures: Object.freeze([...new Set([
      ...normalization.ignoredFeatures,
      ...semanticNormalization.ignoredFeatures,
      ...(semanticNormalization.staccatoMarkers.length > 0
        ? ['notation:articulation:staccato']
        : []),
    ])].sort()),
  });
}

module.exports = {
  tryNormalizeRuntimeGuitarNotation,
  tryProjectRuntimeGuitarNotation,
};
