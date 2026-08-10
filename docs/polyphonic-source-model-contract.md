# PolyphonicSourceModel 1.0 Contract

## Status

- Gate: `PA-1`
- Contract: `PolyphonicSourceModel 1.0.0`
- Scope: internal source-truth foundation
- Public package API: unchanged
- XML parser wiring: not part of PA-1
- Arrangement authority: none
- Guitar fingering authority: none
- `CanonicalTabResult 1.0.0`: unchanged

`PolyphonicSourceModel 1.0.0` is the first runtime foundation on the separately gated Polyphonic MusicXML → Guitar Arrangement path. It represents validated musical source facts only. It does not perform MusicXML parsing, guitar arrangement, chord grouping, string/fret selection, fingering, barre detection, AI scoring, or writer serialization.

## Architectural position

```text
MusicXML
  ↓
XML Safety + ProcessingBudget
  ↓
ParsedMusicXmlDocument 1.0.0
  ↓
PA-2 polyphonic projection — not implemented by PA-1
  ↓
PolyphonicSourceModel 1.0.0
  ↓
PA-3 simultaneous-event / chord model
  ↓
PA-4 arrangement decision + provenance
```

PA-1 intentionally does not connect `ParsedMusicXmlDocument` to this model. That projection remains PA-2 so the current monophonic parser and conversion pipeline remain untouched.

## Source-truth rule

The model answers only:

> What musical source facts did the validated MusicXML contain?

It must not answer:

- which source note should be omitted,
- which note should move octave,
- which simultaneous notes form the preferred guitar chord,
- which string/fret/finger/barre should be used,
- which voice is melody or bass,
- which arrangement candidate is pedagogically preferred.

Those decisions belong to later separately versioned gates.

## Contract identity

```text
documentType: "PolyphonicSourceModel"
contractVersion: "1.0.0"
```

The implementation lives at `src/music/polyphonicSourceModel.js` and remains internal; it is not exported from `src/index.js`.

## Data shape

```text
PolyphonicSourceModel
├── documentType
├── contractVersion
├── source
│   ├── format
│   ├── musicXmlVersion
│   └── partId
├── measureCount
├── eventCount
└── measures[]
    ├── measureId
    ├── index
    ├── number
    ├── implicit
    ├── divisions
    ├── timeSignature
    │   ├── beats
    │   └── beatType
    ├── expectedDurationDivisions
    └── events[]
        ├── sourceEventId
        ├── sourceOrder
        ├── type
        ├── voice
        ├── staff
        ├── onsetDivisions
        ├── durationDivisions
        ├── pitch?                # note only
        │   ├── step
        │   ├── alter
        │   ├── octave
        │   ├── midi
        │   └── written
        ├── tieStart
        ├── tieStop
        └── source
            ├── partId
            ├── measureIndex
            ├── measureNumber
            ├── noteIndex
            └── chordWithPrevious
```

## Initial PA-1 musical boundary

PA-1 is intentionally narrow:

- `source.format` must be `score-partwise`;
- exactly one selected source part is represented per model;
- source events may use staff 1 or 2;
- multiple bounded non-empty MusicXML voice identifiers are allowed;
- overlapping event onsets are allowed;
- event source order is preserved independently from musical onset time;
- source `<chord/>` semantics may be represented only as `source.chordWithPrevious`;
- notes and rests are represented;
- pitch is represented for note events only;
- source timing is represented in divisions.

Arbitrary multipart/orchestral reduction, staff 3+, grace semantics, tuplets, `.mxl`, chord-group construction, arrangement decisions and left-hand modeling remain outside PA-1.

## Voice and staff rules

`voice` is a bounded non-empty string rather than a forced integer. PA-1 preserves source identity without narrowing future MusicXML projection to numeric-only voice labels.

`staff` is a positive safe integer and PA-1 accepts only values 1 or 2. This is the approved early piano-like scope. Expanding beyond two staves requires a separate contract decision.

## Source order versus onset

`events[]` preserves source-note order. It is not sorted by `onsetDivisions`.

This distinction is required because polyphonic MusicXML commonly changes its musical cursor using constructs such as `backup` and `forward`. A later PA-2 projection may therefore produce source order such as:

```text
sourceOrder 0 → voice "1" → onset 0
sourceOrder 1 → voice "1" → onset 4
sourceOrder 2 → voice "2" → onset 0
sourceOrder 3 → voice "2" → onset 4
```

PA-1 validates that onset is a non-negative safe integer and that onset + duration does not exceed the declared measure duration. It does not require onsets to be monotonic.

## Source chord marker

`source.chordWithPrevious` preserves source `<chord/>` meaning only. It is not a `ChordGroup` and does not create a guitar voicing.

When true, PA-1 requires the immediately preceding source event to be a note with the same voice, staff and onset. This prevents malformed source-chord markers from silently inventing simultaneity.

Actual simultaneous-event grouping remains PA-3 because simultaneity can also arise across separate voices without a source `<chord/>` marker.

## Deterministic identities

PA-1 requires deterministic source identities:

```text
measureId = <partId>:measure:<measureIndex>
sourceEventId = <partId>:measure:<measureIndex>:note:<sourceOrder>
```

`source.noteIndex` must equal `sourceOrder` and provenance must match the containing part and measure.

These identities are source-traceability keys only. They are not database IDs, signatures, trusted-producer attestations, or arrangement-decision identifiers.

## Pitch integrity

For note events:

- step must be `A` through `G`;
- alter must be an integer from -2 through 2;
- octave must produce a valid MIDI value through the existing pitch utility;
- declared MIDI must exactly match pitch components;
- declared written pitch must exactly match the canonical spelling derived from step/alter/octave.

Rest events must not contain pitch.

PA-1 does not transpose or octave-shift source pitch.

## Timing integrity

- `divisions`, time-signature components, expected measure duration and event duration must be positive safe integers;
- `onsetDivisions` must be a non-negative safe integer;
- onset + duration must remain within the safe-integer range;
- an event may not extend beyond the measure's declared expected duration;
- `expectedDurationDivisions` must agree exactly with divisions and time signature.

PA-1 permits overlapping voices and therefore does not sum all event durations as if the model were monophonic.

## Hostile-input boundary

`validatePolyphonicSourceModel()` and `createPolyphonicSourceModel()` fail closed on malformed/untrusted in-memory graphs.

The contract rejects:

- non-plain objects,
- Proxy objects,
- accessor properties,
- symbol properties,
- unknown fields,
- custom array subclasses,
- sparse arrays,
- custom array properties,
- cycles,
- shared object references,
- `NaN` / `Infinity`,
- unsafe integers,
- negative onset or non-positive duration,
- invalid pitch/MIDI/written-pitch combinations,
- inconsistent deterministic IDs/provenance,
- inconsistent aggregate measure/event counts,
- source chord markers inconsistent with the preceding source event.

The model also inherits the current default `ProcessingBudget` ceilings for maximum measures and total events. PA-2 may later bind projection to an explicit caller-supplied processing runtime; PA-1 does not introduce a second runtime budget API.

## Immutability

Successful validation returns a newly constructed deeply immutable model graph. The returned graph does not retain mutable object/array references from caller input.

Source MusicXML remains the immutable source artifact. `PolyphonicSourceModel` is a validated projection of source truth, not a mutable arrangement workspace.

## Explicit non-authorities

PA-1 must not:

- alter current monophonic parser rejection rules;
- modify `convertMusicXmlToCanonicalTab()`;
- modify `CanonicalMusicDocument`;
- modify `CanonicalTabResult 1.0.0`;
- export a new package-root API;
- generate guitar string/fret candidates;
- choose left-hand fingering;
- create barre/partial-barre data;
- classify melody/bass/inner voices;
- omit or transpose notes;
- perform chord reduction/revoicing/arpeggiation;
- invoke LR-S0 or another learned component;
- read files, network resources, environment variables or external callbacks.

## PA-1 acceptance boundary

PA-1 is complete only when evidence shows:

1. valid two-staff / multi-voice / overlapping-onset source models validate;
2. source `<chord/>` marker provenance validates without creating chord-group authority;
3. hostile object graphs fail closed;
4. invalid numeric/timing/pitch/provenance data fails closed;
5. successful outputs are deeply immutable;
6. package-root public exports remain unchanged;
7. current monophonic parser/conversion behavior remains unchanged;
8. full repository regression and required GitHub CI pass.

Passing PA-1 does not authorize PA-2 projection, PA-3 chord grouping, arrangement decisions, public polyphonic conversion, or ScoreMosaic/SesliTab integration.
