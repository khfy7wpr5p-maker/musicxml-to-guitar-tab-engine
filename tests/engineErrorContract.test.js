'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const packageApi = require('../src');
const {
  ENGINE_ERROR_CONTRACT_VERSION,
  EngineError,
  isEngineError,
} = require('../src/errors/engineError');
const {
  ProcessingBudgetConfigurationError,
} = require('../src/core/processingBudget');
const { XmlSafetyError } = require('../src/validation/xmlSafety');
const { ParsedMusicXmlDocumentError } = require('../src/parser/parsedMusicXmlDocument');
const { MusicXmlValidationError } = require('../src/validation/musicxmlValidation');
const { MusicXmlNoteParserError } = require('../src/parser/musicxmlNoteParser');
const { MusicXmlDocumentAdapterError } = require('../src/parser/musicxmlDocumentAdapter');
const { GuitarConfigurationError } = require('../src/guitar/tuning');
const { FretboardError } = require('../src/guitar/fretboard');
const { PlayabilityError } = require('../src/guitar/playability');
const { FingeringCostError } = require('../src/fingering/costModel');
const { FingeringOptimizerError } = require('../src/fingering/fingeringOptimizer');
const { CandidateLayerBuilderError } = require('../src/fingering/candidateLayerBuilder');
const { CanonicalFingeringPipelineError } = require('../src/fingering/assignCanonicalFingering');
const { CanonicalTabResultError } = require('../src/tab/canonicalTabResult');
const { PitchError } = require('../src/music/pitch');
const { CanonicalMusicDocumentError } = require('../src/music/canonicalMusicDocument');
const { CanonicalTabContractError } = require('../src/contracts/canonicalTabContractCore');
const { CanonicalTabAsciiWriterError } = require('../src/writers/canonicalTabAsciiWriter');
const { CanonicalTabJsonWriterError } = require('../src/writers/canonicalTabJsonWriter');
const { CanonicalTabMusicXmlWriterError } = require('../src/writers/canonicalTabMusicXmlWriter');

const STANDARD_CASES = Object.freeze([
  ['XmlSafetyError', (details) => new XmlSafetyError('xml safety', 'INVALID_ENCODING', details), 'INVALID_ENCODING'],
  ['ParsedMusicXmlDocumentError', (details) => new ParsedMusicXmlDocumentError('parsed xml', 'INVALID_XML', details), 'INVALID_XML'],
  ['MusicXmlValidationError', (details) => new MusicXmlValidationError('validation', 'INVALID_MUSICXML', details), 'INVALID_MUSICXML'],
  ['MusicXmlNoteParserError', (details) => new MusicXmlNoteParserError('note parser', 'UNSUPPORTED_RHYTHM', details), 'UNSUPPORTED_RHYTHM'],
  ['GuitarConfigurationError', (details) => new GuitarConfigurationError('guitar configuration', details), 'INVALID_GUITAR_CONFIGURATION'],
  ['FretboardError', (details) => new FretboardError('fretboard', 'INVALID_POSITION', details), 'INVALID_POSITION'],
  ['PlayabilityError', (details) => new PlayabilityError('playability', 'UNPLAYABLE_NOTE', details), 'UNPLAYABLE_NOTE'],
  ['FingeringCostError', (details) => new FingeringCostError('cost', 'INVALID_POSITION', details), 'INVALID_POSITION'],
  ['FingeringOptimizerError', (details) => new FingeringOptimizerError('optimizer', 'NO_PLAYABLE_FINGERING', details), 'NO_PLAYABLE_FINGERING'],
  ['CandidateLayerBuilderError', (details) => new CandidateLayerBuilderError('candidate builder', 'INVALID_CANDIDATE_BUILDER_OPTIONS', details), 'INVALID_CANDIDATE_BUILDER_OPTIONS'],
  ['CanonicalFingeringPipelineError', (details) => new CanonicalFingeringPipelineError('fingering pipeline', 'INCONSISTENT_FRET_RANGE', details), 'INCONSISTENT_FRET_RANGE'],
  ['CanonicalTabResultError', (details) => new CanonicalTabResultError('canonical tab', 'INVALID_CANONICAL_TAB_OPTIONS', details), 'INVALID_CANONICAL_TAB_OPTIONS'],
  ['PitchError', (details) => new PitchError('pitch', details), 'INVALID_PITCH'],
  ['CanonicalMusicDocumentError', (details) => new CanonicalMusicDocumentError('canonical music', 'INVALID_PARSER_OUTPUT', details), 'INVALID_PARSER_OUTPUT'],
  ['CanonicalTabContractError', (details) => new CanonicalTabContractError('contract', 'INVALID_CANONICAL_TAB_RESULT', details), 'INVALID_CANONICAL_TAB_RESULT'],
  ['CanonicalTabAsciiWriterError', (details) => new CanonicalTabAsciiWriterError('ascii writer', 'INVALID_CANONICAL_TAB_ASCII_RESULT', details), 'INVALID_CANONICAL_TAB_ASCII_RESULT'],
  ['CanonicalTabJsonWriterError', (details) => new CanonicalTabJsonWriterError('json writer', 'INVALID_CANONICAL_TAB_RESULT', details), 'INVALID_CANONICAL_TAB_RESULT'],
  ['CanonicalTabMusicXmlWriterError', (details) => new CanonicalTabMusicXmlWriterError('musicxml writer', 'INVALID_CANONICAL_TAB_MUSICXML_RESULT', details), 'INVALID_CANONICAL_TAB_MUSICXML_RESULT'],
]);

test('defines EngineError 1.0.0 as the internal base contract', () => {
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

test('current domain errors preserve names, codes, details and EngineError inheritance', () => {
  for (const [name, create, code] of STANDARD_CASES) {
    const details = { marker: name };
    const error = create(details);

    assert.ok(error instanceof Error, name);
    assert.ok(error instanceof EngineError, name);
    assert.equal(isEngineError(error), true, name);
    assert.equal(error.name, name);
    assert.equal(error.code, code);
    assert.equal(error.details, details);
  }
});

test('processing budget errors preserve fixed code and frozen copied details', () => {
  const details = { field: 'maxEvents', value: 0 };
  const error = new ProcessingBudgetConfigurationError('invalid budget', details);

  assert.ok(error instanceof EngineError);
  assert.equal(isEngineError(error), true);
  assert.equal(error.name, 'ProcessingBudgetConfigurationError');
  assert.equal(error.code, 'INVALID_PROCESSING_BUDGET');
  assert.deepEqual(error.details, details);
  assert.notEqual(error.details, details);
  assert.equal(Object.isFrozen(error.details), true);
});

test('MusicXML adapter errors preserve content and structure phase metadata', () => {
  const contentDetails = { marker: 'content' };
  const contentError = new MusicXmlDocumentAdapterError(
    'adapter content',
    'INVALID_MUSICXML',
    contentDetails,
  );
  assert.equal(isEngineError(contentError), true);
  assert.equal(contentError.name, 'MusicXmlDocumentAdapterError');
  assert.equal(contentError.code, 'INVALID_MUSICXML');
  assert.equal(contentError.details, contentDetails);
  assert.equal(contentError.phase, 'content');

  const structureDetails = { marker: 'structure' };
  const structureError = new MusicXmlDocumentAdapterError(
    'adapter structure',
    'UNSUPPORTED_SCORE_FORMAT',
    structureDetails,
    'structure',
  );
  assert.equal(isEngineError(structureError), true);
  assert.equal(structureError.code, 'UNSUPPORTED_SCORE_FORMAT');
  assert.equal(structureError.details, structureDetails);
  assert.equal(structureError.phase, 'structure');
});

test('public detector is nominal and rejects native or structurally similar non-engine values', () => {
  assert.equal(isEngineError(new Error('native')), false);
  assert.equal(isEngineError(null), false);
  assert.equal(isEngineError({}), false);
  assert.equal(isEngineError({
    name: 'FretboardError',
    message: 'spoofed',
    code: 'INVALID_FRETBOARD_INPUT',
    details: {},
  }), false);
});

test('PEB-1 exposes detection and contract version without exporting EngineError', () => {
  const error = new packageApi.FretboardError('public fretboard error');

  assert.equal(packageApi.FretboardError, FretboardError);
  assert.equal(packageApi.ENGINE_ERROR_CONTRACT_VERSION, '1.0.0');
  assert.equal(packageApi.isEngineError, isEngineError);
  assert.equal(packageApi.isEngineError(error), true);
  assert.ok(error instanceof FretboardError);
  assert.ok(error instanceof EngineError);
  assert.equal(Object.hasOwn(packageApi, 'EngineError'), false);
});
