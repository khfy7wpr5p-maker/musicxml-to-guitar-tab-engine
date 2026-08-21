# PA-11.4A Revoicing Tone Candidate Model

## Status

Internal evaluation-only candidate contract. It does **not** activate PA-6 `REVOICED` or `VOICE_REDISTRIBUTED` execution.

## Motivation

The PA-11.3L blind baseline measured `2 / 4` teacher-approved matches (`50%`). Cases 2 and 3 were `PHYSICALLY_VALID_NOT_APPROVED`: the engine preserved the exact source pitches and found playable PA-8/PA-9 shapes, but it did not generate the teacher-approved octave-distributed C and Cmaj7 realizations.

PA-11.4A introduces the smallest missing primitive: for each source pitch in a simultaneous group, enumerate every standard-guitar string/fret realization of the **same pitch class** across the existing 20-fret register. It does not combine those atoms into a complete chord and does not choose a winner.

## Contract

```text
RevoicingToneCandidateModel 1.0.0
policy: PITCH_CLASS_COMPLETE_STANDARD_GUITAR_20_FRET_1.0
mode: evaluation-only
authority: none
```

Input:

```text
validated PolyphonicSourceModel 1.0.0
```

The builder recomputes `SimultaneousEventModel 1.0.0` internally and considers only simultaneous groups of 2–6 pitched notes.

### Version 1 source restriction

Every source note in one group must have a unique pitch class. Duplicate source pitch classes are fail-closed because mapping multiple octave-equivalent source notes to realized tones is ambiguous and needs a separate later contract.

## Candidate enumeration

For each source note:

1. preserve its exact source identity and source MIDI;
2. derive its pitch class as MIDI modulo 12;
3. scan the fixed standard-guitar register `MIDI 40–84`;
4. retain only target MIDIs with the same pitch class;
5. enumerate all valid string/fret positions through the existing fretboard implementation;
6. independently verify every emitted position with `positionToMidi`;
7. emit the octave shift in semitones (`targetMidi - sourceMidi`), always an integer multiple of 12;
8. reject duplicate string/fret atoms or candidate-count overflow.

Maximum candidates per source note: `32`.

The output is deeply immutable and follows source-group/source-event order.

## Output shape

```text
RevoicingToneCandidateModel
├── documentType
├── contractVersion
├── policy
├── mode: evaluation-only
├── authority: none
├── source
├── registerEnvelope
├── groupCount
└── groups[]
    ├── sourceGroupId
    ├── onsetDivisions
    ├── sourceEventCount
    ├── sourceEventIds[]
    ├── toneCandidateCount
    └── sources[]
        ├── sourceEventId
        ├── sourceMidi
        ├── sourcePitchClass
        ├── candidateCount
        └── candidates[]
            ├── sourceEventId
            ├── sourceMidi
            ├── sourcePitchClass
            ├── targetMidi
            ├── octaveShiftSemitones
            ├── string
            └── fret
```

## Authority boundary

PA-11.4A must not:

- read teacher benchmark/approval/preference data;
- emit an accepted/preferred arrangement id;
- choose how many candidates of one source pitch class should sound;
- combine tone atoms into a complete guitar voicing;
- assign fingers or barres;
- declare physical playability of a complete chord;
- execute PA-4 `REVOICED` or `VOICE_REDISTRIBUTED` through PA-6;
- change production candidate ordering, canonical output, public API, or training authority;
- activate PA-12.

The next safe gate may compose these gold-blind atoms into bounded complete voicing candidates and replay them through PA-8/PA-9, still evaluation-only.
