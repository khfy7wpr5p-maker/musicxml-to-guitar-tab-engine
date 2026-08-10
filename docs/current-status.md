# Current Implementation Status

This document records the verified implementation state of the authoritative `main` branch and the separately planned PA-0 polyphonic-arrangement direction.

## Snapshot

- Status date: 2026-08-10
- Authoritative `main` head reviewed for PA-0: `3044fc960461334047ae03da4d8bc472479d01e9`
- Latest merged feature: PR #66 — LR-S0 Shadow Ranking Foundation v1
- Exact PR #66 head: `7355004692b14994e69c13ceae75262ceadc6090`
- Exact-head verification: Tests #421 PASS; MusicXML Compatibility #260 PASS; Node.js 22 385/385 tests; npm audit 0 vulnerabilities
- Package version: `0.1.0`
- Canonical result: `CanonicalTabResult 1.0.0`
- Internal error contract: `EngineError 1.0.0`
- Milestone 3 public writer API: `MERGED`
- PEB-1 public error detection boundary: `MERGED`
- `GuitarConfiguration 1.0.0`: `MERGED`
- `Integration Contract v1`: `MERGED`
- S1/S2/S3/S3.1 observation/admission foundations: `MERGED_INTERNAL`
- B1 `TeacherFingeringBenchmark 1.0.0`: `MERGED_INTERNAL`
- B2 `TeacherFingeringBenchmarkEvaluation 1.0.0`: `MERGED_INTERNAL`
- LR-S0 `ShadowRankingReport 1.0.0` / `ShadowRankingModel 1.0.0`: `MERGED_INTERNAL_SHADOW_ONLY`
- PA-0 Polyphonic MusicXML → Guitar Arrangement architecture: `DOCUMENTATION_ONLY`
- Polyphonic runtime implementation: `NOT_STARTED`
- G0.1 administrator enforcement: `GOVERNANCE_OPEN`

No separate post-merge `main` workflow run for `3044fc...` is claimed here; LR-S0 verification evidence is bound to the exact PR head above.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented and present on `main` |
| `MERGED_INTERNAL` | Implemented on `main` but intentionally not package-root public API |
| `MERGED_INTERNAL_SHADOW_ONLY` | Implemented internally but has no production selection authority |
| `FOUNDATION` | Internal versioned foundation exists but is not normal-conversion authority |
| `DOCUMENTATION_ONLY` | Architecture/contract planning only; no runtime capability |
| `NOT_STARTED` | No approved merged runtime implementation exists |
| `BLOCKED` | Work must not begin until prerequisites/evidence are complete |
| `GOVERNANCE_OPEN` | Repository/process issue remains unresolved |

## Completed security and architecture milestones

| Milestone | Status | Result |
|---|---|---|
| 2A–2B | `MERGED` | Immutable parsed MusicXML and shared public semantic parse |
| 2C series | `MERGED` | Central processing budgets, XML/measure/event limits, deadlines/cancellation/checkpoints, hostile-input regression |
| SEC-CI-1 | `MERGED` | Third-party GitHub Actions pinned to immutable SHAs |
| 2D series | `MERGED` | Common internal EngineError and domain convergence |
| Milestone 3 | `MERGED` | Public deterministic JSON, ASCII TAB, TAB MusicXML writers |
| PEB-1 | `MERGED` | Public error detection boundary |
| Canonical TAB graph hardening | `MERGED` | Bounded iterative hostile graph rejection |
| GuitarConfiguration 1.0 | `MERGED` | Immutable six-string physical configuration contract |
| Integration Contract v1 | `MERGED` | Explicit external non-authority boundary |
| OptimizerObservation Step 1 + 2.1–2.4 | `MERGED` | Hostile-data, cost, playability, aggregate consistency hardening |
| S1 | `MERGED_INTERNAL` | Full OptimizerObservation validation |
| S2 | `MERGED_INTERNAL` | Domain-separated SHA-256 observation content digest |
| S3 | `MERGED_INTERNAL` | Admission identity/version/replay/collision foundation |
| S3.1 | `MERGED_INTERNAL` | Authoritative snapshot + revision-token compare-and-commit boundary |
| B1 | `MERGED_INTERNAL` | 8 fixed teacher-approved cases / 32 events |
| B2 | `MERGED_INTERNAL` | Deterministic evaluation baseline |
| LR-S0 | `MERGED_INTERNAL_SHADOW_ONLY` | Deterministic shadow ranking over validated candidate sets; synthetic model; no production authority |

## Current merged runtime capabilities

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | Encoding/null/entity/DOCTYPE policy plus resource ceilings |
| `ParsedMusicXmlDocument 1.0.0` | `MERGED` | Immutable bounded XML representation |
| MusicXML public parser | `MERGED` | Single-part/single-staff/single-voice monophonic scope |
| Processing limits | `MERGED` | Byte/XML/measure/event/deadline/cancellation checkpoints |
| Preflight | `MERGED` | Frozen PASS/WARNING/BLOCKED reports |
| Canonical music | `MERGED` | Immutable `CanonicalMusicDocument` |
| Guitar configuration | `MERGED` | Immutable internal six-string configuration |
| Physical candidates | `MERGED` | All physically valid string/fret positions |
| Cost model | `MERGED` | Explainable deterministic costs |
| Optimizer | `MERGED` | Deterministic DP and stable tie-breaking |
| Canonical TAB result | `MERGED` | Immutable `CanonicalTabResult 1.0.0` |
| Writers | `MERGED` | Public deterministic JSON / ASCII TAB / TAB MusicXML |
| Observation/feedback integrity | `MERGED_INTERNAL` | S1/S2 plus TeacherFeedback binding foundations |
| Admission coordination | `MERGED_INTERNAL` | S3/S3.1 foundations |
| B1/B2 benchmark/evaluation | `MERGED_INTERNAL` | Fixed independent evaluation evidence |
| LR-S0 shadow ranking | `MERGED_INTERNAL_SHADOW_ONLY` | `mode: shadow`, `authority: none`; synthetic reference model; no normal-conversion influence |

## Current public musical scope

The current public conversion path remains intentionally narrow:

- `score-partwise`,
- exactly one score part / part,
- one staff,
- one voice,
- monophonic notes/rests,
- documented supported rhythms/ties/beams/pickup behavior.

Current fail-closed behavior remains authoritative:

- chord events → unsupported polyphony,
- multiple voices → unsupported polyphony,
- multiple staves → unsupported multistaff,
- multiple parts → unsupported multipart score.

PA work must not weaken these checks to obtain polyphonic support.

## B1/B2 evaluation boundary

B1 is fixed independent evaluation evidence, not training data. It contains 8 self-authored fixtures / 32 teacher-approved event-local labels with exact source SHA-256 binding.

B2 measures the existing deterministic conversion pipeline and currently records:

| Metric | Count |
|---|---:|
| Benchmark cases | 8 |
| Benchmark events | 32 |
| Acceptable matches | 32 |
| Preferred-eligible events | 28 |
| Preferred matches | 26 |
| Case passes | 8 |
| Candidate-coverage failures | 0 |
| Blocked conversions | 0 |

The fixed B1 set must not be used as future training data and then reused as independent evaluation evidence.

## LR-S0 boundary

LR-S0 is merged and internal. It:

- consumes validated `OptimizerObservation 1.0.0` candidate sets,
- recomputes pedagogical feature vectors internally,
- uses a hand-authored synthetic reference linear model,
- generates a deterministic shadow suggestion/report,
- requires `mode: "shadow"` and `authority: "none"`,
- never mutates optimizer decisions or `CanonicalTabResult`,
- does not change normal conversion, writers, public API, physical validation, or B1/B2 artifacts,
- does not train a model or authorize production learned selection.

Residual limitation: a divergent shadow suggestion cannot prove equivalence to unrecorded custom path-level transition limits because not every caller-supplied cost-profile setting is persisted in the observation. Production influence remains blocked until relevant path-policy provenance is explicitly bound and validated.

## Public package-root API

Current `src/index.js` exposes exactly:

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

No benchmark, evaluation, observation, feedback, admission, shadow-ranking, or polyphonic-arrangement API is public.

## PA-0 Polyphonic Guitar Arrangement planning

PA-0 formally records a future **parallel** polyphonic projection and guitar-arrangement architecture. It adds no runtime code.

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

Original MusicXML remains immutable source truth. Future arrangement transformations such as omission, octave displacement, voice redistribution, chord reduction/revoicing, or arpeggiation must be explicit and provenance-bound.

`CanonicalTabResult 1.0.0` is unchanged. A later PA-10 compatibility gate must decide whether a backward-compatible bridge is sufficient or a separately versioned chord-aware result is required.

See `docs/polyphonic-guitar-arrangement-foundation.md`.

## Approved polyphonic safe sequence

| Order | Gate | Status |
|---:|---|---|
| 1 | PA-0 Documentation + architecture planning | `DOCUMENTATION_ONLY` |
| 2 | PA-1 `PolyphonicSourceModel 1.0` contract | `NOT_STARTED` |
| 3 | PA-2 Parallel polyphonic projection | `NOT_STARTED` |
| 4 | PA-3 Simultaneous-event / chord contract | `NOT_STARTED` |
| 5 | PA-4 Arrangement-decision + provenance contract | `NOT_STARTED` |
| 6 | PA-5 Deterministic melody/bass/voice analysis | `NOT_STARTED` |
| 7 | PA-6 Deterministic reduction / octave rules | `NOT_STARTED` |
| 8 | PA-7 Guitar chord/voicing candidates | `NOT_STARTED` |
| 9 | PA-8 Left-hand shape / finger assignment / barre | `NOT_STARTED` |
| 10 | PA-9 Physical Playability Validator v2 | `NOT_STARTED` |
| 11 | PA-10 Canonical v1/v2 compatibility review | `BLOCKED` pending prior evidence |
| 12 | PA-11 Teacher-approved arrangement benchmark | `BLOCKED` pending runtime foundations |
| 13 | PA-12 Internal polyphonic E2E + monophonic compatibility | `BLOCKED` pending prior gates |
| 14 | PA-13 Public arrangement API review | `BLOCKED` pending evidence |
| 15 | PA-14 ScoreMosaic/SesliTab adapter integration | `BLOCKED` pending public/integration contract approval |

Future arrangement AI remains a later shadow-first track and requires separate training-data/provenance/lawful-use/privacy/model-lifecycle/evaluation gates.

## High-risk protection rule

The following must not be changed incidentally during early PA work: current monophonic semantic projection, `convertMusicXmlToCanonicalTab()`, `CanonicalMusicDocument`, `CanonicalTabResult 1.0.0`, deterministic monophonic optimizer, package-root API, writer authority, and physical guitar validation.

Any separately approved high-risk change requires focused tests, negative/fail-closed tests, full regression, monophonic E2E compatibility, deterministic comparison where applicable, GitHub-hosted CI, and separate merge approval.

## Repository governance status

| Item | Status |
|---|---|
| `main` protected | configured |
| Workflow supply-chain controls | configured |
| Administrator enforcement | `GOVERNANCE_OPEN` (`non_admins`) |

## Explicitly not implemented

- production learned model selection/training/model registry,
- concrete production durable/atomic admission backend,
- live TeacherFeedback research/training dataset pipeline,
- separately versioned privacy/consent/lawful-use research record,
- polyphonic projection/runtime arrangement,
- `PolyphonicSourceModel` / `GuitarArrangementPlan`,
- chord-aware canonical result,
- finger assignment / barre / partial-barre,
- public multipart/multistaff/polyphonic conversion,
- public arrangement API,
- direct HTTP/UI/PDF/OMR/Audiveris/SesliTab integration inside this repository.

## Update rule

Update this file whenever merged behavior changes feature availability, public API state, contracts, blockers, verification evidence, or the approved next safe step. Planned capability must never be described as implemented runtime behavior.
