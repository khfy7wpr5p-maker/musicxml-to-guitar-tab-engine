'use strict';

const { isProxy } = require('node:util/types');
const { EngineError } = require('../errors/engineError');
const { buildCandidateLayers } = require('../fingering/candidateLayerBuilder');
const { createFingeringCostProfile } = require('../fingering/costModel');
const { optimizeFingering } = require('../fingering/fingeringOptimizer');
const { createOptimizerObservation } = require('../fingering/optimizerObservation');
const { parseCanonicalMusicDocument } = require('../parser/parseCanonicalMusicDocument');
const {
  createShadowRankingReport,
  validateShadowRankingModel,
} = require('../learning/shadowRanking');
const {
  evaluateTeacherFingeringBenchmark,
} = require('./teacherFingeringBenchmarkEvaluation');

const SHADOW_RANKING_BENCHMARK_EVALUATION_CONTRACT_VERSION = '1.0.0';

class ShadowRankingBenchmarkEvaluationError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_SHADOW_RANKING_BENCHMARK_EVALUATION',
      details,
      'ShadowRankingBenchmarkEvaluationError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new ShadowRankingBenchmarkEvaluationError(message, {
    field,
    ...details,
  });
}

function isPlainObject(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || isProxy(value)
  ) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function assertExactOwnDataFields(value, fields, path) {
  if (!isPlainObject(value)) {
    throw invalid(`${path} must be a non-proxy plain object.`, path);
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    throw invalid(`${path} keys could not be inspected safely.`, path);
  }

  const allowed = new Set(fields);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw invalid('Symbol properties are not allowed.', `${path}.symbol`);
    }
    if (!allowed.has(key)) {
      throw invalid('Unknown field is not allowed.', `${path}.${key}`);
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw invalid('Field descriptor could not be inspected safely.', `${path}.${key}`);
    }
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('Fields must be enumerable own data properties.', `${path}.${key}`);
    }
  }

  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw invalid('Required field is missing.', `${path}.${field}`);
    }
  }
}

function getOwnDataValue(value, key, path) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw invalid('Field descriptor could not be inspected safely.', path);
  }
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    throw invalid('Field must be an enumerable own data property.', path);
  }
  return descriptor.value;
}

function samePosition(left, right) {
  return left.string === right.string && left.fret === right.fret;
}

function clonePosition(position) {
  return {
    string: position.string,
    fret: position.fret,
  };
}

function includesPosition(positions, target) {
  for (let index = 0; index < positions.length; index += 1) {
    if (samePosition(positions[index], target)) {
      return true;
    }
  }
  return false;
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
    if (!Object.isFrozen(value)) {
      Object.freeze(value);
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) {
        pending.push(descriptor.value);
      }
    }
  }
  return root;
}

function validateInputs(input) {
  assertExactOwnDataFields(input, ['benchmark', 'sourceEntries', 'model'], 'input');
  const benchmark = getOwnDataValue(input, 'benchmark', 'input.benchmark');
  const sourceEntries = getOwnDataValue(input, 'sourceEntries', 'input.sourceEntries');
  const modelInput = getOwnDataValue(input, 'model', 'input.model');

  let model;
  try {
    model = validateShadowRankingModel(modelInput);
  } catch (error) {
    throw invalid('A valid bound ShadowRankingModel is required.', 'model', {
      causeCode: error && error.code,
    });
  }

  let baselineReport;
  try {
    baselineReport = evaluateTeacherFingeringBenchmark({
      benchmark,
      sourceEntries,
    });
  } catch (error) {
    const benchmarkFailure = error?.details?.field === 'benchmark';
    throw invalid(
      'A valid fixed B1/B2 benchmark evaluation input is required.',
      benchmarkFailure ? 'benchmark' : 'sourceEntries',
      {
        causeCode: benchmarkFailure
          ? (error?.details?.causeCode ?? error?.code ?? null)
          : (error?.code ?? null),
        causeField: error?.details?.field ?? null,
      },
    );
  }

  return {
    benchmark,
    sourceEntries,
    model,
    baselineReport,
  };
}

function guitarOptionsFromBenchmark(benchmark) {
  const tuning = [];
  const sourceTuning = benchmark.guitarConfiguration.value.tuning;
  for (let index = 0; index < sourceTuning.length; index += 1) {
    const entry = sourceTuning[index];
    tuning.push({
      number: entry.number,
      pitch: entry.pitch,
      midi: entry.midi,
    });
  }
  return {
    tuning,
    minimumFret: benchmark.guitarConfiguration.value.minimumFret,
    maximumFret: benchmark.guitarConfiguration.value.maximumFret,
  };
}

function fixedPathPolicy(benchmark) {
  return createFingeringCostProfile({
    maximumFret: benchmark.guitarConfiguration.value.maximumFret,
  });
}

function createObservation(sourceText, guitar, costProfile, caseIndex) {
  try {
    const canonical = parseCanonicalMusicDocument(sourceText);
    const candidates = buildCandidateLayers(canonical, guitar);
    const optimized = optimizeFingering(candidates.candidateLayers, { costProfile });
    return createOptimizerObservation(candidates, optimized);
  } catch (error) {
    throw invalid(
      'An evaluated B1 case could not be reproduced as an OptimizerObservation.',
      `cases[${caseIndex}].observation`,
      { causeCode: error && error.code },
    );
  }
}

function assertBaselineAlignment(baselineCase, shadowReport, caseIndex) {
  if (
    baselineCase.events.length !== shadowReport.baseline.positions.length
    || baselineCase.events.length !== shadowReport.shadow.decisions.length
  ) {
    throw invalid(
      'B2 baseline and LR-S0 observation event counts are not aligned.',
      `cases[${caseIndex}]`,
    );
  }

  for (let index = 0; index < baselineCase.events.length; index += 1) {
    const baselineEvent = baselineCase.events[index];
    const shadowDecision = shadowReport.shadow.decisions[index];
    if (
      baselineEvent.eventId !== shadowDecision.eventId
      || !samePosition(baselineEvent.selectedPosition, shadowReport.baseline.positions[index])
    ) {
      throw invalid(
        'B2 baseline and LR-S0 observation identities or selected positions diverged.',
        `cases[${caseIndex}].events[${index}]`,
      );
    }
  }
}

function evaluateShadowCase(benchmarkCase, baselineCase, shadowReport) {
  const events = [];
  let acceptableMatchCount = 0;
  let preferredEligibleEventCount = 0;
  let preferredMatchCount = 0;

  for (let index = 0; index < benchmarkCase.events.length; index += 1) {
    const benchmarkEvent = benchmarkCase.events[index];
    const baselineEvent = baselineCase.events[index];
    const shadowDecision = shadowReport.shadow.decisions[index];
    const shadowPosition = clonePosition(shadowDecision.position);
    const acceptableMatch = includesPosition(benchmarkEvent.acceptedPositions, shadowPosition);
    const preferredEligible = benchmarkEvent.preferredPosition !== null;
    const preferredMatch = preferredEligible
      && samePosition(benchmarkEvent.preferredPosition, shadowPosition);
    const divergent = !samePosition(baselineEvent.selectedPosition, shadowPosition);

    if (acceptableMatch) {
      acceptableMatchCount += 1;
    }
    if (preferredEligible) {
      preferredEligibleEventCount += 1;
    }
    if (preferredMatch) {
      preferredMatchCount += 1;
    }

    events.push({
      eventId: benchmarkEvent.eventId,
      baselineSelectedPosition: clonePosition(baselineEvent.selectedPosition),
      shadowSelectedPosition: shadowPosition,
      acceptableMatch,
      preferredEligible,
      preferredMatch,
      divergent,
    });
  }

  return {
    events,
    acceptableMatchCount,
    preferredEligibleEventCount,
    preferredMatchCount,
    pass: acceptableMatchCount === benchmarkCase.events.length,
  };
}

function cloneBaselineCounts(counts) {
  return {
    benchmarkCaseCount: counts.benchmarkCaseCount,
    benchmarkEventCount: counts.benchmarkEventCount,
    evaluatedCaseCount: counts.evaluatedCaseCount,
    evaluatedEventCount: counts.evaluatedEventCount,
    unevaluatedEventCount: counts.unevaluatedEventCount,
    acceptableMatchCount: counts.acceptableMatchCount,
    preferredEligibleEventCount: counts.preferredEligibleEventCount,
    preferredMatchCount: counts.preferredMatchCount,
    casePassCount: counts.casePassCount,
    candidateCoverageFailureCount: counts.candidateCoverageFailureCount,
    blockedConversionCount: counts.blockedConversionCount,
  };
}

function cloneCostProfile(profile) {
  return {
    maximumFret: profile.maximumFret,
    fretMovementWeight: profile.fretMovementWeight,
    stringMovementWeight: profile.stringMovementWeight,
    largeShiftThreshold: profile.largeShiftThreshold,
    largeShiftWeight: profile.largeShiftWeight,
    highFretThreshold: profile.highFretThreshold,
    highFretWeight: profile.highFretWeight,
    openStringPreferenceWeight: profile.openStringPreferenceWeight,
    samePositionPreferenceWeight: profile.samePositionPreferenceWeight,
    maximumFretMovement: profile.maximumFretMovement,
    maximumStringMovement: profile.maximumStringMovement,
  };
}

function evaluateShadowRankingBenchmark(input) {
  const {
    benchmark,
    sourceEntries,
    model,
    baselineReport,
  } = validateInputs(input);

  const guitar = guitarOptionsFromBenchmark(benchmark);
  const costProfile = fixedPathPolicy(benchmark);
  const cases = [];
  const shadowCounts = {
    evaluatedCaseCount: 0,
    evaluatedEventCount: 0,
    unevaluatedEventCount: 0,
    acceptableMatchCount: 0,
    preferredEligibleEventCount: 0,
    preferredMatchCount: 0,
    casePassCount: 0,
    candidateCoverageFailureCount: baselineReport.counts.candidateCoverageFailureCount,
    blockedConversionCount: 0,
  };
  let divergentCaseCount = 0;
  let divergentDecisionCount = 0;

  for (let caseIndex = 0; caseIndex < benchmark.cases.length; caseIndex += 1) {
    const benchmarkCase = benchmark.cases[caseIndex];
    const baselineCase = baselineReport.cases[caseIndex];

    if (baselineCase.status === 'blocked') {
      shadowCounts.blockedConversionCount += 1;
      shadowCounts.unevaluatedEventCount += benchmarkCase.events.length;
      shadowCounts.preferredEligibleEventCount += baselineCase.preferredEligibleEventCount;
      cases.push({
        caseId: benchmarkCase.caseId,
        pedagogicalFocus: benchmarkCase.pedagogicalFocus,
        status: 'blocked',
        eventCount: benchmarkCase.events.length,
        baselinePass: false,
        shadowPass: false,
        shadowReport: null,
        events: [],
      });
      continue;
    }

    const observation = createObservation(
      sourceEntries[caseIndex].sourceText,
      guitar,
      costProfile,
      caseIndex,
    );

    let shadowReport;
    try {
      shadowReport = createShadowRankingReport({ observation, model });
    } catch (error) {
      throw invalid(
        'LR-S0 could not produce a shadow report for an evaluated B1 case.',
        `cases[${caseIndex}].shadowReport`,
        { causeCode: error && error.code },
      );
    }

    assertBaselineAlignment(baselineCase, shadowReport, caseIndex);
    const evaluated = evaluateShadowCase(benchmarkCase, baselineCase, shadowReport);

    shadowCounts.evaluatedCaseCount += 1;
    shadowCounts.evaluatedEventCount += benchmarkCase.events.length;
    shadowCounts.acceptableMatchCount += evaluated.acceptableMatchCount;
    shadowCounts.preferredEligibleEventCount += evaluated.preferredEligibleEventCount;
    shadowCounts.preferredMatchCount += evaluated.preferredMatchCount;
    if (evaluated.pass) {
      shadowCounts.casePassCount += 1;
    }

    divergentDecisionCount += shadowReport.comparison.divergentDecisionCount;
    if (!shadowReport.comparison.samePath) {
      divergentCaseCount += 1;
    }

    cases.push({
      caseId: benchmarkCase.caseId,
      pedagogicalFocus: benchmarkCase.pedagogicalFocus,
      status: 'evaluated',
      eventCount: benchmarkCase.events.length,
      baselinePass: baselineCase.pass,
      shadowPass: evaluated.pass,
      shadowReport,
      events: evaluated.events,
    });
  }

  const baselineCounts = cloneBaselineCounts(baselineReport.counts);
  const report = {
    documentType: 'ShadowRankingBenchmarkEvaluation',
    contractVersion: SHADOW_RANKING_BENCHMARK_EVALUATION_CONTRACT_VERSION,
    mode: 'shadow-evaluation',
    authority: 'none',
    benchmark: {
      contractVersion: benchmark.contractVersion,
      benchmarkId: benchmark.benchmarkId,
      benchmarkVersion: benchmark.benchmarkVersion,
      reviewStatus: benchmark.reviewStatus,
    },
    model: {
      contractVersion: model.contractVersion,
      modelId: model.modelId,
      modelVersion: model.modelVersion,
      modelKind: model.modelKind,
      featureContractVersion: model.featureContractVersion,
      scoreDirection: model.scoreDirection,
      modelSha256: model.modelSha256,
    },
    pathPolicy: {
      scope: 'fixed-b1-default',
      generalizedProvenance: false,
      costProfile: cloneCostProfile(costProfile),
    },
    baseline: {
      contractVersion: baselineReport.contractVersion,
      counts: baselineCounts,
    },
    shadow: {
      counts: shadowCounts,
    },
    comparison: {
      divergentCaseCount,
      divergentDecisionCount,
      acceptableMatchDelta:
        shadowCounts.acceptableMatchCount - baselineCounts.acceptableMatchCount,
      preferredMatchDelta:
        shadowCounts.preferredMatchCount - baselineCounts.preferredMatchCount,
    },
    cases,
  };

  return deepFreeze(report);
}

module.exports = {
  SHADOW_RANKING_BENCHMARK_EVALUATION_CONTRACT_VERSION,
  ShadowRankingBenchmarkEvaluationError,
  evaluateShadowRankingBenchmark,
};
