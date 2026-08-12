# PA-5 Deterministic Melody/Bass/Voice Analysis Contract

## Status

- Gate: `PA-5`
- Contract: `DeterministicVoiceAnalysis 1.0.0`
- Scope: internal deterministic source-score register/voice analysis
- Input: validated `PolyphonicSourceModel 1.0.0`
- PA-3 dependency: `SimultaneousEventModel 1.0.0` is recomputed internally from the validated source model for exact-onset provenance
- PA-4 relationship: PA-5 is sequenced after PA-4 but does not reinterpret or execute `GuitarArrangementPlan 1.0.0` decisions
- Public package API: unchanged
- Arrangement/reduction authority: none
- Guitar fingering authority: none
- `CanonicalTabResult 1.0.0`: unchanged

PA-5 adds deterministic analysis facts that later arrangement policy may consume. It does not decide which notes to omit, transpose, redistribute, reduce, revoice, arpeggiate, or place on the guitar.

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
PA-6 deterministic reduction/octave rules
```

PA-5 remains source-derived analysis. PA-6 may later combine explicit PA-4 provenance with PA-5 analysis under a separately approved transformation policy.

## Analysis basis

`analysisBasis` is fixed to:

```text
ONSET_LOCAL_REGISTER_1.0
```

The model analyses note events beginning at the same measure-local `onsetDivisions` value. It does not claim to identify semantic melody from phrasing, harmony, accent, dynamics, articulation, teacher intent, or learned inference.

For a single note beginning at an onset:

- role = `SOLE_NOTE`

For two or more notes beginning at the same onset:

- the unique highest MIDI pitch = `MELODY_CANDIDATE`;
- the unique lowest MIDI pitch = `BASS_CANDIDATE`;
- pitches strictly between the minimum and maximum = `INNER_VOICE_CANDIDATE`;
- tied highest or tied lowest pitches = `OUTER_VOICE_AMBIGUOUS` for the tied notes;
- if every note at the onset has the same MIDI pitch, every member = `OUTER_VOICE_AMBIGUOUS`.

The words `MELODY_CANDIDATE` and `BASS_CANDIDATE` are deterministic register labels only. They are not automatic arrangement decisions and do not assert that the highest sounding attack is always the musically intended melody or the lowest sounding attack is always the intended bass.

## Fixed role vocabulary

PA-5 accepts/produces exactly these analysis roles:

- `SOLE_NOTE`
- `MELODY_CANDIDATE`
- `BASS_CANDIDATE`
- `INNER_VOICE_CANDIDATE`
- `OUTER_VOICE_AMBIGUOUS`

No role implies omit/preserve/revoice/reduce/transpose authority.

## Builder boundary

```text
createDeterministicVoiceAnalysis(sourceModel, runtime?)
```

The builder must:

1. revalidate the supplied `PolyphonicSourceModel 1.0.0` fail closed;
2. recompute PA-3 simultaneous groups internally rather than trusting caller-supplied grouping data;
3. analyse only note events; rests are excluded from event-role output;
4. classify same-onset notes only by validated source MIDI register using the fixed rules above;
5. preserve deterministic source-event provenance and exact PA-3 `sourceGroupId` when one exists;
6. assign `sourceGroupId: null` to singleton onsets;
7. preserve canonical source-event order in `eventAnalyses[]`;
8. summarize source voice/staff lanes in first-source-occurrence order;
9. count role occurrences per source voice/staff lane without inventing a dominant musical role;
10. reuse the existing optional `ProcessingRuntime 1.0.0` and checkpoints;
11. return a deeply immutable analysis;
12. preserve the current public monophonic path and package-root exports unchanged.

## Deterministic output

```text
DeterministicVoiceAnalysis
├── documentType: "DeterministicVoiceAnalysis"
├── contractVersion: "1.0.0"
├── analysisBasis: "ONSET_LOCAL_REGISTER_1.0"
├── source
│   ├── documentType: "PolyphonicSourceModel"
│   ├── contractVersion: "1.0.0"
│   └── partId
├── grouping
│   ├── documentType: "SimultaneousEventModel"
│   └── contractVersion: "1.0.0"
├── eventAnalysisCount
├── eventAnalyses[]
│   ├── sourceEventId
│   ├── sourceGroupId
│   ├── voice
│   ├── staff
│   └── role
├── voiceSummaryCount
└── voiceSummaries[]
    ├── voice
    ├── staff
    ├── noteCount
    ├── soleNoteCount
    ├── melodyCandidateCount
    ├── bassCandidateCount
    ├── innerVoiceCandidateCount
    └── ambiguousOuterCount
```

`eventAnalyses[]` contains no copied pitch/rhythm transformation fields. The authoritative pitch/rhythm facts remain in `PolyphonicSourceModel 1.0.0`.

A voice lane is identified only by the pair `(staff, voice)`. PA-5 does not synthesize a new persistent voice identity and does not merge distinct source voice identifiers.

## Ordering

- `eventAnalyses[]` follows canonical source-note order from the validated source model.
- `voiceSummaries[]` follows the first source-note occurrence of each distinct `(staff, voice)` lane.
- No output ordering depends on JavaScript object key enumeration, hash iteration, locale, or floating-point averages.

## Provenance and authority

PA-5 may derive only role-analysis facts. It must not:

- mutate or replace a PA-4 arrangement decision;
- choose `PRESERVED`, `OMITTED`, `OCTAVE_DISPLACED`, `VOICE_REDISTRIBUTED`, `CHORD_REDUCED`, `REVOICED`, or `ARPEGGIATED`;
- decide target octave, target voice, surviving chord tones, revoiced pitches, or arpeggio timing;
- infer semantic melody from style, phrase, accent, dynamics, harmony, or AI;
- change source pitch/rhythm/onset/voice/staff;
- choose guitar string, fret, finger, barre, hand position, or voicing;
- expose a public polyphonic conversion API;
- modify `CanonicalMusicDocument` or `CanonicalTabResult 1.0.0`;
- weaken public monophonic fail-closed behavior;
- invoke learned/shadow ranking;
- authorize PA-6 or later gates.

## Safety and processing

The builder reuses `validatePolyphonicSourceModel()` and `createSimultaneousEventModel()` and therefore inherits their hostile-input and source-integrity checks. It introduces no second source validator and no second processing-budget system.

PA-5 adds checkpoints while collecting source notes, grouping onsets, classifying members, and building voice summaries. Deadline/cancellation errors from the existing runtime remain authoritative.

Caller-owned source input is not mutated. Returned arrays and objects are deeply frozen.

## Explicit limitations

`ONSET_LOCAL_REGISTER_1.0` is deliberately narrow:

- it compares note attacks at exactly equal source onset only;
- it does not track a sustained note from an earlier onset as part of a later vertical sonority;
- it does not perform phrase segmentation or voice-leading inference;
- it does not resolve crossing voices into semantic melody/bass identities;
- it does not use dynamics, articulation, lyrics, harmony, form, style, teacher labels, or AI.

Expanding beyond this deterministic basis requires a separately reviewed contract change. A future learned or richer musical-context analyser must remain advisory until independently gated.

## Acceptance boundary

PA-5 is complete only when evidence shows:

1. the contract identity, analysis basis, and five-role vocabulary are fixed;
2. singleton note onsets produce `SOLE_NOTE` with `sourceGroupId: null`;
3. unique highest/lowest and intermediate same-onset pitches produce melody/bass/inner candidates deterministically;
4. tied register extrema fail safe to `OUTER_VOICE_AMBIGUOUS` rather than arbitrary source-order role selection;
5. cross-voice and cross-staff simultaneous notes use the same register rules and preserve exact PA-3 group provenance;
6. rests are not emitted as note-role analyses;
7. source voice/staff summaries are deterministic and count role occurrences correctly;
8. hostile/invalid source models are revalidated fail closed;
9. deadline/cancellation checkpoints remain enforced;
10. output is deeply immutable and contains no arrangement, guitar fingering, or executable transformation fields;
11. package-root exports and public monophonic conversion behavior remain unchanged;
12. full repository regression and required GitHub CI pass.

PA-5 completion does not authorize PA-6.