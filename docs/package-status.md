# Package and Verification Status

This document records the current package surface, strongest verified runtime evidence and the separately planned capability tracks. It distinguishes merged runtime behavior from compatibility evidence and future product architecture.

## Snapshot — 2026-08-13

- PA-7 runtime closure baseline on `main`: `1f3dc2cf89efab1e258064b6e76eb51daee4252c`
- runtime closure Git tree: `2458bf228fe02ecb82359417b7bb5016b6c29f82`
- PA-7 closure-record baseline on `main`: `6831047db24d2e69167219844b270533cde8e539`
- latest merged runtime-changing feature: PR #92 — internal `GuitarVoicingCandidateModel 1.0.0`
- PA-2 sequence: `CLOSED`
- PA-3 `SimultaneousEventModel 1.0.0`: merged internal through PR #85
- PA-4 `GuitarArrangementPlan 1.0.0`: merged internal through PR #87
- PA-5 `DeterministicVoiceAnalysis 1.0.0`: merged internal through PR #89
- PA-5 exact-head Tests #640: `SUCCESS` on Node.js 18/20/22
- PA-5 exact-head MusicXML Compatibility #456: `SUCCESS`
- PA-5 post-merge Tests #641: `SUCCESS` on exact `main` SHA `c9cc504558630b48e34c1fb0e0753963b24d181e`
- PA-6 `DeterministicReductionPlan 1.0.0`: merged internal through PR #90
- PA-6 exact-head Tests #645: `SUCCESS` on Node.js 18/20/22
- PA-6 exact-head MusicXML Compatibility #460: `SUCCESS`
- PA-6 post-merge Tests #646: `SUCCESS` on exact `main` SHA `f4055e42d2cd364060e7d99a4efc2add3d8817bd`
- PA-7 `GuitarVoicingCandidateModel 1.0.0`: merged internal through PR #92
- PA-7 exact-head Tests #652: `SUCCESS` on Node.js 18/20/22
- PA-7 exact-head MusicXML Compatibility #465: workflow `SUCCESS`
- PA-7 post-merge Tests #653: `SUCCESS` on exact runtime `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`
- PA-7 closure record: PR #93, documentation-only, merged
- PA-7 closure-record exact-head Tests #654: `SUCCESS`
- PA-7 closure-record exact-head MusicXML Compatibility #466: `SUCCESS`
- PA-7 closure-record post-merge Tests #655: `SUCCESS` on exact `main` SHA `6831047db24d2e69167219844b270533cde8e539`
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
- next separately approved polyphonic gate: **PA-8 left-hand shape/finger/barre/partial-barre model**
- application UI / PDF / production playback: not implemented
- real uploaded-file PA-7 E2E: not executed

GitHub repository visibility and npm/package publication state are separate controls. A `public` GitHub repository does **not** change `package.json` `private: true`, does not publish the package to npm and does not create a package release.

PA-5, PA-6 and PA-7 do not create a public polyphonic API or alter the current public monophonic conversion boundary. PA-8 is not authorized by PA-7 completion or by the PA-7 merge approval.

See [PA-7 Closure](pa-7-closure.md) for exact PA-7 closure evidence and [PA-5 + PA-6 Closure](pa-5-pa-6-closure.md) for the earlier package closures.

## Package metadata

| Field | Value |
|---|---|
| GitHub repository visibility | `public` |
| `name` | `musicxml-to-guitar-tab-engine` |
| `version` | `0.1.0` |
| `private` | `true` — npm/package publication guard; distinct from GitHub visibility |
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

The following remain intentionally internal: EngineError/domain subclasses, GuitarConfiguration metadata, Integration Contract metadata, observation/digest/feature/feedback/admission modules, B1/B2 benchmark/evaluation components, LR shadow/path-policy components and all current polyphonic-arrangement foundations including `PolyphonicSourceModel 1.0.0`, `SimultaneousEventModel 1.0.0`, `GuitarArrangementPlan 1.0.0`, `DeterministicVoiceAnalysis 1.0.0`, `DeterministicReductionPlan 1.0.0` and `GuitarVoicingCandidateModel 1.0.0`.

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
| PA-2.1 projection contract | `MERGED_DOCUMENTATION_ONLY` — PR #75 |
| PA-2.2 valid red-first vectors | `MERGED_TESTS_ONLY` — PR #77 |
| PA-2.3 minimal basic note/rest projection | `VERIFIED_ON_MAIN_INTERNAL` — PR #78 |
| PA-2.4 `backup` / `forward` cursor semantics | `VERIFIED_ON_MAIN_INTERNAL` — PR #80 |
| PA-2.5 chord/multiple voice/staff-2 projection | `VERIFIED_ON_MAIN_INTERNAL` — PR #81 |
| PA-2.6 hostile/budget/deadline/cancellation negatives | `MERGED_TESTS_ONLY` — PR #83 |
| PA-2.7 regression + monophonic compatibility | `VERIFIED` |
| PA-2.8 GitHub CI + independent review | `VERIFIED` — PA-2 closed |
| PA-3 `SimultaneousEventModel 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #85 |
| PA-4 `GuitarArrangementPlan 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #87 |
| PA-5 `DeterministicVoiceAnalysis 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #89 |
| PA-6 `DeterministicReductionPlan 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #90 |
| PA-7 `GuitarVoicingCandidateModel 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #92 |
| PA-8 left-hand shape/finger/barre/partial-barre model | `NOT_STARTED` — separate approval required |
| PA-9+ later polyphonic arrangement gates | `NOT_IMPLEMENTED` |
| Public polyphonic arrangement API | `NOT_IMPLEMENTED` |
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

## PA-5 package boundary

`DeterministicVoiceAnalysis 1.0.0` is internal and source-derived. Its fixed analysis basis is `ONSET_LOCAL_REGISTER_1.0` with role vocabulary:

- `SOLE_NOTE`
- `MELODY_CANDIDATE`
- `BASS_CANDIDATE`
- `INNER_VOICE_CANDIDATE`
- `OUTER_VOICE_AMBIGUOUS`

These are deterministic onset-local register candidates, not semantic melody/bass labels. PA-5 does not execute arrangement decisions, infer phrase/harmony/style, or choose guitar positions.

## PA-6 package boundary

`DeterministicReductionPlan 1.0.0` is internal. It uses:

- policy `STANDARD_GUITAR_REGISTER_20_FRET_1.0`
- fixed standard-tuning/default-0–20-fret global register envelope MIDI 40–84
- tie-break `DOWNWARD_TIE_BREAK_1.0`

Executable PA-6 v1 subset:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- conservative `CHORD_REDUCED`

Deferred/fail-closed:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- `ARPEGGIATED`

The register envelope is not physical-playability proof. PA-6 does not create string/fret/finger/barre/hand-position/chord-voicing authority.

## PA-7 package boundary

`GuitarVoicingCandidateModel 1.0.0` is internal. It uses policy `STANDARD_SIX_STRING_DISTINCT_STRING_1.0`, standard six-string tuning, frets 0–20 and a fixed aggregate candidate ceiling of 10,000.

For simultaneous PA-6 `KEEP` notes, PA-7 deterministically enumerates exact-target-MIDI string/fret alternatives while preserving PA-3 group provenance and PA-6 omission provenance. Each candidate uses distinct guitar strings; more than six active simultaneous notes or no injective string assignment yields zero candidates rather than silent note dropping.

This is not PA-8/PA-9 authority. PA-7 does not assign left-hand fingers, barre/partial-barre, hand position, ergonomic/playability approval, candidate ranking, final voicing selection or public polyphonic output.

## Current public musical compatibility boundary

The public package supports the documented one-part, one-staff, one-voice monophonic `score-partwise` scope.

Verified public musical coverage includes:

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

PA-5/PA-6/PA-7 did not weaken these rejection rules.

## Output status

| Output | Package-root/core availability | Application availability |
|---|---|---|
| Canonical JavaScript result | Public through current monophonic conversion API | no application shell yet |
| JSON text | Public | no download/share UI yet |
| ASCII TAB | Public | no download/share UI yet |
| TAB MusicXML | Public | no download/share UI yet |
| alphaTab viewer | Compatibility evidence only | not implemented as product UI |
| MuseScore rendering | Not a core dependency | not implemented |
| PDF | Not implemented in core | not implemented |
| PDF preview/print/share | n/a | not implemented |
| Polyphonic source model | Internal only | no application integration |
| Simultaneous source-event model | Internal only | no application integration |
| Arrangement decision/provenance plan | Internal only | no application integration |
| Deterministic voice/register analysis | Internal only (`DeterministicVoiceAnalysis 1.0.0`) | no application integration |
| Deterministic reduction/octave plan | Internal only (`DeterministicReductionPlan 1.0.0`) | no application integration |
| Guitar voicing candidates | Internal only (`GuitarVoicingCandidateModel 1.0.0`) | no application integration |
| Left-hand validated polyphonic chord voicing | Not implemented; PA-8+ | not implemented |
| Public executable polyphonic arrangement result | Not implemented | not implemented |
| Chord-aware canonical result | Not implemented; PA-10 review pending | not implemented |

All current public writers consume validated `CanonicalTabResult 1.0.0` and do not regenerate candidates or rerun optimization.

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

## Learning / TeacherFeedback boundary

LR-S0 through LR-S1B.2b remain internal and non-authoritative. Shadow output cannot change deterministic optimizer output, physical validation, current `CanonicalTabResult`, writers or normal conversion.

`TeacherFeedback 1.1.0` records teacher judgment over already-generated physically valid candidate decisions. It cannot alter pitch/rhythm/event identity, generate new candidates, mutate `CanonicalTabResult`, bypass physical validation or authorize model training.

No current LR/feedback stage authorizes production learned selection.

## alphaTab compatibility status

The isolated compatibility suite verifies:

- MusicXML import
- SVG rendering
- browser rendering in headless Chrome
- standard notation + six-line TAB
- fret 10 rendering
- ties and beams
- bar/measure cursor
- beat cursor

The tested alphaTab 1.8.4 synthesizer path remains unverified for production playback due to its headless runtime diagnostic limitation. Compatibility workflow success must not be treated as production playback readiness.

## MuseScore compatibility status

MuseScore Studio was not installed in tested local or GitHub-hosted environments. Therefore there is no executed evidence for real MuseScore MusicXML import, re-export, semantic round-trip or PDF export. MuseScore remains an independent compatibility/engraving/PDF adapter target, not deterministic-core authority.

## PA sequence and package gate

1. PA-1 source truth — merged internal
2. PA-2 projection/hardening/verification — closed
3. PA-3 simultaneity grouping — merged internal through PR #85
4. PA-4 arrangement decision/provenance — merged internal through PR #87
5. PA-5 deterministic voice/register analysis — merged internal through PR #89
6. PA-6 deterministic reduction/octave rules — merged internal through PR #90
7. PA-7 guitar chord/voicing candidates — merged internal through PR #92; closure record PR #93
8. PA-8 left-hand model — **NOT STARTED; next separate approval**
9. PA-9 Physical Playability Validator v2 — future
10. PA-10 canonical compatibility review — future
11. PA-11 benchmark — future
12. PA-12 internal polyphonic E2E — future
13. PA-13 public arrangement API — future/separately approved
14. PA-14 ScoreMosaic/SesliTab adapters — future

Completion of PA-7 does not authorize PA-8.

## Verification caveats

- PA-5 and PA-6 exact-head Compatibility evidence is PR-triggered compatibility evidence.
- PA-5 post-merge evidence is Tests #641 on exact merged `main` SHA.
- PA-6 post-merge evidence is Tests #646 on exact merged `main` SHA.
- PA-7 exact-head Compatibility #465 and closure-record Compatibility #466 are PR-triggered compatibility evidence.
- PA-7 runtime post-merge evidence is Tests #653 on exact merged runtime `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`.
- PA-7 closure-record post-merge evidence is Tests #655 on exact `main` SHA `6831047db24d2e69167219844b270533cde8e539`.
- No post-merge MusicXML Compatibility run is claimed for PA-7 runtime or closure-record merge.
- The alphaTab synth diagnostic does not establish production playback readiness even when the Compatibility workflow concludes `SUCCESS`.
- No real previously uploaded Audiveris/Scarlatti MusicXML file was executed through PA-7 as genuine runtime E2E evidence.
- No public polyphonic conversion authority is claimed.
- Branch cleanup remains separately gated.
