# PA-3 Simultaneous-Event Contract

## Status

- Gate: `PA-3`
- Contract: `SimultaneousEventModel 1.0.0`
- Scope: internal deterministic source-fact grouping
- Input: validated `PolyphonicSourceModel 1.0.0`
- Public package API: unchanged
- Arrangement authority: none
- Guitar fingering authority: none
- `CanonicalTabResult 1.0.0`: unchanged

PA-3 turns validated PA-2 source events into a deterministic view of note simultaneity. It answers only which source note events begin at the same musical onset in the same measure.

It does **not** decide which notes should survive a guitar reduction, which notes form a preferred guitar voicing, which strings/frets/fingers should be used, or which voice is melody/bass. Those remain later gates.

## Architectural position

```text
ParsedMusicXmlDocument 1.0.0
  ↓
PA-2 internal projection
  ↓
PolyphonicSourceModel 1.0.0
  ↓
PA-3 SimultaneousEventModel 1.0.0
  ↓
PA-4 arrangement-decision + provenance contract
```

## Grouping rule

Within each measure:

1. consider note events only;
2. group notes by exact `onsetDivisions` equality;
3. create a group only when at least two notes share that onset;
4. source `<chord/>` is evidence of source-local simultaneity but is not required for grouping;
5. equal onset across different voices and/or staff 1–2 also forms the same simultaneous group;
6. rest events never become group members;
7. duration equality is not required;
8. group order is ascending musical onset;
9. member order is original `PolyphonicSourceModel.events[]` source order.

This means a MusicXML source chord and a separate voice entering at the same onset become one source-fact group, while still preserving each member's original `sourceEventId`.

## Deterministic output

```text
SimultaneousEventModel
├── documentType: "SimultaneousEventModel"
├── contractVersion: "1.0.0"
├── source
│   ├── documentType: "PolyphonicSourceModel"
│   ├── contractVersion: "1.0.0"
│   └── partId
├── measureCount
├── groupCount
└── measures[]
    ├── measureId
    ├── index
    └── groups[]
        ├── groupId
        ├── onsetDivisions
        ├── memberCount
        ├── sourceEventIds[]
        ├── hasSourceChordMarker
        ├── spansVoices
        └── spansStaves
```

Group identity is deterministic:

```text
groupId = <measureId>:simultaneous:<onsetDivisions>
```

The model intentionally stores source-event references rather than copied pitch/duration/fingering fields. Consumers that need musical details must resolve those identifiers against the validated `PolyphonicSourceModel` source truth.

## Source-fact flags

- `hasSourceChordMarker` is true when any member after its source predecessor carried `source.chordWithPrevious: true`.
- `spansVoices` is true when members contain more than one distinct source voice identifier.
- `spansStaves` is true when members contain more than one distinct source staff value.

These flags are descriptive source facts only. They do not create guitar voicing or arrangement authority.

## Safety boundary

`createSimultaneousEventModel()` must revalidate the supplied `PolyphonicSourceModel` fail closed before grouping. PA-3 does not accept an independently supplied untrusted group graph and therefore introduces no second persistence/deserialization authority.

The returned model must be deeply immutable. The builder must not mutate the supplied source model.

The optional existing `ProcessingRuntime` may be reused for source-model validation and PA-3 grouping checkpoints. PA-3 introduces no second processing-budget system.

## Explicit non-authorities

PA-3 must not:

- modify source pitch, duration, onset, voice or staff;
- infer a preferred guitar chord or voicing;
- omit, octave-shift, transpose, revoice or arpeggiate notes;
- assign guitar string, fret, finger, barre or hand position;
- classify melody, bass or inner voices;
- modify `CanonicalMusicDocument` or `CanonicalTabResult 1.0.0`;
- modify current public monophonic rejection rules;
- add package-root exports;
- invoke learned/shadow ranking;
- authorize PA-4 or later arrangement behavior.

## Acceptance boundary

PA-3 is complete only when evidence shows:

1. source `<chord/>` notes group by onset;
2. separate voices at the same onset group without requiring `<chord/>`;
3. staff 1–2 notes at the same onset group deterministically;
4. rests are excluded and singleton notes do not create groups;
5. differing durations do not prevent same-onset grouping;
6. groups are ordered by onset while members preserve source order;
7. deterministic source IDs and group IDs are preserved;
8. output is deeply immutable and contains no guitar arrangement fields;
9. malformed/untrusted source models fail closed through `PolyphonicSourceModel` validation;
10. public package exports and monophonic conversion behavior remain unchanged;
11. full repository regression and required GitHub CI pass.

PA-3 completion does not authorize PA-4 arrangement decisions.