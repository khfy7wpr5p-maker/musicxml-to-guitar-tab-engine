'use strict';

const { createHash } = require('node:crypto');
const { EngineError } = require('../errors/engineError');
const {
  assertExactTeacherApprovedV11BenchmarkAdmission,
} = require('./teacherArrangementBenchmarkV11Admission');

const EXPECTED_BASELINE_GIT_BLOB_SHA = '81f921dee9e02f43ee3917ef81868e7300f796df';
const EXPECTED_REVIEW_GIT_BLOB_SHA = '8654cd68f1b8def22e38a501242afe22cf468322';
const STANDARD_TUNING = new Map([[1,64],[2,59],[3,55],[4,50],[5,45],[6,40]]);

class TeacherArrangementBenchmarkV11SemanticError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_V11_SEMANTICS',
      details,
      'TeacherArrangementBenchmarkV11SemanticError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkV11SemanticError(message, { field, ...details });
}

function gitBlobSha(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw invalid('Bound artifact text must be non-empty UTF-8 text.', 'boundText');
  }
  const bytes = Buffer.from(text, 'utf8');
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function parseJson(text, field) {
  try {
    return JSON.parse(text);
  } catch {
    throw invalid(`${field} must be valid JSON.`, field);
  }
}

function requireEqual(actual, expected, field) {
  if (actual !== expected) {
    throw invalid(`${field} does not match the required semantic value.`, field, { actual, expected });
  }
}

function requireArray(value, field, min = 0) {
  if (!Array.isArray(value) || value.length < min) {
    throw invalid(`${field} must be an array with at least ${min} entries.`, field);
  }
  return value;
}

function uniqueStrings(values, field) {
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) {
      throw invalid(`${field} must contain unique non-empty strings.`, field, { value });
    }
    seen.add(value);
  }
  return seen;
}

function byId(entries, key, field) {
  const map = new Map();
  for (const [index, entry] of requireArray(entries, field, 1).entries()) {
    if (!entry || typeof entry !== 'object') {
      throw invalid(`${field}[${index}] must be an object.`, `${field}[${index}]`);
    }
    const id = entry[key];
    if (typeof id !== 'string' || id.length === 0 || map.has(id)) {
      throw invalid(`${field} requires unique ${key} values.`, `${field}[${index}].${key}`);
    }
    map.set(id, entry);
  }
  return map;
}

function baselineSourceMidiByEvent(baselineCase) {
  const arrangements = requireArray(baselineCase.acceptedArrangements, 'baselineCase.acceptedArrangements', 1);
  const outcomes = requireArray(arrangements[0].noteOutcomes, 'baselineCase.acceptedArrangements[0].noteOutcomes', 1);
  const map = new Map();
  for (const outcome of outcomes) {
    if (map.has(outcome.sourceEventId)) {
      throw invalid('Baseline source event pitch identity must be unique.', 'baselineCase.noteOutcomes');
    }
    map.set(outcome.sourceEventId, outcome.sourceMidi);
  }
  return map;
}

function validateBaselineReferenceCase(candidateCase, baselineCase, field) {
  requireEqual(JSON.stringify(candidateCase.source), JSON.stringify(baselineCase.source), `${field}.source`);
  requireEqual(JSON.stringify(candidateCase.sourceSelection), JSON.stringify(baselineCase.sourceSelection), `${field}.sourceSelection`);
  const baselineIds = new Set(baselineCase.acceptedArrangements.map((entry) => entry.arrangementId));
  const arrangements = requireArray(candidateCase.acceptedArrangements, `${field}.acceptedArrangements`, 1);
  for (const [index, arrangement] of arrangements.entries()) {
    requireEqual(arrangement.arrangementMode, 'BASELINE_REFERENCE', `${field}.acceptedArrangements[${index}].arrangementMode`);
    requireEqual(arrangement.arrangementId, arrangement.baselineArrangementId, `${field}.acceptedArrangements[${index}].baselineArrangementId`);
    if (!baselineIds.has(arrangement.baselineArrangementId)) {
      throw invalid('Baseline reference must resolve to an accepted baseline arrangement.', `${field}.acceptedArrangements[${index}].baselineArrangementId`);
    }
  }
  requireEqual(candidateCase.preferredArrangementId, null, `${field}.preferredArrangementId`);
}

function validateRealizedVoicingCase(candidateCase, baselineCase, expectedLabel, expectedPositionCode, field) {
  requireEqual(JSON.stringify(candidateCase.source), JSON.stringify(baselineCase.source), `${field}.source`);
  requireEqual(JSON.stringify(candidateCase.sourceSelection), JSON.stringify(baselineCase.sourceSelection), `${field}.sourceSelection`);
  const sourceIds = requireArray(candidateCase.sourceSelection.sourceEventIds, `${field}.sourceSelection.sourceEventIds`, 1);
  uniqueStrings(sourceIds, `${field}.sourceSelection.sourceEventIds`);
  const arrangements = requireArray(candidateCase.acceptedArrangements, `${field}.acceptedArrangements`, 1);
  requireEqual(arrangements.length, 1, `${field}.acceptedArrangements.length`);
  const arrangement = arrangements[0];
  requireEqual(arrangement.arrangementMode, 'REALIZED_VOICING', `${field}.arrangementMode`);
  requireEqual(arrangement.decision.decisionType, 'REVOICED', `${field}.decision.decisionType`);
  requireEqual(JSON.stringify(arrangement.decision.supportingDecisionTypes), JSON.stringify(['VOICE_REDISTRIBUTED']), `${field}.decision.supportingDecisionTypes`);
  requireEqual(JSON.stringify(arrangement.decision.sourceEventIds), JSON.stringify(sourceIds), `${field}.decision.sourceEventIds`);
  requireEqual(arrangement.decision.sourceGroupId, 'P1:measure:0:simultaneous:0', `${field}.decision.sourceGroupId`);

  const sourceMidi = baselineSourceMidiByEvent(baselineCase);
  const mappings = requireArray(arrangement.sourceMappings, `${field}.sourceMappings`, sourceIds.length);
  requireEqual(mappings.length, sourceIds.length, `${field}.sourceMappings.length`);
  requireEqual(JSON.stringify(mappings.map((entry) => entry.sourceEventId)), JSON.stringify(sourceIds), `${field}.sourceMappings.order`);

  const tones = requireArray(arrangement.realizedTones, `${field}.realizedTones`, 1);
  const toneById = byId(tones, 'realizedToneId', `${field}.realizedTones`);
  const mappedToneIds = [];
  let oneToManyObserved = false;
  for (const [index, mapping] of mappings.entries()) {
    requireEqual(mapping.sourceMidi, sourceMidi.get(mapping.sourceEventId), `${field}.sourceMappings[${index}].sourceMidi`);
    const toneIds = requireArray(mapping.realizedToneIds, `${field}.sourceMappings[${index}].realizedToneIds`, 1);
    uniqueStrings(toneIds, `${field}.sourceMappings[${index}].realizedToneIds`);
    if (toneIds.length > 1) oneToManyObserved = true;
    for (const toneId of toneIds) {
      const tone = toneById.get(toneId);
      if (!tone) {
        throw invalid('Every mapped realized tone must exist.', `${field}.sourceMappings[${index}].realizedToneIds`, { toneId });
      }
      requireEqual(tone.sourceEventId, mapping.sourceEventId, `${field}.realizedTones.${toneId}.sourceEventId`);
      if (((tone.targetMidi - mapping.sourceMidi) % 12 + 12) % 12 !== 0) {
        throw invalid('Realized tone must preserve source pitch class.', `${field}.realizedTones.${toneId}.targetMidi`);
      }
      mappedToneIds.push(toneId);
    }
  }
  requireEqual(oneToManyObserved, true, `${field}.sourceMappings.oneToManyObserved`);
  requireEqual(JSON.stringify([...mappedToneIds].sort()), JSON.stringify([...toneById.keys()].sort()), `${field}.sourceMappings.coverage`);
  uniqueStrings(mappedToneIds, `${field}.sourceMappings.globalToneCoverage`);

  const shape = arrangement.selectedShape;
  if (!shape || typeof shape !== 'object') {
    throw invalid('REALIZED_VOICING requires selectedShape.', `${field}.selectedShape`);
  }
  requireEqual(shape.label, expectedLabel, `${field}.selectedShape.label`);
  requireEqual(shape.positionCode, expectedPositionCode, `${field}.selectedShape.positionCode`);
  requireEqual(shape.physicalStatus, 'PLAYABLE_WITHIN_POLICY', `${field}.selectedShape.physicalStatus`);
  requireEqual(JSON.stringify(shape.realizedToneIds), JSON.stringify(tones.map((tone) => tone.realizedToneId)), `${field}.selectedShape.realizedToneIds`);

  const shapeStrings = requireArray(shape.strings, `${field}.selectedShape.strings`, 6);
  requireEqual(shapeStrings.length, 6, `${field}.selectedShape.strings.length`);
  const seenShapeStrings = new Set();
  const soundedByString = new Map();
  for (const [index, entry] of shapeStrings.entries()) {
    if (!Number.isInteger(entry.string) || entry.string < 1 || entry.string > 6 || seenShapeStrings.has(entry.string)) {
      throw invalid('Selected shape must contain each guitar string at most once.', `${field}.selectedShape.strings[${index}].string`);
    }
    seenShapeStrings.add(entry.string);
    if (entry.state === 'SOUNDED') soundedByString.set(entry.string, entry);
    else if (entry.state !== 'MUTED') throw invalid('Shape string state must be SOUNDED or MUTED.', `${field}.selectedShape.strings[${index}].state`);
  }
  requireEqual(seenShapeStrings.size, 6, `${field}.selectedShape.strings.membership`);

  const usedStrings = new Set();
  const fretted = [];
  for (const [index, tone] of tones.entries()) {
    if (!Number.isInteger(tone.string) || tone.string < 1 || tone.string > 6 || usedStrings.has(tone.string)) {
      throw invalid('Realized tones must use distinct valid strings.', `${field}.realizedTones[${index}].string`);
    }
    usedStrings.add(tone.string);
    if (!Number.isInteger(tone.fret) || tone.fret < 0 || tone.fret > 20) {
      throw invalid('Realized tone fret is outside the approved guitar boundary.', `${field}.realizedTones[${index}].fret`);
    }
    requireEqual(STANDARD_TUNING.get(tone.string) + tone.fret, tone.targetMidi, `${field}.realizedTones[${index}].targetMidi`);
    if (tone.fret === 0) requireEqual(tone.finger, 0, `${field}.realizedTones[${index}].finger`);
    else {
      if (!Number.isInteger(tone.finger) || tone.finger < 1 || tone.finger > 4) {
        throw invalid('Fretted realized tone requires finger 1..4.', `${field}.realizedTones[${index}].finger`);
      }
      fretted.push(tone);
    }
    const shapeEntry = soundedByString.get(tone.string);
    if (!shapeEntry) throw invalid('Every realized tone must be present in the selected shape.', `${field}.realizedTones[${index}].string`);
    requireEqual(shapeEntry.fret, tone.fret, `${field}.selectedShape.string${tone.string}.fret`);
    requireEqual(shapeEntry.finger, tone.finger, `${field}.selectedShape.string${tone.string}.finger`);
    requireEqual(shapeEntry.midi, tone.targetMidi, `${field}.selectedShape.string${tone.string}.midi`);
  }
  requireEqual(usedStrings.size, soundedByString.size, `${field}.selectedShape.soundedCoverage`);
  for (const lower of fretted) {
    for (const higher of fretted) {
      if (lower.fret < higher.fret && !(lower.finger < higher.finger)) {
        throw invalid('Finger order must increase with fret in the approved static shape.', `${field}.realizedTones.fingerOrder`);
      }
    }
  }
  requireEqual(candidateCase.preferredArrangementId, null, `${field}.preferredArrangementId`);
}

function validateTeacherArrangementBenchmarkV11Semantics(benchmark, baseline, review) {
  const cases = byId(benchmark.cases, 'caseId', 'benchmark.cases');
  const baselineCases = byId(baseline.cases, 'caseId', 'baseline.cases');
  requireEqual(cases.size, 4, 'benchmark.cases.length');
  requireEqual(cases.size, baselineCases.size, 'benchmark.cases.baselineCoverage');

  requireEqual(benchmark.baseBenchmark.gitBlobSha, EXPECTED_BASELINE_GIT_BLOB_SHA, 'benchmark.baseBenchmark.gitBlobSha');
  requireEqual(benchmark.reviewRecord.gitBlobSha, EXPECTED_REVIEW_GIT_BLOB_SHA, 'benchmark.reviewRecord.gitBlobSha');
  requireEqual(review.reviewRecordId, benchmark.reviewRecord.reviewRecordId, 'review.reviewRecordId');

  const case1 = cases.get('pa11-seed-001-two-note-open-vs-barre');
  const case2 = cases.get('pa11-seed-002-three-note-voicing');
  const case3 = cases.get('pa11-seed-003-conservative-reduction');
  const case4 = cases.get('pa11-seed-004-octave-displacement');
  if (!case1 || !case2 || !case3 || !case4) throw invalid('Expected four canonical PA-11 cases.', 'benchmark.cases');

  validateBaselineReferenceCase(case1, baselineCases.get(case1.caseId), 'benchmark.case1');
  validateRealizedVoicingCase(case2, baselineCases.get(case2.caseId), 'C', 'x32010', 'benchmark.case2');
  validateRealizedVoicingCase(case3, baselineCases.get(case3.caseId), 'Cmaj7', 'x32000', 'benchmark.case3');
  validateBaselineReferenceCase(case4, baselineCases.get(case4.caseId), 'benchmark.case4');

  return true;
}

function assertTeacherApprovedV11BenchmarkSemantics(benchmarkText, approvalText, baselineText, reviewText) {
  const admission = assertExactTeacherApprovedV11BenchmarkAdmission(benchmarkText, approvalText);
  requireEqual(gitBlobSha(baselineText), EXPECTED_BASELINE_GIT_BLOB_SHA, 'baselineText.gitBlobSha');
  requireEqual(gitBlobSha(reviewText), EXPECTED_REVIEW_GIT_BLOB_SHA, 'reviewText.gitBlobSha');
  const benchmark = parseJson(benchmarkText, 'benchmarkText');
  const baseline = parseJson(baselineText, 'baselineText');
  const review = parseJson(reviewText, 'reviewText');
  validateTeacherArrangementBenchmarkV11Semantics(benchmark, baseline, review);
  return Object.freeze({
    ...admission,
    semanticStatus: 'VALIDATED',
    baselineGitBlobSha: EXPECTED_BASELINE_GIT_BLOB_SHA,
    reviewGitBlobSha: EXPECTED_REVIEW_GIT_BLOB_SHA,
  });
}

module.exports = {
  EXPECTED_BASELINE_GIT_BLOB_SHA,
  EXPECTED_REVIEW_GIT_BLOB_SHA,
  TeacherArrangementBenchmarkV11SemanticError,
  assertTeacherApprovedV11BenchmarkSemantics,
  validateTeacherArrangementBenchmarkV11Semantics,
};
