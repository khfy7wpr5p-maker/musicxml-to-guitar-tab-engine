'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  projectParsedMusicXmlThroughPolyProductionCompatibilityChain,
} = require('../src/app/polyProductionCompatibilityNormalizationChain');

function score(direction) {
  return parseParsedMusicXmlDocument(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <identification><encoding><software>Direction regression fixture</software></encoding></identification>
  <defaults/>
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      ${direction}
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>16</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`);
}

test('production chain removes bounded performance-only direction before runtime representation normalization', () => {
  const source = score(`
    <direction placement="above">
      <direction-type><words font-style="italic">rit.</words></direction-type>
      <staff>1</staff>
    </direction>
  `);

  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(source);

  assert.equal(result.sourceModel.eventCount, 1);
  assert.equal(result.sourceModel.measures[0].events[0].pitch.written, 'E3');
  assert.equal(result.ignoredDirectionCount, 1);
  assert.deepEqual(result.ignoredDirectionFeatureCounts, {
    'direction:words': 1,
  });
  assert.ok(result.ignoredFeatures.includes('direction:words'));
});

test('production chain accepts exact bounded pedal and wedge directions without mutating source', () => {
  const source = score(`
    <direction placement="below">
      <direction-type><pedal type="start" line="yes"/></direction-type>
      <staff>1</staff>
    </direction>
    <direction placement="above">
      <direction-type><wedge type="crescendo" number="1"/></direction-type>
      <staff>1</staff>
    </direction>
  `);
  const sourceBefore = JSON.stringify(source);

  const result = projectParsedMusicXmlThroughPolyProductionCompatibilityChain(source);

  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(result.sourceModel.eventCount, 1);
  assert.equal(result.ignoredDirectionCount, 2);
  assert.deepEqual(result.ignoredDirectionFeatureCounts, {
    'direction:pedal': 1,
    'direction:wedge': 1,
  });
});

test('production chain still fails closed for structural playback directions', () => {
  const source = score(`
    <direction>
      <direction-type><words>Da Capo</words></direction-type>
      <sound dacapo="yes"/>
    </direction>
  `);

  assert.throws(
    () => projectParsedMusicXmlThroughPolyProductionCompatibilityChain(source),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
      assert.equal(error.details.feature, 'direction');
      return true;
    },
  );
});

test('production chain preserves stricter validation for offset and inner direction shapes', () => {
  for (const direction of [
    '<direction><offset>1</offset><direction-type><words>rit.</words></direction-type></direction>',
    '<direction><direction-type><dynamics><pp/></dynamics></direction-type></direction>',
    '<direction><direction-type><words><display-text>rit.</display-text></words></direction-type></direction>',
    '<direction><direction-type><words>Da Capo</words></direction-type></direction>',
    '<direction><direction-type><pedal type="unknown" line="yes"/></direction-type></direction>',
    '<direction><direction-type><wedge type="crescendo" spread="12"/></direction-type></direction>',
    '<direction placement="sideways"><direction-type><words>rit.</words></direction-type></direction>',
    '<direction><direction-type><words>rit.</words></direction-type><staff>1</staff><staff>2</staff></direction>',
    '<direction><direction-type><words>rit.</words></direction-type><staff>3</staff></direction>',
  ]) {
    assert.throws(
      () => projectParsedMusicXmlThroughPolyProductionCompatibilityChain(score(direction)),
      (error) => {
        assert.equal(error.code, 'UNSUPPORTED_POLYPHONIC_PROJECTION_FEATURE');
        assert.equal(error.details.feature, 'direction');
        return true;
      },
    );
  }
});
