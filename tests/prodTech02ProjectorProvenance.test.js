'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseParsedMusicXmlDocument } = require('../src/parser/parsedMusicXmlDocument');
const { PolyphonicMusicXmlProjectorError } = require('../src/parser/polyphonicMusicXmlProjector');
const {
  projectParsedMusicXmlThroughPolyProductionCompatibilityChain,
} = require('../src/app/polyProductionCompatibilityNormalizationChain');

function score(noteBodies) {
  return parseParsedMusicXmlDocument(`<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>${noteBodies.join('')}</measure></part></score-partwise>`);
}

function note(step, octave, extra = '') {
  return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>${extra}</note>`;
}

function baselineScore() {
  return score([
    note('E', 4),
    note('F', 4),
  ]);
}

function techniqueScore() {
  return score([
    note('E', 4, '<notations><technical><harmonic/><hammer-on number="1" type="start">H</hammer-on></technical><slide number="5" type="start"/></notations>'),
    note('F', 4, '<notations><technical><hammer-on number="1" type="stop"/><fingering>2</fingering><pluck>2</pluck></technical><slide number="5" type="stop"/></notations><play><mute>straight</mute></play>'),
  ]);
}

test('PROD-TECH-02 projects verified SAFE_METADATA_ONLY technique provenance without changing source model', () => {
  const baseline = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(baselineScore());
  const source = techniqueScore();
  const before = structuredClone(source);
  const projected = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(source);

  assert.deepEqual(source, before);
  assert.deepEqual(projected.sourceModel, baseline.sourceModel);
  assert.deepEqual(projected.mainSourceModel, baseline.mainSourceModel);
  assert.equal(projected.guitarTechniqueProvenance.status, 'EXPLICIT');
  assert.equal(projected.guitarTechniqueProvenance.capabilityClass, 'SAFE_METADATA_ONLY');
  assert.equal(projected.guitarTechniqueProvenance.physicalSemanticsEnabled, false);
  assert.equal(projected.guitarTechniqueProvenance.recordCount, 8);
  const hammers = projected.guitarTechniqueProvenance.records.filter((entry) => entry.kind === 'HAMMER_ON');
  assert.equal(hammers.length, 2);
  assert.ok(hammers[0].pairingId);
  assert.equal(hammers[0].pairingId, hammers[1].pairingId);
  assert.equal(hammers[0].pairingBasis, 'DETERMINISTIC_SOURCE_IDENTITY');
  assert.equal(hammers[0].sourcePairingToken, hammers[1].sourcePairingToken);
  const slides = projected.guitarTechniqueProvenance.records.filter((entry) => entry.kind === 'SLIDE');
  assert.ok(slides.every((entry) => entry.pairingId === null));
  assert.ok(projected.ignoredFeatures.includes('notation:technical:hammer-on-provenance'));
  assert.ok(projected.ignoredFeatures.includes('notation:slide:guitar-technique-provenance'));
  assert.ok(projected.ignoredFeatures.includes('notation:technical:harmonic-provenance'));
  assert.ok(projected.ignoredFeatures.includes('notation:technical:fingering-provenance'));
  assert.ok(projected.ignoredFeatures.includes('notation:technical:pluck-provenance'));
  assert.ok(projected.ignoredFeatures.includes('note:play:straight-mute-provenance'));
});

test('PROD-TECH-02 metadata-only projection is deterministic across exactly two runs', () => {
  const source = techniqueScore();
  const first = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(source);
  const second = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(source);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('PROD-TECH-02 keeps unknown and ambiguous technique structures fail-closed', () => {
  const cases = [
    {
      source: score([note('E', 4, '<notations><technical><pull-off number="1" type="start">P</pull-off></technical></notations>')]),
      feature: 'notation:technical',
    },
    {
      source: score([note('E', 4, '<notations><slide number="5" type="stop"/></notations>')]),
      feature: 'notation:slide',
    },
    {
      source: score([note('E', 4, '<play><mute>palm</mute></play>')]),
      feature: 'note-child:play',
    },
    {
      source: score([note('E', 4, '<notations><technical><harmonic><artificial/><base-pitch/></harmonic></technical></notations>')]),
      feature: 'notation:technical',
    },
  ];

  for (const { source, feature } of cases) {
    assert.throws(
      () => projectParsedMusicXmlThroughPolyProductionCompatibilityChain(source),
      (error) => error instanceof PolyphonicMusicXmlProjectorError
        && error.code === 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE'
        && error.details.feature === feature,
      feature,
    );
  }
});
