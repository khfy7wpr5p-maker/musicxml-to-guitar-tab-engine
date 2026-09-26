'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  MUSICXML_UPLOAD_STATUS,
  processMusicXmlUpload,
} = require('../src/app/musicXmlUploadRuntime');
const {
  decorateUploadResultWithCapabilities,
} = require('../src/app/reviewRequiredCapabilityContract');
const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  tryCreateSourceReviewIndex,
} = require('../src/app/sourceReviewIndex');
const {
  createReviewTabDraft,
} = require('../src/app/reviewTabDraft');

function endingReviewScore() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Poly</part-name></score-part></part-list>
  <part id="P1">
    <measure number="24">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><voice>1</voice><type>quarter</type>
      </note>
      <backup><duration>4</duration></backup>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><voice>2</voice><type>quarter</type>
      </note>
      <barline location="left">
        <bar-style>regular</bar-style>
        <ending number="1" type="start" default-y="40"></ending>
      </barline>
    </measure>
  </part>
</score-partwise>`);
}

test('early reviewable ending failure produces a source-anchored ReviewTabDraft without fake string/fret data', () => {
  const bytes = endingReviewScore();
  const before = Buffer.from(bytes);
  const first = processMusicXmlUpload({ fileName: 'edtab-02-ending.musicxml', bytes });
  const second = processMusicXmlUpload({ fileName: 'edtab-02-ending.musicxml', bytes });

  assert.equal(first.status, MUSICXML_UPLOAD_STATUS.REVIEW_REQUIRED);
  assert.equal(first.route, 'POLY_V2');
  assert.equal(first.canonicalTabResult, null);
  assert.equal(first.musicXml, null);

  assert.equal(first.sourceReviewIndex.documentType, 'SourceReviewIndex');
  assert.equal(first.sourceReviewIndex.contractVersion, '1.0.0');
  assert.equal(first.sourceReviewIndex.sourceUploadSha256, first.input.sha256);
  assert.equal(first.sourceReviewIndex.selectedPartId, 'P1');
  assert.equal(first.sourceReviewIndex.entries.length, 2);
  assert.deepEqual(
    first.sourceReviewIndex.entries.map((entry) => ({
      measureId: entry.measureId,
      sourceEventId: entry.sourceEventId,
      knownOnsetOrNull: entry.knownOnsetOrNull,
      knownDurationOrNull: entry.knownDurationOrNull,
      knownPitchOrNull: entry.knownPitchOrNull,
      uncertaintyReasonCodes: entry.uncertaintyReasonCodes,
    })),
    [
      {
        measureId: 'P1:measure:0',
        sourceEventId: 'P1:measure:0:note:0',
        knownOnsetOrNull: 0,
        knownDurationOrNull: 4,
        knownPitchOrNull: {
          step: 'C', alter: 0, octave: 4, written: 'C4', midi: 60,
        },
        uncertaintyReasonCodes: [],
      },
      {
        measureId: 'P1:measure:0',
        sourceEventId: 'P1:measure:0:note:1',
        knownOnsetOrNull: 0,
        knownDurationOrNull: 4,
        knownPitchOrNull: {
          step: 'E', alter: 0, octave: 4, written: 'E4', midi: 64,
        },
        uncertaintyReasonCodes: [],
      },
    ],
  );

  const draft = first.reviewTabDraft;
  assert.equal(draft.documentType, 'ReviewTabDraft');
  assert.equal(draft.contractVersion, '1.0.0');
  assert.equal(draft.authority, 'PROVISIONAL_TEACHER_REVIEW_ONLY');
  assert.equal(draft.sourceUploadSha256, first.input.sha256);
  assert.equal(draft.selectedPartId, 'P1');
  assert.equal(typeof draft.revisionId, 'string');
  assert.ok(draft.revisionId.length > 0);
  assert.equal(draft.guitarConfiguration.tuning.length, 6);
  assert.equal(draft.sourceScoreArtifact.sourceUploadSha256, first.input.sha256);
  assert.equal(draft.perNoteDisposition.length, 2);
  assert.deepEqual(
    draft.perNoteDisposition.map((entry) => ({
      sourceEventId: entry.sourceEventId,
      disposition: entry.disposition,
      selectedPosition: entry.selectedPosition,
    })),
    [
      { sourceEventId: 'P1:measure:0:note:0', disposition: 'UNASSIGNED', selectedPosition: null },
      { sourceEventId: 'P1:measure:0:note:1', disposition: 'UNASSIGNED', selectedPosition: null },
    ],
  );
  assert.equal(draft.renderModel.documentType, 'ReviewTabDraftRenderModel');
  assert.equal(draft.renderModel.contractVersion, '1.0.0');
  assert.equal(draft.renderModel.stringCount, 6);
  assert.equal(draft.renderModel.measures.length, 1);
  assert.deepEqual(
    draft.renderModel.measures[0].events.map((event) => ({
      sourceEventId: event.sourceEventId,
      displayToken: event.displayToken,
      string: event.string,
      fret: event.fret,
    })),
    [
      { sourceEventId: 'P1:measure:0:note:0', displayToken: '?', string: null, fret: null },
      { sourceEventId: 'P1:measure:0:note:1', displayToken: '?', string: null, fret: null },
    ],
  );
  assert.equal(draft.capabilities.draftVisible, true);
  assert.equal(draft.capabilities.selectSourceEvent, true);
  assert.equal(draft.capabilities.assignStringFret, false);
  assert.equal(draft.capabilities.export, false);

  assert.equal(first.capabilities.draftVisible, true);
  assert.equal(first.capabilities.generateTab, false);
  assert.equal(first.capabilities.export, false);
  assert.equal(first.artifacts.reviewTabDraftAvailable, true);
  assert.equal(first.artifacts.canonicalTabAvailable, false);

  assert.deepEqual(first, second);
  assert.deepEqual(bytes, before);
  assert.equal(Object.isFrozen(first.sourceReviewIndex), true);
  assert.equal(Object.isFrozen(first.reviewTabDraft), true);
});

test('source-index contract retains unknown duration as SOURCE_UNKNOWN without inventing a position', () => {
  const bytes = Buffer.from(
    endingReviewScore().toString('utf8').replace(
      '<duration>4</duration><voice>1</voice><type>quarter</type>',
      '<voice>1</voice><type>quarter</type>',
    ),
  );
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const parsed = parseParsedMusicXmlDocument(bytes);
  const sourceReviewIndex = tryCreateSourceReviewIndex(parsed, sha256);

  assert.ok(sourceReviewIndex);
  assert.equal(sourceReviewIndex.entries.length, 2);
  assert.equal(sourceReviewIndex.entries[0].knownDurationOrNull, null);
  assert.deepEqual(
    sourceReviewIndex.entries[0].uncertaintyReasonCodes,
    ['SOURCE_DURATION_UNKNOWN'],
  );
  assert.equal(sourceReviewIndex.entries[1].knownOnsetOrNull, null);

  const sourceScoreArtifact = {
    documentType: 'MusicXmlSourceArtifact',
    contractVersion: '1.0.0',
    sourceUploadSha256: sha256,
  };
  const draft = createReviewTabDraft({
    sourceReviewIndex,
    sourceScoreArtifact,
    issues: [],
  });

  assert.ok(draft);
  assert.equal(draft.perNoteDisposition.length, 2);
  assert.equal(draft.perNoteDisposition[0].disposition, 'SOURCE_UNKNOWN');
  assert.equal(draft.perNoteDisposition[0].selectedPosition, null);
  assert.equal(draft.perNoteDisposition[1].disposition, 'SOURCE_UNKNOWN');
  assert.equal(draft.perNoteDisposition[1].selectedPosition, null);
  assert.equal(draft.capabilities.draftVisible, true);
  assert.equal(draft.capabilities.assignStringFret, false);
  assert.equal(draft.capabilities.export, false);
});

test('source review uncertainty reasons use explicit deterministic lexical ordering', () => {
  const bytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Poly</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <note>
        <chord/>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const index = tryCreateSourceReviewIndex(parseParsedMusicXmlDocument(bytes), sha256);

  assert.ok(index);
  assert.deepEqual(index.entries[0].uncertaintyReasonCodes, [
    'SOURCE_DURATION_UNKNOWN',
    'SOURCE_ONSET_UNKNOWN',
    'SOURCE_PITCH_UNKNOWN',
  ]);
});

test('tampered draft position cannot create draft visibility or TAB authority', () => {
  const result = processMusicXmlUpload({
    fileName: 'edtab-02-tamper.musicxml',
    bytes: endingReviewScore(),
  });
  const tampered = structuredClone(result);
  tampered.reviewTabDraft.perNoteDisposition[0].selectedPosition = { string: 1, fret: 0 };

  const decorated = decorateUploadResultWithCapabilities(tampered);
  assert.equal(decorated.capabilities.draftVisible, false);
  assert.equal(decorated.artifacts.reviewTabDraftAvailable, false);
  assert.equal(decorated.capabilities.generateTab, false);
  assert.equal(decorated.capabilities.export, false);
});

test('tampered guitar configuration cannot create draft visibility', () => {
  const result = processMusicXmlUpload({
    fileName: 'edtab-02-guitar-tamper.musicxml',
    bytes: endingReviewScore(),
  });
  const tampered = structuredClone(result);
  tampered.reviewTabDraft.guitarConfiguration.tuning[0].midi += 1;

  const decorated = decorateUploadResultWithCapabilities(tampered);
  assert.equal(decorated.capabilities.draftVisible, false);
  assert.equal(decorated.artifacts.reviewTabDraftAvailable, false);
  assert.equal(decorated.capabilities.generateTab, false);
  assert.equal(decorated.capabilities.export, false);
});

test('missing draft guitar configuration fails closed without throwing', () => {
  const result = processMusicXmlUpload({
    fileName: 'edtab-02-missing-guitar.musicxml',
    bytes: endingReviewScore(),
  });
  const tampered = structuredClone(result);
  tampered.reviewTabDraft.guitarConfiguration = null;

  const decorated = decorateUploadResultWithCapabilities(tampered);
  assert.equal(decorated.capabilities.draftVisible, false);
  assert.equal(decorated.artifacts.reviewTabDraftAvailable, false);
  assert.equal(decorated.capabilities.generateTab, false);
  assert.equal(decorated.capabilities.export, false);
});

test('tampered source identity cannot create draft visibility', () => {
  const result = processMusicXmlUpload({
    fileName: 'edtab-02-source-tamper.musicxml',
    bytes: endingReviewScore(),
  });
  const tampered = structuredClone(result);
  tampered.sourceReviewIndex.entries[0].sourceEventId = 'P1:measure:0:note:999';

  const decorated = decorateUploadResultWithCapabilities(tampered);
  assert.equal(decorated.capabilities.draftVisible, false);
  assert.equal(decorated.artifacts.sourceReviewIndexAvailable, false);
  assert.equal(decorated.artifacts.reviewTabDraftAvailable, false);
  assert.equal(decorated.capabilities.generateTab, false);
});

test('unsafe XML never gains a review draft or draft visibility', () => {
  const result = processMusicXmlUpload({
    fileName: 'unsafe.musicxml',
    bytes: Buffer.from('<!DOCTYPE score [<!ENTITY x "boom">]><score>&x;</score>'),
  });

  assert.equal(result.status, MUSICXML_UPLOAD_STATUS.BLOCKED);
  assert.equal(result.reviewTabDraft ?? null, null);
  assert.equal(result.sourceReviewIndex ?? null, null);
  assert.equal(result.capabilities.draftVisible, false);
  assert.equal(result.capabilities.generateTab, false);
  assert.equal(result.artifacts.reviewTabDraftAvailable, false);
  assert.equal(result.capabilities.export, false);
});
