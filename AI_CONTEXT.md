# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Snapshot

- Last verified: 2026-08-05
- Authoritative branch: `main`
- Verified `main` commit: `3f864d7e822e2025d723ab50dca2838e522b1363`
- Package version: `0.1.0`
- Current canonical TAB schema: `CanonicalTabResult 1.0.0`

If the current `main` commit differs from the commit above, re-check the repository and update both [`docs/current-status.md`](docs/current-status.md) and [`docs/package-status.md`](docs/package-status.md) before treating this snapshot as current.

## Project purpose

This repository contains an independent, deterministic engine that converts supported MusicXML into playable six-string guitar tablature.

The engine:

1. validates and parses supported MusicXML,
2. creates immutable canonical musical events,
3. generates every physically valid guitar string/fret candidate,
4. selects a reproducible fingering path with a deterministic optimizer,
5. creates one authoritative `CanonicalTabResult`, and
6. derives output formats from that result without recalculating fingering.

Educational output requires teacher review.

## Source-of-truth order

When sources disagree, use this order:

1. Merged source code, tests, package metadata, and workflows on `main`
2. [`docs/canonical-contract-audit.md`](docs/canonical-contract-audit.md)
3. [`docs/current-status.md`](docs/current-status.md)
4. [`docs/package-status.md`](docs/package-status.md)
5. [`README.md`](README.md)
6. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/MVP-SPEC.md`](docs/MVP-SPEC.md)
7. [`docs/DATA-CONTRACT.md`](docs/DATA-CONTRACT.md), which is a deprecated historical draft and is not authoritative for the current runtime result

Open pull requests, draft pull requests, feature branches, issue descriptions, and planned documentation are not implemented capabilities until merged into `main`.

## Current implemented scope

The merged engine currently supports:

- MusicXML `.musicxml` and `.xml` text input
- one selected part, one staff, and one voice
- monophonic notes and rests
- standard six-string guitar tuning: E2 A2 D3 G3 B3 E4
- frets 0–20 by default
- whole, half, quarter, eighth, and 16th note values
- supported dotted values, ties, and beam metadata
- measure and time-signature preservation
- XML safety checks and MusicXML preflight classification
- immutable `CanonicalMusicDocument`
- physically valid string/fret candidate generation
- explainable deterministic cost calculation
- deterministic dynamic-programming fingering optimization
- immutable `CanonicalTabResult 1.0.0`
- internal deterministic JSON and TAB MusicXML writers
- public preflight, conversion, and fretboard helper APIs

See [`docs/current-status.md`](docs/current-status.md) for the exact status of each architectural milestone.

## Not implemented on `main`

Do not claim that the following capabilities exist:

- machine-learning fingering model
- automatic model training or model publication
- student-specific personalization
- teacher-feedback persistence or training dataset generation
- production HTTP server
- user interface, PWA, or mobile application
- PDF processing or optical music recognition
- Audiveris integration
- SesliTab integration
- chord or polyphonic conversion
- multipart or multistaff selection
- grace-note or tuplet support
- alternative-tuning feature surface
- compressed MusicXML `.mxl` input
- package-root ASCII TAB writer

A feature may exist in an open draft pull request and still be absent from `main`.

## Non-negotiable architecture rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers use the approved `selectedPosition`; they do not regenerate candidates or rerun optimization.
3. The parser does not choose guitar strings or frets.
4. Guitar candidate generation enforces physical validity before any learned component is consulted.
5. The optimizer does not depend on HTTP, UI, PDF, OMR, Audiveris, or SesliTab adapters.
6. Unsupported musical structures produce explicit warnings or errors rather than silent data loss.
7. The same supported input, configuration, profile, and engine version must produce the same deterministic result.
8. Teacher review remains required for educational use.
9. Operational state and teacher feedback should remain outside the immutable canonical musical result unless a versioned contract explicitly requires otherwise.
10. External tools and services must be isolated behind versioned adapters.

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
- train from an individual correction and activate immediately,
- publish or activate a model without offline evaluation, versioning, approval, and rollback evidence.

The deterministic cost profile is the required fallback.

## Safe working protocol for AI agents

Before proposing or making changes:

1. Read this file.
2. Verify the current `main` commit.
3. Read `docs/current-status.md` and `docs/package-status.md`.
4. Inspect open pull requests for overlapping files or behavior.
5. Confirm whether the task is read-only or authorizes changes.
6. Treat only merged `main` behavior as current capability.
7. Use the smallest independently testable scope.
8. Branch from the current verified `main`, not from an unmerged feature branch, unless explicitly approved.
9. Preserve public APIs, canonical contracts, deterministic output, and existing tests unless an approved migration says otherwise.
10. Run focused checks and the full Node.js 18, 20, and 22 test matrix when runtime behavior changes.
11. Record missing or unavailable verification honestly.
12. Open changes as a draft pull request and do not merge or mark ready without explicit approval.

## Documentation maintenance rule

Update these files together when relevant facts change:

- `AI_CONTEXT.md` for project purpose, authority rules, or hard boundaries
- `docs/current-status.md` for feature and milestone state
- `docs/package-status.md` for package exports, dependencies, versions, and verification evidence

Do not update a status from planned or draft to implemented until the responsible pull request is merged and the required evidence is available.