'use strict';

const { createCanonicalMusicDocument } = require('../music/canonicalMusicDocument');
const { parseMusicXmlNotes } = require('./musicxmlNoteParser');

function parseCanonicalMusicDocument(input, options = {}) {
  const parsedDocument = parseMusicXmlNotes(input, options);
  return createCanonicalMusicDocument(parsedDocument);
}

module.exports = {
  parseCanonicalMusicDocument,
};
