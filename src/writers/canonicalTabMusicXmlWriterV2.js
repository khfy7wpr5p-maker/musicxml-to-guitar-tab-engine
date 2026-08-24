'use strict';

const { EngineError } = require('../errors/engineError');
const { parsePitchName } = require('../music/pitch');
const {
  CANONICAL_TAB_RESULT_V2_VERSION,
  CanonicalTabResultV2ContractError,
  validateCanonicalTabResultV2,
} = require('../contracts/canonicalTabResultV2Contract');

const MUSICXML_VERSION = '4.0';
const MAX_OUTPUT_VOICE_TRACKS = 64;

class CanonicalTabMusicXmlWriterV2Error extends EngineError {
  constructor(message, code = 'INVALID_CANONICAL_TAB_MUSICXML_V2_RESULT', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'CanonicalTabMusicXmlWriterV2Error');
  }
}

function invalid(message, details = {}) {
  return new CanonicalTabMusicXmlWriterV2Error(message, undefined, details);
}

function unsupported(message, details = {}) {
  return new CanonicalTabMusicXmlWriterV2Error(
    message,
    'UNSUPPORTED_CANONICAL_TAB_MUSICXML_V2_STRUCTURE',
    details,
  );
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeOptions(options) {
  if (!isPlainObject(options)) {
    throw new CanonicalTabMusicXmlWriterV2Error(
      'options must be a plain object.',
      'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
    );
  }
  const normalized = { pretty: false, trailingNewline: false };
  const allowed = new Set(Object.keys(normalized));
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new CanonicalTabMusicXmlWriterV2Error(
        'options contains an unknown field.',
        'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
        { field: typeof key === 'symbol' ? key.toString() : key },
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new CanonicalTabMusicXmlWriterV2Error(
        'options fields must be enumerable data properties.',
        'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
        { field: key },
      );
    }
    if (typeof descriptor.value !== 'boolean') {
      throw new CanonicalTabMusicXmlWriterV2Error(
        `options.${key} must be boolean.`,
        'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
        { field: key },
      );
    }
    normalized[key] = descriptor.value;
  }
  return normalized;
}

function validateResult(value) {
  try {
    validateCanonicalTabResultV2(value);
  } catch (error) {
    if (error instanceof CanonicalTabResultV2ContractError) {
      throw invalid('canonicalTabResult violates CanonicalTabResult 2.0.0.', {
        contractCode: error.code,
        ...(error.details || {}),
      });
    }
    throw error;
  }
}

function assertXmlSafeString(value, path) {
  if (typeof value !== 'string') throw invalid(`${path} must be a string.`, { path });
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const allowed = codePoint === 0x9
      || codePoint === 0xA
      || codePoint === 0xD
      || (codePoint >= 0x20 && codePoint <= 0xD7FF)
      || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
      || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
    if (!allowed) throw invalid('Text contains a character invalid in XML 1.0.', { path, codePoint });
  }
  return value;
}

function escapeText(value, path) {
  return assertXmlSafeString(value, path)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value, path) {
  return escapeText(value, path).replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

class XmlBuilder {
  constructor(pretty) {
    this.pretty = pretty;
    this.depth = 0;
    this.fragments = [];
  }

  line(value) {
    this.fragments.push(this.pretty ? `${'  '.repeat(this.depth)}${value}\n` : value);
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
    const value = this.fragments.join('');
    return this.pretty && value.endsWith('\n') ? value.slice(0, -1) : value;
  }
}

function prepareTuning(result) {
  const byString = new Map();
  for (const entry of result.guitar.tuning) {
    byString.set(entry.number, { ...entry, parsedPitch: parsePitchName(entry.pitch) });
  }
  return byString;
}

function buildDispositionIndex(result) {
  return new Map(result.noteDispositions.map((entry) => [entry.sourceEventId, entry]));
}

function buildFingerIndex(result) {
  const fingers = new Map();
  for (const shape of result.selectedShapes) {
    for (const assignment of shape.fingerAssignments) {
      if (fingers.has(assignment.sourceEventId)) {
        throw invalid('A source note received more than one selected finger assignment.', {
          sourceEventId: assignment.sourceEventId,
        });
      }
      fingers.set(assignment.sourceEventId, assignment.finger);
    }
  }
  return fingers;
}

function trackKey(event) {
  return `${event.staff}\u0000${event.voice}`;
}

function compareTrackRecords(left, right) {
  return left.staff - right.staff || left.voice.localeCompare(right.voice);
}

function collectTrackRecords(result, dispositions) {
  const records = new Map();
  for (const measure of result.measures) {
    for (const event of measure.events) {
      const rendered = event.type === 'rest'
        || (dispositions.get(event.sourceEventId) || {}).disposition === 'KEEP';
      if (!rendered) continue;
      const key = trackKey(event);
      if (!records.has(key)) records.set(key, { key, staff: event.staff, voice: event.voice });
    }
  }
  const ordered = [...records.values()].sort(compareTrackRecords);
  if (ordered.length > MAX_OUTPUT_VOICE_TRACKS) {
    throw unsupported('Canonical v2 MusicXML writer voice-track limit exceeded.', {
      limit: MAX_OUTPUT_VOICE_TRACKS,
      observed: ordered.length,
    });
  }
  return ordered.map((entry, index) => Object.freeze({ ...entry, outputVoice: index + 1 }));
}

function writeTime(builder, measure) {
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

function writeAttributes(builder, measure, measureIndex, tuningByString, previousMeasure) {
  builder.open('attributes');
  builder.element('divisions', String(measure.divisions));
  if (
    previousMeasure === null
    || previousMeasure.timeSignature.beats !== measure.timeSignature.beats
    || previousMeasure.timeSignature.beatType !== measure.timeSignature.beatType
  ) {
    writeTime(builder, measure);
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

function writePitch(builder, pitch, octaveOffset) {
  builder.open('pitch');
  builder.element('step', pitch.step);
  if (pitch.alter !== 0) builder.element('alter', String(pitch.alter));
  builder.element('octave', String(pitch.octave + octaveOffset));
  builder.close('pitch');
}

function writeTies(builder, event, elementName) {
  if (event.tieStop) builder.empty(elementName, ' type="stop"');
  if (event.tieStart) builder.empty(elementName, ' type="start"');
}

function writeNote(builder, event, disposition, finger, outputStaff, outputVoice, chord) {
  builder.open('note');
  if (chord) builder.empty('chord');
  writePitch(builder, disposition.targetPitch, outputStaff === 1 ? 1 : 0);
  builder.element('duration', String(event.durationDivisions));
  writeTies(builder, event, 'tie');
  builder.element('voice', String(outputVoice));
  builder.element('staff', String(outputStaff));
  const hasTieNotation = event.tieStart || event.tieStop;
  const hasTechnical = outputStaff === 2;
  if (hasTieNotation || hasTechnical) {
    builder.open('notations');
    writeTies(builder, event, 'tied');
    if (hasTechnical) {
      builder.open('technical');
      if (Number.isInteger(finger) && finger > 0) builder.element('fingering', String(finger));
      builder.element('string', String(disposition.selectedPosition.string));
      builder.element('fret', String(disposition.selectedPosition.fret));
      builder.close('technical');
    }
    builder.close('notations');
  }
  builder.close('note');
}

function writeRest(builder, event, outputStaff, outputVoice) {
  builder.open('note');
  builder.empty('rest');
  builder.element('duration', String(event.durationDivisions));
  builder.element('voice', String(outputVoice));
  builder.element('staff', String(outputStaff));
  builder.close('note');
}

function writeForward(builder, duration) {
  if (duration <= 0) return;
  builder.open('forward');
  builder.element('duration', String(duration));
  builder.close('forward');
}

function writeBackup(builder, duration) {
  if (duration <= 0) return;
  builder.open('backup');
  builder.element('duration', String(duration));
  builder.close('backup');
}

function renderTrack(builder, events, resultIndexes, outputStaff, outputVoice, measure) {
  let cursor = 0;
  let previousOnset = null;
  let previousWasNote = false;

  for (const event of events) {
    const disposition = event.type === 'note'
      ? resultIndexes.dispositions.get(event.sourceEventId)
      : null;
    if (event.type === 'note' && (!disposition || disposition.disposition !== 'KEEP')) continue;

    const chord = event.type === 'note'
      && previousWasNote
      && previousOnset === event.onsetDivisions;

    if (!chord) {
      if (event.onsetDivisions < cursor) {
        throw unsupported('One source voice contains overlapping non-chord events that cannot be serialized safely.', {
          sourceEventId: event.sourceEventId,
          onsetDivisions: event.onsetDivisions,
          cursor,
        });
      }
      writeForward(builder, event.onsetDivisions - cursor);
    } else if (event.onsetDivisions !== previousOnset) {
      throw invalid('Internal chord serialization state diverged.');
    }

    if (event.type === 'rest') {
      if (chord) throw unsupported('A rest cannot be serialized as a chord member.');
      writeRest(builder, event, outputStaff, outputVoice);
      cursor = event.onsetDivisions + event.durationDivisions;
      previousWasNote = false;
      previousOnset = event.onsetDivisions;
      continue;
    }

    writeNote(
      builder,
      event,
      disposition,
      resultIndexes.fingers.get(event.sourceEventId),
      outputStaff,
      outputVoice,
      chord,
    );
    if (!chord) cursor = event.onsetDivisions + event.durationDivisions;
    previousWasNote = true;
    previousOnset = event.onsetDivisions;
  }

  if (cursor > measure.expectedDurationDivisions) {
    throw invalid('Rendered voice cursor exceeds the canonical measure duration.', {
      measureId: measure.measureId,
      cursor,
      expectedDurationDivisions: measure.expectedDurationDivisions,
    });
  }
  writeForward(builder, measure.expectedDurationDivisions - cursor);
}

function eventsForTrack(measure, track, dispositions) {
  return measure.events
    .filter((event) => trackKey(event) === track.key)
    .filter((event) => event.type === 'rest' || (dispositions.get(event.sourceEventId) || {}).disposition === 'KEEP')
    .sort((left, right) => left.onsetDivisions - right.onsetDivisions || left.sourceOrder - right.sourceOrder);
}

function serializeCanonicalTabResultV2ToMusicXml(canonicalTabResult, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  validateResult(canonicalTabResult);
  const tuningByString = prepareTuning(canonicalTabResult);
  const dispositions = buildDispositionIndex(canonicalTabResult);
  const fingers = buildFingerIndex(canonicalTabResult);
  const tracks = collectTrackRecords(canonicalTabResult, dispositions);
  const indexes = { dispositions, fingers };
  const builder = new XmlBuilder(normalizedOptions.pretty);

  builder.line('<?xml version="1.0" encoding="UTF-8"?>');
  builder.open('score-partwise', ` version="${MUSICXML_VERSION}"`);
  builder.open('identification');
  builder.open('encoding');
  builder.element(
    'software',
    escapeText(
      `${canonicalTabResult.engine.name} ${canonicalTabResult.engine.version}`,
      'canonicalTabResult.engine',
    ),
  );
  builder.close('encoding');
  builder.close('identification');
  builder.open('part-list');
  builder.open('score-part', ' id="P1"');
  builder.element('part-name', 'Guitar');
  builder.close('score-part');
  builder.close('part-list');
  builder.open('part', ' id="P1"');

  for (let measureIndex = 0; measureIndex < canonicalTabResult.measures.length; measureIndex += 1) {
    const measure = canonicalTabResult.measures[measureIndex];
    const number = escapeAttribute(measure.number, `canonicalTabResult.measures[${measureIndex}].number`);
    builder.open('measure', ` number="${number}"${measure.implicit ? ' implicit="yes"' : ''}`);
    writeAttributes(
      builder,
      measure,
      measureIndex,
      tuningByString,
      measureIndex === 0 ? null : canonicalTabResult.measures[measureIndex - 1],
    );

    const activeTracks = tracks
      .map((track) => ({ track, events: eventsForTrack(measure, track, dispositions) }))
      .filter((entry) => entry.events.length > 0);

    for (let outputStaff = 1; outputStaff <= 2; outputStaff += 1) {
      for (let index = 0; index < activeTracks.length; index += 1) {
        if (index > 0) writeBackup(builder, measure.expectedDurationDivisions);
        const entry = activeTracks[index];
        const outputVoice = entry.track.outputVoice + (outputStaff === 2 ? tracks.length : 0);
        renderTrack(builder, entry.events, indexes, outputStaff, outputVoice, measure);
      }
      if (outputStaff === 1 && activeTracks.length > 0) {
        writeBackup(builder, measure.expectedDurationDivisions);
      }
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
  SUPPORTED_CANONICAL_TAB_RESULT_VERSION: CANONICAL_TAB_RESULT_V2_VERSION,
  MAX_OUTPUT_VOICE_TRACKS,
  CanonicalTabMusicXmlWriterV2Error,
  serializeCanonicalTabResultV2ToMusicXml,
};