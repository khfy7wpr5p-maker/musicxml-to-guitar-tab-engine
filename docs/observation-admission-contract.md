# Observation Admission Contract 1.0.0

## Purpose

`ObservationAdmission 1.0.0` is an internal, immutable admission-record foundation for binding a validated `OptimizerObservation` to an explicit admission domain before future benchmark or dataset use.

It does not persist data, authenticate a producer, grant research/training consent, or activate any learned component.

## Admission record

A successful admission record contains exactly:

- `documentType: "ObservationAdmission"`
- `contractVersion: "1.0.0"`
- bounded opaque `admissionId`
- bounded opaque `admissionDomainId`
- bounded opaque `observationId`
- the verified `OptimizerObservationDigest 1.0.0`
- producer metadata:
  - bounded opaque `producerId`
  - bounded opaque `producerRevisionId`
  - bounded opaque `runId`
  - engine package name
  - engine package version at admission time
- OptimizerObservation contract version
- OptimizerObservationDigest contract version
- candidate contract version
- optimizer name/version
- GuitarConfiguration contract version

`producerRevisionId` exists because package version alone may not identify one exact source/build revision. An integrating admission system may use a Git commit identity, release/artifact digest, or another reviewed opaque revision identifier. The core does not decide which external revision namespace is authoritative.

The returned record and its nested objects are deeply frozen.

## Required observation integrity

Admission requires both the complete supplied observation and its supplied observation digest.

Before history checks, the runtime reuses `verifyOptimizerObservationDigest()` so the observation must:

1. pass the full `validateOptimizerObservation()` boundary,
2. canonicalize under the current `OptimizerObservationDigest` rules, and
3. produce the exact supplied SHA-256 digest.

Shape-valid observation content changed after digest creation therefore fails closed.

## Admission-domain identity rules

All comparisons are scoped to one explicit `admissionDomainId`.

Within that domain:

- `admissionId` must be unique;
- `observationId` must not be admitted twice;
- one `observationId` must never bind to two different observation digests;
- one observation digest must not be admitted under multiple observation identities;
- one `producerId + runId` pair must not be admitted twice;
- one `producerId + runId` pair must never bind to two different observation digests.

Changing only `producerRevisionId` does not make reuse of the same `producerId + runId` legal. A run identity collision/replay remains fail-closed across asserted revision changes.

These rules distinguish replay/duplicate conditions from identity/run collisions and reject both fail-closed.

## Existing admission history

`createObservationAdmissionRecord()` requires the caller to supply an explicit `existingAdmissions` array for the target admission domain.

The runtime:

- requires a dense array with no symbol, accessor, sparse, or custom array properties;
- rejects more than `10,000` supplied history entries before linear duplicate scanning;
- validates every history record against the `ObservationAdmission 1.0.0` record shape;
- requires all history records to belong to the requested admission domain;
- verifies that the history is internally consistent before comparing the new record;
- rejects duplicate admission IDs, observation replay/collision, producer-run replay/collision, and duplicate observation content already present inside the supplied history.

Historical records are not required to carry today's exact package, producer-revision, optimizer, observation, candidate, or guitar-configuration version strings. Those references are retained as bounded historical metadata so a future engine version does not silently discard older admission records from replay checking. The history record's digest-version reference must still agree with its embedded digest contract version, and the embedded digest must be valid under the digest contract supported by this `ObservationAdmission 1.0.0` implementation.

## Critical authority boundary

The module can validate only the history it is given.

It **cannot prove** that `existingAdmissions` is:

- complete,
- authoritative,
- freshly read,
- durably persisted,
- protected from concurrent writes, or
- committed atomically with the newly returned record.

A real persistence/admission adapter MUST therefore provide a complete authoritative view for the admission domain and MUST serialize or atomically compare-and-commit admission operations. Calling this pure in-memory contract with two stale concurrent history snapshots can otherwise produce two individually valid records that conflict when combined.

This limitation keeps persistence and concurrency authority outside the core deterministic engine instead of pretending that an in-memory helper provides storage guarantees.

## Producer, revision, and run provenance boundary

`producerId`, `producerRevisionId`, and `runId` are bounded opaque identities asserted by the integrating admission system. The record binds those assertions to the observation digest within the supplied admission history.

The core module does **not** verify a digital signature, certificate, hardware identity, KMS key, remote attestation, Git commit signature, artifact-signing chain, or external producer/revision registry.

Therefore the binding means:

> "this admission record states that this producer, asserted revision, and run identity were associated with this exact observation digest"

It does **not** mean:

> "the engine cryptographically proved who produced this observation, that the claimed revision is authentic, or which historical process executed it."

Trusted-producer/revision authenticity, if ever required, must be a separately approved external/versioned boundary.

## Record-integrity boundary

The observation digest protects observation content. It does not cryptographically protect the surrounding `ObservationAdmission` record fields themselves.

A persistence layer that must detect unauthorized mutation of admission metadata needs its own integrity/authenticity mechanism or append-only/transactional guarantees. S3 does not claim those guarantees.

## Privacy and consent separation

The admission input uses an allowlist. Consent/personal fields such as research consent or teacher identifiers are rejected rather than silently copied into the admission record.

Opaque identifiers, including producer/revision/run identities, must not be populated with personal information.

`ObservationAdmission 1.0.0` is not:

- research consent,
- training consent,
- lawful-basis evidence,
- a retention policy,
- a teacher/student identity record, or
- authorization to publish or reuse data.

Any future research/training dataset admission must join separately approved privacy/consent or lawful-use records outside this contract.

## Non-authority rules

The contract MUST NOT:

- modify MusicXML, canonical music, or `CanonicalTabResult`;
- create or alter string/fret candidates;
- bypass physical validation;
- change deterministic optimizer selection, costs, or tie-breaking;
- mutate an OptimizerObservation or TeacherFeedback record;
- expose new package-root APIs;
- persist records by itself;
- treat a digest as a digital signature;
- treat producer/revision/run IDs as authenticated identity by themselves;
- authorize benchmark inclusion merely because admission validation succeeds;
- train or activate a learned ranker.

## Package and pipeline status

The module is internal and is not exported from `src/index.js`.

It is not wired into normal MusicXML → Guitar TAB conversion and does not affect deterministic engine output.

## Regression boundary

S3 regression coverage includes:

- successful immutable record creation from a real OptimizerObservation and digest;
- required producer revision identity;
- observation replay rejection;
- duplicate observation-content rejection under another identity;
- observation-ID collision with different valid content;
- producer/run replay rejection even across an asserted revision change;
- producer/run collision with different valid content;
- shape-valid observation tampering with a stale digest;
- duplicate admission-ID rejection;
- malformed, sparse, cross-domain, or internally inconsistent history rejection;
- bounded history length;
- preservation of replay checking across historical engine/package metadata changes;
- fail-closed rejection of unsupported consent/personal metadata;
- package-root non-export regression.

## Readiness consequence

S3 provides a versioned admission **contract foundation**, not a production dataset-admission system.

A deterministic teacher-verified benchmark must remain blocked until a separately approved boundary specifies how admission history is durably and atomically maintained and how benchmark artifacts are authorized/provenanced. Research/training use additionally requires separately approved consent/privacy or other lawful-use records.
