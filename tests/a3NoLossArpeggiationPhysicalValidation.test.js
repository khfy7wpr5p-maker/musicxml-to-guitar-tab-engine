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
const {
  validateNoLossArpeggiationTimingCandidatePhysically,
} = require('../src/music/noLossArpeggiationPhysicalValidation');

function project(xml) {
  const runtime = createMusicXmlProcessingRuntime();
  const parsed = parseParsedMusicXmlDocument(xml, {}, runtime);
  return projectParsedMusicXmlToPolyphonicSourceModel(parsed, runtime);
}

function sevenSequentiallyPlayableChordScore() {
  const notes = Array.from({ length: 7 }, (_, index) => `
      <note>
        ${index === 0 ? '' : '<chord/>'}
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>A3 physical</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>1</staves>
      </attributes>
      ${notes}
      <forward><duration>15</duration></forward>
    </measure>
  </part>
</score-partwise>`;
}

function fixture() {
  const source = project(sevenSequentiallyPlayableChordScore());
  const grouping = createSimultaneousEventModel(source);
  const group = grouping.measures[0].groups[0];
  assert.equal(group.sourceEventIds.length, 7);
  const plan = createGuitarArrangementPlan(source, [{
    decisionType: 'ARPEGGIATED',
    sourceEventIds: [...group.sourceEventIds],
    sourceGroupId: group.groupId,
  }]);
  const alternative = createSourceCompleteArrangementAlternative(source, plan);
  const candidate = createNoLossArpeggiationTimingCandidate(
    source,
    alternative,
    { sourceGroupId: group.groupId, spreadDivisions: 1 },
  );
  return { source, group, candidate };
}

test('A3 physical revalidation proves a source-complete provisional arpeggiation without granting canonical authority', () => {
  const { source, group, candidate } = fixture();
  const sourceBefore = JSON.stringify(source);
  const candidateBefore = JSON.stringify(candidate);

  const validation = validateNoLossArpeggiationTimingCandidatePhysically(
    source,
    candidate,
  );

  assert.equal(validation.documentType, 'NoLossArpeggiationPhysicalValidation');
  assert.equal(validation.contractVersion, '1.0.0');
  assert.equal(validation.status, 'FEASIBLE');
  assert.equal(validation.source.partId, 'P1');
  assert.equal(validation.sourceGroupId, group.groupId);
  assert.equal(validation.sourceNoteLossAllowed, false);
  assert.equal(validation.targetTimingAuthority, false);
  assert.equal(validation.canonicalAuthority, false);
  assert.equal(validation.exportAllowed, false);
  assert.equal(validation.requiresReview, true);
  assert.equal(validation.validationOnly, true);
  assert.equal(validation.noteSelections.length, 7);
  assert.ok(validation.noteSelections.every((entry) => entry.disposition === 'KEEP'));
  assert.ok(validation.noteSelections.every((entry) => entry.selectedPosition !== null));

  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(candidate), candidateBefore);
});
