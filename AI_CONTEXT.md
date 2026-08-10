# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers, and automated tools working with this repository.

## Verified snapshot

- Last verified: 2026-08-10
- Authoritative branch: `main`
- Authoritative `main` head reviewed for PA-0: `3044fc960461334047ae03da4d8bc472479d01e9`
- Latest merged feature: PR #66, LR-S0 Shadow Ranking Foundation v1
- Exact PR #66 head: `7355004692b14994e69c13ceae75262ceadc6090`
- Exact-head verification: Tests #421 PASS; MusicXML Compatibility #260 PASS; Node.js 22 recorded 385/385 tests; npm audit 0 vulnerabilities
- Package version: `0.1.0`
- Canonical result contract: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Public error detection boundary: `PEB-1`
- `GuitarConfiguration 1.0.0`: merged internal contract
- `Integration Contract v1`: merged internal non-authority boundary
- S1/S2/S3/S3.1 observation/admission foundations: merged internal
- B1 `TeacherFingeringBenchmark 1.0.0`: merged internal, 8 self-authored cases / 32 teacher-approved note events
- B2 `TeacherFingeringBenchmarkEvaluation 1.0.0`: merged internal; baseline 32/32 acceptable, 26/28 preferred, 8/8 case pass, 0 candidate-coverage failures, 0 blocked conversions
- LR-S0 `ShadowRankingReport 1.0.0` / `ShadowRankingModel 1.0.0`: merged internal; mandatory `mode: "shadow"`, `authority: "none"`
- LR-S0 reference model is synthetic/hand-authored, not trained and not B1-derived
- G0.1 administrator-bypass hardening remains open; required-check enforcement is recorded as `non_admins`

Do not claim a separate post-merge `main` workflow run for `3044fc...`; the strongest recorded LR-S0 CI evidence is the exact PR head above.

## Project purpose

This repository contains an independent deterministic engine that converts the currently supported monophonic MusicXML scope into playable six-string guitar tablature.

The current public engine:

1. safely normalizes/parses MusicXML,
2. validates supported structure and monophonic semantics,
3. creates immutable canonical musical events,
4. generates every physically valid guitar string/fret candidate,
5. selects a reproducible fingering path with a deterministic optimizer,
6. creates one authoritative `CanonicalTabResult 1.0.0`, and
7. derives JSON, ASCII TAB, and TAB MusicXML without recalculating fingering.

Educational output requires teacher review.

## Source-of-truth order

When sources disagree, use this order:

1. merged source code, tests, package metadata, schemas, and workflows on `main`,
2. runtime contract modules under `src/`,
3. applicable versioned contract documents under `docs/`,
4. `docs/current-status.md`,
5. `docs/package-status.md`,
6. `README.md`,
7. older architecture/MVP documents.

Open PRs, feature branches, and planned docs are not runtime capability until merged.

## Current merged public conversion scope

Current runtime capabilities include secure MusicXML text/buffer input, immutable `ParsedMusicXmlDocument 1.0.0`, shared semantic parse, `ProcessingBudget 1.0.0`, hostile-input/resource/deadline/cancellation controls, immutable `CanonicalMusicDocument`, physically valid six-string candidates, deterministic cost/DP optimization, immutable `CanonicalTabResult 1.0.0`, canonical validation, and deterministic JSON/ASCII TAB/TAB MusicXML writers.

The current public musical scope remains:

- `score-partwise`,
- one part,
- one staff,
- one voice,
- monophonic notes/rests,
- documented supported rhythms/ties/beams/pickup behavior.

Current public conversion must continue to fail closed for chords, multiple voices, multiple staves, and multipart scores.

## Current package-root API

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

Observation, digest, feature, feedback, admission, benchmark, evaluation, shadow-ranking, and future arrangement APIs remain internal.

## LR-S0 authority boundary

LR-S0 is implemented and merged, but it is not a learned production selector.

It:

- consumes validated `OptimizerObservation 1.0.0` candidate sets,
- recomputes current pedagogical features internally,
- produces deterministic shadow suggestions,
- uses a synthetic reference linear model,
- records `mode: "shadow"` and `authority: "none"`,
- cannot mutate optimizer decisions or `CanonicalTabResult`,
- cannot change normal conversion, writers, package exports, physical validation, or candidate membership,
- does not train a model,
- does not use B1 as training data,
- does not authorize live TeacherFeedback datasets or production learned selection.

Its documented residual limitation remains: the observation does not persist every caller-supplied path-level cost-profile setting, so a divergent shadow path proves candidate membership/physical-position validity, not equivalence to unrecorded custom transition caps. Production influence remains blocked until relevant path policy/provenance is explicitly bound and validated.

## PA-0 — Polyphonic MusicXML → Guitar Arrangement planning

PA-0 is documentation/architecture planning only. It does not add runtime capability.

The approved architectural direction is a **parallel, separately versioned polyphonic projection and arrangement path** branching after the existing safe immutable `ParsedMusicXmlDocument 1.0.0` boundary.

Target concept:

```text
MusicXML
  ↓
XML Safety + ProcessingBudget
  ↓
ParsedMusicXmlDocument 1.0.0
  ├─ existing monophonic projection → existing deterministic TAB core
  └─ future polyphonic projection → PolyphonicSourceModel
                                    ↓
                              GuitarArrangementPlan
                                    ↓
                              guitar-compatible score
                                    ↓
                              chord/left-hand model
                                    ↓
                              Playability Validator v2
                                    ↓
                              deterministic arrangement optimizer
```

### Non-negotiable PA rule

**Do not expand current polyphonic support by weakening/removing the existing monophonic rejection checks.**

Do not make the current public monophonic adapter accept chord, multi-voice, multi-staff, or multipart input merely by deleting `UNSUPPORTED_*` checks.

A future polyphonic path must use a separate projection/contract with its own tests and authority boundary.

### Source truth versus arrangement truth

Original MusicXML remains immutable source truth.

Future arrangement decisions such as note omission, octave displacement, voice redistribution, chord reduction/revoicing, or arpeggiation must be explicit and provenance-bound in a future arrangement contract. Such decisions must not be hidden in parser or fingering code.

### Canonical result rule

`CanonicalTabResult 1.0.0` remains unchanged during early PA gates. Do not add chord/polyphonic fields to v1 without a separately approved compatibility review. A later gate must decide whether an adapter/backward-compatible extension is sufficient or a new chord-aware result version is required.

## Non-negotiable architecture rules

1. `CanonicalTabResult 1.0.0` remains authoritative for the current public monophonic TAB path.
2. Writers use approved selected positions and never rerun optimization or arrangement.
3. Parsing does not choose guitar strings/frets.
4. Structural validation and musical semantic projection remain separate.
5. Physical validity is enforced before any learned fingering component.
6. The deterministic optimizer remains reproducible and is the mandatory fallback.
7. Unsupported structures fail explicitly or produce documented warnings.
8. Teacher review remains required for educational use.
9. Operational observations/feedback stay outside canonical musical results unless a new approved contract says otherwise.
10. LR-S0 and future learned fingering components may score only already-generated physically valid candidates.
11. LR-S0 cannot create/alter source notes, pitch, timing, strings, frets, physical rules, validators, or canonical objects.
12. A teacher decision is not research/training consent.
13. Observation digests prove content correspondence, not producer identity.
14. S3/S3.1 admission success is not research/training authorization.
15. B1 is independent fixed evaluation evidence, not training data.
16. Polyphonic support must enter through a parallel versioned projection, not relaxed monophonic validation.
17. Original MusicXML is immutable source truth; arrangement changes require explicit provenance.
18. High-risk changes to current conversion, canonical contracts, public API, optimizer authority, or physical rules require separate review, regression/E2E evidence, GitHub CI, and explicit approval.

## Not implemented / not authorized

Do not claim that the following currently exist:

- production learned model selection,
- model training or model registry,
- live feedback-backed research/training dataset pipeline,
- concrete production durable/atomic admission store,
- separately versioned privacy/consent or lawful-use research admission,
- cryptographic trusted-producer authenticity,
- public shadow-ranking API,
- HTTP/UI/PWA/mobile/PDF/OMR/Audiveris/SesliTab implementation inside this repository,
- polyphonic guitar arrangement runtime,
- `PolyphonicSourceModel`, `GuitarArrangementPlan`, chord-aware canonical output,
- left-hand finger assignment, barre/partial-barre,
- multipart/multistaff public conversion,
- grace notes/tuplets/`.mxl` support.

## Controlled roadmap

### Learning track

- S1/S2/S3/S3.1 — merged
- B1/B2 — merged
- LR-S0 shadow foundation — merged, `authority: none`
- shadow evaluation / path-policy provenance binding — pending separate gates
- durable admission + lawful-use/privacy — required before live training data
- real learned training — not started
- independent learned evaluation — not started
- controlled production opt-in — blocked pending evidence/approval

### Polyphonic arrangement track

1. `PA-0` documentation + architecture planning
2. `PA-1` `PolyphonicSourceModel 1.0` contract
3. `PA-2` parallel polyphonic projection
4. `PA-3` simultaneous-event / chord contract
5. `PA-4` arrangement-decision + provenance contract
6. `PA-5` deterministic melody/bass/voice analysis
7. `PA-6` deterministic reduction / octave rules
8. `PA-7` guitar chord/voicing candidate generation
9. `PA-8` left-hand shape + finger assignment + barre/partial-barre
10. `PA-9` Physical Playability Validator v2
11. `PA-10` canonical v1/v2 compatibility review
12. `PA-11` teacher-approved arrangement benchmark
13. `PA-12` internal polyphonic E2E plus monophonic compatibility
14. `PA-13` separately approved public arrangement API
15. `PA-14` ScoreMosaic/SesliTab adapter integration
16. future arrangement AI only after separate training/evaluation gates

See `docs/polyphonic-guitar-arrangement-foundation.md`.

## Safe working protocol

1. Verify current `main` before work.
2. Read current status/package status and applicable contracts.
3. Inspect overlapping open PRs.
4. Use one small independently testable feature per branch/PR.
5. Branch from current `main` unless explicitly approved otherwise.
6. Preserve current public APIs, canonical contracts, deterministic output, and error behavior unless an approved migration explicitly changes them.
7. Run focused/full tests when runtime/package entry points change.
8. For high-risk changes, add negative tests and monophonic E2E compatibility evidence before merge consideration.
9. Record unavailable verification honestly.
10. Do not mark Ready or merge without separate approval.
11. Do not infer that LR-S0 authorizes production selection, training, live data collection, or dataset persistence.
12. Do not infer that PA-0 authorizes any runtime polyphonic implementation.

## Repository governance note

Workflow actions are SHA-pinned and `main` remains protected. Required-check enforcement is still recorded as `non_admins`; administrator-bypass hardening remains open.

## Documentation maintenance

Update these together when material status changes:

- `AI_CONTEXT.md`
- `docs/current-status.md`
- `docs/package-status.md`
- `README.md`

Update applicable versioned contract documents when reviewed contract status changes materially. Only merged behavior may be described as current capability.
