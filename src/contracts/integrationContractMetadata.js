'use strict';

const INTEGRATION_CONTRACT_VERSION = '1.0.0';

const SUPPORTED_INPUTS = Object.freeze([
  'MusicXML score-partwise (.musicxml/.xml)',
]);

const SUPPORTED_OUTPUTS = Object.freeze([
  'CanonicalTabResult 1.0.0',
  'Canonical JSON text',
  'ASCII TAB text',
  'TAB MusicXML text',
]);

const INTEGRATION_NON_AUTHORITIES = Object.freeze([
  'modify MusicXML musical meaning',
  'bypass MusicXML validation or processing budgets',
  'create physically invalid string/fret candidates',
  'bypass physical playability validation',
  'replace deterministic optimizer authority',
  'mutate CanonicalTabResult after creation',
  'treat untrusted lookalike errors as trusted EngineError instances',
]);

module.exports = {
  INTEGRATION_CONTRACT_VERSION,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS,
  INTEGRATION_NON_AUTHORITIES,
};
