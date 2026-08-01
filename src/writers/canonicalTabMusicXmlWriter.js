'use strict';

const { parsePitchName, pitchToMidi, PitchError } = require('../music/pitch');

const SUPPORTED_CANONICAL_TAB_RESULT_VERSION = '1.0.0';
const MUSICXML_VERSION = '4.0';
const BEAM_VALUES = Object.freeze({
  begin: 'begin',
  continue: 'continue',
  end: 'end',
  'forward-hook': 'forward hook',
  'backward-hook': 'backward hook',
});
const RHYTHM_TYPES = new Set(['whole', 'half', 'quarter', 'eighth', '16th']);

class CanonicalTabMusicXmlWriterError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CanonicalTabMusicXmlWriterError';
    this.code = code;
    this.details = details;
  }
}

function invalidResult(message, details = {}) {
  return new CanonicalTabMusicXmlWriterError(
    message,
    'INVALID_CANONICAL_TAB_MUSICXML_RESULT',
    details,
  );
}

function unsupportedSchema(details = {}) {
  return new CanonicalTabMusicXmlWriterError(
    'The CanonicalTabResult schema version is not supported by the MusicXML writer.',
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_SCHEMA',
    details,
  );
}

function invalidOptions(message, details = {}) {
  return new CanonicalTabMusicXmlWriterError(
    message,
    'INVALID_CANONICAL_TAB_MUSICXML_OPTIONS',
    details,
  );
}

function unsupportedStructure(message, details = {}) {
  return new CanonicalTabMusicXmlWriterError(
    message,
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_STRUCTURE',
    details,
  );
}

function invalidValue(message, details = {}) {
  return new CanonicalTabMusicXmlWriterError(
    message,
    'INVALID_CANONICAL_TAB_MUSICXML_VALUE',
    details,
  );
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, path) {
  if (!isPlainObject(value)) {
    throw invalidResult(`${path} must be a plain object.`, { path });
  }
  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    throw invalidResult(`${path} must be an array.`, { path });
  }
  return value;
}

function requireString(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw invalidResult(`${path} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`, {
      path,
    });
  }
  return value;
}

function requireSafeInteger(value, path, { minimum = null, maximum = null } = {}) {
  if (!Number.isSafeInteger(value)) {
    throw invalidResult(`${path} must be a safe integer.`, { path, value });
  }
  if (minimum !== null && value < minimum) {
    throw invalidResult(`${path} is below the supported minimum.`, {
      path,
      value,
      minimum,
    });
  }
  if (maximum !== null && value > maximum) {
    throw invalidResult(`${path} exceeds the supported maximum.`, {
      path,
      value,
      maximum,
    });
  }
  return value;
}

function normalizeOptions(options) {
  if (!isPlainObject(options)) {
    throw invalidOptions('options must be a plain object.');
  }

  const allowedFields = new Set(['pretty', 'trailingNewline']);
  const normalized = {
    pretty: false,
    trailingNewline: false,
  };

  for (const key of Reflect.ownKeys(options)) {
    if (typeof key === 'symbol' || !allowedFields.has(key)) {
      throw invalidOptions('options contains an unknown field.', {
        field: typeof key === 'symbol' ? key.toString() : key,
      });
    }

    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidOptions('options fields must be enumerable data properties.', { field: key });
    }
    if (typeof descriptor.value !== 'boolean') {
      throw invalidOptions(`options.${key} must be boolean.`, {
        field: key,
        value: descriptor.value,
      });
    }
    normalized[key] = descriptor.value;
  }

  return normalized;
}

function assertXmlSafeString(value, path) {
  requireString(value, path, { allowEmpty: true });

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const allowed = codePoint === 0x9
      || codePoint === 0xA
      || codePoint === 0xD
      || (codePoint >= 0x20 && codePoint <= 0xD7FF)
      || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
      || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);

    if (!allowed) {
      throw invalidValue('A text field contains a character that is not valid in XML 1.0.', {
        path,
        codePoint,
      });
    }
  }

  return value;
}

function escapeXmlText(value, path) {
  return assertXmlSafeString(value, path)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXmlAttribute(value, path) {
  return escapeXmlText(value, path)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validatePitch(pitch, path) {
  requirePlainObject(pitch, path);
  if (typeof pitch.step !== 'string' || !/^[A-G]$/.test(pitch.step)) {
    throw invalidResult(`${path}.step must be A through G.`, { path: `${path}.step` });
  }
  requireSafeInteger(pitch.alter, `${path}.alter`, { minimum: -2, maximum: 2 });
  requireSafeInteger(pitch.octave, `${path}.octave`);
  requireSafeInteger(pitch.midi, `${path}.midi`, { minimum: 0, maximum: 127 });
  requireString(pitch.written, `${path}.written`);

  let expectedMidi;
  try {
    expectedMidi = pitchToMidi({
      step: pitch.step,
      alter: pitch.alter,
      octave: pitch.octave,
    });
  } catch (error) {
    if (error instanceof PitchError) {
      throw invalidResult(`${path} contains invalid pitch components.`, { path });
    }
    throw error;
  }

  if (pitch.midi !== expectedMidi) {
    throw invalidResult(`${path}.midi does not match the pitch components.`, {
      path: `${path}.midi`,
      expectedMidi,
      actualMidi: pitch.midi,
    });
  }
}

function validateRhythm(rhythm, path) {
  requirePlainObject(rhythm, path);
  requireSafeInteger(rhythm.durationDivisions, `${path}.durationDivisions`, { minimum: 1 });
  if (!RHYTHM_TYPES.has(rhythm.type)) {
    throw unsupportedStructure('The MusicXML writer does not support this rhythm type.', {
      path: `${path}.type`,
      type: rhythm.type,
    });
  }
  requireSafeInteger(rhythm.dots, `${path}.dots`, { minimum: 0, maximum: 3 });
  if (rhythm.timeModification !== null) {
    throw unsupportedStructure('Tuplets and time modifications are not supported.', {
      path: `${path}.timeModification`,
    });
  }
  if (typeof rhythm.tieStart !== 'boolean' || typeof rhythm.tieStop !== 'boolean') {
    throw invalidResult(`${path} tie fields must be boolean.`, { path });
  }

  const beams = requireArray(rhythm.beam, `${path}.beam`);
  const levels = new Set();
  let previousLevel = 0;
  for (let index = 0; index < beams.length; index += 1) {
    const beamPath = `${path}.beam[${index}]`;
    const beam = requirePlainObject(beams[index], beamPath);
    requireSafeInteger(beam.level, `${beamPath}.level`, { minimum: 1, maximum: 8 });
    if (levels.has(beam.level) || beam.level < previousLevel) {
      throw invalidResult('Beam levels must be unique and sorted.', { path: beamPath });
    }
    if (!Object.hasOwn(BEAM_VALUES, beam.value)) {
      throw unsupportedStructure('The MusicXML writer does not support this beam value.', {
        path: `${beamPath}.value`,
        value: beam.value,
      });
    }
    levels.add(beam.level);
    previousLevel = beam.level;
  }
}

function validatePosition(position, guitar, path) {
  requirePlainObject(position, path);
  requireSafeInteger(position.string, `${path}.string`, { minimum: 1, maximum: 6 });
  requireSafeInteger(position.fret, `${path}.fret`, {
    minimum: guitar.minimumFret,
    maximum: guitar.maximumFret,
  });
}

function validateGuitar(guitar) {
  requirePlainObject(guitar, 'canonicalTabResult.guitar');
  requireSafeInteger(guitar.minimumFret, 'canonicalTabResult.guitar.minimumFret', { minimum: 0 });
  requireSafeInteger(guitar.maximumFret, 'canonicalTabResult.guitar.maximumFret', {
    minimum: guitar.minimumFret,
  });

  const tuning = requireArray(guitar.tuning, 'canonicalTabResult.guitar.tuning');
  if (tuning.length !== 6) {
    throw unsupportedStructure('The MusicXML writer supports exactly six guitar strings.', {
      stringCount: tuning.length,
    });
  }

  const byString = new Map();
  for (let index = 0; index < tuning.length; index += 1) {
    const path = `canonicalTabResult.guitar.tuning[${index}]`;
    const entry = requirePlainObject(tuning[index], path);
    requireSafeInteger(entry.number, `${path}.number`, { minimum: 1, maximum: 6 });
    requireString(entry.pitch, `${path}.pitch`);
    requireSafeInteger(entry.midi, `${path}.midi`, { minimum: 0, maximum: 127 });
    if (byString.has(entry.number)) {
      throw invalidResult('Guitar tuning string numbers must be unique.', {
        path: `${path}.number`,
        string: entry.number,
      });
    }

    let pitch;
    try {
      pitch = parsePitchName(entry.pitch);
      if (pitchToMidi(pitch) !== entry.midi) {
        throw new PitchError('Tuning pitch and MIDI value do not match.');
      }
    } catch (error) {
      if (error instanceof PitchError) {
        throw invalidResult('Guitar tuning contains an invalid pitch.', { path });
      }
      throw error;
    }

    byString.set(entry.number, { ...entry, parsedPitch: pitch });
  }

  for (let string = 1; string <= 6; string += 1) {
    if (!byString.has(string)) {
      throw invalidResult('Guitar tuning must define strings 1 through 6.', { string });
    }
  }

  return byString;
}

function validateEvent(event, measure, eventIndex, guitar, cursor) {
  const path = `canonicalTabResult.measures[${measure.measureIndex}].events[${eventIndex}]`;
  requirePlainObject(event, path);
  if (event.eventIndex !== eventIndex) {
    throw invalidResult('Event index does not match the event array order.', { path });
  }
  requireString(event.eventId, `${path}.eventId`);
  if (event.measureKey !== measure.measureKey) {
    throw invalidResult('Event measureKey does not match its containing measure.', { path });
  }
  if (event.type !== 'note' && event.type !== 'rest') {
    throw unsupportedStructure('Only note and rest events are supported.', {
      path: `${path}.type`,
      type: event.type,
    });
  }
  if (event.voice !== 1 || event.staff !== 1) {
    throw unsupportedStructure('Only canonical single-voice, single-staff events are supported.', {
      path,
      voice: event.voice,
      staff: event.staff,
    });
  }

  const start = requirePlainObject(event.start, `${path}.start`);
  requireSafeInteger(start.divisions, `${path}.start.divisions`, { minimum: 0 });
  if (start.divisions !== cursor) {
    throw unsupportedStructure('Events must form one sequential monophonic stream.', {
      path: `${path}.start.divisions`,
      expectedStart: cursor,
      actualStart: start.divisions,
    });
  }

  validateRhythm(event.rhythm, `${path}.rhythm`);
  requireArray(event.warnings, `${path}.warnings`);
  requirePlainObject(event.sourceLocation, `${path}.sourceLocation`);

  if (event.type === 'rest') {
    if (Object.hasOwn(event, 'pitch')) {
      throw invalidResult('Rest events must not contain pitch data.', { path });
    }
    if (event.selectedPosition !== null) {
      throw invalidResult('Rest events must use selectedPosition: null.', { path });
    }
    if (!Array.isArray(event.alternativePositions) || event.alternativePositions.length !== 0) {
      throw invalidResult('Rest events must use an empty alternativePositions array.', { path });
    }
    if (event.fingeringCost !== null) {
      throw invalidResult('Rest events must use fingeringCost: null.', { path });
    }
  } else {
    validatePitch(event.pitch, `${path}.pitch`);
    validatePosition(event.selectedPosition, guitar, `${path}.selectedPosition`);
    requireArray(event.alternativePositions, `${path}.alternativePositions`);
    requirePlainObject(event.fingeringCost, `${path}.fingeringCost`);
  }

  return event.rhythm.durationDivisions;
}

function validateMeasure(measure, measureIndex, guitar) {
  const path = `canonicalTabResult.measures[${measureIndex}]`;
  requirePlainObject(measure, path);
  if (measure.measureIndex !== measureIndex) {
    throw invalidResult('Measure index does not match the measure array order.', { path });
  }
  requireString(measure.measureKey, `${path}.measureKey`);
  requireString(measure.visibleMeasureNumber, `${path}.visibleMeasureNumber`);
  if (typeof measure.implicit !== 'boolean') {
    throw invalidResult(`${path}.implicit must be boolean.`, { path: `${path}.implicit` });
  }
  requireSafeInteger(measure.divisions, `${path}.divisions`, { minimum: 1 });
  requireSafeInteger(measure.expectedDurationDivisions, `${path}.expectedDurationDivisions`, {
    minimum: 1,
  });
  requireSafeInteger(measure.actualDurationDivisions, `${path}.actualDurationDivisions`, {
    minimum: 0,
    maximum: measure.expectedDurationDivisions,
  });

  const timeSignature = requirePlainObject(measure.timeSignature, `${path}.timeSignature`);
  requireSafeInteger(timeSignature.beats, `${path}.timeSignature.beats`, { minimum: 1 });
  requireSafeInteger(timeSignature.beatType, `${path}.timeSignature.beatType`, { minimum: 1 });
  requireArray(measure.warnings, `${path}.warnings`);

  const events = requireArray(measure.events, `${path}.events`);
  let cursor = 0;
  let noteCount = 0;
  let restCount = 0;
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    cursor += validateEvent(event, measure, eventIndex, guitar, cursor);
    if (event.type === 'note') {
      noteCount += 1;
    } else {
      restCount += 1;
    }
  }

  if (cursor !== measure.actualDurationDivisions) {
    throw invalidResult('Measure event durations do not match actualDurationDivisions.', {
      path,
      eventDurationTotal: cursor,
      actualDurationDivisions: measure.actualDurationDivisions,
    });
  }
  if (events.length > 0 && !measure.implicit && cursor !== measure.expectedDurationDivisions) {
    throw unsupportedStructure('A non-implicit measure must fill its declared duration.', {
      path,
      eventDurationTotal: cursor,
      expectedDurationDivisions: measure.expectedDurationDivisions,
    });
  }

  return { noteCount, restCount };
}

function validateCanonicalTabResult(canonicalTabResult) {
  requirePlainObject(canonicalTabResult, 'canonicalTabResult');
  if (canonicalTabResult.documentType !== 'CanonicalTabResult') {
    throw invalidResult('canonicalTabResult.documentType must be CanonicalTabResult.');
  }
  if (canonicalTabResult.schemaVersion !== SUPPORTED_CANONICAL_TAB_RESULT_VERSION) {
    throw unsupportedSchema({
      expectedSchemaVersion: SUPPORTED_CANONICAL_TAB_RESULT_VERSION,
      actualSchemaVersion: canonicalTabResult.schemaVersion,
    });
  }
  const engine = requirePlainObject(canonicalTabResult.engine, 'canonicalTabResult.engine');
  requireString(engine.name, 'canonicalTabResult.engine.name');
  requireString(engine.version, 'canonicalTabResult.engine.version');
  if (canonicalTabResult.requiresTeacherReview !== true) {
    throw invalidResult('canonicalTabResult.requiresTeacherReview must be true.');
  }
  requireSafeInteger(canonicalTabResult.voiceCount, 'canonicalTabResult.voiceCount', {
    minimum: 0,
  });
  if (canonicalTabResult.voiceCount > 1) {
    throw unsupportedStructure('Only single-voice CanonicalTabResult input is supported.', {
      voiceCount: canonicalTabResult.voiceCount,
    });
  }
  requireSafeInteger(canonicalTabResult.measureCount, 'canonicalTabResult.measureCount', {
    minimum: 1,
  });
  requireSafeInteger(canonicalTabResult.noteCount, 'canonicalTabResult.noteCount', { minimum: 0 });
  requireSafeInteger(canonicalTabResult.restCount, 'canonicalTabResult.restCount', { minimum: 0 });
  if (
    typeof canonicalTabResult.totalFingeringCost !== 'number'
    || !Number.isFinite(canonicalTabResult.totalFingeringCost)
    || canonicalTabResult.totalFingeringCost < 0
  ) {
    throw invalidResult('canonicalTabResult.totalFingeringCost must be finite and non-negative.');
  }

  const guitar = canonicalTabResult.guitar;
  const tuningByString = validateGuitar(guitar);
  const measures = requireArray(canonicalTabResult.measures, 'canonicalTabResult.measures');
  if (measures.length !== canonicalTabResult.measureCount) {
    throw invalidResult('measureCount must match measures.length.');
  }

  let noteCount = 0;
  let restCount = 0;
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const counts = validateMeasure(measures[measureIndex], measureIndex, guitar);
    noteCount += counts.noteCount;
    restCount += counts.restCount;
  }
  if (noteCount !== canonicalTabResult.noteCount || restCount !== canonicalTabResult.restCount) {
    throw invalidResult('Canonical TAB event counts do not match the declared counts.', {
      declaredNoteCount: canonicalTabResult.noteCount,
      actualNoteCount: noteCount,
      declaredRestCount: canonicalTabResult.restCount,
      actualRestCount: restCount,
    });
  }

  return { tuningByString };
}

class XmlBuilder {
  constructor(pretty) {
    this.pretty = pretty;
    this.depth = 0;
    this.fragments = [];
  }

  line(value) {
    if (this.pretty) {
      this.fragments.push(`${'  '.repeat(this.depth)}${value}\n`);
    } else {
      this.fragments.push(value);
    }
  }

  open(name, attributes = '') {
    this.line(`<${name}${attributes}>`);
    this.depth += 1;
  }

  close(name) {
    this.depth -= 1;
    this.line(`</${name}>`);
  }

  element(name, value, attributes = '') {
    this.line(`<${name}${attributes}>${value}</${name}>`);
  }

  empty(name, attributes = '') {
    this.line(`<${name}${attributes}/>`);
  }

  toString() {
    const text = this.fragments.join('');
    return this.pretty && text.endsWith('\n') ? text.slice(0, -1) : text;
  }
}

function writePitch(builder, pitch) {
  builder.open('pitch');
  builder.element('step', pitch.step);
  if (pitch.alter !== 0) {
    builder.element('alter', String(pitch.alter));
  }
  builder.element('octave', String(pitch.octave));
  builder.close('pitch');
}

function writeTies(builder, rhythm, elementName) {
  if (rhythm.tieStop) {
    builder.empty(elementName, ' type="stop"');
  }
  if (rhythm.tieStart) {
    builder.empty(elementName, ' type="start"');
  }
}

function writeEvent(builder, event, staff, voice) {
  builder.open('note');
  if (event.type === 'rest') {
    builder.empty('rest');
  } else {
    writePitch(builder, event.pitch);
  }
  builder.element('duration', String(event.rhythm.durationDivisions));
  writeTies(builder, event.rhythm, 'tie');
  builder.element('voice', String(voice));
  builder.element('type', event.rhythm.type);
  for (let dot = 0; dot < event.rhythm.dots; dot += 1) {
    builder.empty('dot');
  }
  builder.element('staff', String(staff));
  for (const beam of event.rhythm.beam) {
    builder.element(
      'beam',
      BEAM_VALUES[beam.value],
      ` number="${beam.level}"`,
    );
  }

  const hasTieNotation = event.rhythm.tieStart || event.rhythm.tieStop;
  const hasTechnical = staff === 2 && event.type === 'note';
  if (hasTieNotation || hasTechnical) {
    builder.open('notations');
    writeTies(builder, event.rhythm, 'tied');
    if (hasTechnical) {
      builder.open('technical');
      builder.element('string', String(event.selectedPosition.string));
      builder.element('fret', String(event.selectedPosition.fret));
      builder.close('technical');
    }
    builder.close('notations');
  }
  builder.close('note');
}

function writeTimeSignature(builder, measure, staff, hidden) {
  const attributes = ` number="${staff}"${hidden ? ' print-object="no"' : ''}`;
  builder.open('time', attributes);
  builder.element('beats', String(measure.timeSignature.beats));
  builder.element('beat-type', String(measure.timeSignature.beatType));
  builder.close('time');
}

function writeStaffTuning(builder, tuningByString) {
  for (let line = 1; line <= 6; line += 1) {
    const stringNumber = 7 - line;
    const tuning = tuningByString.get(stringNumber);
    builder.open('staff-tuning', ` line="${line}"`);
    builder.element('tuning-step', tuning.parsedPitch.step);
    if (tuning.parsedPitch.alter !== 0) {
      builder.element('tuning-alter', String(tuning.parsedPitch.alter));
    }
    builder.element('tuning-octave', String(tuning.parsedPitch.octave));
    builder.close('staff-tuning');
  }
}

function writeAttributes(builder, measure, measureIndex, tuningByString) {
  builder.open('attributes');
  builder.element('divisions', String(measure.divisions));
  writeTimeSignature(builder, measure, 1, false);
  writeTimeSignature(builder, measure, 2, true);

  if (measureIndex === 0) {
    builder.element('staves', '2');
    builder.element('part-symbol', 'none');

    builder.open('clef', ' number="1"');
    builder.element('sign', 'G');
    builder.element('line', '2');
    builder.close('clef');

    builder.open('clef', ' number="2"');
    builder.element('sign', 'TAB');
    builder.element('line', '5');
    builder.close('clef');

    builder.open('staff-details', ' number="2" show-frets="numbers"');
    builder.element('staff-type', 'alternate');
    builder.element('staff-lines', '6');
    writeStaffTuning(builder, tuningByString);
    builder.close('staff-details');
  }

  builder.close('attributes');
}

function serializeCanonicalTabResultToMusicXml(canonicalTabResult, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const { tuningByString } = validateCanonicalTabResult(canonicalTabResult);
  const builder = new XmlBuilder(normalizedOptions.pretty);

  builder.line('<?xml version="1.0" encoding="UTF-8"?>');
  builder.open('score-partwise', ` version="${MUSICXML_VERSION}"`);
  builder.open('identification');
  builder.open('encoding');
  builder.element(
    'software',
    escapeXmlText(
      `${canonicalTabResult.engine.name} ${canonicalTabResult.engine.version}`,
      'canonicalTabResult.engine',
    ),
  );
  builder.close('encoding');
  builder.close('identification');

  builder.open('part-list');
  builder.open('score-part', ' id="P1"');
  builder.element('part-name', 'Guitar');
  builder.open('score-instrument', ' id="P1-I1"');
  builder.element('instrument-name', 'Guitar');
  builder.close('score-instrument');
  builder.close('score-part');
  builder.close('part-list');

  builder.open('part', ' id="P1"');
  for (let measureIndex = 0; measureIndex < canonicalTabResult.measures.length; measureIndex += 1) {
    const measure = canonicalTabResult.measures[measureIndex];
    const number = escapeXmlAttribute(
      measure.visibleMeasureNumber,
      `canonicalTabResult.measures[${measureIndex}].visibleMeasureNumber`,
    );
    const implicit = measure.implicit ? ' implicit="yes"' : '';
    builder.open('measure', ` number="${number}"${implicit}`);
    writeAttributes(builder, measure, measureIndex, tuningByString);

    for (const event of measure.events) {
      writeEvent(builder, event, 1, 1);
    }
    if (measure.actualDurationDivisions > 0) {
      builder.open('backup');
      builder.element('duration', String(measure.actualDurationDivisions));
      builder.close('backup');
    }
    for (const event of measure.events) {
      writeEvent(builder, event, 2, 2);
    }
    builder.close('measure');
  }
  builder.close('part');
  builder.close('score-partwise');

  const xml = builder.toString();
  return normalizedOptions.trailingNewline ? `${xml}\n` : xml;
}

module.exports = {
  MUSICXML_VERSION,
  SUPPORTED_CANONICAL_TAB_RESULT_VERSION,
  CanonicalTabMusicXmlWriterError,
  serializeCanonicalTabResultToMusicXml,
};
