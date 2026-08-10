# Current Implementation Status

This document records the verified implementation state of the authoritative runtime line and the separately planned application, notation, polyphonic-arrangement and learning directions.

## Snapshot — 2026-08-10

- runtime baseline reviewed before this docs-only convergence: `05c3a59e1f615417d637a6ae71e3e42d552ffca5`
- latest merged runtime feature: PR #71 — LR-S1B.2b Optimizer Path-Policy Binding + Binding Digest
- PR #71 merge commit: `05c3a59e1f615417d637a6ae71e3e42d552ffca5`
- post-merge Tests #464: PASS on Node.js 18 / 20 / 22
- current package version: `0.1.0`
- current canonical result: `CanonicalTabResult 1.0.0`
- current internal error contract: `EngineError 1.0.0`
- package-root public writer API: merged
- `GuitarConfiguration 1.0.0`: merged internal
- `Integration Contract v1`: merged internal
- S1/S2/S3/S3.1 observation/admission foundations: merged internal
- B1/B2 benchmark/evaluation: merged internal
- LR-S0 / LR-S1A / LR-S1B.1 / LR-S1B.2a / LR-S1B.2b: merged internal, non-authoritative learning path
- PA-0 Polyphonic MusicXML → Guitar Arrangement architecture: merged documentation
- PA-1 `PolyphonicSourceModel 1.0`: real unmerged branch work exists; recovery/review required
- production application UI: not implemented
- MuseScore semantic round-trip: not executed
- production PDF renderer: not implemented
- G0.1 administrator enforcement: governance open

A later docs-only merge may advance `main` without changing runtime behavior; use the runtime baseline above when interpreting this snapshot.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented and present on the authoritative runtime line |
| `MERGED_INTERNAL` | Implemented on `main` but intentionally not package-root public API |
| `MERGED_INTERNAL_SHADOW_ONLY` | Internal learning/shadow capability with no production selection authority |
| `COMPATIBILITY_VERIFIED` | Verified in isolated compatibility tests, not necessarily production app capability |
| `UNMERGED_WORK_EXISTS` | Real branch work exists but is not current `main` runtime capability |
| `DOCUMENTATION_ONLY` | Architecture/contract planning only; no runtime capability |
| `NOT_IMPLEMENTED` | No merged implementation exists |
| `BLOCKED` | Work must not begin until prerequisites/evidence are complete |
| `GOVERNANCE_OPEN` | Repository/process hardening issue remains unresolved |

## Completed security and deterministic-core milestones

| Milestone | Status | Result |
|---|---|---|
| 2A–2B | `MERGED` | Immutable parsed MusicXML and shared supported semantic parse |
| 2C series | `MERGED` | Processing budgets, XML/measure/event limits, deadlines/cancellation/checkpoints, hostile-input regression |
| SEC-CI-1 | `MERGED` | Third-party GitHub Actions pinned to immutable SHAs |
| 2D series | `MERGED` | Common internal `EngineError` and domain convergence |
| Milestone 3 | `MERGED` | Public deterministic JSON, ASCII TAB and TAB MusicXML writers |
| PEB-1 | `MERGED` | Public error detection boundary |
| Canonical TAB graph hardening | `MERGED` | Bounded iterative hostile graph rejection |
| GuitarConfiguration 1.0 | `MERGED_INTERNAL` | Immutable six-string physical configuration contract |
| Integration Contract v1 | `MERGED_INTERNAL` | Explicit external non-authority boundary |
| OptimizerObservation Step 1 + 2.1–2.4 | `MERGED_INTERNAL` | Hostile-data, cost, playability and aggregate consistency hardening |
| S1 | `MERGED_INTERNAL` | Full reusable OptimizerObservation validation |
| S2 | `MERGED_INTERNAL` | Domain-separated SHA-256 observation content digest |
| S3 | `MERGED_INTERNAL` | Admission identity/version/replay/collision foundation |
| S3.1 | `MERGED_INTERNAL` | Authoritative snapshot + revision-token compare-and-commit boundary |
| B1 | `MERGED_INTERNAL` | 8 fixed teacher-approved cases / 32 events |
| B2 | `MERGED_INTERNAL` | Deterministic evaluation baseline |
| LR-S0 | `MERGED_INTERNAL_SHADOW_ONLY` | Deterministic shadow ranking; synthetic model; `authority: none` |
| LR-S1A | `MERGED_INTERNAL_SHADOW_ONLY` | Shadow ranking benchmark evaluation against fixed B1 |
| LR-S1B.1 | `MERGED_INTERNAL` | Strict fingering path-policy snapshot + digest |
| LR-S1B.2a | `MERGED_INTERNAL` | Semantic replay verifier for observation + policy compatibility |
| LR-S1B.2b | `MERGED_INTERNAL` | Immutable path-policy binding record + binding digest |

## Current merged public runtime capabilities

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | Encoding/null/entity/DOCTYPE policy plus resource ceilings |
| `ProcessingBudget 1.0.0` | `MERGED` | Bounded processing policy |
| `ParsedMusicXmlDocument 1.0.0` | `MERGED` | Immutable bounded XML representation |
| MusicXML public semantic parse | `MERGED` | Current supported single-part/single-staff/single-voice monophonic scope |
| Processing limits | `MERGED` | Byte/XML/measure/event/deadline/cancellation checkpoints |
| Preflight | `MERGED` | Frozen PASS/WARNING/BLOCKED reports |
| Canonical music | `MERGED` | Immutable `CanonicalMusicDocument` |
| Guitar configuration | `MERGED_INTERNAL` | Immutable six-string configuration |
| Physical candidates | `MERGED` | All physically valid string/fret positions |
| Cost model | `MERGED` | Explainable deterministic costs |
| Optimizer | `MERGED` | Deterministic dynamic programming + stable tie-breaking |
| Canonical TAB result | `MERGED` | Immutable `CanonicalTabResult 1.0.0` |
| Writers | `MERGED` | Public deterministic JSON / ASCII TAB / TAB MusicXML |
| Observation/feedback integrity | `MERGED_INTERNAL` | S1/S2 + TeacherFeedback binding foundations |
| Admission coordination | `MERGED_INTERNAL` | S3/S3.1 foundations |
| Benchmark/evaluation | `MERGED_INTERNAL` | B1/B2 fixed independent evidence |
| Shadow learning evaluation | `MERGED_INTERNAL_SHADOW_ONLY` | LR-S0/LR-S1A, no normal-conversion authority |
| Path-policy provenance integrity | `MERGED_INTERNAL` | LR-S1B.1 / 2a / 2b content/semantic binding foundations |

## Current public musical scope

The public conversion path remains intentionally narrow and protected.

Supported now:

- MusicXML `score-partwise`
- exactly one score part / one part
- one staff
- one voice
- monophonic notes/rests
- pitch `step` / `alter` / `octave`
- whole, half, quarter, eighth and 16th note values
- dotted values
- rests
- inherited `divisions`
- time signatures
- pickup/implicit measures
- ties
- beams, including normalized hook metadata

Current fail-closed behavior remains authoritative:

- chord events → unsupported polyphony
- `backup` / `forward` polyphonic timing → unsupported polyphony
- multiple voices → unsupported polyphony
- multiple staves → unsupported multistaff
- multiple parts → unsupported multipart score
- grace notes → unsupported grace note
- tuplets/time modification → unsupported tuplet
- unsupported rhythm values such as 32nd notes → unsupported rhythm
- compressed `.mxl` → not supported

Early PA or notation work must not weaken these checks.

## Current rhythm / notation status

| Musical feature | Status | Notes |
|---|---|---|
| whole / half / quarter / eighth / 16th | `MERGED` | Parsed and preserved in current scope |
| rests | `MERGED` | Parsed and canonicalized |
| dotted values | `MERGED` | Dot count preserved |
| time signatures | `MERGED` | Parsed and inherited |
| `divisions` | `MERGED` | Parsed/inherited and used for duration validation |
| pickup / implicit measure | `MERGED` | Supported with bounded duration validation |
| tie start/stop | `MERGED` | Parsed/preserved |
| beam metadata | `MERGED` | Begin/continue/end/hook normalization supported |
| real beam/tie rendering in alphaTab fixture | `COMPATIBILITY_VERIFIED` | Browser/SVG compatibility evidence |
| slur / legato | `NOT_IMPLEMENTED` | Requires separate semantic/render/round-trip contract |
| grace notes / acciaccatura / appoggiatura | `NOT_IMPLEMENTED` | Current path rejects fail-closed |
| tuplets | `NOT_IMPLEMENTED` | Current path rejects fail-closed |
| 32nd and later advanced rhythm values | `NOT_IMPLEMENTED` | Current path rejects unsupported rhythm |
| articulations (staccato/accent/tenuto) | `NOT_IMPLEMENTED` | Separate notation gate required |
| ornaments (trill/mordent/turn) | `NOT_IMPLEMENTED` | Separate notation gate required |
| fermata / other expressive notation | `NOT_IMPLEMENTED` | Separate notation gate required |

A future Musical Notation Coverage contract should explicitly version parser behavior, canonical preservation, rejection policy, writer behavior, renderer evidence and semantic round-trip expectations.

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

No benchmark, observation, feedback, admission, shadow-ranking, path-policy or polyphonic-arrangement API is package-root public.

## B1/B2 evaluation boundary

B1 is fixed independent evaluation evidence, not training data. It contains 8 self-authored fixtures / 32 teacher-approved event-local labels with exact source-content binding.

Current B2 baseline:

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

B1 must remain separate from future training data if it is to continue serving as independent evaluation evidence.

## LR learning/path-policy boundary

Current merged learning/path-policy infrastructure remains non-authoritative.

### LR-S0

- consumes validated `OptimizerObservation 1.0.0` candidate sets
- recomputes current pedagogical features internally
- uses a hand-authored synthetic reference model
- produces deterministic shadow suggestions
- requires `mode: "shadow"` and `authority: "none"`
- never mutates optimizer decisions or `CanonicalTabResult`

### LR-S1A

- evaluates LR-S0 against the fixed B1 benchmark
- preserves deterministic B2 output as authoritative
- records evaluation/divergence evidence
- does not train or tune a model

### LR-S1B.1

- captures the strict normalized fingering path policy
- creates deterministic content digest
- provides content integrity, not producer authenticity

### LR-S1B.2a

- validates observation and path-policy digests
- reconstructs candidate layers from the observation
- reruns the production deterministic optimizer under the supplied policy
- checks replay/path/cost compatibility fail-closed
- does not prove historical producer authenticity

### LR-S1B.2b

- creates an immutable binding record only after semantic replay verification
- binds observation digest + exact policy snapshot/digest + optimizer identity + replay metadata
- creates a domain-separated binding digest
- remains `authority: none`
- does not persist the full observation and does not turn a stored `status: verified` string into authority

No current LR gate authorizes production learned selection.

## TeacherFeedback status

`TeacherFeedback 1.1.0` is merged internal infrastructure.

It can record:

- `accept`
- `override` to an exact different candidate from the same validated candidate layer
- `reject`

It cannot:

- create a new physical candidate
- change MusicXML pitch/rhythm/event identity
- mutate `CanonicalTabResult`
- bypass physical validation
- train or activate a learned ranker by itself

Future UI must keep Teacher Fingering Correction separate from future Teacher Score Correction.

## alphaTab compatibility

Current compatibility evidence:

| alphaTab capability | Status |
|---|---|
| real MusicXML import | `COMPATIBILITY_VERIFIED` |
| SVG score rendering | `COMPATIBILITY_VERIFIED` |
| browser rendering in headless Chrome | `COMPATIBILITY_VERIFIED` |
| standard notation + six-line TAB fixture | `COMPATIBILITY_VERIFIED` |
| double-digit fret rendering | `COMPATIBILITY_VERIFIED` |
| tie/beam rendering | `COMPATIBILITY_VERIFIED` |
| bar/measure cursor | `COMPATIBILITY_VERIFIED` |
| beat cursor | `COMPATIBILITY_VERIFIED` |
| production application viewer | `NOT_IMPLEMENTED` |
| production playback | `NOT_IMPLEMENTED` |
| synth/player readiness in tested alphaTab 1.8.4 environment | `UNVERIFIED` |

The synth diagnostic encountered an internal recursive alphaTab runtime error before score/MIDI/SoundFont/player readiness. This is not evidence of a MusicXML writer defect, but playback must not be claimed production-ready.

## MuseScore / PDF status

| Capability | Status |
|---|---|
| MuseScore executable available in tested environments | `NOT_VERIFIED` |
| real MuseScore MusicXML import | `NOT_EXECUTED` |
| MuseScore MusicXML re-export | `NOT_EXECUTED` |
| semantic round-trip comparison | `NOT_EXECUTED` |
| professional engraving validation | `NOT_EXECUTED` |
| production PDF adapter | `NOT_IMPLEMENTED` |
| in-application PDF viewer | `NOT_IMPLEMENTED` |
| PDF print/download/share | `NOT_IMPLEMENTED` |

MuseScore is an independent compatibility/engraving/PDF adapter target and must not become deterministic-core authority.

Planned semantic round-trip compares musical meaning rather than byte equality, including measures, note/rest identity, pitch/octave, duration, dots, ties, beams, staves, string/fret, tuning and time signatures.

## Application / presentation status

No production application UI is currently implemented in this repository.

| Application capability | Status |
|---|---|
| File open / preflight / convert screen | `NOT_IMPLEMENTED` |
| score + TAB viewer | `NOT_IMPLEMENTED` |
| application measure/beat cursor | `NOT_IMPLEMENTED` |
| Play / Pause / Stop controls | `NOT_IMPLEMENTED` |
| user-facing error/warning panel | `NOT_IMPLEMENTED` |
| selected-note / alternate-fingering inspector | `NOT_IMPLEMENTED` |
| Teacher Fingering Correction panel | `NOT_IMPLEMENTED` |
| Teacher Score Correction contract/panel | `NOT_IMPLEMENTED` |
| JSON/ASCII/MusicXML export center | `NOT_IMPLEMENTED` |
| MuseScore/PDF adapter | `NOT_IMPLEMENTED` |
| PDF preview/zoom/page navigation | `NOT_IMPLEMENTED` |
| PDF print/download/share | `NOT_IMPLEMENTED` |
| project save/reopen | `NOT_IMPLEMENTED` |
| full application E2E | `NOT_IMPLEMENTED` |

Application UI, renderers, editors and persistence layers must remain downstream adapters and cannot directly mutate authoritative canonical objects.

## PA-0 / PA-1 polyphonic status

PA-0 is merged architecture/documentation only. It defines a separate parallel path after `ParsedMusicXmlDocument 1.0.0`.

```text
ParsedMusicXmlDocument 1.0.0
  ├─ existing monophonic projection → current deterministic TAB core
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

Original MusicXML remains immutable source truth. Arrangement transformations such as omission, octave displacement, voice redistribution, chord reduction/revoicing or arpeggiation require explicit provenance.

### PA-1 unmerged work

Real work exists on branch `feature/pa-1-polyphonic-source-model-v1` at reviewed head `86d3c35b6c6af42f6e3608c03a60dfc813f8e7ff`:

- `src/music/polyphonicSourceModel.js`
- `tests/polyphonicSourceModel.test.js`
- `docs/polyphonic-source-model-contract.md`

At the 2026-08-10 review it is diverged from current `main`, with 3 unique commits ahead and 24 commits behind. This work is **not merged runtime capability**, but it is also not `NOT_STARTED` in the repository-history sense. It requires read-only recovery/compatibility review before any new branch/merge action.

## Approved polyphonic safe sequence

| Order | Gate | Status |
|---:|---|---|
| 1 | PA-0 Documentation + architecture planning | `MERGED_DOCUMENTATION_ONLY` |
| 2 | PA-1 `PolyphonicSourceModel 1.0` | `UNMERGED_WORK_EXISTS` |
| 3 | PA-2 Parallel polyphonic projection | `NOT_IMPLEMENTED` |
| 4 | PA-3 Simultaneous-event / chord contract | `NOT_IMPLEMENTED` |
| 5 | PA-4 Arrangement-decision + provenance contract | `NOT_IMPLEMENTED` |
| 6 | PA-5 Deterministic melody/bass/voice analysis | `NOT_IMPLEMENTED` |
| 7 | PA-6 Deterministic reduction / octave rules | `NOT_IMPLEMENTED` |
| 8 | PA-7 Guitar chord/voicing candidates | `NOT_IMPLEMENTED` |
| 9 | PA-8 Left-hand shape / finger assignment / barre | `NOT_IMPLEMENTED` |
| 10 | PA-9 Physical Playability Validator v2 | `NOT_IMPLEMENTED` |
| 11 | PA-10 Canonical v1/v2 compatibility review | `BLOCKED` |
| 12 | PA-11 Teacher-approved arrangement benchmark | `BLOCKED` |
| 13 | PA-12 Internal polyphonic E2E + monophonic compatibility | `BLOCKED` |
| 14 | PA-13 Public arrangement API review | `BLOCKED` |
| 15 | PA-14 ScoreMosaic/SesliTab adapter integration | `BLOCKED` |

## Learning/training capabilities explicitly not implemented or authorized

- concrete durable production admission backend
- separately versioned privacy/consent/lawful-use record
- live TeacherFeedback research/training dataset pipeline
- real learned model training
- model registry/lifecycle
- independent learned-model evaluation
- learned shadow deployment
- production learned selection
- production arrangement AI

These remain blocked by explicit prerequisites and must not be inferred from the existence of observation/digest/shadow infrastructure.

## Current safe development order — 2026-08-10

| Order | Gate | Current state |
|---:|---|---|
| 1 | Documentation Convergence | `IN_PROGRESS_DOCS_ONLY` |
| 2 | G0.1 administrator-bypass governance hardening | `GOVERNANCE_OPEN` |
| 3 | Historical branch inventory / orphan-work audit | `NOT_STARTED` |
| 4 | PA-1 recovery audit and closure | `UNMERGED_WORK_EXISTS` |
| 5 | Musical Notation Coverage contract | `NOT_STARTED` |
| 6 | MuseScore semantic compatibility gate | `NOT_STARTED` |
| 7 | Independent real-world MusicXML E2E fixture gate | `NOT_STARTED` |
| 8 | Application/Presentation architecture contract | `NOT_STARTED` |
| 9 | alphaTab application viewer | `NOT_IMPLEMENTED` |
| 10 | Application measure/beat cursor | `NOT_IMPLEMENTED` |
| 11 | Playback adapter + Play/Pause/Stop | `BLOCKED_BY_PLAYBACK_EVIDENCE` |
| 12 | Teacher Fingering Correction UI | `NOT_IMPLEMENTED` |
| 13 | Teacher Score Correction contract/UI | `NOT_IMPLEMENTED` |
| 14 | Export center | `NOT_IMPLEMENTED` |
| 15 | MuseScore/PDF adapter | `BLOCKED_BY_MUSESCORE_COMPATIBILITY` |
| 16 | PDF viewer / print / share | `BLOCKED_BY_PDF_ADAPTER` |
| 17 | Project persistence | `NOT_IMPLEMENTED` |
| 18 | Application E2E | `BLOCKED_BY_APPLICATION_FOUNDATIONS` |
| 19 | PA-2…PA-14 | `BLOCKED_BY_PA_1_SEQUENCE` |
| 20 | Production learned/training work | `BLOCKED_BY_DATA_GOVERNANCE` |

## High-risk protection rule

The following must not be changed incidentally:

- current monophonic semantic projection
- `convertMusicXmlToCanonicalTab()`
- `CanonicalMusicDocument`
- `CanonicalTabResult 1.0.0`
- deterministic monophonic optimizer
- package-root public API
- writer authority
- physical guitar validation rules
- B1 independent evaluation evidence

Any separately approved high-risk change requires exact baseline identification, focused tests, negative/fail-closed tests, full regression, relevant E2E/compatibility evidence, deterministic comparison where applicable, GitHub-hosted CI and separate merge approval.

## Repository governance status

| Item | Status |
|---|---|
| `main` protected | configured |
| required Node/compatibility contexts | configured |
| workflow supply-chain SHA pinning | configured |
| administrator enforcement | `GOVERNANCE_OPEN` (`non_admins`) |
| historical branch cleanup | pending read-only inventory |

## Update rule

Update this file whenever merged behavior changes feature availability, public API state, contracts, blockers, compatibility evidence or the approved next safe step.

Planned capability, compatibility evidence, unmerged branch work and merged runtime behavior must always be labeled separately.
