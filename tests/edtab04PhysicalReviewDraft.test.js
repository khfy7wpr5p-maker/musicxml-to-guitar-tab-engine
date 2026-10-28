'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { processMusicXmlUpload } = require('../src/app/musicXmlUploadRuntime');
const { processReviewTabDraftEdit } = require('../src/app/reviewTabDraftEditRuntime');

const fileName = 'physical-review.musicxml';
const original = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Physical review</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
<backup><duration>16</duration></backup>
<note><pitch><step>A</step><octave>5</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>
</measure></part></score-partwise>`);

function configuredSource(tuningLowToHigh, capoFret) {
  const tuning = tuningLowToHigh.map((pitch, index) => (
    `<staff-tuning line="${index + 1}"><tuning-step>${pitch[0]}</tuning-step><tuning-octave>${pitch[1]}</tuning-octave></staff-tuning>`
  )).join('');
  const details = `<staff-details><staff-lines>6</staff-lines>${tuning}<capo>${capoFret}</capo></staff-details>`;
  return Buffer.from(original.toString('utf8').replace('</attributes>', `${details}</attributes>`));
}

for (const [name, tuning, fret, topMidi, bottomMidi] of [
  ['standard', ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], 16, 64, 40],
  ['DADGAD', ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'], 18, 62, 38],
]) {
  test(`physical review preserves ${name} capo facts across JSON and validates relative frets`, () => {
    const bytes = configuredSource(tuning, 1);
    const before = Buffer.from(bytes);
    const upload = processMusicXmlUpload({ fileName, bytes });
    assert.equal(upload.status, 'REVIEW_REQUIRED');
    assert.ok(upload.arrangementArtifact);
    assert.equal(upload.reviewTabDraft?.documentType, 'ReviewTabDraft');
    const wire = JSON.parse(JSON.stringify(upload));
    const guitar = wire.reviewTabDraft.guitarConfiguration;
    assert.equal(guitar.capoFret, 1);
    assert.equal(guitar.fretSemantics, 'RELATIVE_FROM_CAPO');
    assert.equal(guitar.tuning[0].midi, topMidi);
    assert.equal(guitar.tuning[5].midi, bottomMidi);
    // A5 = MIDI 81. Open string + capo + relative fret must be 81.
    assert.equal(guitar.tuning[0].midi + guitar.capoFret + fret, 81);

    const request = { fileName, bytes, expectedInputSha256: upload.input.sha256,
      baseRevisionId: upload.reviewTabDraft.revisionId };
    const edited = processReviewTabDraftEdit({ ...request,
      commands: [{ sourceEventId: 'P1:measure:0:note:0', selectedPosition: { string: 1, fret } }] });
    assert.equal(edited.status, 'REVIEW_REQUIRED');
    assert.deepEqual(edited.reviewTabDraft.perNoteDisposition[0].selectedPosition, { string: 1, fret });
    assert.equal(JSON.parse(JSON.stringify(edited)).reviewTabDraft.guitarConfiguration.capoFret, 1);
    assert.equal(edited.capabilities.export, false);
    assert.equal(edited.canonicalTabResult, null);

    const wrong = processReviewTabDraftEdit({ ...request,
      commands: [{ sourceEventId: 'P1:measure:0:note:0', selectedPosition: { string: 1, fret: fret + 1 } }] });
    assert.equal(wrong.status, 'BLOCKED');
    assert.equal(wrong.preflight.issues[0].code, 'REVIEW_DRAFT_POSITION_PITCH_MISMATCH');
    assert.equal(wrong.capabilities.export, false);
    assert.equal(wrong.canonicalTabResult, null);
    assert.deepEqual(bytes, before);
    assert.deepEqual(processMusicXmlUpload({ fileName, bytes }), upload);
  });
}

test('physical-point review yields an editable evidence-bound draft but no canonical authority', () => {
  const before = Buffer.from(original);
  const upload = processMusicXmlUpload({ fileName, bytes: original });
  assert.equal(upload.status, 'REVIEW_REQUIRED');
  assert.equal(upload.route, 'POLY_V2');
  assert.ok(upload.preflight.issues.some((issue) => (
    issue.code === 'UNSUPPORTED_DETERMINISTIC_POLYPHONIC_FINAL_SELECTION'
      && issue.details?.reason === 'NO_PLAYABLE_FINAL_SELECTION_CANDIDATE'
  )));
  assert.ok(upload.arrangementArtifact);
  assert.equal(upload.reviewTabDraft?.documentType, 'ReviewTabDraft');
  assert.equal(upload.sourceReviewIndex?.entries.length, 2);
  const edited = processReviewTabDraftEdit({
    fileName, bytes: original,
    expectedInputSha256: crypto.createHash('sha256').update(original).digest('hex'),
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [{ sourceEventId: 'P1:measure:0:note:0',
      selectedPosition: { string: 1, fret: 17 } }],
  });
  assert.equal(edited.status, 'REVIEW_REQUIRED');
  assert.equal(edited.reviewTabDraft.perNoteDisposition[0].disposition, 'ASSIGNED');
  assert.equal(edited.capabilities.export, false);
  assert.equal(edited.canonicalTabResult, null);
  assert.deepEqual(original, before);
  assert.deepEqual(processMusicXmlUpload({ fileName, bytes: original }), upload);
});

test('physical review rejects stale source/revision identity and simultaneous string collisions', () => {
  const upload = processMusicXmlUpload({ fileName, bytes: original });
  const base = { fileName, bytes: original, expectedInputSha256: upload.input.sha256,
    baseRevisionId: upload.reviewTabDraft.revisionId,
    commands: [{ sourceEventId: 'P1:measure:0:note:0', selectedPosition: { string: 1, fret: 17 } }] };
  const cases = [
    [{ ...base, bytes: Buffer.concat([original, Buffer.from('\n')]) }, 'STALE_REVIEW_DRAFT_SOURCE'],
    [{ ...base, baseRevisionId: 'review:another-source:0' }, 'STALE_REVIEW_DRAFT_REVISION'],
    [{ ...base, commands: [...base.commands,
      { sourceEventId: 'P1:measure:0:note:1', selectedPosition: { string: 1, fret: 17 } }] },
    'REVIEW_DRAFT_STRING_COLLISION'],
  ];
  for (const [request, code] of cases) {
    const result = processReviewTabDraftEdit(request);
    assert.equal(result.status, 'BLOCKED', code);
    assert.equal(result.preflight.issues[0].code, code);
    assert.equal(result.canonicalTabResult, null);
    assert.equal(result.capabilities.export, false);
  }
});

test('physical review never substitutes default tuning for incomplete source guitar configuration', () => {
  const details = '<staff-details><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>D</tuning-step><tuning-octave>2</tuning-octave></staff-tuning></staff-details>';
  const bytes = Buffer.from(original.toString('utf8').replace('</attributes>', `${details}</attributes>`));
  const before = Buffer.from(bytes);
  const result = processMusicXmlUpload({ fileName, bytes });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.preflight.issues[0].code, 'INVALID_GUITAR_CONFIGURATION_PROVENANCE');
  assert.equal(result.reviewTabDraft, undefined);
  assert.equal(result.canonicalTabResult, null);
  assert.equal(result.capabilities.export, false);
  assert.deepEqual(bytes, before);
});
