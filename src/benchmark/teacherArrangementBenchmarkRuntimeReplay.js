'use strict';

const { EngineError } = require('../errors/engineError');
const { parseParsedMusicXmlDocument } = require('../parser/parsedMusicXmlDocument');
const { createMusicXmlProcessingRuntime } = require('../parser/musicxmlSemanticResourceLimits');
const { projectParsedMusicXmlToPolyphonicSourceModel } = require('../parser/polyphonicMusicXmlProjector');
const { createLeftHandShapeModel } = require('../music/leftHandShapeModel');
const { validatePhysicalPlayabilityV2 } = require('../music/physicalPlayabilityValidatorV2');
const { replayTeacherArrangementBenchmarkSources } = require('./teacherArrangementBenchmarkSourceReplay');

const TEACHER_ARRANGEMENT_BENCHMARK_RUNTIME_REPLAY_VERSION = '1.0.0';

class TeacherArrangementBenchmarkRuntimeReplayError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_TEACHER_ARRANGEMENT_BENCHMARK_RUNTIME_REPLAY',
      details,
      'TeacherArrangementBenchmarkRuntimeReplayError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new TeacherArrangementBenchmarkRuntimeReplayError(message, { field, ...details });
}

function deepFreeze(root) {
  const pending = [root];
  const seen = new WeakSet();
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) {
      continue;
    }
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) {
        pending.push(descriptor.value);
      }
    }
    Object.freeze(value);
  }
  return root;
}

function buildSourceModel(sourceText, caseIndex) {
  try {
    const runtime = createMusicXmlProcessingRuntime();
    const parsed = parseParsedMusicXmlDocument(sourceText, {}, runtime);
    return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
  } catch (error) {
    throw invalid(
      'Bound source could not be replayed through the PA-2 parser/projector path.',
      `sourceEntries[${caseIndex}].sourceText`,
      { causeCode: error && error.code },
    );
  }
}

function rawArrangementDecisions(arrangement) {
  return arrangement.decisions.map((decision) => ({
    decisionType: decision.decisionType,
    sourceEventIds: decision.sourceEventIds,
    sourceGroupId: decision.sourceGroupId,
  }));
}

function samePositions(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const left = actual[index];
    const right = expected[index];
    if (
      left.sourceEventId !== right.sourceEventId
      || left.targetMidi !== right.targetMidi
      || left.string !== right.string
      || left.fret !== right.fret
    ) {
      return false;
    }
  }
  return true;
}

function sameFingerAssignments(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const left = actual[index];
    const right = expected[index];
    if (
      left.sourceEventId !== right.sourceEventId
      || left.targetMidi !== right.targetMidi
      || left.string !== right.string
      || left.fret !== right.fret
      || left.finger !== right.finger
    ) {
      return false;
    }
  }
  return true;
}

function sameBarres(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const left = actual[index];
    const right = expected[index];
    if (
      left.finger !== right.finger
      || left.fret !== right.fret
      || left.startString !== right.startString
      || left.endString !== right.endString
      || left.stringSpan !== right.stringSpan
      || left.kind !== right.kind
    ) {
      return false;
    }
  }
  return true;
}

function replayArrangement(benchmarkCase, arrangement, sourceModel, caseIndex, arrangementIndex) {
  const field = `cases[${caseIndex}].acceptedArrangements[${arrangementIndex}]`;
  if (arrangement.selectedShapes.length === 0) {
    return {
      arrangementId: arrangement.arrangementId,
      selectedShapeCount: 0,
      replayedShapeCount: 0,
      status: 'NO_SELECTED_MULTI_NOTE_SHAPE',
      shapes: [],
    };
  }

  const decisions = rawArrangementDecisions(arrangement);
  let leftHand;
  let validation;
  try {
    leftHand = createLeftHandShapeModel(sourceModel, decisions);
    validation = validatePhysicalPlayabilityV2(sourceModel, decisions);
  } catch (error) {
    throw invalid('PA-8/PA-9 runtime replay failed before shape comparison.', field, {
      causeCode: error && error.code,
    });
  }

  const shapes = [];
  for (let shapeIndex = 0; shapeIndex < arrangement.selectedShapes.length; shapeIndex += 1) {
    const expectedShape = arrangement.selectedShapes[shapeIndex];
    const shapeField = `${field}.selectedShapes[${shapeIndex}]`;
    const group = leftHand.groups.find((entry) => entry.sourceGroupId === expectedShape.sourceGroupId);
    if (!group) {
      throw invalid('PA-8 replay did not reproduce the expected source group.', `${shapeField}.sourceGroupId`);
    }

    const voicing = group.voicingCandidates.find((entry) => samePositions(entry.positions, expectedShape.positions));
    if (!voicing) {
      throw invalid('PA-8 replay did not reproduce the expected selected positions.', `${shapeField}.positions`);
    }

    const shape = voicing.shapeCandidates.find((entry) => (
      sameFingerAssignments(entry.fingerAssignments, expectedShape.fingerAssignments)
      && sameBarres(entry.barres, expectedShape.barres)
    ));
    if (!shape) {
      throw invalid('PA-8 replay did not reproduce the expected finger/barre shape.', `${shapeField}.fingerAssignments`);
    }

    const validationGroup = validation.groups.find((entry) => entry.sourceGroupId === expectedShape.sourceGroupId);
    const validationVoicing = validationGroup && validationGroup.voicingCandidates.find(
      (entry) => entry.voicingCandidateId === voicing.voicingCandidateId,
    );
    const verdict = validationVoicing && validationVoicing.shapeVerdicts.find(
      (entry) => entry.shapeCandidateId === shape.shapeCandidateId,
    );
    if (!verdict) {
      throw invalid('PA-9 replay did not return a verdict for the reproduced shape.', shapeField);
    }
    if (verdict.status !== 'PLAYABLE_WITHIN_POLICY' || verdict.reasonCodes.length !== 0) {
      throw invalid('Teacher benchmark selected shape is rejected by current PA-9 policy.', shapeField, {
        status: verdict.status,
        reasonCodes: [...verdict.reasonCodes],
      });
    }

    shapes.push({
      benchmarkShapeId: expectedShape.shapeId,
      sourceGroupId: expectedShape.sourceGroupId,
      runtimeVoicingCandidateId: voicing.voicingCandidateId,
      runtimeShapeCandidateId: shape.shapeCandidateId,
      status: verdict.status,
      reasonCodes: [...verdict.reasonCodes],
    });
  }

  return {
    arrangementId: arrangement.arrangementId,
    selectedShapeCount: arrangement.selectedShapes.length,
    replayedShapeCount: shapes.length,
    status: 'RUNTIME_REPLAY_MATCH',
    shapes,
  };
}

function replayTeacherArrangementBenchmarkRuntime(input) {
  let sourceReplay;
  try {
    sourceReplay = replayTeacherArrangementBenchmarkSources(input);
  } catch (error) {
    throw invalid('Benchmark failed PA-11.3D source replay before runtime physical replay.', 'input', {
      causeCode: error && error.code,
      causeField: error && error.details && error.details.field,
    });
  }

  const { benchmark, sourceEntries } = input;
  const cases = [];
  let selectedShapeReplayCount = 0;

  for (let caseIndex = 0; caseIndex < benchmark.cases.length; caseIndex += 1) {
    const benchmarkCase = benchmark.cases[caseIndex];
    const sourceModel = buildSourceModel(sourceEntries[caseIndex].sourceText, caseIndex);
    const arrangements = [];
    for (let arrangementIndex = 0; arrangementIndex < benchmarkCase.acceptedArrangements.length; arrangementIndex += 1) {
      const evidence = replayArrangement(
        benchmarkCase,
        benchmarkCase.acceptedArrangements[arrangementIndex],
        sourceModel,
        caseIndex,
        arrangementIndex,
      );
      selectedShapeReplayCount += evidence.replayedShapeCount;
      arrangements.push(evidence);
    }
    cases.push({
      caseId: benchmarkCase.caseId,
      sourceReplayStatus: sourceReplay.cases[caseIndex].status,
      arrangementCount: arrangements.length,
      arrangements,
    });
  }

  return deepFreeze({
    documentType: 'TeacherArrangementBenchmarkRuntimeReplay',
    contractVersion: TEACHER_ARRANGEMENT_BENCHMARK_RUNTIME_REPLAY_VERSION,
    mode: 'evaluation-runtime-replay',
    authority: 'none',
    benchmarkId: benchmark.benchmarkId,
    benchmarkVersion: benchmark.benchmarkVersion,
    benchmarkReviewStatus: benchmark.reviewStatus,
    caseCount: cases.length,
    selectedShapeReplayCount,
    cases,
  });
}

module.exports = {
  TEACHER_ARRANGEMENT_BENCHMARK_RUNTIME_REPLAY_VERSION,
  TeacherArrangementBenchmarkRuntimeReplayError,
  replayTeacherArrangementBenchmarkRuntime,
};
