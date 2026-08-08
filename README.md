# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts supported MusicXML scores into playable six-string guitar tablature.

AI agents and development tools should begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Current state

Verified runtime `main`: `0446c6dec12ed688806c38494e46faa9aa578ca1`.

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
- merged OptimizerObservation Step 1 and Step 2.1–2.4 integrity hardening,
- merged S1 reusable full `OptimizerObservation` validation shared by observation production and TeacherFeedback admission,
- merged S2 domain-separated SHA-256 observation content-digest binding,
- merged S3 `ObservationAdmission 1.0.0` provenance/dataset-admission contract foundation,
- merged S3.1 `ObservationAdmissionAtomicAdapter 1.0.0` authoritative-snapshot plus revision-token compare-and-commit coordination boundary,
- merged TeacherFeedback exact-observation binding, canonical-candidate validation, exact candidate membership, digest verification, and consent/privacy separation hardening.

`EngineError` itself and internal writer/domain error subclasses are not package-root exports.

The observation/research foundations are not package-root exports and are not wired into normal conversion. S1 validates the complete supported `OptimizerObservation` invariants. S2 adds a deterministic, canonical SHA-256 fingerprint of the fully validated observation; `TeacherFeedback 1.1.0` requires that supplied digest to match before a feedback record is admitted. S3 binds a validated observation/digest to bounded admission, producer, producer-revision, run, engine, optimizer, candidate, and guitar-contract identities inside one explicit admission domain while rejecting replay/collision conditions against supplied domain history. S3.1 removes caller-supplied history from the commit path and requires an authoritative snapshot plus revision-token compare-and-commit store contract.

The digest is an integrity fingerprint, not a digital signature or trusted-producer attestation. S3/S3.1 are contract/orchestration foundations, not a production persistence implementation: the core cannot prove that an external store is durable, complete, fresh, or cryptographically authentic. Consent/privacy or lawful-use authorization remains separate and is not encoded in TeacherFeedback or ObservationAdmission.

Fresh merge-post GitHub-hosted **Tests #340** on verified `main` passed on Node.js 18/20/22 with **349/349 tests passing** and npm audit reporting **0 vulnerabilities**. The exact head of PR #61 (`664d0c42b65a1add184d438bda641e695de7eed0`) passed **Tests #339** and **MusicXML Compatibility #183** before merge. No separate post-merge `main` Compatibility run is claimed.

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

`OptimizerObservation`, `OptimizerObservationDigest`, `PedagogicalFeatureVector`, `TeacherFeedback`, `ObservationAdmission`, and `ObservationAdmissionAtomicAdapter` remain downstream, internal foundations. They do not currently run in this pipeline or change `CanonicalTabResult`.

## Architectural rules

1. `CanonicalTabResult` is the single authoritative downstream TAB source.
2. Writers use `selectedPosition` and never rerun optimization.
3. The parser does not choose strings/frets.
4. Physical validity precedes any future learned component.
5. Deterministic optimization remains the required fallback.
6. Unsupported structures fail explicitly or generate explicit warnings.
7. Teacher review remains required for educational use.
8. External systems connect through explicit versioned contracts/adapters.
9. Learned systems may score only already-generated, physically valid candidates.
10. Learned systems may not mutate MusicXML, pitch, strings, frets, physical rules, validators, or canonical objects directly.
11. Teacher feedback is non-authoritative observation data; it is not consent for research, training, or reuse of free-text reasons.
12. Observation digest equality proves only content-integrity correspondence to the supplied digest; it does not prove trusted producer identity or dataset admissibility.
13. S3 admission identities are bounded assertions, not cryptographic producer/revision/run authentication.
14. S3.1 atomicity/durability guarantees belong to the conforming external store; the core adapter does not manufacture those guarantees.
15. Ambiguous post-commit outcomes must not be blindly retried; reconciliation requires a fresh authoritative read.

## Public package API

Current package-root exports include:

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

| Stage | Verified state on the runtime snapshot |
|---|---|
| Milestones 2A-2D, SEC-CI-1, Public Writer API | Merged |
| Documentation convergence | S3/S3.1 status synchronization in progress in the current docs-only change |
| `GuitarConfiguration 1.0.0` | Internal contract merged |
| `Integration Contract v1` | Internal boundary metadata and documentation merged |
| `OptimizerObservation 1.0.0` | Internal foundation merged; Step 1, Step 2.1–2.4 and S1 reusable full validation merged; not pipeline-wired |
| `OptimizerObservationDigest 1.0.0` | Internal domain-separated SHA-256 content-integrity contract merged |
| Historical PR #42 observation P2 threads | Runtime findings addressed; all three historical review threads resolved |
| `PedagogicalFeatureVector 1.0.0` | Internal deterministic foundation merged; not pipeline-wired |
| `TeacherFeedback 1.1.0` | Internal foundation merged; exact observation/candidate binding, shared full-observation validation, required matching observation digest, and consent/privacy separation merged; not pipeline-wired |
| Historical PR #44 TeacherFeedback P2 threads | Both historical review threads resolved after merged runtime/regression verification |
| S2 observation content-digest binding | Merged in PR #58 |
| S3 observation provenance / dataset-admission contract | Merged in PR #60 as internal `ObservationAdmission 1.0.0` foundation |
| S3.1 authoritative/atomic admission adapter contract | Merged in PR #61 as internal `ObservationAdmissionAtomicAdapter 1.0.0` boundary |
| Concrete durable production admission store | Not implemented; requires separate provider-specific implementation/review |
| Deterministic teacher-verified benchmark | Not started; may be evaluated as a separate fixed-artifact gate after documentation convergence, without treating S3.1 as deployed persistence |
| Benchmark evaluation harness | Not started |
| Learned ranking v1, shadow mode | Not started and blocked |
| Feedback-to-research-dataset pipeline | Not started; requires concrete durable admission/persistence plus privacy/consent or lawful-use controls |
| Learned-ranking evaluation gate | Not started |
| Controlled learned-ranking opt-in | Long-term; requires separate evidence and approval |

`Integration Contract v1` defines a boundary, not a transport or application implementation. It does not move HTTP, UI, PDF/OMR, Audiveris, SesliTab, or application-specific logic into the core engine.

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

Third-party workflow actions are pinned to immutable SHAs and workflow permissions are read-only (`contents: read`). `main` remains protected. Administrator-bypass hardening remains an open governance task because the latest recorded branch-protection inspection reports required-check enforcement at `non_admins`.

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

## Development

Requirements: Node.js 18+ and npm.

```bash
npm ci --ignore-scripts
npm test
```
