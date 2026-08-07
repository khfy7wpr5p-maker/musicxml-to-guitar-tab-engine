# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Verified snapshot

- Last verified: 2026-08-07
- Authoritative branch: `main`
- Verified main commit: `e60426d841981011518ec04435f93b3e8a7d71b2`
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Public error detection boundary: `PEB-1`
- Milestone 3 public writer API: merged
- PEB-1 public error detection boundary: merged
- Governance note: `main` is protected with seven required checks, but required-check enforcement remains `non_admins`; administrator-bypass hardening is still open.
- CI evidence note: PEB-1 local validation passed (`241/241` repository tests, focused `17/17` error/public-API tests, `git diff --check`, and `npm pack --dry-run`), but GitHub-hosted PR jobs did not start because of account billing/spending-limit restrictions. Do not describe those hosted jobs as passed.

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
9. architecture and MVP documents

Open pull requests, feature branches, issue descriptions, and planned documentation are not implemented capabilities until merged into `main`.

## Current merged scope

The current `main` includes:

- MusicXML `.musicxml` and `.xml` text or buffer input
- strict XML safety and supported MusicXML structure checks
- immutable internal `ParsedMusicXmlDocument 1.0.0`
- shared single semantic parse across public preflight and conversion
- centralized `ProcessingBudget 1.0.0`
- XML byte, depth, element, attribute, text, measure, and event limits
- cooperative deadline, monotonic-clock validation, `AbortSignal` cancellation, and runtime checkpoints through optimizer loops
- hostile-input and boundary regression coverage
- immutable `CanonicalMusicDocument`
- deterministic physical string/fret candidate generation
- explainable deterministic cost model and dynamic-programming optimizer
- immutable `CanonicalTabResult 1.0.0`
- machine-verifiable canonical JSON Schema and shared runtime validator
- public deterministic JSON, ASCII TAB, and TAB MusicXML serializer APIs
- internal `EngineError 1.0.0` convergence
- public `ENGINE_ERROR_CONTRACT_VERSION` and `isEngineError(value)` detection boundary
- public `FretboardError` preserved for backward compatibility
- GitHub Actions third-party action references pinned to immutable commit SHAs

Package-root writer serializers are:

- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`

`EngineError` itself and internal writer/domain error subclasses remain intentionally private.

## Not implemented

Do not claim that the following exist:

- package-root `EngineError` class export
- package-root writer error-class exports
- a public serialized error envelope
- versioned public `GuitarConfiguration 1.0`
- `Integration Contract v1`
- optimizer observation contract
- pedagogical feature-vector contract
- teacher-feedback persistence or contract
- deterministic teacher-verified fingering benchmark
- learned candidate ranking or model training
- production HTTP server, UI, PWA, mobile application
- PDF/OMR/Audiveris or SesliTab integration
- chord/polyphonic conversion, left-hand finger assignment, barre representation
- multipart/multistaff selection, grace notes, tuplets, compressed `.mxl`

## Non-negotiable architecture rules

1. `CanonicalTabResult` is the single authoritative source for downstream TAB output.
2. Writers use approved `selectedPosition` values and never regenerate candidates or rerun optimization.
3. The parser does not choose guitar strings or frets.
4. Structural validation and musical semantic projection remain separate boundaries.
5. Physical validity is enforced before any learned component is consulted.
6. The deterministic optimizer remains reproducible for the same supported input, configuration, profile, and engine version.
7. Unsupported structures fail explicitly or generate explicit warnings.
8. Teacher review remains required for educational use.
9. Operational observations and teacher feedback remain outside immutable canonical musical results unless a new versioned contract explicitly requires otherwise.
10. External systems connect through explicit versioned contracts/adapters.
11. Learned components may score only deterministic, physically validated candidates.
12. Learned components may not create or alter MusicXML notes, pitch, strings, frets, timing, physical rules, validators, or canonical objects directly.
13. The deterministic cost profile remains the required fallback.

## Approved controlled roadmap

G0.1 administrator-bypass hardening remains an open governance task.

The controlled product sequence is:

1. documentation convergence after Milestone 3 and PEB-1,
2. `GuitarConfiguration 1.0`,
3. `Integration Contract v1`,
4. `OptimizerObservation 1.0.0`,
5. deterministic `PedagogicalFeatureVector 1.0`,
6. immutable `TeacherFeedback 1.0`,
7. deterministic teacher-verified fingering benchmark,
8. learned candidate ranking v1 in shadow mode,
9. controlled learned ranking only after separate evidence and approval.

`Integration Contract v1` must define the stable boundary between this deterministic engine and external systems without introducing HTTP, UI, OMR, SesliTab, or application logic into the core. It should cover supported input/output contracts, public error detection/versioning, compatibility expectations, configuration/version references, and explicit non-authorities of integrations.

Long-term chord work must first introduce simultaneous-event and left-hand-shape contracts, then finger/barre representation, chord candidate generation, physical playability validation v2, deterministic left-hand optimization, pedagogical features v2, benchmark v2, and only then learned pedagogical ranking v2.

## Safe working protocol

1. Verify current `main` before work.
2. Read `docs/current-status.md` and `docs/package-status.md`.
3. Inspect overlapping open pull requests.
4. Use one small independently testable feature per branch/PR.
5. Branch from current `main` unless explicitly approved otherwise.
6. Preserve public APIs, canonical contracts, deterministic output, and error behavior unless an approved migration says otherwise.
7. Run focused and full tests when runtime/package entry points change.
8. Record unavailable verification honestly.
9. Open changes as Draft PRs and do not mark Ready or merge without explicit approval.
10. Do not infer that public detection authorizes public `EngineError` or domain error classes.
11. Do not infer that future learned-ranking approval authorizes candidate generation, validator bypass, or canonical mutation.

## Repository governance note

`main` is protected with seven required checks, but enforcement remains `non_admins`. No repository ruleset currently provides a second enforcement layer. Administrator-bypass hardening remains open.

## Documentation maintenance

Update these files together when material status changes:

- `AI_CONTEXT.md`
- `docs/current-status.md`
- `docs/package-status.md`
- `README.md`

Only merged behavior may be described as current capability.
