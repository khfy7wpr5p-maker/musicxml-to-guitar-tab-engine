'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCandidateLayers } = require('../src/fingering/candidateLayerBuilder');
const { optimizeFingering } = require('../src/fingering/fingeringOptimizer');
const { createOptimizerObservation } = require('../src/fingering/optimizerObservation');
const { createOptimizerObservationDigest } = require('../src/fingering/optimizerObservationDigest');
const { parseCanonicalMusicDocument } = require('../src/parser/parseCanonicalMusicDocument');
const {
  OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION,
  ObservationAdmissionAtomicAdapterError,
  ObservationAdmissionConflictError,
  ObservationAdmissionCommitOutcomeUnknownError,
  commitObservationAdmissionAtomically,
} = require('../src/fingering/observationAdmissionAtomicAdapter');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function buildObservation() {
  const canonical = parseCanonicalMusicDocument(readFixture('parser-single-voice.musicxml'));
  const candidateSet = buildCandidateLayers(canonical);
  const optimized = optimizeFingering(candidateSet.candidateLayers);
  return createOptimizerObservation(candidateSet, optimized);
}

const observation = buildObservation();
const observationDigest = createOptimizerObservationDigest(observation);

function baseInput(overrides = {}) {
  return {
    admissionId: 'admission:benchmark-v1:0001',
    admissionDomainId: 'dataset:teacher-benchmark-v1',
    producerId: 'producer:engine-local-reference',
    producerRevisionId: 'git:4b2dc0dab43b47b461a05852f98ef81aaf8c46f3',
    runId: 'run:0001',
    observationId: 'observation:0001',
    observation,
    observationDigest,
    ...overrides,
  };
}

class ReferenceAtomicStore {
  constructor(options = {}) {
    this.contractVersion = '1.0.0';
    this.revision = 0;
    this.admissions = [];
    this.readCalls = 0;
    this.commitCalls = 0;
    this.beforeCompare = options.beforeCompare ?? null;
    this.throwAfterCommit = options.throwAfterCommit ?? false;
    this.malformedSnapshot = options.malformedSnapshot ?? null;
    this.malformedCommitResult = options.malformedCommitResult ?? null;
  }

  revisionToken() {
    return `revision:${this.revision}`;
  }

  async readAdmissionDomainSnapshot(admissionDomainId) {
    this.readCalls += 1;
    if (this.malformedSnapshot !== null) return this.malformedSnapshot;
    return {
      documentType: 'ObservationAdmissionSnapshot',
      contractVersion: '1.0.0',
      admissionDomainId,
      revisionToken: this.revisionToken(),
      admissions: [...this.admissions],
    };
  }

  async compareAndCommitAdmission({ admissionDomainId, expectedRevisionToken, record }) {
    this.commitCalls += 1;
    if (this.beforeCompare !== null) {
      const hook = this.beforeCompare;
      this.beforeCompare = null;
      await hook(this);
    }

    if (expectedRevisionToken !== this.revisionToken()) {
      return {
        documentType: 'ObservationAdmissionCommitResult',
        contractVersion: '1.0.0',
        status: 'conflict',
        admissionDomainId,
        revisionToken: this.revisionToken(),
      };
    }

    this.admissions.push(record);
    this.revision += 1;

    if (this.throwAfterCommit) {
      throw new Error('simulated connection loss after durable commit');
    }
    if (this.malformedCommitResult !== null) return this.malformedCommitResult;

    return {
      documentType: 'ObservationAdmissionCommitResult',
      contractVersion: '1.0.0',
      status: 'committed',
      admissionDomainId,
      revisionToken: this.revisionToken(),
    };
  }
}

test('commits one S3 admission through a versioned atomic compare-and-commit store boundary', async () => {
  const store = new ReferenceAtomicStore();
  const result = await commitObservationAdmissionAtomically(store, baseInput());

  assert.equal(OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION, '1.0.0');
  assert.equal(result.documentType, 'ObservationAdmissionAtomicCommit');
  assert.equal(result.contractVersion, '1.0.0');
  assert.equal(result.admissionDomainId, 'dataset:teacher-benchmark-v1');
  assert.equal(result.previousRevisionToken, 'revision:0');
  assert.equal(result.committedRevisionToken, 'revision:1');
  assert.equal(result.record.admissionId, 'admission:benchmark-v1:0001');
  assert.equal(store.readCalls, 1);
  assert.equal(store.commitCalls, 1);
  assert.equal(store.admissions.length, 1);
  assert.equal(store.admissions[0], result.record);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.record), true);
});

test('re-reads authoritative history and rejects a replay before a second commit call', async () => {
  const store = new ReferenceAtomicStore();
  await commitObservationAdmissionAtomically(store, baseInput());

  await assert.rejects(
    () => commitObservationAdmissionAtomically(store, baseInput()),
    (error) => error && error.code === 'INVALID_OBSERVATION_ADMISSION',
  );

  assert.equal(store.readCalls, 2);
  assert.equal(store.commitCalls, 1);
  assert.equal(store.admissions.length, 1);
});

test('rejects a stale snapshot with conflict and does not overwrite the concurrent winner', async () => {
  const store = new ReferenceAtomicStore({
    beforeCompare(current) {
      current.revision += 1;
    },
  });

  await assert.rejects(
    () => commitObservationAdmissionAtomically(store, baseInput()),
    (error) => error instanceof ObservationAdmissionConflictError
      && error.code === 'OBSERVATION_ADMISSION_CONFLICT',
  );

  assert.equal(store.readCalls, 1);
  assert.equal(store.commitCalls, 1);
  assert.equal(store.admissions.length, 0);
  assert.equal(store.revisionToken(), 'revision:1');
});

test('allows an explicit caller retry after a proven no-write conflict by re-reading fresh history', async () => {
  const store = new ReferenceAtomicStore({
    beforeCompare(current) {
      current.revision += 1;
    },
  });

  await assert.rejects(
    () => commitObservationAdmissionAtomically(store, baseInput()),
    ObservationAdmissionConflictError,
  );
  const result = await commitObservationAdmissionAtomically(store, baseInput());

  assert.equal(result.previousRevisionToken, 'revision:1');
  assert.equal(result.committedRevisionToken, 'revision:2');
  assert.equal(store.readCalls, 2);
  assert.equal(store.commitCalls, 2);
  assert.equal(store.admissions.length, 1);
});

test('never auto-retries when the commit outcome is ambiguous after the store throws', async () => {
  const store = new ReferenceAtomicStore({ throwAfterCommit: true });

  await assert.rejects(
    () => commitObservationAdmissionAtomically(store, baseInput()),
    (error) => error instanceof ObservationAdmissionCommitOutcomeUnknownError
      && error.code === 'OBSERVATION_ADMISSION_COMMIT_OUTCOME_UNKNOWN',
  );

  assert.equal(store.readCalls, 1);
  assert.equal(store.commitCalls, 1);
  assert.equal(store.admissions.length, 1);
});

test('rejects malformed or cross-domain snapshots before compare-and-commit', async () => {
  const malformedStore = new ReferenceAtomicStore({
    malformedSnapshot: {
      documentType: 'ObservationAdmissionSnapshot',
      contractVersion: '1.0.0',
      admissionDomainId: 'dataset:teacher-benchmark-v1',
      revisionToken: 'revision:0',
    },
  });
  await assert.rejects(
    () => commitObservationAdmissionAtomically(malformedStore, baseInput()),
    ObservationAdmissionAtomicAdapterError,
  );
  assert.equal(malformedStore.commitCalls, 0);

  const crossDomainStore = new ReferenceAtomicStore({
    malformedSnapshot: {
      documentType: 'ObservationAdmissionSnapshot',
      contractVersion: '1.0.0',
      admissionDomainId: 'dataset:other-domain',
      revisionToken: 'revision:0',
      admissions: [],
    },
  });
  await assert.rejects(
    () => commitObservationAdmissionAtomically(crossDomainStore, baseInput()),
    ObservationAdmissionAtomicAdapterError,
  );
  assert.equal(crossDomainStore.commitCalls, 0);
});

test('treats malformed post-commit responses and non-advancing committed revisions as unknown outcomes', async () => {
  const malformedResultStore = new ReferenceAtomicStore({
    malformedCommitResult: { status: 'committed' },
  });
  await assert.rejects(
    () => commitObservationAdmissionAtomically(malformedResultStore, baseInput()),
    ObservationAdmissionCommitOutcomeUnknownError,
  );
  assert.equal(malformedResultStore.commitCalls, 1);
  assert.equal(malformedResultStore.admissions.length, 1);

  const nonAdvancingStore = new ReferenceAtomicStore();
  nonAdvancingStore.compareAndCommitAdmission = async function compareAndCommitAdmission(request) {
    this.commitCalls += 1;
    this.admissions.push(request.record);
    return {
      documentType: 'ObservationAdmissionCommitResult',
      contractVersion: '1.0.0',
      status: 'committed',
      admissionDomainId: request.admissionDomainId,
      revisionToken: request.expectedRevisionToken,
    };
  };
  await assert.rejects(
    () => commitObservationAdmissionAtomically(nonAdvancingStore, baseInput()),
    ObservationAdmissionCommitOutcomeUnknownError,
  );
  assert.equal(nonAdvancingStore.commitCalls, 1);
  assert.equal(nonAdvancingStore.admissions.length, 1);
});

test('pins validated store methods so an async snapshot read cannot redirect the commit method', async () => {
  const store = new ReferenceAtomicStore();
  const originalRead = store.readAdmissionDomainSnapshot;
  store.readAdmissionDomainSnapshot = async function readAndAttemptMethodSwap(admissionDomainId) {
    const snapshot = await originalRead.call(this, admissionDomainId);
    this.compareAndCommitAdmission = async () => {
      throw new Error('redirected compare-and-commit must not be invoked');
    };
    return snapshot;
  };

  const result = await commitObservationAdmissionAtomically(store, baseInput());

  assert.equal(result.committedRevisionToken, 'revision:1');
  assert.equal(store.readCalls, 1);
  assert.equal(store.commitCalls, 1);
  assert.equal(store.admissions.length, 1);
});

test('does not let callers inject history, consent metadata, or invalid store contracts into the atomic path', async () => {
  const store = new ReferenceAtomicStore();
  await assert.rejects(
    () => commitObservationAdmissionAtomically(store, baseInput({ existingAdmissions: [] })),
    ObservationAdmissionAtomicAdapterError,
  );
  await assert.rejects(
    () => commitObservationAdmissionAtomically(store, baseInput({ researchConsent: true })),
    ObservationAdmissionAtomicAdapterError,
  );
  assert.equal(store.readCalls, 0);
  assert.equal(store.commitCalls, 0);

  const invalidStore = new ReferenceAtomicStore();
  invalidStore.contractVersion = '2.0.0';
  await assert.rejects(
    () => commitObservationAdmissionAtomically(invalidStore, baseInput()),
    ObservationAdmissionAtomicAdapterError,
  );

  const throwingGetterStore = {};
  Object.defineProperty(throwingGetterStore, 'contractVersion', {
    get() {
      throw new TypeError('simulated hostile store getter');
    },
  });
  await assert.rejects(
    () => commitObservationAdmissionAtomically(throwingGetterStore, baseInput()),
    ObservationAdmissionAtomicAdapterError,
  );
});

test('atomic admission adapter APIs remain internal package details', () => {
  const packageApi = require('..');
  assert.equal(Object.hasOwn(packageApi, 'commitObservationAdmissionAtomically'), false);
  assert.equal(
    Object.hasOwn(packageApi, 'OBSERVATION_ADMISSION_ATOMIC_ADAPTER_CONTRACT_VERSION'),
    false,
  );
});
