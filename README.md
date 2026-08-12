# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts the currently supported MusicXML scope into playable six-string guitar tablature.

AI agents and development tools should begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Verified runtime baseline — 2026-08-13

The PA-6 runtime closure baseline is:

- authoritative `main` runtime/test baseline: `f4055e42d2cd364060e7d99a4efc2add3d8817bd`
- repository tree at that baseline: `a0cc5aa6e2ed7928e840cb364f04ee5817bf0d93`
- latest merged runtime-changing feature: PR #90 — PA-6 internal `DeterministicReductionPlan 1.0.0` deterministic reduction/octave execution contract
- PA-2.0 documentation convergence: PR #74 — rebase-merged on 2026-08-11
- PA-2.1 projection contract: PR #75 — documentation-only, rebase-merged on 2026-08-12; no runtime authority created
- PA-2.2 red-first vectors: PR #77 — tests-only, merged on 2026-08-12
- PA-2.3 minimal internal projector: PR #78 — rebase-merged on 2026-08-12
- PA-2.4 `backup` / `forward` cursor semantics: PR #80 — rebase-merged on 2026-08-12
- PA-2.5 chord/multiple-voice/staff-2 projection: PR #81 — rebase-merged on 2026-08-12
- PA-2.6 hostile/budget/deadline/cancellation negatives: PR #83 — tests-only, rebase-merged on 2026-08-12
- PA-2.7 full regression + monophonic compatibility: `VERIFIED`
- PA-2.8 GitHub CI + independent review: `VERIFIED`; no P1/P2 blocker found
- PA-3 simultaneous-event source grouping: PR #85 — rebase-merged on 2026-08-12
- PA-3 exact-head Tests #622: `SUCCESS` on Node.js 18/20/22
- PA-3 exact-head MusicXML Compatibility #442: `SUCCESS`
- PA-3 post-merge Tests #623 on `main`: `SUCCESS`
- PA-3 independent review: no P1/P2 blocker found
- PA-4 arrangement decision + provenance: PR #87 — rebase-merged on 2026-08-12
- PA-4 exact-head Tests #633: `SUCCESS` on Node.js 18/20/22
- PA-4 exact-head MusicXML Compatibility #451: `SUCCESS`
- PA-4 post-merge Tests #634 on `main`: `SUCCESS`
- PA-4 independent final review: no remaining P1/P2 blocker found
- PA-5 deterministic voice/register analysis: PR #89 — rebase-merged on 2026-08-12
- PA-5 exact-head Tests #640: `SUCCESS` on Node.js 18/20/22
- PA-5 exact-head MusicXML Compatibility #456: `SUCCESS`
- PA-5 post-merge Tests #641 on `main`: `SUCCESS`
- PA-5 independent final review: no remaining P1/P2 blocker found
- PA-6 deterministic reduction/octave rules: PR #90 — rebase-merged on 2026-08-13
- PA-6 exact-head Tests #645: `SUCCESS` on Node.js 18/20/22
- PA-6 exact-head MusicXML Compatibility #460: `SUCCESS`
- PA-6 post-merge Tests #646 on `main`: `SUCCESS`
- PA-6 independent final review: no remaining P1/P2 blocker found
- package version: `0.1.0`
- package metadata: `private: true`, `UNLICENSED`
- current canonical TAB contract: `CanonicalTabResult 1.0.0`
- current internal error contract: `EngineError 1.0.0`
- PA-1 status: `MERGED_INTERNAL`
- PA-2.1 status: `MERGED_DOCUMENTATION_ONLY`
- PA-2.2 status: `MERGED_TESTS_ONLY` through PR #77
- PA-2.3 status: `MERGED_INTERNAL` through PR #78
- PA-2.4 status: `MERGED_INTERNAL` through PR #80
- PA-2.5 status: `MERGED_INTERNAL` through PR #81
- PA-2.6 status: `MERGED_TESTS_ONLY` through PR #83
- PA-2.7 status: `VERIFIED`
- PA-2.8 status: `VERIFIED`
- PA-3 status: `MERGED_INTERNAL` through PR #85
- PA-4 status: `MERGED_INTERNAL` through PR #87
- PA-5 status: `MERGED_INTERNAL` through PR #89
- PA-6 status: `MERGED_INTERNAL` through PR #90
- next separately approved polyphonic gate: PA-7 guitar chord/voicing candidates

PA-6 closure does not make polyphonic conversion public. The current public conversion path remains monophonic and unchanged. PA-7 is not authorized by PA-6 closure.

## Current public conversion pipeline

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
physical guitar string/fret candidates
          ↓
deterministic fingering cost model
          ↓
dynamic-programming optimizer
          ↓
CanonicalTabResult 1.0.0
          ↓
shared canonical validator
          ↓
JSON / ASCII TAB / TAB MusicXML
```

The parser does not choose guitar strings or frets. Writers never rerun optimization. `CanonicalTabResult 1.0.0` remains the authoritative downstream TAB source for the current public monophonic path.

## Current supported public musical scope

Supported now:

- uncompressed `.musicxml` / `.xml`
- MusicXML `score-partwise`
- one part
- one staff
- one voice
- monophonic notes and rests
- pitch `step` / `alter` / `octave`
- whole, half, quarter, eighth and 16th note values
- dotted values
- inherited `divisions`
- time signatures
- pickup / implicit measures
- ties
- beam metadata, including normalized hook values
- standard six-string tuning by default
- internally validated custom six-string open-MIDI tuning
- default fret range 0–20

The current public path fails closed for:

- chord/polyphonic note events
- multiple voices
- multiple staves
- multipart scores
- grace notes
- tuplets
- unsupported rhythm values such as 32nd notes
- compressed `.mxl`

The parallel polyphonic path must not obtain support by weakening these rejection rules.

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

Observation, feedback, benchmark, learned/shadow-ranking, path-policy and polyphonic-arrangement modules remain internal.

## Completed deterministic/core foundations

Merged and protected on the current runtime line:

- secure XML normalization and single-pass bounded parsing
- `ProcessingBudget 1.0.0`
- XML / semantic / measure / event resource limits
- deadline, monotonic-clock, cancellation and checkpoint controls
- hostile-input regression coverage
- `ParsedMusicXmlDocument 1.0.0`
- supported monophonic MusicXML semantic projection
- immutable `CanonicalMusicDocument`
- `GuitarConfiguration 1.0.0`
- physical string/fret candidate generation
- explainable deterministic fingering cost model
- deterministic dynamic-programming optimizer
- immutable `CanonicalTabResult 1.0.0`
- bounded canonical-result hostile graph validation
- public deterministic JSON, ASCII TAB and TAB MusicXML writers
- `EngineError 1.0.0` and PEB-1 public error-detection boundary
- `Integration Contract v1`
- internal `PolyphonicSourceModel 1.0.0` source-truth foundation (PA-1)
- internal `SimultaneousEventModel 1.0.0` source simultaneity grouping (PA-3)
- internal `GuitarArrangementPlan 1.0.0` arrangement-decision/provenance representation (PA-4)
- internal `DeterministicVoiceAnalysis 1.0.0` onset-local source voice/register analysis (PA-5)
- internal `DeterministicReductionPlan 1.0.0` deterministic reduction/octave execution plan (PA-6)

These completed core components are not to be reimplemented merely because early architecture documents used different planned filenames.

## Fingering / teacher / learning foundations

Completed internal foundations include:

- `OptimizerObservation 1.0.0`
- `OptimizerObservationDigest 1.0.0`
- `PedagogicalFeatureVector 1.0.0`
- `TeacherFeedback 1.1.0`
- S1 reusable full observation validation
- S2 domain-separated observation content digest
- S3 `ObservationAdmission 1.0.0`
- S3.1 `ObservationAdmissionAtomicAdapter 1.0.0`
- B1 `TeacherFingeringBenchmark 1.0.0`
- B2 `TeacherFingeringBenchmarkEvaluation 1.0.0`
- LR-S0 `ShadowRankingReport 1.0.0` / `ShadowRankingModel 1.0.0`
- LR-S1A `ShadowRankingBenchmarkEvaluation 1.0.0`
- LR-S1B.1 `FingeringPathPolicySnapshot 1.0.0` + digest
- LR-S1B.2a `OptimizerPathPolicyReplay 1.0.0`
- LR-S1B.2b `OptimizerPathPolicyBinding 1.0.0` + binding digest

The learning/ranking line remains non-authoritative. Shadow output cannot change the deterministic optimizer, physical validation, `CanonicalTabResult`, writers or normal public conversion.

B1 remains independent evaluation evidence rather than training data. Current fixed B2 baseline remains 32/32 acceptable, 26/28 preferred, 8/8 case passes, 0 candidate-coverage failures and 0 blocked conversions.

## Teacher correction boundary

`TeacherFeedback 1.1.0` can internally record:

- `accept`
- `override` to a different candidate from the exact validated candidate layer
- `reject`

It does not mutate `CanonicalTabResult` and cannot alter pitch, rhythm or event identity.

Future application work must therefore separate:

1. **Teacher Fingering Correction** — accept/override/reject among already valid physical candidates.
2. **Teacher Score Correction** — a separately versioned, provenance-preserving edit path for pitch/rhythm/notation corrections that regenerates and revalidates derived results.

## alphaTab compatibility status

Verified compatibility evidence currently includes:

- real alphaTab MusicXML import — PASS
- real alphaTab SVG rendering — PASS
- real browser rendering in headless Chrome — PASS
- standard notation + six-line TAB — PASS for the fixture
- fret 10 rendering — PASS
- tie and beam rendering — PASS
- bar/measure cursor — PASS in compatibility test
- beat cursor — PASS in compatibility test

This is compatibility evidence, not yet an application viewer.

alphaTab synthesizer/player readiness remains unverified in the tested alphaTab 1.8.4 + headless Chrome environment because the synth diagnostic encountered an internal recursive runtime error before score/MIDI/SoundFont readiness. Playback must not be described as production-ready yet.

See [MusicXML compatibility](docs/musicxml-compatibility.md).

## MuseScore and PDF boundary

MuseScore is an intended independent compatibility/engraving target, not a deterministic-core dependency or authority.

Planned safe boundary:

```text
CanonicalTabResult
      ↓
TAB MusicXML
      ├─→ alphaTab
      │    ├─ score/TAB viewer
      │    ├─ cursor
      │    └─ playback adapter
      │
      └─→ MuseScore
           ├─ independent MusicXML import validation
           ├─ semantic round-trip
           ├─ professional engraving check
           └─ optional PDF / print adapter
```

MuseScore Studio was not available in the tested local/GitHub environments, so real MuseScore import, MusicXML re-export, semantic round-trip and PDF export remain unverified/not implemented.

PDF must remain a presentation adapter. Failure or absence of PDF rendering must never invalidate an otherwise valid core conversion result.

## Polyphonic MusicXML → Guitar Arrangement

PA-0 documentation/architecture, PA-1 `PolyphonicSourceModel 1.0.0`, PA-2.0 documentation convergence and the PA-2.1 documentation-only projection contract are merged. PA-2.2 red-first vectors were merged through PR #77. PR #78 merged PA-2.3's minimal internal basic note/rest projector, PR #80 merged PA-2.4 `backup` / `forward` cursor semantics, PR #81 merged PA-2.5 source `<chord/>`, multiple-voice and staff 1–2 projection, and PR #83 merged PA-2.6 hostile/budget/deadline/cancellation negative evidence. PA-2.7 full regression/monophonic compatibility and PA-2.8 formal CI/independent review are verified. The PA-2 sequence is closed. PR #85 then merged PA-3 `SimultaneousEventModel 1.0.0`; PR #87 merged PA-4 `GuitarArrangementPlan 1.0.0`; PR #89 merged PA-5 `DeterministicVoiceAnalysis 1.0.0`; and PR #90 merged PA-6 `DeterministicReductionPlan 1.0.0`. All remain internal and preserve the public monophonic path unchanged.

The approved parallel target is:

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
PA-7 guitar chord/voicing candidates
        ↓
PA-8 left-hand model
        ↓
Physical Playability Validator v2
        ↓
deterministic arrangement optimizer
        ↓
teacher-reviewed TAB-result gate
```

PA-1 was recovered, hardened, independently reviewed and rebase-merged through PR #73. Its P2 aggregate-event-budget finding was reproduced red-first and fixed before merge. The recovery branch was deleted only after read-only content-equivalence verification.

Safe PA sequence:

1. PA-0 documentation/architecture — merged
2. PA-1 `PolyphonicSourceModel 1.0` — merged internal
3. PA-2.0 PA-1 → PA-2 documentation convergence — merged documentation
4. PA-2.1 projection contract — merged documentation-only through PR #75; no runtime authority
5. PA-2.2 valid polyphonic red-first fixtures/tests — merged tests-only through PR #77
6. PA-2.3 minimal internal note/rest projector — merged internal through PR #78
7. PA-2.4 `backup` / `forward` cursor semantics — merged internal through PR #80
8. PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection — merged internal through PR #81
9. PA-2.6 hostile/budget/deadline/cancellation negatives — merged tests-only through PR #83
10. PA-2.7 full regression + monophonic compatibility — verified
11. PA-2.8 GitHub Tests + MusicXML Compatibility + independent review — verified
12. PA-3 simultaneous-event/chord source grouping — merged internal through PR #85
13. PA-4 arrangement decision + provenance — merged internal through PR #87
14. PA-5 deterministic melody/bass/voice analysis — merged internal through PR #89
15. PA-6 deterministic reduction/octave rules — merged internal through PR #90
16. PA-7 guitar chord/voicing candidates — next separate gate; requires explicit approval
17. PA-8 left-hand shape/finger assignment/barre/partial-barre
18. PA-9 Physical Playability Validator v2
19. PA-10 canonical v1/v2 compatibility review
20. PA-11 teacher-approved arrangement benchmark
21. PA-12 internal polyphonic E2E + monophonic compatibility
22. PA-13 separately approved public arrangement API
23. PA-14 ScoreMosaic/SesliTab adapter integration

Completion of PA-6 does not authorize PA-7 automatically.

See [PA-5 + PA-6 Closure](docs/pa-5-pa-6-closure.md), [PA-5 Deterministic Voice Analysis Contract](docs/pa-5-deterministic-voice-analysis-contract.md), [PA-6 Deterministic Reduction/Octave Contract](docs/pa-6-deterministic-reduction-octave-contract.md) and [Polyphonic Guitar Arrangement Foundation](docs/polyphonic-guitar-arrangement-foundation.md).

## Planned musical-notation coverage work

The current supported rhythm/tie/beam scope is verified. The following remain separate future notation gates and must not be silently accepted by weakening validation:

- slur / legato semantics
- grace notes, including acciaccatura/appoggiatura rules
- tuplets
- 32nd and later advanced rhythm values
- articulations such as staccato, accent and tenuto
- ornaments such as trill, mordent and turn
- fermata and other separately reviewed expressive notation

A future notation-coverage contract should explicitly version what is parsed, preserved, rejected, rendered and round-tripped.

## Application / presentation roadmap

The repository does not currently provide a production application UI. Planned application work remains downstream of the deterministic core.

Target application capabilities:

- MusicXML open/preflight/convert flow
- standard notation + TAB viewer
- measure/bar and beat cursor
- Play / Pause / Stop controls after playback evidence is stable
- error/warning presentation based on stable engine codes
- selected-note and alternate-fingering inspector
- teacher fingering correction panel
- separately controlled teacher score-correction panel
- JSON / ASCII TAB / MusicXML export center
- MuseScore-backed optional PDF generation
- in-app PDF preview, zoom and page navigation
- PDF print/download/share
- project persistence / reopen
- full application E2E

Application, renderer, editor and persistence layers must not directly mutate authoritative canonical data or bypass physical validation.

## Safe development order — 2026-08-13

Current controlled order:

1. Documentation Convergence — completed
2. G0.1 administrator-bypass governance hardening — completed
3. historical branch inventory / orphan-work audit — completed
4. PA-1 recovery audit and closure — completed
5. PA-2.0 PA-1 → PA-2 documentation convergence — completed
6. PA-2.1 projection contract — merged documentation-only through PR #75; no runtime authority
7. PA-2.2 valid polyphonic red-first fixtures/tests — completed tests-only through PR #77
8. PA-2.3 minimal internal note/rest projector — completed through PR #78
9. PA-2.4 cursor semantics — completed through PR #80
10. PA-2.5 chord/multiple-voice/staff-2 projection — completed through PR #81
11. PA-2.6 hostile/budget/deadline/cancellation negatives — completed tests-only through PR #83
12. PA-2.7 full regression + monophonic compatibility — verified
13. PA-2.8 GitHub CI + independent review — verified; PA-2 sequence closed
14. PA-3 simultaneous-event/chord source grouping — completed through PR #85
15. PA-4 arrangement decision + provenance — completed through PR #87
16. PA-5 deterministic melody/bass/voice analysis — completed through PR #89
17. PA-6 deterministic reduction/octave rules — completed through PR #90
18. PA-7 guitar chord/voicing candidates — next separately approved polyphonic gate
19. Musical Notation Coverage contract
20. MuseScore semantic compatibility gate
21. independent real-world MusicXML E2E fixture gate
22. application/presentation architecture contract
23. alphaTab application viewer
24. measure/beat cursor integration
25. playback adapter + Play/Pause/Stop after synth evidence
26. teacher fingering correction UI
27. teacher score-correction contract/UI
28. export center
29. MuseScore/PDF adapter
30. PDF viewer / print / share
31. save/project persistence
32. application E2E
33. continue PA-7…PA-14 only after their own approved prerequisites and gates
34. production learning/training only after durable storage + privacy/consent/lawful-use prerequisites

Each runtime/high-risk package continues to require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and separate merge approval.

## Governance and unresolved prerequisites

- `main` is protected.
- required Node/compatibility checks are configured.
- third-party GitHub Actions remain pinned to immutable SHAs.
- G0.1 administrator-bypass hardening is completed.
- historical branch audit is completed; cleanup remains a separate action per branch after exact classification.
- the PA-1 recovery branch was removed only after successful merge and content-equivalence verification.
- no live feedback/research dataset pipeline is authorized.
- no learned production selector is authorized.

## Project boundaries

This repository does not directly perform:

- PDF/image OMR
- Audiveris execution
- direct SesliTab/ScoreMosaic application behavior
- HTTP service behavior
- production UI/PWA/mobile behavior

Those systems connect through explicit adapters/contracts.

## Documentation source-of-truth order

When documents disagree, use:

1. merged runtime code/tests/workflows/package metadata on `main`
2. versioned runtime contract modules under `src/`
3. applicable versioned contract documents under `docs/`
4. [PA-5 + PA-6 Closure](docs/pa-5-pa-6-closure.md)
5. [Current implementation status](docs/current-status.md)
6. [Package and verification status](docs/package-status.md)
7. this README
8. older historical/planning documents such as `DATA-CONTRACT.md` or early MVP structure examples

`docs/DATA-CONTRACT.md` is explicitly deprecated as a current runtime contract.

## Development

Requirements: Node.js 18+ and npm.

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.