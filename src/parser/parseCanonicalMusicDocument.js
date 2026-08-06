'use strict';

const { resolveProcessingRuntime } = require('../core/processingRuntime');
const { createCanonicalMusicDocument } = require('../music/canonicalMusicDocument');
const { parseMusicXmlNotes } = require('./musicxmlNoteParser');

function parseCanonicalMusicDocument(input, options = {}, runtime = null) {
  const processing = resolveProcessingRuntime(options, runtime);
  processing.checkpoint('canonical-document:start');
  const parsedDocument = parseMusicXmlNotes(input, {}, processing);
  processing.checkpoint('canonical-document:projection');
  const canonicalDocument = createCanonicalMusicDocument(parsedDocument);
  processing.checkpoint('canonical-document:complete');
  return canonicalDocument;
}

module.exports = {
  parseCanonicalMusicDocument,
};
