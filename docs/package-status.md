# Package and Verification Status

This document records the current package surface and strongest available verification evidence for the authoritative runtime implementation baseline.

## Snapshot

- Status date: 2026-08-10
- Verified runtime implementation baseline: `750f2a0923fc47df5883dc460d0769bb172c30e2`
- Package name: `musicxml-to-guitar-tab-engine`
- Package version: `0.1.0`
- Package state: private package metadata (`private: true`); repository visibility is separate
- License metadata: `UNLICENSED`
- Node.js engine: `>=18`
- CI runtime targets: Node.js 18, 20, 22
- Runtime dependency: `saxes@6.0.0`
- B1 benchmark: `TeacherFingeringBenchmark 1.0.0`, internal, fixed, teacher-approved
- B2 harness: `TeacherFingeringBenchmarkEvaluation 1.0.0`, internal, deterministic evaluation-only

The runtime baseline SHA names the implementation state containing B1+B2. A later docs-only merge may advance `main` without changing runtime behavior.

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
- `TeacherFingeringBenchmark`
- `TeacherFingeringBenchmarkEvaluation`

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
| OptimizerObservation Step 1 + 2.1–2.4 hardening | `VERIFIED_ON_MAIN` |
| S1 reusable full OptimizerObservation validation | `VERIFIED_ON_MAIN` |
| Internal `OptimizerObservationDigest 1.0.0` | `VERIFIED_ON_MAIN` |
| S2 observation content-digest binding | `VERIFIED_ON_MAIN` |
| Internal `PedagogicalFeatureVector 1.0.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| Internal `TeacherFeedback 1.1.0` | `FOUNDATION_NOT_PIPELINE_WIRED` |
| TeacherFeedback exact observation/candidate/digest hardening | `VERIFIED_ON_MAIN` |
| Internal `ObservationAdmission 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| S3 admission identity/replay/collision boundary | `VERIFIED_ON_MAIN` |
| Internal `ObservationAdmissionAtomicAdapter 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| S3.1 authoritative snapshot + compare-and-commit orchestration | `VERIFIED_ON_MAIN` |
| Internal `TeacherFingeringBenchmark 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| B1 fixed teacher-approved benchmark artifacts | `VERIFIED_ON_MAIN` |
| Internal `TeacherFingeringBenchmarkEvaluation 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| B2 deterministic benchmark evaluation harness | `VERIFIED_ON_MAIN` |
| Concrete production durable/atomic admission store | `NOT_IMPLEMENTED` |
| Cryptographic trusted-producer/revision/run authentication | `NOT_IMPLEMENTED` |
| Live TeacherFeedback research dataset pipeline | `NOT_IMPLEMENTED` |
| Versioned consent/privacy or lawful-use research boundary | `NOT_IMPLEMENTED` |
| Learned ranking/training pipeline | `NOT_IMPLEMENTED` |
| Learned ranking shadow implementation | `NOT_IMPLEMENTED` |
| HTTP/UI/PDF/OMR/SesliTab integrations | `NOT_IMPLEMENTED` in this repository |

## B1 fixed benchmark package status

`TeacherFingeringBenchmark 1.0.0` is internal evaluation infrastructure and is not exported from `src/index.js`.

Initial fixed artifact:

- benchmark ID: `teacher-fingering-v1`
- benchmark version: `1.0.0`
- review status: `teacher-approved`
- 8 self-authored monophonic MusicXML cases
- 32 teacher-approved event labels
- SHA-256 source binding for exact fixture content
- accepted event-local positions plus optional preferred event-local position
- no live TeacherFeedback, personal data, mutable URL source, or training authority

Teacher approval binds one exact reviewed artifact/version. Fixture/label/config/case changes require a new review/version cycle. Event-local accepted positions do not establish a teacher-approved complete fingering path.

## B2 evaluation package status

`TeacherFingeringBenchmarkEvaluation 1.0.0` is internal and measurement-only.

It validates teacher approval and exact fixed sources, runs the existing deterministic conversion pipeline, aligns exact event identities, and emits an immutable deterministic report. It does not change optimizer behavior or package-root API.

Current baseline:

| Metric | Count |
|---|---:|
| Benchmark cases | 8 |
| Benchmark events | 32 |
| Evaluated cases | 8 |
| Evaluated events | 32 |
| Unevaluated events | 0 |
| Acceptable matches | 32 |
| Preferred-eligible events | 28 |
| Preferred matches | 26 |
| Case passes | 8 |
| Candidate-coverage failures | 0 |
| Blocked conversions | 0 |

Security boundaries include:

- exact source SHA-256 verification before conversion,
- no silent case/event denominator removal,
- blocked cases remain denominator failures,
- exact successful-conversion event identity/order requirement,
- structured fail-closed hostile input handling,
- rejection of array subclasses/altered prototype-dispatch boundaries,
- no filesystem/network loading or caller loader/callback authority,
- no writes/persistence/training/model-selection authority.

The B1 fixed evaluation set must not be used as training data and then reused as independent evidence.

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

The base class remains private. `isEngineError` is nominal (`instanceof` based), intended for errors caught directly from the installed package. It is not a serialized-error detector and does not authorize trusting arbitrary lookalike objects.

## Observation, feedback, admission, benchmark, and evaluation boundaries

The observation/digest/feedback/admission foundations remain internal and do not change deterministic conversion. S1 validates complete supported observations; S2 fingerprints them; TeacherFeedback binds exact observed candidate choices; S3 validates admission-domain replay/collision conditions; S3.1 defines authoritative-snapshot + compare-and-commit orchestration.

None of S2/S3/S3.1 establishes cryptographic producer identity or research/training authorization. No concrete production durable admission provider exists.

B1/B2 are separate fixed evaluation infrastructure. They do not make TeacherFeedback a dataset, do not grant consent/lawful-use authority, and do not activate learned ranking.

## Verification evidence

### Current runtime implementation baseline

Fresh merge-post GitHub-hosted **Tests #406** on `750f2a0923fc47df5883dc460d0769bb172c30e2` completed successfully on Node.js 18, 20, and 22.

Node.js 22 recorded:

- **379 tests**
- **379 pass**
- **0 fail**
- npm audit: **0 vulnerabilities**

The exact head of PR #64 (`2a8727c17332f74f473d7769dd8e926faabfe472`) passed GitHub-hosted **Tests #405** and **MusicXML Compatibility #246** before merge.

No separate post-merge `main` MusicXML Compatibility run is claimed.

Traceability:

- PR #63 merged B1 `TeacherFingeringBenchmark 1.0.0`
- PR #64 merged B2 `TeacherFingeringBenchmarkEvaluation 1.0.0`

## CI supply-chain and governance

- Third-party workflow actions are pinned to immutable full commit SHAs.
- `main` remains protected with recorded required status contexts.
- Required-check enforcement remains recorded at `non_admins`, leaving administrator-bypass hardening open.
- Documentation convergence does not alter repository settings.

## Evidence limitations

- Passing tests do not prove compatibility with every MusicXML producer.
- MuseScore/alphaTab evidence applies only to supported fixtures/scope.
- S2 digest equality does not prove producer identity.
- S3/S3.1 do not cryptographically authenticate producer/revision/run assertions.
- S3.1 store guarantees remain external-provider obligations; no production provider exists here.
- B1 event-local labels do not establish path-level pedagogical truth.
- B1/B2 completion does not authorize training, live data collection, privacy/consent processing, or production learned selection.
- The fixed B1 benchmark must remain independent evaluation evidence.
- No package release is claimed; package metadata remains `private: true` and `UNLICENSED`.

## Approved next package-level sequence

With B1+B2 merged, the next safe package-level sequence is:

1. **read-only scope/threat-model review for Learned Ranking v1 — shadow mode**;
2. only after separate approval, implement a minimal internal shadow ranker that scores existing physically valid candidates without changing deterministic selection;
3. compare shadow output against B1/B2 evidence while keeping production output deterministic;
4. require an independent learned-ranking evaluation gate before any opt-in proposal;
5. before any live/mutable TeacherFeedback research dataset, implement/review a concrete durable/atomic admission provider;
6. add a separately versioned privacy/consent or lawful-use boundary;
7. build a live research/training dataset pipeline only after durable admission + lawful-use controls;
8. permit controlled learned-ranking opt-in only after separate evidence and approval.

G0.1 administrator-bypass hardening remains a parallel governance task.

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.
