'use strict';

const { EngineError } = require('../errors/engineError');
const {
  createMeasureId,
  createSourceEventId,
  createPolyphonicSourceModel,
} = require('../music/polyphonicSourceModel');
const { createLeftHandShapeModel } = require('../music/leftHandShapeModel');
const { validatePhysicalPlayabilityV2 } = require('../music/physicalPlayabilityValidatorV2');
const {
  assertTeacherApprovedV11BenchmarkSemantics,
} = require('./teacherArrangementBenchmarkV11Semantics');
const {
  replayTeacherArrangementBenchmarkRuntime,
} = require('./teacherArrangementBenchmarkRuntimeReplay');

const TEACHER_ARRANGEMENT_BENCHMARK_V11_RUNTIME_REPLAY_VERSION = '1.1.0';

class TeacherArrangementBenchmarkV11RuntimeReplayError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_V11_RUNTIME_REPLAY',
      details,
      'TeacherArrangementBenchmarkV11RuntimeReplayError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkV11RuntimeReplayError(message, { field, ...details });
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
    Object.freeze(value);
  }
  return root;
}

function parseJson(text, field) {
  try {
    return JSON.parse(text);
  } catch {
    throw invalid(`${field} must contain valid JSON.`, field);
  }
}

function pitchFromMidi(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw invalid('Synthetic replay MIDI must be an integer from 0 through 127.', 'realizedTone.targetMidi', { midi });
  }
  const pitchClasses = [
    ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
    ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
  ];
  const [step, alter] = pitchClasses[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const accidental = alter === 1 ? '#' : '';
  return { step, alter, octave, midi, written: `${step}${accidental}${octave}` };
}

function createSyntheticRealizedSourceModel(realizedTones) {
  if (!Array.isArray(realizedTones) || realizedTones.length < 2 || realizedTones.length > 6) {
    throw invalid('REALIZED_VOICING physical replay requires 2 through 6 realized tones.', 'arrangement.realizedTones');
  }
  const events = realizedTones.map((tone, index) => ({
    sourceEventId: createSourceEventId('P1', 0, index),
    sourceOrder: index,
    type: 'note',
    voice: '1',
    staff: 1,
    onsetDivisions: 0,
    durationDivisions: 4,
    pitch: pitchFromMidi(tone.targetMidi),
    tieStart: false,
    tieStop: false,
    source: {
      partId: 'P1',
      measureIndex: 0,
      measureNumber: '1',
      noteIndex: index,
      chordWithPrevious: index > 0,
    },
  }));

  return createPolyphonicSourceModel({
    documentType: 'PolyphonicSourceModel',
    contractVersion: '1.0.0',
    source: {
      format: 'score-partwise',
      musicXmlVersion: null,
      partId: 'P1',
    },
    measureCount: 1,
    eventCount: events.length,
    measures: [{
      measureId: createMeasureId('P1', 0),
      index: 0,
      number: '1',
      implicit: false,
      divisions: 4,
      timeSignature: { beats: 4, beatType: 4 },
      expectedDurationDivisions: 16,
      events,
    }],
  });
}

function preserveSyntheticDecisions(realizedTones) {
  return realizedTones.map((tone, index) => ({
    decisionType: 'PRESERVED',
    sourceEventIds: [createSourceEventId('P1', 0, index)],
    sourceGroupId: null,
  }));
}

function expectedPositions(realizedTones) {
  return realizedTones.map((tone, index) => ({
    sourceEventId: createSourceEventId('P1', 0, index),
    targetMidi: tone.targetMidi,
    string: tone.string,
    fret: tone.fret,
  }));
}

function expectedFingerAssignments(realizedTones) {
  return realizedTones.map((tone, index) => ({
    sourceEventId: createSourceEventId('P1', 0, index),
    targetMidi: tone.targetMidi,
    string: tone.string,
    fret: tone.fret,
    finger: tone.finger,
  }));
}

function samePositions(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry, index) => (
      entry.sourceEventId === expected[index].sourceEventId
      && entry.targetMidi === expected[index].targetMidi
      && entry.string === expected[index].string
      && entry.fret === expected[index].fret
    ));
}

function sameFingerAssignments(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry, index) => (
      entry.sourceEventId === expected[index].sourceEventId
      && entry.targetMidi === expected[index].targetMidi
      && entry.string === expected[index].string
      && entry.fret === expected[index].fret
      && entry.finger === expected[index].finger
    ));
}

function sameBarres(actual, expected) {
  return Array.isArray(actual)
    && Array.isArray(expected)
    && actual.length === expected.length
    && actual.every((entry, index) => (
      entry.finger === expected[index].finger
      && entry.fret === expected[index].fret
      && entry.startString === expected[index].startString
      && entry.endString === expected[index].endString
      && entry.stringSpan === expected[index].stringSpan
      && entry.kind === expected[index].kind
    ));
}

function replayRealizedVoicingShapeEvaluation(arrangement) {
  if (!arrangement || arrangement.arrangementMode !== 'REALIZED_VOICING') {
    throw invalid('Evaluation physical replay requires a REALIZED_VOICING arrangement.', 'arrangement.arrangementMode');
  }
  if (!arrangement.selectedShape || !Array.isArray(arrangement.selectedShape.barres)) {
    throw invalid('REALIZED_VOICING requires selectedShape/barres for replay.', 'arrangement.selectedShape');
  }

  const sourceModel = createSyntheticRealizedSourceModel(arrangement.realizedTones);
  const decisions = preserveSyntheticDecisions(arrangement.realizedTones);
  let leftHand;
  let physical;
  try {
    leftHand = createLeftHandShapeModel(sourceModel, decisions);
    physical = validatePhysicalPlayabilityV2(sourceModel, decisions);
  } catch (error) {
    throw invalid('Synthetic realized-voicing replay failed in PA-8/PA-9.', 'arrangement', {
      causeCode: error && error.code,
    });
  }

  if (leftHand.groups.length !== 1 || physical.groups.length !== 1) {
    throw invalid('Synthetic realized tones must replay as exactly one simultaneous PA-8/PA-9 group.', 'arrangement.realizedTones');
  }

  const expectedPositionFacts = expectedPositions(arrangement.realizedTones);
  const expectedFingerFacts = expectedFingerAssignments(arrangement.realizedTones);
  const group = leftHand.groups[0];
  const voicing = group.voicingCandidates.find((entry) => samePositions(entry.positions, expectedPositionFacts));
  if (!voicing) {
    throw invalid('PA-8 did not reproduce the approved realized string/fret positions.', 'arrangement.realizedTones');
  }
  const shape = voicing.shapeCandidates.find((entry) => (
    sameFingerAssignments(entry.fingerAssignments, expectedFingerFacts)
    && sameBarres(entry.barres, arrangement.selectedShape.barres)
  ));
  if (!shape) {
    throw invalid('PA-8 did not reproduce the approved realized finger/barre shape.', 'arrangement.selectedShape');
  }

  const physicalGroup = physical.groups[0];
  const physicalVoicing = physicalGroup.voicingCandidates.find(
    (entry) => entry.voicingCandidateId === voicing.voicingCandidateId,
  );
  const verdict = physicalVoicing && physicalVoicing.shapeVerdicts.find(
    (entry) => entry.shapeCandidateId === shape.shapeCandidateId,
  );
  if (!verdict) {
    throw invalid('PA-9 did not return a verdict for the approved realized shape.', 'arrangement.selectedShape');
  }
  if (verdict.status !== 'PLAYABLE_WITHIN_POLICY' || verdict.reasonCodes.length !== 0) {
    throw invalid('Approved realized voicing is rejected by current PA-9 policy.', 'arrangement.selectedShape', {
      status: verdict.status,
      reasonCodes: [...verdict.reasonCodes],
    });
  }

  return deepFreeze({
    mode: 'REALIZED_VOICING_EVALUATION_REPLAY',
    arrangementId: arrangement.arrangementId,
    sourceGroupId: group.sourceGroupId,
    realizedToneCount: arrangement.realizedTones.length,
    runtimeVoicingCandidateId: voicing.voicingCandidateId,
    runtimeShapeCandidateId: shape.shapeCandidateId,
    status: verdict.status,
    reasonCodes: [...verdict.reasonCodes],
    authority: 'evaluation-only',
  });
}

function resolveBaselineReferenceEvidence(benchmarkCase, baselineReplayCase) {
  if (!baselineReplayCase) {
    throw invalid('Bound baseline runtime replay case is missing.', `case.${benchmarkCase.caseId}`);
  }
  const byArrangementId = new Map(
    baselineReplayCase.arrangements.map((entry) => [entry.arrangementId, entry]),
  );
  const arrangements = benchmarkCase.acceptedArrangements.map((reference) => {
    const evidence = byArrangementId.get(reference.baselineArrangementId);
    if (!evidence) {
      throw invalid('Baseline runtime replay did not contain the approved referenced arrangement.', `case.${benchmarkCase.caseId}.acceptedArrangements`);
    }
    return {
      arrangementId: reference.arrangementId,
      baselineArrangementId: reference.baselineArrangementId,
      status: evidence.status,
      replayedShapeCount: evidence.replayedShapeCount,
      shapes: evidence.shapes,
    };
  });
  return deepFreeze({
    mode: 'BASELINE_REFERENCE',
    sourceReplayStatus: baselineReplayCase.sourceReplayStatus,
    arrangements,
  });
}

function replayTeacherApprovedV11BenchmarkRuntime(input) {
  if (!input || typeof input !== 'object') {
    throw invalid('input must be an object.', 'input');
  }
  const {
    benchmarkText,
    approvalText,
    baselineText,
    reviewText,
    sourceEntries,
  } = input;

  let semanticEvidence;
  try {
    semanticEvidence = assertTeacherApprovedV11BenchmarkSemantics(
      benchmarkText,
      approvalText,
      baselineText,
      reviewText,
    );
  } catch (error) {
    throw invalid('Benchmark failed PA-11.3F/G admission or semantic validation.', 'input', {
      causeCode: error && error.code,
    });
  }

  const benchmark = parseJson(benchmarkText, 'benchmarkText');
  const baseline = parseJson(baselineText, 'baselineText');
  let baselineReplay;
  try {
    baselineReplay = replayTeacherArrangementBenchmarkRuntime({ benchmark: baseline, sourceEntries });
  } catch (error) {
    throw invalid('Bound MusicXML sources failed baseline PA-11.3D/E source/runtime replay.', 'sourceEntries', {
      causeCode: error && error.code,
      causeField: error && error.details && error.details.field,
    });
  }

  const baselineReplayByCase = new Map(baselineReplay.cases.map((entry) => [entry.caseId, entry]));
  const cases = benchmark.cases.map((benchmarkCase) => {
    const firstArrangement = benchmarkCase.acceptedArrangements[0];
    if (firstArrangement.arrangementMode === 'BASELINE_REFERENCE') {
      return {
        caseId: benchmarkCase.caseId,
        ...resolveBaselineReferenceEvidence(
          benchmarkCase,
          baselineReplayByCase.get(benchmarkCase.caseId),
        ),
      };
    }
    if (firstArrangement.arrangementMode === 'REALIZED_VOICING') {
      return {
        caseId: benchmarkCase.caseId,
        mode: 'REALIZED_VOICING',
        sourceReplayStatus: baselineReplayByCase.get(benchmarkCase.caseId).sourceReplayStatus,
        arrangements: [replayRealizedVoicingShapeEvaluation(firstArrangement)],
      };
    }
    throw invalid('Unsupported approved arrangement mode reached runtime replay.', `case.${benchmarkCase.caseId}.arrangementMode`);
  });

  return deepFreeze({
    documentType: 'TeacherArrangementBenchmarkV11RuntimeReplay',
    contractVersion: TEACHER_ARRANGEMENT_BENCHMARK_V11_RUNTIME_REPLAY_VERSION,
    mode: 'evaluation-runtime-replay',
    authority: 'evaluation-only',
    benchmarkId: semanticEvidence.benchmarkId,
    benchmarkVersion: semanticEvidence.benchmarkVersion,
    effectiveReviewStatus: semanticEvidence.effectiveReviewStatus,
    semanticStatus: semanticEvidence.semanticStatus,
    baselineRuntimeReplayContractVersion: baselineReplay.contractVersion,
    caseCount: cases.length,
    cases,
  });
}

module.exports = {
  TEACHER_ARRANGEMENT_BENCHMARK_V11_RUNTIME_REPLAY_VERSION,
  TeacherArrangementBenchmarkV11RuntimeReplayError,
  replayRealizedVoicingShapeEvaluation,
  replayTeacherApprovedV11BenchmarkRuntime,
};
