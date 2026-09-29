'use strict';

const SEMANTIC_TAB_VALIDATION_PACKET_VERSION = 'st-semantic-tab-validation-packet-v1';
const VALID_STATUSES = new Set(['PASS', 'DIAGNOSTIC', 'UNSUPPORTED']);

function copyDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics)) return Object.freeze([]);
  return Object.freeze(diagnostics.map((diagnostic) => (
    Object.freeze({ ...diagnostic })
  )));
}

function copyContexts(contexts) {
  if (!Array.isArray(contexts)) return Object.freeze([]);
  return Object.freeze([...contexts]);
}

function createSemanticTabValidationPacket({
  comparison,
  provenance,
} = {}) {
  const status = VALID_STATUSES.has(comparison?.status)
    ? comparison.status
    : 'UNSUPPORTED';

  return Object.freeze({
    schemaVersion: SEMANTIC_TAB_VALIDATION_PACKET_VERSION,
    sourceSha256: provenance?.sourceSha256 ?? null,
    semanticEngineCommit: provenance?.semanticEngineCommit ?? null,
    semanticSnapshotSchemaVersion: provenance?.semanticSnapshotSchemaVersion ?? null,
    partituraVersion: provenance?.partituraVersion ?? null,
    status,
    diagnostics: copyDiagnostics(comparison?.diagnostics),
    unverifiedContexts: copyContexts(comparison?.unverifiedContexts),
    resolverEligible: false,
    selectorEligible: false,
    arrangementAuthority: false,
    automaticCorrectionAuthority: false,
    tabGenerationBlocking: false,
  });
}

module.exports = {
  SEMANTIC_TAB_VALIDATION_PACKET_VERSION,
  createSemanticTabValidationPacket,
};
