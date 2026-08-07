'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const packageApi = require('../src');
const {
  ENGINE_ERROR_CONTRACT_VERSION,
  EngineError,
} = require('../src/errors/engineError');
const {
  ProcessingBudgetConfigurationError,
} = require('../src/core/processingBudget');
const {
  XmlSafetyError,
} = require('../src/validation/xmlSafety');
const {
  ParsedMusicXmlDocumentError,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  MusicXmlValidationError,
} = require('../src/validation/musicxmlValidation');
const {
  MusicXmlNoteParserError,
} = require('../src/parser/musicxmlNoteParser');
const {
  GuitarConfigurationError,
} = require('../src/guitar/tuning');
const {
  FretboardError,
} = require('../src/guitar/fretboard');
const {
  PlayabilityError,
} = require('../src/guitar/playability');
const {
  FingeringCostError,
} = require('../src/fingering/costModel');
const {
  FingeringOptimizerError,
} = require('../src/fingering/fingeringOptimizer');
const {
  CandidateLayerBuilderError,
} = require('../src/fingering/candidateLayerBuilder');
const {
  CanonicalFingeringPipelineError,
} = require('../src/fingering/assignCanonicalFingering');
const {
  CanonicalTabResultError,
} = require('../src/tab/canonicalTabResult');
const {
  PitchError,
} = require('../src/music/pitch');
const {
  CanonicalMusicDocumentError,
} = require('../src/music/canonicalMusicDocument');
const {
  CanonicalTabContractError,
} = require('../src/contracts/canonicalTabContractCore');
const {
  CanonicalTabAsciiWriterError,
} = require('../src/writers/canonicalTabAsciiWriter');
const {
  CanonicalTabJsonWriterError,
} = require('../src/writers/canonicalTabJsonWriter');
const {
  CanonicalTabMusicXmlWriterError,
} = require('../src/writers/canonicalTabMusicXmlWriter');

const MIGRATED_ERROR_CASES = Object.freeze([
  Object.freeze({
    name: 'XmlSafetyError',
    create: (details) => new XmlSafetyError('xml safety', 'INVALID_ENCODING', details),
    code: 'INVALID_ENCODING',
  }),
  Object.freeze({
    name: 'ParsedMusicXmlDocumentError',
    create: (details) => new ParsedMusicXmlDocumentError('parsed xml', 'INVALID_XML', details),
    code: 'INVALID_XML',
  }),
  Object.freeze({
    name: 'MusicXmlValidationError',
    create: (details) => new MusicXmlValidationError('validation', 'INVALID_MUSICXML', details),
    code: 'INVALID_MUSICXML',
  }),
  Object.freeze({
    name: 'MusicXmlNoteParserError',
    create: (details) => new MusicXmlNoteParserError('note parser', 'UNSUPPORTED_RHYTHM', details),
    code: 'UNSUPPORTED_RHYTHM',
  }),
]);

const MIGRATED_2D2_ERROR_CASES = Object.freeze([
  Object.freeze({
    name: 'GuitarConfigurationError',
    create: (details) => new GuitarConfigurationError('guitar configuration', details),
    code: 'INVALID_GUITAR_CONFIGURATION',
  }),
  Object.freeze({
    name: 'FretboardError',
    create: (details) => new FretboardError('fretboard', 'INVALID_POSITION', details),
    code: 'INVALID_POSITION',
  }),
  Object.freeze({
    name: 'PlayabilityError',
    create: (details) => new PlayabilityError('playability', 'UNPLAYABLE_NOTE', details),
    code: 'UNPLAYABLE_NOTE',
  }),
  Object.freeze({
    name: 'FingeringCostError',
    create: (details) => new FingeringCostError('cost', 'INVALID_POSITION', details),
    code: 'INVALID_POSITION',
  }),
  Object.freeze({
    name: 'FingeringOptimizerError',
    create: (details) => new FingeringOptimizerError('optimizer', 'NO_PLAYABLE_FINGERING', details),
    code: 'NO_PLAYABLE_FINGERING',
  }),
  Object.freeze({
    name: 'CandidateLayerBuilderError',
    create: (details) => new CandidateLayerBuilderError('candidate builder', 'INVALID_CANDIDATE_BUILDER_OPTIONS', details),
    code: 'INVALID_CANDIDATE_BUILDER_OPTIONS',
  }),
  Object.freeze({
    name: 'CanonicalFingeringPipelineError',
    create: (details) => new CanonicalFingeringPipelineError('fingering pipeline', 'INCONSISTENT_FRET_RANGE', details),
    code: 'INCONSISTENT_FRET_RANGE',
  }),
  Object.freeze({
    name: 'CanonicalTabResultError',
    create: (details) => new CanonicalTabResultError('canonical tab', 'INVALID_CANONICAL_TAB_OPTIONS', details),
    code: 'INVALID_CANONICAL_TAB_OPTIONS',
  }),
]);

const MIGRATED_2D3_ERROR_CASES = Object.freeze([
  Object.freeze({
    name: 'PitchError',
    create: (details) => new PitchError('pitch', details),
    code: 'INVALID_PITCH',
  }),
  Object.freeze({
    name: 'CanonicalMusicDocumentError',
    create: (details) => new CanonicalMusicDocumentError('canonical music', 'INVALID_PARSER_OUTPUT', details),
    code: 'INVALID_PARSER_OUTPUT',
  }),
  Object.freeze({
    name: 'CanonicalTabContractError',
    create: (details) => new CanonicalTabContractError('contract', 'INVALID_CANONICAL_TAB_RESULT', details),
    code: 'INVALID_CANONICAL_TAB_RESULT',
  }),
  Object.freeze({
    name: 'CanonicalTabAsciiWriterError',
    create: (details) => new CanonicalTabAsciiWriterError('ascii writer', 'INVALID_CANONICAL_TAB_ASCII_RESULT', details),
    code: 'INVALID_CANONICAL_TAB_ASCII_RESULT',
  }),
  Object.freeze({
    name: 'CanonicalTabJsonWriterError',
    create: (details) => new CanonicalTabJsonWriterError('json writer', 'INVALID_CANONICAL_TAB_RESULT', details),
    code: 'INVALID_CANONICAL_TAB_RESULT',
  }),
  Object.freeze({
    name: 'CanonicalTabMusicXmlWriterError',
    create: (details) => new CanonicalTabMusicXmlWriterError('musicxml writer', 'INVALID_CANONICAL_TAB_MUSICXML_RESULT', details),
    code: 'INVALID_CANONICAL_TAB_MUSICXML_RESULT',
  }),
]);

test('defines EngineError as a versioned internal base contract', () => {
  const details = { phase: 'test' };
  const error = new EngineError('engine failure', 'ENGINE_FAILURE', details);

  assert.equal(ENGINE_ERROR_CONTRACT_VERSION, '1.0.0');
  assert.ok(error instanceof Error);
  assert.ok(error instanceof EngineError);
  assert.equal(error.name, 'EngineError');
  assert.equal(error.message, 'engine failure');
  assert.equal(error.code, 'ENGINE_FAILURE');
  assert.equal(error.details, details);
});

test('migrated parser and validation errors preserve their existing metadata', () => {
  for (const errorCase of MIGRATED_ERROR_CASES) {
    const details = { marker: errorCase.name };
    const error = errorCase.create(details);

    assert.ok(error instanceof Error, errorCase.name);
    assert.ok(error instanceof EngineError, errorCase.name);
    assert.equal(error.name, errorCase.name);
    assert.equal(error.code, errorCase.code);
    assert.equal(error.details, details);
  }
});

test('processing budget errors preserve their fixed code and frozen copied details', () => {
  const details = { field: 'maxEvents', value: 0 };
  const error = new ProcessingBudgetConfigurationError('invalid budget', details);

  assert.ok(error instanceof Error);
  assert.ok(error instanceof EngineError);
  assert.equal(error.name, 'ProcessingBudgetConfigurationError');
  assert.equal(error.code, 'INVALID_PROCESSING_BUDGET');
  assert.deepEqual(error.details, details);
  assert.notEqual(error.details, details);
  assert.equal(Object.isFrozen(error.details), true);
});

test('2D-2 guitar, fingering and canonical TAB errors preserve metadata', () => {
  for (const errorCase of MIGRATED_2D2_ERROR_CASES) {
    const details = { marker: errorCase.name };
    const error = errorCase.create(details);

    assert.ok(error instanceof Error, errorCase.name);
    assert.ok(error instanceof EngineError, errorCase.name);
    assert.equal(error.name, errorCase.name);
    assert.equal(error.code, errorCase.code);
    assert.equal(error.details, details);
  }
});

test('2D-3 canonical model, contract and writer errors preserve metadata', () => {
  for (const errorCase of MIGRATED_2D3_ERROR_CASES) {
    const details = { marker: errorCase.name };
    const error = errorCase.create(details);

    assert.ok(error instanceof Error, errorCase.name);
    assert.ok(error instanceof EngineError, errorCase.name);
    assert.equal(error.name, errorCase.name);
    assert.equal(error.code, errorCase.code);
    assert.equal(error.details, details);
  }
});

test('2D-2 preserves the existing package-root FretboardError export', () => {
  const error = new packageApi.FretboardError('public fretboard error');

  assert.equal(packageApi.FretboardError, FretboardError);
  assert.ok(error instanceof FretboardError);
  assert.ok(error instanceof EngineError);
  assert.equal(error.name, 'FretboardError');
  assert.equal(error.code, 'INVALID_FRETBOARD_INPUT');
});

test('2D convergence does not expand the package-root public API with EngineError', () => {
  assert.equal(Object.hasOwn(packageApi, 'EngineError'), false);
  assert.equal(Object.hasOwn(packageApi, 'ENGINE_ERROR_CONTRACT_VERSION'), false);
});
