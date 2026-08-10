# MusicXML to Guitar TAB Engine

A standalone, deterministic engine that converts the currently supported MusicXML scope into playable six-string guitar tablature.

AI agents and development tools should begin with [AI_CONTEXT.md](AI_CONTEXT.md).

## Verified runtime baseline — 2026-08-10

The runtime baseline reviewed for this documentation convergence is:

- `main` runtime head before this docs-only convergence: `05c3a59e1f615417d637a6ae71e3e42d552ffca5`
- latest merged runtime feature: PR #71 — LR-S1B.2b Optimizer Path-Policy Binding + Binding Digest
- PR #71 merge commit: `05c3a59e1f615417d637a6ae71e3e42d552ffca5`
- post-merge Tests #464: PASS on Node.js 18 / 20 / 22
- package version: `0.1.0`
- package metadata: `private: true`, `UNLICENSED`
- current canonical TAB contract: `CanonicalTabResult 1.0.0`
- current internal error contract: `EngineError 1.0.0`

This snapshot records the current runtime truth. A later documentation-only merge may advance the `main` commit without changing runtime behavior.

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

The planned polyphonic path must not obtain support by weakening these rejection rules.

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

PA-0 documentation/architecture is merged. The public monophonic path remains unchanged.

The approved parallel target is:

```text
Polyphonic / piano MusicXML
        ↓
XML Safety + ProcessingBudget
        ↓
ParsedMusicXmlDocument 1.0.0
        ↓
PolyphonicSourceModel
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

PA-1 has real unmerged work on `feature/pa-1-polyphonic-source-model-v1` at `86d3c35b6c6af42f6e3608c03a60dfc813f8e7ff`. At the 2026-08-10 convergence review that branch is diverged from current `main` and must be re-audited/recovered before any merge. It is not current public runtime capability.

Safe PA sequence:

1. PA-0 documentation/architecture — merged
2. PA-1 `PolyphonicSourceModel 1.0` — unmerged work; recovery/review required
3. PA-2 parallel polyphonic projection
4. PA-3 simultaneous-event/chord contract
5. PA-4 arrangement decision + provenance
6. PA-5 deterministic melody/bass/voice analysis
7. PA-6 deterministic reduction/octave rules
8. PA-7 guitar chord/voicing candidates
9. PA-8 left-hand shape/finger assignment/barre/partial-barre
10. PA-9 Physical Playability Validator v2
11. PA-10 canonical v1/v2 compatibility review
12. PA-11 teacher-approved arrangement benchmark
13. PA-12 internal polyphonic E2E + monophonic compatibility
14. PA-13 separately approved public arrangement API
15. PA-14 ScoreMosaic/SesliTab adapter integration

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

## Safe development order — 2026-08-10

Current controlled order:

1. Documentation Convergence
2. G0.1 administrator-bypass governance hardening
3. historical branch inventory / orphan-work audit
4. PA-1 recovery audit and closure
5. musical-notation coverage contract
6. MuseScore semantic compatibility gate
7. independent real-world MusicXML E2E fixture gate
8. application/presentation architecture contract
9. alphaTab application viewer
10. measure/beat cursor integration
11. playback adapter + Play/Pause/Stop after synth evidence
12. teacher fingering correction UI
13. teacher score-correction contract/UI
14. export center
15. MuseScore/PDF adapter
16. PDF viewer / print / share
17. save/project persistence
18. application E2E
19. continue PA-2…PA-14 in order
20. production learning/training only after durable storage + privacy/consent/lawful-use prerequisites

Each runtime/high-risk package continues to require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and separate merge approval.

## Governance and unresolved prerequisites

- `main` is protected.
- required Node/compatibility checks are configured.
- third-party GitHub Actions remain pinned to immutable SHAs.
- G0.1 remains open because required-check enforcement is currently recorded as `non_admins`; administrator-bypass hardening is a separate repository-settings gate.
- historical branch cleanup remains separate from feature development; unmerged PA-1 work must not be deleted as cleanup.
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
