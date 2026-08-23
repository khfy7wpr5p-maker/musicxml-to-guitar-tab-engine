'use strict';

const { createHash } = require('node:crypto');
const { EngineError } = require('../errors/engineError');
const {
  GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
  GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
  GUITAR_VOICING_CANDIDATE_POLICY,
  MAX_GUITAR_VOICING_CANDIDATES,
} = require('../music/guitarVoicingCandidateModel');
const {
  GUITAR_CONFIGURATION_VERSION,
  GUITAR_STRING_COUNT,
  STANDARD_TUNING,
  DEFAULT_FRET_RANGE,
} = require('../guitar/tuning');

const GUITARSET_VOICING_MODEL_V2_SHADOW_VERSION = '2.0.0';
const EXPECTED_MODEL_ARTIFACT_SHA256 = '7a56436c27ee6d996a49e7f989d37d7ffff187232277095b176c3c395c432314';
const EXPECTED_FEATURE_SCHEMA_SHA256 = '617981e90cce46c941596d1bd50ffffff64e6816c59d8f0dbed1acd6d8938285';
const EXPECTED_PROTOCOL_SHA256 = 'db67d88c4889a2b8c63411cd1e9bbd7481248dfbdd76da67f5df60b3871b4c02';
const EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256 = 'f42809c1ca9d5f6ff1c62dd072c91a9195bb46e1714e88bd84e8a5a57eef9140';
const EXPECTED_MODEL_TRANSPORT_SHA256 = '6f71e1aef2b4b858a4b8c19a205e269e0fa9d4b3b35b8b703bc2e13e58d27955';
const EXPECTED_SOURCE_ARCHIVE_SHA256 = '06dc776d1de92021632e30795f0d4f38534fe01ca5342a164e80e8cd287980fe';
const EXPECTED_SELECTED_PAIR_IDENTITY_SHA256 = '6bc82ad12e99cafcdb26632b33e2240ed5f33c7a3e785a5594f744013d0c7663';
const EXPECTED_SPLIT_VERSION = 'GUITARSET-SPLIT.v1';
const EXPECTED_AMBIGUOUS_EVENT_COUNT = 7919;
const EXPECTED_SELECTED_PAIR_COUNT = 171452;
const EXPECTED_SYMMETRIC_TRAINING_ROW_COUNT = 342904;
const MODEL_MIN_FRET = 0;
const MODEL_MAX_FRET = 20;
const SOURCE_OBSERVED_MAX_FRET = 19;
const FEATURE_COUNT = 28;

const STANDARD_TUNING_BY_STRING = Object.freeze(
  Object.fromEntries(STANDARD_TUNING.map((entry) => [entry.number, entry.midi])),
);

class GuitarSetVoicingModelV2ShadowError extends EngineError {
  constructor(message, details = {}) {
    super(
      message,
      'INVALID_GUITARSET_VOICING_MODEL_V2_SHADOW_INPUT',
      Object.freeze({ ...details }),
      'GuitarSetVoicingModelV2ShadowError',
    );
  }
}

function invalid(message, field, details = {}) {
  return new GuitarSetVoicingModelV2ShadowError(message, { field, ...details });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, field) {
  if (!isPlainObject(value)) {
    throw invalid(`${field} must be a plain object.`, field);
  }
  return value;
}

function assertExactKeys(value, expectedKeys, field) {
  assertPlainObject(value, field);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw invalid(`${field} fields do not match the frozen contract.`, field, { actual, expected });
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
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).every((nested) => isDeeplyFrozen(nested, seen));
}

function parsePythonHexFloat(value, field = 'hexFloat') {
  if (typeof value !== 'string') {
    throw invalid(`${field} must be a Python hexadecimal floating-point string.`, field);
  }
  const match = /^(-?)0x([01])\.([0-9a-f]{1,13})p([+-]\d+)$/i.exec(value);
  if (!match) {
    throw invalid(`${field} is not a supported normalized Python hexadecimal float.`, field, { value });
  }
  const sign = match[1] === '-' ? -1 : 1;
  const integerPart = Number.parseInt(match[2], 16);
  const fractionHex = match[3];
  const fractionInteger = Number.parseInt(fractionHex, 16);
  const fractionScale = 16 ** fractionHex.length;
  const exponent = Number.parseInt(match[4], 10);
  if (!Number.isSafeInteger(fractionInteger) || !Number.isInteger(exponent) || Math.abs(exponent) > 1024) {
    throw invalid(`${field} exceeds the supported hexadecimal-float boundary.`, field, { value });
  }
  const parsed = sign * (integerPart + (fractionInteger / fractionScale)) * (2 ** exponent);
  if (!Number.isFinite(parsed)) {
    throw invalid(`${field} must decode to a finite number.`, field, { value });
  }
  return Object.is(parsed, -0) ? 0 : parsed;
}

function validateModelArtifactV2(artifact) {
  const topLevelFields = [
    'ambiguous_event_count',
    'artifact_sha256',
    'candidate_fret_domain',
    'checkpoint_authorized',
    'feature_schema_sha256',
    'fret20_quality_authority',
    'model_version',
    'observed_fret20_positive_gold_count',
    'parameters',
    'pipeline',
    'production_authorized',
    'protocol_sha256',
    'runtime_connection_authorized',
    'schema',
    'scoring',
    'selected_pair_count',
    'selected_pair_identity_sha256',
    'source_archive_sha256',
    'source_observed_fret_domain',
    'split_version',
    'symmetric_training_row_count',
    'training_performers',
    'training_role',
    'validation_only_artifact',
  ];
  assertExactKeys(artifact, topLevelFields, 'modelArtifact');

  const exactMetadata = [
    ['schema', 'st-guitar-guitarset-observed-voicing-development-model-v2'],
    ['model_version', 'GUITARSET-OBSERVED-VOICING-MODEL.v2'],
    ['artifact_sha256', EXPECTED_MODEL_ARTIFACT_SHA256],
    ['feature_schema_sha256', EXPECTED_FEATURE_SCHEMA_SHA256],
    ['protocol_sha256', EXPECTED_PROTOCOL_SHA256],
    ['source_archive_sha256', EXPECTED_SOURCE_ARCHIVE_SHA256],
    ['split_version', EXPECTED_SPLIT_VERSION],
    ['selected_pair_identity_sha256', EXPECTED_SELECTED_PAIR_IDENTITY_SHA256],
    ['ambiguous_event_count', EXPECTED_AMBIGUOUS_EVENT_COUNT],
    ['selected_pair_count', EXPECTED_SELECTED_PAIR_COUNT],
    ['symmetric_training_row_count', EXPECTED_SYMMETRIC_TRAINING_ROW_COUNT],
    ['observed_fret20_positive_gold_count', 0],
    ['scoring', 'dot((features-mean)/scale, coef)'],
  ];
  for (const [field, expected] of exactMetadata) {
    if (artifact[field] !== expected) {
      throw invalid('Retained v2 model artifact metadata drift.', `modelArtifact.${field}`, {
        expected,
        actual: artifact[field],
      });
    }
  }

  if (
    !Array.isArray(artifact.candidate_fret_domain)
    || artifact.candidate_fret_domain.length !== 2
    || artifact.candidate_fret_domain[0] !== MODEL_MIN_FRET
    || artifact.candidate_fret_domain[1] !== MODEL_MAX_FRET
    || !Array.isArray(artifact.source_observed_fret_domain)
    || artifact.source_observed_fret_domain.length !== 2
    || artifact.source_observed_fret_domain[0] !== 0
    || artifact.source_observed_fret_domain[1] !== SOURCE_OBSERVED_MAX_FRET
  ) {
    throw invalid('Retained v2 fret-domain metadata drift.', 'modelArtifact');
  }
  if (
    artifact.checkpoint_authorized !== false
    || artifact.runtime_connection_authorized !== false
    || artifact.production_authorized !== false
    || artifact.fret20_quality_authority !== false
    || artifact.validation_only_artifact !== true
    || artifact.training_role !== 'DEVELOPMENT'
  ) {
    throw invalid('Retained v2 development artifact authority boundary drift.', 'modelArtifact');
  }
  if (
    !Array.isArray(artifact.training_performers)
    || artifact.training_performers.length !== 4
    || artifact.training_performers.join(',') !== '00,01,04,05'
  ) {
    throw invalid('Retained v2 model training performer identity drift.', 'modelArtifact.training_performers');
  }

  assertExactKeys(artifact.pipeline, ['estimator', 'params', 'scaler'], 'modelArtifact.pipeline');
  assertExactKeys(
    artifact.pipeline.params,
    ['C', 'class_weight', 'fit_intercept', 'max_iter', 'random_state', 'solver'],
    'modelArtifact.pipeline.params',
  );
  if (
    artifact.pipeline.estimator !== 'LogisticRegression'
    || artifact.pipeline.scaler !== 'StandardScaler'
    || artifact.pipeline.params.C !== 1
    || artifact.pipeline.params.class_weight !== null
    || artifact.pipeline.params.fit_intercept !== false
    || artifact.pipeline.params.max_iter !== 2000
    || artifact.pipeline.params.random_state !== 0
    || artifact.pipeline.params.solver !== 'lbfgs'
  ) {
    throw invalid('Retained v2 model pipeline drift.', 'modelArtifact.pipeline');
  }

  assertExactKeys(
    artifact.parameters,
    ['logistic_coef_hex', 'n_iter', 'scaler_mean_hex', 'scaler_scale_hex'],
    'modelArtifact.parameters',
  );
  const meansHex = artifact.parameters.scaler_mean_hex;
  const scalesHex = artifact.parameters.scaler_scale_hex;
  const coefficientsHex = artifact.parameters.logistic_coef_hex;
  if (
    !Array.isArray(meansHex)
    || !Array.isArray(scalesHex)
    || !Array.isArray(coefficientsHex)
    || meansHex.length !== FEATURE_COUNT
    || scalesHex.length !== FEATURE_COUNT
    || coefficientsHex.length !== FEATURE_COUNT
    || !Array.isArray(artifact.parameters.n_iter)
    || artifact.parameters.n_iter.length !== 1
    || artifact.parameters.n_iter[0] !== 37
  ) {
    throw invalid('Retained v2 model parameter dimensions drift.', 'modelArtifact.parameters');
  }

  const transportPayload = {
    model_version: artifact.model_version,
    artifact_sha256: artifact.artifact_sha256,
    feature_schema_sha256: artifact.feature_schema_sha256,
    protocol_sha256: artifact.protocol_sha256,
    scoring: artifact.scoring,
    scaler_mean_hex: meansHex,
    scaler_scale_hex: scalesHex,
    logistic_coef_hex: coefficientsHex,
  };
  const transportSha256 = createHash('sha256')
    .update(JSON.stringify(transportPayload), 'utf8')
    .digest('hex');
  if (transportSha256 !== EXPECTED_MODEL_TRANSPORT_SHA256) {
    throw invalid('Inference-relevant v2 model transport digest drift.', 'modelArtifact.parameters', {
      expectedSha256: EXPECTED_MODEL_TRANSPORT_SHA256,
      actualSha256: transportSha256,
    });
  }

  const mean = meansHex.map((entry, index) => parsePythonHexFloat(
    entry,
    `modelArtifact.parameters.scaler_mean_hex[${index}]`,
  ));
  const scale = scalesHex.map((entry, index) => parsePythonHexFloat(
    entry,
    `modelArtifact.parameters.scaler_scale_hex[${index}]`,
  ));
  const coefficient = coefficientsHex.map((entry, index) => parsePythonHexFloat(
    entry,
    `modelArtifact.parameters.logistic_coef_hex[${index}]`,
  ));
  if (scale.some((value) => !(value > 0))) {
    throw invalid('Scaler values must be strictly positive.', 'modelArtifact.parameters.scaler_scale_hex');
  }

  return deepFreeze({
    artifactSha256: artifact.artifact_sha256,
    featureSchemaSha256: artifact.feature_schema_sha256,
    protocolSha256: artifact.protocol_sha256,
    transportSha256,
    mean,
    scale,
    coefficient,
    candidateFretDomain: [MODEL_MIN_FRET, MODEL_MAX_FRET],
    sourceObservedFretDomain: [0, SOURCE_OBSERVED_MAX_FRET],
    fret20QualityAuthority: false,
  });
}

function compareCanonicalCandidates(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    for (let field = 0; field < 3; field += 1) {
      if (left[index][field] !== right[index][field]) {
        return left[index][field] - right[index][field];
      }
    }
  }
  return left.length - right.length;
}

function canonicalizeTriples(candidate, field = 'candidate') {
  if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > GUITAR_STRING_COUNT) {
    throw invalid(`${field} must contain one to six pitch/string/fret rows.`, field);
  }
  const triples = candidate.map((row, index) => {
    if (!Array.isArray(row) || row.length !== 3) {
      throw invalid(`${field}[${index}] must be [targetMidi,string,fret].`, `${field}[${index}]`);
    }
    const [targetMidi, string, fret] = row;
    if (!Number.isInteger(targetMidi) || targetMidi < 0 || targetMidi > 127) {
      throw invalid('targetMidi must be an integer from 0 to 127.', `${field}[${index}][0]`);
    }
    if (!Number.isInteger(string) || string < 1 || string > GUITAR_STRING_COUNT) {
      throw invalid('string must be an integer from 1 to 6.', `${field}[${index}][1]`);
    }
    if (!Number.isInteger(fret) || fret < MODEL_MIN_FRET || fret > MODEL_MAX_FRET) {
      throw invalid('fret is outside the frozen GuitarSet v2 0..20 candidate domain.', `${field}[${index}][2]`);
    }
    const openMidi = STANDARD_TUNING_BY_STRING[string];
    if (openMidi + fret !== targetMidi) {
      throw invalid('pitch/string/fret row does not round-trip in standard tuning.', `${field}[${index}]`);
    }
    return [targetMidi, string, fret];
  });
  if (new Set(triples.map((row) => row[1])).size !== triples.length) {
    throw invalid(`${field} reuses a guitar string.`, field);
  }
  triples.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));
  return triples;
}

function createGuitarSetVoicingModelV2FeatureVector(candidate) {
  const canonical = canonicalizeTriples(candidate);
  const noteCount = canonical.length;
  const frets = canonical.map((row) => row[2]);
  const strings = canonical.map((row) => row[1]);
  const positiveFrets = frets.filter((fret) => fret > 0);
  const occupied = new Set(strings);
  const openCount = frets.filter((fret) => fret === 0).length;
  let adjacentPairs = 0;
  for (let string = 1; string < GUITAR_STRING_COUNT; string += 1) {
    if (occupied.has(string) && occupied.has(string + 1)) {
      adjacentPairs += 1;
    }
  }
  const minString = Math.min(...strings);
  const maxString = Math.max(...strings);
  const internalGaps = maxString - minString + 1 - occupied.size;
  const byString = new Map(canonical.map(([pitch, string, fret]) => [string, [pitch, fret]]));
  const minPositive = positiveFrets.length ? Math.min(...positiveFrets) : 0;
  const maxPositive = positiveFrets.length ? Math.max(...positiveFrets) : 0;

  const values = [
    openCount / noteCount,
    frets.reduce((sum, fret) => sum + fret, 0) / (noteCount * MODEL_MAX_FRET),
    Math.max(...frets) / MODEL_MAX_FRET,
    positiveFrets.length ? minPositive / MODEL_MAX_FRET : 0,
    positiveFrets.length ? maxPositive / MODEL_MAX_FRET : 0,
    positiveFrets.length ? (maxPositive - minPositive) / MODEL_MAX_FRET : 0,
    (maxString - minString) / 5,
    adjacentPairs / Math.max(1, noteCount - 1),
    internalGaps / 5,
    strings.reduce((sum, string) => sum + string - 1, 0) / (noteCount * 5),
  ];
  for (let string = 1; string <= GUITAR_STRING_COUNT; string += 1) {
    values.push(byString.has(string) ? 1 : 0);
  }
  for (let string = 1; string <= GUITAR_STRING_COUNT; string += 1) {
    values.push(byString.has(string) ? byString.get(string)[1] / MODEL_MAX_FRET : 0);
  }
  for (let string = 1; string <= GUITAR_STRING_COUNT; string += 1) {
    values.push(byString.has(string) ? byString.get(string)[0] / 127 : 0);
  }
  if (values.length !== FEATURE_COUNT || values.some((value) => !Number.isFinite(value))) {
    throw invalid('Frozen 28D GuitarSet v2 feature vector is invalid.', 'candidate');
  }
  return Object.freeze(values);
}

function scoreWithValidatedModelV2(candidate, retainedModel) {
  const features = createGuitarSetVoicingModelV2FeatureVector(candidate);
  let score = 0;
  for (let index = 0; index < FEATURE_COUNT; index += 1) {
    score += ((features[index] - retainedModel.mean[index]) / retainedModel.scale[index])
      * retainedModel.coefficient[index];
  }
  if (!Number.isFinite(score)) {
    throw invalid('GuitarSet v2 shadow score is not finite.', 'score');
  }
  return score;
}

function scoreGuitarSetVoicingModelV2Candidate(candidate, modelArtifact) {
  return scoreWithValidatedModelV2(candidate, validateModelArtifactV2(modelArtifact));
}

function validateRuntimeCandidateModel(model) {
  assertPlainObject(model, 'voicingCandidateModel');
  if (!isDeeplyFrozen(model)) {
    throw invalid('voicingCandidateModel must be the deeply frozen PA-7 output.', 'voicingCandidateModel');
  }
  if (
    model.documentType !== GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE
    || model.contractVersion !== GUITAR_VOICING_CANDIDATE_MODEL_VERSION
    || model.policy !== GUITAR_VOICING_CANDIDATE_POLICY
  ) {
    throw invalid('Unsupported PA-7 GuitarVoicingCandidateModel contract.', 'voicingCandidateModel');
  }
  if (
    !isPlainObject(model.configuration)
    || model.configuration.contractVersion !== GUITAR_CONFIGURATION_VERSION
    || model.configuration.stringCount !== GUITAR_STRING_COUNT
    || model.configuration.minimumFret !== MODEL_MIN_FRET
    || model.configuration.maximumFret !== MODEL_MAX_FRET
    || DEFAULT_FRET_RANGE.minimumFret !== MODEL_MIN_FRET
    || DEFAULT_FRET_RANGE.maximumFret !== MODEL_MAX_FRET
  ) {
    throw invalid('Reviewed runtime guitar configuration boundary drift.', 'voicingCandidateModel.configuration');
  }
  if (
    !Number.isSafeInteger(model.groupCount)
    || model.groupCount < 0
    || !Number.isSafeInteger(model.candidateCount)
    || model.candidateCount < 0
    || !Array.isArray(model.groups)
    || model.groups.length !== model.groupCount
    || model.candidateCount > MAX_GUITAR_VOICING_CANDIDATES
  ) {
    throw invalid('PA-7 group/candidate counts are invalid.', 'voicingCandidateModel');
  }
  return model;
}

function normalizeRuntimeGroup(group, groupIndex) {
  assertPlainObject(group, `voicingCandidateModel.groups[${groupIndex}]`);
  if (typeof group.sourceGroupId !== 'string' || group.sourceGroupId.length === 0) {
    throw invalid('PA-7 sourceGroupId must be a non-empty string.', `voicingCandidateModel.groups[${groupIndex}].sourceGroupId`);
  }
  if (!Array.isArray(group.targetMidis) || group.targetMidis.length < 2 || group.targetMidis.length > 6) {
    throw invalid('PA-7 shadow group must contain 2..6 target MIDIs.', `voicingCandidateModel.groups[${groupIndex}].targetMidis`);
  }
  const targetMidis = [...group.targetMidis].sort((a, b) => a - b);
  if (targetMidis.some((value) => !Number.isInteger(value) || value < 0 || value > 127)) {
    throw invalid('PA-7 target MIDIs are invalid.', `voicingCandidateModel.groups[${groupIndex}].targetMidis`);
  }
  if (
    !Number.isSafeInteger(group.candidateCount)
    || group.candidateCount < 0
    || !Array.isArray(group.candidates)
    || group.candidates.length !== group.candidateCount
  ) {
    throw invalid('PA-7 candidateCount must match candidates.length.', `voicingCandidateModel.groups[${groupIndex}]`);
  }

  const normalized = [];
  const candidateIds = new Set();
  const canonicalKeys = new Set();
  for (let candidateIndex = 0; candidateIndex < group.candidates.length; candidateIndex += 1) {
    const candidate = group.candidates[candidateIndex];
    assertPlainObject(candidate, `group.candidates[${candidateIndex}]`);
    if (
      typeof candidate.candidateId !== 'string'
      || candidate.candidateId.length === 0
      || candidateIds.has(candidate.candidateId)
    ) {
      throw invalid('PA-7 candidateId must be a unique non-empty string.', `group.candidates[${candidateIndex}].candidateId`);
    }
    candidateIds.add(candidate.candidateId);
    if (
      !Number.isSafeInteger(candidate.positionCount)
      || candidate.positionCount < 1
      || !Array.isArray(candidate.positions)
      || candidate.positions.length !== candidate.positionCount
    ) {
      throw invalid('PA-7 positionCount must match positions.length.', `group.candidates[${candidateIndex}]`);
    }
    const rows = candidate.positions.map((position, positionIndex) => {
      assertPlainObject(position, `group.candidates[${candidateIndex}].positions[${positionIndex}]`);
      if (typeof position.sourceEventId !== 'string' || position.sourceEventId.length === 0) {
        throw invalid(
          'PA-7 sourceEventId must be a non-empty string.',
          `group.candidates[${candidateIndex}].positions[${positionIndex}].sourceEventId`,
        );
      }
      return [position.targetMidi, position.string, position.fret];
    });
    const canonical = canonicalizeTriples(rows, `group.candidates[${candidateIndex}]`);
    const pitches = canonical.map((row) => row[0]).sort((a, b) => a - b);
    if (pitches.length !== targetMidis.length || pitches.some((value, index) => value !== targetMidis[index])) {
      throw invalid(
        'PA-7 candidate does not preserve the exact target MIDI multiset.',
        `group.candidates[${candidateIndex}]`,
      );
    }
    const key = JSON.stringify(canonical);
    if (canonicalKeys.has(key)) {
      throw invalid('PA-7 candidate group contains duplicate canonical placements.', `group.candidates[${candidateIndex}]`);
    }
    canonicalKeys.add(key);
    normalized.push({
      candidateId: candidate.candidateId,
      canonical,
      containsFret20: canonical.some((row) => row[2] === MODEL_MAX_FRET),
    });
  }
  return { targetMidis, candidates: normalized };
}

function createGuitarSetVoicingModelV2ShadowReport(voicingCandidateModel, modelArtifact) {
  const runtimeModel = validateRuntimeCandidateModel(voicingCandidateModel);
  const retainedModel = validateModelArtifactV2(modelArtifact);
  const groups = [];
  let aggregateCandidateCount = 0;
  let scoredGroupCount = 0;
  let unsupportedGroupCount = 0;
  let noCandidateGroupCount = 0;
  let fret20CandidateCount = 0;
  let fret20CandidateGroupCount = 0;

  for (let groupIndex = 0; groupIndex < runtimeModel.groups.length; groupIndex += 1) {
    const sourceGroup = runtimeModel.groups[groupIndex];
    const normalized = normalizeRuntimeGroup(sourceGroup, groupIndex);
    aggregateCandidateCount += normalized.candidates.length;
    const groupFret20Count = normalized.candidates.filter((entry) => entry.containsFret20).length;
    fret20CandidateCount += groupFret20Count;
    if (groupFret20Count > 0) {
      fret20CandidateGroupCount += 1;
    }
    const base = {
      sourceGroupId: sourceGroup.sourceGroupId,
      candidateCount: normalized.candidates.length,
      targetMidis: normalized.targetMidis,
      fret20CandidateCount: groupFret20Count,
      authoritativeDecisionEffectAuthorized: false,
      canonicalResultEffectAuthorized: false,
    };

    if (normalized.candidates.length === 0) {
      unsupportedGroupCount += 1;
      noCandidateGroupCount += 1;
      groups.push({
        ...base,
        status: 'SHADOW_NOT_SCORED_NO_AUTHORITATIVE_CANDIDATES',
        shadowScored: false,
        modelDomainComplete: true,
        topCandidateId: null,
        candidateScores: [],
      });
      continue;
    }

    const scored = normalized.candidates.map((entry) => ({
      candidateId: entry.candidateId,
      canonical: entry.canonical,
      score: scoreWithValidatedModelV2(entry.canonical, retainedModel),
      containsFret20: entry.containsFret20,
    }));
    scored.sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return compareCanonicalCandidates(left.canonical, right.canonical);
    });
    scoredGroupCount += 1;
    groups.push({
      ...base,
      status: 'SHADOW_SCORED_OFFLINE_NON_AUTHORITATIVE_V2',
      shadowScored: true,
      modelDomainComplete: true,
      topCandidateId: scored[0].candidateId,
      candidateScores: scored.map((entry, index) => ({
        candidateId: entry.candidateId,
        rank: index + 1,
        score: entry.score,
        containsFret20: entry.containsFret20,
      })),
    });
  }

  if (aggregateCandidateCount !== runtimeModel.candidateCount) {
    throw invalid('Aggregate PA-7 candidateCount does not match group contents.', 'voicingCandidateModel.candidateCount', {
      expected: runtimeModel.candidateCount,
      actual: aggregateCandidateCount,
    });
  }

  return deepFreeze({
    documentType: 'GuitarSetObservedVoicingShadowReport',
    contractVersion: GUITARSET_VOICING_MODEL_V2_SHADOW_VERSION,
    mode: 'OFFLINE_ADAPTER_PARITY_ONLY',
    sourceDocumentType: runtimeModel.documentType,
    sourceContractVersion: runtimeModel.contractVersion,
    sourcePolicy: runtimeModel.policy,
    shadowIntegrationReviewEvidenceSha256: EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
    retainedModelArtifactSha256: retainedModel.artifactSha256,
    featureSchemaSha256: retainedModel.featureSchemaSha256,
    protocolSha256: retainedModel.protocolSha256,
    candidateFretDomain: [MODEL_MIN_FRET, MODEL_MAX_FRET],
    sourceObservedFretDomain: [0, SOURCE_OBSERVED_MAX_FRET],
    groupCount: groups.length,
    candidateCount: aggregateCandidateCount,
    scoredGroupCount,
    unsupportedGroupCount,
    noCandidateGroupCount,
    fret20CandidateCount,
    fret20CandidateGroupCount,
    groups,
    candidateMutationAuthorized: false,
    candidateFilteringAuthorized: false,
    candidateGenerationAuthorized: false,
    shadowIntegrationAuthorized: true,
    shadowExecutionAuthorized: false,
    liveOrUserInputAuthorized: false,
    runtimeConnectionAuthorized: false,
    authoritativeDecisionEffectAuthorized: false,
    canonicalResultEffectAuthorized: false,
    tabOutputEffectAuthorized: false,
    fret20CandidateScoringAuthorized: true,
    fret20QualityAuthority: false,
    productionAuthorized: false,
  });
}

module.exports = {
  GUITARSET_VOICING_MODEL_V2_SHADOW_VERSION,
  EXPECTED_MODEL_ARTIFACT_SHA256,
  EXPECTED_FEATURE_SCHEMA_SHA256,
  EXPECTED_PROTOCOL_SHA256,
  EXPECTED_SHADOW_INTEGRATION_REVIEW_SHA256,
  EXPECTED_MODEL_TRANSPORT_SHA256,
  MODEL_MIN_FRET,
  MODEL_MAX_FRET,
  SOURCE_OBSERVED_MAX_FRET,
  GuitarSetVoicingModelV2ShadowError,
  parsePythonHexFloat,
  validateModelArtifactV2,
  createGuitarSetVoicingModelV2FeatureVector,
  scoreGuitarSetVoicingModelV2Candidate,
  createGuitarSetVoicingModelV2ShadowReport,
};
