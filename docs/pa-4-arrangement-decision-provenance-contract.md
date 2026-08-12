# PA-4 Arrangement Decision + Provenance Contract

## Status

- Gate: `PA-4`
- Contract: `GuitarArrangementPlan 1.0.0`
- Scope: internal deterministic arrangement-decision/provenance representation
- Input: validated `PolyphonicSourceModel 1.0.0`
- PA-3 dependency: `SimultaneousEventModel 1.0.0` is recomputed internally from the validated source model for group provenance
- Public package API: unchanged
- Guitar fingering authority: none
- Melody/bass/inner-voice classification authority: none
- `CanonicalTabResult 1.0.0`: unchanged

PA-4 defines how an already-chosen arrangement decision is represented and bound back to immutable source truth. It does not choose which decision should be made.

## Architectural position

```text
PolyphonicSourceModel 1.0.0
  ↓
PA-3 SimultaneousEventModel 1.0.0
  ↓
PA-4 GuitarArrangementPlan 1.0.0
  ↓
PA-5 deterministic melody/bass/voice analysis
  ↓
PA-6 deterministic reduction/octave rules
```

## Decision vocabulary

PA-4 accepts exactly these decision types:

- `PRESERVED`
- `OMITTED`
- `OCTAVE_DISPLACED`
- `VOICE_REDISTRIBUTED`
- `CHORD_REDUCED`
- `REVOICED`
- `ARPEGGIATED`

The first four are single-source-note decisions. `CHORD_REDUCED`, `REVOICED` and `ARPEGGIATED` are simultaneous-group decisions and must reference exactly one PA-3 source group.

PA-4 records the high-level decision and its provenance only. It does not yet define the target octave, target voice, surviving chord tones, revoiced pitches, arpeggio timing, guitar strings/frets/fingers or left-hand shape. Those executable transformation details belong to later gates.

## Builder boundary

```text
createGuitarArrangementPlan(sourceModel, decisions, runtime?)
```

The builder must:

1. revalidate the supplied `PolyphonicSourceModel` fail closed;
2. recompute PA-3 simultaneity internally from that validated source instead of trusting a caller-supplied group graph;
3. safely inspect the decision array and decision objects;
4. require every source note event to be covered exactly once;
5. reject rest-event references;
6. reject unknown, duplicate or overlapping source-event references;
7. require group decisions to reference the exact members of one deterministic PA-3 group;
8. require canonical source-order member ordering;
9. create deterministic decision IDs from source part + decision index;
10. return a deeply immutable plan;
11. preserve the current public monophonic path and package-root exports unchanged.

## Deterministic output

```text
GuitarArrangementPlan
├── documentType: "GuitarArrangementPlan"
├── contractVersion: "1.0.0"
├── source
│   ├── documentType: "PolyphonicSourceModel"
│   ├── contractVersion: "1.0.0"
│   └── partId
├── grouping
│   ├── documentType: "SimultaneousEventModel"
│   └── contractVersion: "1.0.0"
├── decisionCount
└── decisions[]
    ├── decisionId
    ├── decisionType
    ├── sourceEventIds[]
    └── sourceGroupId
```

For single-note decisions `sourceGroupId` is `null`. For simultaneous-group decisions it is the exact deterministic PA-3 group ID.

`decisionId` is deterministic:

```text
<partId>:arrangement-decision:<decisionIndex>
```

Decision order is canonical source order: each decision is ordered by the earliest source event it covers; sourceEventIds inside a decision are source-order sorted.

## Provenance and authority

Source provenance is carried only by deterministic source IDs and, for group decisions, the deterministic PA-3 group ID. The plan does not copy or mutate source pitch/rhythm facts.

PA-4 must not:

- choose arrangement decisions automatically;
- classify melody, bass or inner voices;
- decide deterministic reduction/octave policy;
- change source pitch/rhythm/onset/voice/staff;
- choose guitar string, fret, finger, barre or hand position;
- expose a public polyphonic conversion API;
- modify `CanonicalMusicDocument` or `CanonicalTabResult 1.0.0`;
- weaken monophonic fail-closed behavior;
- invoke learned/shadow ranking;
- authorize PA-5 or later gates.

## Safety and processing

The builder reuses the existing `ProcessingRuntime 1.0.0` when supplied and adds bounded validation checkpoints for arrangement decisions and provenance resolution. It introduces no second processing-budget system.

Caller-owned source and decision inputs are not mutated. Returned arrays and objects are deeply frozen.

## Acceptance boundary

PA-4 is complete only when evidence shows:

1. all seven decision-type constants are fixed and unknown values fail closed;
2. every source note is covered exactly once;
3. rests cannot be arrangement-decision subjects;
4. single-note decisions accept exactly one source note and no group ID;
5. chord/group decisions require exact membership of one PA-3 simultaneous group and its exact group ID;
6. duplicate, overlapping, missing and unknown source IDs fail closed;
7. non-canonical member/decision ordering fails closed;
8. decision arrays/objects with hostile proxy/accessor/unknown-field shapes fail closed;
9. deadline/cancellation checkpoints remain enforced;
10. output is deeply immutable and contains no guitar fingering or executable transformation fields;
11. public package exports and monophonic conversion behavior remain unchanged;
12. full repository regression and required GitHub CI pass.

PA-4 completion does not authorize PA-5.