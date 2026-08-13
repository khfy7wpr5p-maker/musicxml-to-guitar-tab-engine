# PA-7 Guitar Chord / Voicing Candidate Contract

## Status

- Gate: `PA-7`
- Scope: internal guitar chord/voicing candidate generation only
- Public API change: none
- `CanonicalTabResult 1.0.0` change: none
- PA-8 left-hand shape/finger/barre authority: not included
- PA-9 full physical playability authority: not included

PA-7 consumes the already-approved internal polyphonic pipeline through PA-6 and deterministically enumerates basic six-string guitar position assignments for simultaneous notes that remain active after reduction.

## Upstream authority

PA-7 must recompute and validate upstream facts from the same trusted inputs rather than accepting an unvalidated PA-6 output blob as authority:

```text
PolyphonicSourceModel 1.0.0
        ↓
GuitarArrangementPlan 1.0.0
        ↓
DeterministicVoiceAnalysis 1.0.0
        ↓
DeterministicReductionPlan 1.0.0
        ↓
SimultaneousEventModel 1.0.0
        ↓
PA-7 GuitarVoicingCandidateModel 1.0.0
```

The original MusicXML/source model remains immutable source truth.

## Contract identity

- document type: `GuitarVoicingCandidateModel`
- contract version: `1.0.0`
- policy: `STANDARD_SIX_STRING_DISTINCT_STRING_1.0`
- configuration: standard six-string tuning, frets 0–20
- maximum simultaneous active notes considered for a voicing: 6
- mathematical per-group candidate upper bound: `6! = 720`
- fixed aggregate model candidate ceiling: 10,000 candidates

## Candidate semantics

For each PA-3 simultaneous source group:

1. Join every source member to the internally recomputed PA-6 instruction by `sourceEventId`.
2. Preserve exact PA-3 source-event order.
3. `OMIT` members remain provenance only and are not assigned to guitar strings.
4. `KEEP` members use PA-6 `targetMidi` exactly. PA-7 may not alter pitch, octave, timing, voice, decision type, or source identity.
5. Groups with fewer than two active `KEEP` members do not create chord/voicing groups in PA-7.
6. Groups with more than six active notes produce zero voicing candidates rather than inventing doubled strings or silently dropping notes.
7. For 2–6 active notes, enumerate every assignment in which:
   - each active note maps to a valid position returned by the existing standard fretboard candidate logic;
   - each source event appears exactly once;
   - no two simultaneous active notes use the same guitar string;
   - fret is within 0–20;
   - the position converts back to the exact PA-6 `targetMidi`.
8. Candidate ordering is deterministic: source members remain in source order and position alternatives are traversed in existing fretboard order.
9. Candidate IDs are deterministic within the group.

PA-7 candidates are alternatives only. Candidate order is not a preference ranking.

## Non-authority boundary

PA-7 does **not** decide:

- left-hand finger numbers;
- hand position;
- fret-span comfort;
- barre or partial-barre shape;
- finger collisions;
- ergonomic difficulty;
- pedagogical preference;
- final chord voicing selection;
- arrangement optimization;
- public polyphonic output.

A PA-7 candidate proves only that every retained pitch can be placed on a distinct valid standard-guitar string/fret position under the fixed 0–20 fret configuration. It is **not** full physical-playability approval. PA-8 and PA-9 remain separately gated.

## Output shape

```text
GuitarVoicingCandidateModel
├── documentType = "GuitarVoicingCandidateModel"
├── contractVersion = "1.0.0"
├── policy = "STANDARD_SIX_STRING_DISTINCT_STRING_1.0"
├── source
│   ├── documentType = "PolyphonicSourceModel"
│   ├── contractVersion = "1.0.0"
│   └── partId
├── reduction
│   ├── documentType = "DeterministicReductionPlan"
│   ├── contractVersion = "1.0.0"
│   └── policy
├── configuration
│   ├── contractVersion
│   ├── stringCount = 6
│   ├── minimumFret = 0
│   └── maximumFret = 20
├── groupCount
├── candidateCount
└── groups[]
    ├── sourceGroupId
    ├── onsetDivisions
    ├── sourceEventIds[]          # exact PA-3 membership
    ├── activeSourceEventIds[]    # PA-6 KEEP members
    ├── omittedSourceEventIds[]   # PA-6 OMIT members
    ├── targetMidis[]             # active-member order
    ├── candidateCount
    └── candidates[]
        ├── candidateId
        ├── positionCount
        └── positions[]
            ├── sourceEventId
            ├── targetMidi
            ├── string
            └── fret
```

All arrays and records returned by PA-7 are deeply immutable.

## Resource and failure behavior

PA-7 reuses the existing optional `ProcessingRuntime` for deadline/cancellation checkpoints. It does not introduce a second runtime or budget API.

The generator fails closed when:

- upstream source/arrangement/reduction validation fails;
- an upstream instruction cannot be joined to exact source provenance;
- a `KEEP` instruction does not contain an integer MIDI target;
- an enumerated position does not round-trip to the exact target MIDI;
- aggregate generated candidates would exceed 10,000;
- processing deadline or cancellation is reached.

A valid simultaneous group may contain zero candidates when no distinct-string assignment exists. Zero candidates are evidence of an unresolved/unplaceable voicing at PA-7, not permission to drop notes.

## Required evidence

PA-7 cannot be considered merge-ready without:

- red-first test evidence;
- exact deterministic candidate enumeration tests;
- unique-string enforcement;
- no-note-dropping tests for >6 active notes;
- zero-candidate behavior for string-collision cases;
- PA-6 target-MIDI preservation checks;
- deep immutability checks;
- aggregate candidate ceiling coverage;
- deadline/cancellation coverage;
- full repository regression;
- MusicXML Compatibility workflow evidence;
- package-root API compatibility evidence;
- independent code/test review.

Completion of PA-7 does not authorize PA-8.