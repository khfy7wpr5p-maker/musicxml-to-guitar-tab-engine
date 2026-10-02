'use strict';

const crypto = require('node:crypto');

const PROVENANCE_SCHEMA_VERSION = 'st-guitar-semantic-reference-provenance-v1';
const PINNED_SOURCE_SHA256S = new Set([
  '943708ecae3d291f32f8c42472b12a300f2719a1c46fc74ab2aba9456a847dd6',
  'e76c8917eec7ff1404b912083f9947c7fe14cf7df0cb56a219adc24df741cc3e',
]);
const PINNED_SEMANTIC_ENGINE_COMMIT = 'ef305f45ff90d940ac6c51a0c46c4fac006d7c5c';
const PINNED_SNAPSHOT_SCHEMA_VERSION = 'st-semantic-snapshot-v1';
const PINNED_PARTITURA_VERSION = '1.9.0';
const PINNED_PROFILE = Object.freeze({
  sourceKind: 'musicxml',
  musicXmlVersion: '3.1',
  divisions: 4,
  partCount: 1,
  measureCount: 2,
});

function unsupported(code) {
  return Object.freeze({
    status: 'UNSUPPORTED',
    diagnostics: Object.freeze([code]),
    tabGenerationBlocking: false,
  });
}

function pass() {
  return Object.freeze({
    status: 'PASS',
    diagnostics: Object.freeze([]),
    tabGenerationBlocking: false,
  });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSourceBuffer(sourceBytes) {
  if (Buffer.isBuffer(sourceBytes)) return sourceBytes;
  if (typeof sourceBytes === 'string') return Buffer.from(sourceBytes, 'utf8');
  if (sourceBytes instanceof Uint8Array) {
    return Buffer.from(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength);
  }
  return null;
}

function profileMatches(profile) {
  if (!isRecord(profile)) return false;
  return Object.keys(PINNED_PROFILE).every((key) => profile[key] === PINNED_PROFILE[key])
    && Object.keys(profile).length === Object.keys(PINNED_PROFILE).length;
}

function admitSemanticReferenceBundle(bundle) {
  if (!isRecord(bundle)
    || !isRecord(bundle.snapshot)
    || !isRecord(bundle.provenance)) {
    return unsupported('MALFORMED_REFERENCE_BUNDLE');
  }

  const sourceBuffer = toSourceBuffer(bundle.sourceBytes);
  if (sourceBuffer === null) {
    return unsupported('MALFORMED_REFERENCE_BUNDLE');
  }

  const { snapshot, provenance } = bundle;

  if (provenance.schemaVersion !== PROVENANCE_SCHEMA_VERSION) {
    return unsupported('PROVENANCE_SCHEMA_MISMATCH');
  }

  const sourceSha256 = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
  if (!PINNED_SOURCE_SHA256S.has(sourceSha256)
    || provenance.sourceSha256 !== sourceSha256) {
    return unsupported('SOURCE_SHA256_MISMATCH');
  }

  if (provenance.semanticEngineCommit !== PINNED_SEMANTIC_ENGINE_COMMIT) {
    return unsupported('SEMANTIC_ENGINE_COMMIT_MISMATCH');
  }

  if (provenance.semanticSnapshotSchemaVersion !== PINNED_SNAPSHOT_SCHEMA_VERSION
    || snapshot.schema_version !== PINNED_SNAPSHOT_SCHEMA_VERSION) {
    return unsupported('SNAPSHOT_SCHEMA_MISMATCH');
  }

  if (provenance.partituraVersion !== PINNED_PARTITURA_VERSION) {
    return unsupported('PARTITURA_VERSION_MISMATCH');
  }

  if (!profileMatches(provenance.profile)
    || snapshot.source_kind !== PINNED_PROFILE.sourceKind
    || snapshot.part_count !== PINNED_PROFILE.partCount
    || snapshot.measure_count !== PINNED_PROFILE.measureCount) {
    return unsupported('PROFILE_MISMATCH');
  }

  return pass();
}

module.exports = {
  PROVENANCE_SCHEMA_VERSION,
  admitSemanticReferenceBundle,
};
