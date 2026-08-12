# Current Implementation Status

This document records the verified implementation state of the authoritative runtime line and the separately planned application, notation, polyphonic-arrangement and learning directions.

## Snapshot — 2026-08-12

- PA-2.3 closure baseline on `main`: `776755d993c6b057d655df1ed6b4a9046144f46d`
- latest merged runtime-changing feature: PR #78 — PA-2.3 minimal internal basic note/rest projector
- PR #78: rebase-merged on 2026-08-12
- PR #78 exact-head Tests #593 and MusicXML Compatibility #420: `SUCCESS`
- post-merge Tests #594 on `main`: `SUCCESS`
- exact-head independent Codex review: no major issue found
- PA-2.0 documentation convergence: PR #74 — rebase-merged on 2026-08-11
- PA-2.1 projection contract: PR #75 — documentation-only, rebase-merged on 2026-08-12; no runtime authority created
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
- PA-1 `PolyphonicSourceModel 1.0.0`: merged internal source-truth foundation
- PA-2.0 documentation convergence: merged documentation
- PA-2.1 projection contract: merged documentation-only through PR #75
- PA-2.2 valid polyphonic red-first fixtures/tests: merged tests-only through PR #77
- PA-2.3 minimal internal basic note/rest projector: merged through PR #78
- PA-2.4 `backup` / `forward` cursor semantics: current next gate requiring separate explicit approval
- production application UI: not implemented
- MuseScore semantic round-trip: not executed
- production PDF renderer: not implemented
- G0.1 administrator enforcement: completed
- historical branch audit: completed

PA-2.3 does not change the current public conversion scope. The package-root conversion path remains one-part, one-staff, one-voice and monophonic.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented and present on the authoritative runtime line |
| `MERGED_INTERNAL` | Implemented on `main` but intentionally not package-root public API |
| `MERGED_INTERNAL_SHADOW_ONLY` | Internal learning/shadow capability with no production selection authority |
| `COMPATIBILITY_VERIFIED` | Verified in isolated compatibility tests, not necessarily production app capability |
| `UNMERGED_WORK_EXISTS` | Real branch work exists but is not current `main` runtime capability |
| `DOCUMENTATION_ONLY` | Architecture/contract planning only; no runtime capability |
| `MERGED_DOCUMENTATION_ONLY` | Documentation/contract gate is merged on `main` but creates no runtime capability |
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
| PA-1 | `MERGED_INTERNAL` | `PolyphonicSourceModel 1.0.0` source-truth foundation; no public projection/arrangement authority |
| PA-2.1 | `MERGED_DOCUMENTATION_ONLY` | Projection contract merged through PR #75; no runtime projection authority |
| PA-2.2 | `MERGED_TESTS_ONLY` | Valid polyphonic red-first fixtures/tests merged through PR #77; no runtime authority |
| PA-2.3 | `MERGED_INTERNAL` | Minimal basic note/rest projector merged through PR #78; no public projection authority |

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
| Polyphonic source-truth foundation | `MERGED_INTERNAL` | `PolyphonicSourceModel 1.0.0`; no parser wiring or arrangement authority |

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

## PA-0 / PA-1 / PA-2.1 polyphonic status

PA-0 is merged architecture/documentation. PA-1 `PolyphonicSourceModel 1.0.0` is merged internal source-truth infrastructure. PA-2.0 documentation convergence is merged. PA-2.1 is merged documentation-only through PR #75 and defines the projection contract between `ParsedMusicXmlDocument 1.0.0` and `PolyphonicSourceModel 1.0.0`; it does not implement that projection or change the public monophonic path.

```text
ParsedMusicXmlDocument 1.0.0
  ├─ existing monophonic projection → current deterministic TAB core
  └─ PA-2 runtime projector → PolyphonicSourceModel 1.0.0
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

The PA-2 runtime projector in this diagram is an umbrella label. PA-2.3's minimal basic note/rest slice is merged; PA-2.4 `backup` / `forward` and PA-2.5 chord/multiple-voice/staff-2 expansion remain separately gated.

Original MusicXML remains immutable source truth. Arrangement transformations such as omission, octave displacement, voice redistribution, chord reduction/revoicing or arpeggiation require explicit provenance.

### PA-1 closure

PA-1 was recovered from historical divergent work onto a fresh current-main branch, hardened with negative/fail-closed tests, independently reviewed and rebase-merged through PR #73. The final P2 aggregate-event-budget issue was reproduced red-first and fixed before merge. Post-merge Tests #488 passed. The recovery branch was then removed after a read-only tree/content-equivalence check.

PA-1 remains internal. It does not wire `ParsedMusicXmlDocument` to polyphonic source projection, create chord groups, make arrangement decisions, select strings/frets/fingers/barres, or expose a public polyphonic API.

## Approved polyphonic safe sequence

| Order | Gate | Status |
|---:|---|---|
| 1 | PA-0 Documentation + architecture planning | `MERGED_DOCUMENTATION_ONLY` |
| 2 | PA-1 `PolyphonicSourceModel 1.0` | `MERGED_INTERNAL` |
| 3 | PA-2.0 PA-1 → PA-2 documentation convergence | `MERGED_DOCUMENTATION_ONLY` |
| 4 | PA-2.1 Projection contract | `MERGED_DOCUMENTATION_ONLY` — PR #75 merged; no runtime authority |
| 5 | PA-2.2 Valid polyphonic red-first fixtures/tests | `MERGED_TESTS_ONLY` — PR #77 |
| 6 | PA-2.3 Minimal internal note/rest projector | `MERGED_INTERNAL` — PR #78 |
| 7 | PA-2.4 `backup` / `forward` cursor semantics | `SEPARATE_NEXT_GATE` — requires explicit approval |
| 8 | PA-2.5 `<chord/>`, multiple voice, staff 1–2 projection | `BLOCKED_BY_PA_2_4` |
| 9 | PA-2.6 Hostile/budget/deadline/cancellation negatives | `BLOCKED_BY_PA_2_5` |
| 10 | PA-2.7 Full regression + monophonic compatibility | `BLOCKED_BY_PA_2_6` |
| 11 | PA-2.8 GitHub CI + independent review | `BLOCKED_BY_PA_2_7` |
| 12 | PA-3 Simultaneous-event / chord contract | `NOT_IMPLEMENTED` |
| 13 | PA-4 Arrangement-decision + provenance contract | `NOT_IMPLEMENTED` |
| 14 | PA-5 Deterministic melody/bass/voice analysis | `NOT_IMPLEMENTED` |
| 15 | PA-6 Deterministic reduction / octave rules | `NOT_IMPLEMENTED` |
| 16 | PA-7 Guitar chord/voicing candidates | `NOT_IMPLEMENTED` |
| 17 | PA-8 Left-hand shape / finger assignment / barre | `NOT_IMPLEMENTED` |
| 18 | PA-9 Physical Playability Validator v2 | `NOT_IMPLEMENTED` |
| 19 | PA-10 Canonical v1/v2 compatibility review | `BLOCKED` |
| 20 | PA-11 Teacher-approved arrangement benchmark | `BLOCKED` |
| 21 | PA-12 Internal polyphonic E2E + monophonic compatibility | `BLOCKED` |
| 22 | PA-13 Public arrangement API review | `BLOCKED` |
| 23 | PA-14 ScoreMosaic/SesliTab adapter integration | `BLOCKED` |

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

## Current safe development order — 2026-08-12

| Order | Gate | Current state |
|---:|---|---|
| 1 | Documentation Convergence | `COMPLETED` |
| 2 | G0.1 administrator-bypass governance hardening | `COMPLETED` |
| 3 | Historical branch inventory / orphan-work audit | `COMPLETED` |
| 4 | PA-1 recovery audit and closure | `COMPLETED` |
| 5 | PA-2.0 PA-1 → PA-2 documentation convergence | `COMPLETED` |
| 6 | PA-2.1 `ParsedMusicXmlDocument` → `PolyphonicSourceModel` projection contract | `COMPLETED_DOCUMENTATION_ONLY` — PR #75 merged; no runtime authority |
| 7 | PA-2.2 Valid polyphonic red-first fixtures/tests | `COMPLETED_TESTS_ONLY` — PR #77 |
| 8 | PA-2.3 Minimal internal note/rest projector | `COMPLETED_INTERNAL` — PR #78 |
| 9 | PA-2.4–PA-2.8 cursor/chord projection, hardening, regression and CI sequence | `SEPARATELY_GATED` — PA-2.4 is next |
| 10 | Musical Notation Coverage contract | `NOT_STARTED` |
| 11 | MuseScore semantic compatibility gate | `NOT_STARTED` |
| 12 | Independent real-world MusicXML E2E fixture gate | `NOT_STARTED` |
| 13 | Application/Presentation architecture contract | `NOT_STARTED` |
| 14 | alphaTab application viewer | `NOT_IMPLEMENTED` |
| 15 | Application measure/beat cursor | `NOT_IMPLEMENTED` |
| 16 | Playback adapter + Play/Pause/Stop | `BLOCKED_BY_PLAYBACK_EVIDENCE` |
| 17 | Teacher Fingering Correction UI | `NOT_IMPLEMENTED` |
| 18 | Teacher Score Correction contract/UI | `NOT_IMPLEMENTED` |
| 19 | Export center | `NOT_IMPLEMENTED` |
| 20 | MuseScore/PDF adapter | `BLOCKED_BY_MUSESCORE_COMPATIBILITY` |
| 21 | PDF viewer / print / share | `BLOCKED_BY_PDF_ADAPTER` |
| 22 | Project persistence | `NOT_IMPLEMENTED` |
| 23 | Application E2E | `BLOCKED_BY_APPLICATION_FOUNDATIONS` |
| 24 | PA-3…PA-14 | `BLOCKED_BY_PA_2_SEQUENCE` |
| 25 | Production learned/training work | `BLOCKED_BY_DATA_GOVERNANCE` |

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
| administrator enforcement | completed |
| historical branch audit | completed |
| PA-1 recovery branch cleanup | completed after merge + content-equivalence verification |

## Update rule

Update this file whenever merged behavior changes feature availability, public API state, contracts, blockers, compatibility evidence or the approved next safe step.

Planned capability, compatibility evidence, unmerged branch work and merged runtime behavior must always be labeled separately.
