# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers and automated tools working with this repository.

## Verified runtime snapshot — 2026-08-13

- authoritative branch: `main`
- PA-6 runtime closure baseline on `main`: `f4055e42d2cd364060e7d99a4efc2add3d8817bd`
- closure tree: `a0cc5aa6e2ed7928e840cb364f04ee5817bf0d93`
- latest merged runtime-changing feature: PR #90 — internal `DeterministicReductionPlan 1.0.0`
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
- next separately approved polyphonic gate: **PA-7 guitar chord/voicing candidates**
- G0.1 administrator-bypass hardening: completed

PA-5 and PA-6 are internal parallel-path foundations only. PA-6 closure does **not** make polyphonic conversion public. The existing public monophonic conversion behavior remains protected and unchanged. PA-7 is not authorized by PA-6 completion or by the PA-6 merge approval.

See [PA-5 + PA-6 Closure](docs/pa-5-pa-6-closure.md) for the exact merge/CI evidence and closure boundary.

## Source-of-truth order

When sources disagree, use this order:

1. merged source code, tests, package metadata and workflows on `main`
2. runtime contract modules under `src/`
3. applicable versioned contract documents under `docs/`
4. `docs/pa-5-pa-6-closure.md`
5. `docs/current-status.md`
6. `docs/package-status.md`
7. `README.md`
8. older architecture/MVP/historical drafts

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

Observation, feedback, benchmark, shadow-ranking, path-policy and polyphonic-arrangement APIs remain internal. PA-5 and PA-6 did not add package-root exports.

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
23. High-risk changes require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted required CI and separate merge approval.

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

The alphaTab 1.8.4 synthesizer diagnostic remains unverified because the tested headless Chrome runtime encountered an internal recursive `loadedMidiInfo` error before score/MIDI/SoundFont/player readiness. Do not describe playback as production-ready.

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
PA-7 guitar chord/voicing candidates — NOT STARTED
        ↓
PA-8 left-hand shape/finger assignment/barre/partial-barre
        ↓
PA-9 Physical Playability Validator v2
        ↓
deterministic arrangement optimizer
        ↓
teacher-reviewed TAB-result gate
```

Original MusicXML is immutable source truth. Arrangement decisions such as omission, octave displacement, voice redistribution, chord reduction, revoicing or arpeggiation must be explicit and provenance-bound.

`CanonicalTabResult 1.0.0` remains unchanged through PA-6. A later PA-10 review decides whether a compatible bridge or new chord-aware canonical version is required.

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
16. PA-7 guitar chord/voicing candidates — next separate gate; requires explicit Stage Start Approval
17. PA-8 left-hand shape/finger assignment/barre/partial-barre
18. PA-9 Physical Playability Validator v2
19. PA-10 canonical v1/v2 compatibility review
20. PA-11 teacher-approved arrangement benchmark
21. PA-12 internal polyphonic E2E + monophonic compatibility
22. PA-13 separately approved public arrangement API
23. PA-14 ScoreMosaic/SesliTab adapter integration

Completion of PA-6 does not authorize PA-7.

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
4. PA-5/PA-6 documentation convergence — current closure package
5. PA-7 guitar chord/voicing candidates — next separate polyphonic gate; not started
6. Musical Notation Coverage contract — separately gated
7. MuseScore semantic compatibility gate — separately gated
8. independent real-world MusicXML E2E fixture gate — separately gated
9. application/presentation work — downstream and separately gated
10. production learned/training work — only after durable-storage and lawful-use/privacy prerequisites

Each runtime/high-risk package requires focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and separate merge approval.

## Repository governance

- `main` is protected.
- required Node.js and compatibility checks are configured.
- workflow third-party actions are SHA-pinned.
- G0.1 administrator enforcement is completed.
- historical branch audit is completed; each cleanup action remains separately gated.
- no branch cleanup is authorized by PA-6 merge approval.

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
