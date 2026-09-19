'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStage09WorkbenchEvidenceExport,
  isStage09WorkbenchEvidenceEligible,
} = require('../web/guitar-tab-workbench/stage09-evidence');

function pitchEdit() {
  return {
    revisionIndex: 0,
    commandType: 'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH',
    measureIndex: 0,
    measureNumber: '1',
    sourceOrder: 0,
    sourceEventId: 'P1:measure:0:note:0',
    sourceGroupId: null,
    sourceGroupEventIds: ['P1:measure:0:note:0'],
    sourceTieEventIds: ['P1:measure:0:note:0'],
    affectedEventCount: 1,
    beforePitch: { written: 'C4', step: 'C', alter: 0, octave: 4 },
    afterPitch: { written: 'D4', step: 'D', alter: 0, octave: 4 },
    beforeDurationDivisions: 4,
    afterDurationDivisions: 4,
    changed: true,
  };
}

function runtimeResult(appliedEdits = [pitchEdit()]) {
  return {
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    input: { sha256: 'a'.repeat(64) },
    revision: {
      revisionNumber: appliedEdits.length,
      appliedEdits,
    },
    musicXml: '<renderer-only/>',
  };
}

test('Stage 09 Workbench evidence exports exact source identity and authoritative applied edits only', () => {
  const result = runtimeResult();
  assert.equal(isStage09WorkbenchEvidenceEligible(result), true);

  const exported = createStage09WorkbenchEvidenceExport({
    sourceFileName: 'teacher-omr.musicxml',
    runtimeResult: result,
  });

  assert.equal(exported.documentType, 'Stage09WorkbenchCorrectionEvidence');
  assert.equal(exported.contractVersion, '1.0.0');
  assert.equal(exported.sourceFileName, 'teacher-omr.musicxml');
  assert.equal(exported.sourceSha256, 'a'.repeat(64));
  assert.equal(exported.status, 'REVIEW_REQUIRED');
  assert.equal(exported.route, 'POLY_V2');
  assert.equal(exported.revisionNumber, 1);
  assert.deepEqual(exported.appliedEdits, [pitchEdit()]);
  assert.equal(Object.hasOwn(exported, 'correctedMusicXml'), false);
});

test('Stage 09 Workbench evidence admits only single-event pitch corrections in the first Tier-B slice', () => {
  const durationOnly = {
    ...pitchEdit(),
    commandType: 'SET_POLYPHONIC_SOURCE_EVENT_DURATION',
    beforePitch: { written: 'C4', step: 'C', alter: 0, octave: 4 },
    afterPitch: { written: 'C4', step: 'C', alter: 0, octave: 4 },
    beforeDurationDivisions: 4,
    afterDurationDivisions: 2,
  };
  assert.equal(isStage09WorkbenchEvidenceEligible(runtimeResult([durationOnly])), false);
});

test('Stage 09 Workbench evidence does not admit position-only or omitted-note assignment edits', () => {
  const positionOnly = {
    ...pitchEdit(),
    commandType: 'SET_POLYPHONIC_SOURCE_EVENT_POSITION',
    selectedPosition: { string: 2, fret: 3 },
  };
  const omittedAssignment = {
    ...pitchEdit(),
    commandType: 'ASSIGN_OMITTED_POLYPHONIC_SOURCE_EVENT_POSITION',
    assignmentMode: 'ASSIGN_OMITTED',
    selectedPosition: { string: 2, fret: 3 },
  };

  assert.equal(isStage09WorkbenchEvidenceEligible(runtimeResult([positionOnly])), false);
  assert.equal(isStage09WorkbenchEvidenceEligible(runtimeResult([omittedAssignment])), false);
});

test('Stage 09 Workbench evidence requires a non-empty real edit revision', () => {
  assert.equal(isStage09WorkbenchEvidenceEligible(runtimeResult([])), false);
  assert.throws(
    () => createStage09WorkbenchEvidenceExport({
      sourceFileName: 'teacher-omr.musicxml',
      runtimeResult: runtimeResult([]),
    }),
    /not eligible for Stage 09 evidence export/,
  );
});
