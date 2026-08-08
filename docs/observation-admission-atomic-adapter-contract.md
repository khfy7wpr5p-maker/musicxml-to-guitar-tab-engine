# Observation Admission Atomic Adapter Contract 1.0.0

## Purpose

`ObservationAdmissionAtomicAdapter 1.0.0` is an internal coordination boundary around `ObservationAdmission 1.0.0`.

Its purpose is to remove caller-supplied admission history from the commit path and require one authoritative admission-domain snapshot plus a version-token compare-and-commit operation.

It does not provide a production database, filesystem store, cloud service, KMS integration, producer authentication, consent registry, benchmark dataset, or learned-ranking component.

## Required store contract

An integrating store must expose:

- `contractVersion: "1.0.0"`
- `readAdmissionDomainSnapshot(admissionDomainId)`
- `compareAndCommitAdmission({ admissionDomainId, expectedRevisionToken, record })`

The core does not accept caller-supplied `existingAdmissions` through this S3.1 path.

The adapter resolves and validates the required store methods before the asynchronous snapshot read begins, then uses those validated method references for the whole attempt. A store cannot redirect the later compare-and-commit step merely by replacing a method while the snapshot read is in flight. Store contract-property access failures are normalized to the adapter error boundary.

### Authoritative snapshot

`readAdmissionDomainSnapshot()` must return exactly:

- `documentType: "ObservationAdmissionSnapshot"`
- `contractVersion: "1.0.0"`
- the requested bounded opaque `admissionDomainId`
- a bounded opaque `revisionToken`
- `admissions`: the complete authoritative `ObservationAdmission 1.0.0` history for that domain at that revision

The revision token is opaque to the core. The store is responsible for ensuring that it changes whenever the admission domain changes in a way relevant to compare-and-commit.

The adapter validates the snapshot shape and then passes the snapshot admissions into the existing S3 fail-closed history validator when creating the candidate admission record. A repeated admission therefore re-reads authoritative history and can be rejected before a second compare-and-commit call.

### Compare-and-commit

`compareAndCommitAdmission()` receives the exact snapshot revision token and the already validated, immutable `ObservationAdmission` record.

It must perform one atomic operation equivalent to:

1. compare the current admission-domain revision with `expectedRevisionToken`;
2. if the revision differs, commit nothing and return `status: "conflict"`;
3. if the revision matches, durably append/commit exactly the supplied record;
4. advance the admission-domain revision token; and
5. only after the durable atomic commit succeeds, return `status: "committed"`.

The result must contain exactly:

- `documentType: "ObservationAdmissionCommitResult"`
- `contractVersion: "1.0.0"`
- the same `admissionDomainId`
- `status: "committed"` or `"conflict"`
- the store's current bounded opaque `revisionToken`

A successful or conflicting result must expose a revision token different from the originally read snapshot token. A non-advancing token is treated as an unknown commit outcome because the core cannot safely infer what the store actually did.

## Concurrency rule

Two writers may read the same authoritative snapshot, but they must not both successfully commit from the same revision token.

At most one compare-and-commit operation may transition a particular admission-domain revision to its next state. Other stale writers must receive `conflict` with no record written by those attempts.

This is the S3.1 boundary that closes the stale-concurrent-history weakness documented by S3.

## Retry and ambiguous-outcome rule

The adapter performs **no automatic commit retry**.

There are two materially different cases:

### Proven conflict

A valid `status: "conflict"` response means the store contract asserts that this compare-and-commit attempt wrote nothing. The caller may explicitly start a new admission attempt, which must re-read a fresh authoritative snapshot before building a new record.

### Outcome unknown

If `compareAndCommitAdmission()` throws, rejects, returns a malformed result, returns the wrong domain, or reports a non-advancing revision after the commit call began, the adapter returns `OBSERVATION_ADMISSION_COMMIT_OUTCOME_UNKNOWN`.

The caller MUST NOT blindly retry the commit. The store may already contain the admission record even though the response was lost or malformed. A higher-level integration must reconcile against a fresh authoritative read before deciding whether another admission attempt is safe.

This rule avoids creating a hidden at-least-once write loop at the core boundary.

## Failure classes

The internal adapter distinguishes:

- `INVALID_OBSERVATION_ADMISSION_ATOMIC_ADAPTER`: invalid store/input/snapshot or pre-commit store-read failure;
- `OBSERVATION_ADMISSION_CONFLICT`: valid stale-revision conflict, with no write by that compare-and-commit attempt under the store contract;
- `OBSERVATION_ADMISSION_COMMIT_OUTCOME_UNKNOWN`: the commit call began but the core cannot safely determine whether a write occurred.

Existing `ObservationAdmissionError` failures remain possible before compare-and-commit when the authoritative snapshot shows replay, duplicate content, identity collision, producer/run collision, malformed history, or another S3 violation.

## Durability authority boundary

The JavaScript core cannot independently prove that an external store is actually durable or atomic.

S3.1 therefore defines a **store contract**, not a production persistence implementation. A conforming production adapter must guarantee that a `committed` response is emitted only after its underlying persistence technology has durably completed the atomic compare-and-commit operation.

An in-memory test double can verify orchestration and concurrency semantics, but it is not durability evidence.

Any future concrete persistence provider requires its own implementation review, crash/restart tests, transaction/concurrency tests, and deployment-specific security review.

## Snapshot completeness boundary

The store, not the core, owns the authority to claim that a returned snapshot is complete and fresh for its `revisionToken`.

The core validates all records supplied in that snapshot, but cannot discover records that a faulty or malicious store omitted. A production adapter must therefore read from one authoritative admission-domain state and must not synthesize partial histories from caches or eventually consistent replicas unless their semantics can satisfy this contract.

## Privacy and consent separation

S3.1 does not add consent, teacher/student identity, personal metadata, retention policy, lawful-basis evidence, or training authorization.

The atomic input allowlist rejects fields outside the S3 admission identity/observation binding. Callers cannot inject their own `existingAdmissions` history into this path.

## Non-authority rules

S3.1 MUST NOT:

- change MusicXML parsing or validation;
- change candidate generation, guitar physics, optimizer costs, selection, or tie-breaking;
- change `CanonicalTabResult` or writers;
- mutate OptimizerObservation, its digest, TeacherFeedback, or ObservationAdmission records;
- expose a new package-root public API;
- implement a concrete production persistence backend;
- treat revision tokens as cryptographic signatures;
- authenticate producer/revision/run identities;
- grant benchmark, dataset, research, or training authorization;
- automatically retry an ambiguous commit;
- activate learned ranking.

## Regression boundary

S3.1 regression coverage includes:

- successful atomic commit from an authoritative empty snapshot;
- revision-token advancement;
- authoritative re-read and replay rejection before a second commit call;
- stale-snapshot conflict without overwrite;
- explicit caller retry only after a proven no-write conflict and fresh re-read;
- no automatic retry after an ambiguous post-commit exception;
- malformed and cross-domain snapshot rejection before commit;
- malformed post-commit result treated as outcome unknown;
- non-advancing successful revision treated as outcome unknown;
- store-method pinning across the asynchronous snapshot boundary;
- hostile store contract-property access normalized fail-closed;
- caller-supplied history and consent/personal metadata rejection;
- incompatible store-contract rejection;
- package-root non-export regression.

## Readiness consequence

S3.1 supplies the versioned atomic/durable **adapter contract boundary** required by S3, but still does not supply a production durable store or prove producer authenticity.

A deterministic fixed teacher benchmark may be considered as a separate future gate only if its artifacts and admission process can be reviewed without pretending that this contract itself is a deployed persistence system. Any live or mutable research/training dataset still requires an approved concrete durable adapter plus separately approved privacy/consent or other lawful-use controls.
