# MusicXML to Guitar TAB Engine — Architecture

## 0. Current implementation authority — 2026-08-13

This document distinguishes **implemented runtime architecture** from **planned product architecture**.

PA-6 runtime closure baseline on `main`:

`f4055e42d2cd364060e7d99a4efc2add3d8817bd`

Git tree at that baseline:

`a0cc5aa6e2ed7928e840cb364f04ee5817bf0d93`

Latest merged runtime-changing feature: PR #90 — internal `DeterministicReductionPlan 1.0.0`, rebase-merged on 2026-08-13. PA-5 `DeterministicVoiceAnalysis 1.0.0` was merged through PR #89. PA-5 exact-head Tests #640 and MusicXML Compatibility #456 passed, and post-merge Tests #641 passed on exact `main` SHA `c9cc504558630b48e34c1fb0e0753963b24d181e`. PA-6 exact-head Tests #645 and MusicXML Compatibility #460 passed, and post-merge Tests #646 passed on exact `main` SHA `f4055e42d2cd364060e7d99a4efc2add3d8817bd`. Independent final reviews found no remaining P1/P2 blocker for either package.

PA-7 guitar chord/voicing candidates is the next separately gated polyphonic contract. It is **not authorized** by PA-6 closure.

For current runtime truth, use this authority order:

1. merged runtime source code/tests/workflows on `main`
2. versioned runtime contract modules under `src/`
3. applicable versioned contract documents under `docs/`
4. `docs/pa-5-pa-6-closure.md`
5. `docs/current-status.md`
6. `docs/package-status.md`
7. `README.md`
8. older historical/planning documents

`DATA-CONTRACT.md` remains a deprecated historical draft and must not be treated as the current runtime schema. The authoritative current downstream public TAB result remains `CanonicalTabResult 1.0.0`.

## 1. Architecture goal

The engine converts validated MusicXML into playable six-string guitar tablature while preserving supported musical pitch, timing, measure and notation semantics. The architecture also develops a separate, internal, provenance-preserving polyphonic arrangement path without weakening the public monophonic contract.

The architecture separates:

- XML safety and bounded parsing
- musical semantic projection
- canonical musical representation
- guitar configuration and physical candidate generation
- deterministic fingering optimization
- canonical TAB result validation
- output serialization
- compatibility/rendering adapters
- application/presentation layers
- polyphonic source projection and grouping
- arrangement-decision provenance
- deterministic source analysis
- deterministic reduction/octave execution
- later chord/voicing/playability gates
- future learning/AI infrastructure

No presentation, learned or polyphonic helper component may silently become source-of-truth authority over the deterministic core.

## 2. Current implemented public engine

```text
MusicXML
   ↓
XML normalization + safety
   ↓
ProcessingBudget / deadline / cancellation
   ↓
ParsedMusicXmlDocument 1.0.0
   ↓
structural validation
   ↓
supported monophonic semantic projection
   ↓
CanonicalMusicDocument
   ↓
GuitarConfiguration + physical candidates
   ↓
deterministic fingering cost model
   ↓
dynamic-programming optimizer
   ↓
CanonicalTabResult 1.0.0
   ↓
shared canonical validator
   ↓
┌──────────────┬───────────────┬────────────────┐
│ JSON         │ ASCII TAB     │ TAB MusicXML   │
└──────────────┴───────────────┴────────────────┘
```

This path is implemented and protected. PA-5 and PA-6 did not modify it or add package-root public exports.

## 3. Current internal polyphonic path

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
PA-8 left-hand shape/finger/barre model
        ↓
PA-9 Physical Playability Validator v2
        ↓
deterministic arrangement optimizer
        ↓
teacher-reviewed TAB-result gate
```

This is an internal parallel path. It is not a public conversion API and does not replace `CanonicalTabResult 1.0.0`.

## 4. System boundaries

### In scope for the current deterministic engine

- supported uncompressed MusicXML input
- XML safety/resource enforcement
- supported musical semantic parsing
- immutable canonical musical data
- physical six-string guitar position generation for the public monophonic path
- deterministic fingering selection for the public monophonic path
- canonical TAB validation
- JSON / ASCII TAB / TAB MusicXML serialization
- internal observation/feedback/benchmark/path-policy foundations
- internal PA-1 `PolyphonicSourceModel 1.0.0`
- PA-2 internal projection slices and hardening/verification
- internal PA-3 `SimultaneousEventModel 1.0.0`
- internal PA-4 `GuitarArrangementPlan 1.0.0`
- internal PA-5 `DeterministicVoiceAnalysis 1.0.0`
- internal PA-6 `DeterministicReductionPlan 1.0.0`

### Outside current deterministic-core authority

- PDF/image OMR
- Audiveris execution
- `.omr` manipulation
- direct SesliTab/ScoreMosaic application behavior
- HTTP service behavior
- production UI/PWA/mobile behavior
- production playback
- MuseScore process execution
- production PDF rendering
- project persistence
- arbitrary user score editing
- learned production selection
- PA-7+ chord/voicing/left-hand/playability arrangement authority until separately gated
- public polyphonic conversion authority

These connect only through explicit adapters/contracts.

## 5. Non-negotiable architecture rules

1. `CanonicalTabResult 1.0.0` is authoritative for the current public monophonic TAB path.
2. Writers serialize approved selected positions and never rerun fingering optimization.
3. Parsing never chooses guitar strings/frets.
4. Structural XML validation and musical semantic projection remain separate.
5. Physical validity precedes learned/shadow ranking.
6. Deterministic optimization remains reproducible and the mandatory fallback.
7. Unsupported structures fail explicitly or generate documented warnings.
8. Original MusicXML is immutable source truth.
9. External systems integrate through versioned contracts/adapters.
10. Teacher review cannot make physically impossible fingering valid.
11. Teacher feedback is not research/training consent.
12. Digests prove content correspondence, not trusted producer identity.
13. B1 fixed benchmark remains independent evaluation evidence and must not become training data.
14. Polyphonic support must enter through a parallel versioned projection; current monophonic rejection checks must not be weakened.
15. Application UI/renderers/editors/persistence cannot directly mutate authoritative canonical objects.
16. PA-3 source grouping carries no arrangement authority.
17. PA-4 records explicit decisions/provenance but does not choose a decision policy.
18. PA-5 role labels are onset-local register candidates, not semantic melody/bass truth.
19. PA-6 may execute only its explicitly approved deterministic subset; deferred decision kinds remain fail-closed.
20. PA-6 register bounds do not prove physical guitar playability.
21. PA-6 may not choose string, fret, finger, barre, hand position or chord voicing.
22. High-risk runtime changes require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and separate merge approval.

## 6. Current public musical scope

The current public path supports:

- MusicXML `score-partwise`
- one part
- one staff
- one voice
- monophonic notes/rests
- pitch `step`, `alter`, `octave`
- whole, half, quarter, eighth and 16th values
- dotted values
- rests
- `divisions`
- time signatures
- pickup/implicit measures
- ties
- beams, including normalized hook metadata

It fails closed for:

- chords / simultaneous note events
- `backup` / `forward` polyphonic timing
- multiple voices
- multiple staves
- multipart scores
- grace notes
- tuplets
- unsupported rhythm values such as 32nd notes
- compressed `.mxl`

This boundary remains deliberate and verified after PA-6.

## 7. XML safety and parsing architecture

The engine uses a bounded event-driven XML parser to create an immutable parsed representation before musical/guitar decisions are made.

Safety responsibilities include:

- input existence and supported shape
- malformed XML rejection
- unsafe declaration/entity policy
- encoding/null handling
- byte ceilings
- XML structural ceilings
- semantic measure/event ceilings
- deadline/cancellation/checkpoints
- fail-closed error codes

`ParsedMusicXmlDocument 1.0.0` is the safe branching point shared by the public monophonic path and the separately gated PA projection track. PA-1 provides `PolyphonicSourceModel 1.0.0`; PA-2 projects supported polyphonic source facts; PA-3 derives simultaneity; PA-4 binds explicit arrangement decisions to exact source/group provenance; PA-5 derives deterministic source register roles; PA-6 converts the approved subset of those explicit decisions into deterministic keep/omit/octave/reduction instructions. None changes parser authority or the public monophonic adapter.

## 8. PA-3 simultaneity and PA-4 provenance

### PA-3 — `SimultaneousEventModel 1.0.0`

- groups two or more note events sharing the same measure and exact `onsetDivisions`
- preserves source member order and source event identity
- excludes rests
- does not require equal durations
- can group source-chord, cross-voice and cross-staff simultaneity
- does not alter pitch or duration
- carries no guitar-selection authority

### PA-4 — `GuitarArrangementPlan 1.0.0`

Fixed decision vocabulary:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- `VOICE_REDISTRIBUTED`
- `CHORD_REDUCED`
- `REVOICED`
- `ARPEGGIATED`

PA-4 requires every source note to be covered exactly once, binds group decisions to exact PA-3 membership, enforces canonical order and returns a deeply immutable provenance record. It does not choose which decision should be made and does not itself execute target pitch/voice/timing/chord transformations.

## 9. PA-5 deterministic source analysis

`DeterministicVoiceAnalysis 1.0.0` uses the fixed basis `ONSET_LOCAL_REGISTER_1.0`.

Role vocabulary:

- `SOLE_NOTE`
- `MELODY_CANDIDATE`
- `BASS_CANDIDATE`
- `INNER_VOICE_CANDIDATE`
- `OUTER_VOICE_AMBIGUOUS`

PA-5 is deterministic, source-derived and provenance-preserving. It does not infer semantic melody from phrase/harmony/style and does not use teacher or AI authority. It does not execute PA-4 decisions or select guitar positions.

## 10. PA-6 deterministic reduction/octave execution

`DeterministicReductionPlan 1.0.0` uses:

- policy `STANDARD_GUITAR_REGISTER_20_FRET_1.0`
- register envelope MIDI 40–84, derived from standard tuning + default fret range 0–20
- tie-break `DOWNWARD_TIE_BREAK_1.0`

Executable PA-6 v1 decisions:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- conservative `CHORD_REDUCED`

Fail-closed/deferred in PA-6 v1:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- `ARPEGGIATED`

`OCTAVE_DISPLACED` preserves pitch class and selects the nearest non-zero octave-equivalent target inside the fixed envelope; equal-distance ties choose the lower target. `CHORD_REDUCED` requires one unique PA-5 melody candidate, one unique bass candidate, at least one inner candidate and no ambiguous outer candidates. It keeps the two unique outer candidates and omits inner candidates.

This produces a deterministic reduction plan, not a physically validated chord voicing. PA-7+ remain responsible for later voicing/shape/playability work.

## 11. Guitar configuration and physical candidates

Current default standard tuning:

```text
String 6: E2 — MIDI 40
String 5: A2 — MIDI 45
String 4: D3 — MIDI 50
String 3: G3 — MIDI 55
String 2: B3 — MIDI 59
String 1: E4 — MIDI 64
```

Default fret range is 0–20.

`GuitarConfiguration 1.0.0` centralizes physical configuration. Public monophonic candidate generation creates all valid string/fret positions, rejects invalid/out-of-range positions, preserves alternatives and does not itself choose the final path.

PA-6 reuses the standard configuration only to derive a global register envelope; that envelope must not be confused with per-note/per-chord physical playability.

## 12. Deterministic fingering architecture

The current public optimizer uses deterministic dynamic programming and an explainable cost model for movement, string changes, high-fret usage, repeated positions and hard movement limits.

The same supported input + configuration + policy + engine version must produce the same result. No current AI component may override the deterministic production authority.

## 13. Canonical TAB result

`CanonicalTabResult 1.0.0` remains the single current downstream public TAB authority. It is unchanged through PA-6.

All writers consume validated canonical data and must not create new fingering decisions. PA-3 through PA-6 remain internal parallel-path foundations and do not mutate the public canonical result.

PA-10 remains the separately planned compatibility review for whether a chord-aware bridge or new canonical version is required.

## 14. Rhythm and notation architecture

Implemented public notation scope includes:

- whole / half / quarter / eighth / 16th
- rests
- dotted values
- divisions
- time signatures
- pickup/implicit measures
- ties
- beam metadata

Future notation gates remain required for slurs/legato, grace notes, tuplets, 32nd+, articulations, ornaments and fermata/other expressive notation. They must not be silently accepted by weakening current validation.

## 15. Output and presentation boundaries

### Implemented public outputs

- JSON
- ASCII TAB
- TAB MusicXML

### alphaTab

Compatibility evidence verifies MusicXML import, SVG/browser rendering, standard notation + six-line TAB, double-digit fret rendering, ties/beams, bar cursor and beat cursor. This evidence does not itself implement a production application viewer.

The tested alphaTab 1.8.4 synthesizer path remains unverified for production playback because the headless diagnostic encountered an internal recursive runtime error before player readiness.

### MuseScore / PDF

MuseScore remains an independent compatibility/engraving/PDF adapter target, not deterministic-core authority. Real MuseScore import/re-export/semantic round-trip/PDF export has not been executed in the tested environments. PDF remains downstream and may not invalidate a valid core conversion result.

## 16. Teacher, feedback and learning boundaries

`TeacherFeedback 1.1.0` records accept/override/reject over already valid physical candidates and does not mutate pitch/rhythm/event identity or `CanonicalTabResult`.

Teacher Fingering Correction and future Teacher Score Correction must remain separate concepts.

Current LR shadow/path-policy infrastructure remains non-authoritative. B1 is evaluation evidence, not training data. No production learned selection or live-feedback training pipeline is authorized.

## 17. PA safe sequence

1. PA-0 documentation/architecture — merged
2. PA-1 `PolyphonicSourceModel 1.0` — merged internal
3. PA-2.0 documentation convergence — merged
4. PA-2.1 projection contract — merged documentation-only through PR #75
5. PA-2.2 red-first fixtures/tests — merged tests-only through PR #77
6. PA-2.3 basic note/rest projector — merged through PR #78
7. PA-2.4 `backup` / `forward` cursor semantics — merged through PR #80
8. PA-2.5 chord/multiple-voice/staff-2 projection — merged through PR #81
9. PA-2.6 hostile/budget/deadline/cancellation negatives — merged tests-only through PR #83
10. PA-2.7 regression + monophonic compatibility — verified
11. PA-2.8 GitHub CI + independent review — verified
12. PA-3 simultaneous-event source grouping — merged internal through PR #85
13. PA-4 arrangement decision + provenance — merged internal through PR #87
14. PA-5 deterministic melody/bass/voice analysis — merged internal through PR #89
15. PA-6 deterministic reduction/octave rules — merged internal through PR #90
16. PA-7 guitar chord/voicing candidates — **next separate gate; requires explicit approval**
17. PA-8 left-hand shape/finger assignment/barre/partial-barre
18. PA-9 Physical Playability Validator v2
19. PA-10 canonical v1/v2 compatibility review
20. PA-11 teacher-approved arrangement benchmark
21. PA-12 internal polyphonic E2E + monophonic compatibility
22. PA-13 separately approved public arrangement API
23. PA-14 ScoreMosaic/SesliTab adapter integration

Completion of PA-6 does not authorize PA-7.

## 18. Application/presentation roadmap

No production application UI exists in this repository yet. Planned downstream work includes file open/preflight/convert flow, score/TAB viewer, measure/beat cursor, playback only after stable synth evidence, error/warning UI, fingering inspector, teacher correction surfaces, export center, optional MuseScore/PDF adapter, PDF preview/print/share, project persistence and full application E2E.

These layers remain downstream adapters and cannot directly mutate authoritative canonical data or bypass validation.

## 19. Safe-development governance

- `main` is protected.
- required Node/compatibility checks are configured.
- third-party workflow actions remain pinned to immutable SHAs.
- high-risk runtime work is developed off `main` with red-first/negative tests and exact-head CI evidence.
- merge approval is separate from stage-start approval.
- post-merge verification is required before closure.
- branch cleanup remains separately approved.
- PA-7 has not started.

See [PA-5 + PA-6 Closure](pa-5-pa-6-closure.md), [Current implementation status](current-status.md), [Package status](package-status.md), and the versioned PA-5/PA-6 contract documents for exact evidence and constraints.
