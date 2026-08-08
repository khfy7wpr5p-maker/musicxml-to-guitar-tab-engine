'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOptimizerObservation,
  validateOptimizerObservation,
} = require('../src/fingering/optimizerObservation');
const {
  createOptimizerObservationDigest,
} = require('../src/fingering/optimizerObservationDigest');
const {
  buildCandidateLayers,
} = require('../src/fingering/candidateLayerBuilder');
const {
  optimizeFingering,
} = require('../src/fingering/fingeringOptimizer');
const {
  parseCanonicalMusicDocument,
} = require('../src/parser/parseCanonicalMusicDocument');
const {
  OBSERVATION_ADMISSION_CONTRACT_VERSION,
  MAX_ADMISSION_HISTORY_ENTRIES,
  ObservationAdmissionError,
  createObservationAdmissionRecord,
} = require('../src/fingering/observationAdmission');

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function buildObservation() {
  const canonical = parseCanonicalMusicDocument(
    readFixture('parser-single-voice.musicxml'),
  );
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
    runId: 'run:0001',
    observationId: 'observation:0001',
    observation,
    observationDigest,
    existingAdmissions: [],
    ...overrides,
  };
}

function createSecondObservation() {
  const second = structuredClone(observation);
  second.partId = `${second.partId}:second-run`;
  assert.doesNotThrow(() => validateOptimizerObservation(second));
  return second;
}

function createSecondAdmission(first) {
  const secondObservation = createSecondObservation();
  return createObservationAdmissionRecord(baseInput({
    admissionId: 'admission:benchmark-v1:0002',
    observationId: 'observation:0002',
    runId: 'run:0002',
    observation: secondObservation,
    observationDigest: createOptimizerObservationDigest(secondObservation),
    existingAdmissions: [first],
  }));
}

test('creates an immutable versioned admission record bound to observation content and run identity', () => {
  const record = createObservationAdmissionRecord(baseInput());

  assert.equal(OBSERVATION_ADMISSION_CONTRACT_VERSION, '1.0.0');
  assert.equal(record.documentType, 'ObservationAdmission');
  assert.equal(record.contractVersion, OBSERVATION_ADMISSION_CONTRACT_VERSION);
  assert.equal(record.admissionId, 'admission:benchmark-v1:0001');
  assert.equal(record.admissionDomainId, 'dataset:teacher-benchmark-v1');
  assert.equal(record.observationId, 'observation:0001');
  assert.deepEqual(record.observationDigest, observationDigest);
  assert.notEqual(record.observationDigest, observationDigest);
  assert.deepEqual(record.producer, {
    producerId: 'producer:engine-local-reference',
    runId: 'run:0001',
    packageName: 'musicxml-to-guitar-tab-engine',
    packageVersion: '0.1.0',
  });
  assert.equal(record.optimizerObservationVersion, observation.contractVersion);
  assert.equal(record.optimizerObservationDigestVersion, observationDigest.contractVersion);
  assert.equal(record.candidateContractVersion, observation.candidateContractVersion);
  assert.deepEqual(record.optimizer, observation.optimizer);
  assert.equal(record.guitarConfigurationVersion, observation.guitarConfiguration.contractVersion);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.observationDigest), true);
  assert.equal(Object.isFrozen(record.producer), true);
  assert.equal(Object.isFrozen(record.optimizer), true);
});

test('rejects replay of an already admitted observation identity and digest', () => {
  const first = createObservationAdmissionRecord(baseInput());

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0002',
      runId: 'run:0002',
      existingAdmissions: [first],
    })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /replay|already admitted/i);
      return true;
    },
  );
});

test('rejects duplicate observation content under a different observation identity', () => {
  const first = createObservationAdmissionRecord(baseInput());

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0002',
      observationId: 'observation:duplicate-alias',
      runId: 'run:0002',
      existingAdmissions: [first],
    })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /duplicate.*content|content.*duplicate/i);
      return true;
    },
  );
});

test('rejects observation identity collision with different valid content', () => {
  const first = createObservationAdmissionRecord(baseInput());
  const secondObservation = createSecondObservation();
  const secondDigest = createOptimizerObservationDigest(secondObservation);

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0002',
      observation: secondObservation,
      observationDigest: secondDigest,
      runId: 'run:0002',
      existingAdmissions: [first],
    })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /observation.*collision|collision.*observation/i);
      return true;
    },
  );
});

test('rejects producer run replay and producer run collision', () => {
  const first = createObservationAdmissionRecord(baseInput());

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0002',
      observationId: 'observation:run-replay-alias',
      existingAdmissions: [first],
    })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /run.*replay|replay.*run/i);
      return true;
    },
  );

  const secondObservation = createSecondObservation();
  const secondDigest = createOptimizerObservationDigest(secondObservation);
  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0003',
      observationId: 'observation:run-collision',
      observation: secondObservation,
      observationDigest: secondDigest,
      existingAdmissions: [first],
    })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /run.*collision|collision.*run/i);
      return true;
    },
  );
});

test('rejects tampered observation content and mismatched digest before admission', () => {
  const tampered = structuredClone(observation);
  tampered.partId = `${tampered.partId}:tampered-after-digest`;
  assert.doesNotThrow(() => validateOptimizerObservation(tampered));

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ observation: tampered })),
    ObservationAdmissionError,
  );
});

test('rejects duplicate admission IDs, malformed history, and unsupported metadata', () => {
  const first = createObservationAdmissionRecord(baseInput());
  const secondObservation = createSecondObservation();
  const secondDigest = createOptimizerObservationDigest(secondObservation);

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      observationId: 'observation:second',
      observation: secondObservation,
      observationDigest: secondDigest,
      runId: 'run:0002',
      existingAdmissions: [first],
    })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /admission.*already|duplicate.*admission/i);
      return true;
    },
  );

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ existingAdmissions: [null] })),
    ObservationAdmissionError,
  );

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ researchConsent: true })),
    ObservationAdmissionError,
  );
  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ teacherId: 'person:1' })),
    ObservationAdmissionError,
  );
});

test('rejects internally inconsistent admission history before admitting new content', () => {
  const first = createObservationAdmissionRecord(baseInput());
  const conflicting = structuredClone(first);
  conflicting.admissionId = 'admission:benchmark-v1:conflict';
  const secondObservation = createSecondObservation();

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0003',
      observationId: 'observation:0003',
      producerId: 'producer:other',
      runId: 'run:0003',
      observation: secondObservation,
      observationDigest: createOptimizerObservationDigest(secondObservation),
      existingAdmissions: [first, conflicting],
    })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /history.*duplicate|history.*replay|inconsistent.*history/i);
      return true;
    },
  );
});

test('preserves replay protection when historical producer and engine metadata differ from the current version', () => {
  const first = createObservationAdmissionRecord(baseInput());
  const historical = structuredClone(first);
  historical.producer.packageVersion = '0.0.9';
  historical.optimizer.version = '0.9.0';
  historical.optimizerObservationVersion = '0.9.0';
  historical.candidateContractVersion = '0.9.0';
  historical.guitarConfigurationVersion = '0.9.0';

  const secondObservation = createSecondObservation();
  assert.doesNotThrow(() => createObservationAdmissionRecord(baseInput({
    admissionId: 'admission:benchmark-v1:0002',
    observationId: 'observation:0002',
    runId: 'run:0002',
    observation: secondObservation,
    observationDigest: createOptimizerObservationDigest(secondObservation),
    existingAdmissions: [historical],
  })));

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0002',
      runId: 'run:0002',
      existingAdmissions: [historical],
    })),
    ObservationAdmissionError,
  );
});

test('bounds admission history before linear duplicate scanning', () => {
  const first = createObservationAdmissionRecord(baseInput());
  const overLimit = Array(MAX_ADMISSION_HISTORY_ENTRIES + 1).fill(first);

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ existingAdmissions: overLimit })),
    (error) => {
      assert.ok(error instanceof ObservationAdmissionError);
      assert.match(error.message, /history.*limit|too many.*admission/i);
      return true;
    },
  );
});

test('requires complete bounded opaque identifiers and an explicit dense admission history', () => {
  for (const field of ['admissionId', 'admissionDomainId', 'producerId', 'runId', 'observationId']) {
    assert.throws(
      () => createObservationAdmissionRecord(baseInput({ [field]: '' })),
      ObservationAdmissionError,
    );
  }

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ existingAdmissions: undefined })),
    ObservationAdmissionError,
  );

  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ existingAdmissions: sparse })),
    ObservationAdmissionError,
  );
});

test('requires history to stay within one explicit admission domain', () => {
  const first = createObservationAdmissionRecord(baseInput());
  const crossDomain = structuredClone(first);
  crossDomain.admissionDomainId = 'dataset:other-domain';
  const secondObservation = createSecondObservation();

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0002',
      observationId: 'observation:0002',
      runId: 'run:0002',
      observation: secondObservation,
      observationDigest: createOptimizerObservationDigest(secondObservation),
      existingAdmissions: [crossDomain],
    })),
    ObservationAdmissionError,
  );
});

test('admission APIs remain internal package details', () => {
  const packageApi = require('..');
  assert.equal(Object.hasOwn(packageApi, 'createObservationAdmissionRecord'), false);
  assert.equal(Object.hasOwn(packageApi, 'OBSERVATION_ADMISSION_CONTRACT_VERSION'), false);
  assert.equal(Object.hasOwn(packageApi, 'MAX_ADMISSION_HISTORY_ENTRIES'), false);
});
