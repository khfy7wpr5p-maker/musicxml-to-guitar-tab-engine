# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Authority and verified baseline

- Authoritative branch: `main`
- Verified baseline before PEB-1: `24b92e26b5f9c84451caa2a8ef2432ffbd79e711`
- That baseline merged PR #36, **Milestone 3 public writer API**.
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- `main` is protected with seven required checks, but required-check enforcement still reports `non_admins`; administrator-bypass hardening remains a separate governance task.

The tree containing this file includes the PEB-1 public error-detection boundary. If this tree is not yet merged into `main`, treat PEB-1 as proposed behavior only. Always verify current `main`, open PRs, and exact-head CI before claiming authority.

## Project purpose

This repository is an independent deterministic MusicXML → six-string Guitar TAB engine. It accepts supported `.musicxml` and `.xml` input and produces one authoritative immutable `CanonicalTabResult`, from which presentation writers derive output without recalculating fingering.

Supported core flow:

1. safe XML normalization and structural ceilings,
2. one SAX parse into immutable `ParsedMusicXmlDocument`,
3. structural validation and monophonic semantic projection,
4. immutable `CanonicalMusicDocument`,
5. physically valid guitar candidate generation,
6. deterministic explainable cost model and dynamic-programming optimizer,
7. immutable `CanonicalTabResult 1.0.0`,
8. shared canonical validation,
9. JSON, ASCII TAB, and TAB MusicXML writers.

Educational output requires teacher review.

## Current package-root surface in this tree

The package-root API contains:

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

Milestone 3 made the three serializer functions public. PEB-1 adds only the contract version and type guard.

The `EngineError` class itself and writer/domain error subclasses remain internal except for the pre-existing public `FretboardError` compatibility export.

## Error boundary

`isEngineError(value)` is a nominal detector for errors inheriting from this package's internal `EngineError`. It does not trust plain objects that merely look like engine errors.

For detected engine errors, programmatic handling should prefer `error.code`. Human-readable `message` text is not the primary machine contract.

PEB-1 does not change existing error names, codes, details, wrapping, preflight conversion, or writer behavior.

## Non-negotiable architecture rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers use `selectedPosition`; they never regenerate candidates or rerun optimization.
3. The parser never chooses strings or frets.
4. Physical candidate validation happens before any future learned component.
5. Deterministic cost + optimizer remain the required baseline and fallback.
6. Unsupported musical structures fail explicitly or produce explicit warnings; do not guess missing music.
7. Teacher review remains the final human approval boundary for educational use.
8. Observations, teacher feedback, and learned scores remain outside canonical musical truth unless a new versioned contract explicitly says otherwise.
9. Learned systems may score only deterministic, physically valid candidates.
10. Learned systems may not create or alter MusicXML notes, pitch, timing, string/fret candidates, physical validators, or canonical objects directly.

## Implemented milestones

Merged on the verified baseline or earlier:

- 2A immutable parsed MusicXML / single SAX foundation
- 2B shared public preflight + conversion parse
- 2C-1 centralized `ProcessingBudget 1.0.0`
- 2C-2 XML structural limits
- 2C-3 measure/event semantic limits
- 2C-4 deadline and cancellation
- 2C-4.1 runtime checkpoints through candidate/optimizer loops
- 2C-5 hostile-input regression corpus
- SEC-CI-1 immutable GitHub Action SHA pinning
- 2D-1 through 2D-4 internal `EngineError 1.0.0` convergence
- documentation convergence PR #35
- Milestone 3 public writer API PR #36

PEB-1 is the next narrow public compatibility boundary represented by this tree.

## Approved next safe order

After PEB-1 is fully verified and merged:

1. `GuitarConfiguration 1.0`
2. `OptimizerObservation 1.0.0`
3. deterministic `PedagogicalFeatureVector 1.0`
4. immutable `TeacherFeedback 1.0`
5. deterministic teacher-verified fingering benchmark
6. learned candidate ranking v1 — shadow only
7. controlled learned ranking only after separate evidence and approval

Long-term chord work must proceed through simultaneous-event modeling, left-hand shape and finger/barre representation, chord candidate generation, physical validator v2, deterministic left-hand optimization, feature vector v2, benchmark v2, then learned ranking v2.

## Not implemented

Do not claim support for:

- public `EngineError` class or public writer/domain error classes beyond `FretboardError`
- versioned public `GuitarConfiguration 1.0`
- optimizer observation or pedagogical feature contracts
- teacher-feedback persistence or benchmark dataset
- learned fingering ranking or training/model registry
- HTTP service, UI/mobile app, PDF/OMR/Audiveris, or SesliTab adapter
- chords/polyphony, left-hand finger assignment, barre/partial barre
- multipart/multistaff selection, grace notes, tuplets, or compressed `.mxl`

## Safe working protocol

Before changing the repository:

1. verify current `main` and protection state,
2. read `docs/current-status.md` and `docs/package-status.md`,
3. inspect open PRs for overlap,
4. distinguish read-only approval from write approval,
5. branch from exact current `main`,
6. keep each PR small and independently testable,
7. preserve public/canonical/deterministic contracts unless an approved migration explicitly changes them,
8. run Node.js 18/20/22 and relevant MusicXML compatibility CI on the exact final PR head,
9. keep PRs Draft until explicit Ready approval,
10. require a separate explicit merge approval,
11. never write directly to `main` as part of normal development.

## Source-of-truth order

When sources disagree, prefer:

1. merged source, tests, schemas, package metadata, and workflows on current `main`
2. canonical schema/runtime contract modules
3. `docs/engine-error-contract.md`
4. `docs/current-status.md`
5. `docs/package-status.md`
6. README and older architecture documents

Open branches and PRs are proposals until merged.
