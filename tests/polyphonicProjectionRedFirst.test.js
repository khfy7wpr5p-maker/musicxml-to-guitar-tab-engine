'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const publicApi = require('../src');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
  enforceMusicXmlSemanticResourceLimits,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  parseMusicXmlNotes,
} = require('../src/parser/musicxmlNoteParser');
const {
  createPolyphonicSourceModel,
  validatePolyphonicSourceModel,
} = require('../src/music/polyphonicSourceModel');
const {
  fixtures,
} = require('./fixtures/polyphonicProjectionValidFixtures');

/*
 * PA-2.2 is tests-only. These vectors deliberately do not import or provide a
 * projector implementation. They lock valid safe input and exact PA-1 output
 * expectations while proving that the existing public monophonic path remains
 * fail-closed. PA-2.3+ may consume these vectors when runtime projection is
 * separately approved.
 */

for (const fixture of fixtures) {
  test(`PA-2.2 valid vector parses safely and targets a valid PA-1 model: ${fixture.name}`, () => {
    const runtime = createMusicXmlProcessingRuntime();
    const parsed = parseParsedMusicXmlDocument(fixture.xml, {}, runtime);
    const semantic = enforceMusicXmlSemanticResourceLimits(parsed, runtime);

    assert.equal(parsed.documentType, 'ParsedMusicXmlDocument');
    assert.equal(parsed.contractVersion, '1.0.0');
    assert.ok(Object.isFrozen(parsed));
    assert.ok(Object.isFrozen(parsed.root));
    assert.equal(semantic.format, 'score-partwise');
    assert.equal(semantic.partId, 'P1');

    const target = createPolyphonicSourceModel(fixture.expectedModel);
    assert.deepEqual(target, fixture.expectedModel);
    assert.strictEqual(validatePolyphonicSourceModel(target), target);
    assert.ok(Object.isFrozen(target));
    assert.ok(Object.isFrozen(target.measures));
  });

  test(`PA-2.2 vector remains red against the protected monophonic path: ${fixture.name}`, () => {
    assert.throws(
      () => parseMusicXmlNotes(fixture.xml),
      (error) => {
        assert.equal(error.code, fixture.monophonicErrorCode);
        return true;
      },
    );
  });
}

test('PA-2.2 does not create package-root polyphonic projection authority', () => {
  const polyphonicPublicNames = Object.keys(publicApi)
    .filter((name) => name.toLowerCase().includes('polyphonic'));

  assert.deepEqual(polyphonicPublicNames, []);
});
