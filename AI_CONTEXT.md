# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Verified snapshot

- Last verified: 2026-08-08
- Authoritative branch: `main`
- Verified runtime main commit: `316ce430c7721b2736721d6dff4a1eea3daedb03`
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Public error detection boundary: `PEB-1`
- Milestone 3 public writer API: merged
- PEB-1 public error detection boundary: merged
- `GuitarConfiguration 1.0.0`: internal contract merged
- `Integration Contract v1`: internal metadata/non-authority boundary merged
- `OptimizerObservation 1.0.0`: internal foundation merged; Step 1, Step 2.1–2.4, and S1 reusable full-observation validation merged; not pipeline-wired
- `PedagogicalFeatureVector 1.0.0`: internal foundation merged; not pipeline-wired
- `TeacherFeedback 1.0.0`: internal foundation merged; exact observation/candidate binding, shared full-observation validation, and consent/privacy separation hardening merged; not pipeline-wired
- Historical PR #42 OptimizerObservation P2 threads: all resolved
- Historical PR #44 TeacherFeedback P2 threads: both resolved
- Governance note: administrator-bypass hardening remains open from the latest recorded settings inspection.
- Verification note: merge-post GitHub-hosted Tests #311 passed on current `main` for Node.js 18/20/22. The exact head of PR #56 (`28d362390c8191546e014713c7b6992c87900615`) passed Tests #310 and MusicXML Compatibility #159. Compatibility import/SVG, renderer/cursor, and MuseScore jobs succeeded; the non-blocking alphaTab synth diagnostic reported a pre-existing `Maximum call stack size exceeded` readiness failure and remains a separate P3 diagnostic issue. No separate post-merge `main` Compatibility run is claimed.

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
4. `docs/integration-contract-v1.md`
5. the applicable versioned contract document under `docs/`
6. `docs/engine-error-contract.md`
7. `docs/canonical-contract-audit.md`
8. `docs/current-status.md`
9. `docs/package-status.md`
10. `README.md`
11. architecture and MVP documents

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
- bounded iterative `CanonicalTabResult` object-graph validation
- internal immutable `GuitarConfiguration 1.0.0`
- internal `Integration Contract v1` metadata and explicit integration non-authorities
- internal immutable `OptimizerObservation 1.0.0` foundation and deterministic optimizer/candidate identities
- OptimizerObservation Step 1 hostile-data hardening and Step 2.1–2.4 cost-shape, selected-playability, aggregate-consistency, and negative-regression closure
- S1 reusable `validateOptimizerObservation()` boundary validating supported optimizer/candidate/configuration metadata, canonical tuning semantics/order, dense decisions, unique event identity, candidate index/position/ID consistency, selected-position membership, selected-cost shape/playability, and aggregate total consistency
- `createOptimizerObservation()` validates the completed observation through the shared S1 validator before freezing it
- internal deterministic `PedagogicalFeatureVector 1.0.0` foundation
- internal immutable `TeacherFeedback 1.0.0` foundation
- TeacherFeedback hardening requiring a bounded opaque `observationId`, validation through the shared full `OptimizerObservation` validator, exact optimizer-selection binding, complete canonical candidate identity validation, exact same-event candidate membership for overrides, and fail-closed rejection of unsupported consent/personal-metadata fields

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
- public `GuitarConfiguration` constructor/version export
- public `Integration Contract v1` metadata export or transport protocol
- package-root observation, feature-vector, or teacher-feedback APIs
- observation/feature/feedback integration into normal conversion
- cryptographic observation provenance or a content-digest binding between observations and feedback
- TeacherFeedback persistence or a repository-wide/global observation-ID uniqueness registry
- benchmark/dataset admission infrastructure for teacher feedback
- a separately versioned consent/privacy or lawful-use record for research/training admission
- a feedback-backed research dataset pipeline
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
14. A teacher decision is not consent for research, training, or reuse of the optional free-text reason; those require a separate approved privacy/consent or lawful-use boundary.

## Foundation readiness limits

The merged internal foundations must not be described as a complete benchmark/research system:

- `OptimizerObservation 1.0.0` is not wired into conversion. Its Step 1 hostile-data protections and Step 2.1–2.4 selected-cost integrity/regression hardening are merged. S1 adds one reusable internal full-observation validator shared by observation production and TeacherFeedback admission. It validates supported observation/optimizer/candidate/configuration versions, canonical six-string tuning semantics and order, dense decision/candidate structure, unique event IDs, array-index identity, canonical candidate IDs and positions, selected candidate membership, required playable cost shape, and aggregate selected cost. It still does not provide cryptographic provenance or prove that a valid-looking observation originated from a particular historical run.
- `TeacherFeedback 1.0.0` is not wired into conversion. It requires a supported observation for runtime validation, stores a bounded opaque `observationId`, runs the supplied observation through the shared full validator, binds the optimizer candidate to the exact observed selection, validates complete canonical candidate identities and guitar bounds, and requires overrides to be members of the exact same-event observed candidate layer. The module does not provide cryptographic observation provenance, persistence, a global identity registry, benchmark/dataset admission, or consent/lawful-use records.
- `PedagogicalFeatureVector 1.0.0` is deterministic and immutable, but remains descriptive foundation data rather than pedagogical truth or an optimizer input.
- Optional teacher reasons are bounded free text. Callers must not place personal data in them, and the record must not be treated as research/training consent.

## Approved controlled roadmap

G0.1 administrator-bypass hardening remains an open parallel governance task.

The authoritative status set is converged through the verified runtime commit above. The OptimizerObservation and TeacherFeedback versioned contracts document their currently merged validation boundaries.

The three historical OptimizerObservation P2 review threads on PR #42 and the two historical TeacherFeedback P2 review threads on PR #44 are resolved using merged runtime/regression evidence. Thread resolution was repository bookkeeping only and did not change runtime behavior.

The next safe security/product sequence is:

1. separately approve S2 observation content-digest/provenance binding so feedback and later benchmark records can bind to exact observation content without granting new optimizer authority,
2. create the deterministic teacher-verified fingering benchmark v1 under separately approved provenance/data-admission constraints,
3. implement the benchmark evaluation harness,
4. evaluate learned candidate ranking v1 in shadow mode only,
5. build a separately versioned teacher-feedback-to-research-dataset pipeline with explicit persistence/admission and consent/privacy or lawful-use records,
6. require a learned-ranking evaluation gate against the deterministic baseline,
7. allow controlled learned ranking only after separate evidence and approval.

`Integration Contract v1` is already merged as an internal boundary contract. It does not introduce HTTP, UI, OMR, SesliTab, transport, persistence, or application logic into the core.

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

Workflow files use immutable action SHAs and `contents: read`. The latest recorded settings inspection left administrator-bypass hardening open. This documentation convergence does not modify or reconfigure repository governance.

## Documentation maintenance

Update these files together when material status changes:

- `AI_CONTEXT.md`
- `docs/current-status.md`
- `docs/package-status.md`
- `README.md`

Update the applicable versioned contract document when a merged hardening step changes the documented validation boundary or its review/bookkeeping status.

Only merged behavior may be described as current capability.
