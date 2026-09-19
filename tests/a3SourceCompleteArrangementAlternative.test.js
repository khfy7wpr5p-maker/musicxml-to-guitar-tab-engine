'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  createMusicXmlProcessingRuntime,
} = require('../src/parser/musicxmlSemanticResourceLimits');
const {
  projectParsedMusicXmlToPolyphonicSourceModel,
} = require('../src/parser/polyphonicMusicXmlProjector');
const {
  createSimultaneousEventModel,
} = require('../src/music/simultaneousEventModel');
const {
  createGuitarArrangementPlan,
} = require('../src/music/guitarArrangementPlan');
const {
  createSourceCompleteArrangementAlternative,
} = require('../src/music/sourceCompleteArrangementAlternative');

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function sevenNoteChordScore() {
  const pitches = [
    ['C', 4], ['D', 4], ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4],
  ];
  const notes = pitches.map(([step, octave], index) => `
      <note>
        ${index === 0 ? '' : '<chord/>'}
        <pitch><step>${step}</step><octave>${octave}</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>A3 dense chord</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>${notes}
      <forward><duration>12</duration></forward>
    </measure>
  </part>
</score-partwise>`;
}

function sourceAndGroup() {
  const source = project(sevenNoteChordScore());
  const grouping = createSimultaneousEventModel(source);
  const group = grouping.measures[0].groups[0];
  assert.equal(group.sourceEventIds.length, 7);
  return { source, group };
}

test('A3 source-complete alternative maps ARPEGGIATED plan without note loss or target timing authority', () => {
  const { source, group } = sourceAndGroup();
  const plan = createGuitarArrangementPlan(source, [{
    decisionType: 'ARPEGGIATED',
    sourceEventIds: [...group.sourceEventIds],
    sourceGroupId: group.groupId,
  }]);

  const alternative = createSourceCompleteArrangementAlternative(source, plan);

  assert.equal(alternative.documentType, 'SourceCompleteGuitarArrangementAlternative');
  assert.equal(alternative.contractVersion, '1.0.0');
  assert.equal(alternative.source.partId, 'P1');
  assert.equal(alternative.sourceNoteLossAllowed, false);
  assert.equal(alternative.sourceTimingAuthority, true);
  assert.equal(alternative.targetTimingAuthority, false);
  assert.equal(alternative.requiresReview, true);
  assert.equal(alternative.exportAllowed, false);
  assert.deepEqual(alternative.sourceEventIds, group.sourceEventIds);
  assert.equal(alternative.decisions.length, 1);
  assert.equal(alternative.decisions[0].decisionType, 'ARPEGGIATED');
  assert.equal(alternative.decisions[0].sourceGroupId, group.groupId);
  assert.deepEqual(alternative.decisions[0].sourceEventIds, group.sourceEventIds);
  assert.equal(alternative.decisions[0].target, null);

  assert.equal(alternative.sourceTiming.length, 7);
  assert.deepEqual(
    alternative.sourceTiming.map((entry) => entry.sourceEventId),
    group.sourceEventIds,
  );
  assert.ok(alternative.sourceTiming.every((entry) => entry.onsetDivisions === 0));
  assert.ok(alternative.sourceTiming.every((entry) => entry.durationDivisions === 4));
});

test('A3 source-complete alternative rejects lossy reduction decisions', () => {
  const { source, group } = sourceAndGroup();
  const survivors = group.sourceEventIds.slice(0, 6);
  const plan = createGuitarArrangementPlan(source, [{
    decisionType: 'CHORD_REDUCED',
    sourceEventIds: [...group.sourceEventIds],
    sourceGroupId: group.groupId,
  }]);

  assert.equal(survivors.length, 6);
  assert.throws(
    () => createSourceCompleteArrangementAlternative(source, plan),
    (error) => {
      assert.equal(error.code, 'NON_SOURCE_COMPLETE_ARRANGEMENT_DECISION');
      return true;
    },
  );
});
