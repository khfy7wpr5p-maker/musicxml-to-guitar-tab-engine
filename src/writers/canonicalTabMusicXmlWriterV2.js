'use strict';

const { types: { isProxy } } = require('node:util');
const { EngineError } = require('../errors/engineError');
const { parsePitchName } = require('../music/pitch');
const { isProcessingRuntime } = require('../core/processingRuntime');
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

function validateOptionalRuntime(runtime) {
  if (runtime === null || runtime === undefined) return null;
  if (!isProcessingRuntime(runtime)) {
    throw new CanonicalTabMusicXmlWriterV2Error(
      'runtime must be a ProcessingRuntime 1.0.0 value.',
      'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
      { field: 'runtime' },
    );
  }
  return runtime;
}

function checkpoint(runtime, phase, details = {}) {
  if (runtime) runtime.checkpoint(phase, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isProxy(value)) return false;
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
  const normalized = { pretty: false, trailingNewline: false, notationContext: null };
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
    if (key === 'notationContext') {
      normalized.notationContext = normalizeNotationContext(descriptor.value);
      continue;
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

function normalizeNotationContext(value) {
  if (!isPlainObject(value) || Reflect.ownKeys(value).some((key) => key !== 'keySignatures')) {
    throw new CanonicalTabMusicXmlWriterV2Error(
      'options.notationContext must contain only keySignatures.',
      'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
      { field: 'notationContext' },
    );
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'keySignatures');
  if (
    !descriptor
    || !descriptor.enumerable
    || !Object.hasOwn(descriptor, 'value')
    || !Array.isArray(descriptor.value)
    || isProxy(descriptor.value)
    || Object.getPrototypeOf(descriptor.value) !== Array.prototype
    || descriptor.value.length > 2000
    || Reflect.ownKeys(descriptor.value).some((key) => (
      key !== 'length' && (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key))
    ))
  ) {
    throw new CanonicalTabMusicXmlWriterV2Error(
      'options.notationContext.keySignatures must be an array.',
      'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
      { field: 'notationContext.keySignatures' },
    );
  }
  const keySignatures = [];
  let previousMeasureIndex = -1;
  for (let index = 0; index < descriptor.value.length; index += 1) {
    if (!Object.hasOwn(descriptor.value, index)) {
      throw new CanonicalTabMusicXmlWriterV2Error(
        'options.notationContext.keySignatures must be dense.',
        'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
        { field: `notationContext.keySignatures[${index}]` },
      );
    }
    const entry = descriptor.value[index];
    const entryDescriptors = isPlainObject(entry) ? Object.getOwnPropertyDescriptors(entry) : null;
    const entryKeys = entryDescriptors ? Reflect.ownKeys(entry) : [];
    const exactFields = ['measureIndex', 'fifths', 'mode'];
    const hasExactDataFields = entryDescriptors
      && entryKeys.length === exactFields.length
      && exactFields.every((field) => (
        Object.hasOwn(entryDescriptors, field)
        && entryDescriptors[field].enumerable
        && Object.hasOwn(entryDescriptors[field], 'value')
      ));
    const measureIndex = hasExactDataFields ? entryDescriptors.measureIndex.value : null;
    const fifths = hasExactDataFields ? entryDescriptors.fifths.value : null;
    const mode = hasExactDataFields ? entryDescriptors.mode.value : undefined;
    if (
      !hasExactDataFields
      || entryKeys.some((key) => !exactFields.includes(key))
      || !Number.isInteger(measureIndex)
      || measureIndex <= previousMeasureIndex
      || !Number.isInteger(fifths)
      || fifths < -7
      || fifths > 7
      || (mode !== null && !['major', 'minor'].includes(mode))
    ) {
      throw new CanonicalTabMusicXmlWriterV2Error(
        'options.notationContext contains an invalid key signature.',
        'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
        { field: `notationContext.keySignatures[${index}]` },
      );
    }
    previousMeasureIndex = measureIndex;
    keySignatures.push(Object.freeze({
      measureIndex,
      fifths,
      mode,
    }));
  }
  return Object.freeze({ keySignatures: Object.freeze(keySignatures) });
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
  constructor(pretty, runtime) {
    this.pretty = pretty;
    this.runtime = runtime;
    this.depth = 0;
    this.fragments = [];
  }

  line(value) {
    checkpoint(this.runtime, 'canonical-tab-musicxml-v2:fragment', {
      fragmentIndex: this.fragments.length,
      depth: this.depth,
    });
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
    checkpoint(this.runtime, 'canonical-tab-musicxml-v2:join-start', {
      fragmentCount: this.fragments.length,
    });
    const value = this.fragments.join('');
    const serialized = this.pretty && value.endsWith('\n') ? value.slice(0, -1) : value;
    checkpoint(this.runtime, 'canonical-tab-musicxml-v2:join-complete', {
      fragmentCount: this.fragments.length,
    });
    return serialized;
  }
}

function prepareTuning(result, runtime) {
  const byString = new Map();
  for (const entry of result.guitar.tuning) {
    checkpoint(runtime, 'canonical-tab-musicxml-v2:tuning', { string: entry.number });
    byString.set(entry.number, { ...entry, parsedPitch: parsePitchName(entry.pitch) });
  }
  return byString;
}

function buildDispositionIndex(result, runtime) {
  const dispositions = new Map();
  for (let index = 0; index < result.noteDispositions.length; index += 1) {
    checkpoint(runtime, 'canonical-tab-musicxml-v2:disposition', { index });
    const entry = result.noteDispositions[index];
    dispositions.set(entry.sourceEventId, entry);
  }
  return dispositions;
}

function buildFingerIndex(result, runtime) {
  const fingers = new Map();
  for (let shapeIndex = 0; shapeIndex < result.selectedShapes.length; shapeIndex += 1) {
    const shape = result.selectedShapes[shapeIndex];
    for (let assignmentIndex = 0; assignmentIndex < shape.fingerAssignments.length; assignmentIndex += 1) {
      checkpoint(runtime, 'canonical-tab-musicxml-v2:finger-assignment', {
        shapeIndex,
        assignmentIndex,
      });
      const assignment = shape.fingerAssignments[assignmentIndex];
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

function collectTrackRecords(result, dispositions, runtime) {
  const records = new Map();
  for (let measureIndex = 0; measureIndex < result.measures.length; measureIndex += 1) {
    const measure = result.measures[measureIndex];
    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'canonical-tab-musicxml-v2:track-index-event', {
        measureIndex,
        eventIndex,
      });
      const event = measure.events[eventIndex];
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

function writeAttributes(builder, measure, measureIndex, tuningByString, previousMeasure, keySignature) {
  builder.open('attributes');
  builder.element('divisions', String(measure.divisions));
  if (keySignature) {
    builder.open('key');
    builder.element('fifths', String(keySignature.fifths));
    if (keySignature.mode !== null) builder.element('mode', keySignature.mode);
    builder.close('key');
  }
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

function renderTrack(
  builder,
  events,
  resultIndexes,
  outputStaff,
  outputVoice,
  measure,
  runtime,
  location,
) {
  let cursor = 0;
  let previousOnset = null;
  let previousWasNote = false;

  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    checkpoint(runtime, 'canonical-tab-musicxml-v2:event', {
      ...location,
      eventIndex,
      outputStaff,
      outputVoice,
    });
    const event = events[eventIndex];
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

function serializeCanonicalTabResultV2ToMusicXml(canonicalTabResult, options = {}, runtime = null) {
  const processing = validateOptionalRuntime(runtime);
  checkpoint(processing, 'canonical-tab-musicxml-v2:start');
  const normalizedOptions = normalizeOptions(options);
  validateResult(canonicalTabResult);
  const keySignatures = new Map();
  for (const keySignature of normalizedOptions.notationContext?.keySignatures || []) {
    if (keySignature.measureIndex >= canonicalTabResult.measures.length) {
      throw new CanonicalTabMusicXmlWriterV2Error(
        'options.notationContext key signature references an unknown measure.',
        'INVALID_CANONICAL_TAB_MUSICXML_V2_OPTIONS',
        { field: 'notationContext.keySignatures', measureIndex: keySignature.measureIndex },
      );
    }
    keySignatures.set(keySignature.measureIndex, keySignature);
  }
  checkpoint(processing, 'canonical-tab-musicxml-v2:validated');
  const tuningByString = prepareTuning(canonicalTabResult, processing);
  const dispositions = buildDispositionIndex(canonicalTabResult, processing);
  const fingers = buildFingerIndex(canonicalTabResult, processing);
  const tracks = collectTrackRecords(canonicalTabResult, dispositions, processing);
  const indexes = { dispositions, fingers };
  const builder = new XmlBuilder(normalizedOptions.pretty, processing);

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
    checkpoint(processing, 'canonical-tab-musicxml-v2:measure', { measureIndex });
    const measure = canonicalTabResult.measures[measureIndex];
    const number = escapeAttribute(measure.number, `canonicalTabResult.measures[${measureIndex}].number`);
    builder.open('measure', ` number="${number}"${measure.implicit ? ' implicit="yes"' : ''}`);
    writeAttributes(
      builder,
      measure,
      measureIndex,
      tuningByString,
      measureIndex === 0 ? null : canonicalTabResult.measures[measureIndex - 1],
      keySignatures.get(measureIndex) || null,
    );

    const activeTracks = tracks
      .map((track) => ({ track, events: eventsForTrack(measure, track, dispositions) }))
      .filter((entry) => entry.events.length > 0);

    for (let outputStaff = 1; outputStaff <= 2; outputStaff += 1) {
      for (let index = 0; index < activeTracks.length; index += 1) {
        checkpoint(processing, 'canonical-tab-musicxml-v2:track', {
          measureIndex,
          outputStaff,
          trackIndex: index,
        });
        if (index > 0) writeBackup(builder, measure.expectedDurationDivisions);
        const entry = activeTracks[index];
        const outputVoice = entry.track.outputVoice + (outputStaff === 2 ? tracks.length : 0);
        renderTrack(
          builder,
          entry.events,
          indexes,
          outputStaff,
          outputVoice,
          measure,
          processing,
          { measureIndex, trackIndex: index },
        );
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
  checkpoint(processing, 'canonical-tab-musicxml-v2:complete');
  return normalizedOptions.trailingNewline ? `${xml}\n` : xml;
}

module.exports = {
  MUSICXML_VERSION,
  SUPPORTED_CANONICAL_TAB_RESULT_VERSION: CANONICAL_TAB_RESULT_V2_VERSION,
  MAX_OUTPUT_VOICE_TRACKS,
  CanonicalTabMusicXmlWriterV2Error,
  serializeCanonicalTabResultV2ToMusicXml,
};
