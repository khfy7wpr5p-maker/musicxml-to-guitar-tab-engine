'use strict';

const {
  serializeCanonicalTabResultToMusicXml,
} = require('../../src/writers/canonicalTabMusicXmlWriter');
const {
  createCanonicalTabCompatibilityFixture,
} = require('../fixtures/compatibility/canonicalTabCompatibilityFixture');

process.stdout.write(serializeCanonicalTabResultToMusicXml(
  createCanonicalTabCompatibilityFixture(),
  {
    pretty: true,
    trailingNewline: true,
  },
));
