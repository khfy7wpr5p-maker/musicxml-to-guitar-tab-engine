'use strict';

const { pitchToMidi } = require('../music/pitch');
const {
  createMeasureId,
  createSourceEventId,
} = require('../music/polyphonicSourceModel');
const { freezeObjectGraph } = require('./freezeObjectGraph');

const SOURCE_REVIEW_INDEX_VERSION = '1.0.0';
const SOURCE_REVIEW_INDEX_DOCUMENT_TYPE = 'SourceReviewIndex';
const MAX_INDEXED_EVENTS = 50_000;

function directChildren(node, name) {
  return node.children.filter((child) => child.uri === node.uri && child.name === name);
}

function attribute(node, name) {
  const matches = node.attributes.filter((item) => item.uri.length === 0 && item.name === name);
  return matches.length === 1 ? matches[0].value : null;
}

function scalarChildText(node, name) {
  const matches = directChildren(node, name);
  if (matches.length !== 1) return null;
  const child = matches[0];
  if (child.children.some((nested) => nested.uri === child.uri)) return null;
  return child.text.trim();
}

function positiveInteger(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function signedInteger(value) {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parsePitch(noteNode) {
  const pitchNodes = directChildren(noteNode, 'pitch');
  const restNodes = directChildren(noteNode, 'rest');
  if (restNodes.length === 1 && pitchNodes.length === 0) {
    return { eventKind: 'REST', pitch: null, uncertainty: [] };
  }
  if (pitchNodes.length !== 1 || restNodes.length !== 0) {
    return {
      eventKind: 'UNKNOWN',
      pitch: null,
      uncertainty: ['SOURCE_PITCH_UNKNOWN'],
    };
  }

  const pitchNode = pitchNodes[0];
  const step = scalarChildText(pitchNode, 'step');
  const octave = signedInteger(scalarChildText(pitchNode, 'octave'));
  const alterText = scalarChildText(pitchNode, 'alter');
  const alter = alterText === null ? 0 : signedInteger(alterText);
  if (!/^[A-G]$/.test(step || '') || octave === null || alter === null || alter < -2 || alter > 2) {
    return {
      eventKind: 'PITCHED_NOTE',
      pitch: null,
      uncertainty: ['SOURCE_PITCH_UNKNOWN'],
    };
  }

  try {
    const midi = pitchToMidi({ step, alter, octave });
    const accidental = ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' })[String(alter)];
    return {
      eventKind: 'PITCHED_NOTE',
      pitch: { step, alter, octave, written: `${step}${accidental}${octave}`, midi },
      uncertainty: [],
    };
  } catch {
    return {
      eventKind: 'PITCHED_NOTE',
      pitch: null,
      uncertainty: ['SOURCE_PITCH_UNKNOWN'],
    };
  }
}

function noteDuration(noteNode) {
  return positiveInteger(scalarChildText(noteNode, 'duration'));
}

function cursorDuration(node) {
  return positiveInteger(scalarChildText(node, 'duration'));
}

function simpleVoice(noteNode) {
  const value = scalarChildText(noteNode, 'voice');
  return value && value.length <= 64 ? value : '1';
}

function simpleStaff(noteNode) {
  const value = positiveInteger(scalarChildText(noteNode, 'staff'));
  return value === null ? 1 : value;
}

function tryCreateSourceReviewIndex(parsedDocument, sourceUploadSha256) {
  if (
    !parsedDocument
    || parsedDocument.documentType !== 'ParsedMusicXmlDocument'
    || parsedDocument.contractVersion !== '1.0.0'
    || typeof sourceUploadSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(sourceUploadSha256)
    || parsedDocument.root?.name !== 'score-partwise'
  ) return null;

  const parts = directChildren(parsedDocument.root, 'part');
  if (parts.length !== 1) return null;
  const part = parts[0];
  const partId = attribute(part, 'id');
  if (typeof partId !== 'string' || partId.length === 0 || partId.length > 256) return null;

  const entries = [];
  const measures = directChildren(part, 'measure');
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const measure = measures[measureIndex];
    const measureId = createMeasureId(partId, measureIndex);
    const measureNumber = attribute(measure, 'number');
    let cursor = 0;
    let cursorKnown = true;
    let previousNoteOnset = null;
    let sourceOrder = 0;

    for (const child of measure.children) {
      if (child.uri !== measure.uri) continue;
      if (child.name === 'backup' || child.name === 'forward') {
        const duration = cursorDuration(child);
        if (duration === null || !cursorKnown) {
          cursorKnown = false;
        } else if (child.name === 'backup') {
          if (duration > cursor) cursorKnown = false;
          else cursor -= duration;
        } else if (cursor > Number.MAX_SAFE_INTEGER - duration) {
          cursorKnown = false;
        } else {
          cursor += duration;
        }
        previousNoteOnset = null;
        continue;
      }
      if (child.name !== 'note') continue;
      if (entries.length >= MAX_INDEXED_EVENTS) return null;

      const sourceEventId = createSourceEventId(partId, measureIndex, sourceOrder);
      const chordNodes = directChildren(child, 'chord');
      const chordWithPrevious = chordNodes.length === 1;
      const onset = chordWithPrevious ? previousNoteOnset : (cursorKnown ? cursor : null);
      const duration = noteDuration(child);
      const parsedPitch = parsePitch(child);
      const uncertainty = [...parsedPitch.uncertainty];
      if (onset === null) uncertainty.push('SOURCE_ONSET_UNKNOWN');
      if (duration === null && parsedPitch.eventKind !== 'REST') uncertainty.push('SOURCE_DURATION_UNKNOWN');

      entries.push({
        eventKind: parsedPitch.eventKind,
        sourceUploadSha256,
        selectedPartId: partId,
        measureId,
        sourceEventId,
        knownPitchOrNull: parsedPitch.pitch,
        knownOnsetOrNull: onset,
        knownDurationOrNull: duration,
        evidenceLocation: {
          measure: measureNumber,
          measureIndex,
          sourceOrder,
          voice: simpleVoice(child),
          staff: simpleStaff(child),
        },
        uncertaintyReasonCodes: [...new Set(uncertainty)].sort((left, right) => left.localeCompare(right)),
      });

      previousNoteOnset = onset;
      if (!chordWithPrevious) {
        if (cursorKnown && duration !== null && cursor <= Number.MAX_SAFE_INTEGER - duration) {
          cursor += duration;
        } else {
          cursorKnown = false;
        }
      }
      sourceOrder += 1;
    }
  }

  return freezeObjectGraph({
    documentType: SOURCE_REVIEW_INDEX_DOCUMENT_TYPE,
    contractVersion: SOURCE_REVIEW_INDEX_VERSION,
    sourceUploadSha256,
    selectedPartId: partId,
    entries,
  });
}

module.exports = {
  SOURCE_REVIEW_INDEX_VERSION,
  SOURCE_REVIEW_INDEX_DOCUMENT_TYPE,
  tryCreateSourceReviewIndex,
};
