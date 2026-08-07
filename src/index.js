'use strict';

const {
  convertMusicXmlToCanonicalTab,
} = require('./core/conversionPipeline');
const {
  ENGINE_ERROR_CONTRACT_VERSION,
  isEngineError,
} = require('./errors/engineError');
const {
  FretboardError,
  getPositionCandidates,
  positionToMidi,
  validateMidi,
} = require('./guitar/fretboard');
const {
  PREFLIGHT_STATUS,
  preflightMusicXml,
} = require('./validation/musicxmlPreflight');
const {
  serializeCanonicalTabResult,
} = require('./writers/canonicalTabJsonWriter');
const {
  serializeCanonicalTabResultToAscii,
} = require('./writers/canonicalTabAsciiWriter');
const {
  serializeCanonicalTabResultToMusicXml,
} = require('./writers/canonicalTabMusicXmlWriter');

module.exports = {
  ENGINE_ERROR_CONTRACT_VERSION,
  FretboardError,
  PREFLIGHT_STATUS,
  convertMusicXmlToCanonicalTab,
  getPositionCandidates,
  isEngineError,
  positionToMidi,
  preflightMusicXml,
  serializeCanonicalTabResult,
  serializeCanonicalTabResultToAscii,
  serializeCanonicalTabResultToMusicXml,
  validateMidi,
};
