'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { validatePolyphonicSourceModel } = require('./polyphonicSourceModel');

const BASIC_CHORD_LABEL_MODEL_VERSION = '1.0.0';
const BASIC_CHORD_LABEL_MODEL_DOCUMENT_TYPE = 'BasicChordLabelModel';
const MAX_BASIC_CHORD_LABELS = 4000;
const STEP_INDEX = Object.freeze({ C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 });
const PATTERNS = Object.freeze([
  Object.freeze({ kind: 'major', suffix: '', intervals: Object.freeze([0, 4, 7]), degrees: Object.freeze([0, 2, 4]) }),
  Object.freeze({ kind: 'minor', suffix: 'm', intervals: Object.freeze([0, 3, 7]), degrees: Object.freeze([0, 2, 4]) }),
  Object.freeze({ kind: 'diminished', suffix: 'dim', intervals: Object.freeze([0, 3, 6]), degrees: Object.freeze([0, 2, 4]) }),
  Object.freeze({ kind: 'augmented', suffix: 'aug', intervals: Object.freeze([0, 4, 8]), degrees: Object.freeze([0, 2, 4]) }),
  Object.freeze({ kind: 'dominant', suffix: '7', intervals: Object.freeze([0, 4, 7, 10]), degrees: Object.freeze([0, 2, 4, 6]) }),
  Object.freeze({ kind: 'major-seventh', suffix: 'maj7', intervals: Object.freeze([0, 4, 7, 11]), degrees: Object.freeze([0, 2, 4, 6]) }),
  Object.freeze({ kind: 'minor-seventh', suffix: 'm7', intervals: Object.freeze([0, 3, 7, 10]), degrees: Object.freeze([0, 2, 4, 6]) }),
  Object.freeze({ kind: 'half-diminished', suffix: 'm7b5', intervals: Object.freeze([0, 3, 6, 10]), degrees: Object.freeze([0, 2, 4, 6]) }),
  Object.freeze({ kind: 'diminished-seventh', suffix: 'dim7', intervals: Object.freeze([0, 3, 6, 9]), degrees: Object.freeze([0, 2, 4, 6]) }),
]);
const PATTERN_BY_KIND = new Map(PATTERNS.map((pattern) => [pattern.kind, pattern]));

class BasicChordLabelModelError extends EngineError {
  constructor(message, code = 'INVALID_BASIC_CHORD_LABEL_INPUT', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'BasicChordLabelModelError');
  }
}

function invalid(message, details = {}) {
  return new BasicChordLabelModelError(message, 'INVALID_BASIC_CHORD_LABEL_INPUT', details);
}

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function pitchClass(pitch) {
  return mod(pitch.midi, 12);
}

function spellingKey(pitch) {
  return `${pitch.step}:${pitch.alter}`;
}

function formatSpelling(spelling) {
  const accidental = spelling.alter < 0
    ? 'b'.repeat(-spelling.alter)
    : '#'.repeat(spelling.alter);
  return `${spelling.step}${accidental}`;
}

function copySpelling(spelling) {
  return Object.freeze({ step: spelling.step, alter: spelling.alter });
}

function exactSetMatch(observed, expected) {
  if (observed.size !== expected.length) return false;
  return expected.every((value) => observed.has(value));
}

function recognize(notes) {
  const pitchClasses = new Set(notes.map((event) => pitchClass(event.pitch)));
  if (pitchClasses.size < 3 || pitchClasses.size > 4) return null;

  const spellingsByPitchClass = new Map();
  for (const event of notes) {
    const pc = pitchClass(event.pitch);
    const spellings = spellingsByPitchClass.get(pc) || new Map();
    spellings.set(spellingKey(event.pitch), event.pitch);
    spellingsByPitchClass.set(pc, spellings);
  }
  if ([...spellingsByPitchClass.values()].some((spellings) => spellings.size !== 1)) {
    return null;
  }

  const uniqueSpellings = [...spellingsByPitchClass.values()].map(
    (spellings) => spellings.values().next().value,
  );
  const matches = [];
  for (const root of uniqueSpellings) {
    const rootPc = pitchClass(root);
    const rootDegree = STEP_INDEX[root.step];
    for (const pattern of PATTERNS) {
      if (pattern.intervals.length !== pitchClasses.size) continue;
      const expectedPcs = pattern.intervals.map((interval) => mod(rootPc + interval, 12));
      if (!exactSetMatch(pitchClasses, expectedPcs)) continue;
      const expectedDegrees = new Set(pattern.degrees.map((degree) => mod(rootDegree + degree, 7)));
      const observedDegrees = new Set(uniqueSpellings.map((pitch) => STEP_INDEX[pitch.step]));
      if (!exactSetMatch(observedDegrees, [...expectedDegrees])) continue;
      matches.push({ root, pattern });
    }
  }
  if (matches.length !== 1) return null;

  const lowestMidi = Math.min(...notes.map((event) => event.pitch.midi));
  const lowest = notes.filter((event) => event.pitch.midi === lowestMidi);
  const lowestSpellings = new Map(lowest.map((event) => [spellingKey(event.pitch), event.pitch]));
  if (lowestSpellings.size !== 1) return null;
  const bassPitch = lowestSpellings.values().next().value;
  const match = matches[0];
  const root = copySpelling(match.root);
  const bass = pitchClass(bassPitch) === pitchClass(match.root)
    ? null
    : copySpelling(bassPitch);
  return { root, bass, pattern: match.pattern };
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeExplicitFacts(value, source) {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalid('explicitHarmonyFacts must be a native array.', { field: 'explicitHarmonyFacts' });
  }
  if (value.length > MAX_BASIC_CHORD_LABELS) {
    throw invalid('Explicit harmony count exceeds the fixed boundary.', {
      limit: MAX_BASIC_CHORD_LABELS,
      observed: value.length,
    });
  }
  return value.map((fact, index) => {
    const keys = isPlainObject(fact) ? Reflect.ownKeys(fact) : [];
    const expected = ['measureIndex', 'onsetDivisions', 'root', 'kind', 'bass'];
    if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
      throw invalid('Explicit harmony fact has an invalid shape.', { index });
    }
    if (
      !Number.isInteger(fact.measureIndex)
      || fact.measureIndex < 0
      || fact.measureIndex >= source.measures.length
      || !Number.isInteger(fact.onsetDivisions)
      || fact.onsetDivisions < 0
      || fact.onsetDivisions > source.measures[fact.measureIndex].expectedDurationDivisions
      || !PATTERN_BY_KIND.has(fact.kind)
    ) {
      throw invalid('Explicit harmony fact has an invalid location or kind.', { index });
    }
    const normalizeSpelling = (spelling, field, optional) => {
      if (spelling === null && optional) return null;
      if (
        !isPlainObject(spelling)
        || Reflect.ownKeys(spelling).length !== 2
        || !Object.hasOwn(spelling, 'step')
        || !Object.hasOwn(spelling, 'alter')
        || !Object.hasOwn(STEP_INDEX, spelling.step)
        || !Number.isInteger(spelling.alter)
        || spelling.alter < -2
        || spelling.alter > 2
      ) {
        throw invalid('Explicit harmony spelling is invalid.', { index, field });
      }
      return copySpelling(spelling);
    };
    return Object.freeze({
      measureIndex: fact.measureIndex,
      onsetDivisions: fact.onsetDivisions,
      root: normalizeSpelling(fact.root, 'root', false),
      kind: fact.kind,
      bass: normalizeSpelling(fact.bass, 'bass', true),
    });
  });
}

function makeLabel(measureIndex, onsetDivisions, root, bass, pattern, source) {
  const rootText = formatSpelling(root);
  const bassText = bass ? `/${formatSpelling(bass)}` : '';
  return Object.freeze({
    measureIndex,
    onsetDivisions,
    label: `${rootText}${pattern.suffix}${bassText}`,
    root,
    kind: pattern.kind,
    bass,
    source,
  });
}

function createBasicChordLabelModel(sourceModel, explicitHarmonyFacts = [], runtime = null) {
  if (runtime) runtime.checkpoint('basic-chord-label-model:start');
  const source = validatePolyphonicSourceModel(sourceModel, runtime);
  const explicit = normalizeExplicitFacts(explicitHarmonyFacts, source);
  const labelsByLocation = new Map();

  for (const fact of explicit) {
    const key = `${fact.measureIndex}:${fact.onsetDivisions}`;
    if (labelsByLocation.has(key)) {
      throw invalid('More than one explicit harmony occupies the same onset.', {
        measureIndex: fact.measureIndex,
        onsetDivisions: fact.onsetDivisions,
      });
    }
    labelsByLocation.set(key, makeLabel(
      fact.measureIndex,
      fact.onsetDivisions,
      fact.root,
      fact.bass,
      PATTERN_BY_KIND.get(fact.kind),
      'EXPLICIT_MUSICXML',
    ));
  }

  for (let measureIndex = 0; measureIndex < source.measures.length; measureIndex += 1) {
    const groups = new Map();
    for (const event of source.measures[measureIndex].events) {
      if (event.type !== 'note') continue;
      const notes = groups.get(event.onsetDivisions) || [];
      notes.push(event);
      groups.set(event.onsetDivisions, notes);
    }
    for (const [onsetDivisions, notes] of groups) {
      const key = `${measureIndex}:${onsetDivisions}`;
      if (labelsByLocation.has(key)) continue;
      const recognized = recognize(notes);
      if (!recognized) continue;
      labelsByLocation.set(key, makeLabel(
        measureIndex,
        onsetDivisions,
        recognized.root,
        recognized.bass,
        recognized.pattern,
        'DERIVED_EXACT_SIMULTANEITY',
      ));
      if (labelsByLocation.size > MAX_BASIC_CHORD_LABELS) {
        throw invalid('Derived chord-label count exceeds the fixed boundary.', {
          limit: MAX_BASIC_CHORD_LABELS,
          observed: labelsByLocation.size,
        });
      }
    }
  }

  const labels = [...labelsByLocation.values()].sort(
    (left, right) => left.measureIndex - right.measureIndex
      || left.onsetDivisions - right.onsetDivisions,
  );
  const result = Object.freeze({
    documentType: BASIC_CHORD_LABEL_MODEL_DOCUMENT_TYPE,
    contractVersion: BASIC_CHORD_LABEL_MODEL_VERSION,
    labels: Object.freeze(labels),
  });
  if (runtime) runtime.checkpoint('basic-chord-label-model:complete', { labelCount: labels.length });
  return result;
}

module.exports = {
  BASIC_CHORD_LABEL_MODEL_VERSION,
  BASIC_CHORD_LABEL_MODEL_DOCUMENT_TYPE,
  MAX_BASIC_CHORD_LABELS,
  BasicChordLabelModelError,
  createBasicChordLabelModel,
};
