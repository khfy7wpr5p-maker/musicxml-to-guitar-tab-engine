# Current Implementation Status

This document describes the repository tree containing this file. The authoritative baseline immediately before PEB-1 is `24b92e26b5f9c84451caa2a8ef2432ffbd79e711`, which merged PR #36 (Milestone 3 public writer API). If this file is viewed on an unmerged branch, branch-only behavior is not authoritative until merged into `main`.

## Current contracts

| Contract / area | State in this tree |
|---|---|
| `ParsedMusicXmlDocument 1.0.0` | implemented |
| `ProcessingBudget 1.0.0` | implemented |
| `CanonicalTabResult 1.0.0` | implemented |
| Internal `EngineError 1.0.0` | implemented |
| Milestone 3 public writers | implemented |
| PEB-1 public error detection | implemented in this tree; authoritative only when merged |
| Versioned `GuitarConfiguration 1.0` | partial foundation only |
| Optimizer observation contract | not implemented |
| Pedagogical feature-vector contract | not implemented |
| Teacher feedback contract | not implemented |
| Teacher benchmark | not implemented |
| Learned ranking | not implemented |

## Completed security and architecture milestones

- 2A: immutable parsed MusicXML and single-SAX foundation
- 2B: shared semantic parse for public preflight and conversion
- 2C-1: centralized processing budget
- 2C-2: XML depth/element/attribute/text-byte limits
- 2C-3: MusicXML measure/event limits
- 2C-4: deadline, monotonic clock, and `AbortSignal` cancellation
- 2C-4.1: runtime checkpoints through candidate generation and optimizer loops
- 2C-5: hostile-input and boundary regression corpus
- SEC-CI-1: third-party GitHub Actions pinned to immutable SHAs
- 2D-1 through 2D-4: all current domain errors converged on internal `EngineError 1.0.0`
- PR #35: documentation convergence after 2C/2D
- PR #36: Milestone 3 public JSON, ASCII TAB, and TAB MusicXML serializer API

## Merged deterministic runtime

The engine currently provides safe supported MusicXML parsing, immutable canonical music, physically valid six-string guitar candidates, deterministic cost calculation and DP optimization, immutable canonical TAB results, shared canonical validation, and deterministic JSON/ASCII/TAB-MusicXML output.

`CanonicalTabResult` remains authoritative. Writers consume `selectedPosition` and never regenerate candidates or re-optimize.

## Public package surface in this tree

- `convertMusicXmlToCanonicalTab`
- `preflightMusicXml`
- `PREFLIGHT_STATUS`
- `getPositionCandidates`
- `positionToMidi`
- `validateMidi`
- `FretboardError`
- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`
- `ENGINE_ERROR_CONTRACT_VERSION`
- `isEngineError`

Milestone 3 contributed the three serializer functions. PEB-1 contributes only `ENGINE_ERROR_CONTRACT_VERSION` and `isEngineError`.

## PEB-1 public error boundary

PEB-1 intentionally does **not** export `EngineError`, writer error classes, `GuitarConfigurationError`, `CanonicalTabResultError`, or other internal domain subclasses.

`isEngineError(value)` returns true only for errors inheriting from this package's internal `EngineError` base. It rejects native errors and plain objects that merely imitate the common fields.

For detected engine errors, external logic should prefer `error.code` for machine decisions. PEB-1 does not rename or reclassify existing errors and does not introduce a new wrapping/envelope policy.

The pre-existing `FretboardError` export remains public for backward compatibility.

## Guitar configuration status

`src/guitar/tuning.js` already provides an immutable six-string configuration foundation with validated string numbers, open-string MIDI values, and fret range. The next configuration milestone must strengthen this existing boundary with stable version/identity and pitch↔MIDI consistency rather than create a competing model.

## Governance status

- `main` is protected.
- Seven CI checks are required.
- Required-check enforcement currently reports `non_admins`; administrator bypass hardening remains open.
- No repository ruleset was returned in the latest read-only inspection.
- Historical PR #24 was closed without merge as superseded.

## Approved next safe order

| Order | Work item | State |
|---:|---|---|
| 1 | G0.1 administrator-bypass hardening | governance open; requires authorized settings surface |
| 2 | PEB-1 public error detection | current narrow compatibility change |
| 3 | `GuitarConfiguration 1.0` | next runtime milestone after PEB-1 |
| 4 | `OptimizerObservation 1.0.0` | not started |
| 5 | `PedagogicalFeatureVector 1.0` | not started |
| 6 | `TeacherFeedback 1.0` | not started |
| 7 | deterministic fingering benchmark v1 | not started |
| 8 | learned ranking v1 — shadow | blocked on prerequisites |
| 9 | learned ranking v1 — controlled | blocked on evidence and separate approval |

## Explicitly outside current implementation

HTTP/UI/mobile, PDF/OMR/Audiveris, SesliTab adapter, chords/polyphony, finger assignment, barre/partial-barre, multipart/multistaff selection, grace notes, tuplets, `.mxl`, learned ranking, training pipeline, model registry, and personalization are not implemented.

## Update rule

When a material public API, canonical contract, configuration contract, runtime capability, or governance fact changes, update this file using merged `main` evidence. Do not present an unmerged branch as authoritative.
