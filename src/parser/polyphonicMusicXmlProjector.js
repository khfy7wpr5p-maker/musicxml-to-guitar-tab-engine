'use strict';

const { EngineError } = require('../errors/engineError');
const {
  resolveProcessingRuntime,
} = require('../core/processingRuntime');
const {
  pitchToMidi,
  PitchError,
} = require('../music/pitch');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../music/polyphonicSourceModel');
const {
  enforceMusicXmlSemanticResourceLimits,
} = require('./musicxmlSemanticResourceLimits');

const PARSED_MUSICXML_DOCUMENT_VERSION = '1.0.0';
const MUSICXML_NAMESPACE = 'http://www.musicxml.org/ns/musicxml';
const MAX_PROJECTED_MEASURES = 2000;
const MAX_PROJECTED_EVENTS = 50000;
const MAX_SOURCE_STRING_LENGTH = 256;
const MAX_VERSION_LENGTH = 32;
const MAX_VOICE_ID_LENGTH = 64;

class PolyphonicMusicXmlProjectorError extends EngineError {
  constructor(message, code = 'INVALID_MUSICXML', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'PolyphonicMusicXmlProjectorError');
  }
}

function invalid(message, details = {}) {
  return new PolyphonicMusicXmlProjectorError(message, 'INVALID_MUSICXML', details);
}

function unsupported(feature, details = {}) {
  return new PolyphonicMusicXmlProjectorError(
    `MusicXML feature is outside the current PA-2.3 projector scope: ${feature}.`,
    'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE',
    { feature, ...details },
  );
}

function directChildren(node, name) {
  return node.children.filter(
    (child) => child.name === name && child.uri === node.uri,
  );
}

function getAttribute(node, name) {
  const attribute = node.attributes.find(
    (candidate) => candidate.name === name && candidate.uri.length === 0,
  );
  return attribute ? attribute.value : undefined;
}

function textOf(node) {
  return node ? node.text.trim() : '';
}

function requireSingleDirectChild(node, name, location, { optional = false } = {}) {
  const matches = directChildren(node, name);
  if (matches.length === 0 && optional) {
    return null;
  }
  if (matches.length !== 1) {
    throw invalid(`${name} must appear ${optional ? 'at most' : 'exactly'} once.`, {
      ...location,
      field: name,
      observedCount: matches.length,
    });
  }
  return matches[0];
}

function parsePositiveIntegerText(node, field, location) {
  const value = textOf(node);
  if (!/^\d+$/.test(value)) {
    throw invalid(`${field} must be a positive integer.`, { ...location, field });
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || Object.is(parsed, -0)) {
    throw invalid(`${field} must be a positive safe integer.`, { ...location, field });
  }
  return parsed;
}

function parseIntegerText(node, field, location) {
  const value = textOf(node);
  if (!/^-?\d+$/.test(value)) {
    throw invalid(`${field} must be an integer.`, { ...location, field });
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || Object.is(parsed, -0)) {
    throw invalid(`${field} must be a safe integer other than -0.`, { ...location, field });
  }
  return parsed;
}

function requireBoundedString(value, field, maximumLength, details = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw invalid(`${field} must be a bounded non-empty string.`, {
      ...details,
      field,
      maximumLength,
    });
  }
  return value;
}

function parseImplicit(measureNode, location) {
  const value = getAttribute(measureNode, 'implicit');
  if (value === undefined || value === 'no') {
    return false;
  }
  if (value === 'yes') {
    return true;
  }
  throw invalid('measure implicit must be yes, no, or absent.', {
    ...location,
    implicit: value,
  });
}

function expectedDurationDivisions(divisions, timeSignature, location) {
  if (divisions > Number.MAX_SAFE_INTEGER / timeSignature.beats / 4) {
    throw invalid('Measure duration arithmetic exceeds the safe-integer range.', location);
  }
  const numerator = divisions * timeSignature.beats * 4;
  if (numerator % timeSignature.beatType !== 0) {
    throw invalid('Time signature cannot be represented by the active divisions value.', location);
  }
  const duration = numerator / timeSignature.beatType;
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw invalid('Expected measure duration must be a positive safe integer.', location);
  }
  return duration;
}

function writtenPitch(step, alter, octave) {
  const accidental = {
    '-2': 'bb',
    '-1': 'b',
    0: '',
    1: '#',
    2: '##',
  }[alter];
  return `${step}${accidental}${octave}`;
}

function applyTieType(state, type, location) {
  if (type === 'start') {
    state.tieStart = true;
    return;
  }
  if (type === 'stop') {
    state.tieStop = true;
    return;
  }
  if (type === 'continue') {
    state.tieStart = true;
    state.tieStop = true;
    return;
  }
  throw invalid('Tie type must be start, stop, or continue.', {
    ...location,
    tieType: type,
  });
}

function rejectConditionalTie(tieNode, location) {
  const timeOnly = getAttribute(tieNode, 'time-only');
  if (timeOnly !== undefined) {
    throw unsupported('conditional-tie', { ...location, timeOnly });
  }
}

function parseTieState(noteNode, isRest, location) {
  const state = { tieStart: false, tieStop: false };
  const directTies = directChildren(noteNode, 'tie');
  const tiedNodes = [];
  for (const notations of directChildren(noteNode, 'notations')) {
    for (const notationChild of notations.children) {
      if (notationChild.uri !== notations.uri) {
        continue;
      }
      if (notationChild.name !== 'tied') {
        throw unsupported(`notation:${notationChild.name}`, location);
      }
      tiedNodes.push(notationChild);
    }
  }

  if (isRest && (directTies.length > 0 || tiedNodes.length > 0)) {
    throw invalid('Rest events must not carry tie markers.', location);
  }

  for (const tie of directTies) {
    rejectConditionalTie(tie, location);
    applyTieType(state, getAttribute(tie, 'type'), location);
  }
  for (const tied of tiedNodes) {
    rejectConditionalTie(tied, location);
    applyTieType(state, getAttribute(tied, 'type'), location);
  }
  return state;
}

function parsePitch(pitchNode, location) {
  const stepNode = requireSingleDirectChild(pitchNode, 'step', location);
  const alterNode = requireSingleDirectChild(pitchNode, 'alter', location, { optional: true });
  const octaveNode = requireSingleDirectChild(pitchNode, 'octave', location);
  const step = textOf(stepNode);
  if (!/^[A-G]$/.test(step)) {
    throw invalid('Pitch step must be A through G.', { ...location, step });
  }
  const alter = alterNode ? parseIntegerText(alterNode, 'alter', location) : 0;
  if (alter < -2 || alter > 2) {
    throw invalid('Pitch alter must be an integer from -2 through 2.', { ...location, alter });
  }
  const octave = parseIntegerText(octaveNode, 'octave', location);

  let midi;
  try {
    midi = pitchToMidi({ step, alter, octave });
  } catch (error) {
    if (error instanceof PitchError) {
      throw invalid('Pitch components are outside the supported MIDI range.', location);
    }
    throw error;
  }

  return {
    step,
    alter,
    octave,
    midi,
    written: writtenPitch(step, alter, octave),
  };
}

function parseVoiceAndStaff(noteNode, activeStaffCount, location) {
  const voiceNode = requireSingleDirectChild(noteNode, 'voice', location, { optional: true });
  const voice = voiceNode ? textOf(voiceNode) : '1';
  requireBoundedString(voice, 'voice', MAX_VOICE_ID_LENGTH, location);
  if (voice !== '1') {
    throw unsupported('multiple-voice-projection', { ...location, voice });
  }

  const staffNode = requireSingleDirectChild(noteNode, 'staff', location, { optional: true });
  const staff = staffNode ? parsePositiveIntegerText(staffNode, 'staff', location) : 1;
  if (staff !== 1 || staff > activeStaffCount) {
    throw unsupported('staff-2-projection', { ...location, staff, activeStaffCount });
  }
  return { voice, staff };
}

function parseBasicNote(noteNode, context) {
  const {
    partId,
    measureIndex,
    measureNumber,
    sourceOrder,
    cursor,
    expectedDuration,
    activeStaffCount,
  } = context;
  const location = { measureIndex, measureNumber, sourceOrder };

  for (const attribute of ['attack', 'release']) {
    if (getAttribute(noteNode, attribute) !== undefined) {
      throw unsupported('note-timing-offset', { ...location, attribute });
    }
  }

  if (directChildren(noteNode, 'chord').length > 0) {
    throw unsupported('source-chord-marker', location);
  }
  if (directChildren(noteNode, 'grace').length > 0) {
    throw unsupported('grace-note', location);
  }
  if (directChildren(noteNode, 'cue').length > 0) {
    throw unsupported('cue-note', location);
  }
  if (directChildren(noteNode, 'unpitched').length > 0) {
    throw unsupported('unpitched-note', location);
  }
  if (directChildren(noteNode, 'time-modification').length > 0) {
    throw unsupported('time-modification', location);
  }
  if (directChildren(noteNode, 'instrument').length > 0) {
    throw unsupported('note-instrument-assignment', location);
  }

  const rests = directChildren(noteNode, 'rest');
  const pitches = directChildren(noteNode, 'pitch');
  if (rests.length > 1 || pitches.length > 1 || ((rests.length === 1) === (pitches.length === 1))) {
    throw invalid('Every source note must contain exactly one rest or pitch.', location);
  }

  const durationNode = requireSingleDirectChild(noteNode, 'duration', location);
  const durationDivisions = parsePositiveIntegerText(durationNode, 'duration', location);
  if (cursor > Number.MAX_SAFE_INTEGER - durationDivisions) {
    throw invalid('Event onset plus duration exceeds the safe-integer range.', location);
  }
  const end = cursor + durationDivisions;
  if (end > expectedDuration) {
    throw invalid('Projected event extends beyond the measure boundary.', {
      ...location,
      endDivisions: end,
      expectedDurationDivisions: expectedDuration,
    });
  }

  const { voice, staff } = parseVoiceAndStaff(noteNode, activeStaffCount, location);
  const isRest = rests.length === 1;
  const tieState = parseTieState(noteNode, isRest, location);
  const event = {
    sourceEventId: createSourceEventId(partId, measureIndex, sourceOrder),
    sourceOrder,
    type: isRest ? 'rest' : 'note',
    voice,
    staff,
    onsetDivisions: cursor,
    durationDivisions,
    tieStart: tieState.tieStart,
    tieStop: tieState.tieStop,
    source: {
      partId,
      measureIndex,
      measureNumber,
      noteIndex: sourceOrder,
      chordWithPrevious: false,
    },
  };
  if (!isRest) {
    event.pitch = parsePitch(pitches[0], location);
  }
  return { event, nextCursor: end };
}

function applyMeasureAttributes(attributesNode, state, timingStarted, location) {
  const divisionsNodes = directChildren(attributesNode, 'divisions');
  const timeNodes = directChildren(attributesNode, 'time');
  const stavesNodes = directChildren(attributesNode, 'staves');
  const transposeNodes = directChildren(attributesNode, 'transpose');
  const measureStyleNodes = directChildren(attributesNode, 'measure-style');

  if (transposeNodes.length > 0) {
    throw unsupported('transpose', location);
  }
  if (measureStyleNodes.length > 0) {
    throw unsupported('measure-style', location);
  }
  if (divisionsNodes.length > 1 || timeNodes.length > 1 || stavesNodes.length > 1) {
    throw invalid('MusicXML timing/staff singleton attributes must not be duplicated.', location);
  }
  if (timingStarted && (divisionsNodes.length || timeNodes.length || stavesNodes.length)) {
    throw invalid('Timing or staff attributes may not change after measure timing begins.', location);
  }

  if (divisionsNodes.length === 1) {
    if (state.seenDivisions) {
      throw invalid('divisions may be declared at most once per measure.', location);
    }
    state.divisions = parsePositiveIntegerText(divisionsNodes[0], 'divisions', location);
    state.seenDivisions = true;
  }

  if (timeNodes.length === 1) {
    if (state.seenTime) {
      throw invalid('time may be declared at most once per measure.', location);
    }
    const beatsNode = requireSingleDirectChild(timeNodes[0], 'beats', location);
    const beatTypeNode = requireSingleDirectChild(timeNodes[0], 'beat-type', location);
    state.timeSignature = {
      beats: parsePositiveIntegerText(beatsNode, 'beats', location),
      beatType: parsePositiveIntegerText(beatTypeNode, 'beat-type', location),
    };
    state.seenTime = true;
  }

  if (stavesNodes.length === 1) {
    if (state.seenStaves) {
      throw invalid('staves may be declared at most once per measure.', location);
    }
    const staves = parsePositiveIntegerText(stavesNodes[0], 'staves', location);
    if (staves !== 1) {
      throw unsupported('staff-2-projection', { ...location, staves });
    }
    state.staffCount = staves;
    state.seenStaves = true;
  }
}

function requireStructuralMusicXmlDescendant(node, name, details = {}) {
  const matches = directChildren(node, name);
  if (matches.length !== 1) {
    throw invalid('Required MusicXML structural descendants must use the MusicXML namespace.', {
      ...details,
      field: name,
      observedCount: matches.length,
    });
  }
  return matches[0];
}

function validateParsedInput(parsedDocument) {
  if (
    !parsedDocument
    || typeof parsedDocument !== 'object'
    || parsedDocument.documentType !== 'ParsedMusicXmlDocument'
    || parsedDocument.contractVersion !== PARSED_MUSICXML_DOCUMENT_VERSION
    || !parsedDocument.root
  ) {
    throw invalid('PA-2 projector accepts only ParsedMusicXmlDocument 1.0.0 input.');
  }

  const rootNamespace = parsedDocument.root.uri;
  if (rootNamespace !== '' && rootNamespace !== MUSICXML_NAMESPACE) {
    throw invalid('MusicXML root namespace is not supported.', {
      field: 'rootNamespace',
      observed: rootNamespace,
    });
  }

  const partList = requireStructuralMusicXmlDescendant(parsedDocument.root, 'part-list');
  requireStructuralMusicXmlDescendant(partList, 'score-part');
  const part = requireStructuralMusicXmlDescendant(parsedDocument.root, 'part');
  if (directChildren(part, 'measure').length === 0) {
    throw invalid('Required MusicXML structural descendants must use the MusicXML namespace.', {
      field: 'measure',
      observedCount: 0,
    });
  }
}

function preflightProjectionOutputBounds(measureNodes, partId, effectiveMaxEvents, processing) {
  let eventCount = 0;

  for (let measureIndex = 0; measureIndex < measureNodes.length; measureIndex += 1) {
    const measureNode = measureNodes[measureIndex];
    processing.checkpoint('polyphonic-projector:preflight-measure', { measureIndex });

    const measureId = createMeasureId(partId, measureIndex);
    requireBoundedString(measureId, 'measureId', MAX_SOURCE_STRING_LENGTH, { measureIndex });

    let measureEventCount = 0;
    for (const child of measureNode.children) {
      if (child.name !== 'note' || child.uri !== measureNode.uri) {
        continue;
      }

      processing.checkpoint('polyphonic-projector:preflight-event', {
        measureIndex,
        sourceOrder: measureEventCount,
      });
      eventCount += 1;
      measureEventCount += 1;
      if (eventCount > effectiveMaxEvents) {
        throw invalid('Projected event count exceeds the PA-1 output boundary.', {
          observed: eventCount,
          limit: effectiveMaxEvents,
          measureIndex,
          sourceOrder: measureEventCount - 1,
        });
      }
    }

    if (measureEventCount > 0) {
      const sourceOrder = measureEventCount - 1;
      const sourceEventId = createSourceEventId(partId, measureIndex, sourceOrder);
      requireBoundedString(sourceEventId, 'sourceEventId', MAX_SOURCE_STRING_LENGTH, {
        measureIndex,
        sourceOrder,
      });
    }
  }

  return eventCount;
}

function projectParsedMusicXmlToPolyphonicSourceModel(parsedDocument, runtime = null) {
  const processing = resolveProcessingRuntime({}, runtime);
  processing.checkpoint('polyphonic-projector:start');
  validateParsedInput(parsedDocument);
  const validation = enforceMusicXmlSemanticResourceLimits(parsedDocument, processing);

  const effectiveMaxMeasures = Math.min(processing.budget.limits.maxMeasures, MAX_PROJECTED_MEASURES);
  const effectiveMaxEvents = Math.min(processing.budget.limits.maxEvents, MAX_PROJECTED_EVENTS);
  if (validation.measureCount > effectiveMaxMeasures) {
    throw invalid('Projected measure count exceeds the PA-1 output boundary.', {
      observed: validation.measureCount,
      limit: effectiveMaxMeasures,
    });
  }

  const partId = requireBoundedString(validation.partId, 'partId', MAX_SOURCE_STRING_LENGTH);
  const version = validation.version === null
    ? null
    : requireBoundedString(validation.version, 'musicXmlVersion', MAX_VERSION_LENGTH);
  const part = directChildren(parsedDocument.root, 'part')[0];
  const measureNodes = directChildren(part, 'measure');
  preflightProjectionOutputBounds(measureNodes, partId, effectiveMaxEvents, processing);

  const inherited = {
    divisions: null,
    timeSignature: null,
    staffCount: 1,
  };
  const measures = [];
  let totalEvents = 0;

  for (let measureIndex = 0; measureIndex < measureNodes.length; measureIndex += 1) {
    const measureNode = measureNodes[measureIndex];
    const rawNumber = getAttribute(measureNode, 'number');
    const measureNumber = requireBoundedString(
      rawNumber,
      'measure.number',
      MAX_SOURCE_STRING_LENGTH,
      { measureIndex },
    );
    const measureId = createMeasureId(partId, measureIndex);
    requireBoundedString(measureId, 'measureId', MAX_SOURCE_STRING_LENGTH, { measureIndex });
    const location = { measureIndex, measureNumber };
    processing.checkpoint('polyphonic-projector:measure', location);

    const state = {
      divisions: inherited.divisions,
      timeSignature: inherited.timeSignature
        ? { ...inherited.timeSignature }
        : null,
      staffCount: inherited.staffCount,
      seenDivisions: false,
      seenTime: false,
      seenStaves: false,
    };
    let timingStarted = false;
    let cursor = 0;
    const events = [];

    for (const child of measureNode.children) {
      if (child.uri !== measureNode.uri) {
        continue;
      }
      if (child.name === 'attributes') {
        applyMeasureAttributes(child, state, timingStarted, location);
        continue;
      }
      if (child.name === 'backup' || child.name === 'forward') {
        throw unsupported('backup-forward-cursor', location);
      }
      if (child.name !== 'note') {
        throw unsupported(`measure-child:${child.name}`, location);
      }

      timingStarted = true;
      if (!Number.isSafeInteger(state.divisions) || !state.timeSignature) {
        throw invalid('A valid divisions and time signature are required before source events.', location);
      }
      const expectedDuration = expectedDurationDivisions(
        state.divisions,
        state.timeSignature,
        location,
      );
      const sourceOrder = events.length;
      const sourceEventId = createSourceEventId(partId, measureIndex, sourceOrder);
      requireBoundedString(sourceEventId, 'sourceEventId', MAX_SOURCE_STRING_LENGTH, {
        measureIndex,
        sourceOrder,
      });
      processing.checkpoint('polyphonic-projector:event', {
        ...location,
        sourceOrder,
      });
      const projected = parseBasicNote(child, {
        partId,
        measureIndex,
        measureNumber,
        sourceOrder,
        cursor,
        expectedDuration,
        activeStaffCount: state.staffCount,
      });
      events.push(projected.event);
      cursor = projected.nextCursor;
      totalEvents += 1;
      if (totalEvents > effectiveMaxEvents) {
        throw invalid('Projected event count exceeds the PA-1 output boundary.', {
          observed: totalEvents,
          limit: effectiveMaxEvents,
          measureIndex,
          sourceOrder,
        });
      }
    }

    if (!Number.isSafeInteger(state.divisions) || !state.timeSignature) {
      throw invalid('Every projected measure requires resolved divisions and time signature.', location);
    }
    const expectedDuration = expectedDurationDivisions(
      state.divisions,
      state.timeSignature,
      location,
    );

    inherited.divisions = state.divisions;
    inherited.timeSignature = { ...state.timeSignature };
    inherited.staffCount = state.staffCount;

    measures.push({
      measureId,
      index: measureIndex,
      number: measureNumber,
      implicit: parseImplicit(measureNode, location),
      divisions: state.divisions,
      timeSignature: { ...state.timeSignature },
      expectedDurationDivisions: expectedDuration,
      events,
    });
  }

  const model = createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: {
      format: validation.format,
      musicXmlVersion: version,
      partId,
    },
    measureCount: measures.length,
    eventCount: totalEvents,
    measures,
  });
  processing.checkpoint('polyphonic-projector:complete');
  return model;
}

module.exports = {
  PolyphonicMusicXmlProjectorError,
  projectParsedMusicXmlToPolyphonicSourceModel,
};
