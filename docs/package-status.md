# Package and Verification Status

This document records the current package surface, strongest verified runtime evidence and the separately planned capability tracks. It distinguishes merged runtime behavior from compatibility evidence, unmerged branch work and future product architecture.

## Snapshot — 2026-08-12

- PA-3 closure baseline on `main`: `912ccf5f552ed0a5b21c2225266b95c421ff0dfd`
- closure Git tree: `2e16564ecf30c563e54ab3031a28d8858cc4d271`
- latest merged runtime-changing feature: PR #85 — PA-3 internal `SimultaneousEventModel 1.0.0` source grouping
- PA-2.6 hostile/budget/deadline/cancellation negatives: PR #83 — tests-only, rebase-merged on 2026-08-12
- PA-2.7 full regression + monophonic compatibility: `VERIFIED`
- PA-2.8 GitHub CI + independent review: `VERIFIED`; no P1/P2 blocker found
- PA-2 sequence: `CLOSED`
- PA-3 simultaneous-event source grouping: PR #85 — rebase-merged on 2026-08-12
- PA-3 exact-head Tests #622: `SUCCESS` on Node.js 18/20/22
- PA-3 exact-head MusicXML Compatibility #442: `SUCCESS`
- PA-3 post-merge Tests #623 on `main`: `SUCCESS`
- PA-3 independent review: no P1/P2 blocker found
- PA-2.0 documentation convergence: PR #74 — rebase-merged on 2026-08-11
- PA-2.1 projection contract: PR #75 — documentation-only, rebase-merged on 2026-08-12; no runtime authority created
- GitHub repository visibility: `public`
- package name: `musicxml-to-guitar-tab-engine`
- package version: `0.1.0`
- npm/package publication guard: `private: true`
- license metadata: `UNLICENSED`
- Node.js engine: `>=18`
- runtime dependency: `saxes@6.0.0`
- canonical result: `CanonicalTabResult 1.0.0`
- B1 benchmark: `TeacherFingeringBenchmark 1.0.0`, fixed/teacher-approved/evaluation-only
- B2 harness: `TeacherFingeringBenchmarkEvaluation 1.0.0`, deterministic evaluation-only
- LR-S0 through LR-S1B.2b: merged internal, no production learned-selection authority
- PA-0: merged documentation-only polyphonic arrangement architecture
- PA-1 `PolyphonicSourceModel 1.0.0`: merged internal source-truth foundation
- PA-2.0 documentation convergence: merged documentation
- PA-2.1 projection contract: merged documentation-only through PR #75
- PA-2.2 valid polyphonic red-first fixtures/tests: merged tests-only through PR #77
- PA-2.3 minimal internal basic note/rest projector: merged through PR #78
- PA-2.4 `backup` / `forward` cursor semantics: merged through PR #80
- PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection: merged through PR #81
- PA-2.6 hostile/budget/deadline/cancellation negatives: merged tests-only through PR #83
- PA-2.7/PA-2.8 verification gates: verified
- PA-3 `SimultaneousEventModel 1.0.0`: merged internal through PR #85
- next separately approved polyphonic gate: PA-4 arrangement-decision + provenance contract
- application UI / PDF / production playback: not implemented
- real uploaded-file PA-3 E2E: not executed

GitHub repository visibility and npm/package publication state are separate controls. A `public` GitHub repository does **not** change `package.json` `private: true`, does not publish the package to npm and does not create a package release.

PA-3 closure does not create a public polyphonic API or alter the current public monophonic conversion boundary. PA-4 is not authorized by PA-3 completion.

## Package metadata

| Field | Value |
|---|---|
| GitHub repository visibility | `public` |
| `name` | `musicxml-to-guitar-tab-engine` |
| `version` | `0.1.0` |
| `private` | `true` — npm/package publication guard; distinct from GitHub repository visibility |
| `main` | `src/index.js` |
| `test` | `node --test` |
| Node.js engine | `>=18` |
| Runtime dependency | `saxes@6.0.0` |
| License | `UNLICENSED` |

No public package release is claimed.

## Current package-root public API

`src/index.js` exposes exactly:

| Export | Purpose |
|---|---|
| `ENGINE_ERROR_CONTRACT_VERSION` | Public EngineError contract version identifier |
| `FretboardError` | Existing public fretboard error class |
| `PREFLIGHT_STATUS` | Public preflight status constants |
| `convertMusicXmlToCanonicalTab` | Public supported MusicXML-to-canonical-TAB conversion |
| `getPositionCandidates` | Physical guitar candidate helper |
| `isEngineError` | Public nominal detector for caught package errors |
| `positionToMidi` | Guitar position-to-MIDI helper |
| `preflightMusicXml` | Public MusicXML preflight API |
| `serializeCanonicalTabResult` | Deterministic canonical JSON serializer |
| `serializeCanonicalTabResultToAscii` | Deterministic six-string ASCII TAB serializer |
| `serializeCanonicalTabResultToMusicXml` | Deterministic TAB MusicXML serializer |
| `validateMidi` | MIDI validation helper |

The following remain intentionally internal: EngineError/domain subclasses, GuitarConfiguration metadata, Integration Contract metadata, observation/digest/feature/feedback/admission modules, B1/B2 benchmark/evaluation components, LR shadow/path-policy components and polyphonic-arrangement foundations including `PolyphonicSourceModel 1.0.0` and `SimultaneousEventModel 1.0.0`.

## Package capability status

| Capability | Status |
|---|---|
| XML normalization and safety | `VERIFIED_ON_MAIN` |
| `ProcessingBudget 1.0.0` | `VERIFIED_ON_MAIN` |
| XML/measure/event/deadline/cancellation limits | `VERIFIED_ON_MAIN` |
| Hostile-input regression corpus | `VERIFIED_ON_MAIN` |
| `ParsedMusicXmlDocument 1.0.0` | `VERIFIED_ON_MAIN` |
| Current supported MusicXML validation/parser path | `VERIFIED_ON_MAIN` |
| Shared public monophonic semantic projection | `VERIFIED_ON_MAIN` |
| `CanonicalMusicDocument` | `VERIFIED_ON_MAIN` |
| Guitar configuration foundation | `VERIFIED_ON_MAIN_INTERNAL` |
| Fretboard/playability | `VERIFIED_ON_MAIN` |
| Deterministic fingering cost model | `VERIFIED_ON_MAIN` |
| Deterministic fingering optimizer | `VERIFIED_ON_MAIN` |
| `CanonicalTabResult 1.0.0` | `VERIFIED_ON_MAIN` |
| Canonical validator | `VERIFIED_ON_MAIN` |
| Public JSON / ASCII / TAB MusicXML writers | `VERIFIED_ON_MAIN` |
| EngineError / PEB-1 | `VERIFIED_ON_MAIN` |
| S1/S2 observation integrity | `VERIFIED_ON_MAIN_INTERNAL` |
| TeacherFeedback 1.1.0 | `VERIFIED_ON_MAIN_INTERNAL` |
| S3/S3.1 admission foundations | `VERIFIED_ON_MAIN_INTERNAL` |
| B1 fixed teacher benchmark | `VERIFIED_ON_MAIN_INTERNAL` |
| B2 deterministic evaluation harness | `VERIFIED_ON_MAIN_INTERNAL` |
| LR-S0 shadow ranking foundation | `VERIFIED_ON_MAIN_INTERNAL_SHADOW_ONLY` |
| LR-S1A shadow benchmark evaluation | `VERIFIED_ON_MAIN_INTERNAL_SHADOW_ONLY` |
| LR-S1B.1 path-policy snapshot/digest | `VERIFIED_ON_MAIN_INTERNAL` |
| LR-S1B.2a semantic replay verifier | `VERIFIED_ON_MAIN_INTERNAL` |
| LR-S1B.2b path-policy binding/digest | `VERIFIED_ON_MAIN_INTERNAL` |
| PA-1 `PolyphonicSourceModel 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` |
| PA-2.0 documentation convergence | `VERIFIED_ON_MAIN_DOCUMENTATION` |
| PA-2.1 projection contract | `MERGED_DOCUMENTATION_ONLY` — PR #75 merged; no runtime authority |
| PA-2.2 valid polyphonic red-first fixtures/tests | `MERGED_TESTS_ONLY` — PR #77 |
| PA-2.3 minimal internal basic note/rest projection | `VERIFIED_ON_MAIN_INTERNAL` — PR #78 |
| PA-2.4 `backup` / `forward` cursor semantics | `VERIFIED_ON_MAIN_INTERNAL` — PR #80 |
| PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection | `VERIFIED_ON_MAIN_INTERNAL` — PR #81 |
| PA-2.6 hostile/budget/deadline/cancellation negatives | `MERGED_TESTS_ONLY` — PR #83; no production-code change |
| PA-2.7 full regression + monophonic compatibility | `VERIFIED` |
| PA-2.8 GitHub CI + independent review | `VERIFIED` — PA-2 closed |
| PA-3 `SimultaneousEventModel 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #85 |
| PA-4+ polyphonic arrangement runtime | `NOT_IMPLEMENTED` |
| alphaTab MusicXML import | `COMPATIBILITY_VERIFIED` |
| alphaTab SVG rendering | `COMPATIBILITY_VERIFIED` |
| alphaTab browser rendering/cursor | `COMPATIBILITY_VERIFIED` |
| alphaTab production playback | `NOT_VERIFIED` |
| MuseScore real import/re-export | `NOT_EXECUTED` |
| MuseScore semantic round-trip | `NOT_EXECUTED` |
| Production PDF adapter | `NOT_IMPLEMENTED` |
| Application score/TAB viewer | `NOT_IMPLEMENTED` |
| Application measure/beat cursor | `NOT_IMPLEMENTED` |
| Teacher correction UI | `NOT_IMPLEMENTED` |
| Export/share application layer | `NOT_IMPLEMENTED` |
| Project persistence | `NOT_IMPLEMENTED` |
| Concrete production durable/atomic admission store | `NOT_IMPLEMENTED` |
| Versioned research privacy/consent/lawful-use boundary | `NOT_IMPLEMENTED` |
| Live TeacherFeedback research/training dataset pipeline | `BLOCKED` |
| Real learned ranking training/model registry | `NOT_IMPLEMENTED` |
| Production learned selection | `BLOCKED` |

## Current public musical compatibility boundary

The public package currently supports the documented one-part, one-staff, one-voice monophonic `score-partwise` scope.

Verified musical coverage includes:

- notes and rests
- pitch step/alter/octave
- whole, half, quarter, eighth and 16th note values
- dots
- divisions
- time signatures
- pickup/implicit measures
- tie start/stop
- beam metadata including normalized hook values

Current public fail-closed boundaries include:

- chords / simultaneous note structures
- `backup` / `forward`
- multiple voices
- multiple staves
- multipart scores
- grace notes
- tuplets
- unsupported values such as 32nd rhythms
- compressed `.mxl`

Future notation or polyphonic work must add support explicitly and must not obtain compatibility by deleting rejection checks.

## Output status

| Output | Package-root/core availability | Application availability |
|---|---|---|
| Canonical JavaScript result | Public through current conversion API | no application shell yet |
| JSON text | Public | no download/share UI yet |
| ASCII TAB | Public | no download/share UI yet |
| TAB MusicXML | Public | no download/share UI yet |
| alphaTab viewer | Compatibility evidence only | not implemented as product UI |
| MuseScore rendering | Not a core dependency | not implemented |
| PDF | Not implemented in core | not implemented |
| PDF preview/print/share | n/a | not implemented |
| Polyphonic source model | Internal only | no application integration |
| Simultaneous source-event model | Internal only | no application integration |
| Polyphonic arrangement result | Not implemented | not implemented |
| Chord-aware canonical result | Not implemented | not implemented |

All current writers consume validated `CanonicalTabResult 1.0.0` and do not regenerate candidates or rerun optimization.

## B1/B2 package status

B1 remains fixed independent evaluation infrastructure and is not exported from `src/index.js`.

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

## LR package status

### LR-S0

Present on `main`, internal and shadow-only:

- `ShadowRankingReport 1.0.0`
- `ShadowRankingModel 1.0.0`
- deterministic shadow suggestions over validated candidate sets
- internally recomputed pedagogical features
- synthetic hand-authored reference model
- mandatory `mode: "shadow"`, `authority: "none"`

It does not change deterministic optimizer output, current `CanonicalTabResult`, package exports, normal conversion, writers, benchmark fixtures or physical validation.

### LR-S1A

Merged internal `ShadowRankingBenchmarkEvaluation 1.0.0`:

- evaluates shadow output against fixed B1
- preserves B2 deterministic output as authoritative
- records shadow/baseline divergence evidence
- no model training or tuning

### LR-S1B.1

Merged internal `FingeringPathPolicySnapshot 1.0.0` + digest:

- binds normalized fingering path policy content
- rejects hostile/ambiguous shape and non-finite values fail-closed
- content digest is not producer authentication

### LR-S1B.2a

Merged internal `OptimizerPathPolicyReplay 1.0.0`:

- validates observation/policy digests
- reconstructs candidate layers from observation
- replays the deterministic optimizer under supplied policy
- verifies path/cost/hard-limit compatibility
- does not establish historical producer authenticity

### LR-S1B.2b

Merged internal `OptimizerPathPolicyBinding 1.0.0` + digest:

- creator requires successful semantic replay verification
- stores exact observation digest, policy snapshot/digest, optimizer identity, note count and replay metadata
- binding digest provides deterministic content integrity only
- `authority: none`
- stored binding alone does not eliminate the need for original observation + replay when an authority-bearing future consumer reads untrusted persistence

No LR stage currently authorizes production learned selection.

## TeacherFeedback package boundary

`TeacherFeedback 1.1.0` remains internal.

It records teacher judgment over already generated physically valid candidate decisions:

- `accept`
- `override` to an exact same-event candidate from the observed candidate layer
- `reject`

It cannot alter pitch/rhythm/event identity, generate new candidates, mutate `CanonicalTabResult`, bypass physical validation or authorize model training.

Future application work must separate a fingering-correction panel from a future score-correction/edit contract.

## alphaTab compatibility status

The real compatibility suite verifies:

- MusicXML import
- SVG rendering
- browser rendering in headless Chrome
- standard notation + six-line TAB
- fret 10 rendering
- ties and beams
- bar/measure cursor
- beat cursor

The tested alphaTab 1.8.4 synthesizer path remains unverified because an internal recursive `loadedMidiInfo` runtime error occurred before score/MIDI/SoundFont/player readiness. Playback remains a separate future application/compatibility gate.

## MuseScore compatibility status

MuseScore Studio was not installed in the tested local or GitHub-hosted environments. Therefore the package currently has no executed evidence for:

- real MuseScore MusicXML import
- MuseScore MusicXML re-export
- semantic round-trip
- MuseScore PDF export

Planned round-trip validation must compare musical semantics rather than XML bytes. At minimum compare measures, notes/rests, pitch/octave, duration, dots, ties, beams, staff structure, string/fret, tuning and time signatures.

MuseScore is an independent compatibility/engraving/PDF adapter target, not deterministic-core authority.

## PA package boundary

PA-0 architecture/documentation and PA-1 `PolyphonicSourceModel 1.0.0` are merged. PA-2.0 documentation convergence and PA-2.1's documentation-only projection contract are merged. PA-2.2 red-first vectors were merged tests-only through PR #77. PA-2.3's minimal internal basic note/rest projector was merged through PR #78, PA-2.4 `backup` / `forward` cursor semantics through PR #80, PA-2.5 source `<chord/>`, multiple-voice and staff-2 projection through PR #81, and PA-2.6 hostile/budget/deadline/cancellation negatives through tests-only PR #83. PA-2.7 full regression/monophonic compatibility and PA-2.8 GitHub CI/independent review are verified. PA-2 is closed. PA-3 `SimultaneousEventModel 1.0.0` was then merged internal through PR #85. These add no public polyphonic conversion or package-root API.

The parallel branch point remains after safe immutable `ParsedMusicXmlDocument 1.0.0`:

```text
ParsedMusicXmlDocument 1.0.0
  ├─ current monophonic projection → current deterministic TAB core
  └─ PA-2 runtime projector → PolyphonicSourceModel 1.0.0
                           ↓
                    SimultaneousEventModel 1.0.0
                           ↓
                     PA-4+ arrangement contracts
                           ↓
                     GuitarArrangementPlan
                           ↓
                     guitar-compatible score
                           ↓
                     chord / left-hand model
                           ↓
                     Physical Playability Validator v2
```

PA-2.3 basic note/rest, PA-2.4 `backup` / `forward`, and PA-2.5 chord/multiple-voice/staff-2 slices are merged internal. PA-2.6 is tests-only hardening; PA-2.7/PA-2.8 are verification gates. PA-3 source simultaneity grouping is merged internal and remains non-arranging. PA-4 is the next separate gate and is not authorized by PA-3 closure.

`CanonicalTabResult 1.0.0` remains unchanged.

### PA-1 repository state

PA-1 is merged internal through PR #73. The recovery branch was deleted only after the rebase merge, post-merge Tests #488, and a read-only content-equivalence check between the rebased `main` tree and the former branch tree.

PA-1 does not include PA-3 grouping, arrangement decisions, fingering/barre authority, or package-root API expansion. PA-3 is a later internal source-grouping layer and also does not add arrangement or guitar authority.

## Application / presentation package boundary

The repository currently has no production application shell. Planned downstream capabilities are:

- open/preflight/convert flow
- score + TAB viewer
- measure/beat cursor
- playback controls after stable evidence
- user-facing errors/warnings
- note/fingering inspector
- Teacher Fingering Correction panel
- separate Teacher Score Correction contract/panel
- export center
- MuseScore/PDF adapter
- PDF preview/print/share
- project save/reopen
- application E2E

These are not package-root engine responsibilities and must remain adapter-bound.

## Musical notation future gates

Current verified notation scope must be preserved while future support is added explicitly for:

- slur / legato
- grace-note families
- tuplets
- 32nd and later rhythm values
- articulations
- ornaments
- fermata and other separately reviewed expressive notation

The planned notation contract should define parse, canonical preservation, fail-closed handling, output preservation, renderer evidence and semantic round-trip behavior.

## Controlled next sequence — 2026-08-12

### Completed stabilization

1. Documentation Convergence — completed
2. G0.1 administrator enforcement hardening — completed
3. historical branch inventory / orphan-work audit — completed
4. PA-1 recovery/review/closure — completed
5. PA-2.0 PA-1 → PA-2 documentation convergence — completed
6. PA-2.1 `ParsedMusicXmlDocument` → `PolyphonicSourceModel` projection contract — merged documentation-only through PR #75; no runtime authority

### PA transition gates

7. PA-2.2 valid polyphonic red-first fixtures/tests — completed tests-only through PR #77
8. PA-2.3 minimal internal note/rest projector — completed through PR #78
9. PA-2.4 `backup` / `forward` cursor semantics — completed through PR #80
10. PA-2.5 chord/multiple-voice/staff-2 projection — completed through PR #81
11. PA-2.6 hostile/budget/deadline/cancellation negatives — completed tests-only through PR #83
12. PA-2.7 full regression + monophonic compatibility — verified
13. PA-2.8 GitHub CI + independent review — verified; PA-2 closed
14. PA-3 simultaneous-event/chord source grouping — completed through PR #85
15. PA-4 arrangement-decision + provenance contract — next separately approved gate

### Compatibility and notation foundations

16. Musical Notation Coverage contract
17. MuseScore semantic compatibility gate
18. independent real-world MusicXML E2E fixture gate

### Application/presentation track

19. Application/Presentation architecture contract
20. alphaTab application viewer
21. application measure/beat cursor
22. playback adapter + Play/Pause/Stop after synth evidence
23. Teacher Fingering Correction UI
24. Teacher Score Correction contract/UI
25. export center
26. MuseScore/PDF adapter
27. PDF viewer / print / download / share
28. project persistence
29. full application E2E

### Polyphonic arrangement track

30. continue PA-4 through PA-14 only in their separately approved order after PA-3

### Learning/AI track

Production training remains blocked until:

- concrete durable admission storage
- separately versioned privacy/consent/lawful-use controls
- authorized dataset admission
- real training/model registry
- independent learned evaluation
- shadow-first evidence
- separate production opt-in approval

## CI supply-chain and governance

- third-party workflow actions remain SHA-pinned
- `main` remains protected
- required Node.js 18/20/22 and compatibility contexts are configured
- G0.1 administrator enforcement is completed
- historical branch audit is completed; branch cleanup remains separate per exact classification
- PA-1 recovery branch cleanup is completed after merge + content-equivalence verification

## Evidence limitations

- passing tests do not prove compatibility with every MusicXML producer
- no real uploaded Audiveris/Scarlatti file has been executed through the PA-3 grouping layer as part of this closure
- alphaTab compatibility evidence does not equal a production application
- successful alphaTab rendering does not prove production synth/playback readiness
- no current test proves MuseScore semantic round-trip
- no current test proves production PDF generation
- PA-3 internal source grouping does not make public polyphonic conversion or arrangement available
- B1/B2/LR completion does not authorize live training data or production learned selection
- content digests do not prove trusted producer authenticity
- no package release is claimed

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.