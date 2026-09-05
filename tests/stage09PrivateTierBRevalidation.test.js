'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runPrivateTierBAudit,
  verifyPacket,
} = require('../scripts/stage09-private-tierb-revalidation');

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'pa12-polyphonic-e2e.musicxml'));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeCase(dir, index, coverageTags) {
  const sourceName = `case-${index}.musicxml`;
  const correctedName = `case-${index}.corrected.musicxml`;
  const packetName = `case-${index}.correction-packet.json`;
  const source = Buffer.from(FIXTURE);
  const sourceText = source.toString('utf8');
  const corrected = Buffer.from(sourceText.replace(
    '<pitch><step>C</step><octave>4</octave></pitch>',
    '<pitch><step>D</step><octave>4</octave></pitch>',
  ));
  assert.notEqual(sha256(source), sha256(corrected));
  fs.writeFileSync(path.join(dir, sourceName), source);
  fs.writeFileSync(path.join(dir, correctedName), corrected);
  const packet = {
    documentType: 'Stage09TeacherCorrectionPreparedCase',
    contractVersion: '1.0.0-draft',
    caseId: `modeled-case-${index}`,
    evidenceClass: 'REAL_TEACHER_CORRECTION_PREPARED',
    work: `Modeled test case ${index}`,
    sourceId: `modeled-source-${index}`,
    sourceSoftware: ['test-fixture'],
    original: {
      fileName: sourceName,
      sha256: sha256(source),
      byteLength: source.byteLength,
      immutable: true,
    },
    reference: {
      fileName: `reference-${index}.pdf`,
      sha256: 'a'.repeat(64),
      byteLength: 1,
      referenceClass: 'TEST_ONLY',
    },
    corrected: {
      fileName: correctedName,
      sha256: sha256(corrected),
      byteLength: corrected.byteLength,
      xmlWellFormed: true,
    },
    patchIds: [`patch-${index}`],
    stage05Patches: [{
      patch_id: `patch-${index}`,
      edit_class: 'PITCH_UPDATE',
      target_event: `event-${index}`,
      before: { pitch: 'C4' },
      after: { pitch: 'D4' },
    }],
    coverageTags,
    status: 'CORRECTED_REVISION_PREPARED',
  };
  fs.writeFileSync(path.join(dir, packetName), `${JSON.stringify(packet, null, 2)}\n`);
  return packet;
}

test('private Tier B packet verification binds exact local original and corrected bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-tierb-packet-'));
  try {
    const packet = makeCase(dir, 1, ['voice-2']);
    const verified = verifyPacket(packet, dir);
    assert.equal(verified.originalSha256, packet.original.sha256);
    assert.equal(verified.correctedSha256, packet.corrected.sha256);
    assert.notEqual(verified.originalSha256, verified.correctedSha256);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('private Tier B runner executes each local case twice without committing source files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-tierb-audit-'));
  try {
    makeCase(dir, 1, ['voice-2', 'duration-or-onset']);
    makeCase(dir, 2, ['staff', 'tie']);
    makeCase(dir, 3, ['voice-3-or-4', 'chord', 'difficult-guitar-position']);
    const out = path.join(dir, 'audit-output.json');
    const report = runPrivateTierBAudit({ evidenceDir: dir, out, promote: false });
    assert.equal(report.documentType, 'Stage09PrivateTierBRevalidationAudit');
    assert.equal(report.caseCount, 3);
    assert.equal(report.sourceFilesCommitted, false);
    assert.equal(report.corpus.cases.length, 3);
    for (const entry of report.corpus.cases) {
      assert.equal(entry.stage08Audit.identityVerified, true);
      assert.equal(entry.stage08Audit.deterministic, true);
      assert.equal(entry.stage08Audit.sourceByteImmutable, true);
      assert.equal(entry.runFingerprints.length, 2);
      assert.deepEqual(entry.runFingerprints[0], entry.runFingerprints[1]);
    }
    assert.equal(fs.existsSync(out), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('promotion fails closed unless the full Stage 09 product gate passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-tierb-promote-'));
  try {
    makeCase(dir, 1, ['voice-2', 'duration-or-onset']);
    makeCase(dir, 2, ['staff', 'tie']);
    makeCase(dir, 3, ['voice-3-or-4', 'chord', 'difficult-guitar-position']);
    const out = path.join(dir, 'audit-output.json');
    assert.throws(
      () => runPrivateTierBAudit({ evidenceDir: dir, out, promote: true }),
      /Refusing promotion/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
