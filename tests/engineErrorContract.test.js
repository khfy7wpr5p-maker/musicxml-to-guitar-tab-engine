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

test('2D-1 does not expand the package-root public API', () => {
  assert.equal(Object.hasOwn(packageApi, 'EngineError'), false);
  assert.equal(Object.hasOwn(packageApi, 'ENGINE_ERROR_CONTRACT_VERSION'), false);
});
