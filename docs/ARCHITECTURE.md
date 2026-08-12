# MusicXML to Guitar TAB Engine — Architecture

## 0. Current implementation authority — 2026-08-12

This document distinguishes **implemented runtime architecture** from **planned product architecture**.

PA-2.3 closure baseline on `main`:

`776755d993c6b057d655df1ed6b4a9046144f46d`

Latest merged runtime-changing feature: PR #78 — PA-2.3 minimal internal basic note/rest projector, rebase-merged on 2026-08-12. PA-2.2 red-first vectors were merged tests-only through PR #77. PR #78 exact-head Tests #593 and MusicXML Compatibility #420 passed, its independent Codex review found no major issue, and post-merge Tests #594 passed on `main`. PA-2.4 is now the separately gated next runtime step and requires explicit approval.

For current runtime truth, use this authority order:

1. merged runtime source code/tests/workflows on `main`
2. versioned runtime contract modules under `src/`
3. applicable versioned contract documents under `docs/`
4. `docs/current-status.md`
5. `docs/package-status.md`
6. `README.md`
7. older historical/planning documents

`DATA-CONTRACT.md` remains a deprecated historical draft and must not be treated as the current runtime schema. The authoritative current downstream TAB result remains `CanonicalTabResult 1.0.0`.

Early repository plans proposed filenames such as `rhythm.js`, `measure.js`, `eventModel.js` and `conversionResult.js`. The absence of those exact filenames is **not** evidence that the corresponding capability is missing. Current functionality is implemented through the actual parser/canonical/pipeline modules and tests.

## 1. Architecture goal

The engine converts validated MusicXML into playable six-string guitar tablature while preserving supported musical pitch, timing, measure and notation semantics.

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
- polyphonic arrangement foundations and future gates
- future learning/AI infrastructure

No presentation or learned component may silently become source-of-truth authority over the deterministic core.

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

This path is implemented and protected. It must not be replaced with a second parser, second optimizer, second canonical result authority or second writer stack without a separately approved architecture change.

## 3. System boundaries

### In scope for the deterministic engine

- supported uncompressed MusicXML input
- XML safety/resource enforcement
- supported musical semantic parsing
- immutable canonical musical data
- physical six-string guitar position generation
- deterministic fingering selection
- canonical TAB validation
- JSON / ASCII TAB / TAB MusicXML serialization
- internal observation/feedback/benchmark/path-policy foundations
- internal PA-1 `PolyphonicSourceModel 1.0.0` source-truth foundation

### Outside current deterministic-core authority

- PDF/image OMR
- Audiveris execution
- `.omr` manipulation
- direct SesliTab/ScoreMosaic application behavior
- HTTP service behavior
- production UI/PWA/mobile behavior
- production playback
- MuseScore process execution
- PDF rendering
- project persistence
- arbitrary user score editing
- learned production selection
- PA-2.4+ cursor, chord/polyphonic projection and arrangement authority until separately gated

These connect through explicit adapters/contracts.

## 4. Non-negotiable architecture rules

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
16. High-risk runtime changes require focused tests, negative/fail-closed tests, full regression, relevant compatibility/E2E evidence, GitHub-hosted CI and separate merge approval.

## 5. Current public musical scope

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

This fail-closed boundary is deliberate.

## 6. XML safety and parsing architecture

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

`ParsedMusicXmlDocument 1.0.0` is the safe branching point shared by the current monophonic path and the separately gated PA-2 projection track. PA-1 provides the internal destination contract, `PolyphonicSourceModel 1.0.0`; merged PA-2.1 defines the projection contract, PA-2.2 supplies red-first vectors, and PA-2.3 implements only the minimal internal basic note/rest slice. Remaining runtime work stays split across separately approved PA-2.4+ gates.

## 7. Musical semantic projection

The current public semantic layer reads and validates supported MusicXML meaning including:

- note/rest structure
- pitch step/alter/octave
- MIDI normalization
- duration divisions
- note type
- dots
- voice/staff constraints
- time signatures
- divisions inheritance
- measure duration
- pickup measures
- tie metadata
- beam metadata
- source/event ordering

This capability is implemented even though early plans proposed separate `rhythm.js`, `measure.js` and `eventModel.js` files.

The PA-2 runtime projector is implemented as a separate internal path after `ParsedMusicXmlDocument 1.0.0` and follows the merged PA-2.1 projection contract. PA-2.3 covers only basic one-voice/staff-1 note/rest facts and does not relax the current monophonic adapter's fail-closed rules. `backup` / `forward`, chords, multiple voices and staff 2 remain separately gated.

## 8. Rhythm and notation architecture

### Implemented notation scope

| Feature | Runtime state |
|---|---|
| whole / half / quarter / eighth / 16th | implemented |
| rests | implemented |
| dotted values | implemented |
| divisions | implemented |
| time signatures | implemented |
| pickup/implicit measure | implemented |
| ties | implemented |
| beam metadata | implemented |
| beam/tie alphaTab rendering fixture | compatibility verified |

### Future notation coverage

The following require separate explicit gates and must not be silently accepted:

- slur / legato semantics
- grace notes / acciaccatura / appoggiatura
- tuplets
- 32nd and later advanced rhythm values
- articulations: staccato, accent, tenuto, etc.
- ornaments: trill, mordent, turn, etc.
- fermata and other expressive notation

A future **Musical Notation Coverage Contract** should define for each symbol:

1. parser acceptance/rejection;
2. canonical semantic representation;
3. duration/timing effect;
4. preservation through TAB MusicXML;
5. alphaTab rendering evidence;
6. MuseScore semantic round-trip expectation;
7. unsupported/fail-closed behavior.

PDF/image recognition of these symbols is **OMR work**, not this MusicXML parser's responsibility.

## 9. Guitar configuration and physical candidates

The current default tuning is standard six-string guitar:

```text
String 6: E2 — MIDI 40
String 5: A2 — MIDI 45
String 4: D3 — MIDI 50
String 3: G3 — MIDI 55
String 2: B3 — MIDI 59
String 1: E4 — MIDI 64
```

Default fret range is 0–20.

`GuitarConfiguration 1.0.0` centralizes physical configuration. Internally validated custom six-string open MIDI tuning is supported; current package-root API does not expose an arbitrary public configuration surface.

For every playable pitch:

```text
fret = pitch MIDI − open-string MIDI
```

Candidate generation:

- creates all valid string/fret positions
- rejects negative frets
- enforces maximum fret
- rejects out-of-range notes
- preserves alternatives
- does not choose the final path

## 10. Deterministic fingering architecture

The current optimizer is implemented using deterministic dynamic programming.

The cost model includes explainable components such as:

- fret movement
- string movement
- position shifts / large movement penalties
- high-fret usage
- configurable open-string preference
- repeated/same-position stability
- hard maximum movement policies

The same supported input + guitar configuration + policy + engine version must produce the same result.

The deterministic optimizer remains the production authority and fallback. No current AI component may override it.

## 11. Canonical TAB result

`CanonicalTabResult 1.0.0` is the single current downstream TAB authority.

Core properties include:

- immutable score/measure/event data
- selected physical position for notes
- alternatives where applicable
- preserved supported rhythm/notation data
- configuration/fingering metadata required by the current contract
- warnings/review metadata under the implemented schema

Rests have no selected physical position.

All writers consume validated canonical data and must not create new fingering decisions.

## 12. Output architecture

### JSON

Implemented public deterministic serializer.

### ASCII TAB

Implemented public deterministic debug/readability serializer. Current tests cover six-string alignment and double-digit fret values.

### TAB MusicXML

Implemented public deterministic MusicXML serializer. Current output includes standard notation + six-line TAB structure for the supported canonical scope, guitar tuning and selected string/fret technical data while preserving supported measure/rhythm/tie/beam semantics.

### PDF

Not implemented as a production runtime feature.

PDF must remain downstream:

```text
CanonicalTabResult
      ↓
TAB MusicXML
      ↓
MuseScore/approved renderer adapter
      ↓
PDF validation
      ↓
application preview / print / share
```

Failure or absence of PDF rendering must not invalidate a valid core conversion result.

## 13. alphaTab compatibility/presentation boundary

Current isolated compatibility evidence verifies:

- real alphaTab MusicXML import
- real SVG rendering
- browser rendering in headless Chrome
- standard notation + six-line TAB
- double-digit fret rendering
- ties and beams
- bar/measure cursor
- beat cursor

This evidence does not itself implement a product viewer.

The tested alphaTab 1.8.4 synthesizer path remains unverified because an internal recursive `loadedMidiInfo` error occurred before score/MIDI/SoundFont/player readiness. Therefore production playback is not yet an accepted capability.

Planned application use:

```text
TAB MusicXML
    ↓
alphaTab application adapter
    ├─ score/TAB viewer
    ├─ measure/bar cursor
    ├─ beat cursor
    └─ playback only after stable synth/audio evidence
```

## 14. MuseScore compatibility/engraving boundary

MuseScore was always intended as an independent compatibility/semantic-validation target and optional professional engraving/PDF adapter. It is not deterministic-core authority.

Safe role:

```text
TAB MusicXML
    ↓
MuseScore Adapter
    ├─ import validation
    ├─ professional engraving check
    ├─ MusicXML re-export
    ├─ semantic round-trip comparison
    └─ optional PDF / Print
```

The tested environments did not contain MuseScore Studio, so the following remain unexecuted:

- real import
- MusicXML re-export
- semantic round-trip
- PDF export

Semantic round-trip must compare musical meaning, not XML bytes. Minimum comparison fields:

- measures
- note/rest identity/order
- pitch/octave
- durations
- dots
- ties
- beams
- staff structure
- string/fret
- tuning
- time signatures

Before process execution is productionized, the adapter requires a separate security contract covering executable discovery/version, no-shell invocation, fixed arguments, path isolation, temp cleanup, timeout/termination, bounded stdout/stderr/output, concurrency and fail-closed error handling.

### 14.1 Preserved renderer / PDF / external-process security requirements

Documentation convergence must not weaken the earlier renderer/process safety requirements. Any future MuseScore or other external renderer adapter must preserve all of the following unless a separately approved security review replaces a requirement with an equal or stronger control:

- renderer discovery must resolve an explicitly approved executable and supported version; never accept a user-supplied executable path as authority;
- invoke the renderer without a shell and with a fixed, allowlisted argument shape; user-controlled command fragments, flags or environment-driven command injection are forbidden;
- external renderer execution must have no network requirement and should run with network access disabled where the deployment model permits it;
- each conversion must use an isolated job-owned temporary directory; do not inspect unrelated directories, follow arbitrary paths, or share writable temporary storage with SesliTab, ScoreMosaic, Audiveris or another service;
- reject path traversal and unsafe symlink/file-replacement conditions before reading, writing, deleting or publishing derived files;
- never overwrite the original MusicXML input or any caller-owned artifact; renderer output is always a new derived artifact;
- cleanup may delete only files/directories created for the current renderer job and must execute on success, failure and timeout paths;
- enforce a hard process timeout, terminate the entire spawned process tree when required, and apply bounded concurrency; deployments that require hard CPU/memory ceilings must enforce them at the OS/container/worker boundary rather than assuming Node process APIs provide complete resource isolation;
- bound captured stdout/stderr and generated output size so a renderer cannot create unbounded memory/disk growth;
- a reported PDF success must correspond to a non-empty file that passes basic PDF validation, including the expected `%PDF-` signature and configured size/type ceilings, before the artifact is exposed to an application, download or share boundary;
- missing renderer, spawn failure, timeout, invalid/empty PDF, output-path mismatch and cleanup failure must produce explicit fail-closed adapter errors; they must never silently substitute a different artifact;
- renderer/PDF failure must not destroy or invalidate an already valid deterministic core result, JSON, ASCII TAB or TAB MusicXML output;
- error reporting must avoid leaking secrets, credentials, unrestricted environment data, arbitrary filesystem contents or unnecessary internal command details;
- renderer/tool versions and third-party workflow/actions used to validate this boundary must remain explicitly reviewed and pinned/controlled according to repository supply-chain policy;
- production deployment should isolate external rendering in a separately bounded worker/service when stronger process or filesystem isolation is required, with no shared writable mount, secrets or deployment authority inherited from SesliTab, ScoreMosaic, Audiveris or unrelated services.

Required security/negative-test coverage for a future renderer gate includes, at minimum:

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

These are architecture requirements only. Their presence in this document does not make MuseScore execution or PDF generation a current runtime capability.

## 15. Teacher review architecture

### 15.1 Teacher Fingering Correction

`TeacherFeedback 1.1.0` already provides an internal immutable observation contract for:

- accept
- override to a different candidate from the exact validated candidate layer
- reject

It cannot mutate the deterministic result.

Future UI:

```text
selected note
   ↓
current engine fingering + valid alternatives
   ↓
Teacher: Accept / Override / Reject
   ↓
TeacherFeedback record
```

### 15.2 Teacher Score Correction

Pitch/rhythm/notation editing is a different authority and is not implemented.

Future safe flow:

```text
immutable source musical event
      ↓
Teacher Score Correction decision + provenance
      ↓
new derived musical document
      ↓
semantic validation
      ↓
physical candidate regeneration
      ↓
deterministic optimizer
      ↓
new validated CanonicalTabResult
```

Teacher Score Correction must never mutate the original MusicXML artifact or directly patch selected TAB fields without regeneration/revalidation.

## 16. Learning / AI architecture

Current merged internal foundations:

- OptimizerObservation 1.0.0
- OptimizerObservationDigest 1.0.0
- PedagogicalFeatureVector 1.0.0
- TeacherFeedback 1.1.0
- S1 full observation validation
- S2 observation digest
- S3 ObservationAdmission 1.0.0
- S3.1 ObservationAdmissionAtomicAdapter 1.0.0
- B1 TeacherFingeringBenchmark 1.0.0
- B2 TeacherFingeringBenchmarkEvaluation 1.0.0
- LR-S0 ShadowRanking foundation
- LR-S1A ShadowRankingBenchmarkEvaluation 1.0.0
- LR-S1B.1 FingeringPathPolicySnapshot + digest
- LR-S1B.2a OptimizerPathPolicyReplay 1.0.0
- LR-S1B.2b OptimizerPathPolicyBinding + digest

Current authority rule:

```text
Deterministic optimizer = production authority
Shadow / learning infrastructure = authority none
```

No current AI component may:

- change source pitch/rhythm
- create guitar positions
- bypass physical validation
- mutate `CanonicalTabResult`
- silently become writer authority
- use TeacherFeedback as training consent

Production learned ranking remains blocked until separate durable storage, privacy/consent/lawful-use, dataset admission, model lifecycle, independent evaluation, shadow-first evidence and production opt-in gates are complete.

## 17. Polyphonic MusicXML → Guitar Arrangement architecture

PA-0 architecture/documentation and PA-1 `PolyphonicSourceModel 1.0.0` are merged. PA-2.0 documentation convergence and PA-2.1's documentation-only projection contract are merged. PA-2.2 red-first vectors were merged tests-only through PR #77. PA-2.3's minimal internal basic note/rest projector was merged through PR #78. The existing public monophonic path remains protected; PA-2.4 is the current next separately approved runtime gate.

### Parallel extension point

```text
                         MusicXML
                            │
                            ▼
               XML Safety + ProcessingBudget
                            │
                            ▼
              ParsedMusicXmlDocument 1.0.0
                            │
               ┌────────────┴────────────┐
               │                         │
               ▼                         ▼
       existing monophonic      PA-2.3–PA-2.5 runtime
           projection                 projector
               │                         │
               ▼                         ▼
     CanonicalMusicDocument      PolyphonicSourceModel 1.0.0
               │                         │
               │                         ▼
               │               GuitarArrangementPlan
               │                         │
               │                         ▼
               │             Guitar-Compatible Score
               │                         │
               │                         ▼
               │              Chord / Left-Hand Model
               │                         │
               │                         ▼
               │              Playability Validator v2
               │                         │
               └───────────────┐         │
                               ▼         ▼
                          reviewed TAB-result gate
```

PA-2.1 defines the projection contract, PA-2.2 supplies merged tests-only vectors, and PA-2.3 supplies the merged minimal internal basic note/rest slice. Runtime expansion remains split across PA-2.4–PA-2.5, followed by the separately gated PA-2.6 hardening, PA-2.7 regression and PA-2.8 CI/independent review.

### Source truth versus arrangement truth

Original MusicXML remains immutable source truth.

Future arrangement decisions must explicitly preserve provenance for transformations such as:

- PRESERVED
- OMITTED
- OCTAVE_DISPLACED
- VOICE_REDISTRIBUTED
- CHORD_REDUCED
- REVOICED
- ARPEGGIATED

These decisions must never be hidden inside parser or fingering code.

### PA-1 closure state

PA-1 is present on `main` as internal source-truth infrastructure. PR #73 recovered the historical divergent work onto a fresh current-main branch, added fail-closed hardening, reproduced and fixed the P2 aggregate-event-budget issue, passed exact-head Tests #487 and Compatibility #319, and was rebase-merged. Post-merge Tests #488 passed on `main`.

The former recovery branch was deleted only after a read-only check confirmed the rebased `main` tree and former branch tree were content-equivalent.

PA-1 does not implement `ParsedMusicXmlDocument` → `PolyphonicSourceModel` projection, simultaneous-event grouping, arrangement decisions, guitar voicing/fingering/barre authority, or any package-root public API.

### PA safe sequence

1. PA-0 documentation/architecture — merged
2. PA-1 `PolyphonicSourceModel 1.0` — merged internal
3. PA-2.0 PA-1 → PA-2 documentation convergence — merged documentation
4. PA-2.1 projection contract — merged documentation-only through PR #75; no runtime authority
5. PA-2.2 valid polyphonic red-first fixtures/tests — merged tests-only through PR #77
6. PA-2.3 minimal internal note/rest projector — merged internal through PR #78
7. PA-2.4 `backup` / `forward` cursor semantics — current next separate gate requiring explicit approval
8. PA-2.5 `<chord/>`, multiple voice and staff 1–2 projection
9. PA-2.6 hostile/budget/deadline/cancellation negatives
10. PA-2.7 full regression + monophonic compatibility
11. PA-2.8 GitHub CI + independent review
12. PA-3 simultaneous-event/chord contract
13. PA-4 arrangement-decision + provenance
14. PA-5 deterministic melody/bass/voice analysis
15. PA-6 deterministic reduction/octave rules
16. PA-7 guitar chord/voicing candidate generation
17. PA-8 left-hand shape + finger assignment + barre/partial-barre
18. PA-9 Physical Playability Validator v2
19. PA-10 Canonical v1/v2 compatibility review
20. PA-11 teacher-approved arrangement benchmark
21. PA-12 internal polyphonic E2E + monophonic compatibility
22. PA-13 separately approved public arrangement API
23. PA-14 ScoreMosaic/SesliTab adapter integration

No early PA gate changes current public monophonic support. Completion of one PA-2.x step does not authorize the next step automatically.

## 18. Application / presentation architecture

No production application UI is implemented yet.

Future downstream structure:

```text
Core Engine
   ↓
Application Adapter
   ├─ File Open / Preflight / Convert state
   ├─ Score + TAB Viewer
   │     └─ alphaTab adapter
   ├─ Cursor
   │     ├─ measure/bar
   │     └─ beat
   ├─ Playback
   │     └─ Play / Pause / Stop after stable evidence
   ├─ Error / Warning Presentation
   ├─ Fingering Inspector
   ├─ Teacher Fingering Correction
   ├─ Teacher Score Correction
   ├─ Export Center
   ├─ MuseScore/PDF Adapter
   ├─ PDF Viewer / Print / Share
   └─ Project Persistence
```

Application rules:

- UI state is not canonical musical truth.
- Renderer state is not canonical musical truth.
- Playback state is not canonical musical truth.
- PDF is a derived presentation artifact.
- project persistence must version source/canonical/presentation/edit state explicitly.
- user-facing errors must branch on stable error codes rather than message text.

## 19. Safe development order — 2026-08-12

### Completed stabilization

1. Documentation Convergence — completed
2. G0.1 administrator-bypass governance hardening — completed
3. historical branch inventory / orphan-work audit — completed
4. PA-1 recovery audit and closure — completed
5. PA-2.0 PA-1 → PA-2 documentation convergence — completed
6. PA-2.1 projection contract — merged documentation-only through PR #75; no runtime authority

### PA-2 transition gates

7. PA-2.2 valid polyphonic red-first fixtures/tests — completed tests-only through PR #77
8. PA-2.3 minimal internal note/rest projector — completed through PR #78
9. PA-2.4–PA-2.8 cursor/chord projection, hardening, regression and CI sequence — separately gated; PA-2.4 is next

### Notation and compatibility foundations

10. Musical Notation Coverage Contract
11. MuseScore semantic compatibility gate
12. independent real-world MusicXML E2E fixture gate

### Application/presentation

13. Application/Presentation architecture contract
14. alphaTab application viewer
15. application measure/beat cursor
16. playback adapter + Play/Pause/Stop after synth/audio evidence
17. Teacher Fingering Correction UI
18. Teacher Score Correction contract/UI
19. export center
20. MuseScore/PDF renderer adapter
21. PDF viewer / print / download / share
22. project save/reopen persistence
23. full application E2E

### Polyphonic arrangement

24. continue PA-3…PA-14 only after PA-2.8 closure and in the approved order

### Learned AI

25. durable production admission storage
26. privacy/consent/lawful-use contract
27. authorized dataset admission
28. real learned training + model registry
29. independent learned evaluation
30. learned shadow mode
31. separately approved production opt-in

Completion of one gate never authorizes later gates automatically.

## 20. CI and governance architecture

Current protections:

- third-party workflow actions pinned to immutable SHAs
- `main` protected
- required Node.js 18 / 20 / 22 tests
- required alphaTab import/SVG compatibility contexts
- required browser renderer/cursor diagnostic context
- G0.1 administrator enforcement completed
- historical branch audit completed

Repository-settings changes remain a separate approval gate from code/docs development.

Historical branch cleanup must begin with a read-only classification of branch head, merged status, unique commits and PR history. Do not bulk-delete branches. The PA-1 recovery branch cleanup was performed only after merge and content-equivalence verification.

## 21. High-risk change protocol

The following are high-risk and must not change incidentally:

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

## 22. Historical architecture note

Earlier sections of this repository described a planned initial directory tree and future PDF renderer as though those were filenames still to be created. That plan served as a useful starting map, but current implementation authority is the merged code/contracts listed above.

Do not infer missing capability from a missing planned filename. Do not infer implemented capability from a planned section. Always classify evidence as one of:

- merged runtime
- merged internal/non-authoritative
- compatibility verified
- documentation only
- merged documentation only
- unmerged work
- not implemented
- blocked by prerequisites
