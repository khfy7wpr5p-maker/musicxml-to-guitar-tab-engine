# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts the currently supported MusicXML scope into playable six-string guitar tablature.

AI agents and development tools should begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Verified runtime baseline — 2026-08-11

The authoritative `main` baseline before PA-2.1 closure is:

- current `main` head: `012e66898ba584fad79dd8b31bf6f76feb0a8f72`
- latest merged runtime feature: PR #73 — PA-1 `PolyphonicSourceModel 1.0.0` internal source-truth foundation
- PA-2.0 documentation convergence: PR #74 — rebase-merged on 2026-08-11
- post-merge Tests #490: PASS on `main`
- package version: `0.1.0`
- package metadata: `private: true`, `UNLICENSED`
- current canonical TAB contract: `CanonicalTabResult 1.0.0`
- current internal error contract: `EngineError 1.0.0`
- PA-1 status: `MERGED_INTERNAL`
- PA-2.1 status: documentation-only projection contract; PR #75 is the closure vehicle and creates no runtime authority
- PA-2.2 status: next separate tests-only gate requiring explicit approval after PA-2.1 closure
- PA-2 runtime projection: `NOT_IMPLEMENTED`; runtime implementation begins no earlier than PA-2.3

PA-1 does not make polyphonic conversion public. The current public conversion path remains monophonic and unchanged.

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

PA-0 documentation/architecture and PA-1 `PolyphonicSourceModel 1.0.0` are merged. PA-2.0 documentation convergence is also merged. PA-2.1 is the documentation-only projection contract carried by PR #75; closing PA-2.1 creates no runtime authority. PA-2.2 is the next separate tests-only gate and requires explicit approval after PA-2.1 closure. PA-2 runtime projection remains `NOT_IMPLEMENTED` and begins no earlier than PA-2.3. The public monophonic path remains unchanged.

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
source-score analysis
        ↓
GuitarArrangementPlan
        ↓
guitar-compatible score
        ↓
chord / voicing / left-hand model
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
4. PA-2.1 projection contract — documentation-only; PR #75 is the closure vehicle and creates no runtime authority
5. PA-2.2 valid polyphonic red-first fixtures/tests — separate next gate requiring explicit approval after PA-2.1 closure
6. PA-2.3 minimal internal note/rest projector
7. PA-2.4 `backup` / `forward` cursor semantics
8. PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection
9. PA-2.6 hostile/budget/deadline/cancellation negatives
10. PA-2.7 full regression + monophonic compatibility
11. PA-2.8 GitHub Tests + MusicXML Compatibility + independent review
12. PA-3 simultaneous-event/chord contract
13. PA-4 arrangement decision + provenance
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

Completion of one PA-2.x gate does not authorize the next gate automatically.

See [Polyphonic Guitar Arrangement Foundation](docs/polyphonic-guitar-arrangement-foundation.md).

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

## Safe development order — 2026-08-11

Current controlled order:

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
21. save/project persistence
22. application E2E
23. continue PA-3…PA-14 only after PA-2.8 closure and in their approved order
24. production learning/training only after durable storage + privacy/consent/lawful-use prerequisites

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
4. [Current implementation status](docs/current-status.md)
5. [Package and verification status](docs/package-status.md)
6. this README
7. older historical/planning documents such as `DATA-CONTRACT.md` or early MVP structure examples

`docs/DATA-CONTRACT.md` is explicitly deprecated as a current runtime contract.

## Development

Requirements: Node.js 18+ and npm.

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.
