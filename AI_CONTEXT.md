# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Verified snapshot

- Last verified: 2026-08-07
- Authoritative branch: `main`
- Verified runtime baseline: `c0f954a876f171c2a9ac33a510522632dec80d67`
- Baseline change: Milestone 2D-4 final internal `EngineError 1.0.0` convergence
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Next controlled product milestone: Milestone 3 public writer API
- Governance note: `main` is protected with seven required checks, but required-check enforcement is currently `non_admins`; administrator bypass hardening remains an unresolved repository-governance task.

If `main` moves beyond this snapshot, inspect the new tree, open pull requests, and current CI evidence before treating this file as current.

## Project purpose

This repository contains an independent, deterministic engine that converts supported MusicXML `.musicxml` and `.xml` input into playable six-string guitar tablature.

The engine:

1. normalizes and safely parses MusicXML,
2. validates supported structure and monophonic semantics,
3. creates immutable canonical musical events,
4. generates every physically valid guitar string/fret candidate,
5. selects a reproducible fingering path with a deterministic optimizer,
6. creates one authoritative `CanonicalTabResult`, and
7. derives output formats from that result without recalculating fingering.

Educational output requires teacher review.

## Source-of-truth order

When sources disagree, use this order:

1. Merged source code, tests, package metadata, schemas, and workflows on `main`
2. `schemas/canonical-tab-result.v1.schema.json`
3. `src/contracts/canonicalTabResultContract.js` and related contract modules
4. `docs/engine-error-contract.md`
5. `docs/canonical-contract-audit.md`
6. `docs/current-status.md`
7. `docs/package-status.md`
8. `README.md`
9. `docs/ARCHITECTURE.md`, `docs/musicxml-single-pass-safety.md`, and `docs/MVP-SPEC.md`
10. `docs/DATA-CONTRACT.md`, which is a deprecated historical draft

Open pull requests, draft pull requests, feature branches, issue descriptions, and planned documentation are not implemented capabilities until merged into `main`.

## Current merged scope

The verified runtime baseline includes:

- MusicXML `.musicxml` and `.xml` text or buffer input
- strict XML safety and supported MusicXML structure checks
- immutable internal `ParsedMusicXmlDocument 1.0.0`
- one SAX parse for direct validation/parser entry points
- one shared semantic parse across public preflight and canonical conversion
- centralized `ProcessingBudget 1.0.0`
- XML byte, depth, element, attribute, and text limits
- MusicXML measure and event limits
- cooperative runtime deadline, monotonic-clock validation, and `AbortSignal` cancellation
- runtime checkpoints through candidate generation and dynamic-programming optimizer loops
- hostile-input and boundary regression coverage
- immutable `CanonicalMusicDocument`
- standard six-string tuning E2 A2 D3 G3 B3 E4
- configurable fret range, default 0–20
- physically valid string/fret candidate generation
- explainable deterministic position and transition costs
- deterministic dynamic-programming fingering optimization
- immutable `CanonicalTabResult 1.0.0`
- machine-verifiable canonical JSON Schema and shared runtime validator
- internal deterministic JSON, TAB MusicXML, and six-string ASCII TAB writers
- internal `EngineError 1.0.0` convergence across current domain error classes
- public preflight, conversion, and fretboard helper APIs
- Node.js 18, 20, and 22 CI coverage
- alphaTab and MuseScore compatibility evidence for the supported TAB MusicXML baseline
- GitHub Actions third-party action references pinned to immutable commit SHAs

See `docs/current-status.md` and `docs/package-status.md` for exact capability and package-surface details.

## Not implemented on `main`

Do not claim that the following capabilities exist:

- package-root JSON, TAB MusicXML, or ASCII writer exports
- package-root `EngineError` export or a separately approved public error envelope
- a versioned public `GuitarConfiguration 1.0` contract
- optimizer observation contract
- pedagogical feature-vector contract
- teacher-feedback contract or persistence
- deterministic teacher-verified fingering benchmark
- learned candidate ranking, model training, registry, publication, activation, or personalization
- production HTTP server
- UI, PWA, or mobile application
- PDF processing or optical music recognition
- Audiveris integration
- SesliTab integration
- chord or polyphonic conversion
- left-hand finger assignment or barre representation
- multipart or multistaff selection
- grace-note or tuplet support
- compressed MusicXML `.mxl` input

## Non-negotiable architecture rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers use the approved `selectedPosition`; they do not regenerate candidates or rerun optimization.
3. The parser does not choose guitar strings or frets.
4. Structural validation and musical semantic projection remain separate boundaries.
5. Guitar candidate generation enforces physical validity before any learned component is consulted.
6. The optimizer remains deterministic for the same supported input, configuration, profile, and engine version.
7. Unsupported musical structures produce explicit warnings or errors rather than silent data loss.
8. Teacher review remains required for educational use.
9. Operational state, observations, and teacher feedback remain outside immutable canonical musical results unless a new versioned contract explicitly requires otherwise.
10. External tools and services must be isolated behind versioned adapters.
11. Learned components may score only candidates already created and physically validated by the deterministic engine.
12. Learned components may not create or alter MusicXML notes, pitch, strings, frets, timing, physical rules, validators, or canonical objects directly.
13. The deterministic cost profile remains the required fallback.

## Approved controlled roadmap

The next development sequence is intentionally incremental:

1. repository-governance hardening and documentation convergence,
2. stale historical PR cleanup after separate approval,
3. Milestone 3 public writer API,
4. public error-boundary compatibility audit,
5. versioned `GuitarConfiguration 1.0`,
6. `OptimizerObservation 1.0.0`,
7. deterministic `PedagogicalFeatureVector 1.0`,
8. immutable `TeacherFeedback 1.0`,
9. deterministic teacher-verified fingering benchmark,
10. learned candidate ranking in shadow mode only,
11. controlled learned ranking only after separate evidence and approval.

Long-term chord work must first introduce simultaneous-event and left-hand-shape contracts, then finger/barre representation, chord candidate generation, physical playability validation v2, deterministic left-hand optimization, pedagogical features v2, benchmark v2, and only then learned pedagogical ranking v2.

## Safe working protocol

Before proposing or making changes:

1. Read this file.
2. Verify the current `main` commit.
3. Read `docs/current-status.md` and `docs/package-status.md`.
4. Inspect open pull requests for overlapping files or behavior.
5. Confirm whether the task is read-only or authorizes changes.
6. Treat only merged `main` behavior as current capability.
7. Use one small independently testable feature per branch and pull request.
8. Branch from current `main`, not from an unmerged feature branch, unless explicitly approved.
9. Preserve public APIs, canonical contracts, deterministic output, and existing errors unless an approved migration says otherwise.
10. Run focused checks and the full Node.js 18, 20, and 22 matrix when runtime behavior changes.
11. Run MusicXML compatibility checks when parser, canonical, tuning, rhythm, selected-position, or writer behavior changes.
12. Record unavailable verification honestly.
13. Open changes as draft pull requests and do not mark ready or merge without explicit approval.
14. Do not infer that internal `EngineError` convergence authorizes a package-root export.
15. Do not infer that future learned-ranking approval authorizes candidate generation, validator bypass, or canonical mutation.

## Repository governance note

The latest read-only branch inspection shows `main` protected with seven required checks, while the required-check enforcement level remains `non_admins`. No repository ruleset currently adds a second enforcement layer. Administrator-bypass hardening is therefore still open and must be handled as a separate repository setting change with explicit approval and verification.

A historical Draft PR may remain open even after its behavior has been superseded on `main`. Do not use stale feature branches as implementation bases; audit and close them only with separate approval.

## Documentation maintenance

Update these files together when relevant facts change:

- `AI_CONTEXT.md` for purpose, authority, hard boundaries, governance notes, and the next controlled gate
- `docs/current-status.md` for feature and milestone state
- `docs/package-status.md` for exports, dependencies, versions, and test evidence
- `README.md` for the human-readable project and architecture overview

Do not promote planned or branch-only behavior to implemented status before merge and fresh evidence.
