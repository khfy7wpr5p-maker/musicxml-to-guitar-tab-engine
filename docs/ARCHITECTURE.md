# MusicXML to Guitar TAB Engine — Architecture

## 0. Current implementation authority — 2026-08-13

This document distinguishes **implemented runtime architecture** from **planned product architecture**.

PA-7 runtime closure baseline on `main`:

`1f3dc2cf89efab1e258064b6e76eb51daee4252c`

Git tree at that runtime baseline:

`2458bf228fe02ecb82359417b7bb5016b6c29f82`

PA-7 closure-record baseline on `main`:

`6831047db24d2e69167219844b270533cde8e539`

Latest merged runtime-changing feature: PR #92 — internal `GuitarVoicingCandidateModel 1.0.0`, rebase-merged on 2026-08-13. PA-7 exact-head Tests #652 passed on Node.js 18/20/22 and MusicXML Compatibility #465 concluded `SUCCESS`; post-merge Tests #653 passed on exact runtime `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`. Independent final review found no remaining P1/P2 blocker. PR #93 then merged the PA-7 closure record; exact-head Tests #654 and MusicXML Compatibility #466 passed, followed by post-merge Tests #655 on exact `main` SHA `6831047db24d2e69167219844b270533cde8e539`.

PA-8 left-hand shape/finger assignment/barre/partial-barre is the next separately gated polyphonic contract. It is **not authorized** by PA-7 closure or the PA-7 merge approval.

For current runtime truth, use this authority order:

1. merged runtime source code/tests/workflows on `main`
2. versioned runtime contract modules under `src/`
3. applicable versioned contract documents under `docs/`
4. `docs/pa-7-closure.md`
5. `docs/pa-5-pa-6-closure.md`
6. `docs/current-status.md`
7. `docs/package-status.md`
8. `README.md`
9. older historical/planning documents

`DATA-CONTRACT.md` remains a deprecated historical draft and must not be treated as the current runtime schema. The authoritative current downstream public TAB result remains `CanonicalTabResult 1.0.0`.

Early repository plans proposed filenames such as `rhythm.js`, `measure.js`, `eventModel.js` and `conversionResult.js`. Missing those exact filenames is not evidence that the corresponding capability is absent; current authority is the implemented source/contracts/tests.

## 1. Architecture goal

The engine converts validated MusicXML into playable six-string guitar tablature while preserving supported musical pitch, timing, measure and notation semantics. It also develops a separate, internal, provenance-preserving polyphonic arrangement path without weakening the public monophonic contract.

The architecture separates XML safety, musical projection, canonical representation, guitar configuration, physical candidate generation, deterministic optimization, canonical validation, serialization, compatibility/rendering adapters, application/presentation layers, polyphonic projection/grouping/provenance, deterministic source analysis, deterministic reduction/octave execution, deterministic guitar voicing candidate enumeration, later left-hand/playability gates, and future learning/AI infrastructure.

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

This path is implemented and protected. PA-5, PA-6 and PA-7 did not modify it or add package-root public exports.

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
GuitarVoicingCandidateModel 1.0.0
        ↓
PA-8 left-hand shape/finger/barre/partial-barre — NOT STARTED
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
- internal PA-7 `GuitarVoicingCandidateModel 1.0.0`

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
- PA-8+ left-hand/playability/final arrangement authority until separately gated
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
22. PA-7 may enumerate only exact-target-MIDI standard-guitar string/fret alternatives for simultaneous PA-6 `KEEP` notes and must preserve PA-3/PA-6 provenance.
23. PA-7 candidate order is deterministic enumeration, not preference ranking or final voicing selection.
24. PA-7 cannot assign left-hand fingers, barre/partial-barre, hand position or ergonomic/playability approval and cannot silently drop unresolved notes.
25. High-risk runtime changes require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and separate merge approval.

## 6. Current public musical scope

The current public path supports MusicXML `score-partwise`, one part, one staff, one voice, monophonic notes/rests, pitch step/alter/octave, whole/half/quarter/eighth/16th values, dotted values, divisions, time signatures, pickup/implicit measures, ties and beam metadata.

It fails closed for chords/simultaneous note events, `backup`/`forward` polyphonic timing, multiple voices, multiple staves, multipart scores, grace notes, tuplets, unsupported rhythm values such as 32nd notes, and compressed `.mxl`.

This boundary remains deliberate and verified after PA-7.

## 7. XML safety and parsing architecture

The engine uses a bounded event-driven XML parser to create an immutable parsed representation before musical/guitar decisions are made. Safety responsibilities include malformed XML rejection, unsafe declaration/entity policy, encoding/null handling, byte/XML/measure/event ceilings, deadline/cancellation/checkpoints and fail-closed error codes.

`ParsedMusicXmlDocument 1.0.0` is the safe branching point shared by the public monophonic path and the separately gated PA track. PA-1 provides `PolyphonicSourceModel 1.0.0`; PA-2 projects supported source facts; PA-3 derives simultaneity; PA-4 binds explicit arrangement decisions to exact source/group provenance; PA-5 derives deterministic source register roles; PA-6 converts the approved subset into deterministic keep/omit/octave/reduction instructions; PA-7 enumerates distinct-string standard-guitar position alternatives for simultaneous retained notes. None changes parser authority or the public monophonic adapter.

## 8. PA-3 simultaneity and PA-4 provenance

### PA-3 — `SimultaneousEventModel 1.0.0`

- groups two or more note events sharing the same measure and exact `onsetDivisions`
- preserves source member order and source identity
- excludes rests
- does not require equal durations
- supports source-chord, cross-voice and cross-staff simultaneity
- carries no guitar-selection authority

### PA-4 — `GuitarArrangementPlan 1.0.0`

Decision vocabulary is `PRESERVED`, `OMITTED`, `OCTAVE_DISPLACED`, `VOICE_REDISTRIBUTED`, `CHORD_REDUCED`, `REVOICED`, `ARPEGGIATED`.

PA-4 requires every source note to be covered exactly once, binds group decisions to exact PA-3 membership, enforces canonical order and returns immutable provenance. It does not choose decision policy and does not itself execute target pitch/voice/timing/chord transformations.

## 9. PA-5 deterministic source analysis

`DeterministicVoiceAnalysis 1.0.0` uses `ONSET_LOCAL_REGISTER_1.0` and role vocabulary `SOLE_NOTE`, `MELODY_CANDIDATE`, `BASS_CANDIDATE`, `INNER_VOICE_CANDIDATE`, `OUTER_VOICE_AMBIGUOUS`.

PA-5 is deterministic, source-derived and provenance-preserving. It does not infer semantic melody from phrase/harmony/style, does not use teacher/AI authority, does not execute PA-4 decisions and does not select guitar positions.

## 10. PA-6 deterministic reduction/octave execution

`DeterministicReductionPlan 1.0.0` uses policy `STANDARD_GUITAR_REGISTER_20_FRET_1.0`, standard-tuning/default-0–20-fret register envelope MIDI 40–84 and tie-break `DOWNWARD_TIE_BREAK_1.0`.

Executable PA-6 v1 decisions: `PRESERVED`, `OMITTED`, `OCTAVE_DISPLACED`, conservative `CHORD_REDUCED`.

Fail-closed/deferred: `VOICE_REDISTRIBUTED`, `REVOICED`, `ARPEGGIATED`.

`OCTAVE_DISPLACED` preserves pitch class and chooses the nearest non-zero octave-equivalent target inside the fixed envelope; equal-distance ties choose the lower target. `CHORD_REDUCED` requires one unique PA-5 melody candidate, one unique bass candidate, at least one inner candidate and no ambiguous outer candidates; it keeps the unique outer candidates and omits inner candidates.

This is a deterministic reduction plan, not a physically validated chord voicing. PA-7 now supplies deterministic basic string/fret alternatives; PA-8+ remain responsible for left-hand shape and full playability authority.

## 11. PA-7 deterministic guitar voicing candidates

`GuitarVoicingCandidateModel 1.0.0` uses policy `STANDARD_SIX_STRING_DISTINCT_STRING_1.0`, standard six-string tuning, frets 0–20 and a fixed aggregate candidate ceiling of 10,000.

PA-7 recomputes and validates upstream source/simultaneity/reduction facts. For simultaneous PA-6 `KEEP` notes it enumerates assignments in which each active source event appears exactly once, every string/fret position round-trips to exact PA-6 `targetMidi`, and no two simultaneous active notes occupy the same guitar string. PA-3 group membership and PA-6 omitted-member provenance are preserved.

Groups with more than six active notes or no injective distinct-string assignment produce zero candidates instead of silent note dropping. Candidate IDs/order are deterministic but carry no preference or selection authority.

PA-7 does not assign left-hand fingers, barre/partial-barre, hand position, fret-span comfort, ergonomics, final voicing selection or public polyphonic output. A PA-7 candidate is not full Physical Playability Validator v2 approval.

## 12. Guitar configuration and physical candidates

Default standard tuning:

```text
String 6: E2 — MIDI 40
String 5: A2 — MIDI 45
String 4: D3 — MIDI 50
String 3: G3 — MIDI 55
String 2: B3 — MIDI 59
String 1: E4 — MIDI 64
```

Default fret range is 0–20. `GuitarConfiguration 1.0.0` centralizes physical configuration. Public monophonic candidate generation creates all valid string/fret positions, rejects invalid/out-of-range positions, preserves alternatives and does not itself choose the final path.

PA-6 reuses the standard configuration only to derive a global register envelope. PA-7 uses existing physical position logic for exact target MIDI under fixed standard tuning/fret bounds, but distinct-string feasibility is still not left-hand/playability approval.

## 13. Deterministic fingering architecture

The current public optimizer uses deterministic dynamic programming and an explainable cost model for movement, string changes, high-fret usage, repeated positions and hard movement limits. The same supported input + configuration + policy + engine version must produce the same result. No current AI component may override deterministic production authority.

## 14. Canonical TAB result

`CanonicalTabResult 1.0.0` remains the single current downstream public TAB authority and is unchanged through PA-7. All public writers consume validated canonical data and must not create new fingering decisions. PA-10 remains the later compatibility review for whether a chord-aware bridge or new canonical version is required.

## 15. Rhythm and notation architecture

Implemented public notation scope includes whole/half/quarter/eighth/16th, rests, dotted values, divisions, time signatures, pickup/implicit measures, ties and beam metadata.

Future separate gates remain required for slurs/legato, grace notes, tuplets, 32nd+, articulations, ornaments and fermata/other expressive notation. They must not be silently accepted by weakening current validation.

## 16. Output and presentation boundaries

### Implemented public outputs

- JSON
- ASCII TAB
- TAB MusicXML

### alphaTab

Compatibility evidence verifies MusicXML import, SVG/browser rendering, standard notation + six-line TAB, double-digit fret rendering, ties/beams, bar cursor and beat cursor. This does not itself implement a production application viewer. The tested alphaTab 1.8.4 synthesizer path remains unverified for production playback because the headless diagnostic has not established player readiness. Compatibility workflow `SUCCESS` must not be treated as production playback proof.

### MuseScore / PDF

MuseScore remains an independent compatibility/engraving/PDF adapter target, not deterministic-core authority. Real MuseScore import/re-export/semantic round-trip/PDF export has not been executed in tested environments. PDF remains downstream and may not invalidate a valid core conversion result.

## 17. Preserved external-renderer / PDF security requirements

PA-7 documentation convergence does **not** weaken the previously established renderer/process security requirements. Any future MuseScore or other external renderer adapter must preserve all of the following unless a separately approved security review replaces a control with an equal or stronger one:

- resolve an explicitly approved renderer executable and supported version; never treat a user-supplied executable path as authority;
- invoke without a shell and with a fixed allowlisted argument shape; user-controlled command fragments/flags are forbidden;
- require no renderer network access and disable network access where the deployment model permits it;
- use a job-owned isolated temporary directory for every conversion and never inspect unrelated directories or share writable temp storage with unrelated services;
- reject path traversal and unsafe symlink/file-replacement conditions before reading, writing, deleting or publishing derived files;
- never overwrite original MusicXML or another caller-owned artifact; renderer output is always a new derived artifact;
- cleanup only current-job files/directories and run cleanup on success, failure and timeout paths;
- enforce hard process timeout, terminate the process tree where required and apply bounded concurrency; hard CPU/memory ceilings belong at OS/container/worker boundary when needed;
- bound captured stdout/stderr and generated output size;
- validate a claimed PDF as non-empty and at minimum verify expected `%PDF-` signature plus configured type/size ceilings before exposure;
- missing renderer, unsupported version, spawn failure, timeout, invalid/empty output, path mismatch and cleanup failure must produce explicit fail-closed adapter errors;
- renderer/PDF failure must not destroy or invalidate an already valid deterministic core result, JSON, ASCII TAB or TAB MusicXML output;
- error reporting must avoid leaking secrets, credentials, unrestricted environment data, arbitrary filesystem contents or unnecessary internal command details;
- renderer/tool versions and third-party workflows/actions must remain reviewed and pinned/controlled under repository supply-chain policy;
- production deployment should isolate rendering in a separately bounded worker/service when stronger process/filesystem isolation is required, with no unrelated writable mounts, secrets or deployment authority.

Required negative/security evidence for a future renderer gate includes at minimum:

- missing executable;
- unsupported executable/version;
- attempted argument/path injection;
- traversal/symlink escape;
- process timeout/termination;
- excessive stdout/stderr or oversized output;
- empty output;
- invalid PDF signature/content;
- unrelated-file preservation and current-job-only cleanup;
- proof that core MusicXML/TAB outputs survive renderer failure.

These are architecture requirements only. They do not make MuseScore execution or PDF generation a current runtime capability.

## 18. Teacher review architecture

### Teacher Fingering Correction

`TeacherFeedback 1.1.0` records accept/override/reject over already valid physical candidates. An override must be an exact alternative from the validated same-event candidate layer. It cannot mutate deterministic source pitch/rhythm/event identity or `CanonicalTabResult`.

### Teacher Score Correction

Pitch/rhythm/notation editing is a different authority and is not implemented. Future score correction must create provenance, produce a new derived musical document, revalidate semantics, regenerate physical candidates, rerun deterministic optimization and create a new validated canonical result. It must never mutate original MusicXML or patch selected TAB fields directly.

## 19. Learning / AI architecture

Merged internal learning-path foundations remain non-authoritative. Deterministic optimizer = production authority; shadow/learning infrastructure = authority none.

No current AI component may change source pitch/rhythm, create guitar positions, bypass physical validation, mutate `CanonicalTabResult`, silently become writer authority, or use TeacherFeedback as training consent.

Production learned ranking remains blocked until separate durable storage, privacy/consent/lawful-use, dataset admission, model lifecycle, independent evaluation, shadow-first evidence and production opt-in gates are complete.

## 20. PA safe sequence

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
16. PA-7 guitar chord/voicing candidates — merged internal through PR #92; closure record PR #93
17. PA-8 left-hand shape/finger assignment/barre/partial-barre — **next separate gate; requires explicit approval**
18. PA-9 Physical Playability Validator v2
19. PA-10 canonical v1/v2 compatibility review
20. PA-11 teacher-approved arrangement benchmark
21. PA-12 internal polyphonic E2E + monophonic compatibility
22. PA-13 separately approved public arrangement API
23. PA-14 ScoreMosaic/SesliTab adapter integration

Completion of PA-7 does not authorize PA-8.

## 21. Application / presentation architecture

No production application UI is implemented yet. Future downstream structure includes file open/preflight/convert state, score/TAB viewer, measure/beat cursor, playback only after stable evidence, error/warning presentation, fingering inspector, Teacher Fingering Correction, separately controlled Teacher Score Correction, export center, MuseScore/PDF adapter, PDF viewer/print/share and project persistence.

Application rules:

- UI state is not canonical musical truth.
- renderer state is not canonical musical truth.
- playback state is not canonical musical truth.
- PDF is a derived presentation artifact.
- project persistence must version source/canonical/presentation/edit state explicitly.
- user-facing errors must branch on stable error codes rather than message text.

## 22. CI and governance architecture

Current protections include SHA-pinned third-party workflow actions, protected `main`, Node.js 18/20/22 tests, relevant MusicXML/alphaTab compatibility contexts, G0.1 administrator enforcement and historical branch audit.

Repository-settings changes remain separately approved. Branch cleanup must begin with read-only classification and is never implicitly authorized by a merge approval.

## 23. High-risk change protocol

The following must not change incidentally:

- current monophonic semantic projection
- `convertMusicXmlToCanonicalTab()`
- `CanonicalMusicDocument`
- `CanonicalTabResult 1.0.0`
- deterministic monophonic optimizer
- physical guitar validation
- package-root public API
- writer authority
- B1 independent evaluation evidence

Required sequence for approved runtime changes:

```text
read-only baseline audit
   ↓
exact scope definition
   ↓
red-first / negative tests
   ↓
smallest implementation
   ↓
focused tests
   ↓
full regression
   ↓
compatibility / E2E where applicable
   ↓
GitHub-hosted CI
   ↓
independent review
   ↓
separate merge approval
   ↓
post-merge verification
```

Local tests must never be presented as GitHub-hosted CI evidence.

## 24. PA-5 / PA-6 / PA-7 verification limitations

PA-5, PA-6 and PA-7 closure establishes repository-level contract/code/test consistency and exact-head CI evidence for the internal deterministic analysis/reduction/voicing-candidate layers. It does **not** establish:

- execution of a previously uploaded Audiveris/Scarlatti MusicXML file through PA-7 as genuine E2E evidence;
- semantic melody/bass inference beyond PA-5 onset-local register roles;
- execution of `VOICE_REDISTRIBUTED`, `REVOICED` or `ARPEGGIATED` in PA-6 v1;
- left-hand finger/barre/hand-position/ergonomic approval for PA-7 candidates;
- final chord-voicing selection or deterministic polyphonic arrangement optimization;
- public polyphonic conversion;
- MuseScore semantic round-trip;
- production playback;
- production PDF generation.

PA-5 post-merge evidence is Tests #641 on exact merged `main` SHA `c9cc504558630b48e34c1fb0e0753963b24d181e`. PA-6 exact-head Compatibility #460 and Tests #645 ran on its PR head, followed by post-merge Tests #646 on `main` SHA `f4055e42d2cd364060e7d99a4efc2add3d8817bd`. PA-7 exact-head Compatibility #465 and Tests #652 ran on exact PR head `703658d68bef0939bee6dca42b4eac4e2d6bd358`; after rebase merge, Tests #653 ran directly on runtime `main` SHA `1f3dc2cf89efab1e258064b6e76eb51daee4252c`. PA-7 closure-record PR #93 then passed exact-head Tests #654 and Compatibility #466 followed by post-merge Tests #655 on `main` SHA `6831047db24d2e69167219844b270533cde8e539`. No post-merge MusicXML Compatibility run is claimed for the PA-7 runtime or closure-record merge.

Compatibility workflow success does not by itself establish production playback readiness; the synth diagnostic remains a separate non-production-readiness limitation.

## 25. Historical architecture note

Earlier repository documents and closure records remain useful audit history. Do not infer missing capability from a missing planned filename and do not infer implemented capability from a planned section. Always classify evidence as merged runtime, merged internal/non-authoritative, merged tests-only, verified, compatibility verified, documentation-only, historical, not implemented, or blocked by prerequisites.

See [PA-7 Closure](pa-7-closure.md), [PA-7 Guitar Voicing Candidate Contract](pa-7-guitar-voicing-candidate-contract.md), [PA-5 + PA-6 Closure](pa-5-pa-6-closure.md), [Current implementation status](current-status.md), [Package status](package-status.md), and the versioned PA contract documents for exact evidence and constraints.
