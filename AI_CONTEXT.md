# AI Context — Read This First

This file is the required starting point for AI agents, coding assistants, reviewers and automated tools working with this repository.

## Verified runtime snapshot — 2026-08-11

- authoritative branch: `main`
- current authoritative `main` head before PA-2.1 closure: `012e66898ba584fad79dd8b31bf6f76feb0a8f72`
- latest merged runtime feature: PR #73 — PA-1 `PolyphonicSourceModel 1.0.0`
- PA-2.0 documentation convergence: PR #74 — rebase-merged on 2026-08-11
- post-merge Tests #490: PASS on `main`
- package version: `0.1.0`
- package metadata: `private: true`, `UNLICENSED`
- canonical result contract: `CanonicalTabResult 1.0.0`
- internal error contract: `EngineError 1.0.0`
- public error detection boundary: PEB-1
- PA-1: `MERGED_INTERNAL`, source-truth authority only
- PA-2.1: documentation-only projection contract; PR #75 is the closure vehicle and creates no runtime authority
- PA-2.2: next separate tests-only gate requiring explicit approval after PA-2.1 closure
- PA-2 runtime projection: `NOT_IMPLEMENTED`; runtime implementation begins no earlier than PA-2.3
- G0.1 administrator-bypass hardening: completed

PA-1 does not make polyphonic conversion public. The existing public monophonic conversion behavior remains protected and unchanged.

## Source-of-truth order

When sources disagree, use this order:

1. merged source code, tests, package metadata and workflows on `main`
2. runtime contract modules under `src/`
3. applicable versioned contract documents under `docs/`
4. `docs/current-status.md`
5. `docs/package-status.md`
6. `README.md`
7. older architecture/MVP/historical drafts

`docs/DATA-CONTRACT.md` is a deprecated historical draft and is not the current runtime contract.

Open PRs and feature branches are not current runtime capability until merged. However, unmerged work may still be important and must not be deleted or described as nonexistent without branch/commit inspection.

## Project purpose

This repository contains an independent deterministic engine that converts the currently supported monophonic MusicXML scope into playable six-string guitar tablature.

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

Observation, feedback, benchmark, shadow-ranking, path-policy and polyphonic-arrangement APIs remain internal.

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
19. High-risk changes require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted required CI and separate merge approval.

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

These are current capabilities and must not be marked `NOT_IMPLEMENTED` based only on an old planned directory tree.

## Teacher feedback and fingering foundations

Completed internal foundations:

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

Future UI must therefore keep two concepts separate:

- **Teacher Fingering Correction**: choice among already valid physical candidates.
- **Teacher Score Correction**: a future separately versioned provenance-preserving edit path that may alter pitch/rhythm/notation and must then regenerate/revalidate derived TAB.

Do not use TeacherFeedback as a generic score editor.

## Learning/ranking status

Merged internal learning-path foundations now include:

- LR-S0 `ShadowRankingReport 1.0.0` / `ShadowRankingModel 1.0.0`
- LR-S1A `ShadowRankingBenchmarkEvaluation 1.0.0`
- LR-S1B.1 `FingeringPathPolicySnapshot 1.0.0` + digest
- LR-S1B.2a `OptimizerPathPolicyReplay 1.0.0`
- LR-S1B.2b `OptimizerPathPolicyBinding 1.0.0` + binding digest

LR-S0 and all current learning-path contracts remain `authority: none` / non-production-selection infrastructure. They do not authorize learned selection, model training or live feedback reuse.

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

## PA-0 / PA-1 — Polyphonic MusicXML → Guitar Arrangement foundation

PA-0 architecture and PA-1 `PolyphonicSourceModel 1.0.0` are merged. PA-2.0 documentation convergence is also merged. PA-2.1 is the documentation-only projection contract carried by PR #75; closing PA-2.1 creates no runtime authority. PA-2.2 is the next separate tests-only gate requiring explicit approval after PA-2.1 closure. PA-2 runtime projection remains `NOT_IMPLEMENTED` and begins no earlier than PA-2.3. Current monophonic behavior remains protected.

Approved target:

```text
Polyphonic / piano MusicXML
        ↓
XML Safety + ProcessingBudget
        ↓
ParsedMusicXmlDocument 1.0.0
        ↓
PolyphonicSourceModel 1.0.0
        ↓
source-score analysis
        ↓
GuitarArrangementPlan
        ↓
guitar-compatible score
        ↓
chord / voicing / left-hand candidates
        ↓
Physical Playability Validator v2
        ↓
deterministic arrangement optimizer
        ↓
teacher-reviewed TAB-result gate
```

Original MusicXML is immutable source truth. Arrangement decisions such as omission, octave displacement, voice redistribution, chord reduction, revoicing or arpeggiation must be explicit and provenance-bound.

`CanonicalTabResult 1.0.0` must remain unchanged during early PA gates. A later PA-10 review decides whether a compatible bridge or new chord-aware canonical version is required.

### PA-1 closure

PA-1 was recovered onto a fresh current-main branch, hardened with fail-closed tests, independently reviewed and rebase-merged through PR #73. The final P2 aggregate-event-budget issue was reproduced red-first and fixed before merge. Post-merge Tests #488 passed on `main`. The recovery branch was then deleted after a read-only content-equivalence check.

PA-1 authority remains internal source truth only. It does not provide parser projection, chord grouping, arrangement decisions, guitar fingering or public polyphonic conversion.

### PA safe sequence

1. PA-0 documentation/architecture — merged
2. PA-1 `PolyphonicSourceModel 1.0` — merged internal
3. PA-2.0 PA-1 → PA-2 documentation convergence — merged documentation
4. PA-2.1 projection contract — documentation-only; PR #75 is the closure vehicle and creates no runtime authority
5. PA-2.2 valid polyphonic red-first fixtures/tests — separate next gate requiring explicit approval after PA-2.1 closure
6. PA-2.3 minimal internal note/rest projector
7. PA-2.4 `backup` / `forward` cursor semantics
8. PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection
9. PA-2.6 hostile/budget/deadline/cancellation negatives
10. PA-2.7 full regression + monophonic compatibility
11. PA-2.8 GitHub Tests + MusicXML Compatibility + independent review
12. PA-3 simultaneous-event/chord contract
13. PA-4 arrangement-decision + provenance contract
14. PA-5 deterministic melody/bass/voice analysis
15. PA-6 deterministic reduction/octave rules
16. PA-7 guitar chord/voicing candidates
17. PA-8 left-hand shape/finger assignment/barre/partial-barre
18. PA-9 Physical Playability Validator v2
19. PA-10 canonical v1/v2 compatibility review
20. PA-11 teacher-approved arrangement benchmark
21. PA-12 internal polyphonic E2E + monophonic compatibility
22. PA-13 separately approved public arrangement API
23. PA-14 ScoreMosaic/SesliTab adapter integration

Completion of one gate does not authorize the next.

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

## Current safe development order — 2026-08-11

1. Documentation Convergence — completed
2. G0.1 administrator-bypass governance hardening — completed
3. historical branch inventory / orphan-work audit — completed
4. PA-1 recovery audit and closure — completed
5. PA-2.0 PA-1 → PA-2 documentation convergence — completed
6. PA-2.1 projection contract — documentation-only; PR #75 is the closure vehicle and creates no runtime authority
7. PA-2.2 valid polyphonic red-first fixtures/tests — separate next gate requiring explicit approval after PA-2.1 closure
8. PA-2.3–PA-2.8 projector implementation/hardening/regression/CI sequence — separately gated and not started
9. Musical Notation Coverage contract
10. MuseScore semantic compatibility gate
11. independent real-world MusicXML E2E fixture gate
12. application/presentation architecture contract
13. alphaTab application viewer
14. measure/beat cursor integration
15. playback adapter + Play/Pause/Stop after synth evidence
16. teacher fingering correction UI
17. teacher score-correction contract/UI
18. export center
19. MuseScore/PDF adapter
20. PDF viewer / print / share
21. project persistence
22. application E2E
23. continue PA-3…PA-14 only after PA-2.8 closure and in order
24. production learned/training work only after durable-storage and lawful-use/privacy prerequisites

## Repository governance

- `main` is protected.
- required Node.js and compatibility checks are configured.
- workflow third-party actions are SHA-pinned.
- G0.1 administrator enforcement is completed.
- historical branch audit is completed; each cleanup action remains separately gated.
- the PA-1 recovery branch was deleted only after successful merge and content-equivalence verification.

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
