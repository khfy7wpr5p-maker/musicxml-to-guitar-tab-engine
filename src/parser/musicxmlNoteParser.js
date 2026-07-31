'use strict';

const { SaxesParser } = require('saxes');
const { pitchToMidi, PitchError } = require('../music/pitch');
const {
  MusicXmlValidationError,
  validateMusicXml,
} = require('../validation/musicxmlValidation');
const { XmlSafetyError, normalizeXmlInput } = require('../validation/xmlSafety');

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

class MusicXmlNoteParserError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MusicXmlNoteParserError';
    this.code = code;
    this.details = details;
  }
}

function parserError(message, code = 'INVALID_MUSICXML', details = {}) {
  return new MusicXmlNoteParserError(message, code, details);
}

function localName(tag) {
  return tag.local || tag.name;
}

function getAttribute(tag, expectedLocalName) {
  for (const attribute of Object.values(tag.attributes || {})) {
    const attributeName = attribute.local || attribute.name;
    if (attributeName === expectedLocalName && (!attribute.uri || attribute.uri.length === 0)) {
      return attribute.value;
    }
  }
  return undefined;
}

function pathMatches(elements, expectedPath) {
  return elements.length === expectedPath.length
    && expectedPath.every((name, index) => elements[index].name === name);
}

function parsePositiveInteger(value, field, location) {
  if (!/^\d+$/.test(value)) {
    throw parserError(`${field} must be a positive integer.`, 'INVALID_MUSICXML', location);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw parserError(`${field} must be a positive integer.`, 'INVALID_MUSICXML', location);
  }
  return parsed;
}

function parseInteger(value, field, location) {
  if (!/^-?\d+$/.test(value)) {
    throw parserError(`${field} must be an integer.`, 'INVALID_MUSICXML', location);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw parserError(`${field} must be a safe integer.`, 'INVALID_MUSICXML', location);
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
    throw parserError('Unsupported MusicXML rhythm type.', 'UNSUPPORTED_RHYTHM', { type });
  }

  if (!Number.isInteger(dots) || dots < 0 || dots > 3) {
    throw parserError('Only zero to three augmentation dots are supported.', 'UNSUPPORTED_RHYTHM', {
      dots,
    });
  }

  const dotDenominator = 2 ** dots;
  const dotNumerator = (2 ** (dots + 1)) - 1;
  const numerator = divisions * base.numerator * dotNumerator;
  const denominator = base.denominator * dotDenominator;

  if (numerator % denominator !== 0) {
    throw parserError(
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
    throw parserError(
      'Time signature cannot be represented by the active divisions value.',
      'INVALID_MUSICXML',
      { divisions, timeSignature },
    );
  }
  return numerator / timeSignature.beatType;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function parseMusicXmlNotes(input, options = {}) {
  const validation = validateMusicXml(input, options);
  const xml = normalizeXmlInput(input, options);
  const parser = new SaxesParser({ xmlns: true, position: true });
  const elements = [];
  const measures = [];

  let currentMeasure = null;
  let currentNote = null;
  let inheritedDivisions = null;
  let inheritedTimeSignature = null;
  let scoreVoice = null;

  function location(extra = {}) {
    return {
      measure: currentMeasure?.number ?? null,
      eventIndex: currentMeasure?.events.length ?? null,
      ...extra,
    };
  }

  function setTie(type) {
    if (type === 'start') {
      currentNote.tieStart = true;
    } else if (type === 'stop') {
      currentNote.tieStop = true;
    } else if (type !== 'continue') {
      throw parserError('Tie type must be start, stop or continue.', 'INVALID_MUSICXML', {
        ...location(),
        tieType: type,
      });
    } else {
      currentNote.tieStart = true;
      currentNote.tieStop = true;
    }
  }

  function finalizeNote() {
    if (!currentMeasure || !currentNote) {
      throw parserError('A note closed outside an active measure.');
    }

    const divisions = currentMeasure.divisions;
    if (!Number.isInteger(divisions)) {
      throw parserError('A divisions value is required before musical events.', 'INVALID_MUSICXML', location());
    }
    if (!currentMeasure.timeSignature) {
      throw parserError('A time signature is required before musical events.', 'INVALID_MUSICXML', location());
    }

    const duration = currentNote.duration;
    if (!Number.isInteger(duration) || duration <= 0) {
      throw parserError('Every note or rest must contain a positive duration.', 'INVALID_MUSICXML', location());
    }

    if (!currentNote.type) {
      throw parserError('Every note or rest must contain a rhythm type.', 'INVALID_MUSICXML', location());
    }

    const expectedDuration = expectedRhythmDuration(divisions, currentNote.type, currentNote.dots);
    if (duration !== expectedDuration) {
      throw parserError(
        'MusicXML duration does not match the note type and dots.',
        'INVALID_RHYTHM_DURATION',
        { ...location(), duration, expectedDuration, type: currentNote.type, dots: currentNote.dots },
      );
    }

    const voice = currentNote.voice ?? 1;
    if (!Number.isInteger(voice) || voice <= 0) {
      throw parserError('Voice must be a positive integer.', 'INVALID_MUSICXML', location());
    }
    if (scoreVoice === null) {
      scoreVoice = voice;
    } else if (scoreVoice !== voice) {
      throw parserError(
        'Multiple MusicXML voices are not supported by the monophonic parser.',
        'UNSUPPORTED_POLYPHONY',
        { ...location(), expectedVoice: scoreVoice, actualVoice: voice },
      );
    }

    const staff = currentNote.staff ?? 1;
    if (staff !== 1) {
      throw parserError(
        'Multiple MusicXML staves are not supported by the monophonic parser.',
        'UNSUPPORTED_MULTISTAFF',
        { ...location(), staff },
      );
    }

    const eventIndex = currentMeasure.events.length;
    const startDivisions = currentMeasure.cursor;
    const event = {
      eventId: `m${currentMeasure.index + 1}-e${eventIndex}`,
      eventIndex,
      type: currentNote.isRest ? 'rest' : 'note',
      voice,
      staff,
      start: {
        divisions: startDivisions,
        beats: startDivisions / divisions,
      },
      rhythm: {
        durationDivisions: duration,
        type: currentNote.type,
        dots: currentNote.dots,
        timeModification: null,
        tieStart: currentNote.tieStart,
        tieStop: currentNote.tieStop,
        beam: currentNote.beams
          .slice()
          .sort((left, right) => left.level - right.level),
      },
      selectedPosition: null,
      alternativePositions: [],
      confidence: 1,
      requiresTeacherReview: true,
      sourceLocation: {
        partId: validation.partId,
        measure: currentMeasure.number,
        noteIndex: eventIndex,
      },
      warnings: [],
    };

    if (!currentNote.isRest) {
      const { step, alter, octave } = currentNote.pitch;
      if (!step || !Number.isInteger(alter) || !Number.isInteger(octave)) {
        throw parserError('Note events must contain step, alter and octave pitch data.', 'INVALID_MUSICXML', location());
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
          throw parserError('MusicXML contains an invalid pitch.', 'INVALID_MUSICXML', {
            ...location(),
            step,
            alter,
            octave,
          });
        }
        throw error;
      }
    }

    currentMeasure.events.push(event);
    currentMeasure.cursor += duration;
    currentNote = null;
  }

  function finalizeMeasure() {
    if (!currentMeasure) {
      throw parserError('A measure closed without active state.');
    }
    if (!Number.isInteger(currentMeasure.divisions)) {
      throw parserError('Every parsed score must define divisions.', 'INVALID_MUSICXML', location());
    }
    if (!currentMeasure.timeSignature) {
      throw parserError('Every parsed score must define a time signature.', 'INVALID_MUSICXML', location());
    }

    const expectedDurationDivisions = expectedMeasureDuration(
      currentMeasure.divisions,
      currentMeasure.timeSignature,
    );
    const actualDurationDivisions = currentMeasure.cursor;

    if (actualDurationDivisions > expectedDurationDivisions) {
      throw parserError(
        'Measure duration exceeds the active time signature.',
        'INVALID_MEASURE_DURATION',
        { ...location(), expectedDurationDivisions, actualDurationDivisions },
      );
    }

    if (
      currentMeasure.events.length > 0
      && !currentMeasure.implicit
      && actualDurationDivisions !== expectedDurationDivisions
    ) {
      throw parserError(
        'Non-pickup measure duration does not match the active time signature.',
        'INVALID_MEASURE_DURATION',
        { ...location(), expectedDurationDivisions, actualDurationDivisions },
      );
    }

    const warnings = [];
    if (currentMeasure.events.length === 0) {
      warnings.push({
        code: 'EMPTY_MEASURE',
        message: 'Measure contains no note or rest events.',
        severity: 'warning',
        location: { measure: currentMeasure.number },
        details: {},
      });
    }

    const measure = {
      number: currentMeasure.number,
      index: currentMeasure.index,
      implicit: currentMeasure.implicit,
      timeSignature: cloneTimeSignature(currentMeasure.timeSignature),
      divisions: currentMeasure.divisions,
      expectedDurationDivisions,
      actualDurationDivisions,
      events: currentMeasure.events,
      warnings,
    };

    inheritedDivisions = currentMeasure.divisions;
    inheritedTimeSignature = cloneTimeSignature(currentMeasure.timeSignature);
    measures.push(measure);
    currentMeasure = null;
  }

  parser.on('error', (error) => {
    throw error;
  });

  parser.on('opentag', (tag) => {
    const name = localName(tag);

    if (name === 'measure' && pathMatches(elements, ['score-partwise', 'part'])) {
      const rawNumber = getAttribute(tag, 'number');
      if (typeof rawNumber !== 'string' || rawNumber.length === 0) {
        throw parserError('Every measure must have a non-empty number attribute.');
      }
      const rawImplicit = getAttribute(tag, 'implicit');
      if (rawImplicit !== undefined && rawImplicit !== 'yes' && rawImplicit !== 'no') {
        throw parserError('Measure implicit attribute must be yes or no.', 'INVALID_MUSICXML', {
          measure: rawNumber,
          implicit: rawImplicit,
        });
      }

      currentMeasure = {
        number: rawNumber,
        index: measures.length,
        implicit: rawImplicit === 'yes',
        divisions: inheritedDivisions,
        timeSignature: cloneTimeSignature(inheritedTimeSignature),
        declaredDivisions: false,
        declaredTimeSignature: false,
        pendingTimeSignature: null,
        cursor: 0,
        events: [],
      };
    } else if (name === 'note' && pathMatches(elements, ['score-partwise', 'part', 'measure'])) {
      if (!currentMeasure || currentNote) {
        throw parserError('Nested or misplaced note element.', 'INVALID_MUSICXML', location());
      }
      currentNote = {
        isRest: false,
        duration: null,
        type: null,
        dots: 0,
        voice: null,
        staff: null,
        tieStart: false,
        tieStop: false,
        beams: [],
        pitch: { step: null, alter: 0, octave: null },
      };
    } else if (
      (name === 'backup' || name === 'forward')
      && pathMatches(elements, ['score-partwise', 'part', 'measure'])
    ) {
      throw parserError(
        `${name} timing elements are not supported by the monophonic parser.`,
        'UNSUPPORTED_POLYPHONY',
        location(),
      );
    } else if (currentNote) {
      if (name === 'chord') {
        throw parserError('Chord events are not supported by the monophonic parser.', 'UNSUPPORTED_POLYPHONY', location());
      }
      if (name === 'grace') {
        throw parserError('Grace notes are not supported by the MVP parser.', 'UNSUPPORTED_GRACE_NOTE', location());
      }
      if (name === 'time-modification') {
        throw parserError('Tuplets are not supported by the MVP parser.', 'UNSUPPORTED_TUPLET', location());
      }
      if (name === 'rest' && pathMatches(elements, ['score-partwise', 'part', 'measure', 'note'])) {
        currentNote.isRest = true;
      }
      if (name === 'dot' && pathMatches(elements, ['score-partwise', 'part', 'measure', 'note'])) {
        currentNote.dots += 1;
      }
      if (name === 'tie' && pathMatches(elements, ['score-partwise', 'part', 'measure', 'note'])) {
        setTie(getAttribute(tag, 'type'));
      }
      if (
        name === 'tied'
        && pathMatches(elements, ['score-partwise', 'part', 'measure', 'note', 'notations'])
      ) {
        setTie(getAttribute(tag, 'type'));
      }
    }

    elements.push({ name, tag, text: '' });
  });

  parser.on('text', (text) => {
    if (elements.length > 0) {
      elements[elements.length - 1].text += text;
    }
  });

  parser.on('closetag', () => {
    const element = elements.pop();
    const text = element.text.trim();
    const parents = elements;

    if (currentNote) {
      if (element.name === 'duration' && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note'])) {
        currentNote.duration = parsePositiveInteger(text, 'duration', location());
      } else if (element.name === 'type' && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note'])) {
        if (!SUPPORTED_RHYTHM_TYPES[text]) {
          throw parserError('Unsupported MusicXML rhythm type.', 'UNSUPPORTED_RHYTHM', {
            ...location(),
            type: text,
          });
        }
        currentNote.type = text;
      } else if (element.name === 'voice' && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note'])) {
        currentNote.voice = parsePositiveInteger(text, 'voice', location());
      } else if (element.name === 'staff' && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note'])) {
        currentNote.staff = parsePositiveInteger(text, 'staff', location());
      } else if (
        element.name === 'step'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note', 'pitch'])
      ) {
        if (!/^[A-G]$/.test(text)) {
          throw parserError('Pitch step must be A through G.', 'INVALID_MUSICXML', location());
        }
        currentNote.pitch.step = text;
      } else if (
        element.name === 'alter'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note', 'pitch'])
      ) {
        currentNote.pitch.alter = parseInteger(text, 'alter', location());
      } else if (
        element.name === 'octave'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note', 'pitch'])
      ) {
        currentNote.pitch.octave = parseInteger(text, 'octave', location());
      } else if (
        element.name === 'beam'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'note'])
      ) {
        const level = parsePositiveInteger(getAttribute(element.tag, 'number') || '1', 'beam number', location());
        const beamValue = MUSICXML_BEAM_VALUES[text];
        if (!beamValue) {
          throw parserError('Unsupported beam value.', 'INVALID_MUSICXML', {
            ...location(),
            beam: text,
          });
        }
        if (currentNote.beams.some((beam) => beam.level === level)) {
          throw parserError('Beam levels must be unique within one note.', 'INVALID_MUSICXML', {
            ...location(),
            level,
          });
        }
        currentNote.beams.push({ level, value: beamValue });
      }
    }

    if (currentMeasure && !currentNote) {
      if (
        element.name === 'divisions'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'attributes'])
      ) {
        if (currentMeasure.cursor > 0) {
          throw parserError(
            'Mid-measure divisions changes are not supported.',
            'UNSUPPORTED_MID_MEASURE_ATTRIBUTES',
            location(),
          );
        }
        if (currentMeasure.declaredDivisions) {
          throw parserError('A measure may declare divisions only once.', 'INVALID_MUSICXML', location());
        }
        currentMeasure.divisions = parsePositiveInteger(text, 'divisions', location());
        currentMeasure.declaredDivisions = true;
      } else if (
        element.name === 'beats'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'attributes', 'time'])
      ) {
        currentMeasure.pendingTimeSignature ||= {};
        currentMeasure.pendingTimeSignature.beats = parsePositiveInteger(text, 'beats', location());
      } else if (
        element.name === 'beat-type'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'attributes', 'time'])
      ) {
        currentMeasure.pendingTimeSignature ||= {};
        currentMeasure.pendingTimeSignature.beatType = parsePositiveInteger(text, 'beat-type', location());
      } else if (
        element.name === 'staves'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'attributes'])
      ) {
        const staves = parsePositiveInteger(text, 'staves', location());
        if (staves !== 1) {
          throw parserError('Multiple staves are not supported.', 'UNSUPPORTED_MULTISTAFF', {
            ...location(),
            staves,
          });
        }
      } else if (
        element.name === 'time'
        && pathMatches(parents, ['score-partwise', 'part', 'measure', 'attributes'])
      ) {
        if (currentMeasure.cursor > 0) {
          throw parserError(
            'Mid-measure time signature changes are not supported.',
            'UNSUPPORTED_MID_MEASURE_ATTRIBUTES',
            location(),
          );
        }
        if (currentMeasure.declaredTimeSignature) {
          throw parserError('A measure may declare a time signature only once.', 'INVALID_MUSICXML', location());
        }
        const pending = currentMeasure.pendingTimeSignature;
        if (!pending || !pending.beats || !pending.beatType) {
          throw parserError('Time signature must contain beats and beat-type.', 'INVALID_MUSICXML', location());
        }
        currentMeasure.timeSignature = {
          beats: pending.beats,
          beatType: pending.beatType,
        };
        currentMeasure.pendingTimeSignature = null;
        currentMeasure.declaredTimeSignature = true;
      }
    }

    if (element.name === 'note' && pathMatches(parents, ['score-partwise', 'part', 'measure'])) {
      finalizeNote();
    } else if (element.name === 'measure' && pathMatches(parents, ['score-partwise', 'part'])) {
      finalizeMeasure();
    }
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (
      error instanceof MusicXmlNoteParserError
      || error instanceof MusicXmlValidationError
      || error instanceof XmlSafetyError
    ) {
      throw error;
    }
    throw new MusicXmlNoteParserError('XML is not well formed.', 'INVALID_XML');
  }

  if (measures.length !== validation.measureCount) {
    throw parserError('Parsed measure count does not match validated MusicXML structure.', 'INVALID_MUSICXML', {
      validatedMeasureCount: validation.measureCount,
      parsedMeasureCount: measures.length,
    });
  }

  return deepFreeze({
    format: validation.format,
    version: validation.version,
    partId: validation.partId,
    measureCount: measures.length,
    voiceCount: scoreVoice === null ? 0 : 1,
    measures,
  });
}

module.exports = {
  MusicXmlNoteParserError,
  parseMusicXmlNotes,
};
