# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts supported MusicXML scores into playable six-string guitar tablature.

AI agents and development tools should begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Current state

Authoritative `main` head reviewed for PA-0: `3044fc960461334047ae03da4d8bc472479d01e9`.

This merge contains LR-S0 Shadow Ranking Foundation v1 from PR #66. The exact PR head `7355004692b14994e69c13ceae75262ceadc6090` passed GitHub-hosted Tests #421 and MusicXML Compatibility #260; Node.js 22 recorded 385/385 tests passing and npm audit reported 0 vulnerabilities. No separate post-merge `main` workflow run is claimed here.

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
- merged B2 `TeacherFingeringBenchmarkEvaluation 1.0.0` deterministic evaluation harness,
- merged LR-S0 internal `ShadowRankingReport 1.0.0` / `ShadowRankingModel 1.0.0` foundation with mandatory `mode: "shadow"` and `authority: "none"`.

The B1 benchmark contains **8 self-authored fixed MusicXML cases / 32 teacher-approved note events**. The B2 deterministic baseline is **32/32 acceptable**, **26/28 preferred**, **8/8 case passes**, **0 candidate-coverage failures**, and **0 blocked conversions**.

B1/B2 remain evaluation infrastructure rather than training data. LR-S0 uses a hand-authored synthetic reference model; it is not a trained model, does not use B1 as training data, and cannot change normal conversion or `CanonicalTabResult`.

## Current public processing pipeline

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

`OptimizerObservation`, `OptimizerObservationDigest`, `PedagogicalFeatureVector`, `TeacherFeedback`, `ObservationAdmission`, `ObservationAdmissionAtomicAdapter`, benchmark/evaluation components, and LR-S0 shadow-ranking components remain downstream/internal. They are not package-root conversion authorities.

## Architectural rules

1. `CanonicalTabResult` is the single authoritative downstream TAB source for the current public conversion path.
2. Writers use `selectedPosition` and never rerun optimization.
3. The parser does not choose strings/frets.
4. Physical validity precedes any learned fingering component.
5. Deterministic optimization remains the required fallback.
6. Unsupported structures fail explicitly or generate explicit warnings.
7. Teacher review remains required for educational use.
8. External systems connect through explicit versioned contracts/adapters.
9. Current learned/shadow systems may score only already-generated, physically valid candidates.
10. LR-S0 remains observation-only and cannot mutate normal conversion, writers, physical validation, package exports, or canonical output.
11. Teacher feedback is non-authoritative observation data and is not research/training consent.
12. Fixed B1 evaluation evidence must remain separate from future training data.
13. Polyphonic guitar arrangement must be added through a separately versioned parallel projection/arrangement path; the current monophonic validation path must not be weakened to obtain polyphonic support.
14. Original MusicXML remains immutable source truth. Future arrangement transformations such as omission, octave displacement, revoicing, chord reduction, or arpeggiation require explicit provenance.
15. `CanonicalTabResult 1.0.0` remains unchanged until a separately approved compatibility gate determines whether a chord-aware extension or new version is required.

## Public package API

Current package-root exports remain exactly:

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

Benchmark, evaluation, observation, feedback, admission, shadow-ranking, and future arrangement APIs are not package-root exports.

## Current supported musical scope

The current public conversion scope remains:

- `score-partwise`,
- one part / one staff / one voice,
- monophonic notes and rests,
- standard six-string tuning by default,
- validated custom six-string open MIDI tuning internally,
- frets 0–20 by default,
- supported whole/half/quarter/eighth/16th and dotted values,
- supported ties, beam metadata, inherited divisions/time signatures, pickup measures,
- explicit unsupported-notation and unplayable-pitch handling.

Chords, multiple voices, multiple staves, and multipart scores remain fail-closed on this public path.

## Planned Polyphonic MusicXML → Guitar Arrangement path

PA-0 records a future architecture for piano-like MusicXML containing two staves, multiple voices, and simultaneous notes. This is **planned, not implemented**.

```text
MusicXML
   ↓
XML Safety + ProcessingBudget
   ↓
ParsedMusicXmlDocument 1.0.0
   ├───────────────────────────────┐
   ↓                               ↓
existing monophonic          future polyphonic
projection                   projection
   ↓                               ↓
CanonicalMusicDocument       PolyphonicSourceModel
                                   ↓
                           GuitarArrangementPlan
                                   ↓
                           guitar-compatible score
                                   ↓
                         chord / left-hand model
                                   ↓
                         Playability Validator v2
                                   ↓
                         deterministic optimizer
                                   ↓
                         reviewed TAB-result gate
```

The polyphonic path will be developed in separate PA gates and must not alter the existing public monophonic behavior during the early foundation stages. See [Polyphonic Guitar Arrangement Foundation](docs/polyphonic-guitar-arrangement-foundation.md).

## Error boundary

`EngineError 1.0.0` remains internal. Consumers may use `isEngineError(error)` for caught package errors and branch on stable `error.code` values rather than message text.

## Controlled roadmap

| Stage | State |
|---|---|
| Milestones 2A-2D, SEC-CI-1, Public Writer API | Merged |
| `GuitarConfiguration 1.0.0` | Merged internal contract |
| `Integration Contract v1` | Merged internal boundary |
| OptimizerObservation S1 + S2 | Merged |
| S3 / S3.1 admission foundations | Merged internal |
| B1 teacher fingering benchmark | Merged internal |
| B2 deterministic evaluation | Merged internal |
| LR-S0 Shadow Ranking Foundation v1 | **Merged internal; `authority: none`** |
| LR shadow evaluation / path-policy provenance binding | Pending separate gates |
| Concrete durable production admission store | Not implemented |
| Privacy/consent or lawful-use research boundary | Not implemented |
| Teacher-feedback research dataset pipeline | Blocked pending prerequisites |
| Real learned-ranking training | Not started |
| Controlled learned-ranking opt-in | Long-term / separately gated |
| PA-0 Polyphonic Guitar Arrangement architecture | **Documentation/planning gate** |
| PA-1+ polyphonic runtime foundation | Not started |

## Polyphonic Guitar Arrangement safe sequence

```text
PA-0 Documentation / architecture
  ↓
PA-1 PolyphonicSourceModel contract
  ↓
PA-2 parallel polyphonic projection
  ↓
PA-3 simultaneous-event / chord model
  ↓
PA-4 arrangement-decision + provenance
  ↓
PA-5 melody / bass / voice analysis
  ↓
PA-6 deterministic reduction / octave rules
  ↓
PA-7 guitar chord / voicing candidates
  ↓
PA-8 finger assignment + barre / partial-barre
  ↓
PA-9 Physical Playability Validator v2
  ↓
PA-10 Canonical v1/v2 compatibility review
  ↓
PA-11 teacher-approved arrangement benchmark
  ↓
PA-12 internal polyphonic E2E + monophonic regression
  ↓
PA-13 separately approved public arrangement API
  ↓
PA-14 ScoreMosaic / SesliTab adapter integration
```

Future learned arrangement ranking comes only after separate training-data, provenance, lawful-use/privacy, model-lifecycle, and independent-evaluation gates.

## Project boundaries

This repository does not directly implement PDF/image OMR, Audiveris, HTTP service, UI/PWA/mobile application, or SesliTab/ScoreMosaic application behavior. External integration remains adapter-based.

The current runtime also does not yet implement polyphonic arrangement, chord/barre/finger assignment, multipart/multistaff public conversion, grace notes/tuplets, or compressed `.mxl` input.

## Governance

Third-party workflow actions are pinned to immutable SHAs and workflow permissions are read-only (`contents: read`). `main` remains protected. Administrator-bypass hardening remains an open governance task because required-check enforcement is recorded as `non_admins`.

## Documentation

1. [AI context](AI_CONTEXT.md)
2. [Current implementation status](docs/current-status.md)
3. [Package and verification status](docs/package-status.md)
4. [Architecture](docs/ARCHITECTURE.md)
5. [Polyphonic Guitar Arrangement Foundation](docs/polyphonic-guitar-arrangement-foundation.md)
6. [Integration Contract v1](docs/integration-contract-v1.md)
7. [Shadow Ranking Foundation v1](docs/shadow-ranking-contract.md)
8. [Teacher fingering benchmark contract](docs/teacher-fingering-benchmark-contract.md)
9. [Teacher fingering benchmark evaluation contract](docs/teacher-fingering-benchmark-evaluation-contract.md)

## Development

Requirements: Node.js 18+ and npm.

```bash
npm ci --ignore-scripts
npm test
```
