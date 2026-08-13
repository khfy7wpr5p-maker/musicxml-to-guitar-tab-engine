# Package and Verification Status

This document records the current package surface, strongest verified runtime evidence and separately gated capability tracks. It distinguishes merged runtime behavior from compatibility evidence and future product architecture.

## Snapshot — 2026-08-13

- authoritative branch: `main`
- package-status convergence base on `main`: `c87342793e389b58a3b80ab0ebff2b3d432d5199`
- latest merged runtime-changing feature: PR #98 — internal `PhysicalPlayabilityValidation 2.0.0`
- PA-9 runtime merge baseline on `main`: `9869b7ecf65c9c76da3a25c032f3026a48bce201`
- PA-9 closure-record baseline on `main`: `4410f73c03fd08a9af635351e64181da597f3a4d`
- PA-10.0 canonical v1/v2 compatibility boundary: merged documentation-only through PR #101
- PA-10.1 canonical v1 compatibility characterization: merged tests-only through PR #102
- PA-10.2 exact polyphonic canonical data requirements: merged documentation-only through PR #103
- PA-10.2 exact-head Tests #681: `SUCCESS`
- PA-10.2 exact-head MusicXML Compatibility #483: `SUCCESS`
- PA-10.2 post-merge Tests #682 on exact `main` SHA `93c339195bbce7070d7b40c254a9380380b3edc6`: `SUCCESS`
- central PA-10 status convergence: merged documentation-only through PR #104
- PR #104 post-merge Tests #684 on exact `main` SHA `c87342793e389b58a3b80ab0ebff2b3d432d5199`: `SUCCESS`
- GitHub repository visibility: `public`
- package name: `musicxml-to-guitar-tab-engine`
- package version: `0.1.0`
- npm/package publication guard: `private: true`
- license metadata: `UNLICENSED`
- Node.js engine: `>=18`
- runtime dependency: `saxes@6.0.0`
- public canonical result: `CanonicalTabResult 1.0.0`
- B1 benchmark: `TeacherFingeringBenchmark 1.0.0`, fixed/teacher-approved/evaluation-only
- B2 harness: `TeacherFingeringBenchmarkEvaluation 1.0.0`, deterministic evaluation-only
- LR-S0 through LR-S1B.2b: merged internal, no production learned-selection authority
- PA-10 status: `IN_PROGRESS`; PA-10.0 through PA-10.2 are merged
- next separately approved PA-10 slice: **PA-10.3 explicit v1 ↔ v2 compatibility/migration matrix**
- application UI / PDF / production playback: not implemented
- real uploaded-file PA-9 E2E: not executed

GitHub repository visibility and npm/package publication state are separate controls. A `public` GitHub repository does **not** change `package.json` `private: true`, does not publish the package to npm and does not create a package release.

PA-5 through PA-9 remain internal parallel-path foundations. PA-10.0 through PA-10.2 define compatibility, characterization and future canonical-data requirements only. They do **not** make polyphonic conversion public, implement `CanonicalTabResult 2.0.0`, or grant final voicing/fingering selection authority. The existing public monophonic path remains protected and unchanged.

See [Current Implementation Status](current-status.md), [PA-10 Canonical v1/v2 Compatibility Review](pa-10-canonical-v1-v2-compatibility-review.md), [PA-10.2 Polyphonic Canonical Data Requirements](pa-10-polyphonic-canonical-data-requirements.md) and [PA-9 Closure](pa-9-closure.md) for the current authority boundaries.

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

Observation, feedback, benchmark, shadow-ranking, path-policy and polyphonic-arrangement APIs remain internal. PA-8, PA-9 and PA-10.0 through PA-10.2 added no package-root export.

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
| PA-8 `LeftHandShapeModel 1.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #95 |
| PA-9 `PhysicalPlayabilityValidation 2.0.0` | `VERIFIED_ON_MAIN_INTERNAL` — PR #98 |
| PA-10.0 canonical v1/v2 compatibility boundary | `MERGED_DOCUMENTATION_ONLY` — PR #101 |
| PA-10.1 frozen-v1 compatibility characterization | `MERGED_TESTS_ONLY` — PR #102 |
| PA-10.2 exact polyphonic canonical data requirements | `MERGED_DOCUMENTATION_ONLY` — PR #103 |
| PA-10.3 v1 ↔ v2 compatibility/migration matrix | `NOT_STARTED` — separate Stage Start Approval required |
| `CanonicalTabResult 2.0.0` runtime/schema | `NOT_IMPLEMENTED` |
| Public polyphonic arrangement API | `NOT_IMPLEMENTED` — planned PA-13 only after prerequisites |
| alphaTab MusicXML import | `COMPATIBILITY_VERIFIED` |
| alphaTab SVG rendering | `COMPATIBILITY_VERIFIED` |
| alphaTab browser rendering/cursor | `COMPATIBILITY_VERIFIED` |
| alphaTab production playback | `NOT_VERIFIED` |
| MuseScore real import/re-export | `NOT_EXECUTED` |
| MuseScore semantic round-trip | `NOT_EXECUTED` |
| Production PDF adapter | `NOT_IMPLEMENTED` |
| Application score/TAB viewer | `NOT_IMPLEMENTED` |
| Teacher correction UI | `NOT_IMPLEMENTED` |
| Export/share application layer | `NOT_IMPLEMENTED` |
| Project persistence | `NOT_IMPLEMENTED` |
| Concrete production durable/atomic admission store | `NOT_IMPLEMENTED` |
| Versioned research privacy/consent/lawful-use boundary | `NOT_IMPLEMENTED` |
| Live TeacherFeedback research/training dataset pipeline | `BLOCKED` |
| Real learned ranking training/model registry | `NOT_IMPLEMENTED` |
| Production learned selection | `BLOCKED` |

## Internal polyphonic package boundary

The current internal path is:

```text
Polyphonic / piano MusicXML
        ↓
XML safety + ProcessingBudget
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
PA-10 canonical v1/v2 compatibility work — PA-10.0–PA-10.2 merged
```

Key authority limits:

- PA-5 role labels are deterministic onset-local register candidates, not semantic melody/bass truth.
- PA-6 executes only its approved deterministic reduction/octave subset and creates no string/fret/finger authority.
- PA-7 enumerates deterministic distinct-string voicing alternatives; candidate order is not preference ranking.
- PA-8 assigns structural finger/barre candidates but does not establish comfort, ranking or final selection.
- PA-9 classifies recomputed PA-8 shapes under fixed policy `CONSERVATIVE_STATIC_LEFT_HAND_2.0`; `PLAYABLE_WITHIN_POLICY` is not universal anatomical/tempo/comfort truth.
- PA-9 does not rank candidates, choose final voicing/fingering, optimize transitions or publish polyphonic output.
- PA-10.0 selected a separate major canonical-v2 working direction without implementing it.
- PA-10.1 machine-checks the frozen public v1 boundary.
- PA-10.2 defines the minimum future polyphonic canonical information requirements.
- PA-10.3 and every later runtime/public slice remain separately gated.

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

PA-5 through PA-10.2 did not weaken these public rejection rules.

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
| Polyphonic source model | Internal only | no application integration |
| Simultaneous source-event model | Internal only | no application integration |
| Arrangement decision/provenance plan | Internal only | no application integration |
| Deterministic voice/register analysis | Internal only | no application integration |
| Deterministic reduction/octave plan | Internal only | no application integration |
| Guitar voicing candidates | Internal only | no application integration |
| Left-hand structural shape candidates | Internal only | no application integration |
| Static physical-playability verdicts | Internal only | no application integration |
| Final selected polyphonic guitar arrangement | Not implemented | not implemented |
| Public executable polyphonic arrangement result | Not implemented | not implemented |
| `CanonicalTabResult 2.0.0` | Not implemented; PA-10.0–PA-10.2 are contract/design foundations only | not implemented |

All current public writers consume validated `CanonicalTabResult 1.0.0` and do not regenerate candidates, rerun optimization or reinterpret a future v2 result.

## Learning / TeacherFeedback boundary

B1 remains fixed independent evaluation infrastructure and is not training data.

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

LR-S0 through LR-S1B.2b remain internal and non-authoritative. Shadow output cannot change deterministic optimizer output, physical validation, current `CanonicalTabResult`, writers or normal conversion.

`TeacherFeedback 1.1.0` records teacher judgment over already-generated physically valid candidate decisions. It cannot alter pitch/rhythm/event identity, generate new candidates, mutate `CanonicalTabResult`, bypass physical validation or authorize model training.

Production learned selection remains blocked pending separately approved durable storage, privacy/consent/lawful-use, training, model lifecycle and independent evaluation prerequisites.

## alphaTab / MuseScore / PDF status

The isolated alphaTab compatibility suite verifies MusicXML import, SVG rendering, browser rendering in headless Chrome, standard notation + six-line TAB, fret 10, ties/beams, bar cursor and beat cursor.

Production synth/playback remains unverified. Compatibility workflow success must not be interpreted as production playback readiness.

MuseScore Studio semantic import/re-export/round-trip/PDF evidence remains unexecuted in the verified environments. MuseScore remains an independent compatibility/engraving/PDF adapter target, not deterministic-core authority.

## PA sequence and package gate

1. PA-1 source truth — merged internal
2. PA-2 projection/hardening/verification — closed
3. PA-3 simultaneity grouping — merged internal through PR #85
4. PA-4 arrangement decision/provenance — merged internal through PR #87
5. PA-5 deterministic voice/register analysis — merged internal through PR #89
6. PA-6 deterministic reduction/octave rules — merged internal through PR #90
7. PA-7 guitar chord/voicing candidates — merged internal through PR #92; closure record PR #93
8. PA-8 left-hand model — merged internal through PR #95; closure record PR #96
9. PA-9 Physical Playability Validator v2 — merged internal through PR #98; closure record PR #99
10. PA-10.0 canonical authority inventory + v1/v2 compatibility direction — merged documentation-only through PR #101
11. PA-10.1 machine-checkable v1 compatibility characterization — merged tests-only through PR #102
12. PA-10.2 exact polyphonic canonical data requirements — merged documentation-only through PR #103
13. PA-10.3 explicit v1 ↔ v2 compatibility/migration matrix — **next separate slice; NOT STARTED**
14. PA-10.4 minimal `CanonicalTabResult 2.0.0` schema proposal — separately gated
15. PA-10.5 version dispatch/fail-closed migration contract proposal — separately gated
16. PA-11 teacher-approved arrangement benchmark
17. PA-12 internal polyphonic E2E + monophonic compatibility
18. PA-13 separately approved public arrangement API
19. PA-14 ScoreMosaic/SesliTab adapters

PA-10.0 through PA-10.2 do not authorize PA-10.3 or any later runtime/public slice.

## Verification caveats

- Exact-head PR compatibility evidence is distinct from post-merge `main` evidence.
- PA-9 runtime exact-head Tests #671 and MusicXML Compatibility #478 passed; post-merge Tests #672 passed on exact runtime `main` SHA `9869b7ecf65c9c76da3a25c032f3026a48bce201`.
- PA-9 closure-record exact-head Tests #673 and MusicXML Compatibility #479 passed; post-merge Tests #674 passed on exact `main` SHA `4410f73c03fd08a9af635351e64181da597f3a4d`.
- PA-10.2 exact-head Tests #681 and MusicXML Compatibility #483 passed; post-merge Tests #682 passed on exact `main` SHA `93c339195bbce7070d7b40c254a9380380b3edc6`.
- PR #104 exact-head Tests #683 and MusicXML Compatibility #484 passed; post-merge Tests #684 passed on exact `main` SHA `c87342793e389b58a3b80ab0ebff2b3d432d5199`.
- No post-merge MusicXML Compatibility run is claimed unless separately observed.
- The alphaTab synth diagnostic does not establish production playback readiness even when the Compatibility workflow concludes `SUCCESS`.
- Real uploaded MusicXML has not been executed as genuine PA-9 end-to-end evidence.
- No public polyphonic conversion authority is claimed.
- PA-10.3 is not started and requires separate Stage Start Approval.
- Branch cleanup remains separately gated.
