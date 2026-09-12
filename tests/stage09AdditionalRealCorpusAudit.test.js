'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUDIT_CONTRACT_VERSION,
  USABLE_OUTPUT_GATE_STATUS,
  buildUsableOutputRecord,
  gitBlobSha,
  runAudit,
  usableOutputSummaryMarkdown,
  validateManifest,
} = require('../scripts/stage09-additional-real-corpus-audit');
const {
  CAPABILITY_STATUS,
  REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
} = require('../src/app/reviewEditorBackend');
const {
  createReviewEditorCapabilitySession,
} = require('../src/app/reviewEditorCapabilityBridge');
const { EDIT_CLASS } = require('../src/app/teacherCorrectionRevision');

function syntheticCorpus({ poly = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stage09-additional-'));
  const files = [];
  for (let index = 0; index < 11; index += 1) {
    const pathName = `fixture-${index}.xml`;
    const body = poly
      ? `<score-partwise><part><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note><backup><duration>1</duration></backup><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice></note></measure></part><!--${index}--></score-partwise>`
      : `<score-partwise><!--${index}--></score-partwise>`;
    const bytes = Buffer.from(body);
    fs.writeFileSync(path.join(directory, pathName), bytes);
    files.push({ path: pathName, gitBlobSha: gitBlobSha(bytes), byteLength: bytes.byteLength });
  }
  return {
    directory,
    manifest: {
      documentType: 'Stage09AdditionalRealMusicXmlCorpusManifest',
      contractVersion: '1.0.0',
      evidenceClass: 'REAL_EXTERNAL_PINNED_MUSICXML',
      sourceRepository: 'synthetic/test-only',
      sourceCommit: 'a'.repeat(40),
      sourceRoot: '.',
      requiredRunCount: 2,
      files,
    },
  };
}

function blocked(route = 'POLY_V2') {
  return {
    status: 'BLOCKED',
    route,
    preflight: {
      issues: [{ severity: 'error', category: 'capability', code: 'TEST_BLOCKER' }],
    },
    canonicalTabResult: null,
    musicXml: null,
  };
}

function usablePass() {
  return {
    status: 'PASS',
    route: 'MONO_V1',
    preflight: { issues: [] },
    canonicalTabResult: {
      documentType: 'CanonicalTabResult',
      noteCount: 1,
    },
    musicXml: '<score-partwise><part-list/></score-partwise>',
    capabilities: {
      renderScore: true,
      generateTab: true,
      editPitch: true,
      editRhythm: false,
      editVoice: false,
      editStructure: false,
      export: true,
    },
    artifacts: {
      sourceScoreGraphAvailable: true,
      rendererMusicXmlAvailable: true,
      provisionalTabAvailable: false,
      canonicalTabAvailable: true,
    },
  };
}

function usableReview(bytes, fileName = 'review.musicxml') {
  return {
    status: 'REVIEW_REQUIRED',
    route: 'POLY_V2',
    resultSchemaVersion: '1.2.0',
    capabilityContractVersion: '1.0.0',
    input: {
      fileName,
      byteLength: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    },
    scoreAvailable: true,
    preflight: { issues: [] },
    canonicalTabResult: {
      documentType: 'CanonicalTabResult',
      noteCount: 1,
    },
    musicXml: '<score-partwise><part-list/></score-partwise>',
    capabilities: {
      renderScore: true,
      generateTab: true,
      editPitch: false,
      editRhythm: false,
      editVoice: false,
      editStructure: false,
      editTab: false,
      editFingering: false,
      export: false,
    },
    artifacts: {
      provisionalTabAvailable: true,
      canonicalTabAvailable: false,
    },
    issues: [{
      issueId: 'issue-pitch-1',
      severity: 'error',
      category: 'semantic',
      code: 'OMR_SUSPECTED_PITCH',
      message: 'Pitch requires teacher review.',
      teacherActionRequired: true,
      allowedActions: ['EDIT_MANUALLY'],
      location: { measure: 1, measureIndex: 0, eventIndex: 0, sourceEventId: 'event-1' },
    }],
  };
}

function reviewEditorManifest() {
  return {
    contractVersion: REVIEW_EDITOR_BACKEND_CONTRACT_VERSION,
    adapterId: 'stage09-audit-editor-test',
    capabilities: Object.fromEntries(Object.values(EDIT_CLASS).map((editClass) => [
      editClass,
      editClass === EDIT_CLASS.PITCH_UPDATE
        ? CAPABILITY_STATUS.AVAILABLE
        : CAPABILITY_STATUS.UNAVAILABLE,
    ])),
    history: { undo: true, redo: true },
    revalidate: true,
  };
}

function openReviewEditor({ uploadResult, sourceBytes, path: pathName = 'review.musicxml' }) {
  return createReviewEditorCapabilitySession({
    sessionId: `stage09:${uploadResult.input.sha256.slice(0, 16)}`,
    uploadResult,
    sourceBytes,
    reviewMetadata: {
      revision_id: `stage09-review:${uploadResult.input.sha256.slice(0, 16)}`,
      actor: { kind: 'SYSTEM', id: 'stage09-audit' },
      timestamp: '2026-09-12T00:00:00.000Z',
      reason: 'Verify Stage 06 teacher-editor admission.',
      provenance: { source: 'STAGE09_AUDIT', path: pathName },
    },
    adapterManifest: reviewEditorManifest(),
    adapterState: { documentId: uploadResult.input.sha256 },
  });
}

test('additional real-corpus manifest requires exactly eleven unique pinned blob identities', () => {
  const corpus = syntheticCorpus();
  try {
    assert.equal(validateManifest(corpus.manifest), corpus.manifest);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('additional corpus audit verifies identity, deterministic reruns and source immutability', () => {
  const corpus = syntheticCorpus();
  try {
    const report = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blocked(),
      engineCommit: 'b'.repeat(40),
    });
    assert.equal(report.status, 'PASS_VERIFIED');
    assert.equal(report.contractVersion, AUDIT_CONTRACT_VERSION);
    assert.equal(report.contractVersion, '1.1.0');
    assert.equal(report.summary.requiredFiles, 11);
    assert.equal(report.summary.identityVerifiedFiles, 11);
    assert.equal(report.summary.deterministicFiles, 11);
    assert.equal(report.summary.sourceImmutableFiles, 11);
    assert.equal(report.summary.outputSemanticsValidFiles, 11);
    assert.equal(report.usableOutputGate.status, USABLE_OUTPUT_GATE_STATUS.FAIL);
    assert.equal(report.usableOutputGate.summary.eligibleFiles, 11);
    assert.equal(report.usableOutputGate.summary.sourceRenderableFiles, 0);
    assert.equal(report.usableOutputGate.summary.tabArtifactFiles, 0);
    assert.equal(report.usableOutputGate.summary.teacherEditableFiles, 0);
    assert.deepEqual(report.usableOutputGate.gaps, [
      'SOURCE_RENDERABLE_FILES_0_OF_11',
      'TAB_ARTIFACT_FILES_0_OF_11',
      'TEACHER_EDITABLE_FILES_0_OF_11',
    ]);
    assert.equal(report.records[0].usableOutputEligible, true);
    assert.equal(report.records[0].sourceRenderable, false);
    assert.equal(report.records[0].tabArtifactAvailable, false);
    assert.equal(report.records[0].canonicalAvailable, false);
    assert.equal(report.records[0].teacherEditable, false);
    assert.equal(report.records[0].tabCoverageBasisPoints, null);
    assert.deepEqual(report.records[0].hardBlockReason, {
      code: 'TEST_BLOCKER',
      category: 'capability',
      feature: null,
    });
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('usable-output record requires real artifacts and capabilities instead of trusting PASS alone', () => {
  const advertisedOnly = buildUsableOutputRecord({
    status: 'PASS',
    route: 'MONO_V1',
    capabilities: {
      renderScore: true,
      generateTab: true,
      editPitch: true,
      export: true,
    },
    canonicalTabResult: null,
    musicXml: null,
  }, { sourceParseable: true, blocker: null });
  assert.equal(advertisedOnly.sourceRenderable, false);
  assert.equal(advertisedOnly.tabArtifactAvailable, false);
  assert.equal(advertisedOnly.canonicalAvailable, false);
  assert.equal(advertisedOnly.teacherEditable, false);

  const observed = buildUsableOutputRecord(usablePass(), {
    sourceParseable: true,
    blocker: null,
  });
  assert.equal(observed.usableOutputEligible, true);
  assert.equal(observed.sourceRenderable, true);
  assert.equal(observed.tabArtifactAvailable, true);
  assert.equal(observed.canonicalAvailable, true);
  assert.equal(observed.teacherEditable, true);
  assert.equal(observed.tabSourceNoteCount, 1);
  assert.equal(observed.tabAssignedNoteCount, 1);
  assert.equal(observed.tabUnassignedNoteCount, 0);
  assert.equal(observed.tabCoverageBasisPoints, 10_000);
});

test('REVIEW_REQUIRED editability is measured through the Stage 06 session adapter manifest', () => {
  const bytes = Buffer.from('<score-partwise><part-list/></score-partwise>');
  const result = usableReview(bytes);
  const withoutBridge = buildUsableOutputRecord(result, {
    sourceParseable: true,
    blocker: null,
  });
  assert.equal(withoutBridge.teacherEditable, false);

  const reviewEditorSession = openReviewEditor({ uploadResult: result, sourceBytes: bytes });
  const bridged = buildUsableOutputRecord(result, {
    sourceParseable: true,
    blocker: null,
    reviewEditorSession,
  });
  assert.equal(result.capabilities.editPitch, false);
  assert.equal(bridged.sourceRenderable, true);
  assert.equal(bridged.tabArtifactAvailable, true);
  assert.equal(bridged.canonicalAvailable, false);
  assert.equal(bridged.teacherEditable, true);
});

test('real-corpus runner passes Stage 06 session evidence into the usable-output gate', () => {
  const corpus = syntheticCorpus();
  try {
    const report = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: ({ fileName, bytes }) => usableReview(bytes, fileName),
      reviewEditorSessionFactory: openReviewEditor,
    });
    assert.equal(report.usableOutputGate.summary.teacherEditableFiles, 11);
    assert.equal(report.records.every((record) => record.teacherEditable), true);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('usable-output gate passes only when every eligible score renders, has TAB, and is teacher-editable', () => {
  const corpus = syntheticCorpus();
  try {
    const report = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => usablePass(),
    });
    assert.equal(report.status, 'PASS_VERIFIED');
    assert.equal(report.usableOutputGate.status, USABLE_OUTPUT_GATE_STATUS.PASS);
    assert.equal(report.usableOutputGate.summary.sourceRenderableFiles, 11);
    assert.equal(report.usableOutputGate.summary.tabArtifactFiles, 11);
    assert.equal(report.usableOutputGate.summary.canonicalFiles, 11);
    assert.equal(report.usableOutputGate.summary.teacherEditableFiles, 11);
    assert.equal(report.usableOutputGate.summary.aggregateTabCoverageBasisPoints, 10_000);
    assert.deepEqual(report.usableOutputGate.gaps, []);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('usable-output gate produces a compact GitHub summary independent from safety status', () => {
  const corpus = syntheticCorpus();
  try {
    const report = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blocked(),
    });
    const markdown = usableOutputSummaryMarkdown(report);
    assert.match(markdown, /FAIL_USABLE_OUTPUT_GATE/);
    assert.match(markdown, /Source renderable \| 0 \(0\.00%\)/);
    assert.match(markdown, /TAB artifact available \| 0 \(0\.00%\)/);
    assert.match(markdown, /independent from the deterministic\/source-safety audit status/);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('additional corpus audit detects a true-polyphony to MONO downgrade', () => {
  const corpus = syntheticCorpus({ poly: true });
  try {
    const report = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blocked('MONO_V1'),
    });
    assert.equal(report.status, 'FAIL_AUDIT');
    assert.equal(report.summary.polyRequiredFiles, 11);
    assert.equal(report.summary.polyToMonoDowngrades, 11);
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});

test('additional corpus audit detects source mutation and identity drift', () => {
  const corpus = syntheticCorpus();
  try {
    const first = corpus.manifest.files[0];
    fs.writeFileSync(path.join(corpus.directory, first.path), '<score-partwise changed="yes"/>');
    const identity = runAudit({
      sourceDirectory: corpus.directory,
      manifest: corpus.manifest,
      processUpload: () => blocked(),
    });
    assert.equal(identity.status, 'FAIL_AUDIT');
    assert.equal(identity.summary.identityVerifiedFiles, 10);

    const restored = syntheticCorpus();
    try {
      const mutated = runAudit({
        sourceDirectory: restored.directory,
        manifest: restored.manifest,
        processUpload: ({ bytes }) => {
          bytes[0] ^= 1;
          return blocked();
        },
      });
      assert.equal(mutated.status, 'FAIL_AUDIT');
      assert.equal(mutated.summary.sourceImmutableFiles, 0);
    } finally {
      fs.rmSync(restored.directory, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(corpus.directory, { recursive: true, force: true });
  }
});
