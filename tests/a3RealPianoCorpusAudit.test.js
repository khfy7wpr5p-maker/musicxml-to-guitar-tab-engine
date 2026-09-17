'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  gitBlobSha,
  runAudit,
  validateManifest,
} = require('../scripts/a3-real-piano-corpus-audit');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a3-real-piano-'));
  const scores = path.join(root, 'scores');
  fs.mkdirSync(scores, { recursive: true });

  const files = [];
  for (let index = 0; index < 5; index += 1) {
    const relative = `scores/case-${index}.mxl`;
    const bytes = Buffer.from(`PK\u0003\u0004-a3-fixture-${index}`, 'utf8');
    fs.writeFileSync(path.join(root, relative), bytes);
    files.push({
      caseId: `case-${index}`,
      path: relative,
      gitBlobSha: gitBlobSha(bytes),
      byteLength: bytes.byteLength,
      role: index < 3 ? 'REAL_PIANO' : 'REAL_PIANO_STRESS',
    });
  }

  const manifest = {
    documentType: 'A3ProductionRealPianoCorpusManifest',
    contractVersion: '1.0.0',
    evidenceClass: 'REAL_EXTERNAL_PINNED_PIANO_MXL',
    sourceRepository: 'musetrainer/library',
    sourceCommit: '9128876f6164d96997c877a2be843349a32bdabb',
    sourceRoot: 'scores',
    requiredRunCount: 2,
    requiredSupportedCount: 5,
    files,
  };

  return { root, manifest };
}

function reviewResult() {
  return {
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    preflight: {
      issues: [{
        severity: 'warning',
        code: 'A3_REVIEW_EVIDENCE',
        category: 'content',
        details: {},
      }],
    },
    canonicalTabResult: null,
    arrangementArtifact: {
      documentType: 'NoLossArpeggiatedGuitarArrangement',
      contractVersion: '1.0.0',
      authority: 'PROVISIONAL_REVIEW_ONLY',
      sourceNoteCount: 7,
      assignedNoteCount: 7,
      unassignedNoteCount: 0,
      omittedNoteCount: 0,
      coverageBasisPoints: 10000,
      recovery: { transform: 'ARPEGGIATED' },
    },
    musicXml: '<score-partwise version="4.0"/>',
    capabilities: {
      renderScore: true,
      generateTab: true,
      editPitch: true,
      editRhythm: true,
      assignTabPosition: false,
      playback: 'APPROXIMATE',
      export: false,
    },
    artifacts: {
      provisionalTabAvailable: true,
      canonicalTabAvailable: false,
    },
  };
}

test('A3 real piano audit requires the exact five-file pinned corpus contract', () => {
  const { root, manifest } = fixture();
  try {
    assert.equal(validateManifest(manifest), manifest);
    assert.throws(
      () => validateManifest({ ...manifest, requiredSupportedCount: 4 }),
      /Invalid A3ProductionRealPianoCorpusManifest/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A3 real piano audit proves identity, determinism, immutability, TAB availability, and editability', () => {
  const { root, manifest } = fixture();
  try {
    const report = runAudit({
      sourceDirectory: root,
      manifest,
      engineCommit: 'test-head',
      processUpload: ({ bytes }) => {
        assert.ok(Buffer.isBuffer(bytes));
        return reviewResult();
      },
    });

    assert.equal(report.status, 'PASS_VERIFIED');
    assert.equal(report.summary.requiredFiles, 5);
    assert.equal(report.summary.identityVerifiedFiles, 5);
    assert.equal(report.summary.deterministicFiles, 5);
    assert.equal(report.summary.sourceImmutableFiles, 5);
    assert.equal(report.summary.supportedFiles, 5);
    assert.equal(report.summary.tabAvailableFiles, 5);
    assert.equal(report.summary.teacherEditableFiles, 5);
    assert.equal(report.summary.blockedFiles, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A3 real piano audit records production-path capability, authority, coverage, and issue evidence per case', () => {
  const { root, manifest } = fixture();
  try {
    const report = runAudit({
      sourceDirectory: root,
      manifest,
      engineCommit: 'test-head',
      processUpload: () => reviewResult(),
    });

    const record = report.records[0];
    assert.equal(record.generateTab, true);
    assert.equal(record.provisionalTabAvailable, true);
    assert.equal(record.canonicalTabAvailable, false);
    assert.equal(record.playback, 'APPROXIMATE');
    assert.equal(record.export, false);
    assert.deepEqual(record.arrangementArtifact, {
      documentType: 'NoLossArpeggiatedGuitarArrangement',
      contractVersion: '1.0.0',
      authority: 'PROVISIONAL_REVIEW_ONLY',
      policy: null,
      transform: 'ARPEGGIATED',
    });
    assert.deepEqual(record.sourceNoteCoverage, {
      sourceNoteCount: 7,
      assignedNoteCount: 7,
      unassignedNoteCount: 0,
      omittedNoteCount: 0,
      coverageBasisPoints: 10000,
    });
    assert.deepEqual(record.issueCodes, ['A3_REVIEW_EVIDENCE']);
    assert.deepEqual(record.errorCodes, []);
    assert.equal(record.sourceByteImmutable, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A3 real piano audit fails the production gate when one pinned case cannot produce usable TAB', () => {
  const { root, manifest } = fixture();
  let calls = 0;
  try {
    const report = runAudit({
      sourceDirectory: root,
      manifest,
      processUpload: () => {
        calls += 1;
        const caseIndex = Math.floor((calls - 1) / 2);
        if (caseIndex === 2) {
          return {
            status: 'BLOCKED',
            route: 'POLY_V2',
            preflight: {
              issues: [{
                severity: 'error',
                code: 'TEST_BLOCKER',
                category: 'capability',
                details: {},
              }],
            },
            canonicalTabResult: null,
            arrangementArtifact: null,
            musicXml: null,
            capabilities: {
              renderScore: false,
              generateTab: false,
              editPitch: false,
              editRhythm: false,
              assignTabPosition: false,
              export: false,
            },
            artifacts: {
              provisionalTabAvailable: false,
              canonicalTabAvailable: false,
            },
          };
        }
        return reviewResult();
      },
    });

    assert.equal(report.status, 'FAIL_AUDIT');
    assert.equal(report.summary.supportedFiles, 4);
    assert.equal(report.summary.blockedFiles, 1);
    assert.equal(report.records[2].blocker.code, 'TEST_BLOCKER');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
