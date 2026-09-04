'use strict';

const { EngineError } = require('../errors/engineError');

const POLYPHONIC_PERFORMANCE_METADATA_POLICY_VERSION = '1.0.0';
const POLYPHONIC_PERFORMANCE_METADATA_POLICY_AUTHORITY =
  'NON_TAB_AUTHORITATIVE_PERFORMANCE_AND_DISPLAY_METADATA_ONLY';
const MAX_LAYOUT_TENTHS_MAGNITUDE = 1_000_000;
const MAX_WORD_TEXT_LENGTH = 256;
const MAX_FONT_FAMILY_LENGTH = 256;
const MAX_INVALID_DYNAMICS_FRACTION_DIGITS = 6;

const SAFE_DYNAMIC_MARKS = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff']);
const SAFE_DIRECTION_ATTRIBUTES = new Set(['placement', 'directive']);
const SAFE_WORDS_ATTRIBUTES = new Set([
  'default-x',
  'default-y',
  'relative-x',
  'relative-y',
  'font-family',
  'font-style',
  'font-size',
  'font-weight',
  'color',
  'halign',
  'valign',
  'enclosure',
]);
const SAFE_TEMPO_WORDS = new Set([
  'a tempo',
  'accelerando',
  'accel.',
  'adagio',
  'allegretto',
  'allegro',
  'andante',
  'andantino',
  'grave',
  'largo',
  'larghetto',
  'lento',
  'maestoso',
  'moderato',
  'presto',
  'prestissimo',
  'rall.',
  'rallentando',
  'rit.',
  'ritardando',
  'tempo primo',
  'vivace',
]);

class PolyphonicPerformanceMetadataPolicyError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_POLYPHONIC_PERFORMANCE_METADATA_POLICY',
      Object.freeze({ ...details }),
      'PolyphonicPerformanceMetadataPolicyError',
    );
  }
}

function invalid(message, details = {}) {
  return new PolyphonicPerformanceMetadataPolicyError(message, details);
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime === null || runtime === undefined) return;
  if (typeof runtime !== 'object' || typeof runtime.checkpoint !== 'function') {
    throw invalid('runtime must expose a ProcessingRuntime checkpoint function.', { field: 'runtime' });
  }
  runtime.checkpoint(phase, details);
}

function directChildren(node, name = null) {
  return node.children.filter((child) => (
    child.uri === node.uri && (name === null || child.name === name)
  ));
}

function getUniqueAttribute(node, name) {
  const matches = node.attributes.filter((attribute) => (
    attribute.uri.length === 0 && attribute.name === name
  ));
  return matches.length === 1 ? matches[0].value : undefined;
}

function hasExactUnqualifiedAttributes(node, allowedNames, requiredNames = []) {
  const seen = new Set();
  for (const attribute of node.attributes) {
    if (attribute.uri.length !== 0 || !allowedNames.has(attribute.name) || seen.has(attribute.name)) {
      return false;
    }
    seen.add(attribute.name);
  }
  return requiredNames.every((name) => seen.has(name));
}

function hasExactChildSequence(children, expectedNames) {
  return children.length === expectedNames.length
    && children.every((child, index) => child.name === expectedNames[index]);
}

function cloneAttributes(attributes) {
  return attributes.map((attribute) => ({ ...attribute }));
}

function cloneNode(node, childMapper = null) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.children)) {
    throw invalid('Parsed MusicXML node shape is invalid.');
  }
  const children = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const mapped = childMapper ? childMapper(child, index) : cloneNode(child);
    if (mapped !== null) children.push(mapped);
  }
  return {
    name: node.name,
    uri: node.uri,
    attributes: cloneAttributes(node.attributes),
    text: node.text,
    children,
  };
}

function deepFreezeNode(node) {
  for (const attribute of node.attributes) Object.freeze(attribute);
  Object.freeze(node.attributes);
  for (const child of node.children) deepFreezeNode(child);
  Object.freeze(node.children);
  return Object.freeze(node);
}

function measureNumber(measure, measureIndex) {
  const value = getUniqueAttribute(measure, 'number');
  return value === undefined ? String(measureIndex + 1) : value;
}

function scalarPositiveInteger(node) {
  if (
    !node
    || node.attributes.length !== 0
    || node.children.length !== 0
    || !/^\d+$/.test(node.text.trim())
  ) return null;
  const value = Number(node.text.trim());
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function canonicalBoundedUnsignedDecimal(value, maximum) {
  const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(value || '');
  if (!match) return null;
  const integerDigits = (match[1] || '0').replace(/^0+(?=\d)/, '');
  const fractionalDigits = match[2] ?? match[3] ?? '';
  const maximumDigits = String(maximum);
  if (integerDigits.length !== maximumDigits.length) {
    if (integerDigits.length > maximumDigits.length) return null;
  } else if (integerDigits > maximumDigits) {
    return null;
  } else if (integerDigits === maximumDigits && /[1-9]/.test(fractionalDigits)) {
    return null;
  }
  const normalizedFraction = fractionalDigits.replace(/0+$/, '');
  return normalizedFraction.length === 0
    ? integerDigits
    : `${integerDigits}.${normalizedFraction}`;
}

function canonicalInvalidNegativeDynamics(value) {
  const match = /^-(\d+)(?:\.(\d+))?$/.exec(value || '');
  if (!match) return null;
  const fractionalDigits = match[2] || '';
  if (fractionalDigits.length > MAX_INVALID_DYNAMICS_FRACTION_DIGITS) return null;
  const magnitude = canonicalBoundedUnsignedDecimal(
    `${match[1]}${fractionalDigits.length > 0 ? `.${fractionalDigits}` : ''}`,
    127,
  );
  if (magnitude === null || magnitude === '0') return null;
  return `-${magnitude}`;
}

function isBoundedLayoutTenths(value) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value || '')) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= MAX_LAYOUT_TENTHS_MAGNITUDE;
}

function isSafeDirectionAttributes(node) {
  if (!hasExactUnqualifiedAttributes(node, SAFE_DIRECTION_ATTRIBUTES)) return false;
  for (const attribute of node.attributes) {
    if (attribute.name === 'placement' && !['above', 'below'].includes(attribute.value)) return false;
    if (attribute.name === 'directive' && attribute.value !== 'yes') return false;
  }
  return true;
}

function isSafeWordsAttribute(attribute) {
  if (attribute.uri.length !== 0 || !SAFE_WORDS_ATTRIBUTES.has(attribute.name)) return false;
  if (['default-x', 'default-y', 'relative-x', 'relative-y'].includes(attribute.name)) {
    return isBoundedLayoutTenths(attribute.value);
  }
  if (attribute.name === 'font-family') {
    return attribute.value.length > 0
      && attribute.value.length <= MAX_FONT_FAMILY_LENGTH
      && !/[\u0000-\u001f\u007f]/.test(attribute.value);
  }
  if (attribute.name === 'font-style') return ['normal', 'italic'].includes(attribute.value);
  if (attribute.name === 'font-weight') return ['normal', 'bold'].includes(attribute.value);
  if (attribute.name === 'font-size') {
    return /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|\d+(?:\.\d+)?)$/.test(attribute.value)
      && (Number.isNaN(Number(attribute.value)) || Number(attribute.value) <= 1000);
  }
  if (attribute.name === 'color') return /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(attribute.value);
  if (attribute.name === 'halign') return ['left', 'center', 'right'].includes(attribute.value);
  if (attribute.name === 'valign') return ['top', 'middle', 'bottom', 'baseline'].includes(attribute.value);
  if (attribute.name === 'enclosure') {
    return ['rectangle', 'square', 'oval', 'circle', 'bracket', 'triangle', 'diamond', 'none'].includes(attribute.value);
  }
  return false;
}

function isSafeTempoWordsNode(node) {
  if (
    node.name !== 'words'
    || node.children.length !== 0
    || node.text.length > MAX_WORD_TEXT_LENGTH
    || node.text.trim().length === 0
  ) return false;
  const seen = new Set();
  for (const attribute of node.attributes) {
    if (seen.has(attribute.name) || !isSafeWordsAttribute(attribute)) return false;
    seen.add(attribute.name);
  }
  return SAFE_TEMPO_WORDS.has(node.text.trim().toLowerCase());
}

function parseWordsDirection(node, effectiveStaffCount, location) {
  if (!isSafeDirectionAttributes(node) || node.text.trim().length !== 0) return null;
  const children = directChildren(node);
  if (children.length !== node.children.length) return null;
  const directionTypes = directChildren(node, 'direction-type');
  const staffNodes = directChildren(node, 'staff');
  if (directionTypes.length !== 1 || staffNodes.length > 1) return null;
  if (children.some((child) => !['direction-type', 'staff'].includes(child.name))) return null;
  const expected = staffNodes.length === 1 ? ['direction-type', 'staff'] : ['direction-type'];
  if (!hasExactChildSequence(children, expected)) return null;
  let staff = null;
  if (staffNodes.length === 1) {
    staff = scalarPositiveInteger(staffNodes[0]);
    if (staff === null || effectiveStaffCount === null || staff > effectiveStaffCount) return null;
  }
  const directionType = directionTypes[0];
  if (
    directionType.attributes.length !== 0
    || directionType.text.trim().length !== 0
    || directionType.children.length !== 1
    || directionType.children[0].uri !== directionType.uri
    || !isSafeTempoWordsNode(directionType.children[0])
  ) return null;
  const words = directionType.children[0];
  return Object.freeze({
    kind: 'WORDS',
    authority: 'DISPLAY_PERFORMANCE_ONLY',
    rawText: words.text,
    displayText: words.text,
    staff,
    location: Object.freeze({ ...location }),
  });
}

function positiveTempo(node) {
  if (!node || node.children.length !== 0 || node.attributes.length !== 0) return null;
  if (!/^(?:\d+|\d+\.\d+)$/.test(node.text.trim())) return null;
  const value = canonicalBoundedUnsignedDecimal(node.text.trim(), 1000);
  return value !== null && value !== '0' ? value : null;
}

function hasSafeMetronomeLayoutAttributes(node) {
  const seen = new Set();
  for (const attribute of node.attributes) {
    if (attribute.uri.length !== 0 || !['parentheses', 'default-y'].includes(attribute.name)) return false;
    if (seen.has(attribute.name)) return false;
    seen.add(attribute.name);
    if (attribute.name === 'parentheses' && !['yes', 'no'].includes(attribute.value)) return false;
    if (attribute.name === 'default-y' && !isBoundedLayoutTenths(attribute.value)) return false;
  }
  return true;
}

function parseMetronomeDirection(node, effectiveStaffCount, location) {
  if (!isSafeDirectionAttributes(node) || node.text.trim().length !== 0) return null;
  const children = directChildren(node);
  if (children.length !== node.children.length) return null;
  if (children.some((child) => !['direction-type', 'staff', 'sound'].includes(child.name))) return null;
  const directionTypes = directChildren(node, 'direction-type');
  const staffNodes = directChildren(node, 'staff');
  const soundNodes = directChildren(node, 'sound');
  if (directionTypes.length !== 1 || staffNodes.length > 1 || soundNodes.length > 1) return null;
  let staff = null;
  if (staffNodes.length === 1) {
    staff = scalarPositiveInteger(staffNodes[0]);
    if (staff === null || effectiveStaffCount === null || staff > effectiveStaffCount) return null;
  }
  const expected = staffNodes.length === 1
    ? ['direction-type', 'staff', ...(soundNodes.length === 1 ? ['sound'] : [])]
    : ['direction-type', ...(soundNodes.length === 1 ? ['sound'] : [])];
  if (!hasExactChildSequence(children, expected)) return null;

  const directionType = directionTypes[0];
  if (
    directionType.attributes.length !== 0
    || directionType.text.trim().length !== 0
    || directionType.children.some((child) => child.uri !== directionType.uri)
  ) return null;
  const metronomes = directChildren(directionType, 'metronome');
  if (metronomes.length !== 1 || directionType.children.length !== 1) return null;
  const metronome = metronomes[0];
  if (
    !hasSafeMetronomeLayoutAttributes(metronome)
    || metronome.text.trim().length !== 0
    || metronome.children.some((child) => child.uri !== metronome.uri)
  ) return null;
  const metronomeChildren = directChildren(metronome);
  if (!hasExactChildSequence(metronomeChildren, ['beat-unit', 'per-minute'])) return null;
  const beatUnits = directChildren(metronome, 'beat-unit');
  const perMinutes = directChildren(metronome, 'per-minute');
  if (beatUnits.length !== 1 || perMinutes.length !== 1) return null;
  if (
    beatUnits[0].attributes.length !== 0
    || beatUnits[0].children.length !== 0
    || !['whole', 'half', 'quarter', 'eighth', '16th', '32nd'].includes(beatUnits[0].text.trim())
  ) return null;
  const perMinute = positiveTempo(perMinutes[0]);
  if (perMinute === null) return null;

  let rawSoundTempo = null;
  let canonicalSoundTempo = null;
  if (soundNodes.length === 1) {
    if (beatUnits[0].text.trim() !== 'quarter') return null;
    const sound = soundNodes[0];
    if (
      sound.children.length !== 0
      || sound.attributes.length !== 1
      || sound.attributes[0].uri.length !== 0
      || sound.attributes[0].name !== 'tempo'
      || sound.text.trim().length !== 0
      || !/^(?:\d+|\d+\.\d+)$/.test(sound.attributes[0].value)
    ) return null;
    rawSoundTempo = sound.attributes[0].value;
    canonicalSoundTempo = canonicalBoundedUnsignedDecimal(rawSoundTempo, 1000);
    if (canonicalSoundTempo === null || canonicalSoundTempo === '0') return null;
  }

  return Object.freeze({
    kind: 'METRONOME',
    authority: 'PLAYBACK_DISPLAY_ONLY',
    beatUnit: beatUnits[0].text.trim(),
    rawPerMinute: perMinutes[0].text.trim(),
    canonicalPerMinute: perMinute,
    rawSoundTempo,
    canonicalSoundTempo,
    staff,
    conflictingTempo: canonicalSoundTempo !== null && canonicalSoundTempo !== perMinute,
    location: Object.freeze({ ...location }),
  });
}

function parseDynamicsDirection(node, effectiveStaffCount, location) {
  if (!isSafeDirectionAttributes(node) || node.text.trim().length !== 0) return null;
  const children = directChildren(node);
  if (
    children.length !== node.children.length
    || !hasExactChildSequence(children, ['direction-type', 'staff', 'sound'])
  ) return null;
  const directionTypes = directChildren(node, 'direction-type');
  const staffNodes = directChildren(node, 'staff');
  const soundNodes = directChildren(node, 'sound');
  if (directionTypes.length !== 1 || staffNodes.length !== 1 || soundNodes.length !== 1) return null;
  const staff = scalarPositiveInteger(staffNodes[0]);
  if (staff === null || effectiveStaffCount === null || staff > effectiveStaffCount) return null;

  const directionType = directionTypes[0];
  if (
    directionType.attributes.length !== 0
    || directionType.text.trim().length !== 0
    || directionType.children.length !== 1
  ) return null;
  const dynamicsNodes = directChildren(directionType, 'dynamics');
  if (dynamicsNodes.length !== 1) return null;
  const dynamics = dynamicsNodes[0];
  if (
    dynamics.attributes.length !== 0
    || dynamics.text.trim().length !== 0
    || dynamics.children.length !== 1
  ) return null;
  const mark = dynamics.children[0];
  if (
    mark.uri !== dynamics.uri
    || !SAFE_DYNAMIC_MARKS.has(mark.name)
    || mark.attributes.length !== 0
    || mark.children.length !== 0
    || mark.text.trim().length !== 0
  ) return null;
  const sound = soundNodes[0];
  if (
    sound.children.length !== 0
    || sound.attributes.length !== 1
    || sound.attributes[0].uri.length !== 0
    || sound.attributes[0].name !== 'dynamics'
    || sound.text.trim().length !== 0
  ) return null;
  const rawDynamics = sound.attributes[0].value;
  const validDynamics = canonicalBoundedUnsignedDecimal(rawDynamics, 127);
  const invalidNegativeDynamics = canonicalInvalidNegativeDynamics(rawDynamics);
  if (validDynamics === null && invalidNegativeDynamics === null) return null;
  return Object.freeze({
    kind: 'DYNAMICS',
    authority: 'PLAYBACK_DISPLAY_ONLY',
    dynamicMark: mark.name,
    rawDynamics,
    canonicalDynamics: validDynamics,
    invalidNegativeDynamics,
    staff,
    location: Object.freeze({ ...location }),
  });
}

function issueForInvalidDynamics(record) {
  return Object.freeze({
    severity: 'warning',
    category: 'quality',
    code: 'INVALID_PERFORMANCE_DYNAMICS',
    message: 'Invalid playback-only MusicXML sound dynamics was excluded from the Guitar TAB semantic projection.',
    location: Object.freeze({
      measure: record.location.measureNumber,
      measureIndex: record.location.measureIndex,
      eventIndex: record.location.measureChildIndex,
      sourceEventId: null,
    }),
    details: Object.freeze({
      rawLexeme: record.rawDynamics,
      dynamicMark: record.dynamicMark,
      staff: record.staff,
      measureChildIndex: record.location.measureChildIndex,
      policy: 'EXCLUDE_INVALID_PLAYBACK_ONLY_FIELD_WITHOUT_REPLACEMENT',
    }),
  });
}

function issueForConflictingTempo(record) {
  return Object.freeze({
    severity: 'error',
    category: 'semantic',
    code: 'CONFLICTING_PERFORMANCE_TEMPO',
    message: 'Exact metronome and sound tempo values conflict; playback tempo requires review.',
    reviewDisposition: 'REVIEW_REQUIRED',
    location: Object.freeze({
      measure: record.location.measureNumber,
      measureIndex: record.location.measureIndex,
      eventIndex: record.location.measureChildIndex,
      sourceEventId: null,
    }),
    details: Object.freeze({
      beatUnit: record.beatUnit,
      rawPerMinute: record.rawPerMinute,
      rawSoundTempo: record.rawSoundTempo,
      staff: record.staff,
      policy: 'NO_AVERAGING_NO_GUESSED_TEMPO',
    }),
  });
}

function normalizeSelectedPart(part, runtime) {
  const measures = directChildren(part, 'measure');
  const records = [];
  const issues = [];
  const ignoredFeatures = new Set();
  let effectiveStaffCount = 1;

  const normalizedPart = cloneNode(part, (measure) => {
    if (measure.uri !== part.uri || measure.name !== 'measure') return cloneNode(measure);
    const measureIndex = measures.indexOf(measure);
    const number = measureNumber(measure, measureIndex);
    checkpoint(runtime, 'polyphonic-performance-metadata-policy:measure', {
      measureIndex,
      measureNumber: number,
    });

    return cloneNode(measure, (child, measureChildIndex) => {
      if (child.uri !== measure.uri) return cloneNode(child);
      if (child.name === 'attributes') {
        const staves = directChildren(child, 'staves');
        if (staves.length === 1) {
          const parsed = scalarPositiveInteger(staves[0]);
          effectiveStaffCount = parsed !== null && parsed <= 2 ? parsed : null;
        } else if (staves.length > 1) {
          effectiveStaffCount = null;
        }
        return cloneNode(child);
      }
      if (child.name !== 'direction') return cloneNode(child);

      const location = {
        measureIndex,
        measureNumber: number,
        measureChildIndex,
      };
      const words = parseWordsDirection(child, effectiveStaffCount, location);
      if (words) {
        records.push(words);
        ignoredFeatures.add('direction:words');
        return null;
      }

      const metronome = parseMetronomeDirection(child, effectiveStaffCount, location);
      if (metronome) {
        records.push(metronome);
        if (metronome.conflictingTempo) {
          issues.push(issueForConflictingTempo(metronome));
          ignoredFeatures.add('measure:direction:metronome-tempo-review');
          return null;
        }
        return cloneNode(child);
      }

      const dynamics = parseDynamicsDirection(child, effectiveStaffCount, location);
      if (dynamics) {
        records.push(dynamics);
        if (dynamics.invalidNegativeDynamics !== null) {
          issues.push(issueForInvalidDynamics(dynamics));
          ignoredFeatures.add('measure:direction:invalid-performance-dynamics');
          return null;
        }
      }
      return cloneNode(child);
    });
  });

  return Object.freeze({
    parsedPart: normalizedPart,
    records: Object.freeze(records),
    issues: Object.freeze(issues),
    ignoredFeatures: Object.freeze([...ignoredFeatures].sort()),
  });
}

function normalizePolyphonicPerformanceMetadataPolicy(parsedDocument, runtime = null) {
  checkpoint(runtime, 'polyphonic-performance-metadata-policy:start');
  if (
    !parsedDocument
    || typeof parsedDocument !== 'object'
    || !parsedDocument.root
    || parsedDocument.documentType !== 'ParsedMusicXmlDocument'
    || parsedDocument.contractVersion !== '1.0.0'
  ) {
    throw invalid('Performance metadata policy requires ParsedMusicXmlDocument 1.0.0.');
  }

  const root = parsedDocument.root;
  const parts = directChildren(root, 'part');
  if (parts.length !== 1) {
    return Object.freeze({
      contractVersion: POLYPHONIC_PERFORMANCE_METADATA_POLICY_VERSION,
      authority: POLYPHONIC_PERFORMANCE_METADATA_POLICY_AUTHORITY,
      parsedDocument,
      performanceMetadataRecords: Object.freeze([]),
      issues: Object.freeze([]),
      ignoredFeatures: Object.freeze([]),
    });
  }

  let partNormalization = null;
  const normalizedRoot = cloneNode(root, (child) => {
    if (child === parts[0]) {
      partNormalization = normalizeSelectedPart(child, runtime);
      return partNormalization.parsedPart;
    }
    return cloneNode(child);
  });
  const normalizedDocument = Object.freeze({
    documentType: parsedDocument.documentType,
    contractVersion: parsedDocument.contractVersion,
    root: deepFreezeNode(normalizedRoot),
  });

  checkpoint(runtime, 'polyphonic-performance-metadata-policy:complete', {
    recordCount: partNormalization.records.length,
    issueCount: partNormalization.issues.length,
  });
  return Object.freeze({
    contractVersion: POLYPHONIC_PERFORMANCE_METADATA_POLICY_VERSION,
    authority: POLYPHONIC_PERFORMANCE_METADATA_POLICY_AUTHORITY,
    parsedDocument: normalizedDocument,
    performanceMetadataRecords: partNormalization.records,
    issues: partNormalization.issues,
    ignoredFeatures: partNormalization.ignoredFeatures,
  });
}

module.exports = {
  POLYPHONIC_PERFORMANCE_METADATA_POLICY_VERSION,
  POLYPHONIC_PERFORMANCE_METADATA_POLICY_AUTHORITY,
  PolyphonicPerformanceMetadataPolicyError,
  normalizePolyphonicPerformanceMetadataPolicy,
};
