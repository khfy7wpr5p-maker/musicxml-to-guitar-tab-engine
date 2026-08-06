# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Verified snapshot

- Last verified: 2026-08-06
- Authoritative branch: `main`
- Verified runtime baseline: `7ec42c86ce7a0957a5f79ab3a4e3d2c71475183c`
- Baseline change: Milestone 2B shared one MusicXML parse across public preflight and conversion
- Tested Milestone 2B head: `291d185ffcc9b96675b6d3f956fe2073bb9fed55`
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Next mandatory runtime milestone: Milestone 2C resource, deadline, and cancellation limits

If `main` has moved beyond the verified runtime baseline, inspect the new tree, open pull requests, and current CI evidence before treating this snapshot as current.

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
4. `docs/canonical-contract-audit.md`
5. `docs/current-status.md`
6. `docs/package-status.md`
7. `README.md`
8. `docs/ARCHITECTURE.md`, `docs/musicxml-single-pass-safety.md`, and `docs/MVP-SPEC.md`
9. `docs/DATA-CONTRACT.md`, which is a deprecated historical draft

Open pull requests, draft pull requests, feature branches, issue descriptions, and planned documentation are not implemented capabilities until merged into `main`.

## Current merged scope

The verified runtime baseline includes:

- MusicXML `.musicxml` and `.xml` text or buffer input
- strict XML safety and supported MusicXML structure checks
- immutable internal `ParsedMusicXmlDocument 1.0.0`
- one SAX parse for direct validation and parser entry points
- one shared semantic parse across public preflight and canonical conversion
- preflight `PASS`, `WARNING`, and `BLOCKED` classification
- one part, one staff, one voice, and monophonic notes/rests
- whole, half, quarter, eighth, and 16th values
- supported dots, ties, beams, measures, pickups, and time signatures
- immutable `CanonicalMusicDocument`
- standard six-string tuning E2 A2 D3 G3 B3 E4
- default fret range 0–20
- physically valid string/fret candidate generation
- explainable deterministic position and transition costs
- deterministic dynamic-programming fingering optimization
- immutable `CanonicalTabResult 1.0.0`
- machine-verifiable canonical JSON Schema and shared runtime validator
- internal deterministic JSON, TAB MusicXML, and six-string ASCII TAB writers
- public preflight, conversion, and fretboard helper APIs
- Node.js 18, 20, and 22 test coverage
- alphaTab and MuseScore compatibility evidence for the supported TAB MusicXML baseline

See `docs/current-status.md` for milestone and gap details.

## Not implemented on `main`

Do not claim that the following capabilities exist:

- complete central XML depth, element, attribute, text, measure, event, deadline, and cancellation ceilings
- one common public `EngineError` contract
- package-root JSON, TAB MusicXML, or ASCII writer exports
- a central user-facing alternative-tuning configuration surface
- machine-learning fingering ranking
- automatic model training, registry, publication, or activation
- student-specific personalization
- teacher-feedback persistence or training-dataset generation
- production HTTP server
- UI, PWA, or mobile application
- PDF processing or optical music recognition
- Audiveris integration
- SesliTab integration
- chord or polyphonic conversion
- multipart or multistaff selection
- grace-note or tuplet support
- compressed MusicXML `.mxl` input

## Non-negotiable architecture rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers use the approved `selectedPosition`; they do not regenerate candidates or rerun optimization.
3. The parser does not choose guitar strings or frets.
4. Structural validation and musical semantic projection remain separate boundaries.
5. Guitar candidate generation enforces physical validity before any learned component is consulted.
6. The optimizer does not depend on HTTP, UI, PDF, OMR, Audiveris, or SesliTab adapters.
7. Unsupported musical structures produce explicit warnings or errors rather than silent data loss.
8. The same supported input, configuration, profile, and engine version must produce the same deterministic result.
9. Teacher review remains required for educational use.
10. Operational state and teacher feedback remain outside immutable canonical musical results unless a new versioned contract explicitly requires otherwise.
11. External tools and services must be isolated behind versioned adapters.
12. Milestone 2C must be completed before untrusted remote ingestion, HTTP upload, larger input limits, or SesliTab integration.

## Future AI boundary

The approved direction is a controlled hybrid system:

```text
Validated musical events
      ↓
Physically valid guitar candidates
      ↓
Learned candidate preference scores
      ↓
Deterministic constrained optimizer
      ↓
Teacher review and correction
```

A future learned model may rank only candidates already validated by the deterministic guitar engine. It must not:

- create or alter musical notes,
- invent string/fret positions,
- bypass tuning or fretboard rules,
- change canonical timing,
- write or modify its own production code,
- activate immediately from one correction,
- publish or activate a model without offline evaluation, versioning, approval, shadow evidence, and rollback.

The deterministic cost profile is the required fallback.

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

## Documentation maintenance

Update these files together when relevant facts change:

- `AI_CONTEXT.md` for purpose, authority, hard boundaries, and the next mandatory safety gate
- `docs/current-status.md` for feature and milestone state
- `docs/package-status.md` for exports, dependencies, versions, and test evidence
- `README.md` for the human-readable project and architecture overview

Do not promote planned or branch-only behavior to implemented status before merge and fresh evidence.