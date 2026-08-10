# Current Implementation Status

This document records the verified runtime implementation state of the authoritative `main` branch.

## Snapshot

- Status date: 2026-08-10
- Verified runtime implementation baseline: `750f2a0923fc47df5883dc460d0769bb172c30e2`
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Milestone 3 public writer API: `MERGED`
- PEB-1 public error detection boundary: `MERGED`
- `GuitarConfiguration 1.0.0`: `MERGED`
- `Integration Contract v1`: `MERGED`
- `OptimizerObservation 1.0.0`: `FOUNDATION`
- `OptimizerObservationDigest 1.0.0`: `FOUNDATION`
- `PedagogicalFeatureVector 1.0.0`: `FOUNDATION`
- `TeacherFeedback 1.1.0`: `FOUNDATION`
- `ObservationAdmission 1.0.0`: `FOUNDATION`
- `ObservationAdmissionAtomicAdapter 1.0.0`: `FOUNDATION`
- `TeacherFingeringBenchmark 1.0.0`: `MERGED_INTERNAL`
- `TeacherFingeringBenchmarkEvaluation 1.0.0`: `MERGED_INTERNAL`
- B1 fixed benchmark: 8 self-authored cases / 32 teacher-approved note events
- B2 deterministic baseline: 32/32 acceptable, 26/28 preferred, 8/8 case pass, 0 candidate-coverage failures, 0 blocked conversions
- Historical PR #42 OptimizerObservation P2 threads: `RESOLVED`
- Historical PR #44 TeacherFeedback P2 threads: `RESOLVED`
- G0.1 administrator enforcement: `GOVERNANCE_OPEN`

The runtime implementation baseline SHA names the merged B2 state. A later documentation-only merge may advance `main` without changing runtime behavior.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented and present on the runtime baseline |
| `MERGED_INTERNAL` | Implemented on `main` but intentionally not package-root public API |
| `FOUNDATION` | Internal versioned foundation exists but is not normal-conversion authority |
| `NOT_STARTED` | No approved merged implementation exists |
| `BLOCKED` | Work must not begin until prerequisites/evidence are complete |
| `READY_FOR_REVIEW` | Read-only scope/threat-model review may begin |
| `GOVERNANCE_OPEN` | Repository/process issue remains unresolved |
| `RESOLVED` | Historical review/bookkeeping item closed against merged evidence |

## Completed security and architecture milestones

| Milestone | Status | Result |
|---|---|---|
| 2A–2B | `MERGED` | Immutable parsed MusicXML and shared public semantic parse |
| 2C-1–2C-5 / 2C-4.1 | `MERGED` | Central processing budgets, XML/measure/event limits, deadlines/cancellation/checkpoints, hostile-input regression |
| SEC-CI-1 | `MERGED` | Third-party GitHub Actions pinned to immutable SHAs |
| 2D-1–2D-4 | `MERGED` | Common internal EngineError and domain convergence |
| Milestone 3 | `MERGED` | Public deterministic JSON, ASCII TAB, TAB MusicXML writers |
| PEB-1 | `MERGED` | Public `ENGINE_ERROR_CONTRACT_VERSION` and `isEngineError(value)` without exposing `EngineError` |
| Canonical TAB graph hardening | `MERGED` | Iterative depth/node/output-size hostile graph rejection |
| GuitarConfiguration 1.0 | `MERGED` | Immutable six-string physical configuration contract |
| Integration Contract v1 | `MERGED` | Internal version metadata and explicit integration non-authorities |
| OptimizerObservation Step 1 + 2.1–2.4 | `MERGED` | Dense hostile-data handling, full selected-cost shape, playability, aggregate consistency, negative regressions |
| S1 full observation validation | `MERGED` | Reusable full `validateOptimizerObservation()` boundary |
| S2 content-digest binding | `MERGED` | Domain-separated SHA-256 observation fingerprint; TeacherFeedback requires exact digest match |
| S3 observation admission/provenance | `MERGED` | Admission-domain identity/version binding and replay/collision rejection against bounded history |
| S3.1 atomic admission adapter | `MERGED` | Authoritative snapshot + revision-token compare-and-commit orchestration; no blind retry on ambiguous outcome |
| B1 teacher fingering benchmark | `MERGED_INTERNAL` | PR #63; fixed teacher-approved `TeacherFingeringBenchmark 1.0.0`, 8 cases / 32 events, SHA-bound sources |
| B2 benchmark evaluation harness | `MERGED_INTERNAL` | PR #64; deterministic `TeacherFingeringBenchmarkEvaluation 1.0.0` with fail-closed source/event alignment and no silent denominator shrink |

## Current merged runtime capabilities

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | Encoding/null/entity/DOCTYPE policy plus structural/resource ceilings |
| MusicXML parser | `MERGED` | Supported single-part/single-staff/single-voice monophonic scope |
| Processing limits | `MERGED` | Byte/XML/measure/event/deadline/cancellation/runtime checkpoints |
| Preflight | `MERGED` | Frozen PASS/WARNING/BLOCKED reports |
| Canonical music | `MERGED` | Immutable `CanonicalMusicDocument` |
| Guitar configuration | `MERGED` | Immutable internal `GuitarConfiguration 1.0.0` |
| Physical candidates | `MERGED` | All physically valid string/fret positions |
| Cost model | `MERGED` | Explainable deterministic costs |
| Optimizer | `MERGED` | Deterministic dynamic programming and stable tie-breaking |
| Canonical TAB result | `MERGED` | Immutable `CanonicalTabResult 1.0.0` |
| Canonical validator/resource limits | `MERGED` | Structural/musical/physical/JSON safety plus bounded graph traversal |
| Writers | `MERGED` | Public deterministic JSON / ASCII TAB / TAB MusicXML |
| Engine error boundary | `MERGED` | Internal `EngineError 1.0.0`, public PEB-1 detector |
| OptimizerObservation integrity | `MERGED` | S1 full validation plus prior P2 hardening |
| Observation content integrity | `MERGED` | S2 canonical SHA-256 digest binding |
| TeacherFeedback integrity | `MERGED` | Complete observation/digest/candidate binding; consent/personal metadata excluded |
| S3 admission integrity | `MERGED` | Domain/replay/collision/version assertions |
| S3.1 admission coordination | `MERGED` | Authoritative snapshot, CAS conflict, method pinning, ambiguous-outcome no-auto-retry |
| B1 fixed benchmark | `MERGED_INTERNAL` | 8 self-authored fixtures / 32 teacher-approved event-local labels; source SHA-256 binding |
| B2 evaluation harness | `MERGED_INTERNAL` | Deterministic measurement-only report; blocked cases remain in denominator; no filesystem/network/callback authority |

## B1 benchmark boundary

`TeacherFingeringBenchmark 1.0.0` is fixed evaluation evidence, not a live TeacherFeedback or training dataset.

Current B1 artifact:

- benchmark ID `teacher-fingering-v1`, version `1.0.0`,
- `teacher-approved` review state,
- 8 self-authored monophonic MusicXML fixtures,
- 32 teacher-approved note-event labels,
- exact source SHA-256 content binding,
- event-local accepted position sets,
- optional event-local preferred positions,
- no teacher/student identifiers, emails, free-form feedback reasons, consent metadata, private lesson material, or mutable network sources.

Teacher approval applies to one exact reviewed artifact/version. Material fixture/label/config/case changes require a new version/review cycle. Event-local accepted labels do not establish whole-piece/path-level teacher approval.

## B2 evaluation boundary

`TeacherFingeringBenchmarkEvaluation 1.0.0` is an internal measurement harness. It does not change deterministic optimizer decisions.

It requires:

- teacher-approved B1 input,
- exact case order and one source entry per benchmark case,
- source SHA-256 match before conversion,
- exact non-rest event identity/order alignment,
- fail-closed handling for malformed/proxy/accessor/sparse/custom-array inputs,
- native-array boundaries to prevent inherited prototype dispatch from redirecting evaluation,
- blocked conversions to remain in benchmark denominators.

The harness performs no filesystem/network loading and accepts no caller-supplied loader/callback authority.

Current deterministic baseline:

| Metric | Count |
|---|---:|
| Benchmark cases | 8 |
| Benchmark events | 32 |
| Evaluated cases | 8 |
| Evaluated events | 32 |
| Acceptable matches | 32 |
| Preferred-eligible events | 28 |
| Preferred matches | 26 |
| Case passes | 8 |
| Candidate-coverage failures | 0 |
| Blocked conversions | 0 |

The fixed B1 set must not be used as training data and then reused as independent evaluation evidence.

## Public package-root API

Current `src/index.js` exposes exactly:

- `ENGINE_ERROR_CONTRACT_VERSION`
- `FretboardError`
- `PREFLIGHT_STATUS`
- `convertMusicXmlToCanonicalTab`
- `getPositionCandidates`
- `isEngineError`
- `positionToMidi`
- `preflightMusicXml`
- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`
- `validateMidi`

Benchmark/evaluation/observation/digest/feature/feedback/admission APIs remain internal.

## Learning-system infrastructure

No learned ranking system is active and no learning component affects normal conversion.

Merged foundations now include S1/S2/S3/S3.1 plus B1/B2 deterministic evaluation infrastructure. B1/B2 provide independent fixed evaluation evidence; they do **not** authorize training, live dataset collection, persistence, or production learned selection.

For any live/mutable research/training use:

1. a concrete durable/atomic admission provider still requires separate implementation and review;
2. privacy/consent or another lawful-use basis requires a separately versioned boundary;
3. the fixed B1 evaluation set must remain separate from training data;
4. cryptographic trusted-producer authenticity remains absent;
5. learned ranking may only begin shadow-only after separate scope/threat-model approval.

Traceability: PR #56 S1, #58 S2, #60 S3, #61 S3.1, #63 B1, #64 B2.

## Repository governance status

| Item | Status | Evidence |
|---|---|---|
| `main` protected | configured | Fresh GitHub branch inspection on runtime baseline |
| Workflow supply-chain controls | configured | Third-party actions pinned; workflow permissions `contents: read` |
| Administrator enforcement | `GOVERNANCE_OPEN` | Required-check enforcement remains recorded at `non_admins` |
| Repository ruleset | `GOVERNANCE_OPEN` | No independently verified second ruleset layer claimed |

## Verification evidence and limitation

Fresh merge-post GitHub-hosted **Tests #406** on runtime baseline `750f2a0923fc47df5883dc460d0769bb172c30e2` completed successfully on Node.js 18, 20, and 22.

Node.js 22 recorded:

- **379 tests**,
- **379 pass**,
- **0 fail**,
- npm audit: **0 vulnerabilities**.

The exact head of PR #64 (`2a8727c17332f74f473d7769dd8e926faabfe472`) passed **Tests #405** and **MusicXML Compatibility #246** before merge. No separate post-merge `main` MusicXML Compatibility run is claimed.

Passing tests verify repository-covered boundaries only. They do not prove compatibility with every MusicXML producer, cryptographic producer authenticity, honesty/durability of an arbitrary external store, lawful-use authorization, path-level pedagogical truth, or learned-ranking safety.

## Approved next safe implementation order

B1 and B2 are complete on the runtime baseline. The next gates are:

| Order | Work item | Status |
|---:|---|---|
| 1 | Read-only threat-model/scope review for Learned Ranking v1 — shadow mode | `READY_FOR_REVIEW` |
| 2 | Minimal internal shadow-ranking contract/implementation | `BLOCKED` pending separate review/approval |
| 3 | Shadow evaluation against fixed B1/B2 baseline | `BLOCKED` pending shadow implementation |
| 4 | Independent learned-ranking evaluation gate | `BLOCKED` |
| 5 | Concrete durable/atomic admission provider for any live/mutable feedback dataset | `BLOCKED` pending provider-specific review |
| 6 | Versioned privacy/consent or lawful-use research boundary | `BLOCKED` |
| 7 | Teacher-feedback research dataset pipeline | `BLOCKED` pending durable admission + lawful-use controls |
| 8 | Controlled learned-ranking opt-in | `BLOCKED` pending separate evidence/approval |

Shadow mode must not change deterministic selected positions, `CanonicalTabResult`, writers, physical validation, public API, or production conversion behavior.

G0.1 administrator-bypass hardening remains a parallel governance task.

## Long-term chord/barre sequence

1. Chord / simultaneous-event model
2. Left-hand shape contract
3. Finger assignment + barre / partial-barre representation
4. Chord candidate generator
5. Physical playability validator v2
6. Deterministic left-hand optimizer
7. Pedagogical feature vector v2
8. Chord benchmark v2
9. Learned pedagogical ranking v2

## Explicitly not implemented

- public `EngineError` class or writer/domain error-class exports
- public GuitarConfiguration/Integration/observation/digest/feature/feedback/admission/benchmark/evaluation APIs
- observation/feedback/admission integration into normal conversion
- cryptographic producer signing/attestation
- concrete production durable/atomic admission backend
- global TeacherFeedback/observation persistence registry
- separately versioned research/training privacy/consent/lawful-use record
- live feedback-backed research/training dataset pipeline
- learned ranking/training/model registry
- learned-ranking shadow implementation or production opt-in
- HTTP/UI/mobile/PDF/OMR/Audiveris/SesliTab integration
- chords/polyphony/finger assignment/barre
- multipart/multistaff/grace-note/tuplet/`.mxl` support

## Update rule

Update this file whenever merged behavior changes feature availability, public API state, contracts, blockers, verification evidence, or the approved next safe step.
