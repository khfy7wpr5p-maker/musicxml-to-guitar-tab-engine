'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseParsedMusicXmlDocument,
} = require('../src/parser/parsedMusicXmlDocument');
const {
  materializeStage09WorkbenchPitchCorrections,
} = require('../src/app/stage09WorkbenchSourceCorrectionMaterializer');

const EVIDENCE_TYPE = 'Stage09WorkbenchCorrectionEvidence';
const EVIDENCE_VERSION = '1.0.0';
const PACKET_TYPE = 'Stage09TeacherCorrectionPreparedCase';
const PACKET_VERSION = '1.0.0';
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const ALLOWED_TAGS = new Set([
  'voice-2',
  'voice-3-or-4',
  'chord',
  'tie',
  'staff',
  'duration-or-onset',
  'difficult-guitar-position',
]);
const ALLOWED_COMMAND_TYPES = new Set([
  'REPLACE_POLYPHONIC_SOURCE_EVENT_PITCH',
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJson(filePath, label) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new TypeError(`${label} must be readable valid JSON: ${error.message}`);
  }
  return value;
}

function requireFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new TypeError(`${label} file is missing: ${filePath}`);
  }
  return Buffer.from(fs.readFileSync(filePath));
}

function safeId(value, field) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new TypeError(`${field} must be a bounded stable identifier.`);
  }
  return value;
}

function safeWork(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new TypeError('work must be a non-empty bounded string.');
  }
  return value;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new TypeError('coverageTags must be a non-empty array.');
  }
  const normalized = [];
  for (const tag of tags) {
    if (!ALLOWED_TAGS.has(tag)) throw new TypeError(`Unsupported Stage 09 coverage tag: ${tag}`);
    if (!normalized.includes(tag)) normalized.push(tag);
  }
  return normalized;
}

function validateEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Workbench evidence must be a plain object.');
  }
  if (value.documentType !== EVIDENCE_TYPE || value.contractVersion !== EVIDENCE_VERSION) {
    throw new TypeError('Unsupported Workbench evidence contract.');
  }
  if (
    typeof value.sourceFileName !== 'string'
    || value.sourceFileName.length === 0
    || /[\\/\u0000-\u001f\u007f]/.test(value.sourceFileName)
    || !/\.(?:xml|musicxml)$/i.test(value.sourceFileName)
  ) {
    throw new TypeError('Workbench evidence sourceFileName is invalid.');
  }
  if (!SHA256.test(value.sourceSha256 || '')) {
    throw new TypeError('Workbench evidence sourceSha256 is invalid.');
  }
  if (value.route !== 'POLY_V2' || !['PASS', 'REVIEW_REQUIRED'].includes(value.status)) {
    throw new TypeError('Workbench evidence must come from a supported POLY_V2 result.');
  }
  if (!Number.isSafeInteger(value.revisionNumber) || value.revisionNumber <= 0) {
    throw new TypeError('Workbench evidence revisionNumber must be positive.');
  }
  if (
    !Array.isArray(value.appliedEdits)
    || value.appliedEdits.length !== value.revisionNumber
    || value.appliedEdits.length === 0
  ) {
    throw new TypeError('Workbench evidence appliedEdits must match revisionNumber.');
  }
  return value;
}

function exactSingleEventEdit(edit, index) {
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
    throw new TypeError(`appliedEdits[${index}] is invalid.`);
  }
  if (!ALLOWED_COMMAND_TYPES.has(edit.commandType)) {
    throw new TypeError(
      `Workbench edit ${edit.commandType || 'UNKNOWN'} cannot be represented exactly by Stage 05.`,
    );
  }
  if (
    edit.selectedPosition
    || edit.assignmentMode
    || edit.affectedEventCount !== 1
    || !Array.isArray(edit.sourceTieEventIds)
    || edit.sourceTieEventIds.length !== 1
    || edit.sourceTieEventIds[0] !== edit.sourceEventId
  ) {
    throw new TypeError(
      `Workbench edit ${edit.commandType} cannot be represented exactly by Stage 05.`,
    );
  }
  if (typeof edit.sourceEventId !== 'string' || edit.sourceEventId.length === 0) {
    throw new TypeError(`appliedEdits[${index}].sourceEventId is required.`);
  }
  return edit;
}

function stage05PatchesFromEdits(edits) {
  const patches = [];
  for (let index = 0; index < edits.length; index += 1) {
    const edit = exactSingleEventEdit(edits[index], index);
    const revisionIndex = Number.isSafeInteger(edit.revisionIndex) ? edit.revisionIndex : index;
    if (
      typeof edit.beforePitch?.written !== 'string'
      || typeof edit.afterPitch?.written !== 'string'
      || edit.beforePitch.written === edit.afterPitch.written
    ) {
      throw new TypeError(`Pitch edit at revision ${revisionIndex} is incomplete.`);
    }
    patches.push({
      patch_id: `workbench-r${revisionIndex}-pitch`,
      edit_class: 'PITCH_UPDATE',
      target_event: edit.sourceEventId,
      before: { pitch: edit.beforePitch.written },
      after: { pitch: edit.afterPitch.written },
    });
  }
  if (patches.length === 0) {
    throw new TypeError('Workbench evidence contains no Stage 05 representable teacher correction.');
  }
  const ids = new Set(patches.map((patch) => patch.patch_id));
  if (ids.size !== patches.length) throw new TypeError('Generated Stage 05 patch ids are not unique.');
  return patches;
}

function validateMusicXml(bytes, label) {
  try {
    parseParsedMusicXmlDocument(bytes);
  } catch (error) {
    throw new TypeError(`${label} MusicXML is not safe/well-formed: ${error.message}`);
  }
}

function copyExact(sourcePath, outDir, fileName) {
  const target = path.join(outDir, fileName);
  fs.copyFileSync(sourcePath, target);
  return target;
}

function prepareWorkbenchCorrectionCase({
  evidencePath,
  originalPath,
  referencePath,
  outDir,
  caseId,
  sourceId,
  work,
  coverageTags,
}) {
  const evidence = validateEvidence(readJson(evidencePath, 'Workbench evidence'));
  safeId(caseId, 'caseId');
  safeId(sourceId, 'sourceId');
  safeWork(work);
  const tags = normalizeTags(coverageTags);

  const originalBytes = requireFile(originalPath, 'original OMR MusicXML');
  const referenceBytes = requireFile(referencePath, 'reference score');
  const correctedBytes = materializeStage09WorkbenchPitchCorrections(
    originalBytes,
    evidence.appliedEdits,
  ).correctedBytes;

  if (path.basename(originalPath) !== evidence.sourceFileName) {
    throw new TypeError('original OMR MusicXML file name does not match Workbench evidence.');
  }
  if (sha256(originalBytes) !== evidence.sourceSha256) {
    throw new TypeError('original OMR MusicXML SHA-256 does not match Workbench evidence.');
  }
  if (correctedBytes.byteLength === 0) {
    throw new TypeError('corrected MusicXML is empty.');
  }
  if (sha256(originalBytes) === sha256(correctedBytes)) {
    throw new TypeError('Workbench correction does not change the MusicXML bytes.');
  }

  validateMusicXml(originalBytes, 'Original');
  validateMusicXml(correctedBytes, 'Corrected');

  const stage05Patches = stage05PatchesFromEdits(evidence.appliedEdits);
  const patchIds = stage05Patches.map((patch) => patch.patch_id);

  fs.mkdirSync(outDir, { recursive: true });
  const originalFileName = path.basename(originalPath);
  const referenceFileName = path.basename(referencePath);
  const correctedFileName = `${path.parse(originalFileName).name}.stage09.corrected.musicxml`;
  const packetFileName = `${caseId}.correction-packet.json`;

  copyExact(originalPath, outDir, originalFileName);
  copyExact(referencePath, outDir, referenceFileName);
  fs.writeFileSync(path.join(outDir, correctedFileName), correctedBytes);

  const packet = {
    documentType: PACKET_TYPE,
    contractVersion: PACKET_VERSION,
    caseId,
    evidenceClass: 'REAL_TEACHER_CORRECTION_PREPARED',
    work,
    sourceId,
    sourceSoftware: [],
    original: {
      fileName: originalFileName,
      sha256: sha256(originalBytes),
      byteLength: originalBytes.byteLength,
      immutable: true,
    },
    reference: {
      fileName: referenceFileName,
      sha256: sha256(referenceBytes),
      byteLength: referenceBytes.byteLength,
      referenceClass: 'TEACHER_SOURCE_SCORE',
    },
    corrected: {
      fileName: correctedFileName,
      sha256: sha256(correctedBytes),
      byteLength: correctedBytes.byteLength,
      xmlWellFormed: true,
    },
    patchIds,
    stage05Patches,
    coverageTags: tags,
    status: 'CORRECTED_REVISION_PREPARED',
  };

  const packetPath = path.join(outDir, packetFileName);
  fs.writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`);
  return {
    packet,
    packetPath,
    evidence,
  };
}

function parseArgs(argv) {
  const result = {
    coverageTags: [],
  };
  const args = [...argv];
  while (args.length) {
    const key = args.shift();
    const value = args.shift();
    if (!value) throw new TypeError(`Missing value for ${key}.`);
    if (key === '--evidence') result.evidencePath = value;
    else if (key === '--original') result.originalPath = value;
    else if (key === '--reference') result.referencePath = value;
    else if (key === '--out-dir') result.outDir = value;
    else if (key === '--case-id') result.caseId = value;
    else if (key === '--source-id') result.sourceId = value;
    else if (key === '--work') result.work = value;
    else if (key === '--tags') result.coverageTags = value.split(',').filter(Boolean);
    else throw new TypeError(`Unknown argument: ${key}`);
  }
  for (const field of ['evidencePath', 'originalPath', 'referencePath', 'outDir', 'caseId', 'sourceId', 'work']) {
    if (!result[field]) throw new TypeError(`Missing required argument: ${field}`);
  }
  return result;
}

if (require.main === module) {
  try {
    const result = prepareWorkbenchCorrectionCase(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      status: 'PREPARED',
      caseId: result.packet.caseId,
      packetPath: result.packetPath,
      patchCount: result.packet.stage05Patches.length,
      coverageTags: result.packet.coverageTags,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  prepareWorkbenchCorrectionCase,
  stage05PatchesFromEdits,
  validateEvidence,
};
