# Package and Verification Status

This document records the current package surface, strongest verified runtime evidence and the separately planned capability tracks. It distinguishes merged runtime behavior from compatibility evidence, unmerged branch work and future product architecture.

## Snapshot — 2026-08-10

- runtime baseline reviewed before this docs-only convergence: `05c3a59e1f615417d637a6ae71e3e42d552ffca5`
- latest merged runtime feature: PR #71 — LR-S1B.2b Optimizer Path-Policy Binding + Binding Digest
- PR #71 merge commit: `05c3a59e1f615417d637a6ae71e3e42d552ffca5`
- post-merge Tests #464: PASS on Node.js 18 / 20 / 22
- GitHub repository visibility at the 2026-08-10 convergence review: `public`
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
- PA-1: real unmerged work exists and requires recovery/review before merge
- application UI / PDF / production playback: not implemented

GitHub repository visibility and npm/package publication state are separate controls. A `public` GitHub repository does **not** change `package.json` `private: true`, does not publish the package to npm and does not create a package release.

A later documentation-only merge may advance `main` while leaving this runtime baseline unchanged.

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

The following remain intentionally internal: EngineError/domain subclasses, GuitarConfiguration metadata, Integration Contract metadata, observation/digest/feature/feedback/admission modules, B1/B2 benchmark/evaluation components, LR shadow/path-policy components and future polyphonic-arrangement components.

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
| PA-1 PolyphonicSourceModel work | `UNMERGED_WORK_EXISTS` |
| PA-2+ polyphonic arrangement runtime | `NOT_IMPLEMENTED` |
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

PA-0 is merged architecture/documentation and adds no current public polyphonic runtime.

The future branch point remains after safe immutable `ParsedMusicXmlDocument 1.0.0`:

```text
ParsedMusicXmlDocument 1.0.0
  ├─ current monophonic projection → current deterministic TAB core
  └─ future polyphonic projection → PolyphonicSourceModel
                                    ↓
                              GuitarArrangementPlan
                                    ↓
                              guitar-compatible score
                                    ↓
                              chord / left-hand model
                                    ↓
                              Physical Playability Validator v2
```

`CanonicalTabResult 1.0.0` remains unchanged in early PA work.

### PA-1 repository state

Real PA-1 work exists but is not merged:

- branch: `feature/pa-1-polyphonic-source-model-v1`
- reviewed head: `86d3c35b6c6af42f6e3608c03a60dfc813f8e7ff`
- three unique PA-1 commits/fileset exists
- at the convergence review the branch is 3 commits ahead and 24 commits behind current `main`

It must be recovered/reviewed against current `main` before any merge and must not be deleted as routine stale-branch cleanup.

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

## Controlled next sequence — 2026-08-10

### Stabilization first

1. Documentation Convergence
2. G0.1 administrator enforcement hardening
3. historical branch inventory / orphan-work audit
4. PA-1 recovery/review/closure

### Compatibility and notation foundations

5. Musical Notation Coverage contract
6. MuseScore semantic compatibility gate
7. independent real-world MusicXML E2E fixture gate

### Application/presentation track

8. Application/Presentation architecture contract
9. alphaTab application viewer
10. application measure/beat cursor
11. playback adapter + Play/Pause/Stop after synth evidence
12. Teacher Fingering Correction UI
13. Teacher Score Correction contract/UI
14. export center
15. MuseScore/PDF adapter
16. PDF viewer / print / download / share
17. project persistence
18. full application E2E

### Polyphonic arrangement track

19. continue PA-2 through PA-14 in their approved order after PA-1 closure

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
- administrator enforcement remains `GOVERNANCE_OPEN` because required-check enforcement is recorded as `non_admins`
- branch cleanup is separate from feature work and requires read-only merged/unmerged/unique-commit classification first

## Evidence limitations

- passing tests do not prove compatibility with every MusicXML producer
- alphaTab compatibility evidence does not equal a production application
- successful alphaTab rendering does not prove production synth/playback readiness
- no current test proves MuseScore semantic round-trip
- no current test proves production PDF generation
- PA-1 branch work does not make polyphonic runtime available on `main`
- B1/B2/LR completion does not authorize live training data or production learned selection
- content digests do not prove trusted producer authenticity
- no package release is claimed

## Reproduction commands

```bash
npm ci --ignore-scripts
npm test
```

External compatibility checks require their documented environments/workflows.