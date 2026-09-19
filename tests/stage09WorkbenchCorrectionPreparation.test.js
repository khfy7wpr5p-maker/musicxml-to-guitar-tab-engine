'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  prepareWorkbenchCorrectionCase,
} = require('../scripts/stage09-prepare-workbench-correction');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixtureXml(step = 'C') {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`,
  );
}

function evidence(originalSha, correctedXml, appliedEdits) {
  return {
    documentType: 'Stage09WorkbenchCorrectionEvidence',
    contractVersion: '1.0.0',
    sourceFileName: 'teacher-omr.musicxml',
    sourceSha256: originalSha,
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    revisionNumber: appliedEdits.length,
    appliedEdits,
    correctedMusicXml: correctedXml.toString('utf8'),
  };
}

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

test('prepares a private Stage 09 correction packet from authentic Workbench pitch evidence and a reference score', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-workbench-prepare-'));
  try {
    const original = fixtureXml('C');
    const corrected = fixtureXml('D');
    const reference = Buffer.from('%PDF-1.4\n% teacher reference\n');
    const originalPath = path.join(dir, 'teacher-omr.musicxml');
    const referencePath = path.join(dir, 'teacher-reference.pdf');
    const evidencePath = path.join(dir, 'teacher.stage09-evidence.json');
    const outDir = path.join(dir, 'prepared');
    fs.writeFileSync(originalPath, original);
    fs.writeFileSync(referencePath, reference);
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(evidence(sha256(original), corrected, [pitchEdit()])),
    );

    const prepared = prepareWorkbenchCorrectionCase({
      evidencePath,
      originalPath,
      referencePath,
      outDir,
      caseId: 'teacher-case-1',
      sourceId: 'teacher-source-1',
      work: 'Teacher case 1',
      coverageTags: ['voice-2'],
    });

    assert.equal(prepared.packet.documentType, 'Stage09TeacherCorrectionPreparedCase');
    assert.equal(prepared.packet.contractVersion, '1.0.0');
    assert.equal(prepared.packet.original.sha256, sha256(original));
    assert.equal(prepared.packet.reference.sha256, sha256(reference));
    assert.equal(prepared.packet.corrected.sha256, sha256(corrected));
    assert.equal(prepared.packet.stage05Patches.length, 1);
    assert.deepEqual(prepared.packet.stage05Patches[0], {
      patch_id: 'workbench-r0-pitch',
      edit_class: 'PITCH_UPDATE',
      target_event: 'P1:measure:0:note:0',
      before: { pitch: 'C4' },
      after: { pitch: 'D4' },
    });
    assert.equal(fs.existsSync(prepared.packetPath), true);
    assert.equal(fs.existsSync(path.join(outDir, prepared.packet.original.fileName)), true);
    assert.equal(fs.existsSync(path.join(outDir, prepared.packet.reference.fileName)), true);
    assert.equal(fs.existsSync(path.join(outDir, prepared.packet.corrected.fileName)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('preparation fails closed when the exact teacher reference score is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-workbench-reference-'));
  try {
    const original = fixtureXml('C');
    const corrected = fixtureXml('D');
    const originalPath = path.join(dir, 'teacher-omr.musicxml');
    const evidencePath = path.join(dir, 'teacher.stage09-evidence.json');
    fs.writeFileSync(originalPath, original);
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(evidence(sha256(original), corrected, [pitchEdit()])),
    );

    assert.throws(
      () => prepareWorkbenchCorrectionCase({
        evidencePath,
        originalPath,
        referencePath: path.join(dir, 'missing.pdf'),
        outDir: path.join(dir, 'prepared'),
        caseId: 'teacher-case-1',
        sourceId: 'teacher-source-1',
        work: 'Teacher case 1',
        coverageTags: ['voice-2'],
      }),
      /reference score file is missing/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('preparation rejects Workbench edits that cannot be represented exactly by the Stage 05 patch ledger', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-workbench-unsupported-'));
  try {
    const original = fixtureXml('C');
    const originalPath = path.join(dir, 'teacher-omr.musicxml');
    const referencePath = path.join(dir, 'teacher-reference.pdf');
    const evidencePath = path.join(dir, 'teacher.stage09-evidence.json');
    fs.writeFileSync(originalPath, original);
    fs.writeFileSync(referencePath, Buffer.from('%PDF-1.4\n'));
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(evidence(sha256(original), original, [{
        ...pitchEdit(),
        commandType: 'SET_POLYPHONIC_SOURCE_EVENT_POSITION',
        selectedPosition: { string: 2, fret: 3 },
      }])),
    );

    assert.throws(
      () => prepareWorkbenchCorrectionCase({
        evidencePath,
        originalPath,
        referencePath,
        outDir: path.join(dir, 'prepared'),
        caseId: 'teacher-case-1',
        sourceId: 'teacher-source-1',
        work: 'Teacher case 1',
        coverageTags: ['difficult-guitar-position'],
      }),
      /cannot be represented exactly by Stage 05/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
