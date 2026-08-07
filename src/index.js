'use strict';

const {
  convertMusicXmlToCanonicalTab,
} = require('./core/conversionPipeline');
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
  FretboardError,
  PREFLIGHT_STATUS,
  convertMusicXmlToCanonicalTab,
  getPositionCandidates,
  positionToMidi,
  preflightMusicXml,
  serializeCanonicalTabResult,
  serializeCanonicalTabResultToAscii,
  serializeCanonicalTabResultToMusicXml,
  validateMidi,
};
