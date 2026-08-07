'use strict';

const { EngineError } = require('../errors/engineError');
const { parsePitchName, pitchToMidi, PitchError } = require('../music/pitch');
const {
  CANONICAL_TAB_RESULT_VERSION,
} = require('../contracts/canonicalTabContractMetadata');
const {
  CanonicalTabContractError,
  validateCanonicalTabResult,
} = require('../contracts/canonicalTabResultContract');

const SUPPORTED_CANONICAL_TAB_RESULT_VERSION = CANONICAL_TAB_RESULT_VERSION;
const MUSICXML_VERSION = '4.0';
const BEAM_VALUES = Object.freeze({
  begin: 'begin',
  continue: 'continue',
  end: 'end',
  'forward-hook': 'forward hook',
  'backward-hook': 'backward hook',
});
const UNSUPPORTED_CONTRACT_RULES = new Set([
  'SIX_STRING_TUNING_REQUIRED',
  'UNSUPPORTED_EVENT_TYPE',
  'SINGLE_STAFF_REQUIRED',
  'MULTIPLE_VOICES_NOT_SUPPORTED',
  'EVENT_START_SEQUENCE_MISMATCH',
  'UNSUPPORTED_RHYTHM_TYPE',
  'TIME_MODIFICATION_NOT_SUPPORTED',
  'UNSUPPORTED_BEAM_VALUE',
  'NON_PICKUP_MEASURE_DURATION_MISMATCH',
]);

class CanonicalTabMusicXmlWriterError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'CanonicalTabMusicXmlWriterError');
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

function isUnsupportedContractError(error) {
  if (UNSUPPORTED_CONTRACT_RULES.has(error.details && error.details.rule)) {
    return true;
  }
  return error.details
    && error.details.path === 'canonicalTabResult.voiceCount'
    && error.details.rule === 'SAFE_INTEGER_RANGE'
    && error.details.actual > 1;
}

function adaptContractError(error) {
  if (!(error instanceof CanonicalTabContractError)) {
    return error;
  }

  const details = {
    ...error.details,
    contractCode: error.code,
  };
  if (error.code === 'UNSUPPORTED_CANONICAL_TAB_SCHEMA') {
    return unsupportedSchema(details);
  }
  if (isUnsupportedContractError(error)) {
    return unsupportedStructure(
      'The CanonicalTabResult contains a structure that the MusicXML writer does not support.',
      details,
    );
  }
  return invalidResult(
    'canonicalTabResult violates the CanonicalTabResult contract.',
    details,
  );
}

function validateSharedContract(canonicalTabResult) {
  try {
    validateCanonicalTabResult(canonicalTabResult);
  } catch (error) {
    throw adaptContractError(error);
  }
}

function assertXmlSafeString(value, path) {
  if (typeof value !== 'string') {
    throw invalidResult(`${path} must be a string.`, { path });
  }

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

function prepareTuning(canonicalTabResult) {
  const tuningByString = new Map();
  for (let index = 0; index < canonicalTabResult.guitar.tuning.length; index += 1) {
    const entry = canonicalTabResult.guitar.tuning[index];
    const path = `canonicalTabResult.guitar.tuning[${index}]`;
    if (typeof entry.pitch !== 'string' || entry.pitch.length === 0) {
      throw invalidResult('Guitar tuning pitch metadata is required for MusicXML output.', {
        path: `${path}.pitch`,
      });
    }

    let parsedPitch;
    try {
      parsedPitch = parsePitchName(entry.pitch);
      if (pitchToMidi(parsedPitch) !== entry.midi) {
        throw new PitchError('Tuning pitch and MIDI value do not match.');
      }
    } catch (error) {
      if (error instanceof PitchError) {
        throw invalidResult('Guitar tuning contains an invalid pitch.', { path });
      }
      throw error;
    }
    tuningByString.set(entry.number, { ...entry, parsedPitch });
  }
  return tuningByString;
}

function validateMusicXmlRenderability(canonicalTabResult) {
  for (let measureIndex = 0; measureIndex < canonicalTabResult.measures.length; measureIndex += 1) {
    const measure = canonicalTabResult.measures[measureIndex];
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      const event = measure.events[eventIndex];
      for (let beamIndex = 0; beamIndex < event.rhythm.beam.length; beamIndex += 1) {
        const beam = event.rhythm.beam[beamIndex];
        const path = `canonicalTabResult.measures[${measureIndex}].events[${eventIndex}].rhythm.beam[${beamIndex}]`;
        if (beam.level > 8) {
          throw invalidResult('MusicXML beam numbers must not exceed 8.', {
            path: `${path}.level`,
            value: beam.level,
            maximum: 8,
          });
        }
        if (!Object.hasOwn(BEAM_VALUES, beam.value)) {
          throw unsupportedStructure('The MusicXML writer does not support this beam value.', {
            path: `${path}.value`,
            value: beam.value,
          });
        }
      }
    }
  }
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

function writePitch(builder, pitch, octaveOffset = 0) {
  builder.open('pitch');
  builder.element('step', pitch.step);
  if (pitch.alter !== 0) {
    builder.element('alter', String(pitch.alter));
  }
  builder.element('octave', String(pitch.octave + octaveOffset));
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
    writePitch(builder, event.pitch, staff === 1 ? 1 : 0);
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

function writeTimeSignature(builder, measure) {
  builder.open('time');
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

function writeAttributes(builder, measure, measureIndex, tuningByString, previousMeasure = null) {
  builder.open('attributes');
  builder.element('divisions', String(measure.divisions));

  const timeSignatureChanged = previousMeasure === null
    || previousMeasure.timeSignature.beats !== measure.timeSignature.beats
    || previousMeasure.timeSignature.beatType !== measure.timeSignature.beatType;

  if (timeSignatureChanged) {
    writeTimeSignature(builder, measure);
  }

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

    builder.open('transpose', ' number="1"');
    builder.element('diatonic', '0');
    builder.element('chromatic', '0');
    builder.element('octave-change', '-1');
    builder.close('transpose');
  }

  builder.close('attributes');
}

function serializeCanonicalTabResultToMusicXml(canonicalTabResult, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  validateSharedContract(canonicalTabResult);
  validateMusicXmlRenderability(canonicalTabResult);
  const tuningByString = prepareTuning(canonicalTabResult);
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
    const previousMeasure = measureIndex === 0
      ? null
      : canonicalTabResult.measures[measureIndex - 1];

    writeAttributes(builder, measure, measureIndex, tuningByString, previousMeasure);

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
