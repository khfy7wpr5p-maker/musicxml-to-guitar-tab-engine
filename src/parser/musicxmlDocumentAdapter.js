'use strict';

const { EngineError } = require('../errors/engineError');
const { pitchToMidi, PitchError } = require('../music/pitch');

const SUPPORTED_RHYTHM_TYPES = Object.freeze({
  whole: Object.freeze({ numerator: 4, denominator: 1 }),
  half: Object.freeze({ numerator: 2, denominator: 1 }),
  quarter: Object.freeze({ numerator: 1, denominator: 1 }),
  eighth: Object.freeze({ numerator: 1, denominator: 2 }),
  '16th': Object.freeze({ numerator: 1, denominator: 4 }),
});

const MUSICXML_BEAM_VALUES = Object.freeze({
  begin: 'begin',
  continue: 'continue',
  end: 'end',
  'forward hook': 'forward-hook',
  'backward hook': 'backward-hook',
  'forward-hook': 'forward-hook',
  'backward-hook': 'backward-hook',
});

class MusicXmlDocumentAdapterError extends EngineError {
  constructor(message, code, details = {}, phase = 'content') {
    super(message, code, details, 'MusicXmlDocumentAdapterError');
    this.phase = phase;
  }
}

function structureError(message, code = 'INVALID_MUSICXML', details = {}) {
  return new MusicXmlDocumentAdapterError(message, code, details, 'structure');
}

function contentError(message, code = 'INVALID_MUSICXML', details = {}) {
  return new MusicXmlDocumentAdapterError(message, code, details, 'content');
}

function directChildren(node, name) {
  return node.children.filter(
    (child) => child.name === name && child.uri === node.uri,
  );
}

function firstDirectChild(node, name) {
  return node.children.find((child) => child.name === name) || null;
}

function lastDirectChild(node, name) {
  const matches = directChildren(node, name);
  return matches.length === 0 ? null : matches[matches.length - 1];
}

function descendants(node, name) {
  const matches = [];
  const stack = [...node.children].reverse();

  while (stack.length > 0) {
    const child = stack.pop();
    if (child.name === name) {
      matches.push(child);
    }
    for (let index = child.children.length - 1; index >= 0; index -= 1) {
      stack.push(child.children[index]);
    }
  }

  return matches;
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

function parsePositiveInteger(value, field, location) {
  if (!/^\d+$/.test(value)) {
    throw contentError(`${field} must be a positive integer.`, 'INVALID_MUSICXML', location);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw contentError(`${field} must be a positive integer.`, 'INVALID_MUSICXML', location);
  }
  return parsed;
}

function parseInteger(value, field, location) {
  if (!/^-?\d+$/.test(value)) {
    throw contentError(`${field} must be an integer.`, 'INVALID_MUSICXML', location);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw contentError(`${field} must be a safe integer.`, 'INVALID_MUSICXML', location);
  }
  return parsed;
}

function cloneTimeSignature(timeSignature) {
  return timeSignature
    ? { beats: timeSignature.beats, beatType: timeSignature.beatType }
    : null;
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

function expectedRhythmDuration(divisions, type, dots) {
  const base = SUPPORTED_RHYTHM_TYPES[type];
  if (!base) {
    throw contentError('Unsupported MusicXML rhythm type.', 'UNSUPPORTED_RHYTHM', { type });
  }

  if (!Number.isInteger(dots) || dots < 0 || dots > 3) {
    throw contentError(
      'Only zero to three augmentation dots are supported.',
      'UNSUPPORTED_RHYTHM',
      { dots },
    );
  }

  const dotDenominator = 2 ** dots;
  const dotNumerator = (2 ** (dots + 1)) - 1;
  const numerator = divisions * base.numerator * dotNumerator;
  const denominator = base.denominator * dotDenominator;

  if (numerator % denominator !== 0) {
    throw contentError(
      'Rhythm cannot be represented by the active divisions value.',
      'INVALID_RHYTHM_DURATION',
      { divisions, type, dots },
    );
  }

  return numerator / denominator;
}
function expectedMeasureDuration(divisions, timeSignature) {
  const numerator = divisions * timeSignature.beats * 4;
  if (numerator % timeSignature.beatType !== 0) {
    throw contentError(
      'Time signature cannot be represented by the active divisions value.',
      'INVALID_MUSICXML',
      { divisions, timeSignature },
    );
  }
  return numerator / timeSignature.beatType;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const stack = [value];
  const seen = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) {
      continue;
    }

    seen.add(current);
    for (const nested of Object.values(current)) {
      if (nested && typeof nested === 'object' && !seen.has(nested)) {
        stack.push(nested);
      }
    }
    Object.freeze(current);
  }

  return value;
}

function validateParsedMusicXmlStructure(parsedDocument) {
  const root = parsedDocument.root;
  const format = root.name;
  const version = getAttribute(root, 'version') || null;

  if (format === 'score-timewise') {
    throw structureError(
      'score-timewise MusicXML is not supported by the MVP.',
      'UNSUPPORTED_SCORE_FORMAT',
      { format },
    );
  }

  if (format !== 'score-partwise') {
    throw structureError(
      'MusicXML root element must be score-partwise.',
      'UNSUPPORTED_SCORE_FORMAT',
      { format },
    );
  }

  const partLists = directChildren(root, 'part-list');
  if (partLists.length !== 1) {
    throw structureError('MusicXML must contain exactly one direct part-list element.', 'INVALID_MUSICXML', {
      partListCount: partLists.length,
    });
  }

  const scoreParts = directChildren(partLists[0], 'score-part');
  const parts = directChildren(root, 'part');

  if (scoreParts.length > 1 || parts.length > 1) {
    throw structureError(
      'Multiple score parts are not supported by the MVP.',
      'UNSUPPORTED_MULTIPART_SCORE',
      { scorePartCount: scoreParts.length, partCount: parts.length },
    );
  }

  if (scoreParts.length !== 1 || parts.length !== 1) {
    throw structureError('MusicXML must define exactly one score-part and one part.', 'INVALID_MUSICXML', {
      scorePartCount: scoreParts.length,
      partCount: parts.length,
    });
  }

  const scorePartId = getAttribute(scoreParts[0], 'id');
  const partId = getAttribute(parts[0], 'id');

  if (typeof scorePartId !== 'string' || scorePartId.length === 0) {
    throw structureError('score-part must define a non-empty id attribute.');
  }
  if (typeof partId !== 'string' || partId.length === 0) {
    throw structureError('part must define a non-empty id attribute.');
  }
  if (partId !== scorePartId) {
    throw structureError('part id must match the score-part id.', 'INVALID_MUSICXML', {
      scorePartId,
      partId,
    });
  }

  const measures = directChildren(parts[0], 'measure');
  if (measures.length < 1) {
    throw structureError('The score part must contain at least one measure.', 'INVALID_MUSICXML', {
      measureCount: measures.length,
    });
  }

  return Object.freeze({
    format: 'score-partwise',
    version,
    partId,
    measureCount: measures.length,
  });
}

function setTie(noteState, type, location) {
  if (type === 'start') {
    noteState.tieStart = true;
  } else if (type === 'stop') {
    noteState.tieStop = true;
  } else if (type === 'continue') {
    noteState.tieStart = true;
    noteState.tieStop = true;
  } else {
    throw contentError('Tie type must be start, stop or continue.', 'INVALID_MUSICXML', {
      ...location,
      tieType: type,
    });
  }
}

function parseNote(noteNode, context) {
  const {
    validation,
    measure,
    scoreVoice,
  } = context;
  const location = {
    measure: measure.number,
    eventIndex: measure.events.length,
  };

  if (descendants(noteNode, 'chord').length > 0) {
    throw contentError(
      'Chord events are not supported by the monophonic parser.',
      'UNSUPPORTED_POLYPHONY',
      location,
    );
  }
  if (descendants(noteNode, 'grace').length > 0) {
    throw contentError(
      'Grace notes are not supported by the MVP parser.',
      'UNSUPPORTED_GRACE_NOTE',
      location,
    );
  }
  if (descendants(noteNode, 'time-modification').length > 0) {
    throw contentError(
      'Tuplets are not supported by the MVP parser.',
      'UNSUPPORTED_TUPLET',
      location,
    );
  }

  const rests = directChildren(noteNode, 'rest');
  const pitches = directChildren(noteNode, 'pitch');
  if ((rests.length === 1) === (pitches.length === 1)) {
    throw contentError(
      'Every note must contain exactly one rest or pitch element.',
      'INVALID_MUSICXML',
      {
        ...location,
        hasRest: rests.length > 0,
        hasPitch: pitches.length > 0,
      },
    );
  }
  if (rests.length > 1) {
    throw contentError('A note may contain only one rest element.', 'INVALID_MUSICXML', location);
  }
  if (pitches.length > 1) {
    throw contentError('A note may contain only one pitch element.', 'INVALID_MUSICXML', location);
  }

  const divisions = measure.divisions;
  if (!Number.isInteger(divisions)) {
    throw contentError(
      'A divisions value is required before musical events.',
      'INVALID_MUSICXML',
      location,
    );
  }
  if (!measure.timeSignature) {
    throw contentError(
      'A time signature is required before musical events.',
      'INVALID_MUSICXML',
      location,
    );
  }

  const durationNode = lastDirectChild(noteNode, 'duration');
  const duration = durationNode
    ? parsePositiveInteger(textOf(durationNode), 'duration', location)
    : null;
  if (!Number.isInteger(duration) || duration <= 0) {
    throw contentError(
      'Every note or rest must contain a positive duration.',
      'INVALID_MUSICXML',
      location,
    );
  }

  const typeNode = lastDirectChild(noteNode, 'type');
  const type = textOf(typeNode);
  if (!type) {
    throw contentError(
      'Every note or rest must contain a rhythm type.',
      'INVALID_MUSICXML',
      location,
    );
  }
  if (!SUPPORTED_RHYTHM_TYPES[type]) {
    throw contentError('Unsupported MusicXML rhythm type.', 'UNSUPPORTED_RHYTHM', {
      ...location,
      type,
    });
  }

  const dots = directChildren(noteNode, 'dot').length;
  const expectedDuration = expectedRhythmDuration(divisions, type, dots);
  if (duration !== expectedDuration) {
    throw contentError(
      'MusicXML duration does not match the note type and dots.',
      'INVALID_RHYTHM_DURATION',
      { ...location, duration, expectedDuration, type, dots },
    );
  }

  const voiceNode = lastDirectChild(noteNode, 'voice');
  const voice = voiceNode
    ? parsePositiveInteger(textOf(voiceNode), 'voice', location)
    : 1;
  if (scoreVoice.value === null) {
    scoreVoice.value = voice;
  } else if (scoreVoice.value !== voice) {
    throw contentError(
      'Multiple MusicXML voices are not supported by the monophonic parser.',
      'UNSUPPORTED_POLYPHONY',
      { ...location, expectedVoice: scoreVoice.value, actualVoice: voice },
    );
  }

  const staffNode = lastDirectChild(noteNode, 'staff');
  const staff = staffNode
    ? parsePositiveInteger(textOf(staffNode), 'staff', location)
    : 1;
  if (staff !== 1) {
    throw contentError(
      'Multiple MusicXML staves are not supported by the monophonic parser.',
      'UNSUPPORTED_MULTISTAFF',
      { ...location, staff },
    );
  }

  const noteState = { tieStart: false, tieStop: false };
  for (const tie of directChildren(noteNode, 'tie')) {
    setTie(noteState, getAttribute(tie, 'type'), location);
  }
  for (const notations of directChildren(noteNode, 'notations')) {
    for (const tied of directChildren(notations, 'tied')) {
      setTie(noteState, getAttribute(tied, 'type'), location);
    }
  }

  const beams = directChildren(noteNode, 'beam').map((beamNode) => {
    const level = parsePositiveInteger(
      getAttribute(beamNode, 'number') || '1',
      'beam number',
      location,
    );
    const rawValue = textOf(beamNode);
    const value = MUSICXML_BEAM_VALUES[rawValue];
    if (!value) {
      throw contentError('Unsupported beam value.', 'INVALID_MUSICXML', {
        ...location,
        beam: rawValue,
      });
    }
    return { level, value };
  });

  const beamLevels = new Set();
  for (const beam of beams) {
    if (beamLevels.has(beam.level)) {
      throw contentError('Beam levels must be unique within one note.', 'INVALID_MUSICXML', {
        ...location,
        level: beam.level,
      });
    }
    beamLevels.add(beam.level);
  }
  beams.sort((left, right) => left.level - right.level);

  const eventIndex = measure.events.length;
  const startDivisions = measure.cursor;
  const event = {
    eventId: `m${measure.index + 1}-e${eventIndex}`,
    eventIndex,
    type: rests.length === 1 ? 'rest' : 'note',
    voice,
    staff,
    start: {
      divisions: startDivisions,
      beats: startDivisions / divisions,
    },
    rhythm: {
      durationDivisions: duration,
      type,
      dots,
      timeModification: null,
      tieStart: noteState.tieStart,
      tieStop: noteState.tieStop,
      beam: beams,
    },
    selectedPosition: null,
    alternativePositions: [],
    confidence: 1,
    requiresTeacherReview: true,
    sourceLocation: {
      partId: validation.partId,
      measure: measure.number,
      noteIndex: eventIndex,
    },
    warnings: [],
  };

  if (event.type === 'note') {
    const pitchNode = pitches[0];
    const step = textOf(lastDirectChild(pitchNode, 'step'));
    const alterNode = lastDirectChild(pitchNode, 'alter');
    const octaveNode = lastDirectChild(pitchNode, 'octave');
    const alter = alterNode ? parseInteger(textOf(alterNode), 'alter', location) : 0;
    const octave = octaveNode ? parseInteger(textOf(octaveNode), 'octave', location) : null;

    if (!step || !Number.isInteger(alter) || !Number.isInteger(octave)) {
      throw contentError(
        'Note events must contain step, alter and octave pitch data.',
        'INVALID_MUSICXML',
        location,
      );
    }
    if (!/^[A-G]$/.test(step)) {
      throw contentError('Pitch step must be A through G.', 'INVALID_MUSICXML', location);
    }

    try {
      event.pitch = {
        step,
        alter,
        octave,
        written: writtenPitch(step, alter, octave),
        midi: pitchToMidi({ step, alter, octave }),
      };
    } catch (error) {
      if (error instanceof PitchError) {
        throw contentError('MusicXML contains an invalid pitch.', 'INVALID_MUSICXML', {
          ...location,
          step,
          alter,
          octave,
        });
      }
      throw error;
    }
  }

  measure.events.push(event);
  measure.cursor += duration;
}

function applyAttributes(attributesNode, measure) {
  const location = () => ({
    measure: measure.number,
    eventIndex: measure.events.length,
  });

  for (const child of attributesNode.children) {
    if (child.name === 'divisions') {
      if (measure.cursor > 0) {
        throw contentError(
          'Mid-measure divisions changes are not supported.',
          'UNSUPPORTED_MID_MEASURE_ATTRIBUTES',
          location(),
        );
      }
      if (measure.declaredDivisions) {
        throw contentError(
          'A measure may declare divisions only once.',
          'INVALID_MUSICXML',
          location(),
        );
      }
      measure.divisions = parsePositiveInteger(textOf(child), 'divisions', location());
      measure.declaredDivisions = true;
    } else if (child.name === 'time') {
      if (measure.cursor > 0) {
        throw contentError(
          'Mid-measure time signature changes are not supported.',
          'UNSUPPORTED_MID_MEASURE_ATTRIBUTES',
          location(),
        );
      }
      if (measure.declaredTimeSignature) {
        throw contentError(
          'A measure may declare a time signature only once.',
          'INVALID_MUSICXML',
          location(),
        );
      }
      const beatsNode = lastDirectChild(child, 'beats');
      const beatTypeNode = lastDirectChild(child, 'beat-type');
      if (!beatsNode || !beatTypeNode) {
        throw contentError(
          'Time signature must contain beats and beat-type.',
          'INVALID_MUSICXML',
          location(),
        );
      }
      measure.timeSignature = {
        beats: parsePositiveInteger(textOf(beatsNode), 'beats', location()),
        beatType: parsePositiveInteger(textOf(beatTypeNode), 'beat-type', location()),
      };
      measure.declaredTimeSignature = true;
    } else if (child.name === 'staves') {
      const staves = parsePositiveInteger(textOf(child), 'staves', location());
      if (staves !== 1) {
        throw contentError('Multiple staves are not supported.', 'UNSUPPORTED_MULTISTAFF', {
          ...location(),
          staves,
        });
      }
    }
  }
}

function finalizeMeasure(measure) {
  const location = {
    measure: measure.number,
    eventIndex: measure.events.length,
  };

  if (!Number.isInteger(measure.divisions)) {
    throw contentError(
      'Every parsed score must define divisions.',
      'INVALID_MUSICXML',
      location,
    );
  }
  if (!measure.timeSignature) {
    throw contentError(
      'Every parsed score must define a time signature.',
      'INVALID_MUSICXML',
      location,
    );
  }

  const expectedDurationDivisions = expectedMeasureDuration(
    measure.divisions,
    measure.timeSignature,
  );
  const actualDurationDivisions = measure.cursor;

  if (actualDurationDivisions > expectedDurationDivisions) {
    throw contentError(
      'Measure duration exceeds the active time signature.',
      'INVALID_MEASURE_DURATION',
      { ...location, expectedDurationDivisions, actualDurationDivisions },
    );
  }

  if (
    measure.events.length > 0
    && !measure.implicit
    && actualDurationDivisions !== expectedDurationDivisions
  ) {
    throw contentError(
      'Non-pickup measure duration does not match the active time signature.',
      'INVALID_MEASURE_DURATION',
      { ...location, expectedDurationDivisions, actualDurationDivisions },
    );
  }

  const warnings = [];
  if (measure.events.length === 0) {
    warnings.push({
      code: 'EMPTY_MEASURE',
      message: 'Measure contains no note or rest events.',
      severity: 'warning',
      location: { measure: measure.number },
      details: {},
    });
  }

  return {
    number: measure.number,
    index: measure.index,
    implicit: measure.implicit,
    timeSignature: cloneTimeSignature(measure.timeSignature),
    divisions: measure.divisions,
    expectedDurationDivisions,
    actualDurationDivisions,
    events: measure.events,
    warnings,
  };
}

function adaptParsedMusicXmlDocumentToNotes(parsedDocument) {
  const validation = validateParsedMusicXmlStructure(parsedDocument);
  const part = directChildren(parsedDocument.root, 'part')[0];
  const measureNodes = directChildren(part, 'measure');
  const measures = [];
  const scoreVoice = { value: null };

  let inheritedDivisions = null;
  let inheritedTimeSignature = null;

  for (const measureNode of measureNodes) {
    const rawNumber = getAttribute(measureNode, 'number');
    if (typeof rawNumber !== 'string' || rawNumber.length === 0) {
      throw contentError('Every measure must have a non-empty number attribute.');
    }

    const rawImplicit = getAttribute(measureNode, 'implicit');
    if (rawImplicit !== undefined && rawImplicit !== 'yes' && rawImplicit !== 'no') {
      throw contentError('Measure implicit attribute must be yes or no.', 'INVALID_MUSICXML', {
        measure: rawNumber,
        implicit: rawImplicit,
      });
    }

    const measure = {
      number: rawNumber,
      index: measures.length,
      implicit: rawImplicit === 'yes',
      divisions: inheritedDivisions,
      timeSignature: cloneTimeSignature(inheritedTimeSignature),
      declaredDivisions: false,
      declaredTimeSignature: false,
      cursor: 0,
      events: [],
    };

    for (const child of measureNode.children) {
      if (child.uri !== measureNode.uri) {
        continue;
      }
      if (child.name === 'attributes') {
        applyAttributes(child, measure);
      } else if (child.name === 'note') {
        parseNote(child, { validation, measure, scoreVoice });
      } else if (child.name === 'backup' || child.name === 'forward') {
        throw contentError(
          `${child.name} timing elements are not supported by the monophonic parser.`,
          'UNSUPPORTED_POLYPHONY',
          { measure: measure.number, eventIndex: measure.events.length },
        );
      }
    }

    const finalized = finalizeMeasure(measure);
    inheritedDivisions = finalized.divisions;
    inheritedTimeSignature = cloneTimeSignature(finalized.timeSignature);
    measures.push(finalized);
  }

  if (measures.length !== validation.measureCount) {
    throw contentError(
      'Parsed measure count does not match validated MusicXML structure.',
      'INVALID_MUSICXML',
      {
        validatedMeasureCount: validation.measureCount,
        parsedMeasureCount: measures.length,
      },
    );
  }

  return deepFreeze({
    format: validation.format,
    version: validation.version,
    partId: validation.partId,
    measureCount: measures.length,
    voiceCount: scoreVoice.value === null ? 0 : 1,
    measures,
  });
}

module.exports = {
  MusicXmlDocumentAdapterError,
  validateParsedMusicXmlStructure,
  adaptParsedMusicXmlDocumentToNotes,
};