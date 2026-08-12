# PA-6 Deterministic Reduction + Octave Contract

## Status

- Gate: `PA-6`
- Contract: `DeterministicReductionPlan 1.0.0`
- Scope: internal deterministic execution of the PA-6 reduction/octave subset
- Authoritative runtime baseline at stage start: `main` `c9cc504558630b48e34c1fb0e0753963b24d181e`
- PA-5 runtime dependency: internal `DeterministicVoiceAnalysis 1.0.0`, merged through PR #89
- PA-4 runtime dependency: internal `GuitarArrangementPlan 1.0.0`, merged through PR #87
- Source dependency: validated `PolyphonicSourceModel 1.0.0`
- Public package API: unchanged
- Guitar string/fret/finger/barre authority: none
- Chord/voicing candidate authority: none
- `CanonicalTabResult 1.0.0`: unchanged

PA-6 converts a narrowly executable subset of already-explicit PA-4 arrangement decisions into deterministic per-source-note keep/omit/octave instructions. It does not choose guitar positions, left-hand shapes, chord voicings, arpeggio timing, or learned arrangement policy.

At PA-6 stage start, the read-first central status documents still describe PA-4 as the latest closed documentation baseline even though PA-5 runtime is merged and post-merge verified. PA-6 must use the GitHub-verified runtime baseline above, and central status convergence must be repaired before PA-6 merge closure is declared complete.

## Architectural position

```text
PolyphonicSourceModel 1.0.0
  ↓
PA-3 SimultaneousEventModel 1.0.0
  ↓
PA-4 GuitarArrangementPlan 1.0.0
  ↓
PA-5 DeterministicVoiceAnalysis 1.0.0
  ↓
PA-6 DeterministicReductionPlan 1.0.0
  ↓
PA-7 guitar chord / voicing candidates
```

## Fixed policy identity

PA-6 version 1 uses exactly this policy identity:

```text
STANDARD_GUITAR_REGISTER_20_FRET_1.0
```

The policy derives a global register envelope from the repository's current standard six-string tuning and default 0–20 fret range, without choosing any physical string/fret position.

For version 1 the derived envelope is:

- minimum MIDI: `40` (`E2`)
- maximum MIDI: `84` (`C6`, reachable as E4 + 20 frets)

This envelope is only a coarse register boundary. A MIDI pitch inside the envelope is not thereby declared physically playable in every chord context. PA-7/PA-9 remain responsible for candidate generation and physical playability.

Custom tuning/fret-range execution is not authorized by PA-6 v1 and requires a separately reviewed contract extension.

## Builder boundary

```text
createDeterministicReductionPlan(sourceModel, arrangementDecisions, runtime?)
```

The builder must:

1. revalidate the supplied `PolyphonicSourceModel 1.0.0` fail closed;
2. rebuild `GuitarArrangementPlan 1.0.0` internally from the validated source plus raw PA-4 decision input;
3. rebuild `DeterministicVoiceAnalysis 1.0.0` internally from the same validated source;
4. never trust caller-supplied PA-3, PA-4 or PA-5 derived objects;
5. emit exactly one immutable PA-6 instruction for every source note, preserving canonical source-note order;
6. preserve exact PA-4 decision provenance and exact PA-3 group provenance where one exists;
7. apply only the executable PA-6 decision subset defined below;
8. fail closed for decision kinds whose executable semantics belong to later gates;
9. reuse the existing optional `ProcessingRuntime 1.0.0` and checkpoints;
10. preserve current package-root exports and public monophonic conversion unchanged.

## Executable PA-6 decision subset

### `PRESERVED`

- exactly one source note is kept;
- source pitch is not changed;
- `targetMidi` equals the validated source MIDI pitch;
- `octaveShiftSemitones = 0`;
- source MIDI must already be within the fixed PA-6 register envelope;
- otherwise PA-6 fails closed rather than silently changing a `PRESERVED` decision.

### `OMITTED`

- exactly one source note is omitted;
- `targetMidi = null`;
- `octaveShiftSemitones = null`;
- omission is explicit and remains bound to the PA-4 decision ID.

### `OCTAVE_DISPLACED`

- exactly one source note is kept;
- pitch class must remain unchanged;
- target MIDI must be within the fixed PA-6 register envelope;
- target MIDI must differ from the source MIDI by a non-zero integer multiple of 12;
- choose the in-envelope pitch-class-equivalent target with the smallest absolute octave displacement;
- when equal-distance upward/downward targets both exist, choose the lower target (`DOWNWARD_TIE_BREAK_1.0`);
- no string/fret position is selected.

### `CHORD_REDUCED`

PA-6 version 1 supports only a conservative outer-register reduction:

- the PA-4 decision must cover one exact PA-3 simultaneous group;
- PA-5 analysis for that group must contain exactly one `MELODY_CANDIDATE` and exactly one `BASS_CANDIDATE`;
- at least one member must be `INNER_VOICE_CANDIDATE`, so the operation performs a real reduction;
- no group member may be `OUTER_VOICE_AMBIGUOUS`;
- unique melody and bass candidates are kept at their original MIDI pitch;
- inner-voice candidates are omitted;
- kept outer pitches must already lie inside the PA-6 register envelope;
- PA-6 does not octave-shift a chord-reduction survivor implicitly;
- if any condition is not met, PA-6 fails closed rather than choosing among ambiguous tones.

## Deferred PA-4 decision kinds

These PA-4 decisions are valid representations but are not executable in PA-6 v1:

- `VOICE_REDISTRIBUTED`
- `REVOICED`
- `ARPEGGIATED`

PA-6 must reject them with its own fail-closed error. It must not invent target voices, new pitches, chord voicings, or timing.

## Deterministic output

```text
DeterministicReductionPlan
├── documentType: "DeterministicReductionPlan"
├── contractVersion: "1.0.0"
├── policy: "STANDARD_GUITAR_REGISTER_20_FRET_1.0"
├── octaveTieBreak: "DOWNWARD_TIE_BREAK_1.0"
├── source
│   ├── documentType: "PolyphonicSourceModel"
│   ├── contractVersion: "1.0.0"
│   └── partId
├── arrangement
│   ├── documentType: "GuitarArrangementPlan"
│   └── contractVersion: "1.0.0"
├── analysis
│   ├── documentType: "DeterministicVoiceAnalysis"
│   ├── contractVersion: "1.0.0"
│   └── analysisBasis: "ONSET_LOCAL_REGISTER_1.0"
├── registerEnvelope
│   ├── minimumMidi: 40
│   └── maximumMidi: 84
├── instructionCount
└── instructions[]
    ├── sourceEventId
    ├── decisionId
    ├── decisionType
    ├── sourceGroupId
    ├── sourceRole
    ├── disposition: "KEEP" | "OMIT"
    ├── targetMidi: integer | null
    ├── octaveShiftSemitones: integer | null
    └── ruleId
```

PA-6 instructions do not copy onset, duration, source voice/staff, string, fret, finger, barre, left-hand shape, target voice, or executable arpeggio timing. Those facts remain in source truth or later contracts.

## Fixed rule IDs

PA-6 v1 emits only these rule IDs:

- `PRESERVE_IN_REGISTER`
- `OMIT_EXPLICIT`
- `OCTAVE_NEAREST_IN_REGISTER`
- `CHORD_REDUCTION_KEEP_OUTER`
- `CHORD_REDUCTION_OMIT_INNER`

No rule ID grants physical playability authority.

## Ordering and provenance

- `instructions[]` follows canonical source-note order.
- Every source note receives exactly one PA-6 instruction.
- `decisionId` must be the deterministic PA-4 decision ID that covers the source note.
- `sourceGroupId` must match PA-4/PA-3 group provenance for group decisions and be `null` for single-note decisions.
- `sourceRole` is copied only from the internally recomputed PA-5 analysis for the same source note.
- no caller-supplied derived provenance is trusted.

## Authority boundaries

PA-6 must not:

- change the original MusicXML or `PolyphonicSourceModel`;
- choose which PA-4 decision type should have been selected;
- reinterpret PA-5 candidate labels as semantic melody/bass truth;
- select string, fret, finger, barre, hand position or chord shape;
- generate chord/voicing candidates;
- create a new target voice for `VOICE_REDISTRIBUTED`;
- generate replacement pitches for `REVOICED`;
- generate arpeggio timing for `ARPEGGIATED`;
- modify `CanonicalMusicDocument` or `CanonicalTabResult 1.0.0`;
- weaken public monophonic fail-closed behavior;
- expose a public polyphonic conversion API;
- invoke learned/shadow ranking;
- authorize PA-7 or later gates.

## Safety and processing

PA-6 reuses the existing hostile-input validation in `PolyphonicSourceModel`, PA-4 arrangement-plan construction, PA-5 analysis and the existing processing runtime. It introduces no second XML parser or independent budget system.

The builder adds checkpoints during source indexing, decision execution, octave-candidate evaluation, chord-reduction membership resolution and instruction emission.

Caller-owned source/decision data is not mutated. Returned arrays and objects are deeply frozen.

## Explicit limitations

- fixed standard tuning + 0–20 fret global register envelope only;
- register inclusion is not proof of physical playability;
- no custom tuning execution in v1;
- no voice redistribution execution;
- no revoicing execution;
- no arpeggiation execution;
- no sustained-note sonority analysis beyond PA-5's onset-local basis;
- no phrase, harmony, style, teacher or AI inference;
- no real previously uploaded Audiveris/Scarlatti file is considered PA-6 E2E evidence unless explicitly executed through this runtime.

## Acceptance boundary

PA-6 is complete only when evidence shows:

1. contract identity, fixed policy identity, fixed register envelope and fixed tie-break rule are stable;
2. `PRESERVED` keeps only an already in-register source pitch unchanged;
3. `OMITTED` produces explicit omission with exact PA-4 provenance;
4. `OCTAVE_DISPLACED` preserves pitch class, uses a non-zero multiple-of-12 shift, lands inside the fixed register envelope and applies the documented lower-target tie break;
5. `CHORD_REDUCED` keeps only unique PA-5 outer candidates, omits inner candidates and rejects ambiguous/no-op reductions;
6. deferred PA-4 decision kinds fail closed without inventing semantics;
7. every source note receives exactly one instruction in canonical source order;
8. PA-3/PA-4/PA-5 provenance is internally recomputed/preserved rather than accepted from caller-derived objects;
9. hostile/invalid source or arrangement decision input fails closed through existing validators;
10. deadline/cancellation checkpoints remain enforced;
11. output is deeply immutable and contains no physical guitar-position or later-gate authority fields;
12. package-root exports and public monophonic conversion behavior remain unchanged;
13. full repository regression and required GitHub CI pass;
14. central status-document drift about PA-5 is repaired before PA-6 closure is declared complete.

PA-6 completion does not authorize PA-7.