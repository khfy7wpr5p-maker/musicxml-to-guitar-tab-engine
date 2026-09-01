'use strict';

const { EngineError } = require('../errors/engineError');
const { pitchNameToMidi } = require('../music/pitch');
const {
  GUITAR_STRING_COUNT,
  MAX_ADJACENT_OPEN_STRING_INTERVAL,
  createGuitarConfiguration,
} = require('../guitar/tuning');

const MUSICXML_GUITAR_CONFIGURATION_PROVENANCE_VERSION = '1.0.0';

class MusicXmlGuitarConfigurationProvenanceError extends EngineError {
  constructor(message, code = 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', details = {}) {
    super(message, code, Object.freeze({ ...details }), 'MusicXmlGuitarConfigurationProvenanceError');
  }
}

function fail(message, code, details = {}) {
  throw new MusicXmlGuitarConfigurationProvenanceError(message, code, details);
}

function directChildren(node, name) {
  return node.children.filter((child) => child.name === name && child.uri === node.uri);
}

function attribute(node, name) {
  const matches = node.attributes.filter((item) => item.name === name && item.uri.length === 0);
  if (matches.length > 1) fail('Duplicate MusicXML attribute.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { element: node.name, attribute: name });
  return matches.length === 1 ? matches[0].value : undefined;
}

function integerText(node, path) {
  if (!node || node.children.length !== 0 || !/^-?\d+$/.test(node.text.trim())) {
    fail(`${path} must be an integer scalar.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path });
  }
  const value = Number.parseInt(node.text.trim(), 10);
  if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
    fail(`${path} is outside the safe integer range.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path });
  }
  return value;
}

function parseStaffTuning(node, path) {
  const lineText = attribute(node, 'line');
  if (lineText === undefined || !/^[1-6]$/.test(lineText)) {
    fail(`${path} requires line 1..6.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path, line: lineText ?? null });
  }
  if (node.attributes.some((item) => item.uri.length !== 0 || item.name !== 'line')) {
    fail(`${path} contains unsupported attributes.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path });
  }
  const children = node.children.filter((child) => child.uri === node.uri);
  if (children.some((child) => !['tuning-step', 'tuning-alter', 'tuning-octave'].includes(child.name))) {
    fail(`${path} contains unsupported children.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path });
  }
  const steps = directChildren(node, 'tuning-step');
  const alters = directChildren(node, 'tuning-alter');
  const octaves = directChildren(node, 'tuning-octave');
  if (steps.length !== 1 || alters.length > 1 || octaves.length !== 1) {
    fail(`${path} must contain step, optional alter and octave.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path });
  }
  const step = steps[0].text.trim();
  if (steps[0].children.length !== 0 || !/^[A-G]$/.test(step)) {
    fail(`${path}.tuning-step is invalid.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path });
  }
  const alter = alters.length === 0 ? 0 : integerText(alters[0], `${path}.tuning-alter`);
  if (alter < -2 || alter > 2) fail(`${path}.tuning-alter is out of bounds.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path, alter });
  const octave = integerText(octaves[0], `${path}.tuning-octave`);
  if (octave < 0 || octave > 9) fail(`${path}.tuning-octave is out of bounds.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path, octave });
  const accidental = ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' })[String(alter)];
  const pitch = `${step}${accidental}${octave}`;
  let midi;
  try { midi = pitchNameToMidi(pitch); } catch { fail(`${path} pitch is invalid.`, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { path, pitch }); }
  const line = Number(lineText);
  return { line, number: 7 - line, pitch, midi };
}

function validatePhysicalTuningOrder(tuning, location) {
  for (let index = 0; index < tuning.length - 1; index += 1) {
    const higherString = tuning[index];
    const lowerString = tuning[index + 1];
    const interval = higherString.midi - lowerString.midi;
    if (interval <= 0 || interval > MAX_ADJACENT_OPEN_STRING_INTERVAL) {
      fail(
        'MusicXML open-string pitches are physically inconsistent for the bounded six-string profile.',
        'INVALID_GUITAR_CONFIGURATION_PROVENANCE',
        {
          ...location,
          higherString: higherString.number,
          higherMidi: higherString.midi,
          lowerString: lowerString.number,
          lowerMidi: lowerString.midi,
          interval,
          maximumAdjacentInterval: MAX_ADJACENT_OPEN_STRING_INTERVAL,
        },
      );
    }
  }
}

function parseStaffDetails(node, location, inheritedConfiguration = null) {
  const tuningNodes = directChildren(node, 'staff-tuning');
  const capoNodes = directChildren(node, 'capo');
  if (tuningNodes.length === 0 && capoNodes.length === 0) return null;
  if (capoNodes.length > 1) {
    fail('Explicit MusicXML guitar configuration allows at most one capo.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { ...location, tuningCount: tuningNodes.length, capoCount: capoNodes.length });
  }
  const staffLinesNodes = directChildren(node, 'staff-lines');
  if (staffLinesNodes.length > 1) fail('Duplicate staff-lines is ambiguous.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', location);
  if (staffLinesNodes.length === 1 && integerText(staffLinesNodes[0], 'staff-details.staff-lines') !== 6) {
    fail('Explicit guitar configuration requires six staff lines.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', location);
  }
  if (tuningNodes.length === 0) {
    if (capoNodes.length !== 1 || !inheritedConfiguration) {
      fail(
        'Capo-only MusicXML guitar configuration requires a prior complete configuration on the same staff.',
        'INVALID_GUITAR_CONFIGURATION_PROVENANCE',
        { ...location, tuningCount: tuningNodes.length, capoCount: capoNodes.length },
      );
    }
    const capoFret = integerText(capoNodes[0], 'staff-details.capo');
    try {
      return createGuitarConfiguration({
        tuning: inheritedConfiguration.tuning,
        minimumFret: inheritedConfiguration.minimumFret,
        maximumFret: inheritedConfiguration.maximumFret,
        capoFret,
      });
    } catch (error) {
      fail(
        'MusicXML capo-only guitar configuration is internally inconsistent.',
        'INVALID_GUITAR_CONFIGURATION_PROVENANCE',
        { ...location, causeCode: error?.code || null },
      );
    }
  }
  if (tuningNodes.length !== GUITAR_STRING_COUNT) {
    fail(
      'Explicit MusicXML guitar tuning requires six staff-tuning elements.',
      'INVALID_GUITAR_CONFIGURATION_PROVENANCE',
      { ...location, tuningCount: tuningNodes.length, capoCount: capoNodes.length },
    );
  }
  const byLine = new Map();
  tuningNodes.forEach((tuningNode, index) => {
    const parsed = parseStaffTuning(tuningNode, `staff-details.staff-tuning[${index}]`);
    if (byLine.has(parsed.line)) fail('Duplicate staff-tuning line.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { ...location, line: parsed.line });
    byLine.set(parsed.line, parsed);
  });
  for (let line = 1; line <= 6; line += 1) if (!byLine.has(line)) fail('Missing staff-tuning line.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { ...location, line });
  const capoFret = capoNodes.length === 0 ? 0 : integerText(capoNodes[0], 'staff-details.capo');
  const tuning = [...byLine.values()].sort((a, b) => a.number - b.number).map(({ number, pitch, midi }) => ({ number, pitch, midi }));
  validatePhysicalTuningOrder(tuning, location);
  try { return createGuitarConfiguration({ tuning, capoFret }); } catch (error) {
    fail('MusicXML guitar configuration is internally inconsistent.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE', { ...location, causeCode: error?.code || null });
  }
}

function fingerprint(configuration) {
  return JSON.stringify({ capoFret: configuration.capoFret, tuning: configuration.tuning.map(({ number, pitch, midi }) => ({ number, pitch, midi })) });
}

function countTechnicalEvidence(root) {
  let count = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.name === 'technical' && (directChildren(node, 'string').length > 0 || directChildren(node, 'fret').length > 0)) count += 1;
    for (const child of node.children) stack.push(child);
  }
  return count;
}

function extractMusicXmlGuitarConfigurationProvenance(parsedDocument) {
  if (!parsedDocument || parsedDocument.documentType !== 'ParsedMusicXmlDocument' || !parsedDocument.root || parsedDocument.root.name !== 'score-partwise') {
    fail('Expected parsed score-partwise MusicXML.', 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  }
  const records = [];
  const latestConfigurationByStaff = new Map();
  const parts = directChildren(parsedDocument.root, 'part');
  parts.forEach((part, partIndex) => {
    const measures = directChildren(part, 'measure');
    measures.forEach((measure, measureIndex) => {
      let timingStarted = false;
      measure.children.forEach((child, childIndex) => {
        if (child.uri !== measure.uri) return;
        if (['note', 'backup', 'forward'].includes(child.name)) { timingStarted = true; return; }
        if (child.name !== 'attributes') return;
        directChildren(child, 'staff-details').forEach((staffDetails, staffDetailsIndex) => {
          const location = { partIndex, partId: attribute(part, 'id') || null, measureIndex, measureNumber: attribute(measure, 'number') || null, childIndex, staffDetailsIndex, staffNumber: attribute(staffDetails, 'number') || '1' };
          const staffKey = `${partIndex}:${location.staffNumber}`;
          const configuration = parseStaffDetails(
            staffDetails,
            location,
            latestConfigurationByStaff.get(staffKey) || null,
          );
          if (!configuration) return;
          latestConfigurationByStaff.set(staffKey, configuration);
          records.push(Object.freeze({
            ...location,
            afterSolveStart: measureIndex !== 0 || timingStarted,
            configuration,
            fingerprint: fingerprint(configuration),
          }));
        });
      });
    });
  });
  const technicalCount = countTechnicalEvidence(parsedDocument.root);
  if (records.length === 0) return Object.freeze({ documentType: 'MusicXmlGuitarConfigurationProvenance', contractVersion: MUSICXML_GUITAR_CONFIGURATION_PROVENANCE_VERSION, status: 'ABSENT', authority: 'SOURCE_CONFIGURATION_EVIDENCE_ONLY', configuration: null, recordCount: 0, records: Object.freeze([]), sourceTechnicalPositionEvidenceCount: technicalCount, sourceTechnicalPositionsAreSolverAuthority: false });

  if (records[0].afterSolveStart) {
    fail('Explicit guitar configuration first appears after the immutable solve scope begins.', 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE', records[0]);
  }
  const unique = new Set(records.map((record) => record.fingerprint));
  if (unique.size !== 1) {
    const hasLaterDeclaration = records.some((record) => record.afterSolveStart);
    fail(
      hasLaterDeclaration
        ? 'MusicXML changes explicit guitar configuration after the immutable solve scope begins.'
        : 'MusicXML contains conflicting explicit guitar configurations.',
      hasLaterDeclaration
        ? 'UNSUPPORTED_GUITAR_CONFIGURATION_CHANGE'
        : 'AMBIGUOUS_GUITAR_CONFIGURATION_PROVENANCE',
      { recordCount: records.length, uniqueConfigurationCount: unique.size },
    );
  }
  return Object.freeze({ documentType: 'MusicXmlGuitarConfigurationProvenance', contractVersion: MUSICXML_GUITAR_CONFIGURATION_PROVENANCE_VERSION, status: 'EXPLICIT', authority: 'SOURCE_CONFIGURATION_EVIDENCE_ONLY', configuration: records[0].configuration, recordCount: records.length, records: Object.freeze(records), sourceTechnicalPositionEvidenceCount: technicalCount, sourceTechnicalPositionsAreSolverAuthority: false });
}

module.exports = { MUSICXML_GUITAR_CONFIGURATION_PROVENANCE_VERSION, MusicXmlGuitarConfigurationProvenanceError, extractMusicXmlGuitarConfigurationProvenance };
