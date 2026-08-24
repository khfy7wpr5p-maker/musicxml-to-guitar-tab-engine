'use strict';

const { ENGINE_NAME } = require('./canonicalTabContractMetadata');
const {
  GUITAR_CONFIGURATION_VERSION,
  GUITAR_STRING_COUNT,
  DEFAULT_FRET_RANGE,
  createGuitarConfiguration,
} = require('../guitar/tuning');
const {
  POLYPHONIC_SOURCE_MODEL_VERSION,
  POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE,
} = require('../music/polyphonicSourceModel');
const {
  GUITAR_ARRANGEMENT_PLAN_VERSION,
  GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE,
} = require('../music/guitarArrangementPlan');
const {
  DETERMINISTIC_REDUCTION_PLAN_VERSION,
  DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE,
  DETERMINISTIC_REDUCTION_POLICY,
  DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK,
} = require('../music/deterministicReductionPlan');
const {
  GUITAR_VOICING_CANDIDATE_MODEL_VERSION,
  GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE,
  GUITAR_VOICING_CANDIDATE_POLICY,
} = require('../music/guitarVoicingCandidateModel');
const {
  LEFT_HAND_SHAPE_MODEL_VERSION,
  LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE,
  LEFT_HAND_SHAPE_POLICY,
} = require('../music/leftHandShapeModel');
const {
  PHYSICAL_PLAYABILITY_VALIDATION_VERSION,
  PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE,
  PHYSICAL_PLAYABILITY_POLICY,
  MAXIMUM_STATIC_FRET_SPAN,
  MAXIMUM_EXTRA_FRET_REACH,
} = require('../music/physicalPlayabilityValidatorV2');
const {
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION,
  DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY,
} = require('../music/deterministicPolyphonicFinalSelector');
const {
  CanonicalTabResultV2ContractError,
  fail,
  hostileSafeGraph,
  exact,
  array,
  string,
  nullableString,
  integer,
  equal,
} = require('./canonicalTabResultV2ValidationSupport');
const {
  validateMeasures,
  validateSimultaneousGroups,
  validateArrangementDecisions,
} = require('./canonicalTabResultV2SourceValidator');
const {
  validateDispositions,
  validateSelectedShapes,
} = require('./canonicalTabResultV2SelectionValidator');

const CANONICAL_TAB_RESULT_V2_VERSION = '2.0.0';
const CANONICAL_TAB_RESULT_DOCUMENT_TYPE = 'CanonicalTabResult';
const REVIEW_STATES = new Set(['NOT_REVIEWED', 'APPROVED', 'REJECTED']);

function validateGuitar(value) {
  const path = 'canonicalTabResult.guitar';
  exact(value, ['contractVersion', 'tuning', 'minimumFret', 'maximumFret'], path);
  equal(value.contractVersion, GUITAR_CONFIGURATION_VERSION, `${path}.contractVersion`, 'GUITAR_CONTRACT_VERSION');
  equal(value.minimumFret, DEFAULT_FRET_RANGE.minimumFret, `${path}.minimumFret`, 'GUITAR_FRET_RANGE');
  equal(value.maximumFret, DEFAULT_FRET_RANGE.maximumFret, `${path}.maximumFret`, 'GUITAR_FRET_RANGE');
  const tuning = array(value.tuning, `${path}.tuning`);
  equal(tuning.length, GUITAR_STRING_COUNT, `${path}.tuning`, 'GUITAR_STRING_COUNT');
  tuning.forEach((entry, index) => {
    const entryPath = `${path}.tuning[${index}]`;
    exact(entry, ['number', 'pitch', 'midi'], entryPath);
    integer(entry.number, `${entryPath}.number`, 1, GUITAR_STRING_COUNT);
    string(entry.pitch, `${entryPath}.pitch`);
    integer(entry.midi, `${entryPath}.midi`, 0, 127);
  });
  let normalized;
  try {
    normalized = createGuitarConfiguration({
      tuning: tuning.map((entry) => ({ ...entry })),
      minimumFret: value.minimumFret,
      maximumFret: value.maximumFret,
    });
  } catch {
    fail(path, 'INVALID_GUITAR_CONFIGURATION');
  }
  normalized.tuning.forEach((entry, index) => {
    equal(entry.number, tuning[index].number, `${path}.tuning[${index}].number`, 'TUNING_ORDER_MISMATCH');
    equal(entry.pitch, tuning[index].pitch, `${path}.tuning[${index}].pitch`, 'TUNING_MISMATCH');
    equal(entry.midi, tuning[index].midi, `${path}.tuning[${index}].midi`, 'TUNING_MISMATCH');
  });
}

function validatePolicyProvenance(value) {
  const path = 'canonicalTabResult.policyProvenance';
  exact(value, ['arrangement', 'reduction', 'voicing', 'leftHand', 'physicalValidation', 'finalSelection'], path);

  const arrangement = exact(value.arrangement, ['documentType', 'contractVersion'], `${path}.arrangement`);
  equal(arrangement.documentType, GUITAR_ARRANGEMENT_PLAN_DOCUMENT_TYPE, `${path}.arrangement.documentType`, 'POLICY_PROVENANCE_MISMATCH');
  equal(arrangement.contractVersion, GUITAR_ARRANGEMENT_PLAN_VERSION, `${path}.arrangement.contractVersion`, 'POLICY_PROVENANCE_MISMATCH');

  const reduction = exact(value.reduction, ['documentType', 'contractVersion', 'policy', 'octaveTieBreak'], `${path}.reduction`);
  equal(reduction.documentType, DETERMINISTIC_REDUCTION_PLAN_DOCUMENT_TYPE, `${path}.reduction.documentType`, 'POLICY_PROVENANCE_MISMATCH');
  equal(reduction.contractVersion, DETERMINISTIC_REDUCTION_PLAN_VERSION, `${path}.reduction.contractVersion`, 'POLICY_PROVENANCE_MISMATCH');
  equal(reduction.policy, DETERMINISTIC_REDUCTION_POLICY, `${path}.reduction.policy`, 'POLICY_PROVENANCE_MISMATCH');
  equal(reduction.octaveTieBreak, DETERMINISTIC_REDUCTION_OCTAVE_TIE_BREAK, `${path}.reduction.octaveTieBreak`, 'POLICY_PROVENANCE_MISMATCH');

  const voicing = exact(value.voicing, ['documentType', 'contractVersion', 'policy'], `${path}.voicing`);
  equal(voicing.documentType, GUITAR_VOICING_CANDIDATE_MODEL_DOCUMENT_TYPE, `${path}.voicing.documentType`, 'POLICY_PROVENANCE_MISMATCH');
  equal(voicing.contractVersion, GUITAR_VOICING_CANDIDATE_MODEL_VERSION, `${path}.voicing.contractVersion`, 'POLICY_PROVENANCE_MISMATCH');
  equal(voicing.policy, GUITAR_VOICING_CANDIDATE_POLICY, `${path}.voicing.policy`, 'POLICY_PROVENANCE_MISMATCH');

  const leftHand = exact(value.leftHand, ['documentType', 'contractVersion', 'policy'], `${path}.leftHand`);
  equal(leftHand.documentType, LEFT_HAND_SHAPE_MODEL_DOCUMENT_TYPE, `${path}.leftHand.documentType`, 'POLICY_PROVENANCE_MISMATCH');
  equal(leftHand.contractVersion, LEFT_HAND_SHAPE_MODEL_VERSION, `${path}.leftHand.contractVersion`, 'POLICY_PROVENANCE_MISMATCH');
  equal(leftHand.policy, LEFT_HAND_SHAPE_POLICY, `${path}.leftHand.policy`, 'POLICY_PROVENANCE_MISMATCH');

  const physical = exact(value.physicalValidation, ['documentType', 'contractVersion', 'policy', 'configuration'], `${path}.physicalValidation`);
  equal(physical.documentType, PHYSICAL_PLAYABILITY_VALIDATION_DOCUMENT_TYPE, `${path}.physicalValidation.documentType`, 'POLICY_PROVENANCE_MISMATCH');
  equal(physical.contractVersion, PHYSICAL_PLAYABILITY_VALIDATION_VERSION, `${path}.physicalValidation.contractVersion`, 'POLICY_PROVENANCE_MISMATCH');
  equal(physical.policy, PHYSICAL_PLAYABILITY_POLICY, `${path}.physicalValidation.policy`, 'POLICY_PROVENANCE_MISMATCH');
  exact(physical.configuration, ['maximumStaticFretSpan', 'maximumExtraFretReach'], `${path}.physicalValidation.configuration`);
  equal(physical.configuration.maximumStaticFretSpan, MAXIMUM_STATIC_FRET_SPAN, `${path}.physicalValidation.configuration.maximumStaticFretSpan`, 'POLICY_PROVENANCE_MISMATCH');
  equal(physical.configuration.maximumExtraFretReach, MAXIMUM_EXTRA_FRET_REACH, `${path}.physicalValidation.configuration.maximumExtraFretReach`, 'POLICY_PROVENANCE_MISMATCH');

  const finalSelection = exact(value.finalSelection, ['policyId', 'policyVersion'], `${path}.finalSelection`);
  equal(finalSelection.policyId, DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_POLICY, `${path}.finalSelection.policyId`, 'POLICY_PROVENANCE_MISMATCH');
  equal(finalSelection.policyVersion, DETERMINISTIC_POLYPHONIC_FINAL_SELECTION_VERSION, `${path}.finalSelection.policyVersion`, 'POLICY_PROVENANCE_MISMATCH');
}

function validateCanonicalTabResultV2(value) {
  hostileSafeGraph(value);
  exact(value, [
    'documentType', 'schemaVersion', 'engine', 'source', 'review', 'guitar',
    'policyProvenance', 'measures', 'simultaneousGroups', 'arrangementDecisions',
    'noteDispositions', 'selectedShapes',
  ], 'canonicalTabResult');
  equal(value.documentType, CANONICAL_TAB_RESULT_DOCUMENT_TYPE, 'canonicalTabResult.documentType', 'DOCUMENT_TYPE_MISMATCH');
  equal(value.schemaVersion, CANONICAL_TAB_RESULT_V2_VERSION, 'canonicalTabResult.schemaVersion', 'SCHEMA_VERSION_MISMATCH');

  exact(value.engine, ['name', 'version'], 'canonicalTabResult.engine');
  equal(value.engine.name, ENGINE_NAME, 'canonicalTabResult.engine.name', 'ENGINE_NAME_MISMATCH');
  string(value.engine.version, 'canonicalTabResult.engine.version');

  exact(value.source, ['documentType', 'contractVersion', 'format', 'musicXmlVersion', 'partId'], 'canonicalTabResult.source');
  equal(value.source.documentType, POLYPHONIC_SOURCE_MODEL_DOCUMENT_TYPE, 'canonicalTabResult.source.documentType', 'SOURCE_DOCUMENT_TYPE');
  equal(value.source.contractVersion, POLYPHONIC_SOURCE_MODEL_VERSION, 'canonicalTabResult.source.contractVersion', 'SOURCE_CONTRACT_VERSION');
  equal(value.source.format, 'score-partwise', 'canonicalTabResult.source.format', 'SOURCE_FORMAT');
  nullableString(value.source.musicXmlVersion, 'canonicalTabResult.source.musicXmlVersion');
  string(value.source.partId, 'canonicalTabResult.source.partId');

  exact(value.review, ['teacherReviewStatus'], 'canonicalTabResult.review');
  if (!REVIEW_STATES.has(value.review.teacherReviewStatus)) {
    fail('canonicalTabResult.review.teacherReviewStatus', 'REVIEW_STATE');
  }

  validateGuitar(value.guitar);
  validatePolicyProvenance(value.policyProvenance);
  const source = validateMeasures(value);
  const groups = validateSimultaneousGroups(value);
  const decisions = validateArrangementDecisions(value, source, groups);
  const dispositions = validateDispositions(value, source, decisions, groups);
  validateSelectedShapes(value, groups, dispositions);
  return value;
}

module.exports = {
  CANONICAL_TAB_RESULT_V2_VERSION,
  CANONICAL_TAB_RESULT_DOCUMENT_TYPE,
  CanonicalTabResultV2ContractError,
  validateCanonicalTabResultV2,
};