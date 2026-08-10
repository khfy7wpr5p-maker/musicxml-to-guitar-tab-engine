# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts supported MusicXML scores into playable six-string guitar tablature.

AI agents and development tools should begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Current state

Verified runtime implementation baseline: `750f2a0923fc47df5883dc460d0769bb172c30e2`.

This SHA is the merged B2 runtime baseline. A later documentation-only merge may advance `main` without changing runtime behavior.

Current merged capabilities include:

- secure `.musicxml` / `.xml` input handling,
- single-pass XML parsing with immutable parsed representation,
- shared semantic parse across public preflight and conversion,
- centralized processing/resource limits,
- deadline, monotonic clock, cancellation, and runtime checkpoints,
- hostile-input regression coverage,
- immutable canonical music and TAB contracts,
- physical guitar candidate generation,
- deterministic cost model and dynamic-programming optimizer,
- public deterministic JSON, ASCII TAB, and TAB MusicXML serializers,
- internal `EngineError 1.0.0` convergence,
- public `ENGINE_ERROR_CONTRACT_VERSION` and `isEngineError(value)` detection boundary,
- bounded iterative validation for untrusted `CanonicalTabResult` object graphs,
- internal versioned `GuitarConfiguration 1.0.0`,
- internal `Integration Contract v1` metadata and non-authority boundary,
- internal `OptimizerObservation 1.0.0`, `OptimizerObservationDigest 1.0.0`, `PedagogicalFeatureVector 1.0.0`, and `TeacherFeedback 1.1.0` foundations,
- merged S1 reusable full `OptimizerObservation` validation,
- merged S2 domain-separated SHA-256 observation content-digest binding,
- merged S3 `ObservationAdmission 1.0.0` admission/provenance foundation,
- merged S3.1 `ObservationAdmissionAtomicAdapter 1.0.0` authoritative-snapshot plus revision-token compare-and-commit coordination boundary,
- merged B1 `TeacherFingeringBenchmark 1.0.0` fixed teacher-approved benchmark,
- merged B2 `TeacherFingeringBenchmarkEvaluation 1.0.0` deterministic evaluation harness.

The B1 benchmark contains **8 self-authored fixed MusicXML cases / 32 teacher-approved note events**. Fixture bytes are SHA-256 bound and the labels distinguish teacher-acceptable positions from an optional preferred position. These labels are event-local and do not claim that every combination is a teacher-approved whole-piece fingering path.

The B2 harness evaluates only the fixed teacher-approved B1 artifacts against the existing deterministic conversion pipeline. The current baseline is:

- **32 / 32 acceptable matches**,
- **28 preferred-eligible events**,
- **26 / 28 preferred matches**,
- **8 / 8 case passes**,
- **0 candidate-coverage failures**,
- **0 blocked conversions**.

B1/B2 are internal evaluation infrastructure. They do not change optimizer authority, package-root APIs, or normal conversion output. The fixed benchmark is evaluation evidence, not a live TeacherFeedback dataset and not a training dataset.

S2 digest equality is an integrity fingerprint, not a digital signature or trusted-producer attestation. S3/S3.1 are contract/orchestration foundations, not a production persistence implementation. Consent/privacy or lawful-use authorization remains separate.

Fresh merge-post GitHub-hosted **Tests #406** on runtime baseline `750f2a0923fc47df5883dc460d0769bb172c30e2` passed on Node.js 18/20/22. The Node.js 22 job recorded **379/379 tests passing**, **0 failures**, and npm audit reported **0 vulnerabilities**. The exact head of PR #64 (`2a8727c17332f74f473d7769dd8e926faabfe472`) passed **Tests #405** and **MusicXML Compatibility #246** before merge. No separate post-merge `main` Compatibility run is claimed.

## Processing pipeline

```text
MusicXML
  ↓
XML normalization + safety + ProcessingBudget
  ↓
ParsedMusicXmlDocument 1.0.0
  ├─ structural validation
  └─ monophonic semantic projection
          ↓
CanonicalMusicDocument
          ↓
physical guitar candidates
          ↓
deterministic cost model + optimizer
          ↓
CanonicalTabResult 1.0.0
          ↓
shared canonical validator
          ↓
JSON / ASCII TAB / TAB MusicXML
```

`OptimizerObservation`, `OptimizerObservationDigest`, `PedagogicalFeatureVector`, `TeacherFeedback`, `ObservationAdmission`, `ObservationAdmissionAtomicAdapter`, `TeacherFingeringBenchmark`, and `TeacherFingeringBenchmarkEvaluation` remain downstream/internal capabilities. They are not package-root conversion authorities and do not change `CanonicalTabResult`.

## Architectural rules

1. `CanonicalTabResult` is the single authoritative downstream TAB source.
2. Writers use `selectedPosition` and never rerun optimization.
3. The parser does not choose strings/frets.
4. Physical validity precedes any learned component.
5. Deterministic optimization remains the required fallback.
6. Unsupported structures fail explicitly or generate explicit warnings.
7. Teacher review remains required for educational use.
8. External systems connect through explicit versioned contracts/adapters.
9. Learned systems may score only already-generated, physically valid candidates.
10. Learned systems may not mutate MusicXML, pitch, strings, frets, physical rules, validators, or canonical objects directly.
11. Teacher feedback is non-authoritative observation data; it is not consent for research or training.
12. Observation digest equality proves content correspondence only; it does not prove trusted producer identity.
13. S3 producer/revision/run identifiers are bounded assertions, not cryptographically authenticated identities.
14. S3.1 durability/atomicity guarantees belong to a conforming external store; the core cannot manufacture them.
15. Ambiguous post-commit outcomes must not be blindly retried.
16. B1 teacher approval applies to one exact fixed benchmark artifact/version; changing fixtures or labels requires a new review cycle.
17. B1 accepted/preferred labels are event-local; path-level pedagogical truth requires a separate contract.
18. B2 is measurement-only: benchmark scoring must never change deterministic optimizer decisions.
19. Blocked/failed benchmark cases may not be silently removed from denominators.
20. The fixed B1 evaluation set must not be used as training data and then reused as independent performance evidence.
21. Any learned-ranking work begins in shadow mode and may not affect production selection until a separately approved evaluation/opt-in gate.

## Public package API

Current package-root exports include exactly:

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

Benchmark, evaluation, observation, feedback, admission, and learned-ranking APIs are not package-root exports.

## Supported musical scope

- `score-partwise`
- one part / one staff / one voice
- monophonic notes and rests
- standard six-string tuning by default
- validated custom six-string open MIDI tuning internally
- frets 0–20 by default
- supported whole/half/quarter/eighth/16th and dotted values
- supported ties, beam metadata, inherited divisions/time signatures, pickup measures
- explicit unsupported-notation and unplayable-pitch handling

## Error boundary

`EngineError 1.0.0` remains internal. Consumers may use `isEngineError(error)` for caught package errors and inspect `error.code`, `name`, `details`, and `message`. Machine branching should prefer stable `code` values over message text.

## Approved controlled roadmap

| Stage | Verified state on the runtime implementation baseline |
|---|---|
| Milestones 2A-2D, SEC-CI-1, Public Writer API | Merged |
| `GuitarConfiguration 1.0.0` | Internal contract merged |
| `Integration Contract v1` | Internal boundary merged |
| OptimizerObservation S1 + S2 | Internal validation and content-integrity foundations merged |
| S3 `ObservationAdmission 1.0.0` | Merged internal admission foundation |
| S3.1 `ObservationAdmissionAtomicAdapter 1.0.0` | Merged internal atomic-store orchestration boundary |
| B1 `TeacherFingeringBenchmark 1.0.0` | **Merged in PR #63; 8 fixed teacher-approved cases / 32 events** |
| B2 `TeacherFingeringBenchmarkEvaluation 1.0.0` | **Merged in PR #64; deterministic baseline measured** |
| Learned ranking v1 — shadow-mode scope/threat-model review | **Next safe gate; not started** |
| Learned ranking v1 — shadow implementation | Not started; requires separate approval after scope review |
| Concrete durable production admission store | Not implemented; required before any live/mutable feedback dataset |
| Privacy/consent or lawful-use research boundary | Not implemented |
| Teacher-feedback research dataset pipeline | Blocked pending durable admission + lawful-use controls |
| Learned-ranking evaluation gate | Not started; must compare against deterministic B1/B2 baseline |
| Controlled learned-ranking opt-in | Long-term; requires separate evidence and approval |

The next learned-ranking gate is **shadow-only**. A future shadow ranker may compare alternative candidate scores against B2 evidence, but it must not change the deterministic selected position, canonical result, writers, physical validation, or public conversion behavior.

## Long-term chord/barre sequence

```text
Chord / Simultaneous Event Model
  ↓
Left-Hand Shape Contract
  ↓
Finger Assignment + Barre / Partial-Barre
  ↓
Chord Candidate Generator
  ↓
Physical Playability Validator v2
  ↓
Deterministic Left-Hand Optimizer
  ↓
Pedagogical Feature Vector v2
  ↓
Chord Benchmark v2
  ↓
Learned Pedagogical Ranking v2
```

## Project boundaries

This repository does not directly implement:

- PDF/image OMR,
- Audiveris,
- HTTP service,
- UI/PWA/mobile application,
- SesliTab integration,
- chords/polyphony/barre/finger assignment,
- multipart/multistaff selection,
- grace notes/tuplets,
- compressed `.mxl` input.

## Governance

Third-party workflow actions are pinned to immutable SHAs and workflow permissions are read-only (`contents: read`). `main` remains protected. Administrator-bypass hardening remains an open governance task because required-check enforcement is still recorded as `non_admins`.

## Documentation

1. [AI context](AI_CONTEXT.md)
2. [Current implementation status](docs/current-status.md)
3. [Package and verification status](docs/package-status.md)
4. [EngineError contract](docs/engine-error-contract.md)
5. [Architecture](docs/ARCHITECTURE.md)
6. [GuitarConfiguration contract](docs/guitar-configuration-contract.md)
7. [Integration Contract v1](docs/integration-contract-v1.md)
8. [OptimizerObservation contract](docs/optimizer-observation-contract.md)
9. [Pedagogical feature-vector contract](docs/pedagogical-feature-vector-contract.md)
10. [Teacher-feedback contract](docs/teacher-feedback-contract.md)
11. [Observation admission contract](docs/observation-admission-contract.md)
12. [Observation admission atomic-adapter contract](docs/observation-admission-atomic-adapter-contract.md)
13. [Teacher fingering benchmark contract](docs/teacher-fingering-benchmark-contract.md)
14. [Teacher fingering benchmark evaluation contract](docs/teacher-fingering-benchmark-evaluation-contract.md)

## Development

Requirements: Node.js 18+ and npm.

```bash
npm ci --ignore-scripts
npm test
```
