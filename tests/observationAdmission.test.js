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
const { buildCandidateLayers } = require('../src/fingering/candidateLayerBuilder');
const { optimizeFingering } = require('../src/fingering/fingeringOptimizer');
const { parseCanonicalMusicDocument } = require('../src/parser/parseCanonicalMusicDocument');
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
    producerRevisionId: 'git:cb15f64da99b87f196d50e123e6abe334fc68d45',
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

function secondInput(existingAdmissions = []) {
  const secondObservation = createSecondObservation();
  return baseInput({
    admissionId: 'admission:benchmark-v1:0002',
    observationId: 'observation:0002',
    producerRevisionId: 'git:revision-two',
    runId: 'run:0002',
    observation: secondObservation,
    observationDigest: createOptimizerObservationDigest(secondObservation),
    existingAdmissions,
  });
}

test('creates an immutable versioned admission record bound to observation content and producer/run revision identity', () => {
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
    producerRevisionId: 'git:cb15f64da99b87f196d50e123e6abe334fc68d45',
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

test('rejects observation replay, duplicate content, and observation identity collision', () => {
  const first = createObservationAdmissionRecord(baseInput());

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:replay',
      producerRevisionId: 'git:replay',
      runId: 'run:replay',
      existingAdmissions: [first],
    })),
    (error) => error instanceof ObservationAdmissionError && /replay|already admitted/i.test(error.message),
  );

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:duplicate',
      observationId: 'observation:duplicate-alias',
      producerRevisionId: 'git:duplicate',
      runId: 'run:duplicate',
      existingAdmissions: [first],
    })),
    (error) => error instanceof ObservationAdmissionError && /duplicate.*content|content.*duplicate/i.test(error.message),
  );

  const secondObservation = createSecondObservation();
  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:collision',
      producerRevisionId: 'git:collision',
      runId: 'run:collision',
      observation: secondObservation,
      observationDigest: createOptimizerObservationDigest(secondObservation),
      existingAdmissions: [first],
    })),
    (error) => error instanceof ObservationAdmissionError && /observation.*collision|collision.*observation/i.test(error.message),
  );
});

test('rejects producer run replay and collision even when the asserted producer revision changes', () => {
  const first = createObservationAdmissionRecord(baseInput());

  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:run-replay',
      observationId: 'observation:run-replay-alias',
      producerRevisionId: 'git:claimed-different-revision',
      existingAdmissions: [first],
    })),
    (error) => error instanceof ObservationAdmissionError && /run.*replay|replay.*run/i.test(error.message),
  );

  const secondObservation = createSecondObservation();
  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:run-collision',
      observationId: 'observation:run-collision',
      producerRevisionId: 'git:claimed-different-revision',
      observation: secondObservation,
      observationDigest: createOptimizerObservationDigest(secondObservation),
      existingAdmissions: [first],
    })),
    (error) => error instanceof ObservationAdmissionError && /run.*collision|collision.*run/i.test(error.message),
  );
});

test('rejects shape-valid observation tampering with a stale digest', () => {
  const tampered = structuredClone(observation);
  tampered.partId = `${tampered.partId}:tampered-after-digest`;
  assert.doesNotThrow(() => validateOptimizerObservation(tampered));
  assert.throws(
    () => createObservationAdmissionRecord(baseInput({ observation: tampered })),
    ObservationAdmissionError,
  );
});

test('rejects duplicate admission IDs, malformed history, and unsupported consent/personal metadata', () => {
  const first = createObservationAdmissionRecord(baseInput());
  assert.throws(
    () => createObservationAdmissionRecord(secondInput([first]).constructor === Object ? baseInput({
      admissionId: first.admissionId,
      observationId: 'observation:second',
      producerRevisionId: 'git:second',
      runId: 'run:second',
      observation: createSecondObservation(),
      observationDigest: createOptimizerObservationDigest(createSecondObservation()),
      existingAdmissions: [first],
    }) : null),
    ObservationAdmissionError,
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

  assert.throws(
    () => createObservationAdmissionRecord(secondInput([first, conflicting])),
    (error) => error instanceof ObservationAdmissionError
      && /history.*duplicate|history.*replay|inconsistent.*history/i.test(error.message),
  );
});

test('preserves replay protection when historical engine metadata differs from the current version', () => {
  const first = createObservationAdmissionRecord(baseInput());
  const historical = structuredClone(first);
  historical.producer.packageVersion = '0.0.9';
  historical.producer.producerRevisionId = 'git:historical-revision';
  historical.optimizer.version = '0.9.0';
  historical.optimizerObservationVersion = '0.9.0';
  historical.candidateContractVersion = '0.9.0';
  historical.guitarConfigurationVersion = '0.9.0';

  assert.doesNotThrow(() => createObservationAdmissionRecord(secondInput([historical])));
  assert.throws(
    () => createObservationAdmissionRecord(baseInput({
      admissionId: 'admission:benchmark-v1:0002',
      producerRevisionId: 'git:another-revision',
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
    (error) => error instanceof ObservationAdmissionError
      && /history.*limit|too many.*admission/i.test(error.message),
  );
});

test('requires complete bounded opaque identities and an explicit dense admission history', () => {
  for (const field of [
    'admissionId',
    'admissionDomainId',
    'producerId',
    'producerRevisionId',
    'runId',
    'observationId',
  ]) {
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
  assert.throws(
    () => createObservationAdmissionRecord(secondInput([crossDomain])),
    ObservationAdmissionError,
  );
});

test('admission APIs remain internal package details', () => {
  const packageApi = require('..');
  assert.equal(Object.hasOwn(packageApi, 'createObservationAdmissionRecord'), false);
  assert.equal(Object.hasOwn(packageApi, 'OBSERVATION_ADMISSION_CONTRACT_VERSION'), false);
  assert.equal(Object.hasOwn(packageApi, 'MAX_ADMISSION_HISTORY_ENTRIES'), false);
});
