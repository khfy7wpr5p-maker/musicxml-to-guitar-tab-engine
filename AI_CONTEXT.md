# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Verified snapshot

- Last verified: 2026-08-07
- Authoritative branch: `main`
- Verified pre-Milestone-3 baseline: `73b04a9f18f6fbb3c3a2e2e584d09d25fc66f099`
- Baseline change: documentation convergence after Milestones 2C and 2D (PR #35)
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Active controlled product milestone: Milestone 3 public writer API
- Milestone 3 branch: `feature/public-writer-api-m3`
- Governance note: `main` is protected with seven required checks, but required-check enforcement is currently `non_admins`; administrator bypass hardening remains an unresolved repository-governance task.
- Historical Draft PR #24 was closed without merge after its 2C-2 behavior was verified as superseded on `main`.

The Milestone 3 branch proposes only three additional package-root serializer functions. Until its pull request is merged, the authoritative `main` public API remains the pre-Milestone-3 surface. Writer error classes and `EngineError` are not part of the Milestone 3 public export proposal.

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

## Current merged scope on the verified base

The verified pre-Milestone-3 `main` baseline includes:

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
- deterministic JSON, TAB MusicXML, and six-string ASCII TAB writer implementations
- internal `EngineError 1.0.0` convergence across current domain error classes
- public preflight, conversion, and fretboard helper APIs
- Node.js 18, 20, and 22 CI coverage
- alphaTab and MuseScore compatibility evidence for the supported TAB MusicXML baseline
- GitHub Actions third-party action references pinned to immutable commit SHAs

Milestone 3 proposes package-root access to the existing writer implementations through exactly these functions:

- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`

The writer implementations themselves are not changed by Milestone 3. They continue to validate `CanonicalTabResult` and use authoritative `selectedPosition` values without candidate regeneration or re-optimization.

See `docs/current-status.md` and `docs/package-status.md` for exact capability and package-surface details.

## Not implemented in the Milestone 3 target state

Do not claim that the following capabilities exist:

- package-root `EngineError` export
- package-root JSON, ASCII, or MusicXML writer error-class exports
- a separately approved public error envelope
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

Repository documentation convergence is merged, and historical Draft PR #24 has been closed without merge. G0.1 administrator-bypass hardening remains open because the connected write surface does not currently expose the required branch-protection mutation.

The controlled product sequence is:

1. Milestone 3 public writer API — active branch; expose only the three serializer functions and preserve all existing writer behavior,
2. public error-boundary compatibility audit,
3. versioned `GuitarConfiguration 1.0`,
4. `OptimizerObservation 1.0.0`,
5. deterministic `PedagogicalFeatureVector 1.0`,
6. immutable `TeacherFeedback 1.0`,
7. deterministic teacher-verified fingering benchmark,
8. learned candidate ranking in shadow mode only,
9. controlled learned ranking only after separate evidence and approval.

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
10. Run focused checks and the full Node.js 18, 20, and 22 matrix when runtime behavior or package entry points change.
11. Run MusicXML compatibility checks when parser, canonical, tuning, rhythm, selected-position, writer behavior, or writer package exposure changes.
12. Record unavailable verification honestly.
13. Open changes as draft pull requests and do not mark ready or merge without explicit approval.
14. Do not infer that internal `EngineError` convergence authorizes a package-root export.
15. Do not infer that public serializer exposure authorizes public writer error classes.
16. Do not infer that future learned-ranking approval authorizes candidate generation, validator bypass, or canonical mutation.

## Repository governance note

The latest read-only branch inspection shows `main` protected with seven required checks, while the required-check enforcement level remains `non_admins`. No repository ruleset currently adds a second enforcement layer. Administrator-bypass hardening is therefore still open and must be handled as a separate repository setting change with explicit approval and verification.

Historical Draft PR #24 is closed and was not merged. Stale feature branches must not be used as implementation bases.

## Documentation maintenance

Update these files together when relevant facts change:

- `AI_CONTEXT.md` for purpose, authority, hard boundaries, governance notes, and the next controlled gate
- `docs/current-status.md` for feature and milestone state
- `docs/package-status.md` for exports, dependencies, versions, and test evidence
- `README.md` for the human-readable project and architecture overview

Do not promote planned or branch-only behavior to implemented status before merge and fresh evidence.
