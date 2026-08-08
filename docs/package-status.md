# Package and Verification Status

This document records the current package surface and strongest available verification evidence for authoritative `main`.

## Snapshot

- Status date: 2026-08-08
- Verified runtime `main`: `0446c6dec12ed688806c38494e46faa9aa578ca1`
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private package metadata (`private: true`); repository visibility is separate
- License metadata: `UNLICENSED`
- Node.js engine: `>=18`
- CI runtime targets: Node.js 18, 20, 22
- Runtime dependency: `saxes@6.0.0`

## Package metadata

| Field | Value |
|---|---|
| `name` | `musicxml-to-guitar-tab-engine` |
| `version` | `0.1.0` |
| `private` | `true` |
| `main` | `src/index.js` |
| `test` | `node --test` |
| Node.js engine | `>=18` |
| Runtime dependency | `saxes@6.0.0` |
| License | `UNLICENSED` |

## Current package-root public API

`src/index.js` currently exports exactly:

| Export | Purpose |
|---|---|
| `ENGINE_ERROR_CONTRACT_VERSION` | Public EngineError contract version identifier (`1.0.0`) |
| `FretboardError` | Existing public fretboard error class preserved for compatibility |
| `PREFLIGHT_STATUS` | Public preflight status constants |
| `convertMusicXmlToCanonicalTab` | Public MusicXML-to-canonical-TAB conversion |
| `getPositionCandidates` | Physical guitar position candidate helper |
| `isEngineError` | Public nominal detector for errors inheriting from internal `EngineError` |
| `positionToMidi` | Guitar position-to-MIDI helper |
| `preflightMusicXml` | Public MusicXML preflight API |
| `serializeCanonicalTabResult` | Deterministic canonical JSON serializer |
| `serializeCanonicalTabResultToAscii` | Deterministic six-string ASCII TAB serializer |
| `serializeCanonicalTabResultToMusicXml` | Deterministic TAB MusicXML serializer |
| `validateMidi` | MIDI input validation helper |

The following remain intentionally internal:

- `EngineError`
- `GuitarConfigurationError`
- `CanonicalTabResultError`
- writer/parser/validation/optimizer/canonical-model domain error subclasses
- `OptimizerObservation`
- `OptimizerObservationDigest`
- `PedagogicalFeatureVector`
- `TeacherFeedback`
- `ObservationAdmission`
- `ObservationAdmissionAtomicAdapter`

## Package capability status

| Capability | Status |
|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` |
| `ProcessingBudget 1.0.0` | `VERIFIED_ON_MAIN` |
| XML structural ceilings | `VERIFIED_ON_MAIN` |
| Measure/event limits | `VERIFIED_ON_MAIN` |
| Deadline/cancellation/runtime checkpoints | `VERIFIED_ON_MAIN` |
| Hostile-input regression corpus | `VERIFIED_ON_MAIN` |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` |
| MusicXML validation/parser | `VERIFIED_ON_MAIN` |
| Shared public conversion parse | `VERIFIED_ON_MAIN` |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` |
| Guitar configuration foundation | `VERIFIED_ON_MAIN` |
| Fretboard/playability | `VERIFIED_ON_MAIN` |
| Deterministic fingering cost model | `VERIFIED_ON_MAIN` |
| Deterministic fingering optimizer | `VERIFIED_ON_MAIN` |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` |
| Canonical JSON schema/runtime validator | `VERIFIED_ON_MAIN` |
| Public JSON writer serializer | `VERIFIED_ON_MAIN` |
| Public ASCII TAB serializer | `VERIFIED_ON_MAIN` |
| Public TAB MusicXML serializer | `VERIFIED_ON_MAIN` |
| Internal `EngineError 1.0.0` | `VERIFIED_ON_MAIN` |
| PEB-1 public error detection | `VERIFIED_ON_MAIN` |
| Canonical result graph resource limits | `VERIFIED_ON_MAIN` |
| Internal `GuitarConfiguration 1.0.0` | `VERIFIED_ON_MAIN` |
| Internal `Integration Contract v1` metadata | `VERIFIED_ON_MAIN` |
| Internal `OptimizerObservation 1.0.0` | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 1 hostile-data hardening | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.1 cost shape | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.2 selected playability | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.3 aggregate consistency | `VERIFIED_ON_MAIN` |
| OptimizerObservation Step 2.4 regression completeness | `VERIFIED_ON_MAIN` |
| S1 reusable full OptimizerObservation validation | `VERIFIED_ON_MAIN` |
| Internal `OptimizerObservationDigest 1.0.0` | `VERIFIED_ON_MAIN` |
| S2 observation content-digest binding | `VERIFIED_ON_MAIN` |
| Internal `PedagogicalFeatureVector 1.0.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| Internal `TeacherFeedback 1.1.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| TeacherFeedback exact observation/candidate hardening | `VERIFIED_ON_MAIN` |
| TeacherFeedback shared full-observation admission | `VERIFIED_ON_MAIN` |
| TeacherFeedback required digest verification | `VERIFIED_ON_MAIN` |
| Internal `ObservationAdmission 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| S3 admission identity/replay/collision boundary | `VERIFIED_ON_MAIN` |
| Internal `ObservationAdmissionAtomicAdapter 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| S3.1 authoritative snapshot + compare-and-commit orchestration | `VERIFIED_ON_MAIN` |
| Concrete production durable/atomic admission store | `NOT_IMPLEMENTED` |
| Cryptographic trusted-producer/revision/run authentication | `NOT_IMPLEMENTED` |
| Fixed teacher benchmark | `NOT_IMPLEMENTED` |
| Benchmark evaluation harness | `NOT_IMPLEMENTED` |
| Teacher-feedback research dataset pipeline | `NOT_IMPLEMENTED` |
| Separately versioned consent/privacy or lawful-use boundary | `NOT_IMPLEMENTED` |
| Learned ranking/training pipeline | `NOT_IMPLEMENTED` |
| HTTP/UI/PDF/OMR/SesliTab integrations | `NOT_IMPLEMENTED` in this repository |

## Output status

| Output | Package-root availability |
|---|---|
| Canonical JavaScript result | Public through conversion API |
| JSON text | Public through `serializeCanonicalTabResult` |
| ASCII TAB | Public through `serializeCanonicalTabResultToAscii` |
| TAB MusicXML | Public through `serializeCanonicalTabResultToMusicXml` |
| PDF | Not implemented |

All writers consume validated `CanonicalTabResult` and use authoritative `selectedPosition`; they do not regenerate candidates or rerun optimization.

## Error-contract status

`src/errors/engineError.js` defines internal `EngineError 1.0.0`.

PEB-1 exposes only:

- `ENGINE_ERROR_CONTRACT_VERSION`
- `isEngineError(value)`

The base class itself remains private. `isEngineError` is nominal (`instanceof` based), intended for errors caught directly from the installed package. It is not a serialized-error detector and does not authorize trusting arbitrary lookalike objects.

## Guitar-configuration status

Internal `GuitarConfiguration 1.0.0` is merged and consumed by candidate generation. It provides immutable normalized tuning/fret data, validates six unique strings and MIDI/fret bounds, and rejects supplied pitch/MIDI disagreement. Its version, constructor, and error class remain internal.

## Integration Contract v1 status

`Integration Contract v1` is merged as internal version metadata plus a documented authority/non-authority boundary. It references the existing public package entry points and current canonical, error, guitar-configuration, and processing-safety contracts.

It does not expose new package-root APIs or add HTTP, transport, serialized error envelopes, UI, OMR, SesliTab, persistence, or application logic.

## Observation, feedback, admission, and atomic-adapter foundation status

The following modules are merged but remain internal and are not loaded by the normal package-root conversion path:

- `OptimizerObservation 1.0.0`
- `OptimizerObservationDigest 1.0.0`
- `PedagogicalFeatureVector 1.0.0`
- `TeacherFeedback 1.1.0`
- `ObservationAdmission 1.0.0`
- `ObservationAdmissionAtomicAdapter 1.0.0`

They do not change candidate generation, physical validation, deterministic optimization, `CanonicalTabResult`, or writer output.

### S1/S2 observation and TeacherFeedback boundary

S1 provides the reusable internal `validateOptimizerObservation()` boundary. It validates supported observation, candidate, optimizer, and guitar-configuration versions; canonical six-string tuning semantics/order; dense decisions and candidates; unique event identities; decision/candidate array-index identity; canonical candidate position/ID consistency; selected-position membership; selected playable-cost shape; and aggregate selected cost.

S2 adds `OptimizerObservationDigest 1.0.0`. It validates the complete observation first, then computes a domain-separated SHA-256 fingerprint using deterministic canonical serialization. The canonicalizer rejects cycles, excessive depth, unsupported/non-finite values, sparse/custom arrays, symbols, accessors, non-enumerable data, and non-plain objects so content cannot be silently excluded from the digest.

TeacherFeedback 1.1.0 requires a bounded opaque `observationId`, a complete valid observation, and a matching `observationDigest`. The runtime recomputes the digest and fails closed on mismatch before event-specific feedback checks. Exact candidate grammar/bounds, optimizer-selected candidate equality, and exact same-event override membership remain enforced.

This establishes observation content integrity relative to the supplied digest, not trusted-producer authenticity.

### S3 ObservationAdmission boundary

`ObservationAdmission 1.0.0` binds a fully verified observation/digest to exactly one admission domain and bounded opaque:

- `admissionId`
- `observationId`
- `producerId`
- `producerRevisionId`
- `runId`
- engine/package, observation, digest, candidate, optimizer, and GuitarConfiguration version references

Within one admission domain, the S3 validator rejects duplicate admission IDs, observation replay, observation-ID/content collision, duplicate content under another observation ID, producer/run replay, producer/run collision, malformed/cross-domain history, internally inconsistent history, and histories above the 10,000-entry bound.

S3 does not authenticate the producer/revision/run assertions. The pure record helper can validate only the history it is given and cannot prove that history is complete, authoritative, fresh, durable, or committed atomically.

### S3.1 ObservationAdmissionAtomicAdapter boundary

`ObservationAdmissionAtomicAdapter 1.0.0` removes caller-supplied `existingAdmissions` from the commit path. A store must provide:

- `readAdmissionDomainSnapshot(admissionDomainId)` returning complete authoritative history plus an opaque `revisionToken`
- `compareAndCommitAdmission(...)` performing one revision-token compare-and-commit operation

The adapter validates and pins the store methods before the asynchronous read, validates the authoritative snapshot, creates the S3 record against that history, and sends the exact snapshot token to compare-and-commit.

Security behavior:

- stale snapshot → structured conflict and no write by that attempt under the store contract;
- explicit retry is allowed only after a proven no-write conflict and requires a fresh authoritative read;
- commit exception, malformed post-commit result, wrong-domain result, or non-advancing revision → `OBSERVATION_ADMISSION_COMMIT_OUTCOME_UNKNOWN`;
- ambiguous outcomes are never automatically retried;
- caller-supplied history and consent/personal metadata are rejected from this path.

S3.1 is a **store contract/orchestration boundary**, not a concrete production database/filesystem/cloud provider. The JavaScript core cannot independently prove that a store implementation is actually durable, complete, fresh, or atomic.

## Verification evidence

### Current runtime snapshot

Fresh merge-post GitHub-hosted **Tests #340** on `main` `0446c6dec12ed688806c38494e46faa9aa578ca1` completed successfully on Node.js 18, 20, and 22.

The Node.js 22 job recorded:

- **349 tests**
- **349 pass**
- **0 fail**
- npm audit: **0 vulnerabilities**

The exact head of PR #61 (`664d0c42b65a1add184d438bda641e695de7eed0`) passed GitHub-hosted **Tests #339** and **MusicXML Compatibility #183** before merge.

No separate post-merge `main` MusicXML Compatibility run is claimed.

## CI supply-chain and governance

- Third-party workflow actions are pinned to immutable full commit SHAs.
- `main` remains protected with the recorded required status contexts.
- The latest branch-protection inspection reports required-check enforcement at `non_admins`, leaving administrator-bypass hardening open.
- Documentation convergence does not alter repository settings.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- MuseScore/alphaTab evidence applies only to supported fixtures and scope.
- S2 digest equality does not prove producer identity or historical-run authenticity.
- S3 admission records bind bounded producer/revision/run assertions but do not cryptographically authenticate them.
- S3 pure-history validation does not prove the caller supplied complete authoritative history.
- S3.1 requires authoritative/durable/atomic store behavior by contract, but the core cannot prove an arbitrary external provider actually supplies it.
- S3/S3.1 admission success is not benchmark, research, training, consent, privacy, or lawful-use authorization.
- No package release is claimed; package metadata remains `private: true` and `UNLICENSED`.

## Approved next package-level sequence

With S3/S3.1 documented, the next safe package-level sequence is:

1. perform a separate read-only scope/threat-model review for a deterministic fixed teacher-verified fingering benchmark v1;
2. only after separate approval, create fixed reviewed benchmark artifacts and a versioned benchmark contract without pretending S3.1 is deployed production persistence;
3. implement a benchmark evaluation harness as a separate gate;
4. evaluate learned ranking in shadow mode only after deterministic benchmark evidence exists;
5. before any live/mutable teacher-feedback research dataset, implement and independently review a concrete durable/atomic admission provider;
6. add a separately versioned privacy/consent or lawful-use boundary for research/training admission;
7. build the live research-dataset pipeline only after durable admission and lawful-use controls exist;
8. require an evaluation gate against the deterministic baseline;
9. allow controlled learned ranking only after separate evidence/approval.

G0.1 administrator-bypass hardening remains a parallel governance task.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.
