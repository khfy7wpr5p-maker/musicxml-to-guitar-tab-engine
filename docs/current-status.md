# Current Implementation Status

This document records the verified implementation state of the authoritative runtime line and the separately planned application, notation, polyphonic-arrangement and learning directions.

## Snapshot — 2026-08-13

- PA-7 runtime closure baseline on `main`: `1f3dc2cf89efab1e258064b6e76eb51daee4252c`
- runtime closure tree: `2458bf228fe02ecb82359417b7bb5016b6c29f82`
- PA-7 closure-record baseline on `main`: `6831047db24d2e69167219844b270533cde8e539`
- latest merged runtime-changing feature: PR #92 — internal `GuitarVoicingCandidateModel 1.0.0`
- PA-2 sequence: `CLOSED`
- PA-3 `SimultaneousEventModel 1.0.0`: merged internal through PR #85
- PA-4 `GuitarArrangementPlan 1.0.0`: merged internal through PR #87
- PA-5 `DeterministicVoiceAnalysis 1.0.0`: merged internal through PR #89
- PA-5 exact-head Tests #640: `SUCCESS` on Node.js 18/20/22
- PA-5 exact-head MusicXML Compatibility #456: `SUCCESS`
- PA-5 post-merge Tests #641 on exact `main` SHA `c9cc504558630b48e34c1fb0e0753963b24d181e`: `SUCCESS`
- PA-5 independent final review: no remaining P1/P2 blocker found
- PA-6 `DeterministicReductionPlan 1.0.0`: merged internal through PR #90
- PA-6 exact-head Tests #645: `SUCCESS` on Node.js 18/20/22
- PA-6 exact-head MusicXML Compatibility #460: `SUCCESS`
- PA-6 post-merge Tests #646 on exact `main` SHA `f4055e42d2cd364060e7d99a4efc2add3d8817bd`: `SUCCESS`
- PA-6 independent final review: no remaining P1/P2 blocker found
- PA-7 `GuitarVoicingCandidateModel 1.0.0`: merged internal through PR #92
- PA-7 exact-head Tests #652: `SUCCESS` on Node.js 18/20/22
- PA-7 exact-head MusicXML Compatibility #465: workflow `SUCCESS`
- PA-7 post-merge Tests #653 on exact runtime `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`: `SUCCESS`
- PA-7 independent final review: no remaining P1/P2 blocker found
- PA-7 closure record: PR #93 — merged documentation-only
- PA-7 closure-record exact-head Tests #654: `SUCCESS`
- PA-7 closure-record exact-head MusicXML Compatibility #466: `SUCCESS`
- PA-7 closure-record post-merge Tests #655 on exact `main` SHA `6831047db24d2e69167219844b270533cde8e539`: `SUCCESS`
- current package version: `0.1.0`
- current canonical result: `CanonicalTabResult 1.0.0`
- current internal error contract: `EngineError 1.0.0`
- package-root public writer API: merged and unchanged by PA-5/PA-6/PA-7
- `GuitarConfiguration 1.0.0`: merged internal
- `Integration Contract v1`: merged internal
- S1/S2/S3/S3.1 observation/admission foundations: merged internal
- B1/B2 benchmark/evaluation: merged internal
- LR-S0 / LR-S1A / LR-S1B.1 / LR-S1B.2a / LR-S1B.2b: merged internal, non-authoritative learning path
- next separately approved polyphonic gate: **PA-8 left-hand shape/finger/barre/partial-barre model**
- production application UI: not implemented
- MuseScore semantic round-trip: not executed
- production PDF renderer: not implemented
- real uploaded-file PA-7 E2E: not executed
- G0.1 administrator enforcement: completed
- historical branch audit: completed

PA-5, PA-6 and PA-7 are internal parallel-path capabilities only. PA-7 closure does not change the current public conversion scope. The package-root conversion path remains one-part, one-staff, one-voice and monophonic. PA-8 is not authorized by PA-7 completion or by the PA-7 merge approval.

See [PA-7 Closure](pa-7-closure.md) for the exact PA-7 runtime/CI/authority boundary and [PA-5 + PA-6 Closure](pa-5-pa-6-closure.md) for the earlier closure evidence.

## Status labels

| Label | Meaning |
|---|---|
| `MERGED` | Implemented and present on the authoritative runtime line |
| `MERGED_INTERNAL` | Implemented on `main` but intentionally not package-root public API |
| `MERGED_TESTS_ONLY` | Test vectors/evidence are merged on `main`; no runtime/public authority |
| `MERGED_INTERNAL_SHADOW_ONLY` | Internal learning/shadow capability with no production selection authority |
| `VERIFIED` | Verification gate completed with direct evidence; no extra runtime authority implied |
| `COMPATIBILITY_VERIFIED` | Verified in isolated compatibility tests, not necessarily product capability |
| `DOCUMENTATION_ONLY` | Architecture/contract planning only; no runtime capability |
| `MERGED_DOCUMENTATION_ONLY` | Documentation/contract gate merged on `main`; no runtime capability |
| `NOT_IMPLEMENTED` | No merged implementation exists |
| `NOT_STARTED` | Gate has not begun |
| `BLOCKED` | Work must not begin until prerequisites/evidence are complete |

## Completed security and deterministic-core milestones

| Milestone | Status | Result |
|---|---|---|
| 2A–2B | `MERGED` | Immutable parsed MusicXML and supported semantic parse |
| 2C series | `MERGED` | Processing budgets, XML/measure/event limits, deadlines/cancellation/checkpoints, hostile-input regression |
| SEC-CI-1 | `MERGED` | Third-party GitHub Actions pinned to immutable SHAs |
| 2D series | `MERGED` | Common internal `EngineError` and domain convergence |
| Milestone 3 | `MERGED` | Public deterministic JSON, ASCII TAB and TAB MusicXML writers |
| PEB-1 | `MERGED` | Public error detection boundary |
| Canonical TAB graph hardening | `MERGED` | Bounded iterative hostile graph rejection |
| GuitarConfiguration 1.0 | `MERGED_INTERNAL` | Immutable six-string physical configuration contract |
| Integration Contract v1 | `MERGED_INTERNAL` | Explicit external non-authority boundary |
| S1/S2 | `MERGED_INTERNAL` | Reusable observation validation + content digest |
| S3/S3.1 | `MERGED_INTERNAL` | Admission identity/replay/collision + atomic adapter foundation |
| B1/B2 | `MERGED_INTERNAL` | Fixed teacher benchmark + deterministic evaluation baseline |
| LR-S0/LR-S1A | `MERGED_INTERNAL_SHADOW_ONLY` | Shadow ranking/evaluation only; no normal-conversion authority |
| LR-S1B.1/2a/2b | `MERGED_INTERNAL` | Path-policy snapshot/replay/binding integrity foundations |
| PA-1 | `MERGED_INTERNAL` | `PolyphonicSourceModel 1.0.0` source truth |
| PA-2.1 | `MERGED_DOCUMENTATION_ONLY` | Projection contract through PR #75 |
| PA-2.2 | `MERGED_TESTS_ONLY` | Valid red-first vectors through PR #77 |
| PA-2.3 | `MERGED_INTERNAL` | Basic note/rest projector through PR #78 |
| PA-2.4 | `MERGED_INTERNAL` | `backup` / `forward` cursor semantics through PR #80 |
| PA-2.5 | `MERGED_INTERNAL` | Chord/multiple-voice/staff-2 projection through PR #81 |
| PA-2.6 | `MERGED_TESTS_ONLY` | Hostile/budget/deadline/cancellation negatives through PR #83 |
| PA-2.7 | `VERIFIED` | Full regression + public monophonic compatibility |
| PA-2.8 | `VERIFIED` | GitHub CI + independent review; PA-2 closed |
| PA-3 | `MERGED_INTERNAL` | `SimultaneousEventModel 1.0.0`; exact source simultaneity grouping |
| PA-4 | `MERGED_INTERNAL` | `GuitarArrangementPlan 1.0.0`; explicit decision/provenance record |
| PA-5 | `MERGED_INTERNAL` | `DeterministicVoiceAnalysis 1.0.0`; onset-local source register roles |
| PA-6 | `MERGED_INTERNAL` | `DeterministicReductionPlan 1.0.0`; approved deterministic reduction/octave subset |
| PA-7 | `MERGED_INTERNAL` | `GuitarVoicingCandidateModel 1.0.0`; deterministic distinct-string standard-guitar voicing alternatives |

## Current merged public runtime capabilities

| Area | Status | Verified behavior |
|---|---|---|
| XML input safety | `MERGED` | Encoding/null/entity/DOCTYPE policy plus resource ceilings |
| `ProcessingBudget 1.0.0` | `MERGED` | Bounded processing policy |
| `ParsedMusicXmlDocument 1.0.0` | `MERGED` | Immutable bounded XML representation |
| MusicXML public semantic parse | `MERGED` | Supported single-part/single-staff/single-voice monophonic scope |
| Processing limits | `MERGED` | Byte/XML/measure/event/deadline/cancellation checkpoints |
| Preflight | `MERGED` | Frozen PASS/WARNING/BLOCKED reports |
| Canonical music | `MERGED` | Immutable `CanonicalMusicDocument` |
| Guitar configuration | `MERGED_INTERNAL` | Immutable six-string configuration |
| Physical candidates | `MERGED` | All physically valid string/fret positions for public scope |
| Cost model | `MERGED` | Explainable deterministic costs |
| Optimizer | `MERGED` | Deterministic dynamic programming + stable tie-breaking |
| Canonical TAB result | `MERGED` | Immutable `CanonicalTabResult 1.0.0` |
| Writers | `MERGED` | Public deterministic JSON / ASCII TAB / TAB MusicXML |
| Observation/feedback integrity | `MERGED_INTERNAL` | S1/S2 + TeacherFeedback foundations |
| Admission coordination | `MERGED_INTERNAL` | S3/S3.1 foundations |
| Benchmark/evaluation | `MERGED_INTERNAL` | B1/B2 fixed independent evidence |
| Shadow learning evaluation | `MERGED_INTERNAL_SHADOW_ONLY` | LR-S0/LR-S1A, no normal-conversion authority |
| Path-policy provenance integrity | `MERGED_INTERNAL` | LR-S1B.1 / 2a / 2b |

## Current internal polyphonic capabilities

| Capability | Status | Boundary |
|---|---|---|
| `PolyphonicSourceModel 1.0.0` | `MERGED_INTERNAL` | Source-truth projection foundation; public adapter unchanged |
| `SimultaneousEventModel 1.0.0` | `MERGED_INTERNAL` | Same-measure/onset source-note groups; no arrangement authority |
| `GuitarArrangementPlan 1.0.0` | `MERGED_INTERNAL` | Exact already-chosen decision/source/group provenance; no automatic policy |
| `DeterministicVoiceAnalysis 1.0.0` | `MERGED_INTERNAL` | `ONSET_LOCAL_REGISTER_1.0`; deterministic source register candidates, not semantic melody/bass truth |
| `DeterministicReductionPlan 1.0.0` | `MERGED_INTERNAL` | Executes only PA-6 v1 approved subset; no physical voicing/fingering authority |
| `GuitarVoicingCandidateModel 1.0.0` | `MERGED_INTERNAL` | PA-7 deterministic distinct-string positions for simultaneous PA-6 KEEP notes; not left-hand/playability/final-selection authority |
| PA-8 left-hand model | `NOT_STARTED` | Requires separate Stage Start Approval |
| PA-9 Physical Playability Validator v2 | `NOT_IMPLEMENTED` | Future gate |
| Public polyphonic arrangement API | `NOT_IMPLEMENTED` | Planned PA-13 only after prerequisites |

### PA-5 boundary

`DeterministicVoiceAnalysis 1.0.0` uses fixed basis `ONSET_LOCAL_REGISTER_1.0` and the role vocabulary:

- `SOLE_NOTE`
- `MELODY_CANDIDATE`
- `BASS_CANDIDATE`
- `INNER_VOICE_CANDIDATE`
- `OUTER_VOICE_AMBIGUOUS`

These labels are deterministic onset-local register candidates, not semantic musical-role truth. PA-5 excludes phrase/harmony/dynamics/style/teacher/AI inference and does not choose guitar positions.

### PA-6 boundary

`DeterministicReductionPlan 1.0.0` uses:

- policy `STANDARD_GUITAR_REGISTER_20_FRET_1.0`
- fixed standard-tuning/default-0–20-fret register envelope MIDI 40–84
- octave tie-break `DOWNWARD_TIE_BREAK_1.0`

Executable PA-6 v1:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- conservative `CHORD_REDUCED`

Fail-closed/deferred:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- `ARPEGGIATED`

The register envelope is not proof of physical playability. PA-6 does not choose string/fret/finger/barre/hand-position/chord-voicing.

### PA-7 boundary

`GuitarVoicingCandidateModel 1.0.0` uses policy `STANDARD_SIX_STRING_DISTINCT_STRING_1.0` with standard six-string tuning, frets 0–20 and a fixed aggregate 10,000-candidate ceiling.

PA-7 enumerates deterministic alternatives for simultaneous PA-6 `KEEP` notes while preserving exact `targetMidi`, PA-3 group provenance and PA-6 omitted-member provenance. Each candidate assigns one valid position per active source event and forbids duplicate guitar strings within the simultaneous candidate.

A PA-7 candidate is not full physical-playability approval. PA-7 does not assign left-hand fingers, barre/partial-barre, hand position, ergonomic approval, ranking, final voicing selection or public polyphonic output. More than six active simultaneous notes or a group with no injective distinct-string assignment produces zero candidates rather than silent note dropping.

## Current public musical scope

The public conversion path remains intentionally narrow and protected.

Supported now:

- MusicXML `score-partwise`
- exactly one score part
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

PA-5/PA-6/PA-7 did not weaken these checks.

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
| slur / legato | `NOT_IMPLEMENTED` | Separate semantic/render/round-trip contract required |
| grace notes | `NOT_IMPLEMENTED` | Public path rejects fail-closed |
| tuplets | `NOT_IMPLEMENTED` | Public path rejects fail-closed |
| 32nd+ rhythms | `NOT_IMPLEMENTED` | Public path rejects unsupported rhythm |
| articulations / ornaments / fermata | `NOT_IMPLEMENTED` | Separate notation gates required |

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

B1 is fixed independent evaluation evidence, not training data. It contains 8 self-authored fixtures / 32 teacher-approved event-local labels.

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

## Learning/path-policy boundary

Current LR infrastructure remains internal and non-authoritative. Shadow ranking cannot alter the deterministic optimizer, `CanonicalTabResult`, physical validation or writers. TeacherFeedback does not authorize research/training reuse. Production learned selection remains blocked pending separately approved durable storage, privacy/consent/lawful-use, training, model lifecycle and independent evaluation prerequisites.

## alphaTab / MuseScore / PDF status

alphaTab compatibility evidence verifies MusicXML import, SVG/browser rendering, standard notation + six-line TAB, fret 10, ties/beams, bar cursor and beat cursor. This is compatibility evidence, not a production application viewer. Production synth/playback remains unverified in the tested alphaTab 1.8.4 headless environment. MusicXML Compatibility workflow success must not be interpreted as proof of production playback readiness.

MuseScore Studio was not installed in tested environments, so real MuseScore import, re-export, semantic round-trip and PDF export remain unexecuted. PDF is a downstream presentation adapter and must not become core authority.

## Application status

Not implemented as production application capabilities:

- application shell/UI
- score/TAB viewer integration
- production playback
- teacher correction UI
- export/share application layer
- PDF viewer/print/share
- project persistence
- full application E2E

Application/editor/persistence layers may not directly mutate authoritative canonical data.

## PA safe sequence

1. PA-0 documentation/architecture — merged
2. PA-1 source-truth foundation — merged internal
3. PA-2.0–PA-2.8 projection/hardening/verification — closed
4. PA-3 source simultaneity grouping — merged internal through PR #85
5. PA-4 arrangement decision/provenance — merged internal through PR #87
6. PA-5 deterministic voice/register analysis — merged internal through PR #89
7. PA-6 deterministic reduction/octave rules — merged internal through PR #90
8. PA-7 guitar chord/voicing candidates — merged internal through PR #92; closure record PR #93
9. PA-8 left-hand shape/finger/barre/partial-barre — **next separate gate; NOT STARTED**
10. PA-9 Physical Playability Validator v2
11. PA-10 canonical v1/v2 compatibility review
12. PA-11 teacher-approved arrangement benchmark
13. PA-12 internal polyphonic E2E + monophonic compatibility
14. PA-13 separately approved public arrangement API
15. PA-14 ScoreMosaic/SesliTab adapter integration

Completion of PA-7 does not authorize PA-8.

## Governance / outstanding evidence

- `main` is protected.
- GitHub-hosted Tests are required for runtime closure.
- PR-only compatibility evidence must not be described as post-merge evidence.
- PA-7 exact-head Compatibility #465 is PR-triggered compatibility evidence; post-merge runtime evidence is Tests #653 on exact runtime `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`.
- PA-7 closure-record PR #93 exact-head Tests #654 and Compatibility #466 passed; final closure-record post-merge evidence is Tests #655 on `main` SHA `6831047db24d2e69167219844b270533cde8e539`.
- no post-merge MusicXML Compatibility run is claimed for either PA-7 runtime merge or closure-record merge.
- real uploaded MusicXML has not been executed as genuine PA-7 end-to-end evidence.
- branch cleanup remains separately gated.
- PA-8 has not started.
