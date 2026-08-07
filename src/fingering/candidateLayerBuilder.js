'use strict';

const { EngineError } = require('../errors/engineError');
const {
  CANONICAL_MUSIC_DOCUMENT_VERSION,
} = require('../music/canonicalMusicDocument');
const { createGuitarConfiguration } = require('../guitar/tuning');
const { getPositionCandidates } = require('../guitar/fretboard');
const { PlayabilityError } = require('../guitar/playability');

const CANONICAL_FINGERING_CANDIDATES_VERSION = '1.0.0';

class CandidateLayerBuilderError extends EngineError {
  constructor(message, code, details = {}) {
    super(message, code, details, 'CandidateLayerBuilderError');
  }
}

function invalidCanonicalDocument(message, details = {}) {
  return new CandidateLayerBuilderError(
    message,
    'INVALID_CANONICAL_MUSIC_DOCUMENT',
    details,
  );
}

function invalidBuilderOptions(message, details = {}) {
  return new CandidateLayerBuilderError(
    message,
    'INVALID_CANDIDATE_BUILDER_OPTIONS',
    details,
  );
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkpoint(runtime, phase, location = {}) {
  if (runtime !== null && runtime !== undefined) {
    runtime.checkpoint(phase, location);
  }
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

function isDeeplyFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') {
    return true;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (!Object.isFrozen(value)) {
    return false;
  }
  return Object.values(value).every((nested) => isDeeplyFrozen(nested, seen));
}

function clonePlainData(value) {
  if (Array.isArray(value)) {
    return Array.from(value, clonePlainData);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, clonePlainData(nested)]),
    );
  }
  return value;
}

function requireNonEmptyString(value, field, details = {}) {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidCanonicalDocument(`${field} must be a non-empty string.`, details);
  }
  return value;
}

function validateCanonicalMusicDocument(canonicalDocument, runtime = null) {
  checkpoint(runtime, 'fingering:candidates:validate:start');

  if (!isObject(canonicalDocument)) {
    throw invalidCanonicalDocument('canonicalDocument must be an object.');
  }
  if (canonicalDocument.documentType !== 'CanonicalMusicDocument') {
    throw invalidCanonicalDocument(
      'canonicalDocument.documentType must be CanonicalMusicDocument.',
      { documentType: canonicalDocument.documentType },
    );
  }
  if (canonicalDocument.contractVersion !== CANONICAL_MUSIC_DOCUMENT_VERSION) {
    throw invalidCanonicalDocument(
      'canonicalDocument.contractVersion is not supported.',
      {
        expectedContractVersion: CANONICAL_MUSIC_DOCUMENT_VERSION,
        actualContractVersion: canonicalDocument.contractVersion,
      },
    );
  }
  if (!isDeeplyFrozen(canonicalDocument)) {
    throw invalidCanonicalDocument(
      'canonicalDocument must be the deeply frozen output of the canonical boundary.',
    );
  }

  requireNonEmptyString(canonicalDocument.partId, 'canonicalDocument.partId');
  if (!Number.isSafeInteger(canonicalDocument.measureCount) || canonicalDocument.measureCount < 1) {
    throw invalidCanonicalDocument('canonicalDocument.measureCount must be a positive integer.');
  }
  if (!Array.isArray(canonicalDocument.measures)) {
    throw invalidCanonicalDocument('canonicalDocument.measures must be an array.');
  }
  if (canonicalDocument.measures.length !== canonicalDocument.measureCount) {
    throw invalidCanonicalDocument(
      'canonicalDocument.measureCount must match measures.length.',
      {
        measureCount: canonicalDocument.measureCount,
        actualMeasureCount: canonicalDocument.measures.length,
      },
    );
  }

  const eventIds = new Set();
  for (let measureIndex = 0; measureIndex < canonicalDocument.measures.length; measureIndex += 1) {
    checkpoint(runtime, 'fingering:candidates:validate-measure', { measureIndex });

    if (!(measureIndex in canonicalDocument.measures)) {
      throw invalidCanonicalDocument('canonicalDocument.measures must not be sparse.', {
        measureIndex,
      });
    }
    const measure = canonicalDocument.measures[measureIndex];
    if (!isObject(measure)) {
      throw invalidCanonicalDocument('Every canonical measure must be an object.', {
        measureIndex,
      });
    }
    requireNonEmptyString(measure.measureKey, 'measure.measureKey', { measureIndex });
    if (measure.measureIndex !== measureIndex) {
      throw invalidCanonicalDocument('measure.measureIndex must match its array position.', {
        measureIndex,
        actualMeasureIndex: measure.measureIndex,
      });
    }
    if (!Array.isArray(measure.events)) {
      throw invalidCanonicalDocument('measure.events must be an array.', { measureIndex });
    }

    for (let eventIndex = 0; eventIndex < measure.events.length; eventIndex += 1) {
      checkpoint(runtime, 'fingering:candidates:validate-event', {
        measureIndex,
        eventIndex,
      });

      if (!(eventIndex in measure.events)) {
        throw invalidCanonicalDocument('measure.events must not be sparse.', {
          measureIndex,
          eventIndex,
        });
      }
      const event = measure.events[eventIndex];
      const location = { measureIndex, eventIndex };
      if (!isObject(event)) {
        throw invalidCanonicalDocument('Every canonical event must be an object.', location);
      }
      const eventId = requireNonEmptyString(event.eventId, 'event.eventId', location);
      if (eventIds.has(eventId)) {
        throw invalidCanonicalDocument('event.eventId values must be unique.', {
          ...location,
          eventId,
        });
      }
      eventIds.add(eventId);
      if (event.eventIndex !== eventIndex) {
        throw invalidCanonicalDocument('event.eventIndex must match its array position.', location);
      }
      if (event.measureKey !== measure.measureKey) {
        throw invalidCanonicalDocument('event.measureKey must match its containing measure.', location);
      }
      if (event.type !== 'note' && event.type !== 'rest') {
        throw invalidCanonicalDocument('event.type must be note or rest.', location);
      }
      if (!isObject(event.start) || !isObject(event.rhythm) || !isObject(event.sourceLocation)) {
        throw invalidCanonicalDocument(
          'Canonical events must contain start, rhythm and sourceLocation objects.',
          location,
        );
      }
      if (event.type === 'note') {
        if (!isObject(event.pitch)) {
          throw invalidCanonicalDocument('Note events must contain pitch data.', location);
        }
        if (!Number.isSafeInteger(event.pitch.midi) || event.pitch.midi < 0 || event.pitch.midi > 127) {
          throw invalidCanonicalDocument('event.pitch.midi must be an integer from 0 to 127.', {
            ...location,
            midi: event.pitch.midi,
          });
        }
        requireNonEmptyString(event.pitch.written, 'event.pitch.written', location);
      }
    }
  }

  checkpoint(runtime, 'fingering:candidates:validate:complete', {
    measureCount: canonicalDocument.measureCount,
  });
  return canonicalDocument;
}

function normalizeBuilderOptions(options) {
  if (!isObject(options)) {
    throw invalidBuilderOptions('options must be an object.');
  }
  const allowedFields = new Set(['tuning', 'minimumFret', 'maximumFret']);
  for (const field of Object.keys(options)) {
    if (!allowedFields.has(field)) {
      throw invalidBuilderOptions('options contains an unknown field.', { field });
    }
  }
  return createGuitarConfiguration(options);
}

function createNoteReference(event, measure) {
  return {
    eventId: event.eventId,
    eventIndex: event.eventIndex,
    measureKey: measure.measureKey,
    measureIndex: measure.measureIndex,
    visibleMeasureNumber: measure.visibleMeasureNumber,
    voice: event.voice,
    staff: event.staff,
    midi: event.pitch.midi,
    writtenPitch: event.pitch.written,
    start: clonePlainData(event.start),
    rhythm: clonePlainData(event.rhythm),
    sourceLocation: clonePlainData(event.sourceLocation),
  };
}

function buildCandidateLayers(canonicalDocument, options = {}, runtime = null) {
  checkpoint(runtime, 'fingering:candidates:start');
  validateCanonicalMusicDocument(canonicalDocument, runtime);
  const guitarConfiguration = normalizeBuilderOptions(options);
  const notes = [];
  const candidateLayers = [];

  for (const measure of canonicalDocument.measures) {
    checkpoint(runtime, 'fingering:candidates:measure', {
      measureIndex: measure.measureIndex,
      measureKey: measure.measureKey,
    });

    for (const event of measure.events) {
      checkpoint(runtime, 'fingering:candidates:event', {
        measureIndex: measure.measureIndex,
        measureKey: measure.measureKey,
        eventIndex: event.eventIndex,
        eventId: event.eventId,
      });

      if (event.type === 'rest') {
        continue;
      }

      const candidates = getPositionCandidates(event.pitch.midi, guitarConfiguration);
      if (candidates.length === 0) {
        throw new PlayabilityError(
          'The note is outside the configured guitar range.',
          'UNPLAYABLE_NOTE',
          {
            midi: event.pitch.midi,
            eventId: event.eventId,
            measureKey: measure.measureKey,
            measureIndex: measure.measureIndex,
            visibleMeasureNumber: measure.visibleMeasureNumber,
            eventIndex: event.eventIndex,
          },
        );
      }

      notes.push(createNoteReference(event, measure));
      candidateLayers.push(candidates.map((position) => ({
        string: position.string,
        fret: position.fret,
      })));
    }
  }

  checkpoint(runtime, 'fingering:candidates:complete', {
    noteCount: notes.length,
  });
  return deepFreeze({
    documentType: 'CanonicalFingeringCandidates',
    contractVersion: CANONICAL_FINGERING_CANDIDATES_VERSION,
    sourceDocumentType: canonicalDocument.documentType,
    sourceContractVersion: canonicalDocument.contractVersion,
    partId: canonicalDocument.partId,
    noteCount: notes.length,
    guitarConfiguration: clonePlainData(guitarConfiguration),
    notes,
    candidateLayers,
  });
}

module.exports = {
  CANONICAL_FINGERING_CANDIDATES_VERSION,
  CandidateLayerBuilderError,
  validateCanonicalMusicDocument,
  buildCandidateLayers,
};
