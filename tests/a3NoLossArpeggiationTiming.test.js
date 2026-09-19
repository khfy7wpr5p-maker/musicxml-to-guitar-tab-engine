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
const {
  createNoLossArpeggiationTimingCandidate,
} = require('../src/music/noLossArpeggiationTimingCandidate');

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function sevenNoteChordScore(onsetDivisions = 0) {
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
  const prefix = onsetDivisions > 0
    ? `<forward><duration>${onsetDivisions}</duration></forward>`
    : '';
  const suffix = 16 - onsetDivisions - 4;
  const tail = suffix > 0 ? `<forward><duration>${suffix}</duration></forward>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>A3 timing</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${prefix}${notes}${tail}
    </measure>
  </part>
</score-partwise>`;
}

function fixture(onsetDivisions = 0) {
  const source = project(sevenNoteChordScore(onsetDivisions));
  const grouping = createSimultaneousEventModel(source);
  const group = grouping.measures[0].groups[0];
  assert.equal(group.sourceEventIds.length, 7);
  const plan = createGuitarArrangementPlan(source, [{
    decisionType: 'ARPEGGIATED',
    sourceEventIds: [...group.sourceEventIds],
    sourceGroupId: group.groupId,
  }]);
  const alternative = createSourceCompleteArrangementAlternative(source, plan);
  return { source, group, alternative };
}

test('A3 no-loss arpeggiation timing creates source-order provisional timing without mutating source authority', () => {
  const { source, group, alternative } = fixture(0);
  const sourceBefore = JSON.stringify(source);
  const alternativeBefore = JSON.stringify(alternative);

  const candidate = createNoLossArpeggiationTimingCandidate(
    source,
    alternative,
    {
      sourceGroupId: group.groupId,
      spreadDivisions: 1,
    },
  );

  assert.equal(candidate.documentType, 'NoLossArpeggiationTimingCandidate');
  assert.equal(candidate.contractVersion, '1.0.0');
  assert.equal(candidate.source.partId, 'P1');
  assert.equal(candidate.sourceGroupId, group.groupId);
  assert.equal(candidate.sourceNoteLossAllowed, false);
  assert.equal(candidate.sourceTimingAuthority, true);
  assert.equal(candidate.targetTimingAuthority, false);
  assert.equal(candidate.requiresReview, true);
  assert.equal(candidate.exportAllowed, false);
  assert.equal(candidate.candidateOrderIsPreferenceRank, false);
  assert.equal(candidate.orderStrategy, 'SOURCE_ORDER');
  assert.equal(candidate.spreadDivisions, 1);
  assert.deepEqual(candidate.sourceEventIds, group.sourceEventIds);

  assert.deepEqual(
    candidate.sourceTiming.map((entry) => entry.onsetDivisions),
    [0, 0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    candidate.targetTiming.map((entry) => entry.onsetDivisions),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.ok(candidate.targetTiming.every((entry) => entry.durationDivisions === 4));

  assert.equal(candidate.decisions[0].decisionType, 'ARPEGGIATED');
  assert.deepEqual(
    candidate.decisions[0].target.orderedSourceEventIds,
    group.sourceEventIds,
  );
  assert.equal(candidate.decisions[0].target.spreadDivisions, 1);

  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(alternative), alternativeBefore);
  assert.equal(alternative.decisions[0].target, null);
});

test('A3 no-loss arpeggiation timing rejects a provisional spread that crosses the measure boundary', () => {
  const { source, group, alternative } = fixture(12);

  assert.throws(
    () => createNoLossArpeggiationTimingCandidate(
      source,
      alternative,
      {
        sourceGroupId: group.groupId,
        spreadDivisions: 1,
      },
    ),
    (error) => {
      assert.equal(error.code, 'A3_ARPEGGIATION_TARGET_TIMING_EXCEEDS_MEASURE');
      return true;
    },
  );
});
