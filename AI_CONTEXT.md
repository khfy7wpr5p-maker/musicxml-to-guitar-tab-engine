# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers and automated tools working with this repository.

## Verified runtime snapshot — 2026-08-13

- authoritative branch: `main`
- PA-9 runtime merge baseline on `main`: `9869b7ecf65c9c76da3a25c032f3026a48bce201`
- PA-9 runtime tree: `00141270f145699f01e5ff4aa0b55e5bf47dc58e`
- PA-9 closure-record baseline on `main`: `4410f73c03fd08a9af635351e64181da597f3a4d`
- PA-9 closure-record tree: `9f61dee6fe0aac17660046e77619cc93887ba8f9`
- latest merged runtime-changing feature: PR #98 — internal `PhysicalPlayabilityValidation 2.0.0`
- PA-3 `SimultaneousEventModel 1.0.0`: merged through PR #85
- PA-4 `GuitarArrangementPlan 1.0.0`: merged through PR #87
- PA-5 `DeterministicVoiceAnalysis 1.0.0`: merged through PR #89
- PA-5 exact-head Tests #640: `SUCCESS` on Node.js 18/20/22
- PA-5 exact-head MusicXML Compatibility #456: `SUCCESS`
- PA-5 post-merge Tests #641 on exact `main` SHA `c9cc504558630b48e34c1fb0e0753963b24d181e`: `SUCCESS`
- PA-5 independent final review: no remaining P1/P2 blocker found
- PA-6 `DeterministicReductionPlan 1.0.0`: merged through PR #90
- PA-6 exact-head Tests #645: `SUCCESS` on Node.js 18/20/22
- PA-6 exact-head MusicXML Compatibility #460: `SUCCESS`
- PA-6 post-merge Tests #646 on exact `main` SHA `f4055e42d2cd364060e7d99a4efc2add3d8817bd`: `SUCCESS`
- PA-6 independent final review: no remaining P1/P2 blocker found
- PA-7 `GuitarVoicingCandidateModel 1.0.0`: merged through PR #92
- PA-7 exact-head Tests #652: `SUCCESS` on Node.js 18/20/22
- PA-7 exact-head MusicXML Compatibility #465: workflow `SUCCESS`
- PA-7 post-merge Tests #653 on exact runtime `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`: `SUCCESS`
- PA-7 independent final review: no remaining P1/P2 blocker found
- PA-7 closure record: PR #93 — merged documentation-only
- PA-7 closure-record exact-head Tests #654: `SUCCESS`
- PA-7 closure-record exact-head MusicXML Compatibility #466: `SUCCESS`
- PA-7 closure-record post-merge Tests #655 on exact `main` SHA `6831047db24d2e69167219844b270533cde8e539`: `SUCCESS`
- PA-8 `LeftHandShapeModel 1.0.0`: merged through PR #95
- PA-8 exact-head Tests #660: `SUCCESS` on Node.js 18/20/22
- PA-8 exact-head MusicXML Compatibility #470: `SUCCESS`
- PA-8 runtime post-merge Tests #661 on exact `main` SHA `a009709cd9f9522b1f572846526a7f593bf51717`: `SUCCESS`
- PA-8 independent final review: no remaining P1/P2 blocker found
- PA-8 closure record: PR #96 — merged documentation-only
- PA-8 closure-record exact-head Tests #662: `SUCCESS`
- PA-8 closure-record exact-head MusicXML Compatibility #471: `SUCCESS`
- PA-8 closure-record post-merge Tests #663 on exact `main` SHA `d2d39f0d2895ced5b9431cc51144f46a7fee49e9`: `SUCCESS`
- PA-9 `PhysicalPlayabilityValidation 2.0.0`: merged through PR #98
- PA-9 exact-head Tests #671: `SUCCESS` on Node.js 18/20/22
- PA-9 exact-head MusicXML Compatibility #478: `SUCCESS`
- PA-9 runtime post-merge Tests #672 on exact `main` SHA `9869b7ecf65c9c76da3a25c032f3026a48bce201`: `SUCCESS`
- PA-9 independent final review: no remaining P1/P2 blocker found
- PA-9 closure record: PR #99 — merged documentation-only
- PA-9 closure-record exact-head Tests #673: `SUCCESS` on Node.js 18/20/22
- PA-9 closure-record exact-head MusicXML Compatibility #479: `SUCCESS`
- PA-9 closure-record post-merge Tests #674 on exact `main` SHA `4410f73c03fd08a9af635351e64181da597f3a4d`: `SUCCESS`
- package version: `0.1.0`
- package metadata: `private: true`, `UNLICENSED`
- canonical result contract: `CanonicalTabResult 1.0.0`
- internal error contract: `EngineError 1.0.0`
- public error detection boundary: PEB-1
- PA-1: `MERGED_INTERNAL`, source-truth authority only
- PA-2.1: `MERGED_DOCUMENTATION_ONLY`
- PA-2.2: `MERGED_TESTS_ONLY`
- PA-2.3: `MERGED_INTERNAL`
- PA-2.4: `MERGED_INTERNAL`
- PA-2.5: `MERGED_INTERNAL`
- PA-2.6: `MERGED_TESTS_ONLY`
- PA-2.7: `VERIFIED`
- PA-2.8: `VERIFIED`
- PA-3: `MERGED_INTERNAL`
- PA-4: `MERGED_INTERNAL`
- PA-5: `MERGED_INTERNAL`
- PA-6: `MERGED_INTERNAL`
- PA-7: `MERGED_INTERNAL`
- PA-8: `MERGED_INTERNAL`
- PA-9: `MERGED_INTERNAL`
- next separately approved polyphonic gate: **PA-10 canonical v1/v2 compatibility review**
- PA-10 status: `NOT_STARTED`
- G0.1 administrator-bypass hardening: completed

PA-5 through PA-9 are internal parallel-path foundations only. PA-9 closure does **not** make polyphonic conversion public. The existing public monophonic conversion behavior remains protected and unchanged. PA-10 is not authorized by PA-9 completion or by the PA-9 merge approval.

See [PA-9 Closure](docs/pa-9-closure.md) for exact PA-9 merge/CI/authority evidence, [PA-8 Closure](docs/pa-8-closure.md) for the earlier PA-8 boundary, [PA-7 Closure](docs/pa-7-closure.md) for the earlier PA-7 boundary and [PA-5 + PA-6 Closure](docs/pa-5-pa-6-closure.md) for the earlier closure record.

## Source-of-truth order

When sources disagree, use this order:

1. merged source code, tests, package metadata and workflows on `main`
2. runtime contract modules under `src/`
3. applicable versioned contract documents under `docs/`
4. `docs/pa-9-closure.md`
5. `docs/pa-8-closure.md`
6. `docs/pa-7-closure.md`
7. `docs/pa-5-pa-6-closure.md`
8. `docs/current-status.md`
9. `docs/package-status.md`
10. `README.md`
11. older architecture/MVP/historical drafts

`docs/DATA-CONTRACT.md` is a deprecated historical draft and is not the current runtime contract.

Open PRs and feature branches are not current runtime capability until merged. Unmerged work may still be important and must not be deleted or described as nonexistent without branch/commit inspection.

## Project purpose

This repository contains an independent deterministic engine that converts the currently supported monophonic MusicXML scope into playable six-string guitar tablature and develops a separately gated internal polyphonic-arrangement path.

The current public engine:

1. safely normalizes/parses MusicXML;
2. validates supported structure and semantics;
3. creates immutable canonical musical events;
4. generates every physically valid guitar string/fret candidate;
5. selects a reproducible fingering path with a deterministic cost model and dynamic programming;
6. creates one authoritative `CanonicalTabResult 1.0.0`; and
7. derives JSON, ASCII TAB and TAB MusicXML without recalculating fingering.

Educational output still requires teacher review.

## Current public processing path

```text
MusicXML
  ↓
XML normalization + safety + ProcessingBudget
  ↓
ParsedMusicXmlDocument 1.0.0
  ├─ structural validation
  └─ supported monophonic semantic projection
          ↓
CanonicalMusicDocument
          ↓
physical guitar candidates
          ↓
deterministic cost model + DP optimizer
          ↓
CanonicalTabResult 1.0.0
          ↓
shared canonical validator
          ↓
JSON / ASCII TAB / TAB MusicXML
```

Do not create a second parser, rhythm authority, optimizer, writer set or conversion-result authority merely because early architecture documents proposed filenames that differ from the implemented layout.

## Current supported public musical scope

Supported:

- `score-partwise`
- one part
- one staff
- one voice
- monophonic notes/rests
- `step` / `alter` / `octave`
- whole, half, quarter, eighth and 16th rhythms
- dotted values
- `divisions`
- time signatures
- pickup/implicit measures
- ties
- beams, including normalized hook metadata

Current public conversion must continue to fail closed for:

- chords/polyphonic note events
- `backup` / `forward` polyphonic timing
- multiple voices
- multiple staves
- multipart scores
- grace notes
- tuplets
- unsupported rhythm values such as 32nd notes
- compressed `.mxl`

Do not expand support by deleting or weakening current `UNSUPPORTED_*` rejection checks.

## Current package-root public API

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

Observation, feedback, benchmark, shadow-ranking, path-policy and polyphonic-arrangement APIs remain internal. PA-5, PA-6, PA-7, PA-8 and PA-9 did not add package-root exports.

## Non-negotiable architecture rules

1. `CanonicalTabResult 1.0.0` is authoritative for the current public monophonic TAB path.
2. Writers use approved selected positions and never rerun optimization or arrangement.
3. Parsing does not choose guitar strings/frets.
4. Structural XML validation and musical semantic projection remain separate.
5. Physical validity is enforced before any learned fingering component.
6. The deterministic optimizer remains reproducible and is the mandatory fallback.
7. Unsupported structures fail explicitly or produce documented warnings.
8. Teacher review remains required for educational use.
9. External systems connect through explicit versioned contracts/adapters.
10. Operational observation/feedback stays outside canonical musical results unless a separately approved contract says otherwise.
11. Learned/shadow systems may score only already-generated physically valid candidates.
12. AI cannot fabricate source notes or physical guitar positions and cannot bypass physical validation.
13. A teacher decision is not research/training consent.
14. Digests establish content correspondence, not producer identity or authenticity.
15. B1 fixed evaluation evidence must remain separate from future training data.
16. Polyphonic support must enter through a parallel versioned projection, not relaxed monophonic validation.
17. Original MusicXML remains immutable source truth; arrangement changes require explicit provenance.
18. Application UI, PDF rendering, playback, persistence and editing are downstream capabilities and must not gain hidden authority over canonical truth.
19. PA-5 labels are deterministic onset-local register candidates, not semantic melody/bass truth.
20. PA-6 register bounds are deterministic policy, not proof of physical guitar playability.
21. PA-6 cannot choose strings, frets, fingers, barre shapes, hand positions or chord voicings.
22. `VOICE_REDISTRIBUTED`, `REVOICED` and `ARPEGGIATED` remain fail-closed/deferred in PA-6 v1.
23. PA-7 candidates preserve exact PA-6 target MIDI and source/group/omission provenance; they cannot mutate source pitch, octave policy or timing.
24. PA-7 candidate enumeration is not candidate preference, final voicing selection, left-hand fingering or full physical-playability approval.
25. PA-7 cannot assign left-hand fingers, barre/partial-barre, hand position or ergonomic approval and cannot silently drop notes when no candidate exists.
26. PA-8 may assign structural left-hand finger numbers and explicit barre/partial-barre candidates only after PA-7 recomputation; it may not mutate PA-7 string/fret/MIDI/source provenance.
27. PA-8 structural shape existence is not ergonomic comfort, anatomical reach, physical-playability approval, ranking or final fingering/voicing selection.
28. PA-8 cannot make public polyphonic output or mutate `CanonicalTabResult 1.0.0`.
29. PA-9 may classify only recomputed PA-8 shapes under fixed policy `CONSERVATIVE_STATIC_LEFT_HAND_2.0`; it must reuse existing single-position physical authority and preserve exact PA-8 position provenance.
30. PA-9 `PLAYABLE_WITHIN_POLICY` means acceptance by the fixed static policy, not universal anatomy, comfort, tempo or performance truth.
31. PA-9 cannot rank candidates, choose final voicing/fingering, optimize transitions, mutate source notes or gain public/canonical authority.
32. Completion of PA-9 does not authorize PA-10.
33. High-risk changes require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted required CI and separate merge approval.

## Completed security/core foundations

Merged runtime foundations include:

- secure XML normalization and safe parsing
- `ProcessingBudget 1.0.0`
- structural/semantic resource ceilings
- deadlines/cancellation/runtime checkpoints
- hostile-input regression coverage
- `ParsedMusicXmlDocument 1.0.0`
- supported monophonic semantic projection
- immutable `CanonicalMusicDocument`
- `GuitarConfiguration 1.0.0`
- physical fretboard candidates
- deterministic fingering cost model
- deterministic DP optimizer
- immutable `CanonicalTabResult 1.0.0`
- bounded hostile canonical graph validation
- JSON / ASCII TAB / TAB MusicXML public writers
- `EngineError 1.0.0`
- PEB-1 public error detection
- `Integration Contract v1`
- internal PA-1 `PolyphonicSourceModel 1.0.0` source-truth foundation
- internal PA-3 `SimultaneousEventModel 1.0.0` source-simultaneity grouping
- internal PA-4 `GuitarArrangementPlan 1.0.0` arrangement-decision/provenance representation
- internal PA-5 `DeterministicVoiceAnalysis 1.0.0` onset-local source voice/register analysis
- internal PA-6 `DeterministicReductionPlan 1.0.0` deterministic reduction/octave execution plan
- internal PA-7 `GuitarVoicingCandidateModel 1.0.0` deterministic distinct-string voicing candidate model
- internal PA-8 `LeftHandShapeModel 1.0.0` deterministic structural finger/barre candidate model
- internal PA-9 `PhysicalPlayabilityValidation 2.0.0` conservative static physical-policy validation

These are current capabilities and must not be marked `NOT_IMPLEMENTED` based only on an old planned directory tree.

## PA-5 deterministic voice/register analysis

PA-5 consumes validated polyphonic source truth and recomputes PA-3 source grouping internally. It produces `DeterministicVoiceAnalysis 1.0.0` using the fixed analysis basis `ONSET_LOCAL_REGISTER_1.0`.

Its role vocabulary is limited to:

- `SOLE_NOTE`
- `MELODY_CANDIDATE`
- `BASS_CANDIDATE`
- `INNER_VOICE_CANDIDATE`
- `OUTER_VOICE_AMBIGUOUS`

These labels are source-derived deterministic register candidates. They do not prove semantic melody/bass identity and do not use phrase, harmony, dynamics, style, teacher or AI inference. PA-5 does not execute PA-4 decisions and does not choose guitar positions.

## PA-6 deterministic reduction/octave execution

PA-6 adds `DeterministicReductionPlan 1.0.0` with:

- policy `STANDARD_GUITAR_REGISTER_20_FRET_1.0`
- standard-tuning/default-fret global register envelope MIDI 40–84
- octave tie-break `DOWNWARD_TIE_BREAK_1.0`

Executable PA-6 v1 decision subset:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- conservative `CHORD_REDUCED`

Deferred/fail-closed:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- `ARPEGGIATED`

`OCTAVE_DISPLACED` preserves pitch class, uses a non-zero octave shift and selects the nearest pitch-class-equivalent pitch inside the fixed register envelope, with the lower target on exact distance ties. `CHORD_REDUCED` only executes when PA-5 provides one unique melody candidate, one unique bass candidate, at least one inner candidate and no ambiguous outer candidate; it keeps the two unique outer notes and explicitly omits inner notes.

The register envelope is not physical playability proof. PA-6 creates no string/fret/finger/barre/left-hand/chord-voicing authority.

## PA-7 deterministic guitar voicing candidates

PA-7 adds internal `GuitarVoicingCandidateModel 1.0.0` with policy `STANDARD_SIX_STRING_DISTINCT_STRING_1.0`, standard six-string tuning, frets 0–20 and fixed aggregate candidate ceiling 10,000.

PA-7 recomputes/validates its upstream source, simultaneity and PA-6 reduction facts. For each PA-3 simultaneous group with at least two PA-6 `KEEP` notes, it enumerates deterministic assignments in which each active source event is assigned exactly one valid guitar position and no two simultaneous active notes use the same string. Exact PA-6 `targetMidi`, PA-3 group provenance and PA-6 omitted-member provenance are preserved.

More than six active simultaneous notes or a group with no injective distinct-string assignment yields zero candidates rather than silent note dropping. Candidate order is deterministic enumeration, not preference ranking.

PA-7 does not establish left-hand finger numbers, barre/partial-barre, hand position, fret-span comfort, ergonomic/playability approval, final voicing selection, arrangement optimization or public polyphonic output. PA-8 adds structural finger/barre candidates; PA-9 then applies a separately versioned fixed static physical-policy verdict without gaining final-selection authority.

## PA-8 deterministic left-hand structural candidates

PA-8 adds internal `LeftHandShapeModel 1.0.0` with policy `ORDERED_FRET_FINGER_BARRE_1.0`.

PA-8 recomputes PA-7 internally from validated source truth plus arrangement decisions. Caller-supplied PA-7 blobs are not authority. It preserves exact PA-7 candidate identity and source-event / target-MIDI / string / fret facts.

Structural rules include:

- open strings use finger `0`
- fretted positions use fingers `1..4`
- one finger cannot span different frets
- different frets use deterministic ordered-finger assignment
- repeated same-fret use of one fretting finger is represented as `PARTIAL_BARRE` or `FULL_BARRE`
- a barre candidate is rejected if it would conflict with an active pitch inside its string span
- zero valid shape candidates are allowed rather than mutating or dropping source notes
- aggregate shape candidates are bounded at 20,000
- aggregate complete finger-assignment attempts are bounded at 100,000
- optional existing `ProcessingRuntime` deadline/cancellation is reused
- output is deeply immutable

PA-8 does not establish ergonomic comfort, anatomical reach, hand-position quality, difficulty score, physical-playability approval, candidate ranking or final voicing/fingering selection. PA-9 is the separately versioned static physical-policy validator over these structural candidates.

## PA-9 deterministic physical-playability policy validation

PA-9 adds internal `PhysicalPlayabilityValidation 2.0.0` with policy `CONSERVATIVE_STATIC_LEFT_HAND_2.0`.

PA-9 recomputes PA-8 internally from validated source truth plus arrangement decisions. Caller-supplied PA-7/PA-8 model blobs are not authority. Every recomputed PA-8 assignment is checked through the existing single-position `validatePosition` authority, and exact source-event / target-MIDI / string / fret provenance is revalidated before a candidate verdict is emitted.

Fixed policy rules include:

- status vocabulary is exactly `PLAYABLE_WITHIN_POLICY` / `REJECTED`
- open strings are excluded from the fretted hand-window span
- maximum static fret span is `4`
- distinct fretting fingers at different frets must satisfy `fretDistance <= fingerNumberDistance + 1`
- rejection reasons are ordered `FRET_SPAN_EXCEEDED`, then `FINGER_REACH_EXCEEDED`
- a shape may carry both reasons
- PA-8 open-string/finger/barre/order/provenance invariants are revalidated, not repaired
- a zero-shape PA-8 voicing stays zero-shape
- a non-empty PA-8 voicing with all shapes rejected remains intact with zero accepted shapes
- inherited PA-8 assignment-attempt and shape-candidate resource ceilings remain fail closed
- optional existing `ProcessingRuntime` deadline/cancellation is reused
- output is deeply immutable

`PLAYABLE_WITHIN_POLICY` is a deterministic fixed-policy classification only. It does not establish player-specific anatomy, comfort, tempo, posture or universal performability. PA-9 carries no rank, score, preference, final-selection or transition-optimization authority; it cannot mutate source notes, `CanonicalTabResult 1.0.0`, or the public monophonic API.

## Teacher feedback and fingering foundations

Completed internal foundations include:

- `OptimizerObservation 1.0.0`
- `OptimizerObservationDigest 1.0.0`
- `PedagogicalFeatureVector 1.0.0`
- `TeacherFeedback 1.1.0`
- S1 reusable full observation validation
- S2 domain-separated SHA-256 observation digest
- S3 `ObservationAdmission 1.0.0`
- S3.1 `ObservationAdmissionAtomicAdapter 1.0.0`
- B1 `TeacherFingeringBenchmark 1.0.0`
- B2 `TeacherFingeringBenchmarkEvaluation 1.0.0`

`TeacherFeedback 1.1.0` can record `accept`, `override` or `reject` for a validated event. An override must be an exact different candidate from the same validated candidate layer. Feedback does not modify `CanonicalTabResult`, pitch, rhythm or event identity.

Future UI must keep two concepts separate:

- **Teacher Fingering Correction**: choice among already valid physical candidates.
- **Teacher Score Correction**: a future separately versioned provenance-preserving edit path that may alter pitch/rhythm/notation and must then regenerate/revalidate derived TAB.

Do not use TeacherFeedback as a generic score editor.

## Learning/ranking status

Merged internal learning-path foundations include:

- LR-S0 `ShadowRankingReport 1.0.0` / `ShadowRankingModel 1.0.0`
- LR-S1A `ShadowRankingBenchmarkEvaluation 1.0.0`
- LR-S1B.1 `FingeringPathPolicySnapshot 1.0.0` + digest
- LR-S1B.2a `OptimizerPathPolicyReplay 1.0.0`
- LR-S1B.2b `OptimizerPathPolicyBinding 1.0.0` + binding digest

All current learning-path contracts remain `authority: none` / non-production-selection infrastructure. They do not authorize learned selection, model training or live feedback reuse.

Current B1/B2 fixed evaluation baseline remains:

- 8 self-authored cases
- 32 teacher-approved note events
- 32/32 acceptable
- 26/28 preferred
- 8/8 case passes
- 0 candidate-coverage failures
- 0 blocked conversions

B1 is independent evaluation evidence, not training data.

## Current learning/training blockers

Do not claim or implement production learned selection before separately approved prerequisites exist:

- concrete durable production admission store
- separately versioned privacy/consent/lawful-use boundary
- authorized live feedback dataset pipeline
- real training pipeline
- model registry/version lifecycle
- independent learned-model evaluation
- shadow-first deployment evidence
- separately approved production opt-in

TeacherFeedback by itself is not authorization for research or training.

## alphaTab status

Compatibility evidence currently verifies:

- real alphaTab MusicXML import
- real SVG rendering
- real browser rendering in headless Chrome
- standard notation + six-line TAB for the fixture
- fret 10 rendering
- tie/beam rendering
- bar/measure cursor
- beat cursor

These are compatibility tests, not a production application viewer.

The alphaTab 1.8.4 synthesizer diagnostic remains unverified for production readiness because the tested headless Chrome runtime did not establish score/MIDI/SoundFont/player readiness. Do not describe playback as production-ready merely because the Compatibility workflow concludes `SUCCESS`.

## MuseScore / PDF status

MuseScore is an intended independent compatibility/engraving target, not deterministic-core authority.

Current state:

- MuseScore executable availability in tested environments: absent
- real import: not executed
- MusicXML re-export: not executed
- semantic round-trip: not executed
- PDF export: not executed

Safe planned boundary:

```text
CanonicalTabResult
      ↓
TAB MusicXML
      ├─→ alphaTab viewer/cursor/playback adapter
      └─→ MuseScore independent import/round-trip/engraving/PDF adapter
```

PDF failure must not invalidate a valid core MusicXML/TAB result.

## Musical-notation coverage

Current verified core scope includes whole/half/quarter/eighth/16th, dotted values, rests, ties, beams, divisions, time signatures and pickups.

Separate future gates are required for:

- slur / legato semantics
- grace notes / acciaccatura / appoggiatura
- tuplets
- 32nd and later advanced rhythm values
- articulations such as staccato, accent, tenuto
- ornaments such as trill, mordent, turn
- fermata and other expressive notation

These must be added through an explicit notation-coverage contract with parser/preservation/rejection/render/round-trip tests. Do not silently accept unsupported notation.

## Polyphonic MusicXML → Guitar Arrangement

Current internal path:

```text
Polyphonic / piano MusicXML
        ↓
XML Safety + ProcessingBudget
        ↓
ParsedMusicXmlDocument 1.0.0
        ↓
PolyphonicSourceModel 1.0.0
        ↓
SimultaneousEventModel 1.0.0
        ↓
GuitarArrangementPlan 1.0.0
        ↓
DeterministicVoiceAnalysis 1.0.0
        ↓
DeterministicReductionPlan 1.0.0
        ↓
GuitarVoicingCandidateModel 1.0.0
        ↓
LeftHandShapeModel 1.0.0
        ↓
PhysicalPlayabilityValidation 2.0.0
        ↓
PA-10 canonical v1/v2 compatibility review — NOT STARTED
        ↓
future deterministic arrangement optimizer
        ↓
teacher-reviewed TAB-result gate
```

Original MusicXML is immutable source truth. Arrangement decisions such as omission, octave displacement, voice redistribution, chord reduction, revoicing or arpeggiation must be explicit and provenance-bound.

`CanonicalTabResult 1.0.0` remains unchanged through PA-9. PA-10 is the separately gated compatibility review for whether a compatible bridge or new chord-aware canonical version is required.

### PA safe sequence

1. PA-0 documentation/architecture — merged
2. PA-1 `PolyphonicSourceModel 1.0` — merged internal
3. PA-2.0 PA-1 → PA-2 documentation convergence — merged documentation
4. PA-2.1 projection contract — merged documentation-only through PR #75
5. PA-2.2 valid polyphonic red-first fixtures/tests — merged tests-only through PR #77
6. PA-2.3 minimal internal note/rest projector — merged internal through PR #78
7. PA-2.4 `backup` / `forward` cursor semantics — merged internal through PR #80
8. PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection — merged internal through PR #81
9. PA-2.6 hostile/budget/deadline/cancellation negatives — merged tests-only through PR #83
10. PA-2.7 full regression + monophonic compatibility — verified
11. PA-2.8 GitHub Tests + MusicXML Compatibility + independent review — verified
12. PA-3 simultaneous-event/chord source grouping — merged internal through PR #85
13. PA-4 arrangement-decision + provenance contract — merged internal through PR #87
14. PA-5 deterministic melody/bass/voice analysis — merged internal through PR #89
15. PA-6 deterministic reduction/octave rules — merged internal through PR #90
16. PA-7 guitar chord/voicing candidates — merged internal through PR #92; closure record PR #93
17. PA-8 left-hand shape/finger assignment/barre/partial-barre — merged internal through PR #95; closure record PR #96
18. PA-9 Physical Playability Validator v2 — merged internal through PR #98; closure record PR #99
19. PA-10 canonical v1/v2 compatibility review — next separate gate; requires explicit Stage Start Approval
20. PA-11 teacher-approved arrangement benchmark
21. PA-12 internal polyphonic E2E + monophonic compatibility
22. PA-13 separately approved public arrangement API
23. PA-14 ScoreMosaic/SesliTab adapter integration

Completion of PA-9 does not authorize PA-10.

## Application/presentation status

No production application UI is implemented in this repository yet.

Planned application capabilities include:

- file open/preflight/convert state flow
- standard notation + TAB viewer
- measure/bar and beat cursor
- Play/Pause/Stop after playback evidence is stable
- error/warning presentation using stable error codes
- selected-note and alternate-fingering inspector
- teacher fingering correction panel
- separately controlled teacher score correction panel
- export center for JSON/ASCII/MusicXML
- optional MuseScore/PDF rendering adapter
- PDF preview/zoom/page navigation
- print/download/share
- project save/reopen
- full application E2E

Application UI, renderer, editor and persistence layers are downstream adapters. They cannot directly mutate authoritative canonical objects or bypass validation.

## Current safe development order — 2026-08-13

1. PA-1 through PA-4 — completed/verified according to their closure records
2. PA-5 deterministic voice/register analysis — completed through PR #89
3. PA-6 deterministic reduction/octave rules — completed through PR #90
4. PA-7 deterministic guitar voicing candidates — completed through PR #92; closure record PR #93
5. PA-8 deterministic left-hand shape/finger/barre candidates — completed through PR #95; closure record PR #96
6. PA-9 Physical Playability Validator v2 — completed through PR #98; closure record PR #99
7. PA-10 canonical v1/v2 compatibility review — next separate polyphonic gate; not started
8. Musical Notation Coverage contract — separately gated
9. MuseScore semantic compatibility gate — separately gated
10. independent real-world MusicXML E2E fixture gate — separately gated
11. application/presentation work — downstream and separately gated
12. production learned/training work — only after durable-storage and lawful-use/privacy prerequisites

Each runtime/high-risk package requires focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and separate merge approval.

## Repository governance

- `main` is protected.
- required Node.js and compatibility checks are configured.
- workflow third-party actions are SHA-pinned.
- G0.1 administrator enforcement is completed.
- historical branch audit is completed; each cleanup action remains separately gated.
- no branch cleanup is authorized by PA-9 merge approval.

## Safe-development protocol for agents

Before changing anything:

1. verify current `main` and branch state read-only;
2. define the exact gate and files allowed to change;
3. keep unrelated refactors out;
4. add red-first/negative tests when runtime behavior changes;
5. preserve fail-closed behavior;
6. run focused tests;
7. run full regression;
8. run relevant compatibility/E2E evidence;
9. obtain GitHub-hosted CI evidence;
10. request separate review/merge approval;
11. perform post-merge read-only verification;
12. treat branch cleanup as a separate action.

Do not confuse local test success with GitHub-hosted CI success.

## Project boundaries

This repository does not directly implement:

- PDF/image OMR
- Audiveris
- HTTP service behavior
- production UI/PWA/mobile behavior
- direct SesliTab/ScoreMosaic application behavior

External systems integrate through explicit adapters/contracts.