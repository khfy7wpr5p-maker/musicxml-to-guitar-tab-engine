# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Verified snapshot

- Last verified: 2026-08-10
- Authoritative branch: `main`
- Verified runtime implementation baseline: `750f2a0923fc47df5883dc460d0769bb172c30e2`
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Public error detection boundary: `PEB-1`
- Milestone 3 public writer API: merged
- `GuitarConfiguration 1.0.0`: internal contract merged
- `Integration Contract v1`: internal metadata/non-authority boundary merged
- `OptimizerObservation 1.0.0`: internal foundation; Step 1, Step 2.1–2.4, and S1 reusable full validation merged; not pipeline-wired
- `OptimizerObservationDigest 1.0.0`: internal domain-separated SHA-256 content-integrity contract merged
- `PedagogicalFeatureVector 1.0.0`: internal foundation merged; not pipeline-wired
- `TeacherFeedback 1.1.0`: internal foundation with exact observation/candidate/digest binding; not pipeline-wired
- `ObservationAdmission 1.0.0`: internal S3 admission/provenance foundation merged in PR #60
- `ObservationAdmissionAtomicAdapter 1.0.0`: internal S3.1 authoritative-snapshot + revision-token compare-and-commit coordination boundary merged in PR #61
- `TeacherFingeringBenchmark 1.0.0`: internal fixed teacher-approved benchmark merged in PR #63
- `TeacherFingeringBenchmarkEvaluation 1.0.0`: internal deterministic evaluation harness merged in PR #64
- B1 artifact: 8 self-authored cases / 32 teacher-approved note events
- B2 deterministic baseline: 32/32 acceptable, 26/28 preferred, 8/8 case pass, 0 candidate-coverage failures, 0 blocked conversions
- Historical PR #42 OptimizerObservation P2 threads: resolved
- Historical PR #44 TeacherFeedback P2 threads: resolved
- Governance note: administrator-bypass hardening remains open; required-check enforcement is still recorded as `non_admins`.
- Verification note: merge-post GitHub-hosted Tests #406 passed on runtime baseline `750f2a0923fc47df5883dc460d0769bb172c30e2` for Node.js 18/20/22. Node 22 recorded 379/379 tests passing and npm audit 0 vulnerabilities. The exact head of PR #64 (`2a8727c17332f74f473d7769dd8e926faabfe472`) passed Tests #405 and MusicXML Compatibility #246 before merge. No post-merge `main` Compatibility run is claimed.

The runtime baseline SHA above names the implementation state containing B1+B2. A later docs-only merge may advance `main` without changing runtime behavior.

## Project purpose

This repository contains an independent deterministic engine that converts supported MusicXML `.musicxml` and `.xml` input into playable six-string guitar tablature.

The engine:

1. safely normalizes/parses MusicXML,
2. validates supported structure and monophonic semantics,
3. creates immutable canonical musical events,
4. generates every physically valid guitar string/fret candidate,
5. selects a reproducible fingering path with a deterministic optimizer,
6. creates one authoritative `CanonicalTabResult`, and
7. derives output formats from that result without recalculating fingering.

Educational output requires teacher review.

## Source-of-truth order

When sources disagree, use this order:

1. merged source code, tests, package metadata, schemas, and workflows on `main`
2. `schemas/canonical-tab-result.v1.schema.json`
3. runtime contract modules under `src/`
4. applicable versioned contract documents under `docs/`
5. `docs/current-status.md`
6. `docs/package-status.md`
7. `README.md`
8. older architecture/MVP documents

Open pull requests, feature branches, issue descriptions, and planned docs are not implemented capabilities until merged into `main`.

## Current merged scope

The current runtime baseline includes:

- secure MusicXML text/buffer input,
- immutable `ParsedMusicXmlDocument 1.0.0`,
- single shared semantic parse across public preflight/conversion,
- centralized `ProcessingBudget 1.0.0`,
- XML byte/depth/element/attribute/text/measure/event limits,
- deadline, monotonic-clock validation, `AbortSignal`, and optimizer-loop checkpoints,
- hostile-input regression coverage,
- immutable `CanonicalMusicDocument`,
- physically valid six-string candidate generation,
- deterministic explainable cost model and dynamic-programming optimizer,
- immutable `CanonicalTabResult 1.0.0`,
- canonical JSON Schema and runtime validator,
- public deterministic JSON, ASCII TAB, and TAB MusicXML serializers,
- internal `EngineError 1.0.0`,
- public `ENGINE_ERROR_CONTRACT_VERSION`, `isEngineError(value)`, and backward-compatible `FretboardError`,
- SHA-pinned third-party GitHub Actions,
- bounded iterative hostile graph validation,
- internal `GuitarConfiguration 1.0.0`,
- internal `Integration Contract v1`,
- S1 full `OptimizerObservation` validation,
- S2 observation content-digest binding,
- `PedagogicalFeatureVector 1.0.0`,
- `TeacherFeedback 1.1.0`,
- S3 `ObservationAdmission 1.0.0`,
- S3.1 `ObservationAdmissionAtomicAdapter 1.0.0`,
- B1 `TeacherFingeringBenchmark 1.0.0`,
- B2 `TeacherFingeringBenchmarkEvaluation 1.0.0`.

### B1 fixed benchmark boundary

B1 is a fixed evaluation artifact, not a live dataset:

- 8 self-authored monophonic MusicXML fixtures,
- 32 teacher-approved event labels,
- exact source SHA-256 binding,
- event-local `acceptedPositions[]`,
- optional event-local `preferredPosition`,
- teacher approval bound to the exact reviewed artifact/version,
- no personal data, live TeacherFeedback, network source, private lesson material, or mutable external URL.

B1 labels do not imply path-level teacher approval. A separate versioned contract is required for teacher-approved transitions or complete fingering paths.

### B2 evaluation boundary

B2 is an internal deterministic measurement harness. It:

- requires a teacher-approved B1 benchmark,
- verifies exact source ordering and SHA-256 content,
- runs the existing public deterministic conversion pipeline with the benchmark guitar configuration,
- compares selected positions with event-local accepted/preferred labels,
- reports immutable integer counts,
- keeps blocked cases in denominators,
- performs no filesystem/network loading itself,
- accepts no caller loader/callback authority,
- does not mutate optimizer, cost model, candidates, canonical results, writers, or package-root API.

Current B2 baseline:

- benchmark cases: 8
- benchmark events: 32
- acceptable matches: 32
- preferred-eligible events: 28
- preferred matches: 26
- case passes: 8
- candidate-coverage failures: 0
- blocked conversions: 0

The fixed B1 benchmark is evaluation evidence and must not be used as training data and then reused as independent evaluation evidence.

## Public package-root API

`src/index.js` exposes exactly:

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

Observation/digest/feature/feedback/admission/benchmark/evaluation APIs remain internal.

## Not implemented

Do not claim that the following exist:

- package-root `EngineError` class or writer/domain error-class exports,
- public GuitarConfiguration/Integration/observation/feedback/admission/benchmark/evaluation APIs,
- observation/feature/feedback/admission integration into normal conversion,
- cryptographic producer authenticity/signing/attestation,
- concrete production durable/atomic admission storage,
- proof by the JavaScript core that an external store is complete/fresh/durable/atomic,
- repository-wide/global TeacherFeedback or observation-ID persistence,
- separately versioned privacy/consent or lawful-use research admission,
- live feedback-backed research/training dataset pipeline,
- learned candidate ranking, training, model registry, or production model selection,
- learned-ranking shadow implementation,
- learned-ranking opt-in authority,
- HTTP/UI/PWA/mobile/PDF/OMR/Audiveris/SesliTab integration,
- chord/polyphonic conversion, left-hand finger assignment, barre representation,
- multipart/multistaff selection, grace notes, tuplets, compressed `.mxl`.

## Non-negotiable architecture rules

1. `CanonicalTabResult` is the authoritative downstream TAB source.
2. Writers use approved `selectedPosition` values and never rerun optimization.
3. The parser does not choose guitar strings/frets.
4. Structural validation and musical semantic projection remain separate.
5. Physical validity is enforced before any learned component.
6. The deterministic optimizer remains reproducible and is the mandatory fallback.
7. Unsupported structures fail explicitly or generate explicit warnings.
8. Teacher review remains required for educational use.
9. Operational observations/feedback stay outside canonical musical results unless a new approved contract says otherwise.
10. Learned components may score only deterministic physically valid candidates.
11. Learned components may not create/alter notes, pitch, timing, strings, frets, physical rules, validators, or canonical objects.
12. A teacher decision is not research/training consent.
13. Observation digests prove content correspondence, not producer identity.
14. S3 producer/revision/run values are bounded assertions, not authenticated identities.
15. S3/S3.1 admission success is not research/training authorization.
16. S3.1 defines store orchestration but does not prove a provider is actually durable/atomic.
17. Ambiguous post-commit outcomes must not be blindly retried.
18. B1 teacher approval applies to one exact benchmark artifact/version; any material fixture/label/config change reopens review.
19. B1 accepted/preferred labels are event-local, not path-level pedagogical truth.
20. B2 is measurement-only and must not feed decisions back into deterministic conversion.
21. Benchmark failures/blocked cases may not be silently skipped to improve metrics.
22. The fixed B1 evaluation set is not training data.
23. Learned ranking begins shadow-only and cannot change production selection until a separate evidence/opt-in gate is approved.

## Research/learning readiness limits

- `OptimizerObservation 1.0.0` and `TeacherFeedback 1.1.0` remain internal and not normal-pipeline authorities.
- `OptimizerObservationDigest 1.0.0` provides content-integrity binding, not a signature.
- `ObservationAdmission 1.0.0` validates bounded admission history but cannot prove supplied history is authoritative/durable.
- `ObservationAdmissionAtomicAdapter 1.0.0` requires authoritative snapshot + CAS semantics, but no concrete production provider exists.
- `TeacherFingeringBenchmark 1.0.0` supplies fixed reviewed evaluation truth for the supported B1 scope only.
- `TeacherFingeringBenchmarkEvaluation 1.0.0` supplies deterministic baseline measurement only.
- No live/mutable training dataset is authorized.
- Any such dataset still requires a separately reviewed concrete durable/atomic provider plus separately versioned privacy/consent or lawful-use controls.

## Approved controlled roadmap

G0.1 administrator-bypass hardening remains an open parallel governance task.

Completed research/evaluation foundations:

- S1 full observation validation — PR #56
- S2 observation content-digest binding — PR #58
- S3 observation admission/provenance — PR #60
- S3.1 atomic admission adapter contract — PR #61
- B1 TeacherFingeringBenchmark v1 — PR #63
- B2 Evaluation Harness v1 — PR #64

Next safe sequence:

1. **read-only threat-model/scope review for Learned Ranking v1 — shadow mode**;
2. if separately approved, define a minimal internal shadow-ranking contract that scores only existing physically valid candidates and cannot change deterministic selection;
3. compare shadow output against the fixed B1/B2 deterministic baseline without activating it;
4. independently review any learned-ranking evaluation evidence before considering an opt-in path;
5. before any live/mutable TeacherFeedback research dataset, implement/review a concrete durable/atomic admission provider plus separately versioned privacy/consent or lawful-use controls;
6. keep controlled production learned-ranking opt-in blocked until separate evidence and approval.

Long-term chord work still begins with simultaneous-event and left-hand-shape contracts before finger/barre representation, chord candidates, physical validator v2, deterministic left-hand optimization, pedagogical features v2, benchmark v2, and learned pedagogical ranking v2.

## Safe working protocol

1. Verify current `main` before work.
2. Read `docs/current-status.md` and `docs/package-status.md`.
3. Inspect overlapping open PRs.
4. Use one small independently testable feature per branch/PR.
5. Branch from current `main` unless explicitly approved otherwise.
6. Preserve public APIs, canonical contracts, deterministic output, and error behavior unless an approved migration says otherwise.
7. Run focused/full tests when runtime/package entry points change.
8. Record unavailable verification honestly.
9. Open changes as Draft PRs and do not mark Ready or merge without explicit approval.
10. Do not infer that benchmark/evaluation completion authorizes learned ranking, training, live data collection, or dataset persistence.
11. Do not infer that shadow-ranking approval authorizes production selection changes.

## Repository governance note

Workflow files use immutable action SHAs and `contents: read`. `main` remains protected. Required-check enforcement is still recorded as `non_admins`, so administrator-bypass hardening remains open. Documentation convergence does not modify repository governance.

## Documentation maintenance

Update these files together when material status changes:

- `AI_CONTEXT.md`
- `docs/current-status.md`
- `docs/package-status.md`
- `README.md`

Update an applicable versioned contract document when merged behavior or reviewed contract status changes materially.

Only merged behavior may be described as current capability.
