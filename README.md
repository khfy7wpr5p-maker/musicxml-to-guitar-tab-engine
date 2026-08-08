# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts supported MusicXML scores into playable six-string guitar tablature.

AI agents and development tools should begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Current state

Verified runtime `main`: `0d8e2258540ca11ff51cd508e4c1c482250ca201`.

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
- internal `OptimizerObservation 1.0.0`, `PedagogicalFeatureVector 1.0.0`, and `TeacherFeedback 1.0.0` foundations,
- merged OptimizerObservation Step 1 and Step 2.1–2.4 integrity hardening.

`EngineError` itself and internal writer/domain error subclasses are not package-root exports.

The three observation/research foundations are not package-root exports and are not wired into normal conversion. OptimizerObservation now has merged hostile-data, required cost-shape, selected-playability, aggregate-consistency, and negative-regression hardening. Broader benchmark/research use remains blocked by the separate `TeacherFeedback` observation/candidate binding, dataset-admission, and privacy/consent gates.

Fresh merge-post GitHub-hosted **Tests #297** on verified `main` passed on Node.js 18/20/22. The exact head of PR #51 passed MusicXML Compatibility on the same tree later merged as current `main`, including alphaTab import/SVG/browser/synth and MuseScore diagnostic jobs. No separate post-merge `main` Compatibility run is claimed.

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

`OptimizerObservation`, `PedagogicalFeatureVector`, and `TeacherFeedback` remain downstream, internal foundations. They do not currently run in this pipeline or change `CanonicalTabResult`.

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
| Documentation convergence | Current status set + OptimizerObservation contract synchronized with Step 2 closure |
| `GuitarConfiguration 1.0.0` | Internal contract merged |
| `Integration Contract v1` | Internal boundary metadata and documentation merged |
| `OptimizerObservation 1.0.0` | Internal foundation merged; Step 1 and Step 2.1–2.4 hardening merged; not pipeline-wired |
| Historical PR #42 observation P2 threads | Runtime findings addressed; GitHub thread-resolution bookkeeping still pending |
| `PedagogicalFeatureVector 1.0.0` | Internal deterministic foundation merged; not pipeline-wired |
| `TeacherFeedback 1.0.0` | Internal foundation merged; exact observation/candidate binding and dataset admission still blocked |
| Deterministic teacher-verified benchmark | Not started; blocked by feedback hardening |
| Benchmark evaluation harness | Not started |
| Learned ranking v1, shadow mode | Not started and blocked |
| Feedback-to-research-dataset pipeline | Not started; requires separate privacy/consent and admission contracts |
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

Third-party workflow actions are pinned to immutable SHAs and workflow permissions are read-only (`contents: read`). Administrator-bypass hardening remains an open governance task from the latest recorded settings inspection. This documentation-only update does not change repository settings.

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

## Development

Requirements: Node.js 18+ and npm.

```bash
npm ci --ignore-scripts
npm test
```